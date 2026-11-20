import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";
import { hashPassword } from "./auth.js";

export const DATA_DIR = path.join(ROOT, "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let _db;
export function db() {
  if (_db) return _db;
  const file = process.env.DB_FILE || path.join(DATA_DIR, "shop.db");
  _db = new Database(file);
  // WAL: چند کاربر هم‌زمان می‌تونن بخونن و بنویسن بدون قفل شدن دیتابیس
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  seed(_db);
  return _db;
}

/** اجرای چند دستور به‌صورت اتمیک */
export function tx(fn) {
  return db().transaction(fn)();
}

export const now = () => new Date().toISOString();

function migrate(d) {
  d.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'support',
    perms TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    province TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    kind TEXT NOT NULL,             -- admin | customer
    subject_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip TEXT, ua TEXT
  );
  CREATE INDEX IF NOT EXISTS sessions_subject ON sessions(kind, subject_id);

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'ring',
    sort INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    sku TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    short_desc TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    pricing_mode TEXT NOT NULL DEFAULT 'gold', -- gold: وزن×نرخ روز+اجرت+سود+مالیات | fixed: قیمت ثابت
    karat INTEGER NOT NULL DEFAULT 18,
    weight REAL NOT NULL DEFAULT 0,            -- گرم
    labor_percent REAL NOT NULL DEFAULT 0,     -- اجرت ساخت (٪)
    profit_percent REAL NOT NULL DEFAULT 7,    -- سود فروشنده (٪)
    stone_price INTEGER NOT NULL DEFAULT 0,    -- قیمت سنگ/نگین (تومان)
    fixed_price INTEGER NOT NULL DEFAULT 0,    -- تومان (حالت fixed)
    discount_percent REAL NOT NULL DEFAULT 0,  -- تخفیف روی اجرت+سود (حالت gold) یا کل قیمت (fixed)
    stock INTEGER NOT NULL DEFAULT 1,
    guarantee TEXT NOT NULL DEFAULT 'ضمانت اصالت و بازخرید',
    specs TEXT NOT NULL DEFAULT '[]',          -- [{k,v}]
    active INTEGER NOT NULL DEFAULT 1,
    featured INTEGER NOT NULL DEFAULT 0,
    sold_count INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    basalam_id TEXT, basalam_photo TEXT, basalam_synced_at TEXT, basalam_error TEXT,
    created_by TEXT, updated_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS products_cat ON products(category_id, active);
  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS images_product ON product_images(product_id, sort);

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    name TEXT NOT NULL, phone TEXT NOT NULL,
    province TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '', postal_code TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    delivery TEXT NOT NULL DEFAULT 'post',     -- post | pickup
    subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    payment_method TEXT NOT NULL DEFAULT '',
    payment_authority TEXT, payment_ref TEXT, payment_meta TEXT,
    tracking_code TEXT NOT NULL DEFAULT '',
    admin_note TEXT NOT NULL DEFAULT '',
    gold_rate INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT
  );
  CREATE INDEX IF NOT EXISTS orders_status ON orders(status, created_at);
  CREATE INDEX IF NOT EXISTS orders_phone ON orders(phone);
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    title TEXT NOT NULL, karat INTEGER, weight REAL,
    unit_price INTEGER NOT NULL, qty INTEGER NOT NULL,
    breakdown TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER, username TEXT,
    action TEXT NOT NULL, entity TEXT, entity_id TEXT, details TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS log_time ON activity_log(created_at);
  `);
}

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

function seed(d) {
  const has = d.prepare("SELECT COUNT(*) c FROM users").get().c;
  if (has) return;
  const t = now();
  d.transaction(() => {
    const u = process.env.ADMIN_USERNAME || "admin";
    const p = process.env.ADMIN_PASSWORD || "admin123";
    d.prepare("INSERT INTO users (username,name,password_hash,role,created_at) VALUES (?,?,?,?,?)").run(u, "مدیر کل", hashPassword(p), "owner", t);
    const ic = d.prepare("INSERT INTO categories (name,slug,description,icon,sort) VALUES (?,?,?,?,?)");
    CATS.forEach((c, i) => ic.run(c[0], c[1], c[2], c[3], i));
    const catId = (slug) => d.prepare("SELECT id FROM categories WHERE slug=?").get(slug).id;
    const ip = d.prepare(`INSERT INTO products (title,slug,sku,category_id,short_desc,description,karat,weight,labor_percent,profit_percent,stone_price,featured,stock,specs,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,7,?,?,?,?, 'seed','seed',?,?)`);
    PRODUCTS.forEach((p, i) => {
      ip.run(p[0], `p-${i + 1}`, `MS-${1001 + i}`, catId(p[1]), p[5], `${p[5]}. ساخته‌شده در کارگاه طلا فروشی مسلمی با گواهی عیار.`, p[2], p[3], p[4], p[7], p[6], 3,
        JSON.stringify([{ k: "رنگ", v: "زرد" }, { k: "عیار", v: String(p[2]) }]), t, t);
    });
    // یک سکه با قیمت ثابت
    d.prepare(`INSERT INTO products (title,slug,sku,category_id,short_desc,pricing_mode,karat,weight,fixed_price,profit_percent,stock,created_by,updated_by,created_at,updated_at)
      VALUES ('سکه تمام بهار آزادی','coin-bahar','MS-2001',?, 'سکه طرح جدید بانک مرکزی','fixed',22,8.133,58200000,0,5,'seed','seed',?,?)`).run(catId("coin"), t, t);
  })();
}
