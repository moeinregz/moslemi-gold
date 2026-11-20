import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, now, tx, UPLOAD_DIR } from "../db.js";
import { getSettings, setSettings, DEFAULTS, num } from "../settings.js";
import { priceProduct, tickerItems } from "../pricing.js";
import { getById, slugify, imageUrl } from "../catalog.js";
import { getOrder, changeStatus, STATUSES, OrderError, expireStale } from "../orders.js";
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
    if (String(e.message).includes("UNIQUE constraint failed")) return res.status(400).json({ error: "این مقدار (نامک/نام کاربری) تکراری است." });
    console.error(e);
    res.status(500).json({ error: "خطای داخلی سرور" });
  });
const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const bool = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);

// ======================= ورود =======================
r.post("/login", wrap((req, res) => {
  const username = str(req.body.username, 60);
  const key = `a:${req.ip}:${username.toLowerCase()}`;
  if (tooManyAttempts(key)) throw new HttpError(429, "تلاش‌های ناموفق زیاد بود؛ ۱۵ دقیقه دیگر امتحان کنید.");
  const u = db().prepare("SELECT * FROM users WHERE username=?").get(username);
  if (!u || !verifyPassword(req.body.password, u.password_hash)) {
    recordFail(key);
    throw new HttpError(400, "نام کاربری یا رمز عبور اشتباه است.");
  }
  if (!u.active) throw new HttpError(403, "حساب شما غیرفعال شده است.");
  clearFails(key);
  createSession(req, res, "admin", u.id);
  db().prepare("UPDATE users SET last_login=? WHERE id=?").run(now(), u.id);
  req.admin = u;
  log(req, "ورود به پنل");
  res.json({ ok: true });
}));

r.post("/logout", (req, res) => {
  destroySession(req, res, "admin");
  res.json({ ok: true });
});

r.get("/me", (req, res) => {
  const u = currentAdmin(req);
  if (!u) return res.status(401).json({ error: "وارد نشده‌اید." });
  const { token, perms, ...me } = u;
  res.json({ me, roles: ROLES, permissions: PERMISSIONS, statuses: STATUSES, site_url: siteUrl() });
});

r.put("/me/password", requireAdmin(), wrap((req, res) => {
  const u = db().prepare("SELECT * FROM users WHERE id=?").get(req.admin.id);
  if (!verifyPassword(req.body.current_password, u.password_hash)) throw new HttpError(400, "رمز فعلی اشتباه است.");
  if (str(req.body.new_password).length < 8) throw new HttpError(400, "رمز جدید حداقل ۸ کاراکتر باشد.");
  db().prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(req.body.new_password), u.id);
  killSessions("admin", u.id, req.admin.token);
  log(req, "تغییر رمز خود");
  res.json({ ok: true });
}));

