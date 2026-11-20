import { Link } from "react-router-dom";
import { useSite } from "./context.jsx";
import { useApi } from "./hooks.js";
import ProductCard from "./ProductCard.jsx";
import { JewelIcon, iconForCategory, Icon } from "../icons.jsx";

const TRUST = [
  ["عیار تضمین‌شده", "مهر اصالت روی تمام محصولات", <><path d="M24 6 L40 13 L40 24 C40 34 33 41 24 44 C15 41 8 34 8 24 L8 13 Z" /><path d="M17 24 L22 29 L32 18" /></>],
  ["ضمانت بازخرید", "تعویض و بازخرید در هر زمان", <><path d="M12 24 a12 12 0 1 1 3.5 8.5" /><path d="M8 30 L12 24 L18 27" /></>],
  ["قیمت به نرخ روز", "محاسبه‌ی شفاف وزن، اجرت و سود", <path d="M10 34 L18 16 L24 26 L30 12 L38 34 Z" />],
  ["ارسال بیمه‌شده", "ارسال امن یا تحویل حضوری در فروشگاه", <><circle cx="24" cy="18" r="8" /><path d="M10 40 C10 30 16 26 24 26 C32 26 38 30 38 40" /></>],
];

export default function Home() {
  const { site } = useSite();
  const s = site?.settings || {};
  const featured = useApi("/api/products?featured=1&limit=10");
  const latest = useApi("/api/products?limit=8");
  const pieces = featured.data?.length ? featured.data : latest.data || [];

  return (
    <>
      <section className="hero" id="home">
        <svg className="hero-motif" viewBox="0 0 400 400" fill="none" stroke="#c9a13b" strokeWidth="1">
          <circle cx="200" cy="200" r="150" />
          <path className="p2" d="M200 50 L228 172 L350 200 L228 228 L200 350 L172 228 L50 200 L172 172 Z" />
          <path className="p3" d="M200 90 L219 181 L310 200 L219 219 L200 310 L181 219 L90 200 L181 181 Z" />
        </svg>
        {[["4px", "22%", "18%", ".2s"], ["3px", "65%", "12%", "1.1s"], ["5px", "38%", "78%", ".6s"], ["3px", "74%", "70%", "1.8s"], ["4px", "15%", "60%", "2.3s"]].map(([w, t, r, d], i) => (
          <span key={i} className="sparkle" style={{ width: w, height: w, top: t, right: r, animationDelay: d }} />
        ))}
        <div className="hero-inner">
          <div className="eyebrow">سه نسل اصالت در بازار زرگرها</div>
          <h1>{s.store_name || "طلا فروشی مسلمی"}؛ جایی که طلا داستان می‌شود</h1>
          <p className="lead">هر قطعه با دست استادکاران ساخته می‌شود؛ عیار تضمینی، قیمت شفاف به نرخ روز و ضمانت بازخرید در تمام محصولات. حالا آنلاین هم بخرید.</p>
          <div className="hero-ctas">
            <Link to="/shop" className="btn btn-gold">خرید آنلاین</Link>
            <Link to="/#about" className="btn btn-outline">داستان {s.store_name || "ما"}</Link>
          </div>
          <div className="hero-stats">
            <div><b>۳۲</b><span>سال تجربه</span></div>
            <div><b>۱۸K+</b><span>مشتری راضی</span></div>
            <div><b>۹۹۹</b><span>عیار طلای آب‌شده</span></div>
            <div><b>۱۰۰٪</b><span>ضمانت اصالت</span></div>
          </div>
        </div>
      </section>

      <div className="divider"></div>

      <section className="pad" id="categories">
        <div className="container">
          <div className="section-head reveal">
            <div className="eyebrow">مجموعه محصولات</div>
            <h2>هر مناسبت، طلای خودش را دارد</h2>
            <p>از انگشتر نامزدی تا سرویس عروس؛ هر قطعه با دقت و عیار استاندارد در کارگاه ما شکل می‌گیرد.</p>
          </div>
          <div className="cat-grid">
            {(site?.categories || []).map((c) => (
              <Link to={`/shop?category=${encodeURIComponent(c.slug)}`} className="cat-card reveal" key={c.id}>
                <JewelIcon name={iconForCategory(c.slug, c.icon)} className="cat-icon" />
                <h3>{c.name}</h3>
                <p>{c.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="trust-wrap" id="trust">
        <div className="container">
          <div className="trust-grid">
            {TRUST.map(([t, d, icon]) => (
              <div className="trust-item reveal" key={t}>
                <svg className="trust-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.3">{icon}</svg>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pad" id="collection">
        <div className="container">
          <div className="section-head reveal">
            <div className="eyebrow">مجموعه منتخب</div>
            <h2>طرح‌های برگزیدهٔ این فصل</h2>
            <p>قیمت‌ها بر اساس نرخ روز طلا به‌صورت خودکار به‌روز می‌شوند</p>
          </div>
          {featured.loading && latest.loading ? (
            <div className="loader" />
          ) : (
            <div className="collection-scroll reveal">
              {pieces.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          )}
          <div className="center mt">
            <Link to="/shop" className="btn btn-outline">مشاهده همه‌ی محصولات</Link>
          </div>
        </div>
      </section>

      <section className="pad" id="about" style={{ paddingTop: 0 }}>
        <div className="container about-grid">
          <div className="about-frame reveal">
            <svg viewBox="0 0 200 200" fill="none" stroke="#c9a13b" strokeWidth="1">
              <circle cx="100" cy="100" r="70" />
              <path d="M100 40 L112 88 L160 100 L112 112 L100 160 L88 112 L40 100 L88 88 Z" />
            </svg>
          </div>
          <div className="about-text reveal">
            <div className="eyebrow">درباره {s.store_name}</div>
            <h2>از دل بازار زرگرها تا امروز</h2>
            <p>{s.store_name} کار خود را سه نسل پیش، در دل بازار زرگرهای شهر، با یک کارگاه کوچک آغاز کرد. آنچه ما را در طول این سال‌ها متمایز کرده، پایبندی به عیار استاندارد و احترام به سلیقهٔ هر مشتری بوده است.</p>
            <p>امروز طراحی سنتی را با زبان امروزی ترکیب می‌کنیم تا هر قطعه، هم یادگاری ماندگار باشد و هم سرمایه‌ای مطمئن.</p>
            <ul className="about-list">
              {["گواهی عیار برای هر قطعه صادر می‌شود", "امکان سفارش طراحی اختصاصی", "خرید و فروش طلای دست دوم با نرخ روز"].map((t) => (
                <li key={t}><Icon.check />{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="quote-band">
        <div className="container">
          <svg viewBox="0 0 48 32" fill="currentColor" className="reveal">
            <path d="M0 32 V18 C0 8 6 2 16 0 L18 6 C11 8 8 11 8 16 H16 V32 Z M28 32 V18 C28 8 34 2 44 0 L46 6 C39 8 36 11 36 16 H44 V32 Z" />
          </svg>
          <p className="reveal">«طلایی که از ما می‌خرید، فقط زینت نیست؛ امانتی است که نسل به نسل می‌ماند.»</p>
          <span className="reveal">— بنیان‌گذار {s.store_name}</span>
        </div>
      </section>

      <section className="pad" id="contact">
        <div className="container">
          <div className="section-head reveal">
            <div className="eyebrow">تماس با ما</div>
            <h2>به فروشگاه ما سر بزنید</h2>
            <p>کارشناسان ما آماده‌اند تا در انتخاب یا طراحی قطعهٔ دلخواه شما همراه باشند</p>
          </div>
          <div className="contact-grid">
            <div className="reveal">
              <div className="info-row"><Icon.pin /><div><h3>نشانی</h3><p>{s.store_address}</p></div></div>
              <div className="info-row"><Icon.phone /><div><h3>تلفن تماس</h3><p><a href={`tel:${String(s.store_phone || "").replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))}`}>{s.store_phone}</a></p></div></div>
              {s.store_hours && <div className="info-row"><Icon.clock /><div><h3>ساعت کاری</h3><p>{s.store_hours}</p></div></div>}
              <div className="social-row">
                {s.instagram && <a href={s.instagram} target="_blank" rel="noopener noreferrer" aria-label="اینستاگرام"><Icon.instagram /></a>}
                {s.telegram && <a href={s.telegram} target="_blank" rel="noopener noreferrer" aria-label="تلگرام"><Icon.telegram /></a>}
                {s.whatsapp && <a href={s.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="واتس‌اپ"><Icon.whatsapp /></a>}
              </div>
            </div>
            <div className="map-box reveal">
              <svg className="map-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M12 22 C12 22 20 14.5 20 9 A8 8 0 1 0 4 9 C4 14.5 12 22 12 22 Z" />
                <circle cx="12" cy="9" r="3" />
              </svg>
              <span className="cap">{s.store_address}</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
