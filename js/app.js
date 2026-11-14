// Moon-vibe sells — رابط کاربری و مسیرها
import * as db from './db.js';
import * as L from './logic.js';
import * as sync from './sync.js';
import { scanner } from './scanner.js';
import { I, ic, star, orb, worb } from './icons.js';
import { markSVG } from './mark.js';
import {
  fa, faPlain, k, kSigned, parseNum, fromK, esc, faDate, faTime, faWeekdayShort, faMonth, relDay,
  startOfDay, addDays, startOfJMonth, startOfWeek, jParts, sha256, debounce, nowISO, toLatinDigits
} from './utils.js';

const VERSION = '1.0.0';
const app = document.getElementById('app');
const COLOR_MESH = { pink: 'a', sky: 'b', yellow: 'c', peach: 'd', lav: 'b' };

// ---------- وضعیت رابط ----------
const S = {
  user: null, users: [], route: { name: 'dash', params: [], query: {} },
  cart: [], channel: 'booth', discType: 'pct', discVal: '', payment: 'cash', shipping: '', customer: { name: '', phone: '', address: '' },
  saleCat: 'top', saleQ: '', prodQ: '', prodCat: null, prodFilter: 'all', repPeriod: 'month', finOffset: 0, invFilter: 'today',
  pin: '', setup: { step: 'welcome', mode: 'new' }, syncTab: 'in', addQty: 1, pendingRender: false
};

// ---------- ابزار رابط ----------
const $ = s => document.querySelector(s);
const money = t => `${k(t)}`;
const unit = '<small> هزار تومان</small>';
const catOf = p => L.category(p?.category_id);
const catColor = p => catOf(p)?.color || 'lav';
const catIcon = p => catOf(p)?.icon || 'box';

let toastTimer;
function toast(msg, { err = false, action = null, ms = 2600 } = {}) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { t.remove(); action.fn(); };
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), action ? 5000 : ms);
}

function openSheet(html, { onClose } = {}) {
  closeSheet();
  const b = document.createElement('div');
  b.className = 'backdrop';
  b.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  b.addEventListener('click', e => { if (e.target === b) closeSheet(); });
  b._onClose = onClose;
  document.body.appendChild(b);
  setTimeout(() => b.querySelector('input:not([type=hidden]),textarea')?.focus({ preventScroll: true }), 120);
  return b.querySelector('.sheet');
}
function closeSheet() {
  const b = document.querySelector('.backdrop');
  if (b) { b._onClose?.(); b.remove(); }
}
function confirmBox(msg, { ok = 'تأیید', danger = false } = {}) {
  return new Promise(res => {
    const sh = openSheet(`<h3>${esc(msg)}</h3><div class="grid2"><button class="btn light" data-c="0">انصراف</button><button class="btn ${danger ? 'danger' : ''}" data-c="1">${esc(ok)}</button></div>`,
      { onClose: () => res(false) });
    sh.addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      const v = b.dataset.c === '1';
      const bd = document.querySelector('.backdrop'); if (bd) bd._onClose = null;
      closeSheet(); res(v);
    });
  });
}

// ---------- تم ----------
function applyTheme() {
  const pref = localStorage.getItem('mv-theme') || 'auto';
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#151325' : '#F2F5FD');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---------- مسیرها ----------
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: parts[0] || 'dash', params: parts.slice(1), query };
}
const go = h => { if (location.hash === h) render(); else location.hash = h; };
window.addEventListener('hashchange', () => { S.route = parseHash(); closeSheet(); render(true); });

function render(scrollTop = false) {
  const y = window.scrollY;
  if (!S.user) { app.innerHTML = S.users.length ? lockView() : setupView(); return; }
  const v = VIEWS[S.route.name] || VIEWS.dash;
  app.innerHTML = v(...S.route.params);
  if (scrollTop) window.scrollTo(0, 0); else window.scrollTo(0, y);
  afterRender();
}
function afterRender() {
  const f = app.querySelector('[data-autofocus]');
  if (f && !('ontouchstart' in window)) f.focus();
}
/** وقتی کاربر در حال تایپ است، رندر را تا blur عقب بینداز */
function softRender() {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && app.contains(a)) { S.pendingRender = true; return; }
  if (document.querySelector('.backdrop') || document.querySelector('.scanner')) { S.pendingRender = true; return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (S.pendingRender && !document.querySelector('.backdrop')) { S.pendingRender = false; softRender(); } }, 50));

function nav(active) {
  const items = [['dash', 'home', 'داشبورد'], ['products', 'tag', 'کالاها'], ['sale', 'scan', 'فروش'], ['finance', 'wallet', 'مالی'], ['reports', 'chart', 'گزارش']];
  return `<nav class="nav" aria-label="ناوبری اصلی">${items.map(([r, i, l]) => r === active
    ? `<a href="#/${r}" class="on" aria-current="page"><span class="sphere">${ic(i, 20, 2)}</span><span>${l}</span><i></i></a>`
    : `<a href="#/${r}" aria-label="${l}">${ic(i, 20, 1.7)}</a>`).join('')}</nav>`;
}
const topbar = (title, back = '#/dash', right = '<span style="width:50px"></span>') =>
  `<div class="topbar"><a class="cbtn" href="${back}" aria-label="بازگشت">${ic('back')}</a><h1>${title}</h1>${right}</div>`;

function syncLine() {
  const st = sync.state;
  if (st.status === 'off') return '';
  if (st.status === 'offline') return `<div class="status-line warnbox" role="status">${star(false, 14)}<span><b>آفلاین</b> · موجودی‌ها ممکن است دقیق نباشند${st.pending ? ` · ${fa(st.pending)} تغییر در صف` : ''}</span></div>`;
  if (st.status === 'error') return `<div class="status-line warnbox" role="status">${star(false, 14)}<span><b>همگام نشد</b> · موجودی‌ها ممکن است دقیق نباشند · ${esc(st.error)}</span></div>`;
  if (st.status === 'signed-out') return `<a href="#/sync" class="status-line warnbox">${star(false, 14)}<span><b>از حساب خارج شده‌اید</b> · برای همگام‌سازی وارد شوید</span></a>`;
  return '';
}
function syncBadge() {
  const st = sync.state;
  const map = { off: ['همگام‌سازی خاموش', false], online: ['همگام', true], syncing: ['در حال همگام‌سازی', true], offline: ['آفلاین', false], error: ['خطای همگام‌سازی', false], 'signed-out': ['خارج از حساب', false] };
  const [label, filled] = map[st.status] || map.off;
  return `<span class="${filled ? 'pos' : 'muted'}" style="display:inline-flex;gap:4px;align-items:center">${star(filled, 10)}${label}</span>`;
}

// =============================================================
//  قفل و راه‌اندازی
// =============================================================
function logo(size = 84) {
  return `<div class="logo-orb org-pink" style="width:${size}px;height:${size}px">${markSVG(size * 0.55, '#fff')}</div>`;
}
function pinPad(id) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return `<div class="numpad" data-pad="${id}">${keys.map(x => x === '' ? '<span></span>' : x === 'del'
    ? `<button class="ghost" data-a="pin-key" data-k="del" aria-label="پاک کردن">${ic('dele', 24, 1.6)}</button>`
    : `<button data-a="pin-key" data-k="${x}">${faPlain(x)}</button>`).join('')}</div>`;
}
function lockView() {
  const u = S.lockUser || S.users[0];
  return `<div class="lock">${logo()}
    <div class="center"><h2 style="font-size:20px">Moon-vibe sells</h2><div class="muted" style="font-size:13px">برای ورود رمز چهاررقمی را بزنید</div></div>
    ${S.users.length > 1 ? `<div class="row-gap">${S.users.map(x => `<button class="chip ${x.id === u.id ? 'on' : ''}" data-a="lock-user" data-id="${x.id}">${ic('user', 14)}${esc(x.name)}</button>`).join('')}</div>` : `<div class="chip">${ic('user', 14)}${esc(u.name)}</div>`}
    <div class="pin-dots" id="pin-dots">${[0, 1, 2, 3].map(i => `<i class="${S.pin.length > i ? 'f' : ''}"></i>`).join('')}</div>
    ${pinPad('lock')}
  </div>`;
}
function setupView() {
  const st = S.setup;
  if (st.step === 'welcome') return `<div class="lock">${logo(96)}
    <div class="center"><h2 style="font-size:22px">Moon-vibe sells</h2><div class="muted">مدیریت فروش و انبار مون وایب</div></div>
    <div style="width:100%;max-width:340px;display:flex;flex-direction:column;gap:10px;margin-top:10px">
      <button class="btn" data-a="setup-mode" data-m="new">${ic('sparkle')}راه‌اندازی فروشگاه جدید</button>
      <button class="btn light" data-a="setup-mode" data-m="join">${ic('cloud')}اتصال به فروشگاه موجود</button>
      <p class="muted center" style="font-size:12px;margin:6px 0 0">اگر گوشی دیگری قبلاً فروشگاه را ساخته، «اتصال» را بزنید تا اطلاعات از ابر بیاید.</p>
    </div></div>`;
  return `<form class="screen no-nav" data-form="setup" style="max-width:420px;margin:0 auto;justify-content:center">
    <div class="center">${logo(64).replace('logo-orb', 'logo-orb" style="margin:0 auto 10px')}<h2>${st.mode === 'new' ? 'فروشگاه جدید' : 'اتصال به فروشگاه'}</h2><div class="muted" style="font-size:13px">کاربر این گوشی را بسازید</div></div>
    ${st.mode === 'new' ? `<label class="field"><span>نام فروشگاه</span><div class="inp"><input name="store" value="مون وایب" required></div></label>` : ''}
    <label class="field"><span>نام شما (روی فاکتور ثبت می‌شود)</span><div class="inp"><input name="name" required placeholder="مثلاً مهسا"></div></label>
    <label class="field"><span>کد کاربر (یک حرف لاتین، روی شماره‌ی فاکتور)</span><div class="inp"><input name="code" required maxlength="2" dir="ltr" placeholder="M" style="text-transform:uppercase;text-align:left"></div></label>
    <div class="grid2">
      <label class="field"><span>رمز ۴ رقمی</span><div class="inp"><input name="pin" required inputmode="numeric" maxlength="4" type="password" dir="ltr" style="text-align:center;letter-spacing:6px"></div></label>
      <label class="field"><span>تکرار رمز</span><div class="inp"><input name="pin2" required inputmode="numeric" maxlength="4" type="password" dir="ltr" style="text-align:center;letter-spacing:6px"></div></label>
    </div>
    <div class="err-text" id="setup-err"></div>
    <button class="btn" type="submit">ادامه</button>
    <button class="btn light" type="button" data-a="setup-back">بازگشت</button>
  </form>`;
}

// =============================================================
//  داشبورد
// =============================================================
function dashView() {
  const st = L.settings();
  const today = L.todaySummary();
  const day = L.openDay();
  const cmp = L.boothComparison();
  const al = L.alerts();
  const inv = L.inventoryValue();
  const parts = [];
  for (const c of st.dash_cards) {
    if (!c.on) continue;
    if (c.key === 'booth') parts.push(day
      ? `<div class="hero"><span class="chip">${orb('booth', 'sky', 26)}روز غرفه باز · از ${faTime(day.opened_at)}</span></div>
         <div class="row-gap"><a class="btn" href="#/day">بستن روز غرفه</a><a class="cbtn" href="#/invoices" aria-label="فاکتورها">${ic('list')}</a></div>`
      : `<div class="hero"><span class="chip">${orb('booth', 'lav', 26)}روز غرفه بسته است</span></div>
         <div class="row-gap"><button class="btn light" data-a="day-start">${ic('booth')}شروع روز غرفه</button><a class="cbtn" href="#/invoices" aria-label="فاکتورها">${ic('list')}</a></div>`);
    if (c.key === 'hero') parts.push(`<div class="hero">
        <span class="muted" style="font-size:12px">فروش امروز</span>
        <span class="big-num">${money(today.revenue)}${unit}</span>
        <span style="font-size:12px" class="${cmp ? (cmp.pct >= 0 ? 'pos' : 'neg') : 'muted'}">${cmp ? `${fa(Math.abs(cmp.pct))}٪ ${cmp.pct >= 0 ? 'بیشتر' : 'کمتر'} از روز غرفه‌ی قبل` : `${fa(today.count)} فاکتور · غرفه ${money(today.booth)} · دایرکت ${money(today.direct)}`}</span>
      </div>`);
    if (c.key === 'widgets') parts.push(`<div class="hscroll">
        <a class="wcard mesh mesh-a" href="#/alerts">${worb('bell', 'pink')}<span><b>هشدار موجودی</b><small class="sub">${al.count ? `${fa(al.count)} کالا نیاز به توجه` : 'همه‌چیز مرتب است'}</small></span></a>
        <a class="wcard mesh mesh-c" href="#/finance">${worb('wallet', 'yellow')}<span><b>سود خالص امروز</b><small class="sub">${kSigned(today.net)} هزار تومان</small></span></a>
        <a class="wcard mesh mesh-b" href="#/reports">${worb('layers', 'sky')}<span><b>ارزش انبار</b><small class="sub">${money(inv.value)} هزار تومان · ${fa(inv.units)} عدد</small></span></a>
      </div>`);
    if (c.key === 'recent') {
      const rec = L.recentInvoices(3);
      parts.push(`<div class="section-title"><h2>آخرین فاکتورها</h2><a href="#/invoices">همه</a></div>
        <div class="list">${rec.length ? rec.map(invRow).join('') : `<div class="card muted center" style="font-size:13px">هنوز فاکتوری ثبت نشده</div>`}</div>`);
    }
  }
  return `<div class="screen">
    <form class="search" data-form="dash-search"><label>${ic('search', 18)}<input name="q" placeholder="جستجوی کالا…" aria-label="جستجوی کالا"></label><a class="cbtn dark" href="#/settings" aria-label="شخصی‌سازی و تنظیمات">${ic('sliders')}</a></form>
    <div class="row-between" style="font-size:12px"><span class="muted">${new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span><a href="#/sync">${syncBadge()}</a></div>
    ${syncLine()}
    ${parts.join('')}
  </div>${nav('dash')}`;
}
function invRow(i) {
  const isRet = i.kind === 'return';
  const color = isRet ? 'lav' : i.channel === 'direct' ? 'pink' : 'sky';
  const icon = isRet ? 'ret' : i.channel === 'direct' ? 'chat' : 'booth';
  return `<a class="row" href="#/invoice/${i.id}">${orb(icon, color)}<span class="t"><b>${isRet ? 'مرجوعی' : 'فاکتور'} <span class="ltr">${esc(i.no)}</span></b><small>${L.CHANNELS[i.channel]} · ${relDay(i.created_at)} ${faTime(i.created_at)} · ${esc(i.user_name || '')}</small></span><span class="amt ${isRet ? 'neg' : ''}">${kSigned(i.total)}</span></a>`;
}

