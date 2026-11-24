import { many, one } from "./db.js";
import { getSettings } from "./settings.js";
import { priceProduct } from "./pricing.js";
import { siteUrl } from "./config.js";

export const imageUrl = (filename) => `/uploads/${filename}`;

async function imagesFor(ids) {
  if (!ids.length) return new Map();
  const rows = await many("image", { product_id: { $in: ids } }, { sort: { sort: 1, id: 1 } });
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.product_id)) m.set(r.product_id, []);
    m.get(r.product_id).push({ id: r.id, url: imageUrl(r.filename), filename: r.filename });
  }
  return m;
}

/** نام و نامک دسته را به هر محصول اضافه می‌کند (معادل LEFT JOIN) */
export async function withCategory(rows) {
  const ids = [...new Set(rows.map((r) => r.category_id).filter((x) => x != null))];
  const cats = new Map((ids.length ? await many("category", { id: { $in: ids } }) : []).map((c) => [c.id, c]));
  return rows.map((p) => ({ ...p, category_name: cats.get(p.category_id)?.name ?? null, category_slug: cats.get(p.category_id)?.slug ?? null }));
}

/** محصول + قیمت روز + عکس‌ها برای نمایش عمومی */
export async function present(rows, s) {
  s ??= await getSettings();
  const imgs = await imagesFor(rows.map((r) => r.id));
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

const SORTERS = {
  popular: (a, b) => b.sold_count - a.sold_count || b.id - a.id,
  weight: (a, b) => b.weight - a.weight || b.id - a.id,
  default: (a, b) => (b.stock > 0) - (a.stock > 0) || b.featured - a.featured || b.id - a.id,
};

export async function listPublic({ category, q, sort, featured, limit = 60, offset = 0 } = {}) {
  const filter = { active: 1 };
  if (featured) filter.featured = 1;
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { short_desc: rx }, { sku: rx }];
  }
  const cats = await many("category");
  const byId = new Map(cats.map((c) => [c.id, c]));
  if (category) {
    const c = cats.find((x) => x.slug === category && x.active);
    if (!c) return [];
    filter.category_id = c.id;
  }
  // محصولِ دسته‌ی غیرفعال نمایش داده نمی‌شه (محصول بدون دسته نمایش داده می‌شه)
  let rows = (await many("product", filter)).filter((p) => p.category_id == null || byId.get(p.category_id)?.active);
  const price = sort === "cheap" || sort === "expensive";
  if (!price) rows.sort(SORTERS[sort] || SORTERS.default);
  rows = rows.map((p) => ({ ...p, category_name: byId.get(p.category_id)?.name ?? null, category_slug: byId.get(p.category_id)?.slug ?? null }));
  if (!price) return present(rows.slice(offset, offset + limit));
  const items = await present(rows);
  items.sort(sort === "cheap" ? (a, b) => a.price - b.price : (a, b) => b.price - a.price);
  return items.slice(offset, offset + limit);
}

export async function getPublic(slug) {
  const row = await one("product", { slug, active: 1 });
  return row ? (await present(await withCategory([row])))[0] : null;
}

export async function getById(id) {
  const row = await one("product", { id: Number(id) });
  return row ? (await present(await withCategory([row])))[0] : null;
}

/** همه‌ی محصولات فعال برای فیدها (ترب، ایمالز، گوگل) */
export async function feedProducts() {
  const rows = await many("product", { active: 1 }, { sort: { id: 1 } });
  const base = siteUrl();
  return (await present(await withCategory(rows))).map((p) => ({ ...p, url: `${base}/product/${encodeURIComponent(p.slug)}`, image_links: p.images.map((i) => base + i.url) }));
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
