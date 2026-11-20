import { useState } from "react";
import { useAdminData, Loading, ErrorBox } from "./ui.jsx";
import { faDate } from "../format.js";

export default function Logs() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAdminData(`/logs?page=${page}`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <div className="panel table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th>زمان</th><th>کاربر</th><th>عملیات</th><th>مورد</th><th>جزئیات</th></tr></thead>
          <tbody>
            {data.map((l) => (
              <tr key={l.id}>
                <td className="small" style={{ whiteSpace: "nowrap" }}>{faDate(l.created_at)}</td>
                <td>{l.username}</td>
                <td>{l.action}</td>
                <td className="small muted">{l.entity}{l.entity_id ? ` #${l.entity_id}` : ""}</td>
                <td className="small muted" style={{ maxWidth: 360, wordBreak: "break-word" }}>{l.details}</td>
              </tr>
            ))}
            {!data.length && <tr><td colSpan={5} className="center muted" style={{ padding: 30 }}>موردی نیست.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>جدیدتر</button>
        <button className="btn btn-sm btn-outline" disabled={data.length < 50} onClick={() => setPage(page + 1)}>قدیمی‌تر</button>
      </div>
    </>
  );
}
