import { Router } from "express";
import { db, now } from "../db.js";
import { getSettings, SECRET_KEYS } from "../settings.js";
import { tickerItems } from "../pricing.js";
import { listPublic, getPublic } from "../catalog.js";
import { quote, createOrder, getOrder, markPaid, markFailed, markOffline, OrderError, normalizePhone, expireStale } from "../orders.js";
import { gateway, enabledMethods } from "../payments/index.js";
import { siteUrl } from "../config.js";
import { hashPassword, verifyPassword, tooManyAttempts, recordFail, clearFails } from "../auth.js";
import { createSession, destroySession, currentCustomer, killSessions } from "../sessions.js";

const r = Router();
const wrap = (fn) => (req, res) =>
  Promise.resolve().then(() => fn(req, res)).catch((e) => {
    if (e instanceof OrderError) return res.status(400).json({ error: e.message, issues: e.issues });
    console.error(e);
    res.status(500).json({ error: "خطای داخلی سرور" });
  });

r.get("/site", (req, res) => {
  const s = getSettings();
  const pub = Object.fromEntries(Object.entries(s).filter(([k]) => !SECRET_KEYS.includes(k) && !k.startsWith("basalam_") && !k.endsWith("_merchant")));
  res.json({
    settings: pub,
    ticker: tickerItems(s),
    categories: db().prepare("SELECT id,name,slug,description,icon FROM categories WHERE active=1 ORDER BY sort,id").all(),
    payment_methods: enabledMethods(s),
    customer: currentCustomer(req),
  });
});

r.get("/products", (req, res) => {
  res.json(listPublic({
    category: req.query.category || "",
    q: String(req.query.q || "").slice(0, 60),
    sort: req.query.sort,
    featured: req.query.featured === "1",
    limit: Math.min(100, Number(req.query.limit) || 60),
    offset: Math.max(0, Number(req.query.offset) || 0),
  }));
});

r.get("/products/:slug", (req, res) => {
  const p = getPublic(req.params.slug);
  if (!p) return res.status(404).json({ error: "محصول پیدا نشد." });
  const related = listPublic({ category: p.category_slug, limit: 8 }).filter((x) => x.id !== p.id).slice(0, 4);
  res.json({ product: p, related });
});

r.post("/quote", wrap((req, res) => res.json(quote(req.body.items, req.body.delivery))));

async function startPayment(order, method) {
  const s = getSettings();
  if (method === "offline") {
    if (s.offline_enabled !== "1") throw new OrderError("این روش پرداخت فعال نیست.");
    markOffline(order.code);
    return { code: order.code, redirect: `/order/${order.code}?phone=${order.phone}` };
  }
  const g = gateway(method);
  if (!g || !g.enabled(s)) throw new OrderError("روش پرداخت انتخاب‌شده فعال نیست.");
  const cb = `${siteUrl()}/api/payment/callback/${g.id}?order=${order.code}`;
  const st = await g.start(order, s, cb);
  if (!st.ok) {
    markFailed(order.code, st.error);
    throw new OrderError(st.error);
  }
  db().prepare("UPDATE orders SET payment_method=?, payment_authority=?, updated_at=? WHERE id=?").run(g.id, st.authority, now(), order.id);
  return { code: order.code, redirect: st.url };
}

r.post("/checkout", wrap(async (req, res) => {
  const customer = currentCustomer(req);
  const methods = enabledMethods(getSettings()).map((m) => m.id);
  if (!methods.includes(req.body.payment_method)) throw new OrderError("یک روش پرداخت انتخاب کنید.");
  const order = createOrder(req.body, customer);
  // اطلاعات ارسال رو برای خرید بعدی تو حساب ذخیره کن
  if (customer && req.body.save_address) {
    db().prepare("UPDATE customers SET name=COALESCE(NULLIF(?,''),name), province=?, city=?, address=?, postal_code=? WHERE id=?")
      .run(order.name, order.province, order.city, order.address, order.postal_code, customer.id);
  }
  res.json(await startPayment(order, req.body.payment_method));
}));

function canSee(req, o) {
  const c = currentCustomer(req);
  if (c && o.customer_id === c.id) return true;
  return normalizePhone(req.query.phone || req.body?.phone) === o.phone;
}

function publicOrder(o) {
  const { payment_authority, payment_meta, admin_note, version, customer_id, ...rest } = o;
  let error = "";
  try {
    error = JSON.parse(payment_meta || "{}").error || "";
  } catch {}
  return { ...rest, payment_error: o.status === "failed" ? error : "", items: o.items.map((i) => ({ ...i, breakdown: JSON.parse(i.breakdown || "{}") })) };
}

r.get("/orders/:code", wrap((req, res) => {
  expireStale();
  const o = getOrder(req.params.code);
  if (!o || !canSee(req, o)) return res.status(404).json({ error: "سفارشی با این کد و شماره موبایل پیدا نشد." });
  res.json(publicOrder(o));
}));

