import crypto from "node:crypto";
import { db, now, tx } from "./db.js";
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
const STOCK_TAKEN = ["awaiting_confirmation", "paid", "processing", "shipped", "ready_pickup", "delivered"];

export class OrderError extends Error {}

/**
 * محاسبه‌ی قیمت سبد سمت سرور (قیمت از مرورگر قبول نمی‌شه)
 * items: [{ product_id, qty }]
 */
export function quote(items, delivery = "post", s = getSettings()) {
  if (!Array.isArray(items) || !items.length) throw new OrderError("سبد خرید خالی است.");
  const lines = [];
  const issues = [];
  for (const it of items.slice(0, 50)) {
    const qty = Math.max(1, Math.min(20, Math.floor(Number(it.qty) || 1)));
    const p = db().prepare("SELECT * FROM products WHERE id = ?").get(Number(it.product_id));
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

function newCode() {
  for (;;) {
    const code = String(crypto.randomInt(10_000_000, 99_999_999));
    if (!db().prepare("SELECT 1 FROM orders WHERE code=?").get(code)) return code;
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

export function createOrder(body, customer) {
  const s = getSettings();
  const delivery = body.delivery === "pickup" && s.pickup_enabled === "1" ? "pickup" : "post";
  const q = quote(body.items, delivery, s);
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
  return tx(() => {
    const code = newCode();
    const r = db().prepare(`INSERT INTO orders (code,customer_id,name,phone,province,city,address,postal_code,note,delivery,subtotal,shipping,total,status,payment_method,gold_rate,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_payment',?,?,?,?)`).run(
      code, customer?.id ?? null, name, phone, addr.province, addr.city, addr.address, addr.postal_code, clean(body.note, 500), delivery,
      q.subtotal, q.shipping, q.total, clean(body.payment_method, 20), q.gold_rate, t, t);
    const ins = db().prepare("INSERT INTO order_items (order_id,product_id,title,karat,weight,unit_price,qty,breakdown) VALUES (?,?,?,?,?,?,?,?)");
    for (const l of q.lines) ins.run(r.lastInsertRowid, l.product_id, l.title, l.karat, l.weight, l.unit_price, l.qty, JSON.stringify(l.breakdown));
    return getOrder(code);
  });
}

export function getOrder(code) {
  const o = db().prepare("SELECT * FROM orders WHERE code=?").get(String(code));
  if (!o) return null;
  o.items = db().prepare("SELECT * FROM order_items WHERE order_id=?").all(o.id);
  o.status_title = STATUSES[o.status] || o.status;
  return o;
}

/** کم کردن موجودی؛ اگه موجودی کافی نباشه خطا */
function takeStock(order) {
  for (const it of order.items) {
    if (!it.product_id) continue;
    const r = db().prepare("UPDATE products SET stock = stock - ?, sold_count = sold_count + ? WHERE id = ? AND stock >= ?").run(it.qty, it.qty, it.product_id, it.qty);
    if (!r.changes) throw new OrderError(`موجودی «${it.title}» کافی نیست.`);
  }
}
function returnStock(order) {
  for (const it of order.items) {
    if (it.product_id) db().prepare("UPDATE products SET stock = stock + ?, sold_count = MAX(0, sold_count - ?) WHERE id = ?").run(it.qty, it.qty, it.product_id);
  }
}

/** پرداخت آنلاین موفق شد */
export function markPaid(code, ref, meta) {
  return tx(() => {
    const o = getOrder(code);
    if (!o) throw new OrderError("سفارش پیدا نشد.");
    if (STOCK_TAKEN.includes(o.status)) return o; // تکراری (مثلاً رفرش صفحه‌ی بازگشت)
    let note = "";
    try {
      takeStock(o);
    } catch (e) {
      // پول گرفته شده ولی موجودی تموم شده: سفارش پرداخت‌شده ثبت می‌شه و مدیر باید پیگیری کنه
      note = `هشدار: ${e.message} (هم‌زمان با پرداخت ناموجود شد؛ با مشتری تماس بگیرید)`;
    }
    db().prepare("UPDATE orders SET status='paid', payment_ref=?, payment_meta=?, paid_at=?, updated_at=?, version=version+1, admin_note=TRIM(admin_note || ' ' || ?) WHERE id=?")
      .run(ref, meta ? JSON.stringify(meta) : null, now(), now(), note, o.id);
    return getOrder(code);
  });
}

export function markFailed(code, reason) {
  db().prepare("UPDATE orders SET status='failed', payment_meta=?, updated_at=?, version=version+1 WHERE code=? AND status='pending_payment'").run(JSON.stringify({ error: reason }), now(), code);
  return getOrder(code);
}

/** سفارش پرداخت حضوری: موجودی رزرو می‌شه تا مدیر تأیید یا لغو کنه */
export function markOffline(code) {
  return tx(() => {
    const o = getOrder(code);
    if (o.status !== "pending_payment") return o;
    takeStock(o);
    db().prepare("UPDATE orders SET status='awaiting_confirmation', payment_method='offline', updated_at=?, version=version+1 WHERE id=?").run(now(), o.id);
    return getOrder(code);
  });
}

/** تغییر وضعیت از پنل؛ موجودی رو هماهنگ نگه می‌داره */
export function changeStatus(o, next) {
  if (!(next in STATUSES)) throw new OrderError("وضعیت نامعتبر است.");
  const had = STOCK_TAKEN.includes(o.status);
  const will = STOCK_TAKEN.includes(next);
  if (!had && will) takeStock(o);
  if (had && !will) returnStock(o);
}

/** سفارش‌های پرداخت‌نشده‌ی قدیمی رو منقضی می‌کنه */
export function expireStale() {
  const mins = num(getSettings().order_expire_minutes, 30);
  const cutoff = new Date(Date.now() - mins * 60_000).toISOString();
  db().prepare("UPDATE orders SET status='failed', payment_meta=?, updated_at=? WHERE status='pending_payment' AND created_at < ?").run(JSON.stringify({ error: "مهلت پرداخت تمام شد" }), now(), cutoff);
}