// ======================= داشبورد =======================
r.get("/dashboard", requireAdmin("dashboard"), (req, res) => {
  expireStale();
  const d = db();
  const PAID = "('paid','processing','shipped','ready_pickup','delivered')";
  const today = new Date(Date.now() - 86400_000).toISOString();
  const month = new Date(Date.now() - 30 * 86400_000).toISOString();
  const sum = (since) => d.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM orders WHERE status IN ${PAID} AND paid_at >= ?`).get(since);
  const days = d.prepare(`SELECT substr(paid_at,1,10) day, COUNT(*) c, SUM(total) s FROM orders WHERE status IN ${PAID} AND paid_at >= ? GROUP BY day ORDER BY day`).all(new Date(Date.now() - 14 * 86400_000).toISOString());
  res.json({
    today: sum(today),
    month: sum(month),
    to_process: d.prepare("SELECT COUNT(*) c FROM orders WHERE status IN ('paid','awaiting_confirmation','processing')").get().c,
    products: d.prepare("SELECT COUNT(*) c, SUM(active) a FROM products").get(),
    low_stock: d.prepare("SELECT id,title,stock FROM products WHERE active=1 AND stock<=1 ORDER BY stock LIMIT 10").all(),
    recent: d.prepare("SELECT code,name,total,status,created_at FROM orders ORDER BY id DESC LIMIT 8").all().map((o) => ({ ...o, status_title: STATUSES[o.status] })),
    top: d.prepare("SELECT id,title,sold_count FROM products WHERE sold_count>0 ORDER BY sold_count DESC LIMIT 5").all(),
    days,
    gold_rate: num(getSettings().gold_rate_18),
    gold_rate_updated_at: getSettings().gold_rate_updated_at,
    online: d.prepare("SELECT DISTINCT u.name FROM sessions s JOIN users u ON u.id=s.subject_id WHERE s.kind='admin' AND s.last_seen >= ?").all(new Date(Date.now() - 15 * 60_000).toISOString()).map((x) => x.name),
  });
});

// ======================= نرخ طلا =======================
r.get("/gold", requireAdmin("gold_rate", "products"), (req, res) => {
  const s = getSettings();
  res.json({ gold_rate_18: s.gold_rate_18, vat_percent: s.vat_percent, ticker_extra: s.ticker_extra, gold_rate_updated_at: s.gold_rate_updated_at, ticker: tickerItems(s) });
});
r.put("/gold", requireAdmin("gold_rate"), wrap((req, res) => {
  const rate = num(req.body.gold_rate_18);
  if (rate < 100000) throw new HttpError(400, "نرخ هر گرم طلا (تومان) را درست وارد کنید.");
  const before = getSettings().gold_rate_18;
  setSettings({ gold_rate_18: Math.round(rate), vat_percent: num(req.body.vat_percent, 10), ticker_extra: str(req.body.ticker_extra, 2000) });
  log(req, "تغییر نرخ طلا", "settings", "gold_rate_18", `${before} → ${Math.round(rate)}`);
  res.json({ ok: true });
}));

// ======================= محصولات =======================
const adminProduct = (id) => {
  const p = db().prepare("SELECT p.*, c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?").get(id);
  if (!p) return null;
  p.images = db().prepare("SELECT id, filename FROM product_images WHERE product_id=? ORDER BY sort,id").all(id).map((i) => ({ ...i, url: imageUrl(i.filename) }));
  p.specs = JSON.parse(p.specs || "[]");
  p.pricing = priceProduct(p, getSettings());
  return p;
};

r.get("/products", requireAdmin("products"), (req, res) => {
  const where = [];
  const args = [];
  if (req.query.q) {
    where.push("(p.title LIKE ? OR p.sku LIKE ?)");
    args.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }
  if (req.query.category) {
    where.push("p.category_id=?");
    args.push(Number(req.query.category));
  }
  if (req.query.status === "active") where.push("p.active=1");
  if (req.query.status === "inactive") where.push("p.active=0");
  if (req.query.status === "out") where.push("p.stock<=0");
  const rows = db().prepare(`SELECT p.*, c.name category_name, (SELECT filename FROM product_images WHERE product_id=p.id ORDER BY sort,id LIMIT 1) image
    FROM products p LEFT JOIN categories c ON c.id=p.category_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.id DESC`).all(...args);
  const s = getSettings();
  res.json(rows.map((p) => ({ ...p, specs: undefined, description: undefined, image: p.image ? imageUrl(p.image) : null, price: priceProduct(p, s).price })));
});

r.get("/products/:id", requireAdmin("products"), (req, res) => {
  const p = adminProduct(Number(req.params.id));
  if (!p) return res.status(404).json({ error: "محصول پیدا نشد." });
  res.json(p);
});

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

r.post("/products", requireAdmin("products"), wrap((req, res) => {
  const f = productFields(req.body);
  if (db().prepare("SELECT 1 FROM products WHERE slug=?").get(f.slug)) f.slug = `${f.slug}-${crypto.randomInt(100, 999)}`;
  const t = now();
  const who = req.admin.name;
  const cols = Object.keys(f);
  const id = db().prepare(`INSERT INTO products (${cols.join(",")},created_by,updated_by,created_at,updated_at) VALUES (${cols.map(() => "?").join(",")},?,?,?,?)`)
    .run(...Object.values(f), who, who, t, t).lastInsertRowid;
  log(req, "افزودن محصول", "product", id, f.title);
  res.json(adminProduct(id));
}));

/**
 * ویرایش با قفل خوش‌بینانه: اگه کاربر دیگه‌ای هم‌زمان همین محصول رو ذخیره کرده باشه، نسخه‌ها فرق می‌کنن
 * و به‌جای پاک کردن تغییرات اون، خطای ۴۰۹ برمی‌گرده.
 */
function checkVersion(table, id, version, label) {
  const row = db().prepare(`SELECT version, ${table === "products" ? "updated_by" : "'' updated_by"} FROM ${table} WHERE id=?`).get(id);
  if (!row) throw new HttpError(404, `${label} پیدا نشد.`);
  if (version !== undefined && Number(version) !== row.version)
    throw new HttpError(409, `${label} همین الان توسط ${row.updated_by || "کاربر دیگری"} تغییر کرده. صفحه را تازه کنید تا آخرین نسخه را ببینید.`, { conflict: true });
}

r.put("/products/:id", requireAdmin("products"), wrap((req, res) => {
  const id = Number(req.params.id);
  const f = productFields(req.body);
  tx(() => {
    checkVersion("products", id, req.body.version, "این محصول");
    const clash = db().prepare("SELECT id FROM products WHERE slug=? AND id!=?").get(f.slug, id);
    if (clash) throw new HttpError(400, "این نامک (آدرس) برای محصول دیگری استفاده شده.");
    db().prepare(`UPDATE products SET ${Object.keys(f).map((k) => `${k}=?`).join(",")}, updated_by=?, updated_at=?, version=version+1 WHERE id=?`)
      .run(...Object.values(f), req.admin.name, now(), id);
  });
  log(req, "ویرایش محصول", "product", id, f.title);
  res.json(adminProduct(id));
}));

/** ویرایش سریع از لیست: موجودی، فعال بودن، ویژه بودن، تخفیف */
r.patch("/products/:id", requireAdmin("products"), wrap((req, res) => {
  const id = Number(req.params.id);
  const sets = [];
  const args = [];
  if ("stock" in req.body) sets.push("stock=?"), args.push(Math.max(0, Math.floor(num(req.body.stock))));
  if ("active" in req.body) sets.push("active=?"), args.push(bool(req.body.active));
  if ("featured" in req.body) sets.push("featured=?"), args.push(bool(req.body.featured));
  if ("discount_percent" in req.body) sets.push("discount_percent=?"), args.push(Math.min(100, Math.max(0, num(req.body.discount_percent))));
  if (!sets.length) throw new HttpError(400, "چیزی برای تغییر نیست.");
  tx(() => {
    checkVersion("products", id, req.body.version, "این محصول");
    db().prepare(`UPDATE products SET ${sets.join(",")}, updated_by=?, updated_at=?, version=version+1 WHERE id=?`).run(...args, req.admin.name, now(), id);
  });
  log(req, "ویرایش سریع محصول", "product", id, req.body);
  res.json(adminProduct(id));
}));

r.delete("/products/:id", requireAdmin("products"), wrap((req, res) => {
  const id = Number(req.params.id);
  const p = db().prepare("SELECT title FROM products WHERE id=?").get(id);
  if (!p) throw new HttpError(404, "محصول پیدا نشد.");
  const files = db().prepare("SELECT filename FROM product_images WHERE product_id=?").all(id);
  db().prepare("DELETE FROM products WHERE id=?").run(id);
  for (const f of files) fs.rm(path.join(UPLOAD_DIR, f.filename), { force: true }, () => {});
  log(req, "حذف محصول", "product", id, p.title);
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
  wrap((req, res) => {
    const id = Number(req.params.id);
    const files = req.files || [];
    const drop = () => files.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    if (!db().prepare("SELECT 1 FROM products WHERE id=?").get(id)) {
      drop();
      throw new HttpError(404, "محصول پیدا نشد.");
    }
    if (!files.length) throw new HttpError(400, "فقط عکس JPG، PNG، WEBP یا GIF قابل آپلود است.");
    const bad = files.filter((f) => !isRealImage(f.path));
    bad.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    const good = files.filter((f) => !bad.includes(f));
    let sort = db().prepare("SELECT COALESCE(MAX(sort),-1) m FROM product_images WHERE product_id=?").get(id).m;
    const ins = db().prepare("INSERT INTO product_images (product_id,filename,sort,created_at) VALUES (?,?,?,?)");
    tx(() => {
      for (const f of good) ins.run(id, f.filename, ++sort, now());
      db().prepare("UPDATE products SET updated_at=?, updated_by=? WHERE id=?").run(now(), req.admin.name, id);
    });
    log(req, "آپلود عکس محصول", "product", id, `${good.length} عکس`);
    const p = adminProduct(id);
    res.json({ images: p.images, warning: bad.length ? `${bad.length} فایل عکس معتبر نبود و رد شد.` : "" });
  }));

r.delete("/images/:imageId", requireAdmin("products"), wrap((req, res) => {
  const img = db().prepare("SELECT * FROM product_images WHERE id=?").get(Number(req.params.imageId));
  if (!img) throw new HttpError(404, "عکس پیدا نشد.");
  db().prepare("DELETE FROM product_images WHERE id=?").run(img.id);
  fs.rm(path.join(UPLOAD_DIR, img.filename), { force: true }, () => {});
  log(req, "حذف عکس محصول", "product", img.product_id);
  res.json({ images: adminProduct(img.product_id).images });
}));

r.put("/products/:id/images/order", requireAdmin("products"), wrap((req, res) => {
  const id = Number(req.params.id);
  const ids = (req.body.ids || []).map(Number);
  const st = db().prepare("UPDATE product_images SET sort=? WHERE id=? AND product_id=?");
  tx(() => ids.forEach((imgId, i) => st.run(i, imgId, id)));
  res.json({ images: adminProduct(id).images });
}));

// ======================= دسته‌بندی =======================
r.get("/categories", requireAdmin("categories", "products"), (req, res) => {
  res.json(db().prepare("SELECT c.*, (SELECT COUNT(*) FROM products WHERE category_id=c.id) product_count FROM categories c ORDER BY sort,id").all());
});
function catFields(b) {
  const f = { name: str(b.name, 60), slug: slugify(b.slug || b.name), description: str(b.description, 200), icon: str(b.icon, 20) || "ring", sort: Math.floor(num(b.sort)), active: bool(b.active ?? 1) };
  if (f.name.length < 2) throw new HttpError(400, "نام دسته را وارد کنید.");
  return f;
}
r.post("/categories", requireAdmin("categories"), wrap((req, res) => {
  const f = catFields(req.body);
  const id = db().prepare(`INSERT INTO categories (${Object.keys(f)}) VALUES (${Object.keys(f).map(() => "?")})`).run(...Object.values(f)).lastInsertRowid;
  log(req, "افزودن دسته", "category", id, f.name);
  res.json({ id });
}));
r.put("/categories/:id", requireAdmin("categories"), wrap((req, res) => {
  const f = catFields(req.body);
  db().prepare(`UPDATE categories SET ${Object.keys(f).map((k) => `${k}=?`)} WHERE id=?`).run(...Object.values(f), Number(req.params.id));
  log(req, "ویرایش دسته", "category", req.params.id, f.name);
  res.json({ ok: true });
}));
r.delete("/categories/:id", requireAdmin("categories"), wrap((req, res) => {
  const c = db().prepare("SELECT name FROM categories WHERE id=?").get(Number(req.params.id));
  if (!c) throw new HttpError(404, "دسته پیدا نشد.");
  db().prepare("DELETE FROM categories WHERE id=?").run(Number(req.params.id));
  log(req, "حذف دسته", "category", req.params.id, c.name);
  res.json({ ok: true });
}));

// ======================= سفارش‌ها =======================
r.get("/orders", requireAdmin("orders"), (req, res) => {
  expireStale();
  const where = [];
  const args = [];
  if (req.query.status === "open") where.push("status IN ('paid','awaiting_confirmation','processing','ready_pickup')");
  else if (req.query.status) where.push("status=?"), args.push(req.query.status);
  if (req.query.q) where.push("(code LIKE ? OR name LIKE ? OR phone LIKE ?)"), args.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  const page = Math.max(1, Number(req.query.page) || 1);
  const W = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = db().prepare(`SELECT COUNT(*) c FROM orders ${W}`).get(...args).c;
  const rows = db().prepare(`SELECT id,code,name,phone,city,total,status,payment_method,delivery,created_at,paid_at,(SELECT SUM(qty) FROM order_items WHERE order_id=orders.id) items FROM orders ${W} ORDER BY id DESC LIMIT 30 OFFSET ?`).all(...args, (page - 1) * 30);
  res.json({ total, page, pages: Math.max(1, Math.ceil(total / 30)), rows: rows.map((o) => ({ ...o, status_title: STATUSES[o.status] })) });
});

r.get("/orders/:code", requireAdmin("orders"), (req, res) => {
  const o = getOrder(req.params.code);
  if (!o) return res.status(404).json({ error: "سفارش پیدا نشد." });
  o.items = o.items.map((i) => ({ ...i, breakdown: JSON.parse(i.breakdown || "{}") }));
  o.history = db().prepare("SELECT username,action,details,created_at FROM activity_log WHERE entity='order' AND entity_id=? ORDER BY id DESC").all(o.code);
  res.json(o);
});

r.put("/orders/:code", requireAdmin("orders"), wrap((req, res) => {
  const o = getOrder(req.params.code);
  if (!o) throw new HttpError(404, "سفارش پیدا نشد.");
  const next = req.body.status || o.status;
  tx(() => {
    checkVersion("orders", o.id, req.body.version, "این سفارش");
    if (next !== o.status) changeStatus(o, next);
    db().prepare("UPDATE orders SET status=?, tracking_code=?, admin_note=?, paid_at=COALESCE(paid_at, CASE WHEN ? IN ('paid','processing','shipped','ready_pickup','delivered') THEN ? END), updated_at=?, version=version+1 WHERE id=?")
      .run(next, str(req.body.tracking_code ?? o.tracking_code, 60), str(req.body.admin_note ?? o.admin_note, 2000), next, now(), now(), o.id);
  });
  const changes = [];
  if (next !== o.status) changes.push(`وضعیت: ${STATUSES[o.status]} → ${STATUSES[next]}`);
  if ((req.body.tracking_code ?? o.tracking_code) !== o.tracking_code) changes.push(`کد رهگیری: ${req.body.tracking_code}`);
  if ((req.body.admin_note ?? o.admin_note) !== o.admin_note) changes.push("یادداشت تغییر کرد");
  if (changes.length) log(req, "ویرایش سفارش", "order", o.code, changes.join("، "));
  res.json({ ok: true });
}));

// ======================= مشتری‌ها =======================
r.get("/customers", requireAdmin("customers"), (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : "%";
  res.json(db().prepare(`SELECT c.id,c.phone,c.name,c.city,c.created_at,
    (SELECT COUNT(*) FROM orders WHERE customer_id=c.id AND status IN ('paid','processing','shipped','ready_pickup','delivered')) orders,
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE customer_id=c.id AND status IN ('paid','processing','shipped','ready_pickup','delivered')) spent
    FROM customers c WHERE c.phone LIKE ? OR c.name LIKE ? ORDER BY c.id DESC LIMIT 200`).all(q, q));
});

// ======================= تنظیمات =======================
const GOLD_KEYS = ["gold_rate_18", "vat_percent", "ticker_extra", "gold_rate_updated_at"];
const CHANNEL_KEYS = Object.keys(DEFAULTS).filter((k) => /^(torob|emalls|google_feed|basalam)_/.test(k));
const STORE_KEYS = Object.keys(DEFAULTS).filter((k) => !GOLD_KEYS.includes(k) && !CHANNEL_KEYS.includes(k));
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

r.get("/settings", requireAdmin("settings"), (req, res) => {
  res.json({ values: pick(getSettings(), STORE_KEYS), gateways: GATEWAYS.map((g) => ({ id: g.id, title: g.title, callback: `${siteUrl()}/api/payment/callback/${g.id}` })) });
});
r.put("/settings", requireAdmin("settings"), wrap((req, res) => {
  const vals = pick(req.body, STORE_KEYS);
  setSettings(vals);
  log(req, "تغییر تنظیمات", "settings", "", Object.keys(vals).filter((k) => !k.endsWith("merchant")).join("، "));
  res.json({ ok: true });
}));
r.post("/settings/test/:gateway", requireAdmin("settings"), wrap(async (req, res) => {
  const g = gateway(req.params.gateway);
  if (!g?.test) throw new HttpError(400, "این درگاه تست اتصال ندارد.");
  res.json(await g.test({ ...getSettings(), ...pick(req.body, STORE_KEYS) }, `${siteUrl()}/api/payment/callback/${g.id}`));
}));

// ======================= کانال‌های فروش =======================
r.get("/channels", requireAdmin("channels"), (req, res) => {
  const base = siteUrl();
  const s = getSettings();
  const stats = db().prepare("SELECT COUNT(*) total, SUM(basalam_id IS NOT NULL) synced, SUM(basalam_error IS NOT NULL) errors, MAX(basalam_synced_at) last FROM products").get();
  res.json({
    values: pick(s, CHANNEL_KEYS),
    feeds: {
      torob: `${base}/torob/products${s.torob_token ? `?token=${s.torob_token}` : ""}`,
      emalls: `${base}/emalls/products${s.emalls_token ? `?token=${s.emalls_token}` : ""}`,
      xml: `${base}/feeds/products.xml`,
      csv: `${base}/feeds/products.csv`,
      sitemap: `${base}/sitemap.xml`,
    },
    basalam: { ready: basalam.basalamReady(), ...stats },
    errors: db().prepare("SELECT id,title,basalam_error FROM products WHERE basalam_error IS NOT NULL LIMIT 20").all(),
  });
});
r.put("/channels", requireAdmin("channels"), wrap((req, res) => {
  setSettings(pick(req.body, CHANNEL_KEYS));
  log(req, "تغییر تنظیمات کانال‌های فروش", "settings");
  res.json({ ok: true });
}));
r.post("/channels/token/:which", requireAdmin("channels"), wrap((req, res) => {
  const key = req.params.which === "emalls" ? "emalls_token" : "torob_token";
  const token = crypto.randomBytes(16).toString("hex");
  setSettings({ [key]: token });
  log(req, "ساخت توکن فید", "settings", key);
  res.json({ token });
}));
r.post("/channels/basalam/test", requireAdmin("channels"), wrap(async (req, res) => {
  const w = await basalam.whoAmI();
  if (w.ok && w.vendorId && !getSettings().basalam_vendor_id) setSettings({ basalam_vendor_id: w.vendorId });
  res.json(w);
}));
r.get("/channels/basalam/categories", requireAdmin("channels"), wrap(async (req, res) => res.json(await basalam.categories(req.query.q))));
r.post("/channels/basalam/sync/:id", requireAdmin("channels", "products"), wrap(async (req, res) => {
  const out = await basalam.pushProduct(Number(req.params.id));
  log(req, "ارسال محصول به باسلام", "product", req.params.id, out.message);
  res.json(out);
}));
r.post("/channels/basalam/sync-all", requireAdmin("channels"), wrap(async (req, res) => {
  const out = await basalam.pushAll();
  log(req, "همگام‌سازی همه‌ی محصولات با باسلام", "settings", "", `${out.ok} موفق، ${out.fail} ناموفق`);
  res.json(out);
}));

// ======================= کاربران پنل =======================
r.get("/users", requireAdmin("users"), (req, res) => {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  res.json(db().prepare(`SELECT id,username,name,role,perms,active,created_at,last_login,
    (SELECT COUNT(*) FROM sessions WHERE kind='admin' AND subject_id=users.id AND expires_at > ?) sessions,
    (SELECT MAX(last_seen) FROM sessions WHERE kind='admin' AND subject_id=users.id) last_seen
    FROM users ORDER BY id`).all(now()).map((u) => ({ ...u, perms: JSON.parse(u.perms || "[]"), online: !!u.last_seen && u.last_seen >= since })));
});

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
const ownersLeft = (exceptId) => db().prepare("SELECT COUNT(*) c FROM users WHERE role='owner' AND active=1 AND id!=?").get(exceptId).c;

r.post("/users", requireAdmin("users"), wrap((req, res) => {
  const f = userFields(req.body, true);
  if (str(req.body.password).length < 8) throw new HttpError(400, "رمز عبور حداقل ۸ کاراکتر باشد.");
  if (f.role === "owner" && req.admin.role !== "owner") throw new HttpError(403, "فقط مدیر کل می‌تواند مدیر کل جدید بسازد.");
  const id = db().prepare("INSERT INTO users (username,name,password_hash,role,perms,active,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(f.username, f.name, hashPassword(req.body.password), f.role, f.perms, f.active, now()).lastInsertRowid;
  log(req, "افزودن کاربر پنل", "user", id, `${f.username} (${ROLES[f.role].title})`);
  res.json({ id });
}));

r.put("/users/:id", requireAdmin("users"), wrap((req, res) => {
  const id = Number(req.params.id);
  const u = db().prepare("SELECT * FROM users WHERE id=?").get(id);
  if (!u) throw new HttpError(404, "کاربر پیدا نشد.");
  const f = userFields(req.body, false);
  if ((u.role === "owner" || f.role === "owner") && req.admin.role !== "owner") throw new HttpError(403, "فقط مدیر کل می‌تواند مدیر کل را تغییر دهد.");
  if (u.role === "owner" && (f.role !== "owner" || !f.active) && ownersLeft(id) === 0) throw new HttpError(400, "حداقل یک مدیر کل فعال باید باقی بماند.");
  if (id === req.admin.id && !f.active) throw new HttpError(400, "نمی‌توانید حساب خودتان را غیرفعال کنید.");
  db().prepare("UPDATE users SET name=?, role=?, perms=?, active=? WHERE id=?").run(f.name, f.role, f.perms, f.active, id);
  if (req.body.password) {
    if (str(req.body.password).length < 8) throw new HttpError(400, "رمز عبور حداقل ۸ کاراکتر باشد.");
    db().prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(req.body.password), id);
  }
  if (!f.active || req.body.password) killSessions("admin", id, id === req.admin.id ? req.admin.token : "");
  log(req, "ویرایش کاربر پنل", "user", id, `${u.username}: ${ROLES[f.role].title}${f.active ? "" : "، غیرفعال"}${req.body.password ? "، تغییر رمز" : ""}`);
  res.json({ ok: true });
}));

r.post("/users/:id/logout", requireAdmin("users"), wrap((req, res) => {
  const id = Number(req.params.id);
  killSessions("admin", id, id === req.admin.id ? req.admin.token : "");
  log(req, "خروج اجباری کاربر از همه‌ی دستگاه‌ها", "user", id);
  res.json({ ok: true });
}));

r.delete("/users/:id", requireAdmin("users"), wrap((req, res) => {
  const id = Number(req.params.id);
  const u = db().prepare("SELECT * FROM users WHERE id=?").get(id);
  if (!u) throw new HttpError(404, "کاربر پیدا نشد.");
  if (id === req.admin.id) throw new HttpError(400, "نمی‌توانید حساب خودتان را حذف کنید.");
  if (u.role === "owner" && req.admin.role !== "owner") throw new HttpError(403, "فقط مدیر کل می‌تواند مدیر کل را حذف کند.");
  if (u.role === "owner" && ownersLeft(id) === 0) throw new HttpError(400, "حداقل یک مدیر کل فعال باید باقی بماند.");
  killSessions("admin", id, "");
  db().prepare("DELETE FROM users WHERE id=?").run(id);
  log(req, "حذف کاربر پنل", "user", id, u.username);
  res.json({ ok: true });
}));

// ======================= گزارش فعالیت =======================
r.get("/logs", requireAdmin("logs"), (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const where = req.query.user ? "WHERE user_id=?" : "";
  const args = req.query.user ? [Number(req.query.user)] : [];
  res.json(db().prepare(`SELECT * FROM activity_log ${where} ORDER BY id DESC LIMIT 50 OFFSET ?`).all(...args, (page - 1) * 50));
});

export default r;
