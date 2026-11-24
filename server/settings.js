import { raw, many, now } from "./db.js";

/** مقادیر پیش‌فرض همه‌ی تنظیمات. همه به‌صورت رشته ذخیره می‌شن. */
export const DEFAULTS = {
  store_name: "طلا فروشی مسلمی",
  store_tagline: "طلا و جواهر اصیل",
  store_phone: "۰۹۱۲۵۶۶۰۹۵۴",
  store_address: "کرج،شهرک ارم،جاده ملارد،خ گلستان یکم نبش کوچه بازار روز",
  store_hours: "شنبه تا پنجشنبه ۱۰ تا ۲۱",
  instagram: "",
  telegram: "",
  whatsapp: "",
  // نرخ روز طلا
  gold_rate_18: "4850000", // تومان برای هر گرم طلای ۱۸ عیار
  gold_rate_updated_at: "",
  vat_percent: "10", // مالیات بر ارزش افزوده روی (اجرت + سود)
  ticker_extra: "سکه بهار آزادی|58200000\nنیم سکه|30500000\nربع سکه|17800000",
  // ارسال
  shipping_cost: "150000",
  free_shipping_over: "50000000",
  pickup_enabled: "1",
  order_expire_minutes: "30",
  // درگاه‌ها
  zarinpal_enabled: "0", zarinpal_merchant: "", zarinpal_sandbox: "0",
  zibal_enabled: "0", zibal_merchant: "",
  mock_enabled: "1",
  offline_enabled: "1",
  offline_note: "پرداخت حضوری در فروشگاه یا کارت‌به‌کارت؛ کارشناس ما برای هماهنگی با شما تماس می‌گیره.",
  // کانال‌های فروش
  torob_enabled: "1", torob_token: "",
  emalls_enabled: "1", emalls_token: "",
  google_feed_enabled: "1",
  basalam_token: "", basalam_vendor_id: "", basalam_category_id: "", basalam_price_unit: "rial",
  basalam_preparation_days: "2", basalam_base_url: "https://openapi.basalam.com",
};

/** کلیدهایی که هیچ‌وقت به مرورگر مشتری فرستاده نمی‌شن */
export const SECRET_KEYS = ["zarinpal_merchant", "zibal_merchant", "torob_token", "emalls_token", "basalam_token"];

// تنظیمات تقریباً روی هر درخواستی خونده می‌شن؛ برای اینکه هر بار به Atlas سر نزنیم چند ثانیه کش می‌شن.
// با هر تغییر از همین سرور، کش فوراً پاک می‌شه.
const TTL_MS = 10_000;
let cache = null;
let cacheAt = 0;

export async function getSettings() {
  if (!cache || Date.now() - cacheAt > TTL_MS) {
    const rows = await many("setting");
    const s = { ...DEFAULTS };
    for (const r of rows) s[r.key] = r.value;
    cache = s;
    cacheAt = Date.now();
  }
  return { ...cache };
}

export async function setSettings(obj) {
  const ops = [];
  const put = (key, value) => ops.push({ updateOne: { filter: { t: "setting", key }, update: { $set: { value } }, upsert: true } });
  for (const [k, v] of Object.entries(obj)) {
    if (!(k in DEFAULTS)) continue;
    put(k, String(v ?? ""));
  }
  if ("gold_rate_18" in obj) put("gold_rate_updated_at", now());
  if (ops.length) await raw().bulkWrite(ops, { ordered: true });
  cache = null;
}

export const num = (v, d = 0) => {
  const n = Number(String(v ?? "").replace(/[,\s٬]/g, "").replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)));
  return Number.isFinite(n) ? n : d;
};
