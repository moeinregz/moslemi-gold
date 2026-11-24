import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { raw, one, many, count, insert, update, updateMany, remove, removeMany, like, now, UPLOAD_DIR } from "../db.js";
import { getSettings, setSettings, DEFAULTS, num } from "../settings.js";
import { priceProduct, tickerItems } from "../pricing.js";
import { withCategory, slugify, imageUrl } from "../catalog.js";
import { getOrder, changeStatus, STATUSES, PAID_STATUSES, OrderError, expireStale } from "../orders.js";
import { gateway, GATEWAYS } from "../payments/index.js";
import { siteUrl } from "../config.js";
import { hashPassword, verifyPassword, PERMISSIONS, ROLES, tooManyAttempts, recordFail, clearFails } from "../auth.js";
import { createSession, destroySession, currentAdmin, requireAdmin, killSessions, log } from "../sessions.js";
import * as basalam from "../channels/basalam.js";

const r = Router();
class HttpError extends Error {
  constructor(status, msg, extra) {
    super(msg);
    this.status = status;
    this.extra = extra;
  }
}
const wrap = (fn) => (req, res) =>
  Promise.resolve().then(() => fn(req, res)).catch((e) => {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, ...e.extra });
    if (e instanceof OrderError) return res.status(400).json({ error: e.message });
    if (e?.code === 11000) return res.status(400).json({ error: "این مقدار (نامک/نام کاربری) تکراری است." });
    console.error(e);
    res.status(500).json({ error: "خطای داخلی سرور" });
  });
const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const bool = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);
const NOCASE = { locale: "en", strength: 2 };

/**
 * ذخیره با قفل خوش‌بینانه: اگه کاربر دیگه‌ای هم‌زمان همین سند رو ذخیره کرده باشه، نسخه‌ها فرق می‌کنن
 * و به‌جای پاک کردن تغییرات اون، خطای ۴۰۹ برمی‌گرده. شرط نسخه داخل خود دستور نوشتن است (اتمیک).
 */
async function saveVersioned(t, id, version, label, set) {
  const filter = { t, id };
  if (version !== undefined) filter.version = Number(version);
  const res = await raw().updateOne(filter, { $set: set, $inc: { version: 1 } });
  if (res.matchedCount) return;
  const row = await one(t, { id }, { projection: { updated_by: 1 } });
  if (!row) throw new HttpError(404, `${label} پیدا نشد.`);
  throw new HttpError(409, `${label} همین الان توسط ${row.updated_by || "کاربر دیگری"} تغییر کرده. صفحه را تازه کنید تا آخرین نسخه را ببینید.`, { conflict: true });
}

// ======================= ورود =======================
r.post("/login", wrap(async (req, res) => {
  const username = str(req.body.username, 60);
  const key = `a:${req.ip}:${username.toLowerCase()}`;
  if (tooManyAttempts(key)) throw new HttpError(429, "تلاش‌های ناموفق زیاد بود؛ ۱۵ دقیقه دیگر امتحان کنید.");
  const u = await one("user", { username }, { collation: NOCASE });
  if (!u || !verifyPassword(req.body.password, u.password_hash)) {
    recordFail(key);
    throw new HttpError(400, "نام کاربری یا رمز عبور اشتباه است.");
  }
  if (!u.active) throw new HttpError(403, "حساب شما غیرفعال شده است.");
  clearFails(key);
  await createSession(req, res, "admin", u.id);
  await update("user", { id: u.id }, { $set: { last_login: now() } });
  req.admin = u;
  await log(req, "ورود به پنل");
  res.json({ ok: true });
}));

r.post("/logout", wrap(async (req, res) => {
  await destroySession(req, res, "admin");
  res.json({ ok: true });
}));

r.get("/me", wrap(async (req, res) => {
  const u = await currentAdmin(req);
  if (!u) return res.status(401).json({ error: "وارد نشده‌اید." });
  const { token, perms, ...me } = u;
  res.json({ me, roles: ROLES, permissions: PERMISSIONS, statuses: STATUSES, site_url: siteUrl() });
}));

