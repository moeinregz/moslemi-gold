import { useState } from "react";
import { useAdmin } from "./AdminApp.jsx";
import { useAdminData, Loading, ErrorBox, Modal, Field, Switch } from "./ui.jsx";
import { ago, nf } from "../format.js";

export default function Users() {
  const { call, notify, roles, permissions, me } = useAdmin();
  const { data, loading, error, reload } = useAdminData("/users");
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);

  async function save(e) {
    e.preventDefault();
    setErr(null);
    try {
      if (edit.id) await call(`/users/${edit.id}`, { method: "PUT", body: edit });
      else await call("/users", { method: "POST", body: edit });
      notify("ذخیره شد ✓");
      setEdit(null);
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  }
  async function act(u, what) {
    try {
      if (what === "del") {
        if (!confirm(`کاربر «${u.name}» حذف شود؟`)) return;
        await call(`/users/${u.id}`, { method: "DELETE" });
      } else await call(`/users/${u.id}/logout`, { method: "POST" });
      notify(what === "del" ? "حذف شد" : "از همه‌ی دستگاه‌ها خارج شد");
      reload();
    } catch (e) {
      notify(e.message, true);
    }
  }
  const rolePerms = (u) => (u.role === "custom" ? u.perms : roles[u.role]?.perms || []);

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <div className="row" style={{ marginBottom: 18 }}>
        <p className="muted small">هر نفر با نام کاربری خودش وارد می‌شود و چند نفر هم‌زمان می‌توانند کار کنند. همه‌ی کارها به اسم هر نفر در «گزارش فعالیت» ثبت می‌شود.</p>
        <span className="spacer" />
        <button className="btn btn-gold" onClick={() => { setErr(null); setEdit({ username: "", name: "", password: "", role: "support", perms: [], active: 1 }); }}>+ کاربر جدید</button>
      </div>
      <div className="panel table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th>نام</th><th>نام کاربری</th><th>نقش</th><th>دسترسی‌ها</th><th>آخرین فعالیت</th><th>وضعیت</th><th></th></tr></thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id}>
                <td>{u.online && <span className="online-dot" title="آنلاین" />}{u.name}{u.id === me.id && <span className="small muted"> (شما)</span>}</td>
                <td className="ltr">{u.username}</td>
                <td>{roles[u.role]?.title || u.role}</td>
                <td className="small muted" style={{ maxWidth: 260 }}>{rolePerms(u).map((p) => permissions[p]).join("، ")}</td>
                <td className="small">{u.last_seen ? ago(u.last_seen) : "هرگز"}{u.sessions > 0 && <div className="muted">{nf(u.sessions)} دستگاه</div>}</td>
                <td>{u.active ? "فعال" : <span style={{ color: "#f1a5a5" }}>غیرفعال</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-sm btn-outline" onClick={() => { setErr(null); setEdit({ ...u, password: "" }); }}>ویرایش</button>{" "}
                  {u.sessions > 0 && u.id !== me.id && <button className="btn btn-sm btn-outline" onClick={() => act(u, "logout")}>خروج اجباری</button>}{" "}
                  {u.id !== me.id && <button className="btn btn-sm btn-danger" onClick={() => act(u, "del")}>حذف</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel mt">
        <h3>نقش‌ها و دسترسی‌ها</h3>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>بخش</th>{Object.entries(roles).filter(([k]) => k !== "custom").map(([k, r]) => <th key={k}>{r.title}</th>)}</tr></thead>
            <tbody>
              {Object.entries(permissions).map(([p, label]) => (
                <tr key={p}><td>{label}</td>{Object.entries(roles).filter(([k]) => k !== "custom").map(([k, r]) => <td key={k} className="gold">{r.perms.includes(p) ? "✓" : ""}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted mt">اگر هیچ‌کدام از نقش‌ها مناسب نیست، نقش «سفارشی» را انتخاب کنید و دسترسی‌ها را تک‌تک تیک بزنید.</p>
      </div>

      {edit && (
        <Modal title={edit.id ? `ویرایش ${edit.name}` : "کاربر جدید پنل"} onClose={() => setEdit(null)}>
          <form onSubmit={save} autoComplete="off">
            <div className="grid2">
              <Field label="نام و نام خانوادگی"><input className="input" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="نام کاربری (انگلیسی)"><input className="input ltr" required disabled={!!edit.id} value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} autoComplete="off" /></Field>
            </div>
            <Field label={edit.id ? "رمز جدید (خالی = بدون تغییر)" : "رمز عبور (حداقل ۸ کاراکتر)"}>
              <input className="input ltr" type="password" required={!edit.id} minLength={8} value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="نقش">
              <select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                {Object.entries(roles).map(([k, r]) => <option key={k} value={k}>{r.title}</option>)}
              </select>
            </Field>
            <div className="perm-grid" style={{ marginBottom: 14 }}>
              {Object.entries(permissions).map(([p, label]) => {
                const custom = edit.role === "custom";
                const on = custom ? edit.perms.includes(p) : roles[edit.role].perms.includes(p);
                return (
                  <label className="check" key={p} style={{ opacity: custom ? 1 : 0.6 }}>
                    <input type="checkbox" disabled={!custom} checked={on} onChange={(e) => setEdit({ ...edit, perms: e.target.checked ? [...edit.perms, p] : edit.perms.filter((x) => x !== p) })} />
                    {label}
                  </label>
                );
              })}
            </div>
            <div className="row" style={{ marginBottom: 16 }}><Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v ? 1 : 0 })} label="فعال" /> حساب فعال است</div>
            {err && <div className="alert err">{err}</div>}
            <div className="row"><button className="btn btn-gold">ذخیره</button><button type="button" className="btn btn-outline" onClick={() => setEdit(null)}>انصراف</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