// =============================================================
//  فروش
// =============================================================
function saleView() {
  const cats = L.categories();
  const tot = L.cartTotals(S.cart);
  const day = L.openDay();
  return `<div class="screen" style="padding-bottom:${S.cart.length ? 190 : 120}px">
    <div class="row-between"><h1 class="pagetitle">فاکتور جدید</h1>
      <div class="seg" role="radiogroup" aria-label="کانال فروش">
        <button class="${S.channel === 'booth' ? 'on' : ''}" data-a="channel" data-v="booth" role="radio" aria-checked="${S.channel === 'booth'}">${ic('booth', 14)}غرفه</button>
        <button class="${S.channel === 'direct' ? 'on' : ''}" data-a="channel" data-v="direct" role="radio" aria-checked="${S.channel === 'direct'}">${ic('chat', 14)}دایرکت</button>
      </div></div>
    ${syncLine()}
    ${S.channel === 'booth' && !day ? `<div class="status-line">${ic('booth', 14)}<span>روز غرفه شروع نشده؛ با اولین فاکتور غرفه خودکار شروع می‌شود.</span></div>` : ''}
    <form class="search" data-form="sale-search"><label>${ic('search', 18)}<input name="q" value="${esc(S.saleQ)}" data-input="sale-q" placeholder="جستجوی نام، کد یا بارکد…" aria-label="جستجوی کالا" autocomplete="off"></label>
      <button type="button" class="cbtn dark" data-a="scan-sale" aria-label="اسکن بارکد">${ic('scan')}</button></form>
    <div class="hscroll" style="padding-bottom:18px">
      <button class="catcard mesh mesh-a ${S.saleCat === 'top' ? 'on' : ''}" data-a="sale-cat" data-v="top">${worb('sparkle', 'pink', 40)}<b>پرفروش</b></button>
      <button class="catcard mesh mesh-b ${S.saleCat === 'all' ? 'on' : ''}" data-a="sale-cat" data-v="all">${worb('layers', 'lav', 40)}<b>همه</b></button>
      ${cats.map(c => `<button class="catcard mesh mesh-${COLOR_MESH[c.color] || 'b'} ${S.saleCat === c.id ? 'on' : ''}" data-a="sale-cat" data-v="${c.id}">${worb(c.icon, c.color, 40)}<b>${esc(c.name)}</b></button>`).join('')}
    </div>
    <div class="list" id="sale-list">${saleList()}</div>
  </div>
  ${S.cart.length ? `<div style="position:fixed;left:50%;transform:translateX(-50%);bottom:calc(88px + env(safe-area-inset-bottom));width:min(440px,calc(100% - 40px));z-index:19">
    <a class="btn" href="#/pay" style="justify-content:space-between"><span>پرداخت · ${fa(tot.qty)} قلم</span><span style="font-weight:700;font-size:17px">${money(tot.subtotal)} <small style="font-weight:400;font-size:11px">هزار تومان</small></span></a></div>` : ''}
  ${nav('sale')}`;
}
function saleList() {
  let list;
  if (S.saleQ) list = L.searchProducts(S.saleQ);
  else if (S.saleCat === 'top') { list = L.topSellers(20); if (!list.length) list = L.searchProducts('').slice(0, 40); }
  else if (S.saleCat === 'all') list = L.searchProducts('');
  else list = L.searchProducts('', S.saleCat);
  if (!L.products().length) return `<div class="card center" style="display:flex;flex-direction:column;gap:10px;align-items:center"><span class="muted">هنوز کالایی ثبت نشده</span><a class="btn sm" href="#/edit/new">${ic('plus', 16)}ثبت اولین کالا</a></div>`;
  if (!list.length) return `<div class="card muted center">کالایی پیدا نشد</div>`;
  return list.slice(0, 80).map(p => {
    const s = L.stockOf(p.id);
    const st = L.productStatus(p);
    const inCart = S.cart.find(c => c.product_id === p.id);
    const ctl = inCart
      ? `<span class="stepper"><button data-a="cart-dec" data-id="${p.id}" aria-label="کم کردن">${ic('minus', 13, 2)}</button><b>${fa(inCart.qty)}</b><button class="plus" data-a="cart-inc" data-id="${p.id}" aria-label="افزودن">${ic('plus', 13, 2)}</button></span>`
      : `<button class="add-dot" data-a="cart-inc" data-id="${p.id}" aria-label="افزودن به سبد">${ic('plus', 13, 2)}</button>`;
    return `<div class="row"><a href="#/product/${p.id}" style="display:contents">${orb(catIcon(p), catColor(p))}<span class="t"><b>${esc(L.displayName(p))}</b><small><span class="ltr">${esc(p.code)}</span> · <span class="${st === 'neg' ? 'neg' : st === 'low' ? 'warn' : ''}">موجودی ${s < 0 ? fa(-s) + '−' : fa(s)}</span></small></span></a>
      <span style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><span class="amt">${money(p.sell_price)}</span>${ctl}</span></div>`;
  }).join('');
}
function addToCart(p, n = 1) {
  const c = S.cart.find(x => x.product_id === p.id);
  if (c) c.qty += n;
  else S.cart.push({ product_id: p.id, name: L.displayName(p), price: p.sell_price || 0, cost: p.buy_price || 0, qty: n });
  return S.cart.find(x => x.product_id === p.id).qty;
}

// =============================================================
//  پرداخت
// =============================================================
function payView() {
  if (!S.cart.length) { setTimeout(() => go('#/sale')); return ''; }
  const dv = parseNum(S.discVal);
  const t = L.cartTotals(S.cart, { discountType: S.discType, discountValue: S.discType === 'pct' ? dv : dv * 1000, shipping: S.channel === 'direct' ? fromK(S.shipping) : 0 });
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
  return `<div class="screen no-nav">
    ${topbar('پرداخت', '#/sale')}
    <div class="hero">
      <span class="chip">${orb(S.channel === 'booth' ? 'booth' : 'chat', S.channel === 'booth' ? 'sky' : 'pink', 24)}${L.CHANNELS[S.channel]} · ${fa(t.qty)} قلم</span>
      <span class="muted" style="font-size:12px;margin-top:8px">مبلغ قابل پرداخت</span>
      <span class="big-num" id="pay-total">${money(t.total)}${unit}</span>
      <span class="muted" style="font-size:12px" id="pay-sub">${t.discount ? `<s>${money(t.subtotal + t.shipping)}</s> · ${S.discType === 'pct' ? fa(dv) + '٪' : money(t.discount)} تخفیف` : 'بدون تخفیف'}${t.shipping ? ` · ارسال ${money(t.shipping)}` : ''}</span>
    </div>
    <div class="list">${S.cart.map(c => `<div class="row"><span class="t"><b>${esc(c.name)}</b><small>${fa(c.qty)} × ${money(c.price)}</small></span>
      <span class="stepper"><button data-a="cart-dec" data-id="${c.product_id}" aria-label="کم کردن">${ic('minus', 13, 2)}</button><b>${fa(c.qty)}</b><button class="plus" data-a="cart-inc" data-id="${c.product_id}" aria-label="افزودن">${ic('plus', 13, 2)}</button></span></div>`).join('')}
      <button class="btn light sm" data-a="cart-clear" style="align-self:center">${ic('trash', 16)}خالی کردن سبد</button></div>
    <div class="row-between"><b style="font-weight:500">تخفیف روی کل فاکتور</b>
      <div class="seg"><button class="${S.discType === 'pct' ? 'on' : ''}" data-a="disc-type" data-v="pct">درصد</button><button class="${S.discType === 'amt' ? 'on' : ''}" data-a="disc-type" data-v="amt">مبلغ (هزار ت)</button></div></div>
    <div class="inp" style="justify-content:space-between"><span class="muted" style="font-size:13px">مقدار تخفیف</span><b style="font-size:22px;font-weight:500" id="disc-display">${S.discVal ? faPlain(S.discVal).replace('٫', '٫') : '۰'}${S.discType === 'pct' ? '٪' : ''}</b></div>
    <div class="numpad">${keys.map(x => x === 'del' ? `<button class="ghost" data-a="disc-key" data-k="del" aria-label="پاک کردن">${ic('dele', 22, 1.6)}</button>` : `<button data-a="disc-key" data-k="${x}">${x === '.' ? '٫' : faPlain(x)}</button>`).join('')}</div>
    <div class="grid3">${Object.entries(L.PAYMENTS).map(([kk, l], i) => `<button class="paybox mesh mesh-${['b', 'a', 'c'][i]} ${S.payment === kk ? 'on' : ''}" data-a="payment" data-v="${kk}">${ic(kk === 'cash' ? 'cash' : kk === 'pos' ? 'card' : 'swap', 18)}${l}</button>`).join('')}</div>
    ${S.channel === 'direct' ? `<div class="card" style="display:flex;flex-direction:column;gap:10px">
      <b style="font-weight:500">ارسال و مشتری</b>
      <label class="field"><span>هزینه‌ی ارسال (هزار تومان)</span><div class="inp" style="box-shadow:none;background:var(--field)"><input data-input="shipping" inputmode="decimal" value="${esc(S.shipping)}" placeholder="۰"></div></label>
      <label class="field"><span>نام مشتری</span><div class="inp" style="box-shadow:none;background:var(--field)"><input data-input="cust-name" value="${esc(S.customer.name)}"></div></label>
      <label class="field"><span>شماره تماس</span><div class="inp" style="box-shadow:none;background:var(--field)"><input data-input="cust-phone" inputmode="tel" dir="ltr" value="${esc(S.customer.phone)}" style="text-align:left"></div></label>
      <label class="field"><span>آدرس</span><div class="inp" style="box-shadow:none;background:var(--field)"><textarea data-input="cust-address" rows="2">${esc(S.customer.address)}</textarea></div></label>
    </div>` : ''}
    <button class="btn" data-a="checkout">${ic('check', 18)}ثبت فاکتور</button>
  </div>`;
}

// =============================================================
//  کالاها
// =============================================================
function productsView() {
  const cats = L.categories();
  const al = L.alerts();
  return `<div class="screen">
    <div class="row-between"><h1 class="pagetitle">کالاها</h1><a class="cbtn dark" href="#/edit/new" aria-label="کالای جدید">${ic('plus')}</a></div>
    <form class="search" data-form="prod-search"><label>${ic('search', 18)}<input name="q" value="${esc(S.prodQ)}" data-input="prod-q" placeholder="جستجوی نام، برند، کد یا بارکد…" aria-label="جستجوی کالا" autocomplete="off"></label>
      <button type="button" class="cbtn" data-a="scan-find" aria-label="پیدا کردن با بارکد">${ic('scan')}</button></form>
    <div class="chips">
      ${[['all', 'همه', L.products().length], ['low', 'کم', al.low.length], ['neg', 'منفی', al.neg.length], ['stale', 'راکد', al.stale.length]].map(([v, l, n]) =>
        `<button class="chip ${S.prodFilter === v ? 'on' : ''}" data-a="prod-filter" data-v="${v}">${l} ${fa(n)}</button>`).join('')}
      <span style="width:1px;background:var(--line);flex-shrink:0"></span>
      ${cats.map(c => `<button class="chip ${S.prodCat === c.id ? 'on' : ''}" data-a="prod-cat" data-v="${c.id}">${ic(c.icon, 14)}${esc(c.name)}</button>`).join('')}
    </div>
    <div class="list" id="prod-list">${prodList()}</div>
  </div>${nav('products')}`;
}
function prodList() {
  let list = L.searchProducts(S.prodQ, S.prodCat);
  if (S.prodFilter !== 'all') list = list.filter(p => L.productStatus(p) === S.prodFilter);
  if (!list.length) return `<div class="card muted center">${L.products().length ? 'کالایی با این فیلتر نیست' : 'هنوز کالایی ثبت نشده. با دکمه‌ی + شروع کنید.'}</div>`;
  return list.map(p => {
    const s = L.stockOf(p.id), st = L.productStatus(p);
    const badge = st === 'neg' ? `<span class="badge neg">منفی</span>` : st === 'low' ? `<span class="badge low">کم</span>` : st === 'stale' ? `<span class="badge">راکد</span>` : '';
    return `<a class="row" href="#/product/${p.id}">${orb(catIcon(p), catColor(p))}<span class="t"><b>${esc(L.displayName(p))}</b><small><span class="ltr">${esc(p.code)}</span>${p.brand ? ' · ' + esc(p.brand) : ''} · موجودی ${s < 0 ? fa(-s) + '−' : fa(s)}</small></span>${badge}<span class="amt">${money(p.sell_price)}</span></a>`;
  }).join('');
}

