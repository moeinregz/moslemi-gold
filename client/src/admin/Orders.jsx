import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAdmin } from "./AdminApp.jsx";
import { useAdminData, Loading, ErrorBox, Pager } from "./ui.jsx";
import { toman, nf, faDate } from "../format.js";

const PM = { zarinpal: "زرین‌پال", zibal: "زیبال", mock: "آزمایشی", offline: "حضوری/کارت" };

export default function Orders() {
  const { statuses } = useAdmin();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const status = sp.get("status") || "";
  const page = Number(sp.get("page")) || 1;
  const { data, loading, error, reload } = useAdminData(`/orders?status=${status}&q=${encodeURIComponent(sp.get("q") || "")}&page=${page}`);
  const nav = useNavigate();
  const setParam = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    if (k !== "page") n.delete("page");
    setSp(n);
  };
  useEffect(() => {
    const t = setTimeout(() => q !== (sp.get("q") || "") && setParam("q", q), 400);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line
  // سفارش‌های جدید بدون رفرش (هر ۴۵ ثانیه)
  useEffect(() => {
    const t = setInterval(reload, 45_000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <>
      <div className="row" style={{ marginBottom: 18 }}>
        <input className="input" style={{ maxWidth: 240 }} placeholder="کد سفارش، نام یا موبایل…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 220 }} value={status} onChange={(e) => setParam("status", e.target.value)}>
          <option value="">همه‌ی وضعیت‌ها</option>
          <option value="open">منتظر رسیدگی</option>
          {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="spacer" />
        {data && <span className="muted small">{nf(data.total)} سفارش</span>}
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <>
          <div className="panel table-wrap" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th>کد</th><th>مشتری</th><th>شهر/تحویل</th><th>اقلام</th><th>مبلغ</th><th>پرداخت</th><th>وضعیت</th><th>تاریخ</th></tr></thead>
              <tbody>
                {data.rows.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => nav(`/admin/orders/${o.code}`)}>
                    <td className="gold">{o.code}</td>
                    <td>{o.name}<div className="small muted ltr" style={{ textAlign: "right" }}>{o.phone}</div></td>
                    <td>{o.delivery === "pickup" ? "حضوری" : o.city}</td>
                    <td>{nf(o.items)}</td>
                    <td>{toman(o.total)}</td>
                    <td className="small">{PM[o.payment_method] || o.payment_method || "—"}</td>
                    <td><span className={`status-pill ${o.status}`}>{o.status_title}</span></td>
                    <td className="small">{faDate(o.created_at)}</td>
                  </tr>
                ))}
                {!data.rows.length && <tr><td colSpan={8} className="center muted" style={{ padding: 30 }}>سفارشی پیدا نشد.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pages={data.pages} onPage={(p) => setParam("page", p)} />
        </>
      )}
    </>
  );
}
