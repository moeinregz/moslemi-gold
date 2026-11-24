import express from "express";
import fs from "node:fs";
import path from "node:path";
import { ROOT, PORT, IS_PROD, siteUrl } from "./config.js";
import { initDb, ping, UPLOAD_DIR } from "./db.js";
import { getSettings } from "./settings.js";
import { getPublic } from "./catalog.js";
import publicApi from "./routes/public.js";
import adminApi from "./routes/admin.js";
import feeds from "./channels/feeds.js";

const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, "server", "index.js");
try {
  await initDb(); // اتصال به MongoDB Atlas، ساخت ایندکس‌ها و داده‌ی اولیه
  console.log("✓ MongoDB Atlas وصل شد");
} catch (e) {
  console.error("✗ اتصال به MongoDB برقرار نشد:", e.message);
  console.error("  بررسی کنید: ۱) مقادیر MONGODB_* در .env  ۲) در Atlas بخش Network Access آی‌پی سرور مجاز باشد  ۳) نام کاربری/رمز درست باشد");
  if (isMain) process.exit(1);
  throw e;
}

export const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || true);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// محافظت CSRF: درخواست‌های تغییردهنده به API باید از fetch خود سایت بیان (هدر سفارشی).
// بازگشت درگاه پرداخت استثناست چون از سایت بانک POST می‌شه.
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.path.startsWith("/payment/callback/")) return next();
  if (req.get("x-requested-with") !== "fetch") return res.status(403).json({ error: "درخواست نامعتبر" });
  next();
});

app.get("/api/health", async (req, res) => {
  try {
    await ping();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d", immutable: true, fallthrough: false }));
app.use("/api/admin", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
}, adminApi);
app.use("/api", publicApi);
app.use("/api", (req, res) => res.status(404).json({ error: "مسیر پیدا نشد." }));
app.use(feeds);

// ---------------- صفحات React ----------------
const DIST = path.join(ROOT, "dist");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * متاتگ‌ها سمت سرور به HTML اضافه می‌شن تا ترب، گوگل و شبکه‌های اجتماعی بدون اجرای جاوااسکریپت
 * عنوان، قیمت و موجودی هر محصول رو ببینن.
 */
async function headFor(req) {
  const s = await getSettings();
  const base = siteUrl();
  const m = req.path.match(/^\/product\/([^/]+)\/?$/);
  if (m) {
    const p = await getPublic(decodeURIComponent(m[1]));
    if (p) {
      const url = `${base}/product/${encodeURIComponent(p.slug)}`;
      const img = p.images[0] ? base + p.images[0].url : "";
      const desc = p.short_desc || `${p.title} - طلای ${p.karat} عیار، ${p.weight} گرم`;
      const ld = {
        "@context": "https://schema.org", "@type": "Product", name: p.title, sku: p.sku || String(p.id), description: desc,
        image: p.images.map((i) => base + i.url), brand: { "@type": "Brand", name: s.store_name },
        offers: { "@type": "Offer", url, priceCurrency: "IRR", price: p.price * 10, availability: `https://schema.org/${p.in_stock ? "InStock" : "OutOfStock"}` },
      };
      return { status: 200, head: `<title>${esc(p.title)} | ${esc(s.store_name)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="product"><meta property="og:title" content="${esc(p.title)}"><meta property="og:url" content="${esc(url)}">
${img ? `<meta property="og:image" content="${esc(img)}">` : ""}
<meta name="product_id" content="${p.id}">
<meta name="product_name" content="${esc(p.title)}">
<meta name="product_price" content="${p.in_stock ? p.price : 0}">
<meta name="product_old_price" content="${p.old_price || ""}">
<meta name="availability" content="${p.in_stock ? "instock" : "outofstock"}">
<meta name="guarantee" content="${esc(p.guarantee)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` };
    }
    return { status: 404, head: `<title>محصول پیدا نشد | ${esc(s.store_name)}</title><meta name="robots" content="noindex">` };
  }
  const noindex = /^\/(admin|checkout|account|cart|order|pay)/.test(req.path) ? `<meta name="robots" content="noindex">` : "";
  return { status: 200, head: `<title>${esc(s.store_name)} | ${esc(s.store_tagline)}</title>
<meta name="description" content="${esc(`${s.store_name}؛ فروش آنلاین طلا و جواهر با عیار تضمینی، قیمت به نرخ روز و ضمانت بازخرید.`)}">
<meta property="og:title" content="${esc(s.store_name)}">${noindex}` };
}

if (IS_PROD || fs.existsSync(path.join(DIST, "index.html"))) {
  // قالب HTML با هر build جدید دوباره خونده می‌شه (بدون نیاز به ری‌استارت)
  let cache = { mtime: 0, html: "" };
  const template = () => {
    const file = path.join(DIST, "index.html");
    const m = fs.statSync(file).mtimeMs;
    if (m !== cache.mtime) cache = { mtime: m, html: fs.readFileSync(file, "utf8") };
    return cache.html;
  };
  app.use("/assets", express.static(path.join(DIST, "assets"), { maxAge: "1y", immutable: true, fallthrough: false }));
  app.use(express.static(DIST, { index: false, maxAge: "1d" }));
  app.get("*", async (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-cache");
      const html = template();
      const { status, head } = await headFor(req);
      res.status(status).type("html").send(html.replace("<!--app-head-->", head));
    } catch (e) {
      next(e);
    }
  });
} else {
  app.get("/", (req, res) => res.send("API در حال اجراست. برای رابط کاربری: npm run dev (پورت 5173) یا npm run build."));
}

app.use((err, req, res, next) => {
  if (err.status === 404 || err.statusCode === 404) return res.status(404).end();
  console.error(err);
  res.status(500).json({ error: "خطای داخلی سرور" });
});

if (isMain) {
  const name = (await getSettings()).store_name;
  app.listen(PORT, () => console.log(`✓ ${name} روی http://localhost:${PORT}  (SITE_URL=${siteUrl()})`));
}
