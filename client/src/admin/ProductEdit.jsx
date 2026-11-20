import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAdmin } from "./AdminApp.jsx";
import { useAdminData, Loading, ErrorBox, Field, Switch } from "./ui.jsx";
import { toman, nf, faDate } from "../format.js";

const EMPTY = {
  title: "", slug: "", sku: "", category_id: "", short_desc: "", description: "",
  pricing_mode: "gold", karat: 18, weight: "", labor_percent: 18, profit_percent: 7, stone_price: 0, fixed_price: 0, discount_percent: 0,
  stock: 1, guarantee: "ضمانت اصالت و بازخرید", specs: [], active: 1, featured: 0, images: [],
};

/** همون فرمول سرور برای پیش‌نمایش قیمت هنگام تایپ */
function preview(f, rate18, vatP) {
  const r = (n) => Math.round(n / 1000) * 1000;
  if (f.pricing_mode === "fixed") return { price: r(Number(f.fixed_price) * (1 - Number(f.discount_percent) / 100)) };
  const rate = Math.round((rate18 * (Number(f.karat) / 24)) / 0.75);
  const gold = Number(f.weight) * rate;
  const d = 1 - Number(f.discount_percent) / 100;
  const labor = gold * (Number(f.labor_percent) / 100) * d;
  const profit = (gold + labor) * (Number(f.profit_percent) / 100) * d;
  const tax = (labor + profit) * (vatP / 100);
  return { rate, gold: r(gold), labor: r(labor), profit: r(profit), tax: r(tax), price: r(gold + labor + profit + tax + Number(f.stone_price || 0)) };
}

