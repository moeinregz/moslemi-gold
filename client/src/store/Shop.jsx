import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSite } from "./context.jsx";
import { useApi } from "./hooks.js";
import ProductCard from "./ProductCard.jsx";
import { Icon } from "../icons.jsx";

export default function Shop() {
  const { site } = useSite();
  const [sp, setSp] = useSearchParams();
  const category = sp.get("category") || "";
  const sort = sp.get("sort") || "";
  const [q, setQ] = useState(sp.get("q") || "");
  const qs = new URLSearchParams({ category, sort, q: sp.get("q") || "" }).toString();
  const { data, loading, error } = useApi(`/api/products?${qs}`);
  const cat = site?.categories?.find((c) => c.slug === category);

  // جستجو با کمی تأخیر
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") || "") !== q) {
        const n = new URLSearchParams(sp);
        q ? n.set("q", q) : n.delete("q");
        setSp(n, { replace: true });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line

  const setParam = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    setSp(n);
  };

  return (
    <div className="page">
      <div className="container">
        <div className="crumbs"><Link to="/">خانه</Link>/<span>فروشگاه</span>{cat && <>/<span>{cat.name}</span></>}</div>
        <h1 className="page-title">{cat ? cat.name : "فروشگاه طلا و جواهر"}</h1>
        <p className="muted small" style={{ marginBottom: 26 }}>قیمت‌ها بر اساس نرخ روز طلا، اجرت و مالیات محاسبه شده‌اند.</p>

        <div className="shop-bar">
          <div className="chips">
            <button className={`chip ${!category ? "on" : ""}`} onClick={() => setParam("category", "")}>همه</button>
            {(site?.categories || []).map((c) => (
              <button key={c.id} className={`chip ${category === c.slug ? "on" : ""}`} onClick={() => setParam("category", c.slug)}>{c.name}</button>
            ))}
          </div>
          <div className="spacer" />
          <input className="input" style={{ maxWidth: 220 }} placeholder="جستجو…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جستجو" />
          <select className="input" style={{ maxWidth: 170 }} value={sort} onChange={(e) => setParam("sort", e.target.value)} aria-label="مرتب‌سازی">
            <option value="">پیشنهادی</option>
            <option value="popular">پرفروش‌ترین</option>
            <option value="cheap">ارزان‌ترین</option>
            <option value="expensive">گران‌ترین</option>
            <option value="weight">سنگین‌ترین</option>
          </select>
        </div>

        {loading ? (
          <div className="loader" />
        ) : error ? (
          <div className="alert err">{error.message}</div>
        ) : !data.length ? (
          <div className="empty"><Icon.box /><p>محصولی پیدا نشد.</p></div>
        ) : (
          <div className="prod-grid">
            {data.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
