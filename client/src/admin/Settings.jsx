import { useEffect, useState } from "react";
import { useAdmin } from "./AdminApp.jsx";
import { useAdminData, Loading, ErrorBox, Field, Switch, CopyBox } from "./ui.jsx";

export default function Settings() {
  const { call, notify } = useAdmin();
  const { data, loading, error, reload } = useAdminData("/settings");
  const [f, setF] = useState(null);
  const [tab, setTab] = useState("store");
  const [test, setTest] = useState({});
  useEffect(() => {
    if (data) setF(data.values);
  }, [data]);
  if (loading || !f) return error ? <ErrorBox error={error} /> : <Loading />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const sw = (k, label) => <div className="row" style={{ marginBottom: 14 }}><Switch checked={f[k] === "1"} onChange={(v) => setF({ ...f, [k]: v ? "1" : "0" })} label={label} />{label}</div>;
  const cb = (id) => data.gateways.find((g) => g.id === id)?.callback;

  async function save(e) {
    e?.preventDefault();
    try {
      await call("/settings", { method: "PUT", body: f });
      notify("تنظیمات ذخیره شد ✓");
      reload();
    } catch (e2) {
      notify(e2.message, true);
    }
  }
  async function runTest(id) {
    setTest({ ...test, [id]: { message: "در حال بررسی…" } });
    try {
      setTest({ ...test, [id]: await call(`/settings/test/${id}`, { method: "POST", body: f }) });
    } catch (e) {
      setTest({ ...test, [id]: { ok: false, message: e.message } });
    }
  }
  const T = ({ id }) => test[id] ? <div className={`alert ${test[id].ok ? "ok" : test[id].ok === false ? "err" : "info"}`}>{test[id].message}</div> : null;

  return (
    <form onSubmit={save}>
      <div className="tabs">
        {[["store", "اطلاعات فروشگاه"], ["shipping", "ارسال و سفارش"], ["payment", "درگاه پرداخت"]].map(([k, v]) => (
          <button type="button" key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{v}</button>
        ))}
      </div>
      {tab === "store" && (
        <div className="panel">
          <div className="grid2">
            <Field label="نام فروشگاه"><input className="input" value={f.store_name} onChange={set("store_name")} /></Field>
            <Field label="شعار"><input className="input" value={f.store_tagline} onChange={set("store_tagline")} /></Field>
            <Field label="تلفن"><input className="input" value={f.store_phone} onChange={set("store_phone")} /></Field>
            <Field label="ساعت کاری"><input className="input" value={f.store_hours} onChange={set("store_hours")} /></Field>
          </div>
          <Field label="نشانی"><textarea className="input" value={f.store_address} onChange={set("store_address")} /></Field>
          <div className="grid3">
            <Field label="لینک اینستاگرام"><input className="input ltr" value={f.instagram} onChange={set("instagram")} placeholder="https://instagram.com/…" /></Field>
            <Field label="لینک تلگرام"><input className="input ltr" value={f.telegram} onChange={set("telegram")} /></Field>
            <Field label="لینک واتس‌اپ"><input className="input ltr" value={f.whatsapp} onChange={set("whatsapp")} /></Field>
          </div>
        </div>
      )}
      {tab === "shipping" && (
        <div className="panel">
          <div className="grid2">
            <Field label="هزینه‌ی ارسال (تومان)"><input className="input ltr" type="number" value={f.shipping_cost} onChange={set("shipping_cost")} /></Field>
            <Field label="ارسال رایگان برای خرید بالای (تومان)" hint="۰ یعنی همیشه هزینه‌ی ارسال گرفته شود"><input className="input ltr" type="number" value={f.free_shipping_over} onChange={set("free_shipping_over")} /></Field>
            <Field label="مهلت پرداخت سفارش (دقیقه)" hint="سفارش پرداخت‌نشده بعد از این زمان «ناموفق» می‌شود"><input className="input ltr" type="number" value={f.order_expire_minutes} onChange={set("order_expire_minutes")} /></Field>
          </div>
          {sw("pickup_enabled", "امکان تحویل حضوری در فروشگاه")}
        </div>
      )}
      {tab === "payment" && (
        <>
          <div className="alert info">مبالغ به ریال به درگاه ارسال می‌شوند (قیمت‌های سایت تومان است). آدرس بازگشت هر درگاه را در صورت نیاز در پنل درگاه ثبت کنید.</div>
          <div className="two-col" style={{ alignItems: "start" }}>
            <div className="panel">
              <h3>زرین‌پال</h3>
              {sw("zarinpal_enabled", "فعال")}
              <Field label="مرچنت کد (۳۶ کاراکتر)"><input className="input ltr" value={f.zarinpal_merchant} onChange={set("zarinpal_merchant")} /></Field>
              {sw("zarinpal_sandbox", "حالت تست (sandbox)")}
              <Field label="آدرس بازگشت"><CopyBox value={cb("zarinpal")} /></Field>
              <T id="zarinpal" />
              <button type="button" className="btn btn-sm btn-outline" onClick={() => runTest("zarinpal")}>تست اتصال</button>
            </div>
            <div className="panel">
              <h3>زیبال</h3>
              {sw("zibal_enabled", "فعال")}
              <Field label="مرچنت" hint="برای تست کلمه‌ی zibal را وارد کنید"><input className="input ltr" value={f.zibal_merchant} onChange={set("zibal_merchant")} /></Field>
              <Field label="آدرس بازگشت"><CopyBox value={cb("zibal")} /></Field>
              <T id="zibal" />
              <button type="button" className="btn btn-sm btn-outline" onClick={() => runTest("zibal")}>تست اتصال</button>
            </div>
            <div className="panel">
              <h3>پرداخت حضوری / کارت‌به‌کارت</h3>
              {sw("offline_enabled", "فعال")}
              <Field label="متنی که به مشتری نشان داده می‌شود"><textarea className="input" value={f.offline_note} onChange={set("offline_note")} /></Field>
              <p className="small muted">این سفارش‌ها با وضعیت «در انتظار تأیید پرداخت» ثبت می‌شوند و موجودی رزرو می‌شود؛ بعد از دریافت وجه، وضعیت را «پرداخت‌شده» کنید.</p>
            </div>
            <div className="panel">
              <h3>درگاه آزمایشی</h3>
              {sw("mock_enabled", "فعال")}
              <div className="alert err small">فقط برای تست فرایند خرید. قبل از راه‌اندازی واقعی حتماً خاموش کنید؛ با این درگاه هر کسی می‌تواند بدون پرداخت سفارش «پرداخت‌شده» بسازد.</div>
            </div>
          </div>
        </>
      )}
      <button className="btn btn-gold mt">ذخیره‌ی تنظیمات</button>
    </form>
  );
}
