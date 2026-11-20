import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

const SiteCtx = createContext(null);
const KEY = "msl_cart_v1";

function readCart() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function SiteProvider({ children }) {
  const [site, setSite] = useState(null);
  const [cart, setCart] = useState(readCart);
  const [toast, setToast] = useState(null);

  const reload = useCallback(() => api("/api/site").then(setSite).catch(() => setSite((s) => s || { settings: {}, ticker: [], categories: [], payment_methods: [] })), []);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cart));
    } catch {}
  }, [cart]);
  // هماهنگی سبد بین تب‌ها
  useEffect(() => {
    const on = (e) => e.key === KEY && setCart(readCart());
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);

  const notify = useCallback((msg, err = false) => {
    setToast({ msg, err, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 2900 ? null : t)), 3000);
  }, []);

  const cartApi = useMemo(() => ({
    items: cart,
    count: cart.reduce((a, i) => a + i.qty, 0),
    add(p, qty = 1) {
      setCart((c) => {
        const ex = c.find((i) => i.product_id === p.id);
        const max = Math.max(1, p.stock || 1);
        if (ex) return c.map((i) => (i.product_id === p.id ? { ...i, qty: Math.min(max, i.qty + qty) } : i));
        return [...c, { product_id: p.id, qty: Math.min(max, qty), title: p.title, slug: p.slug, image: p.images?.[0]?.url || "", icon: p.category_slug }];
      });
    },
    setQty: (id, qty) => setCart((c) => c.map((i) => (i.product_id === id ? { ...i, qty: Math.max(1, Math.min(20, qty)) } : i))),
    remove: (id) => setCart((c) => c.filter((i) => i.product_id !== id)),
    clear: () => setCart([]),
  }), [cart]);

  return <SiteCtx.Provider value={{ site, reload, cart: cartApi, notify, toast }}>{children}</SiteCtx.Provider>;
}

export const useSite = () => useContext(SiteCtx);