r.put("/me/password", requireAdmin(), wrap(async (req, res) => {
  const u = await one("user", { id: req.admin.id });
  if (!verifyPassword(req.body.current_password, u.password_hash)) throw new HttpError(400, "رمز فعلی اشتباه است.");
  if (str(req.body.new_password).length < 8) throw new HttpError(400, "رمز جدید حداقل ۸ کاراکتر باشد.");
  await update("user", { id: u.id }, { $set: { password_hash: hashPassword(req.body.new_password) } });
  await killSessions("admin", u.id, req.admin.token);
  await log(req, "تغییر رمز خود");
  res.json({ ok: true });
}));

// ======================= داشبورد =======================
r.get("/dashboard", requireAdmin("dashboard"), wrap(async (req, res) => {
  await expireStale();
  const today = new Date(Date.now() - 86400_000).toISOString();
  const month = new Date(Date.now() - 30 * 86400_000).toISOString();
  const fortnight = new Date(Date.now() - 14 * 86400_000).toISOString();
  const paid = await many("order", { status: { $in: PAID_STATUSES }, paid_at: { $gte: month } }, { projection: { total: 1, paid_at: 1 } });
  const sum = (list) => ({ c: list.length, s: list.reduce((a, o) => a + o.total, 0) });
  const perDay = new Map();
  for (const o of paid) {
    if (o.paid_at < fortnight) continue;
    const day = o.paid_at.slice(0, 10);
    const d = perDay.get(day) || { day, c: 0, s: 0 };
    d.c++;
    d.s += o.total;
    perDay.set(day, d);
  }
  const [toProcess, allProducts, lowStock, recent, top, sessions] = await Promise.all([
    count("order", { status: { $in: ["paid", "awaiting_confirmation", "processing"] } }),
    many("product", {}, { projection: { active: 1 } }),
    many("product", { active: 1, stock: { $lte: 1 } }, { projection: { id: 1, title: 1, stock: 1 }, sort: { stock: 1 }, limit: 10 }),
    many("order", {}, { projection: { code: 1, name: 1, total: 1, status: 1, created_at: 1 }, sort: { id: -1 }, limit: 8 }),
    many("product", { sold_count: { $gt: 0 } }, { projection: { id: 1, title: 1, sold_count: 1 }, sort: { sold_count: -1 }, limit: 5 }),
    many("session", { kind: "admin", last_seen: { $gte: new Date(Date.now() - 15 * 60_000).toISOString() } }, { projection: { subject_id: 1 } }),
  ]);
  const onlineUsers = sessions.length ? await many("user", { id: { $in: [...new Set(sessions.map((x) => x.subject_id))] } }, { projection: { name: 1 } }) : [];
  const s = await getSettings();
  res.json({
    today: sum(paid.filter((o) => o.paid_at >= today)),
    month: sum(paid),
    to_process: toProcess,
    products: { c: allProducts.length, a: allProducts.reduce((a, p) => a + (p.active ? 1 : 0), 0) },
    low_stock: lowStock,
    recent: recent.map((o) => ({ ...o, status_title: STATUSES[o.status] })),
    top,
    days: [...perDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
    gold_rate: num(s.gold_rate_18),
    gold_rate_updated_at: s.gold_rate_updated_at,
    online: [...new Set(onlineUsers.map((u) => u.name))],
  });
}));

// ======================= نرخ طلا =======================
r.get("/gold", requireAdmin("gold_rate", "products"), wrap(async (req, res) => {
  const s = await getSettings();
  res.json({ gold_rate_18: s.gold_rate_18, vat_percent: s.vat_percent, ticker_extra: s.ticker_extra, gold_rate_updated_at: s.gold_rate_updated_at, ticker: tickerItems(s) });
}));
r.put("/gold", requireAdmin("gold_rate"), wrap(async (req, res) => {
  const rate = num(req.body.gold_rate_18);
  if (rate < 100000) throw new HttpError(400, "نرخ هر گرم طلا (تومان) را درست وارد کنید.");
  const before = (await getSettings()).gold_rate_18;
  await setSettings({ gold_rate_18: Math.round(rate), vat_percent: num(req.body.vat_percent, 10), ticker_extra: str(req.body.ticker_extra, 2000) });
  await log(req, "تغییر نرخ طلا", "settings", "gold_rate_18", `${before} → ${Math.round(rate)}`);
  res.json({ ok: true });
}));

// ======================= محصولات =======================
const adminProduct = async (id) => {
  const row = await one("product", { id });
  if (!row) return null;
  const [p] = await withCategory([row]);
  p.images = (await many("image", { product_id: id }, { sort: { sort: 1, id: 1 } })).map((i) => ({ id: i.id, filename: i.filename, url: imageUrl(i.filename) }));
  p.specs = JSON.parse(p.specs || "[]");
  p.pricing = priceProduct(p, await getSettings());
  delete p.category_slug;
  return p;
};

r.get("/products", requireAdmin("products"), wrap(async (req, res) => {
  const filter = {};
  if (req.query.q) filter.$or = [{ title: like(req.query.q) }, { sku: like(req.query.q) }];
  if (req.query.category) filter.category_id = Number(req.query.category);
  if (req.query.status === "active") filter.active = 1;
  if (req.query.status === "inactive") filter.active = 0;
  if (req.query.status === "out") filter.stock = { $lte: 0 };
  const rows = await withCategory(await many("product", filter, { sort: { id: -1 } }));
  const imgs = await many("image", { product_id: { $in: rows.map((p) => p.id) } }, { sort: { sort: 1, id: 1 } });
  const first = new Map();
  for (const i of imgs) if (!first.has(i.product_id)) first.set(i.product_id, i.filename);
  const s = await getSettings();
  res.json(rows.map((p) => {
    const { category_slug, ...rest } = p;
    return { ...rest, specs: undefined, description: undefined, image: first.has(p.id) ? imageUrl(first.get(p.id)) : null, price: priceProduct(p, s).price };
  }));
}));

r.get("/products/:id", requireAdmin("products"), wrap(async (req, res) => {
  const p = await adminProduct(Number(req.params.id));
  if (!p) return res.status(404).json({ error: "محصول پیدا نشد." });
  res.json(p);
}));

function productFields(b) {
  const mode = b.pricing_mode === "fixed" ? "fixed" : "gold";
  const f = {
    title: str(b.title, 150),
    slug: slugify(b.slug || b.title),
    sku: str(b.sku, 40),
    category_id: Number(b.category_id) || null,
    short_desc: str(b.short_desc, 300),
    description: str(b.description, 8000),
    pricing_mode: mode,
    karat: [14, 17, 18, 21, 22, 24].includes(Number(b.karat)) ? Number(b.karat) : 18,
    weight: Math.max(0, num(b.weight)),
    labor_percent: Math.max(0, num(b.labor_percent)),
    profit_percent: Math.max(0, num(b.profit_percent)),
    stone_price: Math.max(0, Math.round(num(b.stone_price))),
    fixed_price: Math.max(0, Math.round(num(b.fixed_price))),
    discount_percent: Math.min(100, Math.max(0, num(b.discount_percent))),
    stock: Math.max(0, Math.floor(num(b.stock))),
    guarantee: str(b.guarantee, 200),
    specs: JSON.stringify((Array.isArray(b.specs) ? b.specs : []).filter((x) => x && str(x.k)).slice(0, 30).map((x) => ({ k: str(x.k, 60), v: str(x.v, 200) }))),
    active: bool(b.active),
    featured: bool(b.featured),
  };
  if (f.title.length < 2) throw new HttpError(400, "عنوان محصول را وارد کنید.");
  if (mode === "gold" && f.weight <= 0) throw new HttpError(400, "وزن طلا (گرم) را وارد کنید.");
  if (mode === "fixed" && f.fixed_price <= 0) throw new HttpError(400, "قیمت ثابت را وارد کنید.");
  return f;
}

r.post("/products", requireAdmin("products"), wrap(async (req, res) => {
  const f = productFields(req.body);
  if (await one("product", { slug: f.slug }, { projection: { id: 1 } })) f.slug = `${f.slug}-${crypto.randomInt(100, 999)}`;
  const t = now();
  const who = req.admin.name;
  const id = await insert("product", {
    ...f, sold_count: 0, version: 1, basalam_id: null, basalam_photo: null, basalam_synced_at: null, basalam_error: null,
    created_by: who, updated_by: who, created_at: t, updated_at: t,
  });
  await log(req, "افزودن محصول", "product", id, f.title);
  res.json(await adminProduct(id));
}));

r.put("/products/:id", requireAdmin("products"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const f = productFields(req.body);
  if (!(await one("product", { id }, { projection: { id: 1 } }))) throw new HttpError(404, "این محصول پیدا نشد.");
  if (await one("product", { slug: f.slug, id: { $ne: id } }, { projection: { id: 1 } })) throw new HttpError(400, "این نامک (آدرس) برای محصول دیگری استفاده شده.");
  await saveVersioned("product", id, req.body.version, "این محصول", { ...f, updated_by: req.admin.name, updated_at: now() });
  await log(req, "ویرایش محصول", "product", id, f.title);
  res.json(await adminProduct(id));
}));

