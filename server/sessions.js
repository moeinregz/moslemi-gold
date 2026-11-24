import crypto from "node:crypto";
import { one, insert, update, remove, removeMany, now } from "./db.js";
import { parseCookies, setCookie, permsOf, ROLES } from "./auth.js";

const COOKIE = { admin: "msl_admin", customer: "msl_user" };
const TTL = { admin: 12 * 3600, customer: 30 * 86400 }; // ثانیه

export async function createSession(req, res, kind, subjectId) {
  const token = crypto.randomBytes(32).toString("hex");
  const t = new Date();
  const exp = new Date(t.getTime() + TTL[kind] * 1000);
  await insert("session", {
    token, kind, subject_id: subjectId, created_at: t.toISOString(), last_seen: t.toISOString(), expires_at: exp.toISOString(), exp,
    ip: req.ip, ua: String(req.headers["user-agent"] || "").slice(0, 200),
  });
  setCookie(res, COOKIE[kind], token, TTL[kind]);
}

export async function destroySession(req, res, kind) {
  const token = parseCookies(req)[COOKIE[kind]];
  if (token) await remove("session", { token });
  setCookie(res, COOKIE[kind], "", 0);
}

/** همه‌ی نشست‌های یک کاربر به جز (اختیاری) نشست فعلی رو می‌بنده */
export function killSessions(kind, subjectId, exceptToken) {
  return removeMany("session", { kind, subject_id: subjectId, token: { $ne: exceptToken || "" } });
}

async function lookup(req, kind) {
  const token = parseCookies(req)[COOKIE[kind]];
  if (!token) return null;
  const s = await one("session", { token, kind });
  if (!s) return null;
  if (s.expires_at < now()) {
    await remove("session", { token });
    return null;
  }
  // تمدید کشویی (هر ۵ دقیقه یک بار بنویس)
  if (Date.now() - Date.parse(s.last_seen) > 5 * 60_000) {
    const exp = new Date(Date.now() + TTL[kind] * 1000);
    await update("session", { token }, { $set: { last_seen: now(), expires_at: exp.toISOString(), exp } });
  }
  return s;
}

export async function currentAdmin(req) {
  const s = await lookup(req, "admin");
  if (!s) return null;
  const u = await one("user", { id: s.subject_id }, { projection: { id: 1, username: 1, name: 1, role: 1, perms: 1, active: 1 } });
  if (!u || !u.active) return null;
  return { ...u, token: s.token, permissions: permsOf(u), role_title: ROLES[u.role]?.title || u.role };
}

export async function currentCustomer(req) {
  const s = await lookup(req, "customer");
  if (!s) return null;
  return (await one("customer", { id: s.subject_id }, { projection: { id: 1, phone: 1, name: 1, province: 1, city: 1, address: 1, postal_code: 1 } })) || null;
}

/** میدل‌ور: فقط کاربر پنل با یکی از دسترسی‌های داده‌شده */
export function requireAdmin(...perms) {
  return async (req, res, next) => {
    try {
      const u = await currentAdmin(req);
      if (!u) return res.status(401).json({ error: "وارد پنل نشده‌اید یا نشست شما تمام شده." });
      if (perms.length && !perms.some((p) => u.permissions.includes(p))) return res.status(403).json({ error: "دسترسی به این بخش را ندارید." });
      req.admin = u;
      next();
    } catch (e) {
      next(e);
    }
  };
}

export async function log(req, action, entity = "", entityId = "", details = "") {
  const u = req.admin;
  await insert("log", {
    user_id: u?.id ?? null, username: u ? `${u.name} (${u.username})` : "سیستم", action, entity,
    entity_id: String(entityId ?? ""), details: typeof details === "string" ? details : JSON.stringify(details), created_at: now(),
  });
}
