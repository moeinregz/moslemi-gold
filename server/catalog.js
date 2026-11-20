import { db } from "./db.js";
import { getSettings } from "./settings.js";
import { priceProduct } from "./pricing.js";
import { siteUrl } from "./config.js";

export const imageUrl = (filename) => `/uploads/${filename}`;

function imagesFor(ids) {
  if (!ids.length) return new Map();
  const rows = db().prepare(`SELECT id, product_id, filename FROM product_images WHERE product_id IN (${ids.map(() => "?").join(",")}) ORDER BY sort, id`).all(...ids);
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.product_id)) m.set(r.product_id, []);
    m.get(r.product_id).push({ id: r.id, url: imageUrl(r.filename), filename: r.filename });
  }
  return m;
}

/** محصول + قیمت روز + عکس‌ها برای نمایش عمومی */
export function present(rows, s = getSettings()) {
  const imgs = imagesFor(rows.map((r) => r.id));
  return rows.map((p) => {
    const pr = priceProduct(p, s);
    let specs = [];
    try {
      specs = JSON.parse(p.specs || "[]");
    } catch {}
    return {
      id: p.id, title: p.title, slug: p.slug, sku: p.sku,
      category_id: p.category_id, category_name: p.category_name, category_slug: p.category_slug,
      short_desc: p.short_desc, description: p.description,
      pricing_mode: p.pricing_mode, karat: p.karat, weight: p.weight,
      discount_percent: p.discount_percent, guarantee: p.guarantee, specs,
      stock: p.stock, in_stock: p.stock > 0 && !!p.active, featured: !!p.featured, sold_count: p.sold_count,
      price: pr.price, old_price: pr.old_price, breakdown: pr.breakdown,
      images: imgs.get(p.id) || [],
      updated_at: p.updated_at,
    };
  });
}

const BASE = `SELECT p.*, c.name category_name, c.slug category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

export function listPublic({ category, q, sort, featured, limit = 60, offset = 0 } = {}) {
  const where = ["p.active = 1", "(c.id IS NULL OR c.active = 1)"];
  const args = [];
  if (category) {
    where.push("c.slug = ?");
    args.push(category);
  }
  if (q) {
    where.push("(p.title LIKE ? OR p.short_desc LIKE ? OR p.sku LIKE ?)");
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (featured) where.push("p.featured = 1");
  const order = sort === "popular" ? "p.sold_count DESC" : sort === "weight" ? "p.weight DESC" : "p.stock > 0 DESC, p.featured DESC, p.id DESC";
  const rows = db().prepare(`${BASE} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset);
  let items = present(rows);
  if (sort === "cheap") items.sort((a, b) => a.price - b.price);
  if (sort === "expensive") items.sort((a, b) => b.price - a.price);
  return items;
}

export function getPublic(slug) {
  const row = db().prepare(`${BASE} WHERE p.slug = ? AND p.active = 1`).get(slug);
  return row ? present([row])[0] : null;
}

export function getById(id) {
  const row = db().prepare(`${BASE} WHERE p.id = ?`).get(id);
  return row ? present([row])[0] : null;
}

/** همه‌ی محصولات فعال برای فیدها (ترب، ایمالز، گوگل) */
export function feedProducts() {
  const rows = db().prepare(`${BASE} WHERE p.active = 1 ORDER BY p.id`).all();
  const base = siteUrl();
  return present(rows).map((p) => ({ ...p, url: `${base}/product/${encodeURIComponent(p.slug)}`, image_links: p.images.map((i) => base + i.url) }));
}

export function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `p-${Date.now()}`;
}
