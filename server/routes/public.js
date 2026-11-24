import { Router } from "express";
import { one, many, insert, update, updateMany, now } from "../db.js";
import { getSettings, SECRET_KEYS } from "../settings.js";
import { tickerItems } from "../pricing.js";
import { listPublic, getPublic } from "../catalog.js";
import { quote, createOrder, getOrder, markPaid, markFailed, markOffline, OrderError, normalizePhone, expireStale, STATUSES } from "../orders.js";
import { gateway, enabledMethods } from "../payments/index.js";
import { siteUrl } from "../config.js";
import { hashPassword, verifyPassword, tooManyAttempts, recordFail, clearFails } from "../auth.js";
import { createSession, destroySession, currentCustomer, killSessions } from "../sessions.js";

const r = Router();
const wrap = (fn) => (req, res) =>
  Promise.resolve().then(() => fn(req, res)).catch((e) => {
    if (e instanceof OrderError) return res.status(400).json({ error: e.message, issues: e.issues });
    if (e?.code === 11000) return res.status(400).json({ error: "این اطلاعات قبلاً ثبت شده است." });
    console.error(e);
    res.status(500).json({ error: "خطای داخلی سرور" });
  });

r.get("/site", wrap(async (req, res) => {
  const s = await getSettings();
  const pub = Object.fromEntries(Object.entries(s).filter(([k]) => !SECRET_KEYS.includes(k) && !k.startsWith("basalam_") && !k.endsWith("_merchant")));
  res.json({
    settings: pub,
    ticker: tickerItems(s),
    categories: await many("category", { active: 1 }, { projection: { id: 1, name: 1, slug: 1, description: 1, icon: 1 }, sort: { sort: 1, id: 1 } }),
    payment_methods: enabledMethods(s),
    customer: await currentCustomer(req),
  });
}));

r.get("/products", wrap(async (req, res) => {
  res.json(await listPublic({
    category: req.query.category || "",
    q: String(req.query.q || "").slice(0, 60),
    sort: req.query.sort,
    featured: req.query.featured === "1",
    limit: Math.min(100, Number(req.query.limit) || 60),
    offset: Math.max(0, Number(req.query.offset) || 0),
  }));
}));

r.get("/products/:slug", wrap(async (req, res) => {
  const p = await getPublic(req.params.slug);
  if (!p) return res.status(404).json({ error: "محصول پیدا نشد." });
  const related = (await listPublic({ category: p.category_slug, limit: 8 })).filter((x) => x.id !== p.id).slice(0, 4);
  res.json({ product: p, related });
}));

r.post("/quote", wrap(async (req, res) => res.json(await quote(req.body.items, req.body.delivery))));

async function startPayment(order, method) {
  const s = await getSettings();
  if (method === "offline") {
    if (s.offline_enabled !== "1") throw new OrderError("این روش پرداخت فعال نیست.");
    await markOffline(order.code);
    return { code: order.code, redirect: `/order/${order.code}?phone=${order.phone}` };
  }
  const g = gateway(method);
  if (!g || !g.enabled(s)) throw new OrderError("روش پرداخت انتخاب‌شده فعال نیست.");
  const cb = `${siteUrl()}/api/payment/callback/${g.id}?order=${order.code}`;
  const st = await g.start(order, s, cb);
  if (!st.ok) {
    await markFailed(order.code, st.error);
    throw new OrderError(st.error);
  }
  await update("order", { id: order.id }, { $set: { payment_method: g.id, payment_authority: st.authority, updated_at: now() } });
  return { code: order.code, redirect: st.url };
}

r.post("/checkout", wrap(async (req, res) => {
  const customer = await currentCustomer(req);
  const methods = enabledMethods(await getSettings()).map((m) => m.id);
  if (!methods.includes(req.body.payment_method)) throw new OrderError("یک روش پرداخت انتخاب کنید.");
  const order = await createOrder(req.body, customer);
  // اطلاعات ارسال رو برای خرید بعدی تو حساب ذخیره کن
  if (customer && req.body.save_address) {
    await update("customer", { id: customer.id }, { $set: { ...(order.name ? { name: order.name } : {}), province: order.province, city: order.city, address: order.address, postal_code: order.postal_code } });
  }
  res.json(await startPayment(order, req.body.payment_method));
}));