/** ویرایش سریع از لیست: موجودی، فعال بودن، ویژه بودن، تخفیف */
r.patch("/products/:id", requireAdmin("products"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const set = {};
  if ("stock" in req.body) set.stock = Math.max(0, Math.floor(num(req.body.stock)));
  if ("active" in req.body) set.active = bool(req.body.active);
  if ("featured" in req.body) set.featured = bool(req.body.featured);
  if ("discount_percent" in req.body) set.discount_percent = Math.min(100, Math.max(0, num(req.body.discount_percent)));
  if (!Object.keys(set).length) throw new HttpError(400, "چیزی برای تغییر نیست.");
  await saveVersioned("product", id, req.body.version, "این محصول", { ...set, updated_by: req.admin.name, updated_at: now() });
  await log(req, "ویرایش سریع محصول", "product", id, req.body);
  res.json(await adminProduct(id));
}));

r.delete("/products/:id", requireAdmin("products"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const p = await one("product", { id }, { projection: { title: 1 } });
  if (!p) throw new HttpError(404, "محصول پیدا نشد.");
  const files = await many("image", { product_id: id });
  await remove("product", { id });
  await removeMany("image", { product_id: id });
  // سفارش‌های قبلی می‌مونن؛ فقط ارجاع به محصول حذف‌شده خالی می‌شه
  await raw().updateMany({ t: "order", "items.product_id": id }, { $set: { "items.$[i].product_id": null } }, { arrayFilters: [{ "i.product_id": id }] });
  for (const f of files) fs.rm(path.join(UPLOAD_DIR, f.filename), { force: true }, () => {});
  await log(req, "حذف محصول", "product", id, p.title);
  res.json({ ok: true });
}));

