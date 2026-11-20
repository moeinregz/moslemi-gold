import { useEffect, useState } from "react";
import { useAdmin } from "./AdminApp.jsx";
import { useAdminData, Loading, ErrorBox, Field, Switch, CopyBox } from "./ui.jsx";
import { nf, ago } from "../format.js";

export default function Channels() {
  const { call, notify } = useAdmin();
  const { data, loading, error, reload } = useAdminData("/channels");
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState("");
  const [cats, setCats] = useState([]);
  const [catQ, setCatQ] = useState("");
  const [syncOut, setSyncOut] = useState(null);
  useEffect(() => {
    if (data) setF(data.values);
  }, [data]);
  if (loading || !f) return error ? <ErrorBox error={error} /> : <Loading />;
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const sw = (k) => <Switch checked={f[k] === "1"} onChange={(v) => setF({ ...f, [k]: v ? "1" : "0" })} label={k} />;

  async function save() {
    await call("/channels", { method: "PUT", body: f });
    notify("ذخیره شد ✓");
    reload();
  }
  async function run(name, fn) {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      notify(e.message, true);
    }
    setBusy("");
  }

  return (
    <>
      <div className="alert info">قیمت‌ها در همه‌ی فیدها لحظه‌ای و با نرخ روز طلا ساخته می‌شوند. محصولات غیرفعال در فیدها نمی‌آیند و محصولات ناموجود با وضعیت «ناموجود» ارسال می‌شوند. <b>SITE_URL</b> در فایل .env باید دامنه‌ی واقعی سایت باشد.</div>

      <div className="two-col" style={{ alignItems: "start" }}>
        <div className="panel">
          <div className="row"><h3 style={{ margin: 0 }}>ترب (torob.com)</h3><span className="spacer" />{sw("torob_enabled")}</div>
          <ol className="small muted" style={{ paddingInlineStart: 18, margin: "12px 0", listStyle: "decimal" }}>
            <li>در <a className="gold" href="https://panel.torob.com" target="_blank" rel="noreferrer">پنل فروشگاه‌های ترب</a> ثبت‌نام کنید و دامنه را تأیید کنید.</li>
            <li>در بخش «وب‌سرویس / API محصولات» آدرس زیر را وارد کنید.</li>
            <li>ترب صفحه‌ی هر محصول را هم می‌خواند؛ متاتگ‌های قیمت و موجودی خودکار روی صفحه‌ها هست.</li>
          </ol>
          <CopyBox value={data.feeds.torob} />
          <Field label="توکن (اختیاری)" hint="اگر پر باشد، فید فقط با ?token= یا هدر X-Torob-Token جواب می‌دهد">
            <div className="copy-box"><input className="input ltr" value={f.torob_token} onChange={set("torob_token")} /><button type="button" className="btn btn-sm btn-outline" onClick={() => run("t", async () => { const r = await call("/channels/token/torob", { method: "POST" }); setF({ ...f, torob_token: r.token }); reload(); })}>ساخت</button></div>
          </Field>
          <a className="btn btn-sm btn-outline" href={data.feeds.torob} target="_blank" rel="noreferrer">مشاهده‌ی خروجی</a>
        </div>

        <div className="panel">
          <div className="row"><h3 style={{ margin: 0 }}>ایمالز (emalls.ir)</h3><span className="spacer" />{sw("emalls_enabled")}</div>
          <p className="small muted" style={{ margin: "12px 0" }}>در پنل فروشندگان ایمالز، این آدرس را به‌عنوان وب‌سرویس محصولات بدهید. پارامترهای page و item_per_page پشتیبانی می‌شوند.</p>
          <CopyBox value={data.feeds.emalls} />
          <Field label="توکن (اختیاری)">
            <div className="copy-box"><input className="input ltr" value={f.emalls_token} onChange={set("emalls_token")} /><button type="button" className="btn btn-sm btn-outline" onClick={() => run("e", async () => { const r = await call("/channels/token/emalls", { method: "POST" }); setF({ ...f, emalls_token: r.token }); reload(); })}>ساخت</button></div>
          </Field>
        </div>

        <div className="panel">
          <div className="row"><h3 style={{ margin: 0 }}>فید عمومی (گوگل، دیجی‌کالا، اسنپ‌شاپ و…)</h3><span className="spacer" />{sw("google_feed_enabled")}</div>
          <p className="small muted" style={{ margin: "12px 0" }}>فید XML استاندارد Google Merchant برای گوگل شاپینگ و هر مقایسه‌گری که فید XML می‌گیرد. فایل CSV برای ورود گروهی محصولات در پنل فروشندگی دیجی‌کالا، اسنپ‌شاپ، شیپور و سایر بازارها.</p>
          <Field label="فید XML"><CopyBox value={data.feeds.xml} /></Field>
          <Field label="خروجی CSV (اکسل)"><CopyBox value={data.feeds.csv} /></Field>
          <Field label="نقشه‌ی سایت برای گوگل (Search Console)"><CopyBox value={data.feeds.sitemap} /></Field>
        </div>

        <div className="panel">
          <h3>باسلام (ارسال مستقیم محصول به غرفه)</h3>
          <div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <div className="stat"><span>در باسلام</span><b>{nf(data.basalam.synced || 0)}</b></div>
            <div className="stat"><span>خطا</span><b>{nf(data.basalam.errors || 0)}</b></div>
            <div className="stat"><span>آخرین همگام‌سازی</span><small>{ago(data.basalam.last)}</small></div>
          </div>
          <Field label="توکن دسترسی شخصی" hint="developers.basalam.com/panel/tokens — دسترسی vendor.product.read و vendor.product.write">
            <input className="input ltr" type="password" value={f.basalam_token} onChange={set("basalam_token")} autoComplete="off" />
          </Field>
          <div className="grid2">
            <Field label="شناسه‌ی غرفه" hint="با «تست اتصال» خودکار پر می‌شود"><input className="input ltr" value={f.basalam_vendor_id} onChange={set("basalam_vendor_id")} /></Field>
            <Field label="شناسه‌ی دسته در باسلام"><input className="input ltr" value={f.basalam_category_id} onChange={set("basalam_category_id")} /></Field>
          </div>
          <div className="copy-box" style={{ marginBottom: 10 }}>
            <input className="input" placeholder="جستجوی دسته‌ی باسلام (مثلاً طلا)" value={catQ} onChange={(e) => setCatQ(e.target.value)} />
            <button type="button" className="btn btn-sm btn-outline" onClick={() => run("c", async () => setCats(await call(`/channels/basalam/categories?q=${encodeURIComponent(catQ)}`)))}>جستجو</button>
          </div>
          {cats.map((c) => <button type="button" key={c.id} className="chip" style={{ margin: 3 }} onClick={() => setF({ ...f, basalam_category_id: String(c.id) })}>{c.path} ({c.id})</button>)}
          <div className="grid2 mt">
            <Field label="واحد قیمت در باسلام"><select className="input" value={f.basalam_price_unit} onChange={set("basalam_price_unit")}><option value="rial">ریال</option><option value="toman">تومان</option></select></Field>
            <Field label="زمان آماده‌سازی (روز)"><input className="input ltr" type="number" value={f.basalam_preparation_days} onChange={set("basalam_preparation_days")} /></Field>
          </div>
          <div className="row">
            <button type="button" className="btn btn-sm btn-outline" disabled={!!busy} onClick={() => run("b", async () => { await call("/channels", { method: "PUT", body: f }); const r = await call("/channels/basalam/test", { method: "POST" }); notify(r.message, !r.ok); reload(); })}>{busy === "b" ? "…" : "تست اتصال"}</button>
            <button type="button" className="btn btn-sm btn-gold" disabled={!!busy || !data.basalam.ready} onClick={() => run("s", async () => { const r = await call("/channels/basalam/sync-all", { method: "POST" }); setSyncOut(r); reload(); })}>{busy === "s" ? "در حال ارسال…" : "ارسال / به‌روزرسانی همه‌ی محصولات"}</button>
          </div>
          {syncOut && <div className={`alert ${syncOut.fail ? "err" : "ok"} mt`}>{nf(syncOut.ok)} موفق، {nf(syncOut.fail)} ناموفق{syncOut.errors.map((e) => <div key={e} className="small">{e}</div>)}</div>}
          {data.errors.length > 0 && <div className="mt small">{data.errors.map((e) => <div key={e.id} style={{ color: "#f1a5a5" }}>{e.title}: {e.basalam_error}</div>)}</div>}
          <p className="small muted mt">چون قیمت طلا روزانه تغییر می‌کند، بعد از به‌روزرسانی نرخ روز، این دکمه را بزنید تا قیمت‌ها در باسلام هم به‌روز شود.</p>
        </div>
      </div>
      <div className="row mt"><button className="btn btn-gold" onClick={() => run("save", save)}>ذخیره‌ی تنظیمات کانال‌ها</button></div>
    </>
  );
}
