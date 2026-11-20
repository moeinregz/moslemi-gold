import { useState } from "react";
import { useAdmin } from "./AdminApp.jsx";
import { Field } from "./ui.jsx";

export default function Profile() {
  const { call, notify, me } = useAdmin();
  const [f, setF] = useState({ current_password: "", new_password: "", repeat: "" });
  const [err, setErr] = useState(null);
  async function save(e) {
    e.preventDefault();
    setErr(null);
    if (f.new_password !== f.repeat) return setErr("تکرار رمز با رمز جدید یکی نیست.");
    try {
      await call("/me/password", { method: "PUT", body: f });
      notify("رمز عوض شد؛ بقیه‌ی دستگاه‌ها خارج شدند ✓");
      setF({ current_password: "", new_password: "", repeat: "" });
    } catch (e2) {
      setErr(e2.message);
    }
  }
  return (
    <form className="panel" style={{ maxWidth: 460 }} onSubmit={save}>
      <h3>{me.name} — {me.role_title}</h3>
      <Field label="رمز فعلی"><input className="input ltr" type="password" required value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} autoComplete="current-password" /></Field>
      <Field label="رمز جدید (حداقل ۸ کاراکتر)"><input className="input ltr" type="password" required minLength={8} value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} autoComplete="new-password" /></Field>
      <Field label="تکرار رمز جدید"><input className="input ltr" type="password" required value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} autoComplete="new-password" /></Field>
      {err && <div className="alert err">{err}</div>}
      <button className="btn btn-gold">تغییر رمز</button>
    </form>
  );
}
