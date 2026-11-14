// منطق کسب‌وکار: موجودی، فاکتور، مرجوعی، روز غرفه، هزینه، گزارش، هشدار
import * as db from './db.js';
import { norm, startOfDay, addDays, isSameDay, nowISO } from './utils.js';

export const SETTINGS_ID = 'local-settings';
export const DEFAULT_SETTINGS = {
  store_name: 'مون وایب',
  low_stock_default: 3,
  stale_days: 60,
  booth_rent_default: 0,
  dash_cards: [
    { key: 'booth', on: true }, { key: 'hero', on: true }, { key: 'widgets', on: true }, { key: 'recent', on: true }
  ]
};
export const DASH_CARD_LABEL = { booth: 'وضعیت روز غرفه', hero: 'فروش امروز', widgets: 'هشدار و سود خالص', recent: 'آخرین فاکتورها' };

export const ORG_KEYS = ['pink', 'sky', 'lav', 'peach', 'yellow'];
export const CAT_ICONS = ['serum', 'jar', 'drop', 'sun', 'leaf', 'sparkle', 'lipstick', 'brush', 'polish', 'perfume', 'comb', 'pump', 'gift', 'box', 'tag', 'heart'];
export const SEED_CATEGORIES = [
  { name: 'مراقبت پوست', prefix: 'SK', icon: 'serum', color: 'pink', sort: 1 },
  { name: 'آرایشی', prefix: 'MU', icon: 'lipstick', color: 'sky', sort: 2 },
  { name: 'مو', prefix: 'HR', icon: 'comb', color: 'yellow', sort: 3 },
  { name: 'بهداشتی', prefix: 'HY', icon: 'pump', color: 'peach', sort: 4 }
];
export const EXPENSE_CATS = {
  rent: 'اجاره‌ی غرفه', packaging: 'بسته‌بندی', ads: 'تبلیغ', shipping: 'ارسال و پیک', salary: 'دستمزد', other: 'سایر', withdraw: 'برداشت'
};
export const PAYMENTS = { cash: 'نقد', pos: 'کارت‌خوان', c2c: 'کارت‌به‌کارت' };
export const CHANNELS = { booth: 'غرفه', direct: 'دایرکت' };

// ---------- تنظیمات مشترک ----------
export function settings() {
  const s = db.get('settings', SETTINGS_ID);
  return { ...DEFAULT_SETTINGS, ...(s || {}), dash_cards: mergeCards(s?.dash_cards) };
}
function mergeCards(list) {
  const base = DEFAULT_SETTINGS.dash_cards;
  if (!Array.isArray(list)) return base.map(x => ({ ...x }));
  const out = list.filter(x => base.some(b => b.key === x.key));
  for (const b of base) if (!out.some(x => x.key === b.key)) out.push({ ...b });
  return out;
}
export async function saveSettings(patch) {
  const cur = db.get('settings', SETTINGS_ID) || { id: SETTINGS_ID };
  return db.save('settings', { ...cur, ...patch, id: SETTINGS_ID });
}

export async function seedCategories() {
  if (db.all('categories').length) return;
  for (const c of SEED_CATEGORIES) await db.save('categories', c, { silent: true });
}

// ---------- دسته و کالا ----------
export const categories = () => db.all('categories').sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name, 'fa'));
export const category = id => db.get('categories', id);
export const products = () => db.all('products');

let stockCache = null, lastSaleCache = null, soldQtyCache = null;
db.on('change', ({ table }) => {
  if (table === 'moves' || table === '*') stockCache = null;
  if (table === 'invoices' || table === '*') { lastSaleCache = null; soldQtyCache = null; }
});
export function stockMap() {
  if (!stockCache) {
    stockCache = new Map();
    for (const m of db.all('moves')) stockCache.set(m.product_id, (stockCache.get(m.product_id) || 0) + (Number(m.qty) || 0));
  }
  return stockCache;
}
export const stockOf = id => stockMap().get(id) || 0;

export function lastSaleMap() {
  if (!lastSaleCache) {
    lastSaleCache = new Map();
    for (const inv of db.all('invoices')) {
      if (inv.kind !== 'sale') continue;
      for (const it of inv.items || []) {
        const p = lastSaleCache.get(it.product_id);
        if (!p || p < inv.created_at) lastSaleCache.set(it.product_id, inv.created_at);
      }
    }
  }
  return lastSaleCache;
}
/** تعداد فروش‌رفته‌ی ۳۰ روز اخیر برای «پرفروش‌ها» */
export function soldQtyMap(days = 30) {
  if (!soldQtyCache) {
    soldQtyCache = new Map();
    const from = addDays(new Date(), -days).toISOString();
    for (const inv of db.all('invoices')) {
      if (inv.created_at < from) continue;
      const sign = inv.kind === 'return' ? -1 : 1;
      for (const it of inv.items || []) soldQtyCache.set(it.product_id, (soldQtyCache.get(it.product_id) || 0) + sign * it.qty);
    }
  }
  return soldQtyCache;
}

