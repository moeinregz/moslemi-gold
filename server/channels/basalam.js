import fs from "node:fs";
import path from "node:path";
import { one, many, update, now, UPLOAD_DIR } from "../db.js";
import { getSettings } from "../settings.js";
import { getById } from "../catalog.js";

/**
 * اتصال به غرفه‌ی باسلام (API عمومی https://openapi.basalam.com/v1 — مطابق SDK رسمی)
 *  توکن: developers.basalam.com/panel/tokens → «توکن دسترسی شخصی» با دسترسی vendor.product.write و vendor.product.read
 *  ساخت:   POST  /v1/vendors/{vendor_id}/products
 *  ویرایش: PATCH /v1/products/{product_id}
 *  عکس:    POST  /v1/files  (multipart: file + file_type=product.photo)
 *  من:     GET   /v1/users/me → vendor.id
 *  وضعیت: 2976 منتشرشده، 3790 منتشرنشده
 * چون قیمت طلا روزانه عوض می‌شه، بعد از تغییر نرخ روز «همگام‌سازی همه» را بزنید.
 */
const PUBLISHED = 2976;
const UNPUBLISHED = 3790;

async function cfg() {
  const s = await getSettings();
  return {
    base: (s.basalam_base_url || "https://openapi.basalam.com").trim().replace(/\/+$/, "").replace(/\/v1$/, ""),
    token: (s.basalam_token || "").trim(),
    vendor: (s.basalam_vendor_id || "").trim(),
    category: (s.basalam_category_id || "").trim(),
    prepDays: Number(s.basalam_preparation_days || 2),
    mul: s.basalam_price_unit === "toman" ? 1 : 10,
  };
}
export const basalamReady = async () => {
  const c = await cfg();
  return !!(c.token && c.vendor && c.category);
};

async function api(method, url, body) {
  const c = await cfg();
  const res = await fetch(c.base + url, {
    method,
    headers: { Authorization: `Bearer ${c.token}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

function errText(j, status) {
  if (status === 401) return "توکن باسلام نامعتبر یا منقضی شده.";
  if (status === 403) return "توکن دسترسی vendor.product.write را ندارد یا غرفه مال شما نیست.";
  const m = j?.messages?.[0]?.message || j?.message || j?.detail || (j?.errors ? JSON.stringify(j.errors) : "");
  return m ? String(m) : `HTTP ${status}`;
}

async function uploadPhoto(filename) {
  const c = await cfg();
  const file = path.join(UPLOAD_DIR, path.basename(filename));
  if (!fs.existsSync(file)) return null;
  const ext = path.extname(file).toLowerCase();
  const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const form = new FormData();
  form.set("file", new Blob([fs.readFileSync(file)], { type }), path.basename(file));
  form.set("file_type", "product.photo");
  const res = await fetch(c.base + "/v1/files", { method: "POST", headers: { Authorization: `Bearer ${c.token}`, Accept: "application/json" }, body: form });
  const j = await res.json().catch(() => null);
  return res.ok && j?.id ? Number(j.id) : null;
}

export async function pushProduct(productId) {
  const c = await cfg();
  if (!(await basalamReady())) return { ok: false, message: "اول توکن، شناسه‌ی غرفه و شناسه‌ی دسته‌ی باسلام را در «کانال‌های فروش» وارد کنید." };
  const raw = await one("product", { id: Number(productId) });
  const p = await getById(productId);
  if (!raw || !p) return { ok: false, message: "محصول پیدا نشد." };
  const body = {
    name: p.title.slice(0, 120),
    brief: (p.short_desc || "").slice(0, 200) || undefined,
    description: [p.short_desc, p.description, `عیار ${p.karat} - وزن ${p.weight} گرم`, p.guarantee].filter(Boolean).join("\n\n"),
    category_id: Number(c.category),
    primary_price: p.price * c.mul,
    stock: Math.max(0, p.stock),
    weight: Math.max(1, Math.round(p.weight)),
    package_weight: Math.max(1, Math.round(p.weight)) + 100,
    preparation_days: c.prepDays,
    unit_type: 6304,
    unit_quantity: 1,
    status: raw.active && p.stock > 0 ? PUBLISHED : UNPUBLISHED,
  };
  let note = "";
  const main = p.images[0]?.filename;
  const [photoFor, photoId] = String(raw.basalam_photo || "").split("|");
  if (main) {
    if (photoFor === main && photoId) body.photo = Number(photoId);
    else {
      const id = await uploadPhoto(main).catch(() => null);
      if (id) {
        body.photo = id;
        await update("product", { id: p.id }, { $set: { basalam_photo: `${main}|${id}` } });
      } else note = " (آپلود عکس انجام نشد)";
    }
  }
  const isUpdate = !!raw.basalam_id;
  let r;
  try {
    r = isUpdate ? await api("PATCH", `/v1/products/${encodeURIComponent(raw.basalam_id)}`, body) : await api("POST", `/v1/vendors/${encodeURIComponent(c.vendor)}/products`, body);
  } catch {
    r = { ok: false, status: 0, json: { message: "ارتباط با باسلام برقرار نشد." } };
  }
  if (!r.ok) {
    const msg = `باسلام: ${errText(r.json, r.status)}`;
    await update("product", { id: p.id }, { $set: { basalam_error: msg } });
    return { ok: false, message: msg };
  }
  const id = String(r.json?.id ?? r.json?.data?.id ?? raw.basalam_id ?? "");
  await update("product", { id: p.id }, { $set: { ...(id ? { basalam_id: id } : {}), basalam_synced_at: now(), basalam_error: null } });
  return { ok: true, message: (isUpdate ? "در باسلام به‌روز شد." : "در غرفه‌ی باسلام ساخته شد.") + note };
}

export async function pushAll() {
  const ids = await many("product", { $or: [{ active: 1 }, { basalam_id: { $ne: null } }] }, { projection: { id: 1, title: 1 }, sort: { id: 1 } });
  let ok = 0, fail = 0;
  const errors = [];
  for (const { id, title } of ids) {
    const r = await pushProduct(id);
    if (r.ok) ok++;
    else {
      fail++;
      errors.push(`${title}: ${r.message}`);
      if (/توکن|دسترسی|ارتباط/.test(r.message)) break;
    }
  }
  return { ok, fail, errors: errors.slice(0, 10) };
}

export async function whoAmI() {
  if (!(await cfg()).token) return { ok: false, message: "توکن باسلام وارد نشده." };
  try {
    const r = await api("GET", "/v1/users/me");
    if (!r.ok) return { ok: false, message: errText(r.json, r.status) };
    const v = r.json?.vendor;
    if (!v?.id) return { ok: true, message: "توکن معتبر است ولی این حساب غرفه ندارد." };
    return { ok: true, vendorId: String(v.id), message: `اتصال برقرار است: غرفه‌ی «${v.title || v.name || v.id}» (شناسه ${v.id}).` };
  } catch {
    return { ok: false, message: "ارتباط با باسلام برقرار نشد." };
  }
}

export async function categories(query = "") {
  const r = await api("GET", "/v1/categories").catch(() => null);
  const out = [];
  const walk = (list, prefix) => {
    for (const c of list || []) {
      const p = prefix ? `${prefix} › ${c.title}` : c.title;
      out.push({ id: c.id, title: c.title, path: p });
      walk(c.children, p);
    }
  };
  walk(r?.json?.data || [], "");
  const q = String(query).trim();
  return (q ? out.filter((c) => c.path.includes(q)) : out).slice(0, 40);
}
