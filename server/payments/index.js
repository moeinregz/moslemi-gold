import { zarinpal } from "./zarinpal.js";
import { zibal } from "./zibal.js";

import { toRial, postJson } from "./util.js";
export { toRial, postJson };

/** درگاه آزمایشی: بدون پول واقعی، فقط برای تست جریان خرید. قبل از فروش واقعی خاموشش کن. */
const mock = {
  id: "mock",
  title: "درگاه آزمایشی",
  note: "فقط برای تست؛ پول واقعی جابه‌جا نمی‌شه",
  enabled: (s) => s.mock_enabled === "1",
  async start(order, s, callbackUrl) {
    const authority = `MOCK-${order.code}-${Date.now()}`;
    return { ok: true, authority, url: `/pay/mock?order=${encodeURIComponent(order.code)}&authority=${encodeURIComponent(authority)}&cb=${encodeURIComponent(callbackUrl)}` };
  },
  async verify(order, params) {
    if (params.status !== "ok") return { ok: false, error: "پرداخت آزمایشی لغو شد." };
    if (params.authority !== order.payment_authority) return { ok: false, error: "شناسه‌ی پرداخت نامعتبر است." };
    return { ok: true, ref: `TEST-${Math.floor(Math.random() * 1e8)}` };
  },
};

export const GATEWAYS = [zarinpal, zibal, mock];
export const gateway = (id) => GATEWAYS.find((g) => g.id === id);

export function enabledMethods(s) {
  const list = GATEWAYS.filter((g) => g.enabled(s)).map((g) => ({ id: g.id, title: g.title, note: g.note, online: true }));
  if (s.offline_enabled === "1") list.push({ id: "offline", title: "پرداخت حضوری / کارت‌به‌کارت", note: s.offline_note, online: false });
  return list;
}
