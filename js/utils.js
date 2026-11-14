// ابزارهای عمومی: اعداد فارسی، تاریخ شمسی، شناسه، HTML امن
export const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }));

export const nowISO = () => new Date().toISOString();

const nf0 = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
const nfPlain = new Intl.NumberFormat('fa-IR', { useGrouping: false });

/** عدد فارسی با جداکننده‌ی هزارگان */
export const fa = (n, dec = 0) => (dec ? nf1 : nf0).format(Number(n) || 0);
export const faPlain = n => nfPlain.format(Number(n) || 0);

/** مبلغ‌ها در دیتابیس به تومان ذخیره می‌شوند؛ نمایش و ورود به «هزار تومان» */
export const k = toman => {
  const v = (Number(toman) || 0) / 1000;
  return Number.isInteger(v) ? nf0.format(v) : nf1.format(Math.round(v * 10) / 10);
};
/** مبلغ با علامت؛ منفی به سبک فارسی: ۴۰۰− */
export const kSigned = (toman, plus = false) => {
  const v = Number(toman) || 0;
  if (v < 0) return k(-v) + '−';
  return k(v) + (plus && v > 0 ? '+' : '');
};
export const faSigned = n => (n < 0 ? fa(-n) + '−' : fa(n));

/** تبدیل ارقام فارسی/عربی به لاتین و حذف جداکننده */
export const toLatinDigits = s => String(s ?? '')
  .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
export const parseNum = s => {
  const t = toLatinDigits(s).replace(/[٬,\s]/g, '').replace('٫', '.').replace(/[^\d.\-]/g, '');
  const v = parseFloat(t);
  return isFinite(v) ? v : 0;
};
/** ورودی کاربر به هزار تومان → تومان */
export const fromK = s => Math.round(parseNum(s) * 1000);

// ---------- تاریخ شمسی ----------
const fmtDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long' });
const fmtDateY = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtWeekday = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long' });
const fmtWeekdayShort = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'narrow' });
const fmtTime = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtMonth = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', year: 'numeric' });
const partsFmt = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' });

export const jParts = d => {
  const p = {};
  for (const x of partsFmt.formatToParts(new Date(d))) if (x.type !== 'literal') p[x.type] = parseInt(toLatinDigits(x.value), 10);
  return { y: p.year, m: p.month, d: p.day };
};
export const faDate = (d, withYear = false) => (withYear ? fmtDateY : fmtDate).format(new Date(d));
export const faTime = d => fmtTime.format(new Date(d));
export const faWeekday = d => fmtWeekday.format(new Date(d));
export const faWeekdayShort = d => fmtWeekdayShort.format(new Date(d));
export const faMonth = d => fmtMonth.format(new Date(d));
export const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`; };
export const monthKey = d => { const p = jParts(d); return `${p.y}-${String(p.m).padStart(2, '0')}`; };
export const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const isSameDay = (a, b) => dayKey(a) === dayKey(b);
export const relDay = d => {
  const t = startOfDay(new Date()), x = startOfDay(d);
  const diff = Math.round((t - x) / 86400000);
  if (diff === 0) return 'امروز';
  if (diff === 1) return 'دیروز';
  return faDate(d);
};
/** شروع ماه شمسی جاری */
export const startOfJMonth = (d = new Date()) => {
  let x = startOfDay(d);
  const m = jParts(x).m;
  while (jParts(addDays(x, -1)).m === m) x = addDays(x, -1);
  return x;
};
/** شنبه‌ی همین هفته */
export const startOfWeek = (d = new Date()) => {
  const x = startOfDay(d);
  const back = (x.getDay() + 1) % 7; // شنبه=6 در JS
  return addDays(x, -back);
};

// ---------- HTML ----------
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** نرمال‌سازی متن فارسی برای جستجو */
export const norm = s => toLatinDigits(String(s ?? '').toLowerCase())
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌\s]+/g, ' ').trim();
