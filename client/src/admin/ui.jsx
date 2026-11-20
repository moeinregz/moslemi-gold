import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "./AdminApp.jsx";

/** گرفتن داده از API پنل + تابع reload */
export function useAdminData(path) {
  const { call } = useAdmin();
  const [s, set] = useState({ loading: true, data: null, error: null });
  const reload = useCallback(() => {
    if (!path) return Promise.resolve();
    return call(path)
      .then((data) => set({ loading: false, data, error: null }))
      .catch((error) => set({ loading: false, data: null, error }));
  }, [path, call]);
  useEffect(() => {
    set((x) => ({ ...x, loading: true }));
    reload();
  }, [reload]);
  return { ...s, reload, setData: (data) => set((x) => ({ ...x, data })) };
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const on = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export const Loading = () => <div className="loader" />;
export const ErrorBox = ({ error }) => (error ? <div className="alert err">{error.message || String(error)}</div> : null);

export function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>قبلی</button>
      <span className="muted">صفحه {page.toLocaleString("fa-IR")} از {pages.toLocaleString("fa-IR")}</span>
      <button className="btn btn-sm btn-outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>بعدی</button>
    </div>
  );
}

export function CopyBox({ value }) {
  const { notify } = useAdmin();
  return (
    <div className="copy-box">
      <input className="input ltr" readOnly value={value} onFocus={(e) => e.target.select()} />
      <button type="button" className="btn btn-sm btn-outline" onClick={() => navigator.clipboard?.writeText(value).then(() => notify("کپی شد ✓"))}>کپی</button>
    </div>
  );
}
