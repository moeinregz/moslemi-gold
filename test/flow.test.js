// تست کامل جریان: پنل، چند کاربر، محصول و عکس، خرید و پرداخت، فیدها
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "msl-"));
process.env.DB_FILE = path.join(tmp, "test.db");
process.env.ADMIN_USERNAME = "owner";
process.env.ADMIN_PASSWORD = "owner-pass-123";
process.env.SITE_URL = "http://localhost:4999";
const { app } = await import("../server/index.js");
let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
after(() => { server.close(); });

function client() {
  let cookie = "";
  return async (p, { method = "GET", body, form, raw } = {}) => {
    const headers = { "X-Requested-With": "fetch", cookie };
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(base + p, { method, headers, body: form || (body ? JSON.stringify(body) : undefined), redirect: "manual" });
    const sc = res.headers.getSetCookie?.() || [];
    for (const c of sc) {
      const [kv] = c.split(";");
      const [k] = kv.split("=");
      cookie = [...cookie.split("; ").filter((x) => x && !x.startsWith(k + "=")), kv].join("; ");
    }
    if (raw) return res;
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
}

const owner = client();
const editor = client();
const support = client();
const shopper = client();
let productId;

test("ورود و نقش‌ها", async () => {
  assert.equal((await owner("/api/admin/login", { method: "POST", body: { username: "owner", password: "bad" } })).status, 400);
  assert.equal((await owner("/api/admin/login", { method: "POST", body: { username: "owner", password: "owner-pass-123" } })).status, 200);
  assert.equal((await owner("/api/admin/users", { method: "POST", body: { username: "ali", name: "علی", password: "ali-pass-123", role: "editor" } })).status, 200);
  assert.equal((await owner("/api/admin/users", { method: "POST", body: { username: "sara", name: "سارا", password: "sara-pass-123", role: "support" } })).status, 200);
  assert.equal((await editor("/api/admin/login", { method: "POST", body: { username: "ali", password: "ali-pass-123" } })).status, 200);
  assert.equal((await support("/api/admin/login", { method: "POST", body: { username: "sara", password: "sara-pass-123" } })).status, 200);
  // هم‌زمان هر سه وارد هستن
  assert.equal((await owner("/api/admin/me")).data.me.username, "owner");
  assert.equal((await editor("/api/admin/me")).data.me.username, "ali");
  // دسترسی‌ها
  assert.equal((await editor("/api/admin/users")).status, 403);
  assert.equal((await support("/api/admin/products")).status, 403);
  assert.equal((await support("/api/admin/orders")).status, 200);
  // بدون هدر CSRF رد می‌شه
  const r = await fetch(base + "/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(r.status, 403);
});

test("محصول، عکس و قفل هم‌زمانی", async () => {
  const c = await editor("/api/admin/products", { method: "POST", body: { title: "انگشتر تست", category_id: 1, karat: 18, weight: 2, labor_percent: 20, profit_percent: 7, stock: 2, active: 1 } });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  productId = c.data.id;
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const form = new FormData();
  form.append("images", new Blob([png], { type: "image/png" }), "a.png");
  form.append("images", new Blob([Buffer.from("not an image")], { type: "image/png" }), "fake.png");
  const up = await editor(`/api/admin/products/${productId}/images`, { method: "POST", form });
  assert.equal(up.status, 200);
  assert.equal(up.data.images.length, 1);
  assert.ok(up.data.warning);
  const img = await fetch(base + up.data.images[0].url);
  assert.equal(img.status, 200);
  // دو نفر هم‌زمان یک محصول رو ویرایش می‌کنن
  const v = c.data.version;
  assert.equal((await owner(`/api/admin/products/${productId}`, { method: "PUT", body: { ...c.data, stock: 3, version: v } })).status, 200);
  const clash = await editor(`/api/admin/products/${productId}`, { method: "PUT", body: { ...c.data, title: "نام دیگر", version: v } });
  assert.equal(clash.status, 409);
});

test("نرخ طلا روی قیمت اثر داره", async () => {
  const before = (await shopper(`/api/products?q=${encodeURIComponent("انگشتر تست")}`)).data[0].price;
  assert.equal((await editor("/api/admin/gold", { method: "PUT", body: { gold_rate_18: 5000000, vat_percent: 10, ticker_extra: "" } })).status, 200);
  const p = (await shopper(`/api/products?q=${encodeURIComponent("انگشتر تست")}`)).data[0];
  assert.notEqual(before, p.price);
  // 2g × 5,000,000 = 10M ; اجرت 2M ; سود 0.84M ; مالیات 0.284M
  assert.equal(p.price, 13124000);
});

test("خرید با درگاه آزمایشی و کم شدن موجودی", async () => {
  const q = await shopper("/api/quote", { method: "POST", body: { items: [{ product_id: productId, qty: 1 }] } });
  assert.equal(q.data.total, 13124000 + 150000);
  const bad = await shopper("/api/checkout", { method: "POST", body: { items: [{ product_id: productId, qty: 1 }], name: "رضا", phone: "123", city: "کرج", address: "خیابان اول پلاک ۱", payment_method: "mock" } });
  assert.equal(bad.status, 400);
  const ck = await shopper("/api/checkout", { method: "POST", body: { items: [{ product_id: productId, qty: 1 }], name: "رضا", phone: "۰۹۱۲۱۲۳۴۵۶۷", city: "کرج", address: "خیابان اول پلاک ۱", payment_method: "mock" } });
  assert.equal(ck.status, 200, JSON.stringify(ck.data));
  const u = new URL(ck.data.redirect, base);
  const cb = new URL(u.searchParams.get("cb"));
  const res = await shopper(`${cb.pathname}${cb.search}&status=ok&authority=${encodeURIComponent(u.searchParams.get("authority"))}`, { raw: true });
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location"), /result=ok/);
  const o = await shopper(`/api/orders/${ck.data.code}?phone=09121234567`);
  assert.equal(o.data.status, "paid");
  assert.equal(o.data.admin_note, undefined);
  const p = (await owner(`/api/admin/products/${productId}`)).data;
  assert.equal(p.stock, 2);
  assert.equal(p.sold_count, 1);
  // کسی بدون موبایل درست نمی‌تونه سفارش رو ببینه
  assert.equal((await client()(`/api/orders/${ck.data.code}?phone=09120000000`)).status, 404);
  // پشتیبان وضعیت رو عوض می‌کنه؛ لغو = برگشت موجودی
  const od = (await support(`/api/admin/orders/${ck.data.code}`)).data;
  assert.equal((await support(`/api/admin/orders/${ck.data.code}`, { method: "PUT", body: { status: "canceled", version: od.version } })).status, 200);
  assert.equal((await owner(`/api/admin/products/${productId}`)).data.stock, 3);
  assert.ok((await owner("/api/admin/logs")).data.some((l) => l.username.includes("سارا") && l.action === "ویرایش سفارش"));
});

test("پرداخت حضوری و مشتری", async () => {
  assert.equal((await shopper("/api/account/register", { method: "POST", body: { phone: "09121234567", name: "رضا", password: "secret1" } })).status, 200);
  const me = await shopper("/api/account/me");
  assert.equal(me.data.orders.length, 1); // سفارش مهمان قبلی وصل شد
  const ck = await shopper("/api/checkout", { method: "POST", body: { items: [{ product_id: productId, qty: 1 }], name: "رضا", phone: "09121234567", delivery: "pickup", payment_method: "offline" } });
  assert.equal(ck.status, 200, JSON.stringify(ck.data));
  assert.equal((await shopper(`/api/orders/${ck.data.code}`)).data.status, "awaiting_confirmation");
});

test("فیدها و متاتگ", async () => {
  const t = await (await fetch(base + "/torob/products")).json();
  assert.equal(t.api_version, "torob_api_v3");
  const item = t.products.find((p) => p.page_unique === String(productId));
  assert.equal(item.availability, "instock");
  assert.ok(item.image_links[0].startsWith("http://localhost:4999/uploads/"));
  assert.equal((await owner("/api/admin/channels/token/torob", { method: "POST" })).status, 200);
  assert.equal((await fetch(base + "/torob/products")).status, 401);
  assert.ok((await (await fetch(base + "/feeds/products.xml")).text()).includes("<g:price>"));
  assert.ok((await (await fetch(base + "/emalls/products")).json()).success);
  assert.ok((await (await fetch(base + "/sitemap.xml")).text()).includes("/product/"));
});

test("مدیر کل آخر قابل حذف نیست", async () => {
  const users = (await owner("/api/admin/users")).data;
  const me = users.find((u) => u.username === "owner");
  assert.equal((await owner(`/api/admin/users/${me.id}`, { method: "PUT", body: { ...me, role: "manager" } })).status, 400);
  const ali = users.find((u) => u.username === "ali");
  assert.equal((await owner(`/api/admin/users/${ali.id}`, { method: "PUT", body: { ...ali, active: 0 } })).status, 200);
  assert.equal((await editor("/api/admin/me")).status, 401); // نشست علی بسته شد
});
