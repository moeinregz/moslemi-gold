const fa = new Intl.NumberFormat("fa-IR");
export const toman = (n) => `${fa.format(Math.round(Number(n) || 0))} تومان`;
export const nf = (n) => fa.format(Number(n) || 0);
export const faDigits = (s) => String(s ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
export const enDigits = (s) => String(s ?? "").replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)).replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c));
export function faDate(iso, withTime = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" }) + (withTime ? ` ${d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}` : "");
}
export function ago(iso) {
  if (!iso) return "—";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "همین الان";
  if (m < 60) return `${nf(m)} دقیقه پیش`;
  if (m < 1440) return `${nf(Math.round(m / 60))} ساعت پیش`;
  return faDate(iso, false);
}
