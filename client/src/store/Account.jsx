import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSite } from "./context.jsx";
import { api } from "../api.js";
import { toman, faDate, nf } from "../format.js";

function AuthForm() {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ phone: "", password: "", name: "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const { reload } = useSite();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/account/${mode}`, { method: "POST", body: f });
      await reload();
      if (sp.get("next")) nav(sp.get("next"));
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  }
  return (
    <div className="container" style={{ maxWidth: 440 }}>
      <div className="panel">
        <div className="tabs">
          <button className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>ورود</button>
          <button className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>ثبت‌نام</button>
        </div>
        <form onSubmit={submit}>
          {mode === "register" && <label className="field"><span>نام و نام خانوادگی</span><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>}
          <label className="field"><span>شماره موبایل</span><input className="input ltr" required inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="username" /></label>
          <label className="field"><span>رمز عبور</span><input className="input ltr" type="password" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
          {err && <div className="alert err">{err}</div>}
          <button className="btn btn-gold btn-block" disabled={busy}>{mode === "login" ? "ورود" : "ساخت حساب"}</button>
        </form>
      </div>
    </div>
  );
}

export default function Account() {
  const { site, reload, notify } = useSite();
  const me = site?.customer;
  const [data, setData] = useState(null);
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!me) return;
    api("/api/account/me").then((d) => {
      setData(d);
      setF({ ...d.customer, current_password: "", new_password: "" });
    });
  }, [me]);

  if (!site) return <div className="page"><div className="loader" /></div>;
  if (!me) return <div className="page"><AuthForm /></div>;
  if (!data) return <div className="page"><div className="loader" /></div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setErr(null);
    try {
      await api("/api/account/me", { method: "PUT", body: f });
      notify("اطلاعات ذخیره شد ✓");
      setF({ ...f, current_password: "", new_password: "" });
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="row">
          <h1 className="page-title">حساب کاربری</h1>
          <span className="spacer" />
          <button className="btn btn-outline btn-sm" onClick={async () => { await api("/api/account/logout", { method: "POST" }); reload(); }}>خروج</button>
        </div>
        <div className="cart-layout mt">
          <div className="panel">
            <h3>سفارش‌های من</h3>
            {!data.orders.length ? <p className="muted">هنوز سفارشی ثبت نکرده‌اید. <Link to="/shop" className="gold">رفتن به فروشگاه</Link></p> : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>کد</th><th>تاریخ</th><th>مبلغ</th><th>وضعیت</th></tr></thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.code}>
                        <td><Link className="gold" to={`/order/${o.code}`}>{o.code}</Link></td>
                        <td>{faDate(o.created_at, false)}</td><td>{toman(o.total)}</td>
                        <td><span className={`status-pill ${o.status}`}>{o.status_title}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <form className="panel" onSubmit={save}>
            <h3>مشخصات و نشانی</h3>
            <p className="small muted" style={{ marginBottom: 12 }}>موبایل: {nf(me.phone).replace(/٬/g, "")}</p>
            <label className="field"><span>نام</span><input className="input" value={f.name} onChange={set("name")} /></label>
            <div className="grid2">
              <label className="field"><span>استان</span><input className="input" value={f.province} onChange={set("province")} /></label>
              <label className="field"><span>شهر</span><input className="input" value={f.city} onChange={set("city")} /></label>
            </div>
            <label className="field"><span>نشانی</span><textarea className="input" value={f.address} onChange={set("address")} /></label>
            <label className="field"><span>کد پستی</span><input className="input ltr" value={f.postal_code} onChange={set("postal_code")} /></label>
            <details style={{ marginBottom: 14 }}>
              <summary className="small gold" style={{ cursor: "pointer" }}>تغییر رمز عبور</summary>
              <label className="field mt"><span>رمز فعلی</span><input className="input ltr" type="password" value={f.current_password} onChange={set("current_password")} /></label>
              <label className="field"><span>رمز جدید</span><input className="input ltr" type="password" value={f.new_password} onChange={set("new_password")} /></label>
            </details>
            {err && <div className="alert err">{err}</div>}
            <button className="btn btn-gold">ذخیره</button>
          </form>
        </div>
      </div>
    </div>
  );
}