export const lowThreshold = p => (p.low_stock ?? null) !== null && p.low_stock !== '' ? Number(p.low_stock) : settings().low_stock_default;

export function productStatus(p) {
  const s = stockOf(p.id);
  if (s < 0) return 'neg';
  if (s <= lowThreshold(p)) return 'low';
  if (isStale(p)) return 'stale';
  return 'ok';
}
export function isStale(p) {
  const days = settings().stale_days;
  const cutoff = addDays(new Date(), -days).toISOString();
  if (stockOf(p.id) <= 0) return false;
  const last = lastSaleMap().get(p.id) || p.created_at;
  return last < cutoff;
}
export function alerts() {
  const neg = [], low = [], stale = [];
  for (const p of products()) {
    const s = stockOf(p.id);
    if (s < 0) neg.push(p);
    else if (s <= lowThreshold(p)) low.push(p);
    else if (isStale(p)) stale.push(p);
  }
  return { neg, low, stale, count: neg.length + low.length + stale.length };
}

export function findByBarcode(code) {
  const c = norm(code);
  if (!c) return null;
  return products().find(p => norm(p.barcode) === c) || products().find(p => norm(p.code) === c) || null;
}
export function searchProducts(q, catId = null) {
  const t = norm(q);
  let list = products();
  if (catId) list = list.filter(p => p.category_id === catId);
  if (t) list = list.filter(p => norm(`${p.name} ${p.variant || ''} ${p.brand || ''} ${p.code} ${p.barcode || ''}`).includes(t));
  return list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}
export function topSellers(n = 12) {
  const sold = soldQtyMap();
  return products().filter(p => (sold.get(p.id) || 0) > 0).sort((a, b) => (sold.get(b.id) || 0) - (sold.get(a.id) || 0)).slice(0, n);
}
export const displayName = p => p ? (p.variant ? `${p.name} · ${p.variant}` : p.name) : '';

