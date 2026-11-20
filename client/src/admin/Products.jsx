import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAdmin } from "./AdminApp.jsx";
import { useAdminData, Loading, ErrorBox, Switch } from "./ui.jsx";
import { JewelIcon } from "../icons.jsx";
import { toman, nf } from "../format.js";

export default function Products() {
  const { call, notify, can } = useAdmin();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const qs = new URLSearchParams({ q, category: cat, status }).toString();
  const { data, loading, error, reload, setData } = useAdminData(`/products?${qs}`);
  const cats = useAdminData("/categories");
  const nav = useNavigate();

  async function quick(p, patch) {
    try {
      const updated = await call(`/products/${p.id}`, { method: "PATCH", body: { ...patch, version: p.version } });
      setData(data.map((x) => (x.id === p.id ? { ...x, ...patch, version: updated.version, price: updated.pricing.price } : x)));
    } catch (e) {
      notify(e.message, true);
      if (e.status === 409) reload();
    }
  }
  async function del(p) {
    if (!confirm(`«${p.title}» برای همیشه حذف شود؟`)) return;
    try {
      await call(`/products/${p.id}`, { method: "DELETE" });
      notify("حذف شد");
      reload();
    } catch (e) {
      notify(e.message, true);
    }
  }
  async function basalam(p) {
    notify("در حال ارسال به باسلام…");
    try {
      const r = await call(`/channels/basalam/sync/${p.id}`, { method: "POST" });
      notify(r.message, !r.ok);
    } catch (e) {
      notify(e.message, true);
    }
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 18 }}>
        <input className="input" style={{ maxWidth: 220 }} placeholder="جستجوی نام یا کد…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 180 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">همه‌ی دسته‌ها</option>
          {(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" style={{ maxWidth: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">همه</option><option value="active">فعال</option><option value="inactive">غیرفعال</option><option value="out">ناموجود</option>
        </select>
        <span className="spacer" />
        <button className="btn btn-gold" onClick={() => nav("/admin/products/new")}>+ محصول جدید</button>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="panel table-wrap" style={{ padding: 0 }}>
          <table className="tbl">
            <thead><tr><th></th><th>محصول</th><th>دسته</th><th>وزن/عیار</th><th>قیمت روز</th><th>موجودی</th><th>فعال</th><th>ویژه</th><th></th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td>{p.image ? <img className="thumb-sm" src={p.image} alt="" /> : <div className="thumb-ph"><JewelIcon name="ring" /></div>}</td>
                  <td><Link className="gold" to={`/admin/products/${p.id}`}>{p.title}</Link><div className="small muted">{p.sku} · ویرایش: {p.updated_by || "—"}</div></td>
                  <td>{p.category_name || "—"}</td>
                  <td>{p.pricing_mode === "gold" ? `${nf(p.weight)} گرم · ${nf(p.karat)}` : "قیمت ثابت"}</td>
                  <td>{toman(p.price)}{p.discount_percent > 0 && <div className="small gold">{nf(p.discount_percent)}٪ تخفیف</div>}</td>
                  <td><input className="input inline-num" type="number" min="0" defaultValue={p.stock} key={`${p.id}-${p.stock}`} onBlur={(e) => Number(e.target.value) !== p.stock && quick(p, { stock: Number(e.target.value) })} /></td>
                  <td><Switch checked={p.active} onChange={(v) => quick(p, { active: v })} label="فعال" /></td>
                  <td><Switch checked={p.featured} onChange={(v) => quick(p, { featured: v })} label="ویژه" /></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <a className="btn btn-sm btn-outline" href={`/product/${p.slug}`} target="_blank" rel="noreferrer">نمایش</a>{" "}
                    {can("channels") && <button className="btn btn-sm btn-outline" onClick={() => basalam(p)} title={p.basalam_error || ""}>باسلام{p.basalam_id ? " ✓" : ""}</button>}{" "}
                    <button className="btn btn-sm btn-danger" onClick={() => del(p)}>حذف</button>
                  </td>
                </tr>
              ))}
              {!data.length && <tr><td colSpan={9} className="center muted" style={{ padding: 30 }}>محصولی نیست.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
