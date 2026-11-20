import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSite } from "./context.jsx";
import { useApi } from "./hooks.js";
import { api } from "../api.js";
import { toman, nf, faDate, enDigits } from "../format.js";

export function OrderView() {
  const { code } = useParams();
  const [sp] = useSearchParams();
  const phone = sp.get("phone") || "";
  const result = sp.get("result");
  const { data: o, loading, error } = useApi(`/api/orders/${encodeURIComponent(code)}?phone=${encodeURIComponent(phone)}`);
  const { site } = useSite();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const nav = useNavigate();
  const methods = site?.payment_methods || [];
  const [pm, setPm] = useState("");

  if (loading) return <div className="page"><div className="loader" /></div>;
  if (error) return <div className="page"><div className="container empty"><p>{error.message}</p><Link to="/track" className="btn btn-outline mt">پیگیری سفارش</Link></div></div>;

  async function retry() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api(`/api/orders/${o.code}/retry`, { method: "POST", body: { phone: o.phone, payment_method: pm || methods[0]?.id } });
      if (/^https?:\/\//.test(r.redirect)) window.location.href = r.redirect;
      else nav(r.redirect);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const ok = ["paid", "processing", "shipped", "ready_pickup", "delivered"].includes(o.status);
  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 820 }}>
        {result === "ok" && ok && <div className="alert ok">پرداخت با موفقیت انجام شد. از خرید شما سپاسگزاریم ✓</div>}
        {o.status === "awaiting_confirmation" && <div className="alert info">سفارش ثبت شد. {site?.settings?.offline_note}</div>}
        {o.status === "failed" && <div className="alert err">پرداخت انجام نشد{o.payment_error ? `: ${o.payment_error}` : "."} اگر مبلغی از حساب شما کم شده، حداکثر تا ۷۲ ساعت به حساب برمی‌گردد.</div>}
        <div className="panel">
          <div className="row">
            <h1 className="page-title" style={{ margin: 0 }}>سفارش {o.code}</h1>
            <span className="spacer" />
            <span className={`status-pill ${o.status}`}>{o.status_title}</span>
          </div>
          <p className="muted small">{faDate(o.created_at)}</p>
          <div className="table-wrap mt">
            <table className="tbl">
              <thead><tr><th>محصول</th><th>وزن/عیار</th><th>تعداد</th><th>مبلغ</th></tr></thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id}><td>{i.title}</td><td>{i.weight ? `${nf(i.weight)} گرم · ${nf(i.karat)}` : "—"}</td><td>{nf(i.qty)}</td><td>{toman(i.unit_price * i.qty)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ maxWidth: 360, marginInlineStart: "auto", marginTop: 14 }}>
            <div className="sum-row"><span>جمع</span><span>{toman(o.subtotal)}</span></div>
            <div className="sum-row"><span>ارسال</span><span>{o.shipping ? toman(o.shipping) : "رایگان"}</span></div>
            <div className="sum-row total"><span>مبلغ کل</span><span>{toman(o.total)}</span></div>
          </div>
          <div className="grid2 mt small">
            <div><b className="gold">گیرنده</b><p className="muted">{o.name} — {o.phone}</p></div>
            <div><b className="gold">{o.delivery === "pickup" ? "تحویل حضوری" : "نشانی"}</b><p className="muted">{o.delivery === "pickup" ? site?.settings?.store_address : `${o.province} ${o.city}، ${o.address} ${o.postal_code ? `— کد پستی ${o.postal_code}` : ""}`}</p></div>
            {o.payment_ref && <div><b className="gold">کد پیگیری پرداخت</b><p className="muted">{o.payment_ref}</p></div>}
            {o.tracking_code && <div><b className="gold">کد رهگیری مرسوله</b><p className="muted">{o.tracking_code}</p></div>}
          </div>
          {o.status === "failed" && methods.some((m) => m.online) && (
            <div className="mt">
              <h3>پرداخت دوباره</h3>
              <p className="small muted">قیمت با نرخ امروز طلا دوباره محاسبه می‌شود.</p>
              {methods.map((m) => (
                <label key={m.id} className={`pay-option ${(pm || methods[0].id) === m.id ? "on" : ""}`}>
                  <input type="radio" checked={(pm || methods[0].id) === m.id} onChange={() => setPm(m.id)} />
                  <div><b>{m.title}</b></div>
                </label>
              ))}
              {err && <div className="alert err">{err}</div>}
              <button className="btn btn-gold" disabled={busy} onClick={retry}>{busy ? "…" : "پرداخت دوباره"}</button>
            </div>
          )}
        </div>
        <div className="center mt"><Link to="/shop" className="btn btn-outline">ادامه خرید</Link></div>
      </div>
    </div>
  );
}

export function Track() {
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const nav = useNavigate();
  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 480 }}>
        <div className="panel">
          <h1 className="page-title">پیگیری سفارش</h1>
          <p className="muted small" style={{ marginBottom: 18 }}>کد سفارش و شماره موبایلی که با آن خرید کرده‌اید را وارد کنید.</p>
          <form onSubmit={(e) => { e.preventDefault(); nav(`/order/${enDigits(code).trim()}?phone=${enDigits(phone).trim()}`); }}>
            <label className="field"><span>کد سفارش</span><input className="input ltr" required inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} /></label>
            <label className="field"><span>شماره موبایل</span><input className="input ltr" required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <button className="btn btn-gold btn-block">پیگیری</button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** صفحه‌ی درگاه آزمایشی (فقط وقتی «درگاه آزمایشی» در تنظیمات روشنه) */
export function MockPay() {
  const [sp] = useSearchParams();
  const cb = sp.get("cb") || "";
  const go = (status) => {
    const u = new URL(cb, window.location.origin);
    u.searchParams.set("status", status);
    u.searchParams.set("authority", sp.get("authority") || "");
    // آدرس بازگشت روی SITE_URL ساخته شده؛ در محیط توسعه همون مسیر رو روی دامنه‌ی فعلی باز کن
    window.location.href = u.pathname + u.search;
  };
  return (
    <div className="page">
      <div className="container mock-pay">
        <div className="panel">
          <h1 className="page-title">درگاه پرداخت آزمایشی</h1>
          <p className="muted">سفارش {sp.get("order")} — هیچ پولی جابه‌جا نمی‌شود.</p>
          <div className="row mt" style={{ justifyContent: "center" }}>
            <button className="btn btn-gold" onClick={() => go("ok")}>پرداخت موفق</button>
            <button className="btn btn-danger btn" onClick={() => go("cancel")}>انصراف</button>
          </div>
        </div>
      </div>
    </div>
  );
}