/** کد خودکار با پیشوند دسته: SK-0013 */
export function nextCode(catId) {
  const c = category(catId);
  const prefix = (c?.prefix || 'PR').toUpperCase();
  let max = 0;
  for (const p of db.all('products', true)) {
    const m = String(p.code || '').match(new RegExp('^' + prefix + '-(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}
export function barcodeTaken(code, exceptId) {
  const c = norm(code);
  if (!c) return null;
  return products().find(p => p.id !== exceptId && norm(p.barcode) === c) || null;
}

export async function saveProduct(data, { initialQty = 0 } = {}) {
  const isNew = !data.id;
  const p = await db.save('products', data);
  if (isNew && initialQty) await db.save('moves', { product_id: p.id, qty: initialQty, type: 'initial', unit_cost: p.buy_price || 0 });
  await db.audit(isNew ? 'create' : 'update', 'product', p.id, `${displayName(p)} (${p.code})`);
  return p;
}
export async function deleteProduct(p) {
  await db.remove('products', p.id);
  await db.audit('delete', 'product', p.id, `${displayName(p)} (${p.code})`);
}
/** ورود کالا: تعداد + قیمت خرید جدید (روش آخرین قیمت خرید) */
export async function receiveStock(p, qty, unitCost) {
  if (!qty) return;
  await db.save('moves', { product_id: p.id, qty, type: 'in', unit_cost: unitCost || p.buy_price || 0 });
  if (unitCost && unitCost !== p.buy_price) await db.save('products', { ...p, buy_price: unitCost });
  await db.audit('stock_in', 'product', p.id, `${displayName(p)}: +${qty}`);
}
/** اصلاح موجودی به عدد شمارش‌شده */
export async function adjustStock(p, newQty, note = '') {
  const diff = newQty - stockOf(p.id);
  if (!diff) return;
  await db.save('moves', { product_id: p.id, qty: diff, type: 'adjust', note });
  await db.audit('adjust', 'product', p.id, `${displayName(p)}: ${stockOf(p.id) - diff} → ${newQty}`);
}

// ---------- روز غرفه ----------
export const openDay = () => db.all('days').filter(d => !d.closed_at).sort((a, b) => b.opened_at.localeCompare(a.opened_at))[0] || null;
export const closedDays = () => db.all('days').filter(d => d.closed_at).sort((a, b) => b.opened_at.localeCompare(a.opened_at));
export async function startDay() {
  const cur = openDay();
  if (cur) return cur;
  const d = await db.save('days', { opened_at: nowISO() });
  await db.audit('day_open', 'day', d.id, '');
  return d;
}
export function dayInvoices(day) { return db.all('invoices').filter(i => i.day_id === day.id); }
export function daySummary(day) {
  const invs = dayInvoices(day);
  const s = { sales: 0, revenue: 0, profit: 0, count: 0, returns: 0, cash: 0, pos: 0, c2c: 0 };
  for (const i of invs) {
    if (i.kind === 'sale') s.count++; else s.returns++;
    s.revenue += i.revenue; s.profit += i.profit; s[i.payment] = (s[i.payment] || 0) + i.total;
  }
  s.sales = s.revenue;
  return s;
}
export async function closeDay(day, { rent, counted_cash, counted_pos, note }) {
  const s = daySummary(day);
  const d = await db.save('days', {
    ...day, closed_at: nowISO(), rent, counted_cash, counted_pos, expected_cash: s.cash, expected_pos: s.pos, expected_c2c: s.c2c,
    revenue: s.revenue, profit: s.profit, note
  });
  if (rent > 0) await db.save('expenses', { date: nowISO(), category: 'rent', amount: rent, note: 'اجاره‌ی روز غرفه', day_id: day.id });
  await db.audit('day_close', 'day', day.id, `فروش ${s.revenue}`);
  return d;
}
/** فروش غرفه‌ی امروز در برابر روز غرفه‌ی قبلی */
export function boothComparison() {
  const cur = openDay();
  const prev = closedDays().find(d => !cur || d.id !== cur.id);
  if (!cur || !prev) return null;
  const a = daySummary(cur).revenue, b = prev.revenue ?? daySummary(prev).revenue;
  if (!b) return null;
  return { pct: Math.round(((a - b) / b) * 100), prev };
}

// ---------- فاکتور ----------
export function nextInvoiceNo(userCode) {
  const code = (userCode || 'X').toUpperCase();
  let max = 1000;
  for (const i of db.all('invoices', true)) {
    const m = String(i.no || '').match(new RegExp('^' + code + '-(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${code}-${max + 1}`;
}
export function cartTotals(cart, { discountType = 'pct', discountValue = 0, shipping = 0 } = {}) {
  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  let discount = discountType === 'pct' ? Math.round(subtotal * Math.min(100, Math.max(0, discountValue)) / 100) : Math.round(discountValue);
  discount = Math.min(Math.max(0, discount), subtotal);
  const cost = cart.reduce((s, c) => s + (c.cost || 0) * c.qty, 0);
  const revenue = subtotal - discount;
  return { subtotal, discount, revenue, shipping: shipping || 0, total: revenue + (shipping || 0), profit: revenue - cost, qty: cart.reduce((s, c) => s + c.qty, 0) };
}
export async function createInvoice({ cart, channel, discountType, discountValue, payment, shipping, customer, note }, user) {
  if (!cart.length) throw new Error('سبد خالی است');
  const items = cart.map(c => {
    const p = db.get('products', c.product_id);
    const cat = p ? category(p.category_id) : null;
    return { product_id: c.product_id, name: displayName(p) || c.name, code: p?.code || '', category_id: cat?.id || null, category_name: cat?.name || '', qty: c.qty, price: c.price, cost: p?.buy_price || 0 };
  });
  const t = cartTotals(items, { discountType, discountValue, shipping: channel === 'direct' ? shipping : 0 });
  let day = null;
  if (channel === 'booth') day = openDay() || await startDay();
  const inv = await db.save('invoices', {
    no: nextInvoiceNo(user?.code), kind: 'sale', channel, payment, items,
    subtotal: t.subtotal, discount_type: discountType, discount_value: discountValue, discount: t.discount,
    revenue: t.revenue, shipping: t.shipping, total: t.total, profit: t.profit,
    customer: channel === 'direct' ? customer : null, note: note || '', day_id: day?.id || null,
    user_name: user?.name || '', user_code: user?.code || ''
  });
  for (const it of items) await db.save('moves', { product_id: it.product_id, qty: -it.qty, type: 'sale', ref: inv.id, unit_cost: it.cost }, { silent: true });
  await db.audit('sale', 'invoice', inv.id, `${inv.no} · ${t.total}`);
  db.emit('change', { table: 'moves' });
  return inv;
}
export function returnedQty(inv) {
  const m = new Map();
  for (const r of db.all('invoices')) if (r.kind === 'return' && r.ref_invoice === inv.id) for (const it of r.items) m.set(it.product_id, (m.get(it.product_id) || 0) + it.qty);
  return m;
}
export async function createReturn(inv, lines, user) {
  const ratio = inv.subtotal ? inv.discount / inv.subtotal : 0;
  const items = lines.filter(l => l.qty > 0).map(l => {
    const it = inv.items.find(x => x.product_id === l.product_id);
    return { ...it, qty: l.qty };
  });
  if (!items.length) throw new Error('کالایی برای مرجوعی انتخاب نشده');
  const gross = items.reduce((s, i) => s + i.price * i.qty, 0);
  const disc = Math.round(gross * ratio);
  const cost = items.reduce((s, i) => s + i.cost * i.qty, 0);
  const revenue = -(gross - disc);
  const day = inv.channel === 'booth' ? openDay() : null;
  const r = await db.save('invoices', {
    no: nextInvoiceNo(user?.code), kind: 'return', ref_invoice: inv.id, ref_no: inv.no, channel: inv.channel, payment: inv.payment, items,
    subtotal: -gross, discount: -disc, revenue, shipping: 0, total: revenue, profit: revenue + cost,
    day_id: day?.id || null, user_name: user?.name || '', user_code: user?.code || ''
  });
  for (const it of items) await db.save('moves', { product_id: it.product_id, qty: it.qty, type: 'return', ref: r.id, unit_cost: it.cost }, { silent: true });
  await db.audit('return', 'invoice', r.id, `مرجوعی ${inv.no}`);
  db.emit('change', { table: 'moves' });
  return r;
}
export async function voidInvoice(inv) {
  for (const m of db.all('moves').filter(m => m.ref === inv.id)) await db.remove('moves', m.id);
  await db.remove('invoices', inv.id);
  await db.audit('void', 'invoice', inv.id, `${inv.no} حذف شد`);
}

// ---------- مالی و گزارش ----------
export function invoicesBetween(from, to) {
  const a = from.toISOString(), b = to.toISOString();
  return db.all('invoices').filter(i => i.created_at >= a && i.created_at < b);
}
export function expensesBetween(from, to) {
  const a = from.toISOString(), b = to.toISOString();
  return db.all('expenses').filter(e => e.date >= a && e.date < b);
}
export function purchasesBetween(from, to) {
  const a = from.toISOString(), b = to.toISOString();
  return db.all('moves').filter(m => m.type === 'in' && m.created_at >= a && m.created_at < b);
}
export function summarize(from, to) {
  const invs = invoicesBetween(from, to);
  const exps = expensesBetween(from, to);
  const r = { revenue: 0, profit: 0, count: 0, returns: 0, booth: 0, direct: 0, shipping: 0, expenses: 0, withdraw: 0, purchases: 0, net: 0, cash: 0, pos: 0, c2c: 0 };
  for (const i of invs) {
    r.revenue += i.revenue; r.profit += i.profit; r.shipping += i.shipping || 0;
    r[i.channel] += i.revenue; r[i.payment] = (r[i.payment] || 0) + i.total;
    if (i.kind === 'sale') r.count++; else r.returns++;
  }
  for (const e of exps) { if (e.category === 'withdraw') r.withdraw += e.amount; else r.expenses += e.amount; }
  for (const m of purchasesBetween(from, to)) r.purchases += (m.unit_cost || 0) * m.qty;
  r.net = r.profit - r.expenses;
  return r;
}
export function dailySeries(from, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const a = addDays(from, i), b = addDays(from, i + 1);
    const invs = invoicesBetween(a, b);
    out.push({ date: a, revenue: invs.reduce((s, x) => s + x.revenue, 0), booth: invs.some(x => x.channel === 'booth') });
  }
  return out;
}
export function productRanking(from, to) {
  const m = new Map();
  for (const i of invoicesBetween(from, to)) {
    const sign = i.kind === 'return' ? -1 : 1;
    for (const it of i.items) {
      const x = m.get(it.product_id) || { qty: 0, revenue: 0, name: it.name };
      x.qty += sign * it.qty; x.revenue += sign * it.qty * it.price; m.set(it.product_id, x);
    }
  }
  const all = products().map(p => ({ product: p, ...(m.get(p.id) || { qty: 0, revenue: 0 }) }));
  return {
    top: [...all].filter(x => x.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 5),
    low: [...all].sort((a, b) => a.qty - b.qty).slice(0, 5)
  };
}
export function inventoryValue() {
  let v = 0, units = 0;
  for (const p of products()) { const s = Math.max(0, stockOf(p.id)); v += s * (p.buy_price || 0); units += s; }
  return { value: v, units, items: products().length };
}
export function todaySummary() {
  const a = startOfDay(new Date());
  return summarize(a, addDays(a, 1));
}
export function recentInvoices(n = 5) {
  return db.all('invoices').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, n);
}
export function weekActivity(start) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const invs = invoicesBetween(d, addDays(d, 1));
    return { date: d, booth: invs.some(x => x.channel === 'booth') || db.all('days').some(x => isSameDay(x.opened_at, d)), direct: invs.some(x => x.channel === 'direct') };
  });
}