// ---------- عکس محصول ----------
const MIME_EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}${MIME_EXT[file.mimetype] || ".bin"}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype in MIME_EXT),
});
/** بررسی امضای واقعی فایل (فقط به پسوند اعتماد نمی‌کنیم) */
function isRealImage(file) {
  const b = Buffer.alloc(12);
  const fd = fs.openSync(file, "r");
  fs.readSync(fd, b, 0, 12, 0);
  fs.closeSync(fd);
  return (
    (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") ||
    b.subarray(0, 4).toString() === "GIF8"
  );
}

r.post("/products/:id/images", requireAdmin("products"), (req, res, next) =>
  upload.array("images", 12)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "حجم هر عکس حداکثر ۸ مگابایت است." : "آپلود ناموفق بود: " + err.message });
    next();
  }),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const files = req.files || [];
    const drop = () => files.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    if (!(await one("product", { id }, { projection: { id: 1 } }))) {
      drop();
      throw new HttpError(404, "محصول پیدا نشد.");
    }
    if (!files.length) throw new HttpError(400, "فقط عکس JPG، PNG، WEBP یا GIF قابل آپلود است.");
    const bad = files.filter((f) => !isRealImage(f.path));
    bad.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    const good = files.filter((f) => !bad.includes(f));
    const last = await many("image", { product_id: id }, { sort: { sort: -1 }, limit: 1, projection: { sort: 1 } });
    let sort = last.length ? last[0].sort : -1;
    for (const f of good) await insert("image", { product_id: id, filename: f.filename, sort: ++sort, created_at: now() });
    await update("product", { id }, { $set: { updated_at: now(), updated_by: req.admin.name } });
    await log(req, "آپلود عکس محصول", "product", id, `${good.length} عکس`);
    const p = await adminProduct(id);
    res.json({ images: p.images, warning: bad.length ? `${bad.length} فایل عکس معتبر نبود و رد شد.` : "" });
  }));

