import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSite } from "./context.jsx";
import { useQuote } from "./Cart.jsx";
import { api } from "../api.js";
import { toman, nf } from "../format.js";

export default function Checkout() {
  const { site, cart, reload } = useSite();
  const s = site?.settings || {};
  const me = site?.customer;
  const methods = site?.payment_methods || [];
  const [f, setF] = useState({ name: "", phone: "", province: "", city: "", address: "", postal_code: "", note: "", delivery: "post", payment_method: "", save_address: true });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const q = useQuote(cart.items, f.delivery);
  const nav = useNavigate();

  useEffect(() => {
    if (me) setF((x) => ({ ...x, name: x.name || me.name, phone: x.phone || me.phone, province: x.province || me.province, city: x.city || me.city, address: x.address || me.address, postal_code: x.postal_code || me.postal_code }));
  }, [me]);
  useEffect(() => {
    if (!f.payment_method && methods.length) setF((x) => ({ ...x, payment_method: methods[0].id }));
  }, [methods, f.payment_method]);

  if (!cart.items.length) return <div className="page"><div className="container empty"><p>سبد خرید خالی است.</p><Link className="btn btn-gold mt" to="/shop">فروشگاه</Link></div></div>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await api("/api/checkout", { method: "POST", body: { ...f, items: cart.items.map(({ product_id, qty }) => ({ product_id, qty })) } });
      cart.clear();
      reload();
      if (/^https?:\/\//.test(r.redirect)) window.location.href = r.redirect;
      else nav(r.redirect);
    } catch (e2) {
      setErr(e2.data?.issues?.length ? `${e2.message} — ${e2.data.issues.map((i) => i.message).join("، ")}` : e2.message);
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">ثبت سفارش</h1>
        {!me && <p className="muted small">خرید بدون ثبت‌نام هم ممکن است. <Link to="/account?next=/checkout" className="gold">ورود / ثبت‌نام</Link> برای ذخیره‌ی نشانی و دیدن سفارش‌ها.</p>}
        <form className="cart-layout mt" onSubmit={submit}>
          <div>
            <div className="panel">
              <h3>اطلاعات گیرنده</h3>
              <div className="grid2">
                <label className="field"><span>نام و نام خانوادگی *</span><input className="input" required name="name" value={f.name} onChange={set("name")} autoComplete="name" /></label>
                <label className="field"><span>شماره موبایل *</span><input className="input ltr" required inputMode="tel" placeholder="09xxxxxxxxx" name="phone" value={f.phone} onChange={set("phone")} autoComplete="tel" /></label>
              </div>
              <h3 style={{ marginTop: 10 }}>روش تحویل</h3>
              <label className={`pay-option ${f.delivery === "post" ? "on" : ""}`}>
                <input type="radio" name="delivery" checked={f.delivery === "post"} onChange={() => setF({ ...f, delivery: "post" })} />
                <div><b>ارسال بیمه‌شده به نشانی شما</b><small>{Number(s.free_shipping_over) > 0 ? `ارسال رایگان برای خرید بالای ${toman(s.free_shipping_over)}` : ""}</small></div>
              </label>
              {s.pickup_enabled === "1" && (
                <label className={`pay-option ${f.delivery === "pickup" ? "on" : ""}`}>
                  <input type="radio" name="delivery" checked={f.delivery === "pickup"} onChange={() => setF({ ...f, delivery: "pickup" })} />
                  <div><b>تحویل حضوری در فروشگاه</b><small>{s.store_address}</small></div>
                </label>
              )}
              {f.delivery === "post" && (
                <div className="mt">
                  <div className="grid2">
                    <label className="field"><span>استان</span><input className="input" name="province" value={f.province} onChange={set("province")} /></label>
                    <label className="field"><span>شهر *</span><input className="input" required name="city" value={f.city} onChange={set("city")} /></label>
                  </div>
                  <label className="field"><span>نشانی کامل *</span><textarea className="input" required name="address" value={f.address} onChange={set("address")} /></label>
                  <label className="field"><span>کد پستی (۱۰ رقم)</span><input className="input ltr" inputMode="numeric" name="postal_code" value={f.postal_code} onChange={set("postal_code")} /></label>
                </div>
              )}
              <label className="field"><span>توضیحات سفارش (اختیاری)</span><textarea className="input" name="note" value={f.note} onChange={set("note")} placeholder="مثلاً سایز انگشتر یا متن حکاکی" /></label>
              {me && <label className="check"><input type="checkbox" checked={f.save_address} onChange={set("save_address")} />ذخیره‌ی این نشانی در حساب من</label>}
            </div>
          </div>
          <div className="panel">
            <h3>خلاصه و پرداخت</h3>
            {q.data?.lines.map((l) => (
              <div className="sum-row" key={l.product_id}><span>{l.title} × {nf(l.qty)}</span><span>{toman(l.line_total)}</span></div>
            ))}
            {q.data && (
              <>
                <div className="sum-row"><span>ارسال</span><span>{q.data.shipping ? toman(q.data.shipping) : "رایگان"}</span></div>
                <div className="sum-row total"><span>مبلغ قابل پرداخت</span><span>{toman(q.data.total)}</span></div>
              </>
            )}
            {q.data?.issues?.length > 0 && <div className="alert err mt">{q.data.issues.map((i) => i.message).join("، ")} <Link to="/cart" className="gold">اصلاح سبد</Link></div>}
            <h3 style={{ marginTop: 22 }}>روش پرداخت</h3>
            {!methods.length && <div className="alert err">فعلاً هیچ روش پرداختی فعال نیست.</div>}
            {methods.map((m) => (
              <label key={m.id} className={`pay-option ${f.payment_method === m.id ? "on" : ""}`}>
                <input type="radio" name="pm" checked={f.payment_method === m.id} onChange={() => setF({ ...f, payment_method: m.id })} />
                <div><b>{m.title}</b><small>{m.note}</small></div>
              </label>
            ))}
            {err && <div className="alert err mt">{err}</div>}
            <button className="btn btn-gold btn-block mt" disabled={busy || !q.data?.lines.length || !methods.length}>
              {busy ? "در حال انتقال…" : methods.find((m) => m.id === f.payment_method)?.online === false ? "ثبت سفارش" : "پرداخت و ثبت سفارش"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
