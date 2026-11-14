// همگام‌سازی با Supabase: ارسال صف تغییرات + دریافت تغییرات دیگران (Realtime + نظرسنجی)
import * as db from './db.js';
import { debounce } from './utils.js';

export const SUPABASE_URL = 'https://tshukvlmonkenrlcyfrx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_FIOw9Vn06uhpFOB8peuVgw_Aeh0bmWa';

let client = null, cfg = null, channel = null, pollTimer = null, busy = false, again = false;
export const state = { status: 'off', lastSync: null, pending: 0, error: '', email: '' };

const notify = () => db.emit('sync', { ...state });

export function getClient() { return client; }
export function getConfig() { return cfg; }

export async function initSync() {
  cfg = await db.getMeta('sync', null);
  state.lastSync = cfg?.last_ok || null;
  if (window.supabase?.createClient) {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mv-auth' },
      realtime: { params: { eventsPerSecond: 5 } }
    });
  }
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => refreshStatus());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  db.on('dirty', debounce(() => syncNow(), 300));
  await refreshStatus();
  if (cfg?.store_id && client) {
    const { data } = await client.auth.getSession();
    if (data?.session) { state.email = data.session.user.email; start(); }
    else { state.status = 'signed-out'; notify(); }
  }
}

export async function refreshStatus() {
  state.pending = await db.outboxCount();
  if (!cfg?.store_id) state.status = 'off';
  else if (!navigator.onLine) state.status = 'offline';
  else if (state.status === 'offline' || state.status === 'off') state.status = 'online';
  notify();
}

// ---------- حساب کاربری ----------
export async function signUp(email, password) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw translate(error);
  return data;
}
export async function signIn(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw translate(error);
  state.email = data.user.email;
  return data;
}
export async function signOut() {
  stop();
  try { await client.auth.signOut(); } catch { }
  cfg = null; await db.setMeta('sync', null);
  state.status = 'off'; state.email = ''; notify();
}
export async function session() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session || null;
}
export async function myStores() {
  const { data, error } = await client.rpc('my_stores');
  if (error) throw translate(error);
  return data || [];
}
export async function createStore(name, displayName, userCode) {
  const { data, error } = await client.rpc('create_store', { p_name: name, p_display_name: displayName, p_user_code: userCode });
  if (error) throw translate(error);
  return connectStore(data);
}
export async function joinStore(code, displayName, userCode) {
  const { data, error } = await client.rpc('join_store', { p_code: code, p_display_name: displayName, p_user_code: userCode });
  if (error) throw translate(error);
  return connectStore(data);
}
export async function connectStore(store) {
  const s = Array.isArray(store) ? store[0] : store;
  cfg = { store_id: s.id, store_name: s.name, join_code: s.join_code, last_srv: null, last_ok: null };
  await db.setMeta('sync', cfg);
  await db.requeueAll();          // داده‌های فعلی این گوشی هم به فروشگاه ابری فرستاده شود
  start();
  return cfg;
}

function translate(e) {
  const m = (e?.message || String(e)).toLowerCase();
  if (m.includes('invalid login')) return new Error('ایمیل یا رمز اشتباه است.');
  if (m.includes('email not confirmed')) return new Error('ایمیل هنوز تأیید نشده؛ لینک تأیید را از صندوق ایمیل باز کنید.');
  if (m.includes('already registered')) return new Error('این ایمیل قبلاً ثبت شده؛ وارد شوید.');
  if (m.includes('password')) return new Error('رمز باید حداقل ۶ کاراکتر باشد.');
  if (m.includes('invalid code')) return new Error('کد فروشگاه اشتباه است.');
  if (m.includes('failed to fetch') || m.includes('network')) return new Error('اتصال به سرور برقرار نشد. اینترنت یا فیلترشکن را بررسی کنید.');
  return new Error(e?.message || 'خطای ناشناخته');
}

// ---------- چرخه‌ی همگام‌سازی ----------
function start() {
  stop();
  subscribe();
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 20000);
  syncNow();
}
function stop() {
  clearInterval(pollTimer); pollTimer = null;
  if (channel) { try { client.removeChannel(channel); } catch { } channel = null; }
}
function subscribe() {
  if (!client || !cfg?.store_id) return;
  channel = client.channel('mv-' + cfg.store_id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `store_id=eq.${cfg.store_id}` }, debounce(() => syncNow(), 250))
    .subscribe();
}

export async function syncNow() {
  if (!client || !cfg?.store_id) { await refreshStatus(); return; }
  if (!navigator.onLine) { await refreshStatus(); return; }
  if (busy) { again = true; return; }
  busy = true; state.status = 'syncing'; notify();
  try {
    const s = await session();
    if (!s) { state.status = 'signed-out'; notify(); return; }
    await push();
    await pull();
    cfg.last_ok = new Date().toISOString();
    state.lastSync = cfg.last_ok;
    await db.setMeta('sync', cfg);
    state.status = 'online'; state.error = '';
  } catch (e) {
    state.status = navigator.onLine ? 'error' : 'offline';
    state.error = translate(e).message;
  } finally {
    busy = false;
    state.pending = await db.outboxCount();
    notify();
    if (again) { again = false; setTimeout(syncNow, 50); }
  }
}

async function push() {
  let entries = await db.outboxAll();
  while (entries.length) {
    const batch = entries.slice(0, 300);
    entries = entries.slice(300);
    const rows = [];
    for (const e of batch) {
      const rec = db.getRaw(e.table, e.rid);
      if (!rec) continue;
      rows.push({
        id: e.table === 'settings' ? cfg.store_id : rec.id,
        store_id: cfg.store_id, tbl: e.table, data: rec,
        deleted: !!rec.deleted, updated_at: rec.updated_at
      });
    }
    if (rows.length) {
      const { error } = await client.from('records').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }
    await db.outboxDone(batch);
  }
}

async function pull() {
  let since = cfg.last_srv ? new Date(new Date(cfg.last_srv).getTime() - 30000).toISOString() : '1970-01-01T00:00:00Z';
  let changed = false, maxSrv = cfg.last_srv;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await client.from('records')
      .select('tbl,data,deleted,updated_at,srv_at')
      .eq('store_id', cfg.store_id).gte('srv_at', since)
      .order('srv_at', { ascending: true }).limit(1000);
    if (error) throw error;
    for (const r of data) {
      if (!db.SYNCED.includes(r.tbl)) continue;
      const rec = { ...r.data, deleted: r.deleted, updated_at: r.data.updated_at || r.updated_at };
      if (await db.applyRemote(r.tbl, rec)) changed = true;
      if (!maxSrv || r.srv_at > maxSrv) maxSrv = r.srv_at;
    }
    if (data.length < 1000) break;
    since = data[data.length - 1].srv_at;
  }
  cfg.last_srv = maxSrv;
  if (changed) db.emit('change', { table: '*', remote: true });
}
