import { postJson, toRial } from "./util.js";

/**
 * زرین‌پال — API نسخه‌ی ۴
 * https://www.zarinpal.com/docs/paymentGateway/
 * request → StartPay/{authority} → بازگشت با ?Authority=…&Status=OK → verify
 */
const host = (s) => (s.zarinpal_sandbox === "1" ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com");

export const zarinpal = {
  id: "zarinpal",
  title: "پرداخت آنلاین (زرین‌پال)",
  note: "همه‌ی کارت‌های عضو شتاب",
  enabled: (s) => s.zarinpal_enabled === "1" && !!s.zarinpal_merchant,
  async start(order, s, callbackUrl) {
    try {
      const { json } = await postJson(`${host(s)}/pg/v4/payment/request.json`, {
        merchant_id: s.zarinpal_merchant,
        amount: toRial(order.total),
        currency: "IRR",
        callback_url: callbackUrl,
        description: `سفارش ${order.code} - ${s.store_name}`,
        metadata: { mobile: order.phone, order_id: order.code },
      });
      const d = json?.data;
      if (d?.code === 100 && d.authority) return { ok: true, authority: d.authority, url: `${host(s)}/pg/StartPay/${d.authority}` };
      return { ok: false, error: `خطای زرین‌پال: ${JSON.stringify(json?.errors || json)}` };
    } catch {
      return { ok: false, error: "ارتباط با زرین‌پال برقرار نشد." };
    }
  },
  async verify(order, params, s) {
    if (params.Status !== "OK") return { ok: false, error: "پرداخت لغو شد یا ناموفق بود." };
    if (params.Authority !== order.payment_authority) return { ok: false, error: "شناسه‌ی پرداخت با سفارش نمی‌خواند." };
    try {
      const { json } = await postJson(`${host(s)}/pg/v4/payment/verify.json`, {
        merchant_id: s.zarinpal_merchant,
        amount: toRial(order.total),
        authority: order.payment_authority,
      });
      const d = json?.data;
      if (d && (d.code === 100 || d.code === 101)) return { ok: true, ref: String(d.ref_id), meta: { card: d.card_pan } };
      return { ok: false, error: `تأیید پرداخت ناموفق بود (${JSON.stringify(json?.errors || d)})` };
    } catch {
      return { ok: false, error: "ارتباط با زرین‌پال برای تأیید برقرار نشد." };
    }
  },
  async test(s, callbackUrl) {
    try {
      const { json } = await postJson(`${host(s)}/pg/v4/payment/request.json`, {
        merchant_id: s.zarinpal_merchant, amount: 10000, currency: "IRR", callback_url: callbackUrl, description: "تست اتصال",
      });
      if (json?.data?.code === 100) return { ok: true, message: `مرچنت کد معتبر است${s.zarinpal_sandbox === "1" ? " (حالت تست)" : ""}.` };
      return { ok: false, message: `زرین‌پال خطا داد: ${JSON.stringify(json?.errors || json)}` };
    } catch {
      return { ok: false, message: "ارتباط با زرین‌پال برقرار نشد." };
    }
  },
};