r.delete("/images/:imageId", requireAdmin("products"), wrap(async (req, res) => {
  const img = await one("image", { id: Number(req.params.imageId) });
  if (!img) throw new HttpError(404, "عکس پیدا نشد.");
  await remove("image", { id: img.id });
  fs.rm(path.join(UPLOAD_DIR, img.filename), { force: true }, () => {});
  await log(req, "حذف عکس محصول", "product", img.product_id);
  res.json({ images: (await adminProduct(img.product_id)).images });
}));

r.put("/products/:id/images/order", requireAdmin("products"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const ids = (req.body.ids || []).map(Number);
  for (const [i, imgId] of ids.entries()) await update("image", { id: imgId, product_id: id }, { $set: { sort: i } });
  res.json({ images: (await adminProduct(id)).images });
}));

// ======================= دسته‌بندی =======================
r.get("/categories", requireAdmin("categories", "products"), wrap(async (req, res) => {
  const [cats, prods] = await Promise.all([many("category", {}, { sort: { sort: 1, id: 1 } }), many("product", {}, { projection: { category_id: 1 } })]);
  const n = new Map();
  for (const p of prods) n.set(p.category_id, (n.get(p.category_id) || 0) + 1);
  res.json(cats.map((c) => ({ ...c, product_count: n.get(c.id) || 0 })));
}));
function catFields(b) {
  const f = { name: str(b.name, 60), slug: slugify(b.slug || b.name), description: str(b.description, 200), icon: str(b.icon, 20) || "ring", sort: Math.floor(num(b.sort)), active: bool(b.active ?? 1) };
  if (f.name.length < 2) throw new HttpError(400, "نام دسته را وارد کنید.");
  return f;
}
r.post("/categories", requireAdmin("categories"), wrap(async (req, res) => {
  const f = catFields(req.body);
  const id = await insert("category", f);
  await log(req, "افزودن دسته", "category", id, f.name);
  res.json({ id });
}));
r.put("/categories/:id", requireAdmin("categories"), wrap(async (req, res) => {
  const f = catFields(req.body);
  await update("category", { id: Number(req.params.id) }, { $set: f });
  await log(req, "ویرایش دسته", "category", req.params.id, f.name);
  res.json({ ok: true });
}));
r.delete("/categories/:id", requireAdmin("categories"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const c = await one("category", { id }, { projection: { name: 1 } });
  if (!c) throw new HttpError(404, "دسته پیدا نشد.");
  await remove("category", { id });
  await updateMany("product", { category_id: id }, { $set: { category_id: null } }); // محصول‌ها بدون دسته می‌مونن
  await log(req, "حذف دسته", "category", req.params.id, c.name);
  res.json({ ok: true });
}));

// ======================= سفارش‌ها =======================
r.get("/orders", requireAdmin("orders"), wrap(async (req, res) => {
  await expireStale();
  const filter = {};
  if (req.query.status === "open") filter.status = { $in: ["paid", "awaiting_confirmation", "processing", "ready_pickup"] };
  else if (req.query.status) filter.status = String(req.query.status);
  if (req.query.q) filter.$or = [{ code: like(req.query.q) }, { name: like(req.query.q) }, { phone: like(req.query.q) }];
  const page = Math.max(1, Number(req.query.page) || 1);
  const [total, rows] = await Promise.all([
    count("order", filter),
    many("order", filter, {
      projection: { id: 1, code: 1, name: 1, phone: 1, city: 1, total: 1, status: 1, payment_method: 1, delivery: 1, created_at: 1, paid_at: 1, "items.qty": 1 },
      sort: { id: -1 }, skip: (page - 1) * 30, limit: 30,
    }),
  ]);
  res.json({
    total, page, pages: Math.max(1, Math.ceil(total / 30)),
    rows: rows.map(({ items, ...o }) => ({ ...o, items: (items || []).reduce((a, i) => a + i.qty, 0), status_title: STATUSES[o.status] })),
  });
}));

r.get("/orders/:code", requireAdmin("orders"), wrap(async (req, res) => {
  const o = await getOrder(req.params.code);
  if (!o) return res.status(404).json({ error: "سفارش پیدا نشد." });
  o.items = o.items.map((i) => ({ ...i, breakdown: JSON.parse(i.breakdown || "{}") }));
  o.history = await many("log", { entity: "order", entity_id: o.code }, { projection: { username: 1, action: 1, details: 1, created_at: 1 }, sort: { id: -1 } });
  res.json(o);
}));

