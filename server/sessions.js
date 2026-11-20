import crypto from "node:crypto";
import { db, now } from "./db.js";
import { parseCookies, setCookie, permsOf, ROLES } from "./auth.js";

const COOKIE = { admin: "msl_admin", customer: "msl_user" };
const TTL = { admin: 12 * 3600, customer: 30 * 86400 }; // ثانیه

export function createSession(req, res, kind, subjectId) {
  const token = crypto.randomBytes(32).toString("hex");
  const t = new Date();
  db().prepare("INSERT INTO sessions (token,kind,subject_id,created_at,last_seen,expires_at,ip,ua) VALUES (?,?,?,?,?,?,?,?)").run(
    token, kind, subjectId, t.toISOString(), t.toISOString(), new Date(t.getTime() + TTL[kind] * 1000).toISOString(),
    req.ip, String(req.headers["user-agent"] || "").slice(0, 200));
  setCookie(res, COOKIE[kind], token, TTL[kind]);
}

export function destroySession(req, res, kind) {
  const token = parseCookies(req)[COOKIE[kind]];
  if (token) db().prepare("DELETE FROM sessions WHERE token=?").run(token);
  setCookie(res, COOKIE[kind], "", 0);
}

/** همه‌ی نشست‌های یک کاربر به جز (اختیاری) نشست فعلی رو می‌بنده */
export function killSessions(kind, subjectId, exceptToken) {
  db().prepare("DELETE FROM sessions WHERE kind=? AND subject_id=? AND token != ?").run(kind, subjectId, exceptToken || "");
}

function lookup(req, kind) {
  const token = parseCookies(req)[COOKIE[kind]];
  if (!token) return null;
  const s = db().prepare("SELECT * FROM sessions WHERE token=? AND kind=?").get(token, kind);
  if (!s) return null;
  if (s.expires_at < now()) {
    db().prepare("DELETE FROM sessions WHERE token=?").run(token);
    return null;
  }
  // تمدید کشویی (هر ۵ دقیقه یک بار بنویس)
  if (Date.now() - Date.parse(s.last_seen) > 5 * 60_000) {
    const exp = new Date(Date.now() + TTL[kind] * 1000).toISOString();
    db().prepare("UPDATE sessions SET last_seen=?, expires_at=? WHERE token=?").run(now(), exp, token);
  }
  return s;
}

export function currentAdmin(req) {
  const s = lookup(req, "admin");
  if (!s) return null;
  const u = db().prepare("SELECT id,username,name,role,perms,active FROM users WHERE id=?").get(s.subject_id);
  if (!u || !u.active) return null;
  return { ...u, token: s.token, permissions: permsOf(u), role_title: ROLES[u.role]?.title || u.role };
}

export function currentCustomer(req) {
  const s = lookup(req, "customer");
  if (!s) return null;
  return db().prepare("SELECT id,phone,name,province,city,address,postal_code FROM customers WHERE id=?").get(s.subject_id) || null;
}

/** میدل‌ور: فقط کاربر پنل با یکی از دسترسی‌های داده‌شده */
export function requireAdmin(...perms) {
  return (req, res, next) => {
    const u = currentAdmin(req);
    if (!u) return res.status(401).json({ error: "وارد پنل نشده‌اید یا نشست شما تمام شده." });
    if (perms.length && !perms.some((p) => u.permissions.includes(p))) return res.status(403).json({ error: "دسترسی به این بخش را ندارید." });
    req.admin = u;
    next();
  };
}

export function log(req, action, entity = "", entityId = "", details = "") {
  const u = req.admin;
  db().prepare("INSERT INTO activity_log (user_id,username,action,entity,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?)").run(
    u?.id ?? null, u ? `${u.name} (${u.username})` : "سیستم", action, entity, String(entityId ?? ""), typeof details === "string" ? details : JSON.stringify(details), now());
}