function Images({ productId, images, setImages, pending, setPending }) {
  const { call, notify } = useAdmin();
  const input = useRef();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function upload(files) {
    files = [...files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    if (!productId) return setPending([...pending, ...files]);
    const form = new FormData();
    files.forEach((f) => form.append("images", f));
    setBusy(true);
    try {
      const r = await call(`/products/${productId}/images`, { method: "POST", form });
      setImages(r.images);
      notify(r.warning || `${nf(files.length)} عکس آپلود شد ✓`, !!r.warning);
    } catch (e) {
      notify(e.message, true);
    }
    setBusy(false);
  }
  async function remove(img) {
    if (!confirm("این عکس حذف شود؟")) return;
    const r = await call(`/images/${img.id}`, { method: "DELETE" });
    setImages(r.images);
  }
  async function makeMain(img) {
    const ids = [img.id, ...images.filter((i) => i.id !== img.id).map((i) => i.id)];
    const r = await call(`/products/${productId}/images/order`, { method: "PUT", body: { ids } });
    setImages(r.images);
  }
  async function move(img, dir) {
    const ids = images.map((i) => i.id);
    const i = ids.indexOf(img.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const r = await call(`/products/${productId}/images/order`, { method: "PUT", body: { ids } });
    setImages(r.images);
  }

  return (
    <div className="panel">
      <h3>عکس‌های محصول</h3>
      <div className="img-grid" style={{ marginBottom: 14 }}>
        {images.map((img, i) => (
          <div className="img-tile" key={img.id}>
            {i === 0 && <span className="main-tag">اصلی</span>}
            <img src={img.url} alt="" />
            <div className="acts">
              <button type="button" onClick={() => move(img, 1)} title="بعدی">‹</button>
              {i > 0 && <button type="button" onClick={() => makeMain(img)}>اصلی کن</button>}
              <button type="button" onClick={() => remove(img)} style={{ color: "#f1a5a5" }}>حذف</button>
              <button type="button" onClick={() => move(img, -1)} title="قبلی">›</button>
            </div>
          </div>
        ))}
        {pending.map((f, i) => (
          <div className="img-tile" key={`p${i}`}>
            <img src={URL.createObjectURL(f)} alt="" style={{ opacity: 0.6 }} />
            <div className="acts"><span className="small muted">بعد از ذخیره آپلود می‌شود</span></div>
          </div>
        ))}
      </div>
      <div
        className={`drop ${over ? "over" : ""}`}
        onClick={() => input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
      >
        {busy ? "در حال آپلود…" : "عکس‌ها را اینجا رها کنید یا کلیک کنید (JPG، PNG، WEBP — حداکثر ۸ مگابایت، چند عکس با هم)"}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      <p className="small muted" style={{ marginTop: 8 }}>عکس اول، عکس اصلی است و در ترب، باسلام و نتایج گوگل هم نمایش داده می‌شود. عکس مربعی با پس‌زمینه‌ی ساده بهترین نتیجه را دارد.</p>
    </div>
  );
}

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = id === "new";
  const { call, notify } = useAdmin();
  const nav = useNavigate();
  const src = useAdminData(isNew ? null : `/products/${id}`);
  const cats = useAdminData("/categories");
  const gold = useAdminData("/gold");
  const [f, setF] = useState(isNew ? EMPTY : null);
  const [pending, setPending] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (src.data) setF(src.data);
  }, [src.data]);
  useEffect(() => {
    if (isNew) setF(EMPTY);
  }, [isNew]);

  const pv = useMemo(() => (f && gold.data ? preview(f, Number(gold.data.gold_rate_18), Number(gold.data.vat_percent)) : null), [f, gold.data]);

  if (!isNew && src.loading) return <Loading />;
  if (src.error) return <ErrorBox error={src.error} />;
  if (!f) return <Loading />;

  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });

  async function save(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const body = { ...f, images: undefined };
      const saved = isNew ? await call("/products", { method: "POST", body }) : await call(`/products/${id}`, { method: "PUT", body });
      if (pending.length) {
        const form = new FormData();
        pending.forEach((p) => form.append("images", p));
        await call(`/products/${saved.id}/images`, { method: "POST", form }).catch((e2) => notify(e2.message, true));
        setPending([]);
      }
      notify("ذخیره شد ✓");
      if (isNew) nav(`/admin/products/${saved.id}`, { replace: true });
      else setF(saved);
    } catch (e2) {
      setErr(e2.message);
      if (e2.status === 409) notify(e2.message, true);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save}>
      <div className="row" style={{ marginBottom: 18 }}>
        <Link to="/admin/products" className="btn btn-sm btn-outline">→ بازگشت</Link>
        <h2 style={{ fontFamily: "Vazirmatn", fontSize: "1.1rem" }}>{isNew ? "محصول جدید" : f.title}</h2>
        <span className="spacer" />
        {!isNew && <span className="small muted">آخرین ویرایش: {f.updated_by} — {faDate(f.updated_at)}</span>}
        <button className="btn btn-gold" disabled={busy}>{busy ? "در حال ذخیره…" : "ذخیره"}</button>
      </div>
      {err && <div className="alert err">{err} {err.includes("تازه کنید") && <button type="button" className="btn btn-sm btn-outline" onClick={() => src.reload()}>بارگذاری آخرین نسخه</button>}</div>}
      <div className="two-col" style={{ alignItems: "start" }}>
        <div>
          <div className="panel">
            <h3>اطلاعات اصلی</h3>
            <Field label="عنوان محصول *"><input className="input" required value={f.title} onChange={set("title")} /></Field>
            <div className="grid2">
              <Field label="دسته‌بندی">
                <select className="input" value={f.category_id || ""} onChange={set("category_id")}>
                  <option value="">بدون دسته</option>
                  {(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="کد کالا (SKU)"><input className="input ltr" value={f.sku} onChange={set("sku")} /></Field>
            </div>
            <Field label="نامک (آدرس صفحه)" hint="خالی بگذارید تا از روی عنوان ساخته شود"><input className="input ltr" value={f.slug} onChange={set("slug")} /></Field>
            <Field label="توضیح کوتاه"><input className="input" value={f.short_desc} onChange={set("short_desc")} maxLength={300} /></Field>
            <Field label="توضیحات کامل"><textarea className="input" rows={6} value={f.description} onChange={set("description")} /></Field>
            <Field label="ضمانت"><input className="input" value={f.guarantee} onChange={set("guarantee")} /></Field>
          </div>
          <div className="panel">
            <h3>مشخصات فنی</h3>
            {f.specs.map((sp, i) => (
              <div className="row" key={i} style={{ marginBottom: 8 }}>
                <input className="input" style={{ flex: 1 }} placeholder="عنوان (مثلاً رنگ)" value={sp.k} onChange={(e) => setF({ ...f, specs: f.specs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)) })} />
                <input className="input" style={{ flex: 2 }} placeholder="مقدار" value={sp.v} onChange={(e) => setF({ ...f, specs: f.specs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)) })} />
                <button type="button" className="btn btn-sm btn-danger" onClick={() => setF({ ...f, specs: f.specs.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setF({ ...f, specs: [...f.specs, { k: "", v: "" }] })}>+ افزودن مشخصه</button>
          </div>
        </div>
        <div>
          <div className="panel">
            <h3>قیمت‌گذاری</h3>
            <div className="tabs">
              <button type="button" className={f.pricing_mode === "gold" ? "on" : ""} onClick={() => setF({ ...f, pricing_mode: "gold" })}>بر اساس نرخ روز طلا</button>
              <button type="button" className={f.pricing_mode === "fixed" ? "on" : ""} onClick={() => setF({ ...f, pricing_mode: "fixed" })}>قیمت ثابت</button>
            </div>
            <div className="grid2">
              <Field label="عیار">
                <select className="input" value={f.karat} onChange={set("karat")}>{[18, 21, 22, 24, 17, 14].map((k) => <option key={k} value={k}>{k} عیار</option>)}</select>
              </Field>
              <Field label="وزن (گرم)"><input className="input ltr" type="number" step="0.001" min="0" value={f.weight} onChange={set("weight")} required={f.pricing_mode === "gold"} /></Field>
            </div>
            {f.pricing_mode === "gold" ? (
              <>
                <div className="grid3">
                  <Field label="اجرت ساخت ٪"><input className="input ltr" type="number" step="0.1" min="0" value={f.labor_percent} onChange={set("labor_percent")} /></Field>
                  <Field label="سود فروشنده ٪"><input className="input ltr" type="number" step="0.1" min="0" value={f.profit_percent} onChange={set("profit_percent")} /></Field>
                  <Field label="تخفیف اجرت و سود ٪"><input className="input ltr" type="number" step="1" min="0" max="100" value={f.discount_percent} onChange={set("discount_percent")} /></Field>
                </div>
                <Field label="قیمت سنگ / نگین (تومان)"><input className="input ltr" type="number" min="0" value={f.stone_price} onChange={set("stone_price")} /></Field>
              </>
            ) : (
              <div className="grid2">
                <Field label="قیمت (تومان) *"><input className="input ltr" type="number" min="0" value={f.fixed_price} onChange={set("fixed_price")} required /></Field>
                <Field label="تخفیف ٪"><input className="input ltr" type="number" min="0" max="100" value={f.discount_percent} onChange={set("discount_percent")} /></Field>
              </div>
            )}
            {pv && (
              <div className="breakdown">
                {f.pricing_mode === "gold" && (
                  <>
                    <div><span>نرخ هر گرم {nf(f.karat)} عیار</span><span>{toman(pv.rate)}</span></div>
                    <div><span>ارزش طلا</span><span>{toman(pv.gold)}</span></div>
                    <div><span>اجرت</span><span>{toman(pv.labor)}</span></div>
                    <div><span>سود</span><span>{toman(pv.profit)}</span></div>
                    <div><span>مالیات ({nf(gold.data.vat_percent)}٪)</span><span>{toman(pv.tax)}</span></div>
                  </>
                )}
                <div><span>قیمت فروش امروز</span><span>{toman(pv.price)}</span></div>
              </div>
            )}
          </div>
          <div className="panel">
            <h3>انبار و نمایش</h3>
            <Field label="موجودی (عدد)"><input className="input ltr" type="number" min="0" value={f.stock} onChange={set("stock")} /></Field>
            <div className="row" style={{ marginBottom: 10 }}><Switch checked={f.active} onChange={(v) => setF({ ...f, active: v ? 1 : 0 })} label="فعال" /> نمایش در سایت و فیدها (ترب و…)</div>
            <div className="row"><Switch checked={f.featured} onChange={(v) => setF({ ...f, featured: v ? 1 : 0 })} label="ویژه" /> نمایش در «مجموعه منتخب» صفحه‌ی اول</div>
          </div>
          <Images productId={isNew ? null : f.id} images={f.images || []} setImages={(images) => setF((x) => ({ ...x, images }))} pending={pending} setPending={setPending} />
        </div>
      </div>
    </form>
  );
}
