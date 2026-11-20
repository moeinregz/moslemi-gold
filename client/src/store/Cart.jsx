import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSite } from "./context.jsx";
import { api } from "../api.js";
import { JewelIcon, iconForCategory, Icon } from "../icons.jsx";
import { toman, nf } from "../format.js";

/** قیمت سبد همیشه از سرور گرفته می‌شه (نرخ روز) */
export function useQuote(items, delivery) {
  const [q, setQ] = useState({ loading: true });
  const key = JSON.stringify(items.map((i) => [i.product_id, i.qty])) + delivery;
  useEffect(() => {
    if (!items.length) return setQ({ loading: false, data: null });
    let alive = true;
    setQ((s) => ({ ...s, loading: true }));
    api("/api/quote", { method: "POST", body: { items: items.map(({ product_id, qty }) => ({ product_id, qty })), delivery } })
      .then((data) => alive && setQ({ loading: false, data }))
      .catch((error) => alive && setQ({ loading: false, error }));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line
  return q;
}

export default function Cart() {
  const { cart } = useSite();
  const q = useQuote(cart.items, "post");
  const nav = useNavigate();
  const lines = useMemo(() => new Map((q.data?.lines || []).map((l) => [l.product_id, l])), [q.data]);
  const issues = useMemo(() => new Map((q.data?.issues || []).map((l) => [l.product_id, l.message])), [q.data]);

  if (!cart.items.length)
    return (
      <div className="page"><div className="container empty">
        <Icon.cart />
        <p>سبد خرید شما خالی است.</p>
        <Link to="/shop" className="btn btn-gold mt">رفتن به فروشگاه</Link>
      </div></div>
    );

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">سبد خرید</h1>
        <div className="cart-layout mt">
          <div className="panel">
            {cart.items.map((i) => {
              const l = lines.get(i.product_id);
              return (
                <div className="cart-line" key={i.product_id}>
                  <Link to={`/product/${i.slug}`} className="thumb">{i.image ? <img src={i.image} alt="" /> : <JewelIcon name={iconForCategory(i.icon)} />}</Link>
                  <div>
                    <h3><Link to={`/product/${i.slug}`}>{l?.title || i.title}</Link></h3>
                    {l && <div className="small muted">{l.weight ? `${nf(l.weight)} گرم · عیار ${nf(l.karat)} · ` : ""}{toman(l.unit_price)}</div>}
                    {issues.get(i.product_id) && <div className="small" style={{ color: "#f1a5a5" }}>{issues.get(i.product_id)}</div>}
                    <div className="row" style={{ marginTop: 8 }}>
                      <div className="qty">
                        <button onClick={() => cart.setQty(i.product_id, i.qty + 1)} aria-label="افزایش">+</button>
                        <span>{nf(i.qty)}</span>
                        <button onClick={() => cart.setQty(i.product_id, i.qty - 1)} aria-label="کاهش">−</button>
                      </div>
                      <button className="btn btn-sm btn-danger" onClick={() => cart.remove(i.product_id)}>حذف</button>
                    </div>
                  </div>
                  <div className="price">{l ? toman(l.line_total) : "—"}</div>
                </div>
              );
            })}
          </div>
          <div className="panel">
            <h3>خلاصه سفارش</h3>
            {q.loading && !q.data ? <div className="loader" /> : q.error ? <div className="alert err">{q.error.message}</div> : (
              <>
                <div className="sum-row"><span>جمع اقلام</span><span>{toman(q.data.subtotal)}</span></div>
                <div className="sum-row"><span>هزینه ارسال</span><span>{q.data.shipping ? toman(q.data.shipping) : "رایگان"}</span></div>
                <div className="sum-row total"><span>مبلغ قابل پرداخت</span><span>{toman(q.data.total)}</span></div>
                <button className="btn btn-gold btn-block mt" disabled={!q.data.lines.length} onClick={() => nav("/checkout")}>ادامه و ثبت سفارش</button>
                <p className="small muted mt">قیمت‌ها با نرخ لحظه‌ای طلا محاسبه شده و در صورت تغییر نرخ، به‌روز می‌شوند.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
