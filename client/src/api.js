/** درخواست به API؛ خطاها با پیام فارسی سرور پرتاب می‌شن */
export async function api(path, { method = "GET", body, form } = {}) {
  const opts = { method, headers: { "X-Requested-With": "fetch" }, credentials: "same-origin" };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data?.error || `خطا (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