r.put("/orders/:code", requireAdmin("orders"), wrap(async (req, res) => {
  const o = await getOrder(req.params.code);
  if (!o) throw new HttpError(404, "سفارش پیدا نشد.");
  const next = req.body.status || o.status;
  const set = {
    status: next,
    tracking_code: str(req.body.tracking_code ?? o.tracking_code, 60),
    admin_note: str(req.body.admin_note ?? o.admin_note, 2000),
    updated_at: now(),
  };
  if (!o.paid_at && PAID_STATUSES.includes(next)) set.paid_at = now();
  await saveVersioned("order", o.id, req.body.version, "این سفارش", set);
  if (next !== o.status) {
    try {
      await changeStatus(o, next);
    } catch (e) {
      // موجودی کافی نبود: تغییر سفارش برگردانده می‌شه
      await raw().updateOne({ t: "order", id: o.id }, { $set: { status: o.status, tracking_code: o.tracking_code, admin_note: o.admin_note, paid_at: o.paid_at ?? null, updated_at: now() }, $inc: { version: 1 } });
      throw e;
    }
  }
  const changes = [];
  if (next !== o.status) changes.push(`وضعیت: ${STATUSES[o.status]} → ${STATUSES[next]}`);
  if ((req.body.tracking_code ?? o.tracking_code) !== o.tracking_code) changes.push(`کد رهگیری: ${req.body.tracking_code}`);
  if ((req.body.admin_note ?? o.admin_note) !== o.admin_note) changes.push("یادداشت تغییر کرد");
  if (changes.length) await log(req, "ویرایش سفارش", "order", o.code, changes.join("، "));
  res.json({ ok: true });
}));

// ======================= مشتری‌ها =======================
r.get("/customers", requireAdmin("customers"), wrap(async (req, res) => {
  const filter = req.query.q ? { $or: [{ phone: like(req.query.q) }, { name: like(req.query.q) }] } : {};
  const list = await many("customer", filter, { projection: { id: 1, phone: 1, name: 1, city: 1, created_at: 1 }, sort: { id: -1 }, limit: 200 });
  const orders = list.length ? await many("order", { customer_id: { $in: list.map((c) => c.id) }, status: { $in: PAID_STATUSES } }, { projection: { customer_id: 1, total: 1 } }) : [];
  const agg = new Map();
  for (const o of orders) {
    const a = agg.get(o.customer_id) || { orders: 0, spent: 0 };
    a.orders++;
    a.spent += o.total;
    agg.set(o.customer_id, a);
  }
  res.json(list.map((c) => ({ ...c, orders: agg.get(c.id)?.orders || 0, spent: agg.get(c.id)?.spent || 0 })));
}));

// ======================= تنظیمات =======================
const GOLD_KEYS = ["gold_rate_18", "vat_percent", "ticker_extra", "gold_rate_updated_at"];
const CHANNEL_KEYS = Object.keys(DEFAULTS).filter((k) => /^(torob|emalls|google_feed|basalam)_/.test(k));
const STORE_KEYS = Object.keys(DEFAULTS).filter((k) => !GOLD_KEYS.includes(k) && !CHANNEL_KEYS.includes(k));
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

r.get("/settings", requireAdmin("settings"), wrap(async (req, res) => {
  res.json({ values: pick(await getSettings(), STORE_KEYS), gateways: GATEWAYS.map((g) => ({ id: g.id, title: g.title, callback: `${siteUrl()}/api/payment/callback/${g.id}` })) });
}));
r.put("/settings", requireAdmin("settings"), wrap(async (req, res) => {
  const vals = pick(req.body, STORE_KEYS);
  await setSettings(vals);
  await log(req, "تغییر تنظیمات", "settings", "", Object.keys(vals).filter((k) => !k.endsWith("merchant")).join("، "));
  res.json({ ok: true });
}));
r.post("/settings/test/:gateway", requireAdmin("settings"), wrap(async (req, res) => {
  const g = gateway(req.params.gateway);
  if (!g?.test) throw new HttpError(400, "این درگاه تست اتصال ندارد.");
  res.json(await g.test({ ...(await getSettings()), ...pick(req.body, STORE_KEYS) }, `${siteUrl()}/api/payment/callback/${g.id}`));
}));

