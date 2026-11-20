import { Link } from "react-router-dom";
import { JewelIcon, iconForCategory } from "../icons.jsx";
import { toman, nf } from "../format.js";

export default function ProductCard({ p }) {
  const img = p.images?.[0]?.url;
  const off = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  return (
    <Link to={`/product/${encodeURIComponent(p.slug)}`} className="piece-card">
      <div className="piece-media">
        {img ? <img src={img} alt={p.title} loading="lazy" /> : <JewelIcon name={iconForCategory(p.category_slug)} width={1.2} />}
        {off > 0 && p.in_stock && <span className="off-badge">{nf(off)}٪ تخفیف</span>}
        {!p.in_stock && <div className="soldout">ناموجود</div>}
      </div>
      <div className="piece-info">
        <span className="tag">
          {p.category_name || "طلا"}
          {p.pricing_mode === "gold" ? ` — عیار ${nf(p.karat)} · ${nf(p.weight)} گرم` : ""}
        </span>
        <h3>{p.title}</h3>
        <p>{p.short_desc}</p>
        <div className="price-line">
          {p.in_stock ? (
            <>
              <span className="price">{toman(p.price)}</span>
              {p.old_price > 0 && <span className="price-old">{nf(p.old_price)}</span>}
            </>
          ) : (
            <span className="muted small">برای سفارش تماس بگیرید</span>
          )}
        </div>
      </div>
    </Link>
  );
}
