import { Router } from "express";
import { getSettings } from "../settings.js";
import { feedProducts } from "../catalog.js";
import { siteUrl } from "../config.js";
import { many } from "../db.js";

/**
 * فیدهای محصول برای مقایسه‌گرهای قیمت و پلتفرم‌های فروش
 *
 *  ترب     : /torob/products      (وب‌سرویس ترب، نسخه‌ی torob_api_v3 — GET یا POST)
 *  ایمالز  : /emalls/products     (JSON صفحه‌بندی‌شده)
 *  گوگل/عمومی: /feeds/products.xml (RSS 2.0 با فضای نام g: — برای Google Merchant و هر سرویسی که فید XML می‌خواد)
 *  CSV     : /feeds/products.csv  (برای آپلود دستی در پنل فروشندگی دیجی‌کالا، اسنپ‌شاپ و…)
 *  سایت‌مپ : /sitemap.xml
 *
 * ترب علاوه بر وب‌سرویس، صفحه‌ی محصول رو هم می‌خونه؛ متاتگ‌های product_id، product_price، availability
 * و JSON-LD در server/index.js به صفحه‌ی محصول تزریق می‌شن.
 */
const r = Router();
// Express 4 خطای async را خودش نمی‌گیرد
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function tokenOk(req, expected) {
  if (!expected) return true;
  const got = req.query.token || req.headers["x-api-key"] || req.headers["x-torob-token"] || req.body?.token;
  return got === expected;
}

const plain = (s) => String(s || "").replace(/\s+/g, " ").trim();

// ---------------- ترب ----------------
const torob = ah(async (req, res) => {
  const s = await getSettings();
  if (s.torob_enabled !== "1") return res.status(404).json({ error: "disabled" });
  if (!tokenOk(req, s.torob_token)) return res.status(401).json({ error: "invalid token" });
  const q = { ...req.query, ...(req.body || {}) };
  let list = await feedProducts();
  // ترب می‌تونه فقط چند صفحه‌ی خاص رو بخواد
  const urls = [].concat(q.page_urls || []).filter(Boolean);
  const uniques = [].concat(q.page_uniques || []).filter(Boolean).map(String);
  if (urls.length) list = list.filter((p) => urls.includes(p.url));
  if (uniques.length) list = list.filter((p) => uniques.includes(String(p.id)));
  const size = Math.min(100, Math.max(1, Number(q.page_size) || 100));
  const page = Math.max(1, Number(q.page) || 1);
  const total = list.length;
  const slice = urls.length || uniques.length ? list : list.slice((page - 1) * size, page * size);
  res.json({
    api_version: "torob_api_v3",
    current_page: page,
    total,
    max_pages: Math.max(1, Math.ceil(total / size)),
    products: slice.map((p) => ({
      page_unique: String(p.id),
      page_url: p.url,
      product_group_id: String(p.id),
      title: p.title,
      subtitle: [p.category_name, p.karat ? `عیار ${p.karat}` : "", p.weight ? `${p.weight} گرم` : ""].filter(Boolean).join(" - "),
      current_price: p.in_stock ? p.price : 0, // تومان
      old_price: p.in_stock && p.old_price ? p.old_price : null,
      availability: p.in_stock ? "instock" : "outofstock",
      category_name: p.category_name || "",
      image_links: p.image_links,
      short_desc: plain(p.short_desc),
      spec: Object.fromEntries([["عیار", String(p.karat)], ["وزن", `${p.weight} گرم`], ...p.specs.map((x) => [x.k, x.v])]),
      guarantee: p.guarantee,
    })),
  });
});
r.get("/torob/products", torob);
r.post("/torob/products", torob);

// ---------------- ایمالز ----------------
r.all("/emalls/products", ah(async (req, res) => {
  const s = await getSettings();
  if (s.emalls_enabled !== "1") return res.status(404).json({ success: false });
  if (!tokenOk(req, s.emalls_token)) return res.status(401).json({ success: false, message: "invalid token" });
  const q = { ...req.query, ...(req.body || {}) };
  const size = Math.min(200, Math.max(1, Number(q.item_per_page || q.size) || 100));
  const page = Math.max(1, Number(q.page) || 1);
  const list = await feedProducts();
  res.json({
    success: true,
    total: list.length,
    pages: Math.max(1, Math.ceil(list.length / size)),
    page,
    products: list.slice((page - 1) * size, page * size).map((p) => ({
      id: String(p.id),
      title: p.title,
      url: p.url,
      price: p.in_stock ? p.price : 0,
      old_price: p.old_price || 0,
      is_available: p.in_stock,
      category: p.category_name || "",
      image: p.image_links[0] || "",
      guarantee: p.guarantee,
    })),
  });
}));

// ---------------- فید XML (گوگل و عمومی) ----------------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
r.get("/feeds/products.xml", ah(async (req, res) => {
  const s = await getSettings();
  if (s.google_feed_enabled !== "1") return res.status(404).end();
  const items = (await feedProducts())
    .map((p) => `  <item>
    <g:id>${p.id}</g:id>
    <g:title>${esc(p.title)}</g:title>
    <g:description>${esc(plain(p.short_desc || p.description || p.title))}</g:description>
    <g:link>${esc(p.url)}</g:link>
    ${p.image_links[0] ? `<g:image_link>${esc(p.image_links[0])}</g:image_link>` : ""}
    ${p.image_links.slice(1, 10).map((u) => `<g:additional_image_link>${esc(u)}</g:additional_image_link>`).join("")}
    <g:availability>${p.in_stock ? "in_stock" : "out_of_stock"}</g:availability>
    <g:price>${(p.old_price || p.price) * 10} IRR</g:price>
    ${p.old_price ? `<g:sale_price>${p.price * 10} IRR</g:sale_price>` : ""}
    <g:condition>new</g:condition>
    <g:brand>${esc(s.store_name)}</g:brand>
    <g:mpn>${esc(p.sku || p.id)}</g:mpn>
    <g:product_type>${esc(p.category_name || "")}</g:product_type>
    <g:google_product_category>188</g:google_product_category>
  </item>`)
    .join("\n");
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${esc(s.store_name)}</title>
  <link>${siteUrl()}</link>
  <description>${esc(s.store_tagline)}</description>
${items}
</channel>
</rss>`);
}));

// ---------------- CSV ----------------
r.get("/feeds/products.csv", ah(async (req, res) => {
  const s = await getSettings();
  if (s.google_feed_enabled !== "1") return res.status(404).end();
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["شناسه", "کد کالا", "عنوان", "دسته", "عیار", "وزن (گرم)", "قیمت (تومان)", "قیمت قبل (تومان)", "موجودی", "لینک", "عکس"];
  const rows = (await feedProducts()).map((p) => [p.id, p.sku, p.title, p.category_name, p.karat, p.weight, p.price, p.old_price || "", p.stock, p.url, p.image_links[0] || ""]);
  res.type("text/csv; charset=utf-8").send("﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\n"));
}));

// ---------------- سایت‌مپ و robots ----------------
r.get("/sitemap.xml", ah(async (req, res) => {
  const base = siteUrl();
  const prods = await feedProducts();
  const cats = await many("category", { active: 1 }, { projection: { slug: 1 } });
  const urls = [
    `${base}/`, `${base}/shop`,
    ...cats.map((c) => `${base}/shop?category=${encodeURIComponent(c.slug)}`),
    ...prods.map((p) => p.url),
  ];
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}
</urlset>`);
}));
r.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /checkout\nDisallow: /account\nSitemap: ${siteUrl()}/sitemap.xml\n`);
});

export default r;
