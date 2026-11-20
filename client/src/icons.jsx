const P = {
  ring: <><circle cx="32" cy="40" r="15" /><path d="M25 24 L32 10 L39 24 Z" /></>,
  necklace: <><path d="M12 14 C12 34 24 40 32 40 C40 40 52 34 52 14" /><path d="M32 40 L32 48 L27 56 L37 56 Z" /></>,
  bracelet: <><circle cx="32" cy="32" r="20" /><circle cx="32" cy="32" r="12" strokeDasharray="3 4" /></>,
  earring: <><path d="M32 10 L32 18" /><path d="M24 18 C24 30 22 34 20 40 C18 46 24 50 32 50 C40 50 46 46 44 40 C42 34 40 30 40 18 Z" /></>,
  crown: <path d="M20 44 L14 20 L26 26 L32 12 L38 26 L50 20 L44 44 Z" />,
  coin: <><circle cx="32" cy="32" r="19" /><path d="M32 20 L32 44 M23 26 L41 38 M23 38 L41 26" strokeWidth="1" /></>,
};
export const ICON_NAMES = { ring: "انگشتر", necklace: "گردنبند", bracelet: "دستبند", earring: "گوشواره", crown: "تاج / سرویس", coin: "سکه" };
export function JewelIcon({ name = "ring", className, width = 1.4 }) {
  return <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={width}>{P[name] || P.ring}</svg>;
}
const slugIcon = { ring: "ring", necklace: "necklace", bracelet: "bracelet", earring: "earring", "bridal-set": "crown", coin: "coin" };
export const iconForCategory = (slug, fallback) => fallback || slugIcon[slug] || "ring";

const I = (d) => ({ className, ...p }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>{d}</svg>;
export const Icon = {
  cart: I(<><path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" /><circle cx="9.5" cy="20" r="1.2" /><circle cx="17.5" cy="20" r="1.2" /></>),
  user: I(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>),
  pin: I(<><path d="M12 22 C12 22 20 14.5 20 9 A8 8 0 1 0 4 9 C4 14.5 12 22 12 22 Z" /><circle cx="12" cy="9" r="3" /></>),
  phone: I(<path d="M4 5 C4 14 10 20 19 20 L19 16 L15 15 L13 17 C10.5 15.5 8.5 13.5 7 11 L9 9 L8 5 Z" />),
  clock: I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  check: I(<path d="M4 12 L10 18 L20 6" />),
  trash: I(<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>),
  grid: I(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>),
  box: I(<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7M12 11v10" /></>),
  tag: I(<><path d="M3 12V3h9l9 9-9 9-9-9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>),
  receipt: I(<><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6" /></>),
  users: I(<><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /><circle cx="17" cy="7" r="2.5" /><path d="M17 12.5c3 0 5 1.6 5 4.5" /></>),
  people: I(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>),
  gear: I(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  link: I(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  coins: I(<><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3" /></>),
  list: I(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />),
  logout: I(<><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></>),
  menu: I(<path d="M4 6h16M4 12h16M4 18h16" />),
  ext: I(<><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></>),
  instagram: I(<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".6" /></>),
  telegram: I(<path d="M21 4L3 11l6 2 2 6 3-4 5 4 2-15zM9 13l9-6" />),
  whatsapp: I(<><path d="M4 20l1.3-4A8 8 0 1 1 8 18.8L4 20z" /><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1 0-2.5-1.5-2.5-2.5l1-1-1-2L9 9z" /></>),
};
