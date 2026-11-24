import crypto from "node:crypto";
import { raw, one, many, insert, update, updateMany, now } from "./db.js";
import { getSettings, num } from "./settings.js";
import { priceProduct } from "./pricing.js";

export const STATUSES = {
  pending_payment: "در انتظار پرداخت",
  awaiting_confirmation: "در انتظار تأیید پرداخت",
  paid: "پرداخت‌شده",
  processing: "در حال آماده‌سازی",
  shipped: "ارسال شد",
  ready_pickup: "آماده‌ی تحویل حضوری",
  delivered: "تحویل شد",
  canceled: "لغو شد",
  failed: "پرداخت ناموفق",
};
// وضعیت‌هایی که موجودی انبار ازشون کم شده
export const STOCK_TAKEN = ["awaiting_confirmation", "paid", "processing", "shipped", "ready_pickup", "delivered"];
export const PAID_STATUSES = ["paid", "processing", "shipped", "ready_pickup", "delivered"];

export class OrderError extends Error {}

/**
 * محاسبه‌ی قیمت سبد سمت سرور (قیمت از مرورگر قبول نمی‌شه)
 * items: [{ product_id, qty }]
 */
export async function quote(items, delivery = "post", s) {
  s ??= await getSettings();
  if (!Array.isArray(items) || !items.length) throw new OrderError("سبد خرید خالی است.");
  const lines = [];
  const issues = [];
  for (const it of items.slice(0, 50)) {
    const qty = Math.max(1, Math.min(20, Math.floor(Number(it.qty) || 1)));
    const p = await one("product", { id: Number(it.product_id) });
    if (!p || !p.active) {
      issues.push({ product_id: Number(it.product_id), message: "این محصول دیگر موجود نیست." });
      continue;
    }
    if (p.stock < qty) {
      issues.push({ product_id: p.id, message: p.stock > 0 ? `فقط ${p.stock} عدد از «${p.title}» موجود است.` : `«${p.title}» ناموجود شد.` });
      if (p.stock <= 0) continue;
    }
    const q = Math.min(qty, p.stock);
    const pr = priceProduct(p, s);
    lines.push({ product_id: p.id, title: p.title, slug: p.slug, karat: p.karat, weight: p.weight, qty: q, unit_price: pr.price, line_total: pr.price * q, breakdown: pr.breakdown });
  }
  const subtotal = lines.reduce((a, l) => a + l.line_total, 0);
  const freeOver = num(s.free_shipping_over);
  const shipping = delivery === "pickup" || !lines.length || (freeOver > 0 && subtotal >= freeOver) ? 0 : num(s.shipping_cost);
  return { lines, issues, subtotal, shipping, total: subtotal + shipping, gold_rate: num(s.gold_rate_18), delivery };
}

async function newCode() {
  for (;;) {
    const code = String(crypto.randomInt(10_000_000, 99_999_999));
    if (!(await one("order", { code }, { projection: { id: 1 } }))) return code;
  }
}

const clean = (v, max = 300) => String(v ?? "").trim().slice(0, max);
export const normalizePhone = (p) =>
  String(p || "")
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/\D/g, "")
    .replace(/^98/, "0")
    .replace(/^9/, "09");

export async function createOrder(body, customer) {
  const s = await getSettings();
  const delivery = body.delivery === "pickup" && s.pickup_enabled === "1" ? "pickup" : "post";
  const q = await quote(body.items, delivery, s);
  if (q.issues.length) throw Object.assign(new OrderError("بعضی از اقلام سبد تغییر کرده‌اند؛ سبد را بررسی کنید."), { issues: q.issues });
  const name = clean(body.name, 80);
  const phone = normalizePhone(body.phone);
  if (name.length < 2) throw new OrderError("نام و نام خانوادگی را وارد کنید.");
  if (!/^09\d{9}$/.test(phone)) throw new OrderError("شماره موبایل معتبر نیست.");
  const addr = { province: clean(body.province, 40), city: clean(body.city, 40), address: clean(body.address, 400), postal_code: clean(body.postal_code, 12).replace(/\D/g, "") };
  if (delivery === "post") {
    if (!addr.city || addr.address.length < 8) throw new OrderError("شهر و نشانی کامل را وارد کنید.");
    if (addr.postal_code && addr.postal_code.length !== 10) throw new OrderError("کد پستی باید ۱۰ رقم باشد.");
  }
  const t = now();
  const code = await newCode();
  await insert("order", {
    code, customer_id: customer?.id ?? null, name, phone, ...addr, note: clean(body.note, 500), delivery,
    subtotal: q.subtotal, shipping: q.shipping, total: q.total, status: "pending_payment", payment_method: clean(body.payment_method, 20),
    payment_authority: null, payment_ref: null, payment_meta: null, tracking_code: "", admin_note: "", gold_rate: q.gold_rate,
    version: 1, created_at: t, updated_at: t, paid_at: null,
    // اقلام سفارش داخل خود سند سفارش ذخیره می‌شن
    items: q.lines.map((l, i) => ({ id: i + 1, product_id: l.product_id, title: l.title, karat: l.karat, weight: l.weight, unit_price: l.unit_price, qty: l.qty, breakdown: JSON.stringify(l.breakdown) })),
  });
  return getOrder(code);
}

