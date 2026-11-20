import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSite } from "./context.jsx";
import { useApi } from "./hooks.js";
import ProductCard from "./ProductCard.jsx";
import { JewelIcon, iconForCategory } from "../icons.jsx";
import { toman, nf, faDate } from "../format.js";

export default function Product() {
  const { slug } = useParams();
  const { data, loading, error } = useApi(`/api/products/${encodeURIComponent(slug)}`);
  const { cart, notify, site } = useSite();
  const [img, setImg] = useState(0);
  const [qty, setQty] = useState(1);
  const nav = useNavigate();
  useEffect(() => {
    setImg(0);
    setQty(1);
  }, [slug]);
  useEffect(() => {
    if (data?.product) document.title = `${data.product.title} | ${site?.settings?.store_name || ""}`;
  }, [data, site]);

  if (loading) return <div className="page"><div className="loader" /></div>;
  if (error)
    return (
      <div className="page"><div className="container empty"><p>{error.message}</p><Link to="/shop" className="btn btn-outline mt">بازگشت به فروشگاه</Link></div></div>
    );
  const p = data.product;
  const b = p.breakdown || {};
  const off = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  const add = (go) => {
    cart.add(p, qty);
    if (go) nav("/cart");
    else notify("به سبد خرید اضافه شد ✓");
  };

  return (
    <div className="page">
      <div className="container">
        <div className="crumbs">
          <Link to="/">خانه</Link>/<Link to="/shop">فروشگاه</Link>
          {p.category_slug && <>/<Link to={`/shop?category=${p.category_slug}`}>{p.category_name}</Link></>}
        </div>
        <div className="product-layout">
          <div>
            <div className="gallery-main">
              {p.images[img] ? <img src={p.images[img].url} alt={p.title} /> : <JewelIcon name={iconForCategory(p.category_slug)} width={1.1} />}
            </div>
            {p.images.length > 1 && (
              <div className="thumbs">
                {p.images.map((im, i) => (
                  <button key={im.id} className={i === img ? "on" : ""} onClick={() => setImg(i)} aria-label={`عکس ${i + 1}`}>
                    <img src={im.url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="product-info">
            <h1>{p.title}</h1>
            <p className="muted">{p.short_desc}</p>
            <div className="product-meta">
              {p.pricing_mode === "gold" && <span>عیار {nf(p.karat)}</span>}
              {p.weight > 0 && <span>وزن {nf(p.weight)} گرم</span>}
              {p.sku && <span>کد {p.sku}</span>}
              {p.guarantee && <span>{p.guarantee}</span>}
            </div>
            {p.in_stock ? (
              <>
                <div>
                  <span className="big-price">{toman(p.price)}</span>
                  {p.old_price > 0 && <span className="price-old">{nf(p.old_price)}</span>}
                  {off > 0 && <span className="off-badge" style={{ marginInlineStart: 10 }}>{nf(off)}٪ تخفیف اجرت</span>}
                </div>
                {p.pricing_mode === "gold" && (
                  <div className="breakdown">
                    <div><span>نرخ هر گرم طلای {nf(b.karat)} عیار</span><span>{toman(b.rate)}</span></div>
                    <div><span>ارزش طلا ({nf(b.weight)} گرم)</span><span>{toman(b.gold)}</span></div>
                    <div><span>اجرت ساخت ({nf(b.labor_percent)}٪)</span><span>{toman(b.labor)}</span></div>
                    <div><span>سود فروشنده ({nf(b.profit_percent)}٪)</span><span>{toman(b.profit)}</span></div>
                    <div><span>مالیات بر ارزش افزوده ({nf(b.vat_percent)}٪ اجرت و سود)</span><span>{toman(b.tax)}</span></div>
                    {b.stone > 0 && <div><span>سنگ و نگین</span><span>{toman(b.stone)}</span></div>}
                    <div><span>قیمت نهایی</span><span>{toman(p.price)}</span></div>
                  </div>
                )}
                <p className="muted small" style={{ margin: "10px 0 18px" }}>
                  قیمت بر اساس نرخ طلای {site?.settings?.gold_rate_updated_at ? faDate(site.settings.gold_rate_updated_at) : "امروز"}؛ هنگام ثبت سفارش با نرخ لحظه‌ای قطعی می‌شود.
                </p>
                <div className="row">
                  <div className="qty">
                    <button onClick={() => setQty((q) => Math.min(p.stock, q + 1))} aria-label="افزایش">+</button>
                    <span>{nf(qty)}</span>
                    <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="کاهش">−</button>
                  </div>
                  <button className="btn btn-gold" onClick={() => add(true)}>خرید</button>
                  <button className="btn btn-outline" onClick={() => add(false)}>افزودن به سبد</button>
                </div>
                {p.stock <= 2 && <p className="small gold mt">فقط {nf(p.stock)} عدد باقی مانده</p>}
              </>
            ) : (
              <div className="alert info mt">این محصول در حال حاضر موجود نیست. برای سفارش ساخت با {site?.settings?.store_phone} تماس بگیرید.</div>
            )}
            {p.specs?.length > 0 && (
              <div className="specs">
                {p.specs.map((s, i) => <div key={i}><b>{s.k}</b><span>{s.v}</span></div>)}
              </div>
            )}
            {p.description && <div className="desc">{p.description}</div>}
          </div>
        </div>

        {data.related.length > 0 && (
          <section style={{ marginTop: 80 }}>
            <div className="section-head"><h2>محصولات مشابه</h2></div>
            <div className="prod-grid">{data.related.map((r) => <ProductCard key={r.id} p={r} />)}</div>
          </section>
        )}
      </div>
    </div>
  );
}
