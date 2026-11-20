import { useState } from "react";
import { Link } from "react-router-dom";
import { useAdmin } from "./AdminApp.jsx";
import { useAdminData, Loading, ErrorBox } from "./ui.jsx";
import { toman, nf, faDate } from "../format.js";

export default function Customers() {
  const [q, setQ] = useState("");
  const { can } = useAdmin();
  const { data, loading, error } = useAdminData(`/customers?q=${encodeURIComponent(q)}`);
  return (
    <>
      <input className="input" style={{ maxWidth: 260, marginBottom: 18 }} placeholder="جستجوی نام یا موبایل…" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="panel table-wrap" style={{ padding: 0 }}>
          <table className="tbl">
            <thead><tr><th>نام</th><th>موبایل</th><th>شهر</th><th>خرید موفق</th><th>جمع خرید</th><th>عضویت</th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td>{c.name || "—"}</td>
                  <td className="ltr">{can("orders") ? <Link className="gold" to={`/admin/orders?q=${c.phone}`}>{c.phone}</Link> : c.phone}</td>
                  <td>{c.city || "—"}</td><td>{nf(c.orders)}</td><td>{toman(c.spent)}</td><td>{faDate(c.created_at, false)}</td>
                </tr>
              ))}
              {!data.length && <tr><td colSpan={6} className="center muted" style={{ padding: 30 }}>مشتری ثبت‌نام‌شده‌ای نیست. (خریدهای مهمان در «سفارش‌ها» هستند)</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
