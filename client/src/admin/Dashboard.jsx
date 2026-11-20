import { Link } from "react-router-dom";
import { useAdminData, Loading, ErrorBox } from "./ui.jsx";
import { useAdmin } from "./AdminApp.jsx";
import { toman, nf, ago } from "../format.js";

export default function Dashboard() {
  const { data: d, loading, error } = useAdminData("/dashboard");
  const { can } = useAdmin();
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const max = Math.max(1, ...d.days.map((x) => x.s));
  const stale = !d.gold_rate_updated_at || Date.now() - Date.parse(d.gold_rate_updated_at) > 24 * 3600_000;
  return (
    <>
      {stale && can("gold_rate") && (
        <div className="alert info">نرخ طلا بیش از ۲۴ ساعت است به‌روز نشده. <Link to="/admin/gold" className="gold">به‌روزرسانی نرخ روز ←</Link></div>
      )}
      <div className="stats">
        <div className="stat"><span>فروش ۲۴ ساعت اخیر</span><b>{toman(d.today.s)}</b><small>{nf(d.today.c)} سفارش</small></div>
        <div className="stat"><span>فروش ۳۰ روز اخیر</span><b>{toman(d.month.s)}</b><small>{nf(d.month.c)} سفارش</small></div>
        <div className="stat"><span>سفارش‌های منتظر رسیدگی</span><b>{nf(d.to_process)}</b><small>{can("orders") && <Link to="/admin/orders?status=open" className="gold">مشاهده</Link>}</small></div>
        <div className="stat"><span>نرخ هر گرم ۱۸ عیار</span><b>{toman(d.gold_rate)}</b><small>به‌روزرسانی: {ago(d.gold_rate_updated_at)}</small></div>
        <div className="stat"><span>محصولات</span><b>{nf(d.products.a || 0)} فعال</b><small>از {nf(d.products.c)} محصول</small></div>
        <div className="stat"><span>کاربران آنلاین پنل</span><b>{nf(d.online.length)}</b><small>{d.online.join("، ")}</small></div>
      </div>
      <div className="two-col">
        <div className="panel">
          <h3>فروش ۱۴ روز اخیر</h3>
          {d.days.length ? (
            <div className="bars">{d.days.map((x) => <div key={x.day} style={{ height: `${(x.s / max) * 100}%` }} data-tip={`${new Date(x.day).toLocaleDateString("fa-IR")}: ${toman(x.s)}`} />)}</div>
          ) : <p className="muted">هنوز فروشی ثبت نشده.</p>}
        </div>
        <div className="panel">
          <h3>آخرین سفارش‌ها</h3>
          <table className="tbl"><tbody>
            {d.recent.map((o) => (
              <tr key={o.code}>
                <td>{can("orders") ? <Link className="gold" to={`/admin/orders/${o.code}`}>{o.code}</Link> : o.code}</td>
                <td>{o.name}</td><td>{toman(o.total)}</td><td><span className={`status-pill ${o.status}`}>{o.status_title}</span></td>
              </tr>
            ))}
            {!d.recent.length && <tr><td className="muted">سفارشی نیست.</td></tr>}
          </tbody></table>
        </div>
        <div className="panel">
          <h3>موجودی رو به اتمام</h3>
          {d.low_stock.length ? d.low_stock.map((p) => (
            <div className="sum-row" key={p.id}>
              {can("products") ? <Link to={`/admin/products/${p.id}`}>{p.title}</Link> : <span>{p.title}</span>}
              <span className={p.stock ? "" : "gold"}>{p.stock ? `${nf(p.stock)} عدد` : "ناموجود"}</span>
            </div>
          )) : <p className="muted">همه‌ی محصولات موجودی کافی دارند.</p>}
        </div>
        <div className="panel">
          <h3>پرفروش‌ها</h3>
          {d.top.length ? d.top.map((p) => <div className="sum-row" key={p.id}><span>{p.title}</span><span>{nf(p.sold_count)} فروش</span></div>) : <p className="muted">هنوز فروشی نیست.</p>}
        </div>
      </div>
    </>
  );
}
