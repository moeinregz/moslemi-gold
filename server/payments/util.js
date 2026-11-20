/** همه‌ی درگاه‌های ایرانی مبلغ رو به ریال می‌گیرن؛ قیمت‌های سایت تومانه */
export const toRial = (toman) => Math.round(toman) * 10;

export async function postJson(url, body, headers = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

