import { postJson, toRial } from "./util.js";

/**
 * زیبال
 * https://help.zibal.ir/IPG/API/
 * POST /v1/request → result 100 + trackId → https://gateway.zibal.ir/start/{trackId}
 * بازگشت: ?success=1&trackId=…&orderId=…&status=… → POST /v1/verify (result 100 موفق، 201 قبلاً تأیید شده)
 * برای تست، مرچنت را «zibal» بگذارید.
 */
const API = "https://gateway.zibal.ir";

export const zibal = {
  id: "zibal",
  title: "پرداخت آنلاین (زیبال)",
  note: "همه‌ی کارت‌های عضو شتاب",
  enabled: (s) => s.zibal_enabled === "1" && !!s.zibal_merchant,
  async start(order, s, callbackUrl) {
    try {
      const { json } = await postJson(`${API}/v1/request`, {
        merchant: s.zibal_merchant,
        amount: toRial(order.total),
        callbackUrl,
        orderId: order.code,
        mobile: order.phone,
        description: `سفارش ${order.code}`,
      });
      if (json?.result === 100 && json.trackId) return { ok: true, authority: String(json.trackId), url: `${API}/start/${json.trackId}` };
      return { ok: false, error: `خطای زیبال: ${json?.message || json?.result || "نامشخص"}` };
    } catch {
      return { ok: false, error: "ارتباط با زیبال برقرار نشد." };
    }
  },
  async verify(order, params, s) {
    if (params.success !== "1") return { ok: false, error: "پرداخت لغو شد یا ناموفق بود." };
    if (String(params.trackId) !== String(order.payment_authority)) return { ok: false, error: "شناسه‌ی پرداخت با سفارش نمی‌خواند." };
    try {
      const { json } = await postJson(`${API}/v1/verify`, { merchant: s.zibal_merchant, trackId: Number(order.payment_authority) });
      if (json && (json.result === 100 || json.result === 201)) {
        if (json.amount && Number(json.amount) !== toRial(order.total)) return { ok: false, error: "مبلغ پرداخت‌شده با سفارش یکی نیست." };
        return { ok: true, ref: String(json.refNumber || json.trackId || order.payment_authority), meta: { card: json.cardNumber } };
      }
      return { ok: false, error: `تأیید پرداخت ناموفق بود (${json?.message || json?.result})` };
    } catch {
      return { ok: false, error: "ارتباط با زیبال برای تأیید برقرار نشد." };
    }
  },
  async test(s, callbackUrl) {
    try {
      const { json } = await postJson(`${API}/v1/request`, { merchant: s.zibal_merchant, amount: 10000, callbackUrl, orderId: `TEST-${Date.now()}` });
      if (json?.result === 100) return { ok: true, message: "مرچنت زیبال معتبر است." };
      return { ok: false, message: `زیبال خطا داد: ${json?.message || json?.result}` };
    } catch {
      return { ok: false, message: "ارتباط با زیبال برقرار نشد." };
    }
  },
};
