import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSite } from "./context.jsx";
import { useReveal } from "./hooks.js";
import { Icon } from "../icons.jsx";
import { nf } from "../format.js";

export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="20" cy="20" r="17" />
      <path d="M20 6 L23 17 L34 20 L23 23 L20 34 L17 23 L6 20 L17 17 Z" />
    </svg>
  );
}

function Ticker({ items }) {
  if (!items?.length) return null;
  const list = [...items, ...items];
  return (
    <div className="ticker-bar" aria-label="نرخ روز طلا و سکه">
      <div className="ticker-track">
        {list.map((t, i) => (
          <span key={i} aria-hidden={i >= items.length}>
            {t.label} <b>{nf(t.value)} تومان</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Layout() {
  const { site, cart, toast } = useSite();
  const [shrink, setShrink] = useState(false);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const s = site?.settings || {};
  useReveal();

  useEffect(() => {
    const on = () => setShrink(window.scrollY > 40);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // بستن منو و رفتن به بالای صفحه (یا لنگر) با هر تغییر مسیر
  useEffect(() => {
    setOpen(false);
    if (loc.hash) {
      setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 60);
    } else window.scrollTo(0, 0);
  }, [loc.pathname, loc.hash]);

  return (
    <>
      <Ticker items={site?.ticker} />
      <header id="siteHeader" className={shrink ? "shrink" : ""}>
        <div className="nav-wrap">
          <div className="logo" onClick={() => nav("/")} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && nav("/")}>
            <LogoMark />
            <span>
              {s.store_name || "طلا فروشی مسلمی"}
              <em>{s.store_tagline || "طلا و جواهر اصیل"}</em>
            </span>
          </div>
          <nav className={`main-nav ${open ? "open" : ""}`} id="mainNav">
            <NavLink to="/" end>خانه</NavLink>
            <NavLink to="/shop">فروشگاه</NavLink>
            <Link to="/#trust">اصالت و عیار</Link>
            <Link to="/#about">درباره ما</Link>
            <NavLink to="/track">پیگیری سفارش</NavLink>
            <Link to="/#contact">تماس با ما</Link>
          </nav>
          <div className="header-actions">
            <Link to="/account" className="cart-btn" aria-label="حساب کاربری">
              <Icon.user />
            </Link>
            <Link to="/cart" className="cart-btn" aria-label="سبد خرید">
              <Icon.cart />
              {cart.count > 0 && <span className="badge">{nf(cart.count)}</span>}
            </Link>
            <Link to="/shop" className="btn btn-gold">خرید آنلاین</Link>
            <button className="burger" aria-label="باز کردن منو" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
      </header>
      {open && <div className="nav-overlay" onClick={() => setOpen(false)} />}

      <main>
        <Outlet />
      </main>

      <footer>
        <div className="container">
          <div className="foot-grid">
            <div>
              <div className="foot-logo">{s.store_name}</div>
              <p>طلا و جواهر اصیل، از سه نسل پیش تا امروز. اصالت، عیار و سلیقهٔ ایرانی در هر قطعه.</p>
              <p className="mt small">{s.store_address}<br />{s.store_phone}</p>
            </div>
            <div className="foot-col">
              <h4>فروشگاه</h4>
              <ul>
                {(site?.categories || []).slice(0, 6).map((c) => (
                  <li key={c.id}><Link to={`/shop?category=${c.slug}`}>{c.name}</Link></li>
                ))}
              </ul>
            </div>
            <div className="foot-col">
              <h4>دسترسی سریع</h4>
              <ul>
                <li><Link to="/shop">همه‌ی محصولات</Link></li>
                <li><Link to="/track">پیگیری سفارش</Link></li>
                <li><Link to="/account">حساب کاربری</Link></li>
                <li><Link to="/#about">درباره ما</Link></li>
                <li><Link to="/#contact">تماس با ما</Link></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© تمامی حقوق برای {s.store_name} محفوظ است</span>
            <a href="https://webpikaso.click" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, opacity: 0.7 }}>
              طراحی و توسعه با <span style={{ fontSize: 14, lineHeight: 1 }}>♥</span> توسط تیم <span style={{ fontWeight: 750 }}>پیکسل</span>
            </a>
          </div>
        </div>
      </footer>
      {toast && <div className={`toast ${toast.err ? "err" : ""}`} key={toast.id}>{toast.msg}</div>}
    </>
  );
}