function productView(id) {
  const p = db.get('products', id);
  if (!p) return notFound();
  const c = catOf(p);
  const s = L.stockOf(p.id);
  const margin = p.sell_price ? Math.round(((p.sell_price - (p.buy_price || 0)) / p.sell_price) * 100) : 0;
  const moves = db.all('moves').filter(m => m.product_id === p.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const sib = db.all('products').filter(x => x.group_id && x.group_id === p.group_id && x.id !== p.id);
  const mv = COLOR_MESH[c?.color] || 'a';
  const MT = { initial: 'موجودی اولیه', in: 'ورود کالا', adjust: 'اصلاح موجودی', sale: 'فروش', return: 'مرجوعی' };
  return `<div class="screen no-nav">
    ${topbar(esc(c?.name || 'کالا'), '#/products', `<a class="cbtn" href="#/edit/${p.id}" aria-label="ویرایش">${ic('pencil')}</a>`)}
    <div class="phero">
      <span class="side mesh mesh-b" style="right:-150px"></span><span class="side mesh mesh-d" style="left:-150px"></span>
      <div class="main mesh mesh-${mv}">${ic(c?.icon || 'box', 120, 1.1)}</div>
    </div>
    <div class="row-between" style="align-items:flex-start;margin-top:6px"><h1 style="font-size:26px;line-height:1.35">${esc(p.name)}</h1>${p.variant ? `<span class="muted" style="font-size:20px">${esc(p.variant)}</span>` : ''}</div>
    <p class="muted" style="margin:0;font-size:13px;line-height:1.9">${p.brand ? 'برند ' + esc(p.brand) + ' · ' : ''}کد <span class="ltr">${esc(p.code)}</span>${p.barcode ? ` · بارکد <span class="ltr">${esc(p.barcode)}</span>` : ''}<br>موجودی <b class="${s < 0 ? 'neg' : s <= L.lowThreshold(p) ? 'warn' : ''}">${s < 0 ? fa(-s) + '−' : fa(s)}</b> عدد${p.pack_size > 1 ? ` (${fa(Math.floor(Math.max(0, s) / p.pack_size))} بسته‌ی ${fa(p.pack_size)}تایی)` : ''} · سود هر عدد ${money((p.sell_price || 0) - (p.buy_price || 0))} هزار تومان (${fa(margin)}٪)</p>
    ${p.note ? `<div class="card" style="font-size:13px">${esc(p.note)}</div>` : ''}
    <div class="row-between"><span style="font-size:26px;font-weight:700">${money(p.sell_price)}${unit}</span>
      <span class="stepper card" style="padding:5px;border-radius:22px"><button data-a="addqty" data-d="-1" aria-label="کم کردن">${ic('minus', 14, 2)}</button><b>${fa(S.addQty)}</b><button class="plus" data-a="addqty" data-d="1" aria-label="زیاد کردن">${ic('plus', 14, 2)}</button></span></div>
    <button class="btn" data-a="add-to-cart" data-id="${p.id}">${ic('plus', 18, 2)}افزودن به فاکتور</button>
    <div class="grid3">
      <button class="btn light sm" data-a="stock-in" data-id="${p.id}" style="width:100%">${ic('inbox', 16)}ورود</button>
      <button class="btn light sm" data-a="stock-adjust" data-id="${p.id}" style="width:100%">${ic('pencil', 16)}شمارش</button>
      <button class="btn light sm" data-a="add-variant" data-id="${p.id}" style="width:100%">${ic('layers', 16)}تنوع</button>
    </div>
    ${sib.length ? `<div class="section-title"><h2>تنوع‌های دیگر</h2></div><div class="list">${sib.map(x => `<a class="row" href="#/product/${x.id}">${orb(catIcon(x), catColor(x), 34)}<span class="t"><b>${esc(L.displayName(x))}</b><small>موجودی ${fa(L.stockOf(x.id))}</small></span><span class="amt">${money(x.sell_price)}</span></a>`).join('')}</div>` : ''}
    <div class="section-title"><h2>گردش موجودی</h2></div>
    <div class="card" style="padding:4px 16px">${moves.length ? moves.map(m => `<div class="kv"><span>${MT[m.type] || m.type}<span class="muted" style="font-size:11px"> · ${relDay(m.created_at)} ${faTime(m.created_at)}</span></span><b class="${m.qty < 0 ? 'neg' : 'pos'}" style="font-weight:500">${m.qty < 0 ? fa(-m.qty) + '−' : '+' + fa(m.qty)}</b></div>`).join('') : '<div class="kv muted">بدون گردش</div>'}</div>
  </div>`;
}

function editView(id) {
  const isNew = id === 'new';
  const p = isNew ? null : db.get('products', id);
  if (!isNew && !p) return notFound();
  const q = S.route.query;
  const base = q.variant ? db.get('products', q.variant) : null;
  const cats = L.categories();
  const d = p || (base ? { ...base, id: undefined, barcode: '', variant: '', code: '' } : { category_id: S.prodCat || cats[0]?.id, barcode: q.b || '' });
  const catId = S.editCat || d.category_id || cats[0]?.id;
  const code = p ? p.code : L.nextCode(catId);
  const buy = d.buy_price ? faPlain(d.buy_price / 1000) : '';
  const sell = d.sell_price ? faPlain(d.sell_price / 1000) : '';
  return `<form class="screen no-nav" data-form="product" data-id="${p?.id || ''}" data-base="${base?.id || ''}">
    <div class="topbar"><a class="cbtn" href="${p ? '#/product/' + p.id : '#/products'}" aria-label="بستن">${ic('x')}</a><h1>${isNew ? (base ? 'تنوع جدید' : 'کالای جدید') : 'ویرایش کالا'}</h1><span class="chip ltr" id="code-chip">${esc(code)}</span></div>
    <div class="search"><label style="box-shadow:var(--sh)">${ic('scan', 18)}<input name="barcode" value="${esc(d.barcode || '')}" dir="ltr" inputmode="numeric" placeholder="بارکد (اختیاری)" aria-label="بارکد" style="text-align:left"></label>
      <button type="button" class="cbtn dark" data-a="scan-field" aria-label="اسکن بارکد">${ic('scan')}</button></div>
    <span class="muted" style="font-size:12px;margin-top:-8px">بارکد ندارد؟ خالی بگذارید؛ با کد <span class="ltr">${esc(code)}</span> یا نام جستجو می‌شود.</span>
    <label class="field"><span>نام کالا</span><div class="inp"><input name="name" required value="${esc(d.name || '')}" placeholder="مثلاً سرم ویتامین C" ${isNew && !base ? 'data-autofocus' : ''}></div></label>
    <div class="grid2">
      <label class="field"><span>برند</span><div class="inp"><input name="brand" value="${esc(d.brand || '')}"></div></label>
      <label class="field"><span>تنوع (سایز/رنگ)</span><div class="inp"><input name="variant" value="${esc(d.variant || '')}" placeholder="اختیاری" ${base ? 'data-autofocus' : ''}></div></label>
    </div>
    <div class="field"><div class="row-between"><span class="muted" style="font-size:12px">دسته</span><a href="#/categories" class="muted" style="font-size:12px;display:flex;gap:4px;align-items:center">${ic('pencil', 14)}ویرایش دسته‌ها</a></div>
      <div class="grid2" style="grid-template-columns:repeat(4,minmax(0,1fr))">${cats.map(c => `<button type="button" class="catcard mesh mesh-${COLOR_MESH[c.color] || 'b'} ${c.id === catId ? 'on' : ''}" data-a="edit-cat" data-v="${c.id}" style="width:auto;height:84px;border-radius:22px;padding:10px;align-items:center;justify-content:center;gap:4px">${ic(c.icon, 22)}<b style="font-size:12px;font-weight:500">${esc(c.name)}</b></button>`).join('')}</div>
      <input type="hidden" name="category_id" value="${catId || ''}"></div>
    <div class="grid2">
      <label class="field"><span>قیمت خرید</span><div class="inp"><input name="buy" inputmode="decimal" value="${buy}" data-input="price-calc"><small>هزار ت</small></div></label>
      <label class="field"><span>قیمت فروش</span><div class="inp"><input name="sell" inputmode="decimal" required value="${sell}" data-input="price-calc"><small>هزار ت</small></div></label>
    </div>
    <div class="row-between" style="font-size:13px;padding:0 4px"><span class="muted">سود هر عدد</span><b style="font-weight:500" id="margin-line">—</b></div>
    ${isNew ? `<div class="grid2">
      <label class="field"><span>موجودی اولیه (عدد)</span><div class="inp"><input name="qty" inputmode="numeric" placeholder="۰"></div></label>
      <label class="field"><span>یا تعداد بسته</span><div class="inp"><input name="packs" inputmode="numeric" placeholder="۰"></div></label>
    </div>` : ''}
    <details class="card" style="padding:4px 16px" ${d.pack_size > 1 || d.note || (d.low_stock ?? '') !== '' ? 'open' : ''}><summary style="padding:12px 0;cursor:pointer;font-weight:500">تنظیمات بیشتر</summary>
      <div style="display:flex;flex-direction:column;gap:12px;padding-bottom:14px">
        <label class="field"><span>تعداد در هر بسته (برای خرید بسته‌ای)</span><div class="inp" style="box-shadow:none;background:var(--field)"><input name="pack_size" inputmode="numeric" value="${d.pack_size > 1 ? faPlain(d.pack_size) : ''}" placeholder="مثلاً ۱۲"></div></label>
        <label class="field"><span>حد هشدار موجودی کم (خالی = پیش‌فرض ${fa(L.settings().low_stock_default)})</span><div class="inp" style="box-shadow:none;background:var(--field)"><input name="low_stock" inputmode="numeric" value="${(d.low_stock ?? '') !== '' && d.low_stock !== null && d.low_stock !== undefined ? faPlain(d.low_stock) : ''}"></div></label>
        <label class="field"><span>یادداشت</span><div class="inp" style="box-shadow:none;background:var(--field)"><textarea name="note" rows="2">${esc(d.note || '')}</textarea></div></label>
      </div></details>
    <div class="err-text" id="form-err"></div>
    <button class="btn" type="submit">${ic('check', 18)}ذخیره کالا</button>
    ${p ? `<button class="btn danger" type="button" data-a="delete-product" data-id="${p.id}">${ic('trash', 18)}حذف کالا</button>` : ''}
  </form>`;
}

// =============================================================
//  فاکتورها
// =============================================================
function invoicesView() {
  const now = new Date();
  const ranges = { today: startOfDay(now), week: startOfWeek(now), month: startOfJMonth(now), all: new Date(2000, 0, 1) };
  const from = ranges[S.invFilter];
  const list = L.invoicesBetween(from, addDays(startOfDay(now), 1)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sum = list.reduce((s, i) => s + i.total, 0);
  return `<div class="screen no-nav">
    ${topbar('فاکتورها')}
    <div class="row-between"><div class="seg">${[['today', 'امروز'], ['week', 'هفته'], ['month', 'ماه'], ['all', 'همه']].map(([v, l]) => `<button class="${S.invFilter === v ? 'on' : ''}" data-a="inv-filter" data-v="${v}">${l}</button>`).join('')}</div>
      <span class="muted" style="font-size:12px">${fa(list.length)} فاکتور · ${kSigned(sum)}</span></div>
    <div class="list">${list.length ? list.map(invRow).join('') : '<div class="card muted center">فاکتوری در این بازه نیست</div>'}</div>
  </div>`;
}
function invoiceView(id) {
  const i = db.get('invoices', id);
  if (!i) return notFound();
  const ret = i.kind === 'return';
  const returned = ret ? new Map() : L.returnedQty(i);
  const canReturn = !ret && i.items.some(it => it.qty > (returned.get(it.product_id) || 0));
  const rets = db.all('invoices').filter(x => x.ref_invoice === i.id);
  return `<div class="screen no-nav">
    ${topbar(ret ? 'مرجوعی' : 'فاکتور', '#/invoices')}
    <div class="hero">
      <span class="chip">${orb(ret ? 'ret' : i.channel === 'direct' ? 'chat' : 'booth', ret ? 'lav' : i.channel === 'direct' ? 'pink' : 'sky', 24)}<span class="ltr">${esc(i.no)}</span></span>
      <span class="big-num ${ret ? 'neg' : ''}">${kSigned(i.total)}${unit}</span>
      <span class="muted" style="font-size:12px">${faDate(i.created_at, true)} · ${faTime(i.created_at)} · ثبت: ${esc(i.user_name || '—')}</span>
    </div>
    <div class="card" style="padding:4px 16px">
      ${i.items.map(it => `<div class="kv"><span><b style="font-weight:500">${esc(it.name)}</b><br><small class="muted">${esc(it.category_name || '')} · <span class="ltr">${esc(it.code)}</span> · ${fa(it.qty)} × ${money(it.price)}</small></span><b style="font-weight:500">${money(it.qty * it.price)}</b></div>`).join('')}
    </div>
    <div class="card" style="padding:4px 16px">
      <div class="kv"><span class="muted">جمع اقلام</span><span>${kSigned(i.subtotal)}</span></div>
      ${i.discount ? `<div class="kv"><span class="muted">تخفیف</span><span>${kSigned(-i.discount)}</span></div>` : ''}
      ${i.shipping ? `<div class="kv"><span class="muted">هزینه‌ی ارسال</span><span>${money(i.shipping)}</span></div>` : ''}
      <div class="kv"><b style="font-weight:500">مبلغ نهایی</b><b style="font-weight:500">${kSigned(i.total)} هزار تومان</b></div>
      <div class="kv"><span class="muted">سود</span><span class="${i.profit < 0 ? 'neg' : 'pos'}">${kSigned(i.profit)}</span></div>
      <div class="kv"><span class="muted">کانال / پرداخت</span><span>${L.CHANNELS[i.channel]} · ${L.PAYMENTS[i.payment] || ''}</span></div>
      ${ret ? `<div class="kv"><span class="muted">فاکتور اصلی</span><a class="ltr" href="#/invoice/${i.ref_invoice}">${esc(i.ref_no)}</a></div>` : ''}
      ${i.customer?.name || i.customer?.address ? `<div class="kv"><span class="muted">مشتری</span><span style="text-align:left">${esc(i.customer.name || '')} <span class="ltr">${esc(i.customer.phone || '')}</span><br><small class="muted">${esc(i.customer.address || '')}</small></span></div>` : ''}
    </div>
    ${rets.length ? `<div class="section-title"><h2>مرجوعی‌های این فاکتور</h2></div><div class="list">${rets.map(invRow).join('')}</div>` : ''}
    ${canReturn ? `<button class="btn light" data-a="return-sheet" data-id="${i.id}">${ic('ret', 18)}ثبت مرجوعی</button>` : ''}
    <button class="btn danger" data-a="void-invoice" data-id="${i.id}">${ic('trash', 18)}حذف فاکتور</button>
  </div>`;
}

// =============================================================
//  روز غرفه
// =============================================================
function dayView() {
  const day = L.openDay();
  const hist = L.closedDays().slice(0, 10);
  const histHtml = `<div class="section-title"><h2>روزهای غرفه‌ی قبلی</h2></div><div class="list">${hist.length ? hist.map(d => {
    const diff = ((d.counted_cash ?? d.expected_cash) - d.expected_cash) + ((d.counted_pos ?? d.expected_pos) - d.expected_pos);
    return `<div class="row">${orb('booth', 'sky')}<span class="t"><b>${faDate(d.opened_at)} · ${new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long' }).format(new Date(d.opened_at))}</b><small>${faTime(d.opened_at)} تا ${faTime(d.closed_at)} · سود ${kSigned((d.profit || 0) - (d.rent || 0))}${diff ? ` · <span class="neg">اختلاف صندوق ${kSigned(diff)}</span>` : ''}</small></span><span class="amt">${money(d.revenue || 0)}</span></div>`;
  }).join('') : '<div class="card muted center">هنوز روزی بسته نشده</div>'}</div>`;
  if (!day) return `<div class="screen no-nav">${topbar('روز غرفه')}
    <div class="hero" style="padding:20px 0">${orb('booth', 'lav', 64)}<h2 style="margin-top:10px">روز غرفه بسته است</h2><span class="muted" style="font-size:13px">با شروع روز، فاکتورهای غرفه به این روز وصل می‌شوند.</span></div>
    <button class="btn" data-a="day-start">${ic('booth')}شروع روز غرفه</button>${histHtml}</div>`;
  const s = L.daySummary(day);
  const rent = L.settings().booth_rent_default;
  return `<form class="screen no-nav" data-form="close-day">
    ${topbar('بستن روز غرفه')}
    <div class="hero">${orb('booth', 'sky', 52)}
      <span class="muted" style="font-size:12px;margin-top:8px">فروش غرفه · از ${faTime(day.opened_at)}</span>
      <span class="big-num">${money(s.revenue)}${unit}</span>
      <span class="muted" style="font-size:12px">${fa(s.count)} فاکتور${s.returns ? ` · ${fa(s.returns)} مرجوعی` : ''}</span></div>
    <div class="grid2">
      <div class="card mesh mesh-c" style="box-shadow:none"><small class="sub">سود ناخالص</small><div style="font-size:20px;font-weight:700">${kSigned(s.profit)}</div></div>
      <div class="card mesh mesh-b" style="box-shadow:none"><small class="sub">کارت‌به‌کارت</small><div style="font-size:20px;font-weight:700">${money(s.c2c)}</div></div>
    </div>
    <div class="section-title"><h2>شمارش صندوق</h2></div>
    <div class="list">
      <div class="row">${orb('cash', 'yellow')}<span class="t"><b>نقد</b><small>طبق فاکتورها ${money(s.cash)}</small></span><div class="inp" style="width:110px;min-height:44px;background:var(--field);box-shadow:none"><input name="cash" inputmode="decimal" value="${faPlain(s.cash / 1000)}" data-input="day-diff" data-exp="${s.cash}" style="text-align:center" aria-label="نقد شمارش‌شده"></div></div>
      <div class="row">${orb('card', 'sky')}<span class="t"><b>کارت‌خوان</b><small>طبق فاکتورها ${money(s.pos)}</small></span><div class="inp" style="width:110px;min-height:44px;background:var(--field);box-shadow:none"><input name="pos" inputmode="decimal" value="${faPlain(s.pos / 1000)}" data-input="day-diff" data-exp="${s.pos}" style="text-align:center" aria-label="کارت‌خوان شمارش‌شده"></div></div>
    </div>
    <div class="center" id="day-diff" style="font-size:13px"><span class="muted">${ic('check', 14).replace('class="ic"', 'class="ic" style="display:inline"')} صندوق با فاکتورها مطابق است</span></div>
    <label class="field"><span>اجاره‌ی امروز غرفه (هزار تومان)</span><div class="inp"><input name="rent" inputmode="decimal" value="${rent ? faPlain(rent / 1000) : ''}" placeholder="۰"></div></label>
    <label class="field"><span>یادداشت</span><div class="inp"><input name="note"></div></label>
    <button class="btn" type="submit">بستن روز غرفه</button>
    ${histHtml}
  </form>`;
}

// =============================================================
//  مالی
// =============================================================
function monthRange(offset) {
  let a = startOfJMonth(new Date());
  for (let i = 0; i < -offset; i++) a = startOfJMonth(addDays(a, -1));
  let b = addDays(a, 26); while (jParts(b).m === jParts(a).m) b = addDays(b, 1);
  return [a, b];
}
function financeView() {
  const [a, b] = monthRange(S.finOffset);
  const sm = L.summarize(a, b);
  const tx = [];
  for (const i of L.invoicesBetween(a, b)) tx.push({ at: i.created_at, icon: i.kind === 'return' ? 'ret' : i.channel === 'direct' ? 'chat' : 'booth', color: i.kind === 'return' ? 'lav' : i.channel === 'direct' ? 'pink' : 'sky', title: `${i.kind === 'return' ? 'مرجوعی' : 'فروش ' + L.CHANNELS[i.channel]} · ${i.no}`, amt: i.total, href: `#/invoice/${i.id}` });
  for (const e of L.expensesBetween(a, b)) tx.push({ at: e.date, icon: e.category === 'withdraw' ? 'minus' : e.category === 'rent' ? 'booth' : 'wallet', color: 'peach', title: L.EXPENSE_CATS[e.category] + (e.note ? ' · ' + e.note : ''), amt: -e.amount, exp: e.id });
  for (const m of L.purchasesBetween(a, b)) { const p = db.get('products', m.product_id); tx.push({ at: m.created_at, icon: 'inbox', color: 'yellow', title: `خرید کالا · ${p ? L.displayName(p) : ''} × ${fa(m.qty)}`, amt: -(m.unit_cost || 0) * m.qty, href: p ? `#/product/${p.id}` : null, info: true }); }
  tx.sort((x, y) => y.at.localeCompare(x.at));
  return `<div style="margin:0 0 -4px"><section class="mesh mesh-a" style="border-radius:0 0 36px 36px;padding:calc(20px + env(safe-area-inset-top)) 22px 26px;display:flex;flex-direction:column;gap:6px">
      <div class="row-between"><b style="font-size:16px">مالی</b>
        <div class="row-gap"><button class="cbtn sm" data-a="fin-month" data-d="-1" aria-label="ماه قبل" style="background:rgba(255,255,255,.55)">${ic('back', 18)}</button>
        <span style="font-size:13px">${faMonth(a)}</span>
        <button class="cbtn sm" data-a="fin-month" data-d="1" aria-label="ماه بعد" ${S.finOffset >= 0 ? 'disabled style="opacity:.35;background:rgba(255,255,255,.55)"' : 'style="background:rgba(255,255,255,.55)"'}>${ic('chev', 18)}</button></div></div>
      <span class="sub" style="font-size:12px;margin-top:12px">جمع فروش ماه</span>
      <span style="font-size:40px;font-weight:700;line-height:1.2">${money(sm.revenue)}<small style="font-size:14px;font-weight:400"> هزار تومان</small></span>
      <div style="display:flex;gap:14px;margin-top:14px;align-items:flex-start">
        ${[['expense', 'plus', 'هزینه'], ['withdraw', 'minus', 'برداشت'], ['day', 'booth', 'روز غرفه']].map(([a2, i2, l]) => `<span style="display:flex;flex-direction:column;align-items:center;gap:6px"><button class="cbtn" data-a="fin-${a2}" aria-label="${l}" style="width:52px;height:52px;background:rgba(255,255,255,.85);color:#17151C">${ic(i2, 20, 1.9)}</button><span style="font-size:11px">${l}</span></span>`).join('')}
        <a class="btn" href="#/reports" style="flex:1;height:52px;font-size:13px">گزارش ماه</a>
      </div></section></div>
  <div class="screen" style="padding-top:16px">
    <div class="card row-gap"><span class="t" style="display:flex;flex-direction:column;gap:2px;flex:1"><small class="muted" style="font-size:12px">سود خالص ماه</small><b style="font-size:22px">${kSigned(sm.net)}</b><small class="muted" style="font-size:11px">سود ناخالص ${kSigned(sm.profit)} − هزینه‌ها ${money(sm.expenses)}${sm.withdraw ? ` · برداشت ${money(sm.withdraw)}` : ''}</small></span>
      <span class="mesh mesh-c" style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center">${ic('trend', 26)}</span></div>
    <div class="grid2"><div class="card"><small class="muted">خرید کالا</small><div style="font-size:18px;font-weight:700">${money(sm.purchases)}</div></div><div class="card"><small class="muted">هزینه‌ی ارسال دریافتی</small><div style="font-size:18px;font-weight:700">${money(sm.shipping)}</div></div></div>
    <div class="section-title"><h2>تراکنش‌های ماه</h2><span class="muted" style="font-size:12px">${fa(tx.length)} مورد</span></div>
    <div class="list">${tx.length ? tx.slice(0, 60).map(t => {
      const inner = `${orb(t.icon, t.color)}<span class="t"><b>${esc(t.title)}</b><small>${relDay(t.at)}، ${faTime(t.at)}</small></span><span class="amt ${t.info ? 'muted' : t.amt < 0 ? 'neg' : 'pos'}">${kSigned(t.amt, true)}</span>`;
      return t.href ? `<a class="row" href="${t.href}">${inner}</a>` : t.exp ? `<button class="row" data-a="exp-edit" data-id="${t.exp}">${inner}</button>` : `<div class="row">${inner}</div>`;
    }).join('') : '<div class="card muted center">تراکنشی در این ماه نیست</div>'}</div>
  </div>${nav('finance')}`;
}
function expenseSheet(e = null, cat = 'rent') {
  const c = e?.category || cat;
  const sh = openSheet(`<h3>${e ? 'ویرایش هزینه' : c === 'withdraw' ? 'ثبت برداشت' : 'ثبت هزینه'}</h3>
    <form data-form="expense" data-id="${e?.id || ''}" style="display:flex;flex-direction:column;gap:12px">
      <label class="field"><span>مبلغ (هزار تومان)</span><div class="inp"><input name="amount" inputmode="decimal" required value="${e ? faPlain(e.amount / 1000) : ''}"></div></label>
      <div class="chips" style="flex-wrap:wrap;margin:0;padding:0">${Object.entries(L.EXPENSE_CATS).map(([kk, l]) => `<label class="chip ${kk === c ? 'on' : ''}" style="cursor:pointer"><input type="radio" name="category" value="${kk}" ${kk === c ? 'checked' : ''} hidden>${l}</label>`).join('')}</div>
      <label class="field"><span>توضیح</span><div class="inp"><input name="note" value="${esc(e?.note || '')}"></div></label>
      <button class="btn" type="submit">ذخیره</button>
      ${e ? `<button class="btn danger" type="button" data-a="exp-delete" data-id="${e.id}">حذف</button>` : ''}
    </form>`);
  sh.addEventListener('change', ev => { if (ev.target.name === 'category') sh.querySelectorAll('.chips .chip').forEach(x => x.classList.toggle('on', x.querySelector('input').checked)); });
}

