import { num } from "./settings.js";

/**
 * قیمت‌گذاری طلا (فرمول رایج بازار ایران)
 *   ارزش طلا = وزن × نرخ هر گرم در همون عیار
 *   اجرت = ارزش طلا × درصد اجرت
 *   سود  = (ارزش طلا + اجرت) × درصد سود
 *   مالیات = (اجرت + سود) × درصد مالیات      ← مالیات به خود طلا تعلق نمی‌گیره
 *   قیمت نهایی = ارزش طلا + اجرت + سود + مالیات + سنگ
 * تخفیف روی اجرت و سود اعمال می‌شه (روی خود طلا تخفیف معنی نداره).
 * همه‌ی مبالغ به تومان و به ۱۰۰۰ تومان گرد می‌شن.
 */
export function rateForKarat(rate18, karat) {
  return Math.round((rate18 * (Number(karat) / 24)) / 0.75);
}

const round = (n) => Math.round(n / 1000) * 1000;

export function priceProduct(p, s) {
  const vat = num(s.vat_percent, 10) / 100;
  if (p.pricing_mode === "fixed") {
    const before = round(p.fixed_price);
    const final = round(before * (1 - (p.discount_percent || 0) / 100));
    return { mode: "fixed", price: final, old_price: final < before ? before : 0, breakdown: { fixed: before } };
  }
  const rate18 = num(s.gold_rate_18);
  const rate = rateForKarat(rate18, p.karat);
  const gold = p.weight * rate;
  const calc = (disc) => {
    const labor = gold * (p.labor_percent / 100) * (1 - disc);
    const profit = (gold + labor) * (p.profit_percent / 100) * (1 - disc);
    const tax = (labor + profit) * vat;
    return { labor, profit, tax, total: gold + labor + profit + tax + (p.stone_price || 0) };
  };
  const full = calc(0);
  const disc = calc((p.discount_percent || 0) / 100);
  const price = round(disc.total);
  const old = round(full.total);
  return {
    mode: "gold",
    price,
    old_price: old > price ? old : 0,
    breakdown: {
      rate, karat: p.karat, weight: p.weight,
      gold: round(gold), labor: round(disc.labor), profit: round(disc.profit), tax: round(disc.tax), stone: p.stone_price || 0,
      labor_percent: p.labor_percent, profit_percent: p.profit_percent, vat_percent: num(s.vat_percent, 10),
    },
  };
}

/** نوار قیمت بالای سایت */
export function tickerItems(s) {
  const r18 = num(s.gold_rate_18);
  const items = [
    { label: "طلای ۱۸ عیار (گرم)", value: r18 },
    { label: "طلای ۲۴ عیار (گرم)", value: rateForKarat(r18, 24) },
    { label: "مثقال طلا", value: round(r18 * 4.3318) },
  ];
  for (const line of String(s.ticker_extra || "").split("\n")) {
    const [label, v] = line.split("|");
    if (label?.trim() && num(v) > 0) items.push({ label: label.trim(), value: num(v) });
  }
  return items;
}
