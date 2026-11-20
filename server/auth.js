import crypto from "node:crypto";
import { siteUrl } from "./config.js";

// ---------- رمز عبور (scrypt، بدون وابستگی native) ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return `s1$${salt.toString("hex")}$${hash.toString("hex")}`;
}
export function verifyPassword(pw, stored) {
  const [v, salt, hash] = String(stored || "").split("$");
  if (v !== "s1" || !salt || !hash) return false;
  const h = crypto.scryptSync(String(pw), Buffer.from(salt, "hex"), 64);
  const want = Buffer.from(hash, "hex");
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}

// ---------- نقش‌ها و دسترسی‌ها ----------
export const PERMISSIONS = {
  dashboard: "داشبورد و گزارش فروش",
  products: "محصولات و عکس‌ها",
  categories: "دسته‌بندی‌ها",
  gold_rate: "نرخ روز طلا",
  orders: "سفارش‌ها",
  customers: "مشتری‌ها",
  channels: "اتصال به ترب، باسلام و…",
  settings: "تنظیمات فروشگاه و درگاه پرداخت",
  users: "کاربران پنل",
  logs: "گزارش فعالیت کاربران",
};
export const ROLES = {
  owner: { title: "مدیر کل", perms: Object.keys(PERMISSIONS) },
  manager: { title: "مدیر فروشگاه", perms: ["dashboard", "products", "categories", "gold_rate", "orders", "customers", "channels", "logs"] },
  editor: { title: "کارشناس محصولات", perms: ["dashboard", "products", "categories", "gold_rate"] },
  support: { title: "پشتیبان سفارش‌ها", perms: ["dashboard", "orders", "customers"] },
  custom: { title: "سفارشی", perms: [] },
};
export function permsOf(user) {
  if (!user) return [];
  if (user.role === "custom") {
    try {
      return JSON.parse(user.perms || "[]").filter((p) => p in PERMISSIONS);
    } catch {
      return [];
    }
  }
  return ROLES[user.role]?.perms || [];
}

// ---------- کوکی ----------
export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function setCookie(res, name, value, maxAgeSec) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSec}`];
  // روی دامنه‌ی https کوکی فقط از https فرستاده می‌شه
  if (siteUrl().startsWith("https://")) parts.push("Secure");
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join("; ")]);
}

// ---------- محدودیت تلاش ورود ----------
const attempts = new Map();
export function tooManyAttempts(key) {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > 15 * 60_000) {
    attempts.delete(key);
    return false;
  }
  return a.count >= 8;
}
export function recordFail(key) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > 15 * 60_000) attempts.set(key, { first: Date.now(), count: 1 });
  else a.count++;
}
export const clearFails = (key) => attempts.delete(key);
