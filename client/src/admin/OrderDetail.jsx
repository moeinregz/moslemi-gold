import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAdmin } from "./AdminApp.jsx";
import { useAdminData, Loading, ErrorBox, Field } from "./ui.jsx";
import { toman, nf, faDate } from "../format.js";

export default function OrderDetail() {
  const { code } = useParams();
  const { call, notify, statuses } = useAdmin();
  const { data: o, loading, error, reload } = useAdminData(`/orders/${code}`);
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (o) setF({ status: o.status, tracking_code: o.tracking_code, admin_note: o.admin_note });
  }, [o]);
  if (loading || !f) return error ? <ErrorBox error={error} /> : <Loading />;

  async function save(e) {
    e.preventDefault();
    setErr(null);
    try {
      await call(`/orders/${code}`, { method: "PUT", body: { ...f, version: o.version } });
      notify("سفارش به‌روز شد ✓");
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  }
  let meta = {};
  try { meta = JSON.parse(o.payment_meta || "{}"); } catch {}

  return (
    <>
      <div className="row" style={{ marginBottom: 18 }}>
        <Link to="/admin/orders" className="btn btn-sm btn-outline">→ سفارش‌ها</Link>
        <h2 style={{ fontFamily: "Vazirmatn", fontSize: "1.1rem" }}>سفارش {o.code}</h2>
        <span className={`status-pill ${o.status}`}>{statuses[o.status]}</span>
        <span className="spacer" />
        <button className="btn btn-sm btn-outline" onClick={() => window.print()}>چاپ</button>
      </div>
      <div className="two-col" style={{ alignItems: "start" }}>
        <div>
          <div className="panel">
            <h3>اقلام</h3>
            <table className="tbl">
              <thead><tr><th>محصول</th><th>وزن/عیار</th><th>تعداد</th><th>فی</th><th>جمع</th></tr></thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.product_id ? <Link className="gold" to={`/admin/products/${i.product_id}`}>{i.title}</Link> : i.title}
                      {i.breakdown?.rate && <div className="small muted">طلا {toman(i.breakdown.gold)} + اجرت {toman(i.breakdown.labor)} + سود {toman(i.breakdown.profit)} + مالیات {toman(i.breakdown.tax)}</div>}
                    </td>
                    <td>{i.weight ? `${nf(i.weight)} گرم · ${nf(i.karat)}` : "—"}</td>
                    <td>{nf(i.qty)}</td><td>{toman(i.unit_price)}</td><td>{toman(i.unit_price * i.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ maxWidth: 320, marginInlineStart: "auto", marginTop: 12 }}>
              <div className="sum-row"><span>جمع</span><span>{toman(o.subtotal)}</span></div>
              <div className="sum-row"><span>ارسال</span><span>{toman(o.shipping)}</span></div>
              <div className="sum-row total"><span>مبلغ کل</span><span>{toman(o.total)}</span></div>
            </div>
            <p className="small muted">نرخ طلای ۱۸ عیار هنگام ثبت: {toman(o.gold_rate)}</p>
          </div>
          <div className="panel">
            <h3>مشتری و ارسال</h3>
            <div className="sum-row"><span>نام</span><span>{o.name}</span></div>
            <div className="sum-row"><span>موبایل</span><a className="gold ltr" href={`tel:${o.phone}`}>{o.phone}</a></div>
            <div className="sum-row"><span>روش تحویل</span><span>{o.delivery === "pickup" ? "حضوری در فروشگاه" : "ارسال پستی"}</span></div>
            {o.delivery === "post" && <p className="small" style={{ marginTop: 8 }}>{o.province} {o.city}، {o.address}{o.postal_code && ` — کد پستی: ${o.postal_code}`}</p>}
            {o.note && <div className="alert info mt">توضیح مشتری: {o.note}</div>}
          </div>
          <div className="panel">
            <h3>پرداخت</h3>
            <div className="sum-row"><span>روش</span><span>{o.payment_method || "—"}</span></div>
            <div className="sum-row"><span>کد پیگیری بانک</span><span className="ltr">{o.payment_ref || "—"}</span></div>
            {meta.card && <div className="sum-row"><span>کارت</span><span className="ltr">{meta.card}</span></div>}
            {meta.error && <div className="sum-row"><span>خطا</span><span>{meta.error}</span></div>}
            <div className="sum-row"><span>ثبت</span><span>{faDate(o.created_at)}</span></div>
            <div className="sum-row"><span>پرداخت</span><span>{faDate(o.paid_at)}</span></div>
          </div>
        </div>
        <div>
          <form className="panel" onSubmit={save}>
            <h3>رسیدگی</h3>
            <Field label="وضعیت" hint="با تغییر به «لغو شد» موجودی به انبار برمی‌گردد؛ برای پرداخت حضوری، بعد از دریافت پول «پرداخت‌شده» را بزنید.">
              <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="کد رهگیری مرسوله"><input className="input ltr" value={f.tracking_code} onChange={(e) => setF({ ...f, tracking_code: e.target.value })} /></Field>
            <Field label="یادداشت داخلی (مشتری نمی‌بیند)"><textarea className="input" value={f.admin_note} onChange={(e) => setF({ ...f, admin_note: e.target.value })} /></Field>
            {err && <div className="alert err">{err} {err.includes("تازه کنید") && <button type="button" className="btn btn-sm btn-outline" onClick={reload}>بارگذاری دوباره</button>}</div>}
            <button className="btn btn-gold">ذخیره</button>
          </form>
          <div className="panel">
            <h3>تاریخچه‌ی تغییرات</h3>
            {o.history.length ? o.history.map((h, i) => (
              <div key={i} className="small" style={{ padding: "8px 0", borderBottom: "1px solid var(--gold-line)" }}>
                <b className="gold">{h.username}</b> — {h.details}<div className="muted">{faDate(h.created_at)}</div>
              </div>
            )) : <p className="muted small">هنوز تغییری ثبت نشده.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