// ======================= کانال‌های فروش =======================
r.get("/channels", requireAdmin("channels"), wrap(async (req, res) => {
  const base = siteUrl();
  const s = await getSettings();
  const prods = await many("product", {}, { projection: { id: 1, title: 1, basalam_id: 1, basalam_error: 1, basalam_synced_at: 1 } });
  const withErr = prods.filter((p) => p.basalam_error != null);
  res.json({
    values: pick(s, CHANNEL_KEYS),
    feeds: {
      torob: `${base}/torob/products${s.torob_token ? `?token=${s.torob_token}` : ""}`,
      emalls: `${base}/emalls/products${s.emalls_token ? `?token=${s.emalls_token}` : ""}`,
      xml: `${base}/feeds/products.xml`,
      csv: `${base}/feeds/products.csv`,
      sitemap: `${base}/sitemap.xml`,
    },
    basalam: {
      ready: await basalam.basalamReady(),
      total: prods.length,
      synced: prods.filter((p) => p.basalam_id != null).length,
      errors: withErr.length,
      last: prods.reduce((m, p) => (p.basalam_synced_at && p.basalam_synced_at > (m || "") ? p.basalam_synced_at : m), null),
    },
    errors: withErr.slice(0, 20).map((p) => ({ id: p.id, title: p.title, basalam_error: p.basalam_error })),
  });
}));
r.put("/channels", requireAdmin("channels"), wrap(async (req, res) => {
  await setSettings(pick(req.body, CHANNEL_KEYS));
  await log(req, "تغییر تنظیمات کانال‌های فروش", "settings");
  res.json({ ok: true });
}));
r.post("/channels/token/:which", requireAdmin("channels"), wrap(async (req, res) => {
  const key = req.params.which === "emalls" ? "emalls_token" : "torob_token";
  const token = crypto.randomBytes(16).toString("hex");
  await setSettings({ [key]: token });
  await log(req, "ساخت توکن فید", "settings", key);
  res.json({ token });
}));
r.post("/channels/basalam/test", requireAdmin("channels"), wrap(async (req, res) => {
  const w = await basalam.whoAmI();
  if (w.ok && w.vendorId && !(await getSettings()).basalam_vendor_id) await setSettings({ basalam_vendor_id: w.vendorId });
  res.json(w);
}));
r.get("/channels/basalam/categories", requireAdmin("channels"), wrap(async (req, res) => res.json(await basalam.categories(req.query.q))));
r.post("/channels/basalam/sync/:id", requireAdmin("channels", "products"), wrap(async (req, res) => {
  const out = await basalam.pushProduct(Number(req.params.id));
  await log(req, "ارسال محصول به باسلام", "product", req.params.id, out.message);
  res.json(out);
}));
r.post("/channels/basalam/sync-all", requireAdmin("channels"), wrap(async (req, res) => {
  const out = await basalam.pushAll();
  await log(req, "همگام‌سازی همه‌ی محصولات با باسلام", "settings", "", `${out.ok} موفق، ${out.fail} ناموفق`);
  res.json(out);
}));

// ======================= کاربران پنل =======================
r.get("/users", requireAdmin("users"), wrap(async (req, res) => {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const [users, sessions] = await Promise.all([
    many("user", {}, { projection: { id: 1, username: 1, name: 1, role: 1, perms: 1, active: 1, created_at: 1, last_login: 1 }, sort: { id: 1 } }),
    many("session", { kind: "admin" }, { projection: { subject_id: 1, expires_at: 1, last_seen: 1 } }),
  ]);
  const t = now();
  res.json(users.map((u) => {
    const mine = sessions.filter((x) => x.subject_id === u.id);
    const lastSeen = mine.reduce((m, x) => (x.last_seen > (m || "") ? x.last_seen : m), null);
    return { ...u, perms: JSON.parse(u.perms || "[]"), sessions: mine.filter((x) => x.expires_at > t).length, last_seen: lastSeen, online: !!lastSeen && lastSeen >= since };
  }));
}));