// =============================================================
//  گزارش
// =============================================================
function reportsView() {
  const now = new Date();
  let from, to = addDays(startOfDay(now), 1), bars;
  if (S.repPeriod === 'week') { from = startOfWeek(now); to = addDays(from, 7); bars = L.dailySeries(from, 7).map(d => ({ v: d.revenue, l: faWeekdayShort(d.date), booth: d.booth, today: startOfDay(d.date).getTime() === startOfDay(now).getTime() })); }
  else if (S.repPeriod === 'month') { [from, to] = monthRange(0); const n = Math.round((to - from) / 86400000); bars = L.dailySeries(from, n).map(d => ({ v: d.revenue, l: fa(jParts(d.date).d), booth: d.booth, today: startOfDay(d.date).getTime() === startOfDay(now).getTime() })); }
  else { bars = []; let b = monthRange(0)[1]; for (let i = 11; i >= 0; i--) { const [x, y] = monthRange(-i); bars.push({ v: L.summarize(x, y).revenue, l: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short' }).format(x), today: i === 0 }); } from = monthRange(-11)[0]; to = b; }
  const sm = L.summarize(from, to);
  const max = Math.max(1, ...bars.map(b => b.v));
  const rank = L.productRanking(from, to);
  const inv = L.inventoryValue();
  const chTot = Math.max(1, sm.booth + sm.direct);
  return `<div class="screen">
    <div class="row-between"><h1 class="pagetitle">گزارش</h1><div class="seg">${[['week', 'هفته'], ['month', 'ماه'], ['year', 'سال']].map(([v, l]) => `<button class="${S.repPeriod === v ? 'on' : ''}" data-a="rep-period" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div class="grid2">
      <div class="card mesh mesh-a" style="box-shadow:none"><small class="sub">فروش</small><div style="font-size:22px;font-weight:700">${money(sm.revenue)}</div><small class="sub">${fa(sm.count)} فاکتور${sm.returns ? ` · ${fa(sm.returns)} مرجوعی` : ''}</small></div>
      <div class="card mesh mesh-c" style="box-shadow:none"><small class="sub">سود خالص</small><div style="font-size:22px;font-weight:700">${kSigned(sm.net)}</div><small class="sub">ناخالص ${kSigned(sm.profit)} · هزینه ${money(sm.expenses)}</small></div>
    </div>
    <div class="card"><div class="row-between" style="margin-bottom:14px"><b style="font-weight:500">روند فروش</b><small class="muted">هزار تومان</small></div>
      <div class="bars" role="img" aria-label="نمودار فروش">${bars.map(b => `<div class="${b.today ? 'hi' : ''} ${b.booth ? 'booth' : ''}" style="height:${Math.max(2, (b.v / max) * 100)}%" title="${money(b.v)}"></div>`).join('')}</div>
      <div class="bar-labels">${bars.map((b, i) => `<span>${bars.length > 14 && i % 3 ? '' : b.l}</span>`).join('')}</div>
      ${S.repPeriod !== 'year' ? `<div class="muted" style="font-size:11px;margin-top:8px;display:flex;align-items:center;gap:6px"><span style="width:6px;height:6px;border-radius:3px;background:#E46ED0"></span>روز غرفه</div>` : ''}
    </div>
    <div class="card"><b style="font-weight:500">سهم کانال‌ها</b>
      <div style="display:flex;gap:4px;height:10px;border-radius:5px;overflow:hidden;margin:12px 0 8px"><span style="width:${(sm.booth / chTot) * 100}%" class="org-sky"></span><span style="width:${(sm.direct / chTot) * 100}%" class="org-pink"></span></div>
      <div class="row-between" style="font-size:12px"><span>${ic('booth', 13).replace('class="ic"', 'class="ic" style="display:inline"')} غرفه ${money(sm.booth)}</span><span>${ic('chat', 13).replace('class="ic"', 'class="ic" style="display:inline"')} دایرکت ${money(sm.direct)}</span></div>
      <div class="kv" style="margin-top:8px"><span class="muted">نقد / کارت‌خوان / کارت‌به‌کارت</span><span>${money(sm.cash)} / ${money(sm.pos)} / ${money(sm.c2c)}</span></div>
    </div>
    <div class="section-title"><h2>پرفروش‌ها</h2></div>
    <div class="list">${rank.top.length ? rank.top.map(x => `<a class="row" href="#/product/${x.product.id}">${orb(catIcon(x.product), catColor(x.product), 36)}<span class="t"><b>${esc(L.displayName(x.product))}</b><small>${fa(x.qty)} عدد</small></span><span class="amt">${money(x.revenue)}</span></a>`).join('') : '<div class="card muted center">فروشی در این بازه نیست</div>'}</div>
    <div class="section-title"><h2>کم‌فروش‌ها</h2></div>
    <div class="list">${rank.low.map(x => `<a class="row" href="#/product/${x.product.id}">${orb(catIcon(x.product), catColor(x.product), 36)}<span class="t"><b>${esc(L.displayName(x.product))}</b><small>${fa(x.qty)} عدد فروش · موجودی ${fa(L.stockOf(x.product.id))}</small></span></a>`).join('') || '<div class="card muted center">—</div>'}</div>
    <div class="card"><div class="kv"><span class="muted">ارزش انبار (قیمت خرید)</span><b style="font-weight:500">${money(inv.value)} هزار تومان</b></div><div class="kv"><span class="muted">تعداد کالا / عدد موجود</span><span>${fa(inv.items)} / ${fa(inv.units)}</span></div><div class="kv"><span class="muted">خرید کالا در این بازه</span><span>${money(sm.purchases)}</span></div></div>
    <div class="grid2"><button class="btn light sm" data-a="export-sales" style="width:100%">${ic('download', 16)}اکسل فروش</button><button class="btn light sm" data-a="export-stock" style="width:100%">${ic('download', 16)}اکسل انبار</button></div>
  </div>${nav('reports')}`;
}

// =============================================================
//  هشدارها
// =============================================================
function alertsView() {
  const al = L.alerts();
  const sec = (title, list, cls, sub) => list.length ? `<div class="section-title"><h2>${title}</h2><span class="muted" style="font-size:12px">${fa(list.length)}</span></div><div class="list">${list.map(p => `<a class="row" href="#/product/${p.id}">${orb(catIcon(p), catColor(p))}<span class="t"><b>${esc(L.displayName(p))}</b><small class="${cls}">${sub(p)}</small></span><span class="amt">${L.stockOf(p.id) < 0 ? fa(-L.stockOf(p.id)) + '−' : fa(L.stockOf(p.id))}</span></a>`).join('')}</div>` : '';
  const last = L.lastSaleMap();
  return `<div class="screen no-nav">${topbar('هشدار موجودی')}
    ${!al.count ? `<div class="hero" style="padding:40px 0">${orb('check', 'sky', 64)}<h2 style="margin-top:10px">همه‌چیز مرتب است</h2></div>` : ''}
    ${sec('موجودی منفی', al.neg, 'neg', () => 'موجودی را با «شمارش» اصلاح کنید')}
    ${sec('موجودی کم', al.low, 'warn', p => `حد هشدار ${fa(L.lowThreshold(p))}`)}
    ${sec('کالای راکد', al.stale, 'muted', p => last.get(p.id) ? `آخرین فروش ${faDate(last.get(p.id))}` : 'هنوز فروش نرفته')}
  </div>`;
}

// =============================================================
//  تنظیمات و شخصی‌سازی
// =============================================================
function settingsView() {
  const st = L.settings();
  const theme = localStorage.getItem('mv-theme') || 'auto';
  const sc = sync.getConfig();
  return `<div class="screen no-nav">${topbar('تنظیمات و شخصی‌سازی')}
    <div class="section-title"><h2>ظاهر</h2></div>
    <div class="seg" style="align-self:flex-start">${[['light', 'sun', 'روشن'], ['dark', 'moon', 'تیره'], ['auto', 'sliders', 'خودکار']].map(([v, i, l]) => `<button class="${theme === v ? 'on' : ''}" data-a="theme" data-v="${v}">${ic(i, 14)}${l}</button>`).join('')}</div>
    <a class="row" href="#/categories">${orb('tag', 'pink', 36)}<span class="t"><b>دسته‌ها</b><small>نام، پیشوند کد، آیکون و رنگ</small></span>${ic('chev', 18)}</a>
    <div class="section-title"><h2>چیدمان داشبورد</h2></div>
    <div class="card" style="padding:4px 16px">${st.dash_cards.map((c, i) => `<div class="kv" style="align-items:center">
        <span class="row-gap"><button class="cbtn sm" data-a="dash-move" data-i="${i}" data-d="-1" aria-label="بالا" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>${ic('up', 16)}</button><button class="cbtn sm" data-a="dash-move" data-i="${i}" data-d="1" aria-label="پایین" ${i === st.dash_cards.length - 1 ? 'disabled style="opacity:.3"' : ''}>${ic('dn', 16)}</button><span class="${c.on ? '' : 'muted'}">${L.DASH_CARD_LABEL[c.key]}</span></span>
        <button role="switch" aria-checked="${c.on}" data-a="dash-toggle" data-i="${i}" aria-label="${L.DASH_CARD_LABEL[c.key]}" style="width:46px;height:28px;border-radius:14px;border:0;position:relative;background:${c.on ? 'var(--solid)' : 'var(--line)'}"><span style="position:absolute;top:4px;${c.on ? 'left' : 'right'}:4px;width:20px;height:20px;border-radius:10px;background:${c.on ? 'var(--on-solid)' : 'var(--card)'}"></span></button></div>`).join('')}</div>
    <div class="section-title"><h2>هشدار و روز غرفه</h2></div>
    <form data-form="settings" class="card" style="display:flex;flex-direction:column;gap:12px">
      <label class="field"><span>حد پیش‌فرض موجودی کم (عدد)</span><div class="inp" style="box-shadow:none;background:var(--field)"><input name="low" inputmode="numeric" value="${faPlain(st.low_stock_default)}"></div></label>
      <label class="field"><span>کالای راکد بعد از چند روز بدون فروش</span><div class="inp" style="box-shadow:none;background:var(--field)"><input name="stale" inputmode="numeric" value="${faPlain(st.stale_days)}"></div></label>
      <label class="field"><span>اجاره‌ی پیش‌فرض هر روز غرفه (هزار تومان)</span><div class="inp" style="box-shadow:none;background:var(--field)"><input name="rent" inputmode="decimal" value="${st.booth_rent_default ? faPlain(st.booth_rent_default / 1000) : ''}"></div></label>
      <label class="field"><span>نام فروشگاه</span><div class="inp" style="box-shadow:none;background:var(--field)"><input name="store" value="${esc(st.store_name)}"></div></label>
      <button class="btn sm" type="submit" style="align-self:flex-start">ذخیره</button>
    </form>
    <div class="section-title"><h2>کاربران این گوشی</h2><button data-a="user-add">${ic('plus', 14).replace('class="ic"', 'class="ic" style="display:inline"')} کاربر جدید</button></div>
    <div class="list">${S.users.map(u => `<button class="row" data-a="user-edit" data-id="${u.id}">${orb('user', u.id === S.user.id ? 'pink' : 'lav', 36)}<span class="t"><b>${esc(u.name)} ${u.id === S.user.id ? '<span class="badge pos">فعلی</span>' : ''}</b><small>کد فاکتور <span class="ltr">${esc(u.code)}</span></small></span>${ic('pencil', 16)}</button>`).join('')}</div>
    <div class="section-title"><h2>داده‌ها</h2></div>
    <a class="row" href="#/sync">${orb('cloud', 'sky', 36)}<span class="t"><b>همگام‌سازی ابری</b><small>${sc?.store_id ? esc(sc.store_name) + ' · ' : ''}${syncBadge()}</small></span>${ic('chev', 18)}</a>
    <div class="grid2">
      <button class="btn light sm" data-a="backup" style="width:100%">${ic('download', 16)}پشتیبان (فایل)</button>
      <label class="btn light sm" style="width:100%">${ic('upload', 16)}بازگردانی<input type="file" accept="application/json,.json" data-input="restore" hidden></label>
      <button class="btn light sm" data-a="export-sales" style="width:100%">${ic('download', 16)}اکسل فروش</button>
      <button class="btn light sm" data-a="export-stock" style="width:100%">${ic('download', 16)}اکسل انبار</button>
    </div>
    <a class="row" href="#/audit">${orb('clock', 'lav', 36)}<span class="t"><b>تاریخچه‌ی تغییرات</b><small>چه کسی، کی، چه چیزی را تغییر داد</small></span>${ic('chev', 18)}</a>
    <button class="btn light" data-a="lock">${ic('lock', 18)}قفل کردن</button>
    <p class="muted center" style="font-size:11px">Moon-vibe sells · نسخه‌ی ${VERSION}</p>
  </div>`;
}
function categoriesView() {
  const cats = L.categories();
  return `<div class="screen no-nav">${topbar('دسته‌ها', '#/settings', `<a class="cbtn dark" href="#/category/new" aria-label="دسته‌ی جدید">${ic('plus')}</a>`)}
    <div class="list">${cats.map(c => `<a class="row" href="#/category/${c.id}">${orb(c.icon, c.color)}<span class="t"><b>${esc(c.name)}</b><small>پیشوند کد <span class="ltr">${esc(c.prefix)}</span> · ${fa(L.products().filter(p => p.category_id === c.id).length)} کالا</small></span>${ic('chev', 18)}</a>`).join('')}</div>
  </div>`;
}
function categoryView(id) {
  const isNew = id === 'new';
  const c = isNew ? { name: '', prefix: '', icon: 'sparkle', color: 'pink' } : db.get('categories', id);
  if (!c) return notFound();
  const e = S.catEdit && S.catEdit.id === (c.id || 'new') ? S.catEdit : (S.catEdit = { id: c.id || 'new', icon: c.icon, color: c.color });
  return `<form class="screen no-nav" data-form="category" data-id="${c.id || ''}">${topbar(isNew ? 'دسته‌ی جدید' : 'ظاهر دسته', '#/categories')}
    <div style="position:relative;height:220px;margin-top:4px">
      <span class="mesh mesh-b" style="position:absolute;top:24px;right:6px;width:140px;height:180px;border-radius:32px;transform:rotate(8deg);opacity:.75"></span>
      <span class="mesh mesh-c" style="position:absolute;top:24px;left:6px;width:140px;height:180px;border-radius:32px;transform:rotate(-8deg);opacity:.75"></span>
      <div class="mesh mesh-${COLOR_MESH[e.color] || 'a'}" style="position:absolute;top:0;left:70px;right:70px;height:220px;border-radius:36px;padding:16px;display:flex;flex-direction:column;justify-content:space-between">${worb(e.icon, e.color, 52)}<b style="font-size:22px" id="cat-prev-name">${esc(c.name || 'نام دسته')}</b></div>
    </div>
    <div class="grid2"><label class="field"><span>نام دسته</span><div class="inp"><input name="name" required value="${esc(c.name)}" data-input="cat-name"></div></label>
      <label class="field"><span>پیشوند کد (لاتین)</span><div class="inp"><input name="prefix" required maxlength="4" dir="ltr" value="${esc(c.prefix)}" placeholder="SK" style="text-transform:uppercase;text-align:left"></div></label></div>
    <span class="muted center" style="font-size:13px">رنگ</span>
    <div class="row-gap" style="justify-content:center;gap:14px">${L.ORG_KEYS.map(x => `<button type="button" class="org-${x}" data-a="cat-color" data-v="${x}" aria-label="رنگ ${x}" style="width:44px;height:44px;border-radius:50%;border:0;${x === e.color ? 'box-shadow:0 0 0 3px var(--card),0 0 0 5px var(--ink)' : ''}"></button>`).join('')}</div>
    <span class="muted center" style="font-size:13px">آیکون</span>
    <div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px">${L.CAT_ICONS.map(x => `<button type="button" data-a="cat-icon" data-v="${x}" aria-label="آیکون ${x}" class="cbtn ${x === e.icon ? 'dark' : ''}" style="width:100%;height:42px">${ic(x, 19)}</button>`).join('')}</div>
    <div class="err-text" id="form-err"></div>
    <button class="btn" type="submit">ذخیره</button>
    ${!isNew ? `<button class="btn danger" type="button" data-a="cat-delete" data-id="${c.id}">حذف دسته</button>` : ''}
  </form>`;
}
function auditView() {
  const list = db.all('audit').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200);
  const A = { create: 'ثبت', update: 'ویرایش', delete: 'حذف', stock_in: 'ورود کالا', adjust: 'اصلاح موجودی', sale: 'فروش', return: 'مرجوعی', void: 'حذف فاکتور', day_open: 'شروع روز غرفه', day_close: 'بستن روز غرفه', expense: 'هزینه', category: 'دسته' };
  return `<div class="screen no-nav">${topbar('تاریخچه‌ی تغییرات', '#/settings')}
    <div class="card" style="padding:4px 16px">${list.length ? list.map(a => `<div class="kv"><span><b style="font-weight:500">${A[a.action] || a.action}</b> <small class="muted">${esc(a.detail || '')}</small><br><small class="muted">${esc(a.user || '')} · ${relDay(a.created_at)} ${faTime(a.created_at)}</small></span></div>`).join('') : '<div class="kv muted">چیزی ثبت نشده</div>'}</div></div>`;
}
function syncView() {
  const c = sync.getConfig();
  const st = sync.state;
  if (c?.store_id && st.status !== 'signed-out') return `<div class="screen no-nav">${topbar('همگام‌سازی ابری', '#/settings')}
    <div class="hero" style="padding:16px 0">${orb('cloud', 'sky', 64)}<h2 style="margin-top:10px">${esc(c.store_name)}</h2><span style="font-size:13px">${syncBadge()}</span></div>
    ${syncLine()}
    <div class="card" style="padding:4px 16px">
      <div class="kv"><span class="muted">کد اتصال گوشی دوم</span><b class="ltr" style="font-size:18px;letter-spacing:2px">${esc(c.join_code)}</b></div>
      <div class="kv"><span class="muted">حساب</span><span class="ltr">${esc(st.email || '')}</span></div>
      <div class="kv"><span class="muted">آخرین همگام‌سازی</span><span>${st.lastSync ? relDay(st.lastSync) + ' ' + faTime(st.lastSync) : '—'}</span></div>
      <div class="kv"><span class="muted">تغییرات در صف ارسال</span><span>${fa(st.pending)}</span></div>
    </div>
    <p class="muted" style="font-size:12px;margin:0">برای وصل کردن گوشی دوم: روی آن گوشی «اتصال به فروشگاه موجود» را بزنید، با ایمیل خودش ثبت‌نام کند و این کد را وارد کند.</p>
    <button class="btn" data-a="sync-now">${ic('cloud', 18)}همگام‌سازی الان</button>
    <button class="btn light" data-a="copy-code" data-v="${esc(c.join_code)}">${ic('copy', 18)}کپی کد اتصال</button>
    <button class="btn danger" data-a="sign-out">خروج از حساب</button></div>`;
  return `<div class="screen no-nav">${topbar('همگام‌سازی ابری', '#/settings')}
    <div class="hero" style="padding:10px 0">${orb('cloud', 'sky', 60)}<span class="muted" style="font-size:13px;margin-top:8px">با یک حساب ایمیلی، دو گوشی همیشه اطلاعات یکسان دارند. بدون اینترنت هم کار می‌کند و بعداً همگام می‌شود.</span></div>
    ${S.session ? `<div class="card" style="display:flex;flex-direction:column;gap:10px">
        <b style="font-weight:500">وارد شدید: <span class="ltr">${esc(S.session.user.email)}</span></b>
        ${(S.stores || []).map(s => `<button class="btn light" data-a="use-store" data-id="${s.id}">${ic('cloud', 18)}اتصال به «${esc(s.name)}»</button>`).join('')}
        <form data-form="create-store" style="display:flex;flex-direction:column;gap:10px"><label class="field"><span>ساخت فروشگاه ابری جدید</span><div class="inp" style="box-shadow:none;background:var(--field)"><input name="name" value="${esc(L.settings().store_name)}"></div></label><button class="btn" type="submit">ساخت فروشگاه و ارسال اطلاعات این گوشی</button></form>
        <form data-form="join-store" style="display:flex;flex-direction:column;gap:10px"><label class="field"><span>یا ورود با کد فروشگاه (از گوشی اول)</span><div class="inp" style="box-shadow:none;background:var(--field)"><input name="code" dir="ltr" maxlength="6" placeholder="AB12CD" style="text-transform:uppercase;text-align:center;letter-spacing:3px" required></div></label><button class="btn light" type="submit">اتصال با کد</button></form>
        <button class="btn danger sm" data-a="sign-out" style="align-self:center">خروج از حساب</button>
      </div>` : `<div class="seg" style="align-self:center"><button class="${S.syncTab === 'in' ? 'on' : ''}" data-a="sync-tab" data-v="in">ورود</button><button class="${S.syncTab === 'up' ? 'on' : ''}" data-a="sync-tab" data-v="up">ثبت‌نام</button></div>
      <form data-form="auth" style="display:flex;flex-direction:column;gap:12px">
        <label class="field"><span>ایمیل</span><div class="inp"><input name="email" type="email" dir="ltr" required autocomplete="email" style="text-align:left"></div></label>
        <label class="field"><span>رمز (حداقل ۶ کاراکتر)</span><div class="inp"><input name="password" type="password" dir="ltr" required minlength="6" autocomplete="${S.syncTab === 'up' ? 'new-password' : 'current-password'}" style="text-align:left"></div></label>
        <div class="err-text" id="form-err"></div>
        <button class="btn" type="submit">${S.syncTab === 'up' ? 'ثبت‌نام' : 'ورود'}</button>
      </form>`}
  </div>`;
}
const notFound = () => `<div class="screen no-nav">${topbar('پیدا نشد')}<div class="card muted center">این مورد حذف شده یا وجود ندارد.</div></div>`;

const VIEWS = {
  dash: dashView, sale: saleView, pay: payView, products: productsView, product: productView, edit: editView,
  invoices: invoicesView, invoice: invoiceView, day: dayView, finance: financeView, reports: reportsView, alerts: alertsView,
  settings: settingsView, categories: categoriesView, category: categoryView, audit: auditView, sync: syncView
};

// =============================================================
//  رویدادها
// =============================================================
async function scanForSale() {
  scanner.open({
    title: 'اسکن برای فروش', continuous: true,
    onCode: code => {
      const p = L.findByBarcode(code);
      if (!p) {
        scanner.close(true);
        render();
        unknownBarcode(code);
        return;
      }
      const q = addToCart(p);
      const s = L.stockOf(p.id);
      render();
      return `${L.displayName(p)} · ${fa(q)} در سبد${s - q < 0 ? ' · موجودی کافی نیست!' : ''}`;
    },
    onClose: () => render()
  });
}
function unknownBarcode(code) {
  openSheet(`<div class="hero">${orb('scan', 'peach', 56)}<h3 style="margin-top:8px">این بارکد ثبت نشده</h3><b class="ltr" style="font-size:18px;letter-spacing:1px">${esc(code)}</b></div>
    <a class="btn" href="#/edit/new?b=${encodeURIComponent(code)}">${ic('plus', 18)}ثبت کالای جدید با این بارکد</a>
    <button class="btn light" data-a="attach-barcode" data-v="${esc(code)}">${ic('tag', 18)}اتصال به کالای موجود</button>
    <button class="btn light" data-a="close-sheet">انصراف</button>`);
}

const ACTIONS = {
  'close-sheet': () => closeSheet(),
  // --- قفل/راه‌اندازی ---
  'setup-mode': el => { S.setup = { step: 'user', mode: el.dataset.m }; render(); },
  'setup-back': () => { S.setup = { step: 'welcome', mode: 'new' }; render(); },
  'lock-user': el => { S.lockUser = S.users.find(u => u.id === el.dataset.id); S.pin = ''; render(); },
  'pin-key': async el => {
    const kk = el.dataset.k;
    if (kk === 'del') S.pin = S.pin.slice(0, -1); else if (S.pin.length < 4) S.pin += kk;
    const dots = $('#pin-dots');
    if (dots) dots.innerHTML = [0, 1, 2, 3].map(i => `<i class="${S.pin.length > i ? 'f' : ''}"></i>`).join('');
    if (S.pin.length === 4) {
      const u = S.lockUser || S.users[0];
      const h = await sha256(u.salt + S.pin);
      if (h === u.pin) { await login(u); }
      else { S.pin = ''; dots?.classList.add('shake'); setTimeout(() => { if (dots) { dots.classList.remove('shake'); dots.innerHTML = '<i></i><i></i><i></i><i></i>'; } }, 380); navigator.vibrate?.(120); }
    }
  },
  lock: () => { S.user = null; db.setCurrentUser(null); S.pin = ''; S.cart = []; render(); },
  // --- داشبورد ---
  'day-start': async () => { await L.startDay(); toast('روز غرفه شروع شد'); render(); },
  // --- فروش ---
  channel: el => { S.channel = el.dataset.v; render(); },
  'sale-cat': el => { S.saleCat = el.dataset.v; S.saleQ = ''; render(); },
  'scan-sale': () => scanForSale(),
  'cart-inc': el => { const p = db.get('products', el.dataset.id); if (p) addToCart(p); render(); },
  'cart-dec': el => { const c = S.cart.find(x => x.product_id === el.dataset.id); if (c) { c.qty--; if (c.qty <= 0) S.cart = S.cart.filter(x => x !== c); } render(); },
  'cart-clear': async () => { if (await confirmBox('سبد خالی شود؟', { ok: 'خالی کن', danger: true })) { S.cart = []; S.discVal = ''; go('#/sale'); } },
  'attach-barcode': el => {
    const code = el.dataset.v;
    const sh = openSheet(`<h3>اتصال بارکد <span class="ltr">${esc(code)}</span> به کالا</h3><div class="search"><label>${ic('search', 18)}<input data-input="attach-q" placeholder="جستجوی کالا…"></label></div><div class="list" id="attach-list" data-code="${esc(code)}"></div>`);
    sh.querySelector('#attach-list').innerHTML = attachList('', code);
  },
  'attach-pick': async el => {
    const p = db.get('products', el.dataset.id);
    const code = el.dataset.code;
    if (L.barcodeTaken(code, p.id)) return toast('این بارکد روی کالای دیگری است', { err: true });
    await L.saveProduct({ ...p, barcode: code });
    closeSheet(); addToCart(db.get('products', p.id)); toast(`بارکد به «${L.displayName(p)}» وصل شد و به سبد اضافه شد`); render();
  },
  // --- پرداخت ---
  'disc-type': el => { S.discType = el.dataset.v; S.discVal = ''; render(); },
  'disc-key': el => {
    const kk = el.dataset.k;
    if (kk === 'del') S.discVal = S.discVal.slice(0, -1);
    else if (kk === '.') { if (!S.discVal.includes('.')) S.discVal = (S.discVal || '0') + '.'; }
    else if (S.discVal.length < 7) S.discVal = (S.discVal === '0' ? '' : S.discVal) + kk;
    if (S.discType === 'pct' && parseNum(S.discVal) > 100) S.discVal = '100';
    render();
  },
  payment: el => { S.payment = el.dataset.v; render(); },
  checkout: async el => {
    if (el.disabled) return;
    el.disabled = true;
    try {
      const dv = parseNum(S.discVal);
      const short = S.cart.filter(c => L.stockOf(c.product_id) - c.qty < 0);
      if (short.length && !(await confirmBox(`موجودی ${short.map(c => c.name).join('، ')} کافی نیست (موجودی منفی می‌شود). فاکتور ثبت شود؟`, { ok: 'ثبت با هشدار' }))) { el.disabled = false; return; }
      const inv = await L.createInvoice({
        cart: S.cart, channel: S.channel, discountType: S.discType, discountValue: S.discType === 'pct' ? dv : dv * 1000,
        payment: S.payment, shipping: fromK(S.shipping), customer: { ...S.customer }
      }, S.user);
      S.cart = []; S.discVal = ''; S.shipping = ''; S.customer = { name: '', phone: '', address: '' };
      toast(`فاکتور ${inv.no} ثبت شد`, { action: { label: 'مشاهده', fn: () => go('#/invoice/' + inv.id) } });
      go('#/sale');
    } catch (e) { toast(e.message, { err: true }); el.disabled = false; }
  },
  // --- کالا ---
  'prod-filter': el => { S.prodFilter = el.dataset.v; render(); },
  'prod-cat': el => { S.prodCat = S.prodCat === el.dataset.v ? null : el.dataset.v; render(); },
  'scan-find': () => scanner.open({
    title: 'پیدا کردن کالا',
    onCode: code => { const p = L.findByBarcode(code); setTimeout(() => p ? go('#/product/' + p.id) : unknownBarcode(code), 30); }
  }),
  'scan-field': () => scanner.open({
    title: 'اسکن بارکد کالا',
    onCode: code => {
      const f = document.querySelector('[data-form=product]');
      if (!f) return;
      f.barcode.value = code;
      const other = L.barcodeTaken(code, f.dataset.id);
      setTimeout(() => toast(other ? `این بارکد قبلاً برای «${L.displayName(other)}» ثبت شده` : 'بارکد ثبت شد', { err: !!other }), 50);
    }
  }),
  'edit-cat': el => {
    const f = el.closest('form');
    f.category_id.value = el.dataset.v;
    f.querySelectorAll('[data-a=edit-cat]').forEach(b => b.classList.toggle('on', b === el));
    if (!f.dataset.id) { const code = L.nextCode(el.dataset.v); $('#code-chip').textContent = code; }
  },
  addqty: el => { S.addQty = Math.max(1, S.addQty + Number(el.dataset.d)); render(); },
  'add-to-cart': el => { const p = db.get('products', el.dataset.id); const q = addToCart(p, S.addQty); S.addQty = 1; toast(`${L.displayName(p)} · ${fa(q)} در سبد`, { action: { label: 'رفتن به فروش', fn: () => go('#/sale') } }); render(); },
  'add-variant': el => go('#/edit/new?variant=' + el.dataset.id),
  'stock-in': el => {
    const p = db.get('products', el.dataset.id);
    openSheet(`<h3>ورود کالا · ${esc(L.displayName(p))}</h3><form data-form="stock-in" data-id="${p.id}" style="display:flex;flex-direction:column;gap:12px">
      <div class="grid2"><label class="field"><span>تعداد (عدد)</span><div class="inp"><input name="qty" inputmode="numeric" placeholder="۰"></div></label>
      <label class="field"><span>${p.pack_size > 1 ? `بسته (${fa(p.pack_size)}تایی)` : 'تعداد بسته'}</span><div class="inp"><input name="packs" inputmode="numeric" placeholder="۰" ${p.pack_size > 1 ? '' : 'disabled'}></div></label></div>
      <label class="field"><span>قیمت خرید هر عدد (هزار تومان) — آخرین قیمت خرید ثبت می‌شود</span><div class="inp"><input name="cost" inputmode="decimal" value="${p.buy_price ? faPlain(p.buy_price / 1000) : ''}"></div></label>
      <button class="btn" type="submit">ثبت ورود</button></form>`);
  },
  'stock-adjust': el => {
    const p = db.get('products', el.dataset.id);
    openSheet(`<h3>شمارش موجودی · ${esc(L.displayName(p))}</h3><p class="muted" style="margin:0;font-size:13px">موجودی فعلی در اپ: ${fa(L.stockOf(p.id))}. عدد شمارش‌شده‌ی واقعی را بزنید.</p>
      <form data-form="stock-adjust" data-id="${p.id}" style="display:flex;flex-direction:column;gap:12px">
      <label class="field"><span>موجودی واقعی</span><div class="inp"><input name="qty" inputmode="numeric" required value="${faPlain(Math.max(0, L.stockOf(p.id)))}"></div></label>
      <label class="field"><span>دلیل (اختیاری)</span><div class="inp"><input name="note" placeholder="مثلاً آسیب‌دیده، تست"></div></label>
      <button class="btn" type="submit">ثبت</button></form>`);
  },
  'delete-product': async el => {
    const p = db.get('products', el.dataset.id);
    if (await confirmBox(`«${L.displayName(p)}» حذف شود؟ فاکتورهای قبلی حفظ می‌شوند.`, { ok: 'حذف', danger: true })) { await L.deleteProduct(p); toast('کالا حذف شد'); go('#/products'); }
  },
  // --- فاکتور ---
  'inv-filter': el => { S.invFilter = el.dataset.v; render(); },
  'return-sheet': el => {
    const i = db.get('invoices', el.dataset.id);
    const ret = L.returnedQty(i);
    openSheet(`<h3>مرجوعی فاکتور <span class="ltr">${esc(i.no)}</span></h3><form data-form="return" data-id="${i.id}" style="display:flex;flex-direction:column;gap:10px">
      ${i.items.map(it => { const max = it.qty - (ret.get(it.product_id) || 0); return max > 0 ? `<div class="row" style="box-shadow:none;background:var(--field)"><span class="t"><b>${esc(it.name)}</b><small>حداکثر ${fa(max)} · ${money(it.price)}</small></span><div class="inp" style="width:84px;min-height:42px;box-shadow:none;background:var(--card)"><input name="q_${it.product_id}" inputmode="numeric" placeholder="۰" data-max="${max}" style="text-align:center"></div></div>` : ''; }).join('')}
      <button class="btn" type="submit">ثبت مرجوعی و برگشت به انبار</button></form>`);
  },
  'void-invoice': async el => {
    const i = db.get('invoices', el.dataset.id);
    if (await confirmBox(`فاکتور ${i.no} حذف شود؟ کالاها به موجودی برمی‌گردند.`, { ok: 'حذف فاکتور', danger: true })) { await L.voidInvoice(i); toast('فاکتور حذف شد'); go('#/invoices'); }
  },
  // --- مالی ---
  'fin-month': el => { S.finOffset = Math.min(0, S.finOffset + Number(el.dataset.d)); render(); },
  'fin-expense': () => expenseSheet(null, 'other'),
  'fin-withdraw': () => expenseSheet(null, 'withdraw'),
  'fin-day': () => go('#/day'),
  'exp-edit': el => expenseSheet(db.get('expenses', el.dataset.id)),
  'exp-delete': async el => { await db.remove('expenses', el.dataset.id); await db.audit('delete', 'expense', el.dataset.id, ''); closeSheet(); toast('حذف شد'); render(); },
  // --- گزارش/خروجی ---
  'rep-period': el => { S.repPeriod = el.dataset.v; render(); },
  'export-sales': () => exportSales(),
  'export-stock': () => exportStock(),
  backup: () => {
    const blob = new Blob([JSON.stringify(db.exportAll())], { type: 'application/json' });
    download(blob, `moonvibe-backup-${new Date().toISOString().slice(0, 10)}.json`);
    toast('فایل پشتیبان ساخته شد');
  },
  // --- تنظیمات ---
  theme: el => { localStorage.setItem('mv-theme', el.dataset.v); applyTheme(); render(); },
  'dash-toggle': async el => { const st = L.settings(); st.dash_cards[+el.dataset.i].on = !st.dash_cards[+el.dataset.i].on; await L.saveSettings({ dash_cards: st.dash_cards }); render(); },
  'dash-move': async el => {
    const st = L.settings(); const i = +el.dataset.i, j = i + Number(el.dataset.d);
    if (j < 0 || j >= st.dash_cards.length) return;
    [st.dash_cards[i], st.dash_cards[j]] = [st.dash_cards[j], st.dash_cards[i]];
    await L.saveSettings({ dash_cards: st.dash_cards }); render();
  },
  'user-add': () => userSheet(null),
  'user-edit': el => userSheet(S.users.find(u => u.id === el.dataset.id)),
  'user-delete': async el => {
    if (S.users.length < 2) return toast('حداقل یک کاربر لازم است', { err: true });
    if (!(await confirmBox('این کاربر از این گوشی حذف شود؟', { ok: 'حذف', danger: true }))) return;
    S.users = S.users.filter(u => u.id !== el.dataset.id); await db.setMeta('users', S.users);
    if (S.user.id === el.dataset.id) { S.user = null; }
    closeSheet(); render();
  },
  // --- دسته ---
  'cat-color': el => { S.catEdit.color = el.dataset.v; keepFormAndRender(); },
  'cat-icon': el => { S.catEdit.icon = el.dataset.v; keepFormAndRender(); },
  'cat-delete': async el => {
    const c = db.get('categories', el.dataset.id);
    if (L.products().some(p => p.category_id === c.id)) return toast('این دسته کالا دارد؛ اول کالاها را به دسته‌ی دیگری ببرید', { err: true });
    if (await confirmBox(`دسته‌ی «${c.name}» حذف شود؟`, { ok: 'حذف', danger: true })) { await db.remove('categories', c.id); go('#/categories'); }
  },
  // --- همگام‌سازی ---
  'sync-tab': el => { S.syncTab = el.dataset.v; render(); },
  'sync-now': async () => { await sync.syncNow(); toast(sync.state.status === 'online' ? 'همگام شد' : (sync.state.error || 'همگام نشد'), { err: sync.state.status !== 'online' }); render(); },
  'sign-out': async () => { if (await confirmBox('از حساب خارج شوید؟ اطلاعات روی این گوشی می‌ماند.', { ok: 'خروج' })) { await sync.signOut(); S.session = null; S.stores = []; render(); } },
  'use-store': async el => { try { const s = (S.stores || []).find(x => x.id === el.dataset.id); await sync.connectStore(s); toast('به فروشگاه وصل شد؛ در حال دریافت اطلاعات…'); render(); } catch (e) { toast(e.message, { err: true }); } },
  'copy-code': async el => { try { await navigator.clipboard.writeText(el.dataset.v); toast('کد کپی شد'); } catch { toast(el.dataset.v); } }
};
function attachList(q, code) {
  return L.searchProducts(q).slice(0, 30).map(p => `<button class="row" data-a="attach-pick" data-id="${p.id}" data-code="${esc(code)}" style="box-shadow:none;background:var(--field)">${orb(catIcon(p), catColor(p), 34)}<span class="t"><b>${esc(L.displayName(p))}</b><small><span class="ltr">${esc(p.code)}</span>${p.barcode ? ' · دارای بارکد' : ''}</small></span></button>`).join('') || '<div class="muted center">کالایی نیست</div>';
}
function keepFormAndRender() {
  const f = document.querySelector('form[data-form=category]');
  const keep = f ? { name: f.name.value, prefix: f.prefix.value } : null;
  render();
  const g = document.querySelector('form[data-form=category]');
  if (g && keep) { g.name.value = keep.name; g.prefix.value = keep.prefix; $('#cat-prev-name').textContent = keep.name || 'نام دسته'; }
}
function userSheet(u) {
  openSheet(`<h3>${u ? 'ویرایش کاربر' : 'کاربر جدید'}</h3><form data-form="user" data-id="${u?.id || ''}" style="display:flex;flex-direction:column;gap:12px">
    <label class="field"><span>نام</span><div class="inp"><input name="name" required value="${esc(u?.name || '')}"></div></label>
    <label class="field"><span>کد کاربر (روی شماره‌ی فاکتور، یک حرف لاتین)</span><div class="inp"><input name="code" required maxlength="2" dir="ltr" value="${esc(u?.code || '')}" style="text-transform:uppercase;text-align:left"></div></label>
    <div class="grid2"><label class="field"><span>رمز جدید ۴ رقمی${u ? ' (خالی = بدون تغییر)' : ''}</span><div class="inp"><input name="pin" inputmode="numeric" maxlength="4" type="password" dir="ltr" ${u ? '' : 'required'} style="text-align:center"></div></label>
    <label class="field"><span>تکرار رمز</span><div class="inp"><input name="pin2" inputmode="numeric" maxlength="4" type="password" dir="ltr" style="text-align:center"></div></label></div>
    <div class="err-text" id="user-err"></div>
    <button class="btn" type="submit">ذخیره</button>
    ${u ? `<button class="btn danger" type="button" data-a="user-delete" data-id="${u.id}">حذف کاربر</button>` : ''}</form>`);
}

// ---------- فرم‌ها ----------
const FORMS = {
  setup: async f => {
    const err = $('#setup-err');
    const name = f.name.value.trim(), code = f.code.value.trim().toUpperCase(), pin = toLatinDigits(f.pin.value), pin2 = toLatinDigits(f.pin2.value);
    if (!/^[A-Z]{1,2}$/.test(code)) return err.textContent = 'کد کاربر باید یک یا دو حرف لاتین باشد (مثلاً M).';
    if (!/^\d{4}$/.test(pin)) return err.textContent = 'رمز باید ۴ رقم باشد.';
    if (pin !== pin2) return err.textContent = 'رمز و تکرارش یکسان نیست.';
    const salt = Math.random().toString(36).slice(2);
    const u = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, code, salt, pin: await sha256(salt + pin) };
    S.users = [u]; await db.setMeta('users', S.users);
    if (S.setup.mode === 'new') {
      await L.seedCategories();
      await L.saveSettings({ store_name: f.store.value.trim() || 'مون وایب' });
      await db.setMeta('setup_done', true);
      await login(u, '#/dash');
    } else {
      await db.setMeta('setup_done', true);
      await login(u, '#/sync');
    }
  },
  'dash-search': f => { S.prodQ = f.q.value.trim(); go('#/products'); },
  'sale-search': f => {
    const q = f.q.value.trim();
    const p = L.findByBarcode(q);
    if (p) { addToCart(p); S.saleQ = ''; toast(`${L.displayName(p)} به سبد اضافه شد`); render(); setTimeout(() => document.querySelector('[data-input=sale-q]')?.focus(), 30); }
    else if (/^\d{6,}$/.test(toLatinDigits(q))) unknownBarcode(toLatinDigits(q));
  },
  'prod-search': f => { const p = L.findByBarcode(f.q.value.trim()); if (p) go('#/product/' + p.id); },
  product: async f => {
    const err = $('#form-err');
    const name = f.name.value.trim();
    const sell = fromK(f.sell.value), buy = fromK(f.buy.value);
    const barcode = toLatinDigits(f.barcode.value.trim());
    const catId = f.category_id.value;
    if (!name) return err.textContent = 'نام کالا را وارد کنید.';
    if (!catId) return err.textContent = 'دسته را انتخاب کنید.';
    if (!sell) return err.textContent = 'قیمت فروش را وارد کنید.';
    const id = f.dataset.id || undefined;
    const other = L.barcodeTaken(barcode, id);
    if (other) return err.textContent = `این بارکد قبلاً برای «${L.displayName(other)}» ثبت شده.`;
    const prev = id ? db.get('products', id) : null;
    const base = f.dataset.base ? db.get('products', f.dataset.base) : null;
    const packSize = Math.max(1, Math.round(parseNum(f.pack_size.value)) || 1);
    const lowRaw = f.low_stock.value.trim();
    const data = {
      ...(prev || {}), id, name, brand: f.brand.value.trim(), variant: f.variant.value.trim(), barcode, category_id: catId,
      buy_price: buy, sell_price: sell, pack_size: packSize, low_stock: lowRaw === '' ? null : Math.round(parseNum(lowRaw)), note: f.note.value.trim(),
      code: prev?.code && prev.category_id === catId ? prev.code : L.nextCode(catId)
    };
    if (base) { data.group_id = base.group_id || base.id; if (!base.group_id) await db.save('products', { ...base, group_id: base.id }); }
    let initial = 0;
    if (!id) initial = Math.round(parseNum(f.qty?.value || 0)) + Math.round(parseNum(f.packs?.value || 0)) * packSize;
    const p = await L.saveProduct(data, { initialQty: initial });
    S.editCat = null;
    toast('کالا ذخیره شد');
    go('#/product/' + p.id);
  },
  'stock-in': async f => {
    const p = db.get('products', f.dataset.id);
    const qty = Math.round(parseNum(f.qty.value)) + Math.round(parseNum(f.packs.value || 0)) * (p.pack_size || 1);
    if (!qty) return toast('تعداد را وارد کنید', { err: true });
    await L.receiveStock(p, qty, fromK(f.cost.value));
    closeSheet(); toast(`${fa(qty)} عدد وارد انبار شد`); render();
  },
  'stock-adjust': async f => {
    const p = db.get('products', f.dataset.id);
    await L.adjustStock(p, Math.round(parseNum(f.qty.value)), f.note.value.trim());
    closeSheet(); toast('موجودی اصلاح شد'); render();
  },
  return: async f => {
    const i = db.get('invoices', f.dataset.id);
    const lines = i.items.map(it => {
      const inp = f[`q_${it.product_id}`];
      return { product_id: it.product_id, qty: inp ? Math.min(Number(inp.dataset.max), Math.round(parseNum(inp.value))) : 0 };
    });
    try { const r = await L.createReturn(i, lines, S.user); closeSheet(); toast(`مرجوعی ${r.no} ثبت شد`); go('#/invoice/' + r.id); }
    catch (e) { toast(e.message, { err: true }); }
  },
  'close-day': async f => {
    const day = L.openDay();
    if (!day) return;
    if (!(await confirmBox('روز غرفه بسته شود؟'))) return;
    await L.closeDay(day, { rent: fromK(f.rent.value), counted_cash: fromK(f.cash.value), counted_pos: fromK(f.pos.value), note: f.note.value.trim() });
    toast('روز غرفه بسته شد'); go('#/dash');
  },
  expense: async f => {
    const amount = fromK(f.amount.value);
    if (!amount) return toast('مبلغ را وارد کنید', { err: true });
    const cur = f.dataset.id ? db.get('expenses', f.dataset.id) : null;
    const e = await db.save('expenses', { ...(cur || {}), date: cur?.date || nowISO(), category: f.category.value, amount, note: f.note.value.trim() });
    await db.audit(cur ? 'update' : 'create', 'expense', e.id, `${L.EXPENSE_CATS[e.category]} ${amount}`);
    closeSheet(); toast('ثبت شد'); render();
  },
  settings: async f => {
    await L.saveSettings({ low_stock_default: Math.round(parseNum(f.low.value)), stale_days: Math.max(1, Math.round(parseNum(f.stale.value))), booth_rent_default: fromK(f.rent.value), store_name: f.store.value.trim() || 'مون وایب' });
    toast('تنظیمات ذخیره شد'); render();
  },
  user: async f => {
    const err = $('#user-err');
    const code = f.code.value.trim().toUpperCase();
    const pin = toLatinDigits(f.pin.value), pin2 = toLatinDigits(f.pin2.value);
    if (!/^[A-Z]{1,2}$/.test(code)) return err.textContent = 'کد کاربر باید یک یا دو حرف لاتین باشد.';
    const id = f.dataset.id;
    if (S.users.some(u => u.code === code && u.id !== id)) return err.textContent = 'این کد برای کاربر دیگری است.';
    if ((pin || !id) && !/^\d{4}$/.test(pin)) return err.textContent = 'رمز باید ۴ رقم باشد.';
    if (pin && pin !== pin2) return err.textContent = 'رمز و تکرارش یکسان نیست.';
    let u = S.users.find(x => x.id === id);
    if (!u) { u = { id: crypto.randomUUID(), salt: Math.random().toString(36).slice(2) }; S.users.push(u); }
    u.name = f.name.value.trim(); u.code = code;
    if (pin) u.pin = await sha256(u.salt + pin);
    await db.setMeta('users', S.users);
    if (S.user?.id === u.id) { S.user = u; db.setCurrentUser(u); }
    closeSheet(); toast('کاربر ذخیره شد'); render();
  },
  category: async f => {
    const err = $('#form-err');
    const name = f.name.value.trim(), prefix = f.prefix.value.trim().toUpperCase();
    if (!name) return err.textContent = 'نام دسته را وارد کنید.';
    if (!/^[A-Z]{1,4}$/.test(prefix)) return err.textContent = 'پیشوند باید ۱ تا ۴ حرف لاتین باشد.';
    const id = f.dataset.id || undefined;
    if (L.categories().some(c => c.prefix === prefix && c.id !== id)) return err.textContent = 'این پیشوند برای دسته‌ی دیگری است.';
    const cur = id ? db.get('categories', id) : null;
    await db.save('categories', { ...(cur || {}), id, name, prefix, icon: S.catEdit.icon, color: S.catEdit.color, sort: cur?.sort ?? (L.categories().length + 1) });
    await db.audit(cur ? 'update' : 'create', 'category', id || '', name);
    S.catEdit = null; toast('دسته ذخیره شد'); go('#/categories');
  },
  auth: async f => {
    const err = $('#form-err');
    err.textContent = '';
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      if (S.syncTab === 'up') {
        const r = await sync.signUp(f.email.value.trim(), f.password.value);
        if (!r.session) { err.style.color = 'var(--pos)'; err.textContent = 'ثبت‌نام شد. لینک تأیید به ایمیل شما فرستاده شد؛ بعد از تأیید، «ورود» را بزنید.'; S.syncTab = 'in'; btn.disabled = false; return; }
      } else await sync.signIn(f.email.value.trim(), f.password.value);
      S.session = await sync.session();
      S.stores = await sync.myStores();
      render();
    } catch (e) { err.style.color = ''; err.textContent = e.message; btn.disabled = false; }
  },
  'create-store': async f => {
    try { await sync.createStore(f.name.value.trim() || 'مون وایب', S.user.name, S.user.code); toast('فروشگاه ابری ساخته شد'); render(); }
    catch (e) { toast(e.message, { err: true }); }
  },
  'join-store': async f => {
    try { await sync.joinStore(f.code.value.trim(), S.user.name, S.user.code); toast('به فروشگاه وصل شد؛ در حال دریافت اطلاعات…'); render(); }
    catch (e) { toast(e.message, { err: true }); }
  }
};

// ---------- ورودی‌های زنده ----------
const INPUTS = {
  'sale-q': el => { S.saleQ = el.value; $('#sale-list').innerHTML = saleList(); },
  'prod-q': el => { S.prodQ = el.value; $('#prod-list').innerHTML = prodList(); },
  'attach-q': el => { const l = $('#attach-list'); l.innerHTML = attachList(el.value, l.dataset.code); },
  shipping: el => { S.shipping = el.value; updatePayTotals(); },
  'cust-name': el => { S.customer.name = el.value; },
  'cust-phone': el => { S.customer.phone = el.value; },
  'cust-address': el => { S.customer.address = el.value; },
  'cat-name': el => { $('#cat-prev-name').textContent = el.value || 'نام دسته'; },
  'price-calc': el => updateMargin(el.closest('form')),
  'day-diff': el => {
    const f = el.closest('form');
    let diff = 0;
    f.querySelectorAll('[data-input=day-diff]').forEach(i => { diff += fromK(i.value) - Number(i.dataset.exp); });
    $('#day-diff').innerHTML = diff === 0 ? '<span class="muted">صندوق با فاکتورها مطابق است</span>' : `<span class="${diff < 0 ? 'neg' : 'warn'}">${diff < 0 ? 'کسری' : 'اضافه'} صندوق: ${k(Math.abs(diff))} هزار تومان</span>`;
  },
  restore: async el => {
    const file = el.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!(await confirmBox('اطلاعات فایل پشتیبان با اطلاعات فعلی ادغام شود؟', { ok: 'بازگردانی' }))) return;
      await db.importAll(data); await db.requeueAll(); toast('بازگردانی انجام شد'); render();
    } catch (e) { toast(e.message || 'فایل نامعتبر است', { err: true }); }
  }
};
function updatePayTotals() {
  const dv = parseNum(S.discVal);
  const t = L.cartTotals(S.cart, { discountType: S.discType, discountValue: S.discType === 'pct' ? dv : dv * 1000, shipping: fromK(S.shipping) });
  const el = $('#pay-total'); if (el) el.innerHTML = `${money(t.total)}${unit}`;
}
function updateMargin(f) {
  if (!f) return;
  const buy = fromK(f.buy.value), sell = fromK(f.sell.value);
  const el = $('#margin-line');
  if (!el) return;
  if (!sell) { el.textContent = '—'; return; }
  const m = sell - buy;
  el.innerHTML = `<span class="${m < 0 ? 'neg' : ''}">${kSigned(m)} هزار تومان · ${fa(Math.round((m / sell) * 100))}٪</span>`;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.a];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  FORMS[f.dataset.form]?.(f);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]');
  if (el && el.type !== 'file') INPUTS[el.dataset.input]?.(el);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-input]');
  if (el && el.type === 'file') INPUTS[el.dataset.input]?.(el);
});

// ---------- خروجی اکسل ----------
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function xlsx(sheets, name) {
  const X = window.XLSX;
  if (!X) return toast('ماژول اکسل بارگذاری نشد', { err: true });
  const wb = X.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const [title, rows] of sheets) {
    const ws = X.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map(h => ({ wch: Math.max(10, h.length + 4) }));
    X.utils.book_append_sheet(wb, ws, title);
  }
  const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
  toast('فایل اکسل ساخته شد');
}
const jdate = d => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
function exportSales() {
  const invs = db.all('invoices').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const rows = invs.map(i => ({
    'شماره': i.no, 'نوع': i.kind === 'return' ? 'مرجوعی' : 'فروش', 'تاریخ': jdate(i.created_at), 'ساعت': faTime(i.created_at), 'کانال': L.CHANNELS[i.channel], 'پرداخت': L.PAYMENTS[i.payment] || '',
    'ثبت‌کننده': i.user_name || '', 'تعداد اقلام': i.items.reduce((s, x) => s + x.qty, 0), 'جمع (تومان)': i.subtotal, 'تخفیف (تومان)': i.discount, 'ارسال (تومان)': i.shipping || 0,
    'مبلغ نهایی (تومان)': i.total, 'سود (تومان)': i.profit, 'مشتری': i.customer?.name || '', 'تلفن': i.customer?.phone || '', 'آدرس': i.customer?.address || ''
  }));
  const items = [];
  for (const i of invs) for (const it of i.items) items.push({ 'شماره فاکتور': i.no, 'تاریخ': jdate(i.created_at), 'کالا': it.name, 'کد': it.code, 'دسته': it.category_name, 'تعداد': i.kind === 'return' ? -it.qty : it.qty, 'قیمت فروش (تومان)': it.price, 'قیمت خرید (تومان)': it.cost });
  const exps = db.all('expenses').map(e => ({ 'تاریخ': jdate(e.date), 'نوع': L.EXPENSE_CATS[e.category], 'مبلغ (تومان)': e.amount, 'توضیح': e.note || '' }));
  const days = L.closedDays().map(d => ({ 'تاریخ': jdate(d.opened_at), 'شروع': faTime(d.opened_at), 'پایان': faTime(d.closed_at), 'فروش (تومان)': d.revenue || 0, 'سود ناخالص': d.profit || 0, 'اجاره': d.rent || 0, 'نقد طبق فاکتور': d.expected_cash || 0, 'نقد شمارش‌شده': d.counted_cash || 0, 'کارت‌خوان طبق فاکتور': d.expected_pos || 0, 'کارت‌خوان شمارش‌شده': d.counted_pos || 0 }));
  xlsx([['فاکتورها', rows.length ? rows : [{ 'شماره': '' }]], ['اقلام', items.length ? items : [{ 'کالا': '' }]], ['هزینه‌ها', exps.length ? exps : [{ 'نوع': '' }]], ['روزهای غرفه', days.length ? days : [{ 'تاریخ': '' }]]], `moonvibe-sales-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
function exportStock() {
  const rows = L.products().sort((a, b) => a.code.localeCompare(b.code)).map(p => ({
    'کد': p.code, 'نام': p.name, 'تنوع': p.variant || '', 'دسته': catOf(p)?.name || '', 'برند': p.brand || '', 'بارکد': p.barcode || '',
    'موجودی': L.stockOf(p.id), 'قیمت خرید (تومان)': p.buy_price || 0, 'قیمت فروش (تومان)': p.sell_price || 0, 'ارزش موجودی (تومان)': Math.max(0, L.stockOf(p.id)) * (p.buy_price || 0), 'وضعیت': { neg: 'منفی', low: 'کم', stale: 'راکد', ok: '' }[L.productStatus(p)]
  }));
  xlsx([['انبار', rows.length ? rows : [{ 'کد': '' }]]], `moonvibe-stock-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ---------- ورود و راه‌اندازی ----------
async function login(u, to) {
  S.user = u; S.pin = ''; db.setCurrentUser(u);
  if (to) { if (location.hash !== to) location.hash = to; S.route = parseHash(); }
  if (S.route.name === 'sync' && !sync.getConfig()?.store_id) {
    S.session = await sync.session();
    if (S.session) { try { S.stores = await sync.myStores(); } catch { } }
  }
  render(true);
}

async function boot() {
  applyTheme();
  try { await db.initDB(); }
  catch (e) { app.innerHTML = `<div class="lock"><h2>خطا در بارگذاری داده‌ها</h2><p class="muted center">${esc(e.message)}<br>مرورگر را به‌روز کنید یا حالت خصوصی را خاموش کنید.</p></div>`; return; }
  S.users = (await db.getMeta('users', [])) || [];
  S.route = parseHash();
  await sync.initSync().catch(() => { });
  db.on('change', () => { if (S.user && !['edit', 'category', 'day', 'pay', 'sync'].includes(S.route.name)) softRender(); });
  db.on('sync', () => { if (S.user && ['dash', 'sale', 'sync', 'settings'].includes(S.route.name)) softRender(); });
  render(true);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('نسخه‌ی جدید آماده است', { action: { label: 'به‌روزرسانی', fn: () => location.reload() } }); });
      });
    }).catch(() => { });
  }
}
// برای آزمون خودکار
window.__mv = { S, L, db, sync, scanner, render, go };
boot();
