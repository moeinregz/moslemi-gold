import { useState } from "react";
import { useAdmin } from "./AdminApp.jsx";
import { useAdminData, Loading, ErrorBox, Modal, Field, Switch } from "./ui.jsx";
import { JewelIcon, ICON_NAMES } from "../icons.jsx";
import { nf } from "../format.js";

export default function Categories() {
  const { call, notify, can } = useAdmin();
  const { data, loading, error, reload } = useAdminData("/categories");
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const editable = can("categories");

  async function save(e) {
    e.preventDefault();
    setErr(null);
    try {
      if (edit.id) await call(`/categories/${edit.id}`, { method: "PUT", body: edit });
      else await call("/categories", { method: "POST", body: edit });
      setEdit(null);
      notify("ذخیره شد ✓");
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  }
  async function del(c) {
    if (!confirm(`دسته‌ی «${c.name}» حذف شود؟ ${c.product_count ? `${nf(c.product_count)} محصول بدون دسته می‌شوند.` : ""}`)) return;
    try {
      await call(`/categories/${c.id}`, { method: "DELETE" });
      reload();
    } catch (e2) {
      notify(e2.message, true);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      {editable && <div className="row" style={{ marginBottom: 18 }}><span className="spacer" /><button className="btn btn-gold" onClick={() => setEdit({ name: "", slug: "", description: "", icon: "ring", sort: data.length, active: 1 })}>+ دسته‌ی جدید</button></div>}
      <div className="panel table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th></th><th>نام</th><th>نامک</th><th>توضیح</th><th>ترتیب</th><th>محصول</th><th>وضعیت</th><th></th></tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td><div className="thumb-ph"><JewelIcon name={c.icon} /></div></td>
                <td>{c.name}</td><td className="ltr small">{c.slug}</td><td className="small muted">{c.description}</td>
                <td>{nf(c.sort)}</td><td>{nf(c.product_count)}</td>
                <td>{c.active ? "فعال" : <span className="muted">مخفی</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>{editable && <><button className="btn btn-sm btn-outline" onClick={() => setEdit(c)}>ویرایش</button> <button className="btn btn-sm btn-danger" onClick={() => del(c)}>حذف</button></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.id ? "ویرایش دسته" : "دسته‌ی جدید"} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <Field label="نام"><input className="input" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="نامک (انگلیسی یا فارسی، برای آدرس)"><input className="input ltr" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Field>
            <Field label="توضیح کوتاه"><input className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <div className="grid2">
              <Field label="آیکن">
                <select className="input" value={edit.icon} onChange={(e) => setEdit({ ...edit, icon: e.target.value })}>
                  {Object.entries(ICON_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="ترتیب نمایش"><input className="input ltr" type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: e.target.value })} /></Field>
            </div>
            <div className="row" style={{ marginBottom: 16 }}><Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v ? 1 : 0 })} label="فعال" /> نمایش در سایت</div>
            {err && <div className="alert err">{err}</div>}
            <div className="row"><button className="btn btn-gold">ذخیره</button><button type="button" className="btn btn-outline" onClick={() => setEdit(null)}>انصراف</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