function userFields(b, isNew) {
  const f = {
    name: str(b.name, 60),
    role: b.role in ROLES ? b.role : "support",
    perms: JSON.stringify((Array.isArray(b.perms) ? b.perms : []).filter((p) => p in PERMISSIONS)),
    active: bool(b.active ?? 1),
  };
  if (isNew) {
    f.username = str(b.username, 40).toLowerCase();
    if (!/^[a-z0-9_.-]{3,40}$/.test(f.username)) throw new HttpError(400, "نام کاربری: حداقل ۳ حرف انگلیسی، عدد، نقطه یا خط تیره.");
  }
  if (f.name.length < 2) throw new HttpError(400, "نام کاربر را وارد کنید.");
  if (f.role === "custom" && f.perms === "[]") throw new HttpError(400, "برای نقش سفارشی حداقل یک دسترسی انتخاب کنید.");
  return f;
}
const ownersLeft = (exceptId) => count("user", { role: "owner", active: 1, id: { $ne: exceptId } });

r.post("/users", requireAdmin("users"), wrap(async (req, res) => {
  const f = userFields(req.body, true);
  if (str(req.body.password).length < 8) throw new HttpError(400, "رمز عبور حداقل ۸ کاراکتر باشد.");
  if (f.role === "owner" && req.admin.role !== "owner") throw new HttpError(403, "فقط مدیر کل می‌تواند مدیر کل جدید بسازد.");
  const id = await insert("user", { ...f, password_hash: hashPassword(req.body.password), created_at: now(), last_login: null });
  await log(req, "افزودن کاربر پنل", "user", id, `${f.username} (${ROLES[f.role].title})`);
  res.json({ id });
}));

r.put("/users/:id", requireAdmin("users"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const u = await one("user", { id });
  if (!u) throw new HttpError(404, "کاربر پیدا نشد.");
  const f = userFields(req.body, false);
  if ((u.role === "owner" || f.role === "owner") && req.admin.role !== "owner") throw new HttpError(403, "فقط مدیر کل می‌تواند مدیر کل را تغییر دهد.");
  if (u.role === "owner" && (f.role !== "owner" || !f.active) && (await ownersLeft(id)) === 0) throw new HttpError(400, "حداقل یک مدیر کل فعال باید باقی بماند.");
  if (id === req.admin.id && !f.active) throw new HttpError(400, "نمی‌توانید حساب خودتان را غیرفعال کنید.");
  const set = { name: f.name, role: f.role, perms: f.perms, active: f.active };
  if (req.body.password) {
    if (str(req.body.password).length < 8) throw new HttpError(400, "رمز عبور حداقل ۸ کاراکتر باشد.");
    set.password_hash = hashPassword(req.body.password);
  }
  await update("user", { id }, { $set: set });
  if (!f.active || req.body.password) await killSessions("admin", id, id === req.admin.id ? req.admin.token : "");
  await log(req, "ویرایش کاربر پنل", "user", id, `${u.username}: ${ROLES[f.role].title}${f.active ? "" : "، غیرفعال"}${req.body.password ? "، تغییر رمز" : ""}`);
  res.json({ ok: true });
}));

r.post("/users/:id/logout", requireAdmin("users"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  await killSessions("admin", id, id === req.admin.id ? req.admin.token : "");
  await log(req, "خروج اجباری کاربر از همه‌ی دستگاه‌ها", "user", id);
  res.json({ ok: true });
}));

r.delete("/users/:id", requireAdmin("users"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const u = await one("user", { id });
  if (!u) throw new HttpError(404, "کاربر پیدا نشد.");
  if (id === req.admin.id) throw new HttpError(400, "نمی‌توانید حساب خودتان را حذف کنید.");
  if (u.role === "owner" && req.admin.role !== "owner") throw new HttpError(403, "فقط مدیر کل می‌تواند مدیر کل را حذف کند.");
  if (u.role === "owner" && (await ownersLeft(id)) === 0) throw new HttpError(400, "حداقل یک مدیر کل فعال باید باقی بماند.");
  await killSessions("admin", id, "");
  await remove("user", { id });
  await log(req, "حذف کاربر پنل", "user", id, u.username);
  res.json({ ok: true });
}));

// ======================= گزارش فعالیت =======================
r.get("/logs", requireAdmin("logs"), wrap(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const filter = req.query.user ? { user_id: Number(req.query.user) } : {};
  res.json(await many("log", filter, { sort: { id: -1 }, skip: (page - 1) * 50, limit: 50 }));
}));

export default r;