async function canSee(req, o) {
  const c = await currentCustomer(req);
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

r.get("/orders/:code", wrap(async (req, res) => {
  await expireStale();
  const o = await getOrder(req.params.code);
  if (!o || !(await canSee(req, o))) return res.status(404).json({ error: "سفارشی با این کد و شماره موبایل پیدا نشد." });
  res.json(publicOrder(o));
}));

/** پرداخت دوباره‌ی سفارشی که ناموفق شده (با قیمت جدید و موجودی فعلی سفارش تازه ساخته می‌شه) */
r.post("/orders/:code/retry", wrap(async (req, res) => {
  const o = await getOrder(req.params.code);
  if (!o || !(await canSee(req, o))) return res.status(404).json({ error: "سفارش پیدا نشد." });
  if (!["failed", "pending_payment"].includes(o.status)) throw new OrderError("این سفارش قابل پرداخت دوباره نیست.");
  if (o.status === "pending_payment") await markFailed(o.code, "پرداخت دوباره");
  const fresh = await createOrder({ ...o, items: o.items.filter((i) => i.product_id).map((i) => ({ product_id: i.product_id, qty: i.qty })), payment_method: req.body.payment_method }, await currentCustomer(req));
  res.json(await startPayment(fresh, req.body.payment_method));
}));

// بازگشت از درگاه
r.all("/payment/callback/:provider", wrap(async (req, res) => {
  const params = { ...req.query, ...(req.body || {}) };
  const code = String(params.order || "");
  const o = await getOrder(code);
  const back = (ok) => res.redirect(302, `/order/${encodeURIComponent(code)}?phone=${o?.phone || ""}&result=${ok ? "ok" : "fail"}`);
  if (!o) return res.redirect(302, "/");
  if (["paid", "processing", "shipped", "delivered", "ready_pickup"].includes(o.status)) return back(true);
  const g = gateway(req.params.provider);
  if (!g || o.payment_method !== g.id) return back(false);
  const v = await g.verify(o, params, await getSettings());
  if (v.ok) {
    await markPaid(code, v.ref, v.meta);
    return back(true);
  }
  await markFailed(code, v.error);
  back(false);
}));

// ---------------- حساب کاربری مشتری ----------------
r.post("/account/register", wrap(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const name = String(req.body.name || "").trim().slice(0, 80);
  const pw = String(req.body.password || "");
  if (!/^09\d{9}$/.test(phone)) throw new OrderError("شماره موبایل معتبر نیست.");
  if (pw.length < 6) throw new OrderError("رمز عبور حداقل ۶ کاراکتر باشد.");
  if (await one("customer", { phone }, { projection: { id: 1 } })) throw new OrderError("با این شماره قبلاً ثبت‌نام شده؛ وارد شوید.");
  const id = await insert("customer", { phone, name, password_hash: hashPassword(pw), province: "", city: "", address: "", postal_code: "", created_at: now() });
  // سفارش‌های مهمان قبلی با همین شماره به حساب وصل می‌شن
  await updateMany("order", { phone, customer_id: null }, { $set: { customer_id: id } });
  await createSession(req, res, "customer", id);
  res.json({ ok: true });
}));

r.post("/account/login", wrap(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const key = `c:${req.ip}:${phone}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: "تلاش‌های ناموفق زیاد بود؛ ۱۵ دقیقه دیگر امتحان کنید." });
  const c = await one("customer", { phone });
  if (!c || !verifyPassword(req.body.password, c.password_hash)) {
    recordFail(key);
    return res.status(400).json({ error: "شماره موبایل یا رمز عبور اشتباه است." });
  }
  clearFails(key);
  await createSession(req, res, "customer", c.id);
  res.json({ ok: true });
}));

r.post("/account/logout", wrap(async (req, res) => {
  await destroySession(req, res, "customer");
  res.json({ ok: true });
}));

r.get("/account/me", wrap(async (req, res) => {
  const c = await currentCustomer(req);
  if (!c) return res.status(401).json({ error: "وارد نشده‌اید." });
  const orders = await many("order", { customer_id: c.id }, { projection: { code: 1, status: 1, total: 1, created_at: 1 }, sort: { id: -1 }, limit: 50 });
  res.json({ customer: c, orders: orders.map((o) => ({ ...o, status_title: STATUSES[o.status] || o.status })) });
}));

r.put("/account/me", wrap(async (req, res) => {
  const c = await currentCustomer(req);
  if (!c) return res.status(401).json({ error: "وارد نشده‌اید." });
  const b = req.body;
  await update("customer", { id: c.id }, { $set: {
    name: String(b.name || "").slice(0, 80), province: String(b.province || "").slice(0, 40), city: String(b.city || "").slice(0, 40),
    address: String(b.address || "").slice(0, 400), postal_code: String(b.postal_code || "").replace(/\D/g, "").slice(0, 10),
  } });
  if (b.new_password) {
    const full = await one("customer", { id: c.id }, { projection: { password_hash: 1 } });
    if (!verifyPassword(b.current_password, full.password_hash)) throw new OrderError("رمز فعلی اشتباه است.");
    if (String(b.new_password).length < 6) throw new OrderError("رمز جدید حداقل ۶ کاراکتر باشد.");
    await update("customer", { id: c.id }, { $set: { password_hash: hashPassword(b.new_password) } });
    await killSessions("customer", c.id, req.headers.cookie?.match(/msl_user=([a-f0-9]+)/)?.[1]);
  }
  res.json({ ok: true });
}));

export default r;