/** پرداخت دوباره‌ی سفارشی که ناموفق شده (با قیمت جدید و موجودی فعلی سفارش تازه ساخته می‌شه) */
r.post("/orders/:code/retry", wrap(async (req, res) => {
  const o = getOrder(req.params.code);
  if (!o || !canSee(req, o)) return res.status(404).json({ error: "سفارش پیدا نشد." });
  if (!["failed", "pending_payment"].includes(o.status)) throw new OrderError("این سفارش قابل پرداخت دوباره نیست.");
  if (o.status === "pending_payment") markFailed(o.code, "پرداخت دوباره");
  const fresh = createOrder({ ...o, items: o.items.filter((i) => i.product_id).map((i) => ({ product_id: i.product_id, qty: i.qty })), payment_method: req.body.payment_method }, currentCustomer(req));
  res.json(await startPayment(fresh, req.body.payment_method));
}));

// بازگشت از درگاه
r.all("/payment/callback/:provider", wrap(async (req, res) => {
  const params = { ...req.query, ...(req.body || {}) };
  const code = String(params.order || "");
  const o = getOrder(code);
  const back = (ok) => res.redirect(302, `/order/${encodeURIComponent(code)}?phone=${o?.phone || ""}&result=${ok ? "ok" : "fail"}`);
  if (!o) return res.redirect(302, "/");
  if (["paid", "processing", "shipped", "delivered", "ready_pickup"].includes(o.status)) return back(true);
  const g = gateway(req.params.provider);
  if (!g || o.payment_method !== g.id) return back(false);
  const v = await g.verify(o, params, getSettings());
  if (v.ok) {
    markPaid(code, v.ref, v.meta);
    return back(true);
  }
  markFailed(code, v.error);
  back(false);
}));

// ---------------- حساب کاربری مشتری ----------------
r.post("/account/register", wrap((req, res) => {
  const phone = normalizePhone(req.body.phone);
  const name = String(req.body.name || "").trim().slice(0, 80);
  const pw = String(req.body.password || "");
  if (!/^09\d{9}$/.test(phone)) throw new OrderError("شماره موبایل معتبر نیست.");
  if (pw.length < 6) throw new OrderError("رمز عبور حداقل ۶ کاراکتر باشد.");
  if (db().prepare("SELECT 1 FROM customers WHERE phone=?").get(phone)) throw new OrderError("با این شماره قبلاً ثبت‌نام شده؛ وارد شوید.");
  const id = db().prepare("INSERT INTO customers (phone,name,password_hash,created_at) VALUES (?,?,?,?)").run(phone, name, hashPassword(pw), now()).lastInsertRowid;
  // سفارش‌های مهمان قبلی با همین شماره به حساب وصل می‌شن
  db().prepare("UPDATE orders SET customer_id=? WHERE phone=? AND customer_id IS NULL").run(id, phone);
  createSession(req, res, "customer", id);
  res.json({ ok: true });
}));

r.post("/account/login", wrap((req, res) => {
  const phone = normalizePhone(req.body.phone);
  const key = `c:${req.ip}:${phone}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "تلاش‌های ناموفق زیاد بود؛ ۱۵ دقیقه دیگر امتحان کنید." });
  const c = db().prepare("SELECT * FROM customers WHERE phone=?").get(phone);
  if (!c || !verifyPassword(req.body.password, c.password_hash)) {
    recordFail(key);
    return res.status(400).json({ error: "شماره موبایل یا رمز عبور اشتباه است." });
  }
  clearFails(key);
  createSession(req, res, "customer", c.id);
  res.json({ ok: true });
}));

r.post("/account/logout", (req, res) => {
  destroySession(req, res, "customer");
  res.json({ ok: true });
});

r.get("/account/me", (req, res) => {
  const c = currentCustomer(req);
  if (!c) return res.status(401).json({ error: "وارد نشده‌اید." });
  const orders = db().prepare("SELECT code,status,total,created_at FROM orders WHERE customer_id=? ORDER BY id DESC LIMIT 50").all(c.id);
  res.json({ customer: c, orders: orders.map((o) => ({ ...o, status_title: getOrder(o.code).status_title })) });
});

r.put("/account/me", wrap((req, res) => {
  const c = currentCustomer(req);
  if (!c) return res.status(401).json({ error: "وارد نشده‌اید." });
  const b = req.body;
  db().prepare("UPDATE customers SET name=?, province=?, city=?, address=?, postal_code=? WHERE id=?").run(
    String(b.name || "").slice(0, 80), String(b.province || "").slice(0, 40), String(b.city || "").slice(0, 40), String(b.address || "").slice(0, 400), String(b.postal_code || "").replace(/\D/g, "").slice(0, 10), c.id);
  if (b.new_password) {
    const full = db().prepare("SELECT password_hash FROM customers WHERE id=?").get(c.id);
    if (!verifyPassword(b.current_password, full.password_hash)) throw new OrderError("رمز فعلی اشتباه است.");
    if (String(b.new_password).length < 6) throw new OrderError("رمز جدید حداقل ۶ کاراکتر باشد.");
    db().prepare("UPDATE customers SET password_hash=? WHERE id=?").run(hashPassword(b.new_password), c.id);
    killSessions("customer", c.id, req.headers.cookie?.match(/msl_user=([a-f0-9]+)/)?.[1]);
  }
  res.json({ ok: true });
}));

export default r;