export async function getOrder(code) {
  const o = await one("order", { code: String(code) });
  if (!o) return null;
  o.items ??= [];
  o.status_title = STATUSES[o.status] || o.status;
  return o;
}

/** کم کردن موجودی (اتمیک)؛ اگه موجودی کافی نباشه، آنچه کم شده برمی‌گرده و خطا می‌ده */
async function takeStock(order) {
  const taken = [];
  for (const it of order.items) {
    if (!it.product_id) continue;
    const r = await raw().updateOne(
      { t: "product", id: it.product_id, stock: { $gte: it.qty } },
      { $inc: { stock: -it.qty, sold_count: it.qty } },
    );
    if (!r.modifiedCount) {
      await returnStock({ items: taken });
      throw new OrderError(`موجودی «${it.title}» کافی نیست.`);
    }
    taken.push(it);
  }
}
async function returnStock(order) {
  for (const it of order.items) {
    if (!it.product_id) continue;
    await raw().updateOne({ t: "product", id: it.product_id }, [
      { $set: { stock: { $add: ["$stock", it.qty] }, sold_count: { $max: [0, { $subtract: ["$sold_count", it.qty] }] } } },
    ]);
  }
}

/** پرداخت آنلاین موفق شد */
export async function markPaid(code, ref, meta) {
  const o = await getOrder(code);
  if (!o) throw new OrderError("سفارش پیدا نشد.");
  if (STOCK_TAKEN.includes(o.status)) return o; // تکراری (مثلاً رفرش صفحه‌ی بازگشت)
  // تغییر وضعیت اتمیک: اگه دو درخواست هم‌زمان برسن فقط یکی موفق می‌شه و موجودی دوبار کم نمی‌شه
  const t = now();
  const claim = await raw().updateOne(
    { t: "order", id: o.id, status: { $nin: STOCK_TAKEN } },
    { $set: { status: "paid", payment_ref: ref, payment_meta: meta ? JSON.stringify(meta) : null, paid_at: t, updated_at: t }, $inc: { version: 1 } },
  );
  if (!claim.modifiedCount) return getOrder(code);
  try {
    await takeStock(o);
  } catch (e) {
    // پول گرفته شده ولی موجودی تموم شده: سفارش پرداخت‌شده ثبت می‌شه و مدیر باید پیگیری کنه
    const note = `هشدار: ${e.message} (هم‌زمان با پرداخت ناموجود شد؛ با مشتری تماس بگیرید)`;
    await update("order", { id: o.id }, { $set: { admin_note: `${o.admin_note || ""} ${note}`.trim() } });
  }
  return getOrder(code);
}

export async function markFailed(code, reason) {
  await update("order", { code: String(code), status: "pending_payment" }, { $set: { status: "failed", payment_meta: JSON.stringify({ error: reason }), updated_at: now() }, $inc: { version: 1 } });
  return getOrder(code);
}

/** سفارش پرداخت حضوری: موجودی رزرو می‌شه تا مدیر تأیید یا لغو کنه */
export async function markOffline(code) {
  const o = await getOrder(code);
  if (o.status !== "pending_payment") return o;
  const claim = await update("order", { id: o.id, status: "pending_payment" }, { $set: { status: "awaiting_confirmation", payment_method: "offline", updated_at: now() }, $inc: { version: 1 } });
  if (!claim.modifiedCount) return getOrder(code);
  try {
    await takeStock(o);
  } catch (e) {
    await update("order", { id: o.id }, { $set: { status: "pending_payment", payment_method: o.payment_method, updated_at: now() }, $inc: { version: 1 } });
    throw e;
  }
  return getOrder(code);
}

/** تغییر وضعیت از پنل؛ موجودی رو هماهنگ نگه می‌داره */
export async function changeStatus(o, next) {
  if (!(next in STATUSES)) throw new OrderError("وضعیت نامعتبر است.");
  const had = STOCK_TAKEN.includes(o.status);
  const will = STOCK_TAKEN.includes(next);
  if (!had && will) await takeStock(o);
  if (had && !will) await returnStock(o);
}

/** سفارش‌های پرداخت‌نشده‌ی قدیمی رو منقضی می‌کنه */
export async function expireStale() {
  const mins = num((await getSettings()).order_expire_minutes, 30);
  const cutoff = new Date(Date.now() - mins * 60_000).toISOString();
  await updateMany("order", { status: "pending_payment", created_at: { $lt: cutoff } }, { $set: { status: "failed", payment_meta: JSON.stringify({ error: "مهلت پرداخت تمام شد" }), updated_at: now() } });
}
