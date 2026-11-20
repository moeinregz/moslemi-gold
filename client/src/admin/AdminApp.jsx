import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { Icon } from "../icons.jsx";
import { LogoMark } from "../store/Layout.jsx";
import Dashboard from "./Dashboard.jsx";
import Products from "./Products.jsx";
import ProductEdit from "./ProductEdit.jsx";
import Categories from "./Categories.jsx";
import GoldRate from "./GoldRate.jsx";
import Orders from "./Orders.jsx";
import OrderDetail from "./OrderDetail.jsx";
import Customers from "./Customers.jsx";
import Channels from "./Channels.jsx";
import Settings from "./Settings.jsx";
import Users from "./Users.jsx";
import Logs from "./Logs.jsx";
import Profile from "./Profile.jsx";

const Ctx = createContext(null);
export const useAdmin = () => useContext(Ctx);

const MENU = [
  ["", "داشبورد", "dashboard", Icon.grid],
  ["orders", "سفارش‌ها", "orders", Icon.receipt],
  ["products", "محصولات", "products", Icon.box],
  ["categories", "دسته‌بندی‌ها", "categories", Icon.tag],
  ["gold", "نرخ روز طلا", "gold_rate", Icon.coins],
  ["customers", "مشتری‌ها", "customers", Icon.people],
  ["channels", "کانال‌های فروش", "channels", Icon.link],
  ["settings", "تنظیمات و درگاه", "settings", Icon.gear],
  ["users", "کاربران پنل", "users", Icon.users],
  ["logs", "گزارش فعالیت", "logs", Icon.list],
];

function Login({ onDone }) {
  const [f, setF] = useState({ username: "", password: "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-wrap">
      <form className="panel" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await api("/api/admin/login", { method: "POST", body: f });
          onDone();
        } catch (e2) {
          setErr(e2.message);
          setBusy(false);
        }
      }}>
        <div className="logo" style={{ justifyContent: "center", marginBottom: 20 }}><LogoMark /><span>پنل مدیریت</span></div>
        <label className="field"><span>نام کاربری</span><input className="input ltr" autoFocus required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="username" /></label>
        <label className="field"><span>رمز عبور</span><input className="input ltr" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" /></label>
        {err && <div className="alert err">{err}</div>}
        <button className="btn btn-gold btn-block" disabled={busy}>ورود</button>
      </form>
    </div>
  );
}

export default function AdminApp() {
  const [state, setState] = useState({ loading: true });
  const [toast, setToast] = useState(null);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  const load = useCallback(() => api("/api/admin/me").then((d) => setState({ ...d })).catch(() => setState({ me: null })), []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  const notify = useCallback((msg, err = false) => {
    const id = Date.now();
    setToast({ msg, err, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3500);
  }, []);

  /** فراخوانی API پنل؛ اگه نشست تموم شده باشه کاربر به صفحه‌ی ورود برمی‌گرده */
  const call = useCallback(async (path, opts) => {
    try {
      return await api(`/api/admin${path}`, opts);
    } catch (e) {
      if (e.status === 401) setState({ me: null });
      throw e;
    }
  }, []);

  if (state.loading) return <div className="login-wrap"><div className="loader" /></div>;
  if (!state.me) return <Login onDone={load} />;
  const can = (p) => state.me.permissions.includes(p);
  const items = MENU.filter((m) => can(m[2]));
  const title = MENU.find((m) => (m[0] ? loc.pathname.startsWith(`/admin/${m[0]}`) : loc.pathname.replace(/\/$/, "") === "/admin"))?.[1] || "پنل مدیریت";

  return (
    <Ctx.Provider value={{ ...state, can, call, notify, reload: load }}>
      <div className="adm">
        <aside className={`adm-side ${open ? "open" : ""}`}>
          <div className="adm-brand">طلا فروشی مسلمی<small>پنل مدیریت فروشگاه</small></div>
          <nav className="adm-nav">
            {items.map(([path, label, , I]) => (
              <NavLink key={path} to={`/admin${path ? "/" + path : ""}`} end={!path}><I />{label}</NavLink>
            ))}
            <a href="/" target="_blank" rel="noreferrer"><Icon.ext />مشاهده سایت</a>
          </nav>
          <div className="adm-user">
            <b>{state.me.name}</b>
            <span className="muted">{state.me.role_title} · {state.me.username}</span>
            <div className="row" style={{ marginTop: 10 }}>
              <NavLink to="/admin/profile" className="btn btn-sm btn-outline">رمز عبور</NavLink>
              <button className="btn btn-sm btn-outline" onClick={async () => { await api("/api/admin/logout", { method: "POST" }); setState({ me: null }); nav("/admin"); }}>خروج</button>
            </div>
          </div>
        </aside>
        {open && <div className="nav-overlay" onClick={() => setOpen(false)} />}
        <div className="adm-main">
          <div className="adm-top">
            <button className="adm-burger" aria-label="منو" onClick={() => setOpen(true)}><Icon.menu width={24} height={24} /></button>
            <h1>{title}</h1>
          </div>
          <div className="adm-body">
            <Routes>
              <Route index element={can("dashboard") ? <Dashboard /> : <Navigate to={`/admin/${items[0]?.[0] || "profile"}`} replace />} />
              {can("orders") && <Route path="orders" element={<Orders />} />}
              {can("orders") && <Route path="orders/:code" element={<OrderDetail />} />}
              {can("products") && <Route path="products" element={<Products />} />}
              {can("products") && <Route path="products/:id" element={<ProductEdit />} />}
              {can("categories") && <Route path="categories" element={<Categories />} />}
              {can("gold_rate") && <Route path="gold" element={<GoldRate />} />}
              {can("customers") && <Route path="customers" element={<Customers />} />}
              {can("channels") && <Route path="channels" element={<Channels />} />}
              {can("settings") && <Route path="settings" element={<Settings />} />}
              {can("users") && <Route path="users" element={<Users />} />}
              {can("logs") && <Route path="logs" element={<Logs />} />}
              <Route path="profile" element={<Profile />} />
              <Route path="*" element={<div className="empty">این بخش وجود ندارد یا به آن دسترسی ندارید.</div>} />
            </Routes>
          </div>
        </div>
      </div>
      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>}
    </Ctx.Provider>
  );
}
