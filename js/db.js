// لایه‌ی داده‌ی آفلاین‌اول: IndexedDB + کش در حافظه + صف همگام‌سازی (outbox)
import { uuid, nowISO } from './utils.js';

export const SYNCED = ['categories', 'products', 'moves', 'invoices', 'expenses', 'days', 'audit', 'settings'];
const LOCAL = ['meta', 'outbox'];
const DB_NAME = 'moonvibe-sells';
const DB_VER = 1;

let idb;
const mem = {};            // table -> Map(id -> rec)
const bus = new EventTarget();
export const on = (ev, fn) => bus.addEventListener(ev, e => fn(e.detail));
export const emit = (ev, detail) => bus.dispatchEvent(new CustomEvent(ev, { detail }));

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export async function initDB() {
  idb = await new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const t of [...SYNCED, ...LOCAL]) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: t === 'meta' ? 'key' : 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
  for (const t of SYNCED) {
    const rows = await req(idb.transaction(t).objectStore(t).getAll());
    mem[t] = new Map(rows.map(r => [r.id, r]));
  }
  // درخواست ذخیره‌سازی دائمی تا مرورگر داده‌ها را پاک نکند
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { }
}

// ---------- meta (فقط محلی) ----------
export async function getMeta(key, def = null) {
  const r = await req(idb.transaction('meta').objectStore('meta').get(key));
  return r ? r.value : def;
}
export async function setMeta(key, value) {
  await req(idb.transaction('meta', 'readwrite').objectStore('meta').put({ key, value }));
}

// ---------- خواندن ----------
export const all = (t, withDeleted = false) => [...mem[t].values()].filter(r => withDeleted || !r.deleted);
export const get = (t, id) => { const r = mem[t].get(id); return r && !r.deleted ? r : null; };
export const getRaw = (t, id) => mem[t].get(id) || null;

// ---------- نوشتن محلی ----------
let currentUser = null;
export const setCurrentUser = u => { currentUser = u; };
export const getCurrentUser = () => currentUser;

async function putIDB(t, rec) {
  const tx = idb.transaction([t, 'outbox'], 'readwrite');
  tx.objectStore(t).put(rec);
  tx.objectStore('outbox').put({ id: t + ':' + rec.id, table: t, rid: rec.id, at: Date.now() });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}

/** ذخیره/به‌روزرسانی رکورد + صف همگام‌سازی */
export async function save(t, rec, { silent = false } = {}) {
  const prev = rec.id ? mem[t].get(rec.id) : null;
  const r = { ...prev, ...rec };
  if (!r.id) r.id = uuid();
  if (!r.created_at) r.created_at = nowISO();
  if (!r.created_by && currentUser) { r.created_by = currentUser.name; r.created_by_code = currentUser.code; }
  r.updated_at = nowISO();
  r.deleted = !!r.deleted;
  mem[t].set(r.id, r);
  await putIDB(t, r);
  if (!silent) emit('change', { table: t, id: r.id });
  emit('dirty');
  return r;
}
export async function remove(t, id) {
  const r = mem[t].get(id);
  if (!r) return;
  return save(t, { ...r, deleted: true });
}

/** ثبت رخداد در تاریخچه‌ی تغییرات */
export async function audit(action, entity, entityId, detail = '') {
  return save('audit', { action, entity, entity_id: entityId, detail, user: currentUser?.name || '' }, { silent: true });
}

// ---------- همگام‌سازی ----------
export async function outboxAll() { return req(idb.transaction('outbox').objectStore('outbox').getAll()); }
export async function outboxCount() { return req(idb.transaction('outbox').objectStore('outbox').count()); }
export async function outboxDone(entries) {
  const tx = idb.transaction('outbox', 'readwrite');
  const st = tx.objectStore('outbox');
  for (const e of entries) {
    // فقط اگر بعد از ارسال دوباره تغییر نکرده باشد حذف شود
    const g = st.get(e.id);
    g.onsuccess = () => { const cur = g.result; if (cur && cur.at === e.at) st.delete(e.id); };
  }
  await new Promise(res => { tx.oncomplete = res; tx.onerror = res; });
}
/** همه‌ی رکوردها را دوباره در صف می‌گذارد (هنگام اتصال به فروشگاه ابری) */
export async function requeueAll() {
  const tx = idb.transaction('outbox', 'readwrite');
  const st = tx.objectStore('outbox');
  for (const t of SYNCED) for (const r of mem[t].values()) st.put({ id: t + ':' + r.id, table: t, rid: r.id, at: Date.now() });
  await new Promise(res => { tx.oncomplete = res; });
}
/** اعمال رکورد دریافتی از سرور (برنده: updated_at جدیدتر) */
export async function applyRemote(t, rec) {
  const cur = mem[t].get(rec.id);
  if (cur && cur.updated_at > rec.updated_at) return false;
  if (cur && cur.updated_at === rec.updated_at && cur.deleted === rec.deleted) return false;
  mem[t].set(rec.id, rec);
  await req(idb.transaction(t, 'readwrite').objectStore(t).put(rec));
  return true;
}

// ---------- پشتیبان ----------
export function exportAll() {
  const out = { app: 'moon-vibe-sells', version: 1, exported_at: nowISO(), tables: {} };
  for (const t of SYNCED) out.tables[t] = [...mem[t].values()];
  return out;
}
export async function importAll(data) {
  if (!data || data.app !== 'moon-vibe-sells') throw new Error('فایل پشتیبان معتبر نیست');
  for (const t of SYNCED) {
    for (const r of data.tables[t] || []) {
      const cur = mem[t].get(r.id);
      if (!cur || cur.updated_at <= r.updated_at) { mem[t].set(r.id, r); await putIDB(t, r); }
    }
  }
  emit('change', { table: '*' });
}
export async function wipeAll() {
  idb.close();
  await req(indexedDB.deleteDatabase(DB_NAME));
}
