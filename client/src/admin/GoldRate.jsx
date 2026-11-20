import { useEffect, useState } from "react";
import { useAdmin } from "./AdminApp.jsx";
import { useAdminData, Loading, ErrorBox, Field } from "./ui.jsx";
import { toman, ago, enDigits } from "../format.js";

export default function GoldRate() {
  const { call, notify, can } = useAdmin();
  const { data, loading, error, reload } = useAdminData("/gold");
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (data) setF({ gold_rate_18: data.gold_rate_18, vat_percent: data.vat_percent, ticker_extra: data.ticker_extra });
  }, [data]);
  if (loading || !f) return error ? <ErrorBox error={error} /> : <Loading />;
  const r = Number(enDigits(f.gold_rate_18)) || 0;

  async function save(e) {
    e.preventDefault();
    setErr(null);
    try {
      await call("/gold", { method: "PUT", body: { ...f, gold_rate_18: enDigits(f.gold_rate_18) } });
      notify("نرخ ذخیره شد؛ قیمت همه‌ی محصولات به‌روز شد ✓");
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="two-col" style={{ alignItems: "start" }}>
      <form className="panel" onSubmit={save}>
        <h3>نرخ روز طلا</h3>
        <p className="small muted" style={{ marginBottom: 16 }}>آخرین به‌روزرسانی: {ago(data.gold_rate_updated_at)}. با تغییر نرخ، قیمت همه‌ی محصولاتی که «بر اساس نرخ روز» قیمت‌گذاری شده‌اند فوراً در سایت، سبد خرید و فید ترب عوض می‌شود.</p>
        <Field label="نرخ هر گرم طلای ۱۸ عیار (تومان)" hint={r ? toman(r) : ""}>
          <input className="input ltr" inputMode="numeric" required value={f.gold_rate_18} onChange={(e) => setF({ ...f, gold_rate_18: e.target.value })} disabled={!can("gold_rate")} style={{ fontSize: "1.2rem" }} />
        </Field>
        <Field label="مالیات بر ارزش افزوده (٪)" hint="روی اجرت و سود محاسبه می‌شود، نه روی خود طلا">
          <input className="input ltr" type="number" step="0.5" value={f.vat_percent} onChange={(e) => setF({ ...f, vat_percent: e.target.value })} disabled={!can("gold_rate")} />
        </Field>
        <Field label="قیمت سکه و موارد دیگر در نوار بالای سایت" hint="هر خط: عنوان|قیمت به تومان — مثلاً: سکه بهار آزادی|58200000">
          <textarea className="input ltr" rows={5} value={f.ticker_extra} onChange={(e) => setF({ ...f, ticker_extra: e.target.value })} disabled={!can("gold_rate")} />
        </Field>
        {err && <div className="alert err">{err}</div>}
        {can("gold_rate") && <button className="btn btn-gold">ذخیره و اعمال روی همه‌ی قیمت‌ها</button>}
      </form>
      <div className="panel">
        <h3>نرخ‌های محاسبه‌شده</h3>
        {[24, 21, 18, 17].map((k) => (
          <div className="sum-row" key={k}><span>هر گرم {k} عیار</span><span>{toman(Math.round((r * (k / 24)) / 0.75))}</span></div>
        ))}
        <div className="sum-row"><span>مثقال (۴٫۶۰۸ گرم ۱۷ عیار)</span><span>{toman(Math.round(r * 4.3318 / 1000) * 1000)}</span></div>
        <h3 style={{ marginTop: 24 }}>نوار قیمت فعلی سایت</h3>
        {data.ticker.map((t) => <div className="sum-row" key={t.label}><span>{t.label}</span><span>{toman(t.value)}</span></div>)}
      </div>
    </div>
  );
}
