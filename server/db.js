import { MongoClient } from "mongodb";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";
import { hashPassword } from "./auth.js";

export const DATA_DIR = path.join(ROOT, "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const now = () => new Date().toISOString();

/**
 * همه‌ی داده‌ها در «یک» کالکشن (پیش‌فرض: moslemi) ذخیره می‌شن و نوع هر سند در فیلد `t` است:
 *   user | customer | session | category | product | image | order | setting | log | counter
 * شناسه‌ی عددی (id) هر سند با شمارنده‌ی اتمیک ساخته می‌شه تا آدرس‌ها و رابط کاربری مثل قبل کار کنن.
 */
const META_OFF = { _id: 0, t: 0 };

let client = null;
let coll = null;
let ready = null;
let dbName = "moslemi";
let collName = "moslemi";

function buildUri() {
  const e = process.env;
  if (e.MONGODB_URI && e.MONGODB_URI.trim()) return e.MONGODB_URI.trim();
  const user = (e.MONGODB_USER || "").trim();
  const pass = e.MONGODB_PASSWORD || "";
  const host = (e.MONGODB_HOST || "").trim().replace(/^mongodb(\+srv)?:\/\//, "").replace(/\/.*$/, "");
  if (!user || !pass || !host || /CLUSTER|YOUR|xxxx/i.test(host)) {
    throw new Error("اتصال MongoDB کامل تنظیم نشده: در فایل .env مقدار MONGODB_HOST (آدرس کلاستر، مثل cluster0.abcde.mongodb.net) را بگذارید.");
  }
  // نام کاربری و رمز باید URL-encode شوند تا کاراکترهای خاص اتصال را خراب نکنند
  return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/?retryWrites=true&w=majority&appName=moslemi-gold`;
}

export function initDb() {
  if (!ready) {
    ready = (async () => {
      dbName = (process.env.MONGODB_DB || "moslemi").trim();
      collName = (process.env.MONGODB_COLLECTION || "moslemi").trim();
      client = new MongoClient(buildUri(), { serverSelectionTimeoutMS: 15_000, maxPoolSize: 10 });
      await client.connect();
      coll = client.db(dbName).collection(collName);
      await ensureIndexes();
      await seed();
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export async function closeDb() {
  if (client) await client.close();
  client = coll = ready = null;
}

/** فقط برای تست‌ها */
export async function dropCollection() {
  if (coll) await coll.drop().catch(() => {});
}

export const raw = () => {
  if (!coll) throw new Error("دیتابیس هنوز وصل نشده (initDb صدا زده نشده).");
  return coll;
};

export async function ping() {
  await client.db(dbName).command({ ping: 1 });
}

async function ensureIndexes() {
  const c = coll;
  const NOCASE = { locale: "en", strength: 2 };
  await Promise.all([
    c.createIndex({ t: 1, id: 1 }, { name: "t_id", unique: true, partialFilterExpression: { id: { $exists: true } } }),
    c.createIndex({ t: 1, slug: 1 }, { name: "t_slug", unique: true, partialFilterExpression: { slug: { $exists: true } } }),
    c.createIndex({ t: 1, code: 1 }, { name: "t_code", unique: true, partialFilterExpression: { code: { $exists: true } } }),
    c.createIndex({ t: 1, token: 1 }, { name: "t_token", unique: true, partialFilterExpression: { token: { $exists: true } } }),
    c.createIndex({ t: 1, key: 1 }, { name: "t_key", unique: true, partialFilterExpression: { key: { $exists: true } } }),
    c.createIndex({ username: 1 }, { name: "user_username", unique: true, collation: NOCASE, partialFilterExpression: { t: "user" } }),
    c.createIndex({ phone: 1 }, { name: "customer_phone", unique: true, partialFilterExpression: { t: "customer" } }),
    c.createIndex({ t: 1, phone: 1 }, { name: "t_phone" }),
    c.createIndex({ t: 1, customer_id: 1 }, { name: "t_customer" }),
    c.createIndex({ t: 1, status: 1, created_at: -1 }, { name: "t_status_created" }),
    c.createIndex({ t: 1, product_id: 1, sort: 1 }, { name: "t_product_sort" }),
    c.createIndex({ t: 1, kind: 1, subject_id: 1 }, { name: "t_session_subject" }),
    c.createIndex({ t: 1, created_at: -1 }, { name: "t_created" }),
    // نشست‌های منقضی را خود MongoDB پاک می‌کند
    c.createIndex({ exp: 1 }, { name: "session_ttl", expireAfterSeconds: 0, partialFilterExpression: { t: "session" } }),
  ]);
}

// ---------------------------------------------------------------- ابزارهای ساده

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** جستجوی «شامل» بدون حساسیت به حروف */
export const like = (q) => new RegExp(escapeRegex(q), "i");

const proj = (opts) => (opts?.projection ? { ...opts.projection, _id: 0 } : META_OFF);

export async function nextId(t) {
  const _id = `counter:${t}`;
  for (let i = 0; i < 3; i++) {
    try {
      const d = await raw().findOneAndUpdate({ _id }, { $inc: { seq: 1 }, $setOnInsert: { t: "counter" } }, { upsert: true, returnDocument: "after" });
      return d.seq;
    } catch (e) {
      if (e.code !== 11000) throw e; // دو درخواست هم‌زمان برای ساخت اولین شمارنده
    }
  }
  throw new Error("ساخت شناسه ناموفق بود.");
}

export const one = (t, filter = {}, opts = {}) => raw().findOne({ t, ...filter }, { ...opts, projection: proj(opts) });

export function many(t, filter = {}, opts = {}) {
  let cur = raw().find({ t, ...filter }, { projection: proj(opts), ...(opts.collation ? { collation: opts.collation } : {}) });
  if (opts.sort) cur = cur.sort(opts.sort);
  if (opts.skip) cur = cur.skip(opts.skip);
  if (opts.limit) cur = cur.limit(opts.limit);
  return cur.toArray();
}

export const count = (t, filter = {}) => raw().countDocuments({ t, ...filter });

/** سند جدید با id خودکار؛ id ساخته‌شده برگردانده می‌شه */
export async function insert(t, doc) {
  const id = doc.id ?? (await nextId(t));
  await raw().insertOne({ ...doc, t, id });
  return id;
}

export const update = (t, filter, change) => raw().updateOne({ t, ...filter }, change);
export const updateMany = (t, filter, change) => raw().updateMany({ t, ...filter }, change);
export const remove = (t, filter) => raw().deleteOne({ t, ...filter });
export const removeMany = (t, filter) => raw().deleteMany({ t, ...filter });

// ---------------------------------------------------------------- داده‌ی اولیه

const CATS = [
  ["انگشتر", "ring", "نامزدی، ازدواج و روزمره", "ring"],
  ["گردنبند", "necklace", "پلاک، مدال و زنجیر", "necklace"],
  ["دستبند و النگو", "bracelet", "ساده، جواهرنشان و دست‌ساز", "bracelet"],
  ["گوشواره", "earring", "آویز، حلقه‌ای و مینیمال", "earring"],
  ["سرویس عروس", "bridal-set", "ست کامل مجلسی و عروس", "crown"],
  ["سکه و شمش", "coin", "سرمایه‌گذاری مطمئن", "coin"],
];

const PRODUCTS = [
  ["حلقهٔ ستارهٔ سحر", "ring", 18, 3.2, 18, "طراحی مینیمال با نگین مرکزی", 1, 2500000],
  ["پلاک باغ ارم", "necklace", 18, 4.1, 22, "الهام‌گرفته از نقوش گره‌چینی", 1, 0],
  ["النگوی زربفت", "bracelet", 18, 12.5, 15, "حکاکی دستی، مدل کلاسیک", 1, 0],
  ["قطرهٔ مهتاب", "earring", 18, 2.4, 20, "سبک و مناسب استفاده روزانه", 1, 0],
  ["افسانهٔ شیراز", "bridal-set", 18, 38, 25, "ست کامل شامل تاج، گردنبند و گوشواره", 1, 18000000],
  ["زنجیر کارتیه", "necklace", 18, 6.8, 12, "زنجیر ظریف روزمره", 0, 0],
  ["دستبند ونیزی", "bracelet", 18, 5.3, 14, "دستبند زنجیری سبک", 0, 0],
  ["انگشتر سولیتر", "ring", 18, 2.9, 25, "تک‌نگین کلاسیک برای نامزدی", 0, 4200000],
];

const productBase = (t) => ({
  short_desc: "", description: "", pricing_mode: "gold", karat: 18, weight: 0, labor_percent: 0, profit_percent: 7,
  stone_price: 0, fixed_price: 0, discount_percent: 0, stock: 1, guarantee: "ضمانت اصالت و بازخرید", specs: "[]",
  active: 1, featured: 0, sold_count: 0, version: 1,
  basalam_id: null, basalam_photo: null, basalam_synced_at: null, basalam_error: null,
  created_by: "seed", updated_by: "seed", created_at: t, updated_at: t,
});

async function seed() {
  if (await count("user")) return;
  const t = now();
  try {
    await insert("user", {
      username: (process.env.ADMIN_USERNAME || "admin").trim(), name: "مدیر کل",
      password_hash: hashPassword(process.env.ADMIN_PASSWORD || "admin123"),
      role: "owner", perms: "[]", active: 1, created_at: t, last_login: null,
    });
    const catId = {};
    for (const [i, c] of CATS.entries()) {
      catId[c[1]] = await insert("category", { name: c[0], slug: c[1], description: c[2], icon: c[3], sort: i, active: 1 });
    }
    for (const [i, p] of PRODUCTS.entries()) {
      await insert("product", {
        ...productBase(t),
        title: p[0], slug: `p-${i + 1}`, sku: `MS-${1001 + i}`, category_id: catId[p[1]], short_desc: p[5],
        description: `${p[5]}. ساخته‌شده در کارگاه طلا فروشی مسلمی با گواهی عیار.`,
        karat: p[2], weight: p[3], labor_percent: p[4], stone_price: p[7], featured: p[6], stock: 3,
        specs: JSON.stringify([{ k: "رنگ", v: "زرد" }, { k: "عیار", v: String(p[2]) }]),
      });
    }
    await insert("product", {
      ...productBase(t),
      title: "سکه تمام بهار آزادی", slug: "coin-bahar", sku: "MS-2001", category_id: catId.coin, short_desc: "سکه طرح جدید بانک مرکزی",
      pricing_mode: "fixed", karat: 22, weight: 8.133, fixed_price: 58200000, profit_percent: 0, stock: 5,
    });
  } catch (e) {
    if (e.code !== 11000) throw e; // نمونه‌ی دیگری هم‌زمان داده‌ی اولیه را ساخته
  }
}
