// بارکدخوان دوربین: BarcodeDetector بومی (اندروید/کروم) + ZXing برای آیفون/سافاری و بقیه
// - تأیید دوباره برای جلوگیری از خوانش اشتباه بارکدهای خطی در ZXing
// - کنترل چک‌سام EAN/UPC
// - حالت پشت‌سرهم، چراغ قوه، زوم، تعویض دوربین، ورود دستی

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code'];

export function validEAN(code) {
  if (!/^\d+$/.test(code)) return true; // غیرعددی (Code128 و ...) را فیلتر نمی‌کنیم
  if (![8, 12, 13].includes(code.length)) return true;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  // وزن‌دهی از راست: ۳،۱،۳،۱...
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 1350;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.13);
  } catch { }
  try { navigator.vibrate && navigator.vibrate(60); } catch { }
}

const ICON = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  torch: '<path d="M8 2h8l-1 6H9z"/><path d="M9 8h6v4l-2 10h-2L9 12z"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  zoom: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M11 8v6M8 11h6"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'
};
const svg = (p, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

export class Scanner {
  constructor() {
    this.el = null; this.stream = null; this.track = null; this.running = false;
    this.detector = null; this.zx = null; this.canvas = null; this.ctx = null;
    this.pending = null; this.lastAccepted = { code: '', at: 0 }; this.frame = 0;
    this.devices = []; this.deviceIdx = 0; this.zoomOn = false;
  }

  /**
   * opts: { title, continuous, onCode(code, format) -> string|void (پیام بازخورد), onClose }
   */
  async open(opts) {
    this.opts = { continuous: false, title: 'اسکن بارکد', ...opts };
    this.buildUI();
    if (!window.isSecureContext) return this.fail('دوربین فقط روی آدرس امن (https) کار می‌کند. اپ را از آدرس https باز کنید یا بارکد را دستی وارد کنید.');
    if (!navigator.mediaDevices?.getUserMedia) return this.fail('این مرورگر به دوربین دسترسی نمی‌دهد. بارکد را دستی وارد کنید.');
    await this.initEngine();
    await this.startCamera();
  }

  buildUI() {
    this.close(true);
    const el = document.createElement('div');
    el.className = 'scanner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', this.opts.title);
    el.innerHTML = `
      <video class="scanner-video" playsinline muted autoplay></video>
      <div class="scanner-shade"></div>
      <div class="scanner-top">
        <button class="sc-btn" data-sc="close" aria-label="بستن">${svg(ICON.x)}</button>
        <div class="sc-title">${this.opts.title}${this.opts.continuous ? '<small>اسکن پشت‌سرهم</small>' : ''}</div>
        <button class="sc-btn" data-sc="switch" aria-label="تعویض دوربین">${svg(ICON.swap)}</button>
      </div>
      <div class="scanner-frame"><span class="sc-line"></span></div>
      <div class="sc-status" aria-live="polite">در حال روشن کردن دوربین…</div>
      <div class="scanner-bottom">
        <div class="sc-tools">
          <button class="sc-btn" data-sc="torch" aria-label="چراغ قوه" hidden>${svg(ICON.torch)}</button>
          <button class="sc-btn" data-sc="zoom" aria-label="زوم" hidden>${svg(ICON.zoom)}</button>
        </div>
        <form class="sc-manual">
          <input inputmode="numeric" autocomplete="off" dir="ltr" placeholder="ورود دستی بارکد" aria-label="ورود دستی بارکد">
          <button type="submit">ثبت</button>
        </form>
        <div class="sc-feed" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.video = el.querySelector('video');
    this.status = el.querySelector('.sc-status');
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-sc]');
      if (!b) return;
      const a = b.dataset.sc;
      if (a === 'close') this.close();
      if (a === 'torch') this.toggleTorch(b);
      if (a === 'zoom') this.toggleZoom(b);
      if (a === 'switch') this.switchCamera();
    });
    el.querySelector('.sc-manual').addEventListener('submit', e => {
      e.preventDefault();
      const inp = e.target.querySelector('input');
      const v = inp.value.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
      if (!v) return;
      inp.value = '';
      this.accept(v, 'manual', true);
    });
    this.keyHandler = e => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.keyHandler);
  }

  async initEngine() {
    this.detector = null;
    try {
      if ('BarcodeDetector' in window) {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const f = NATIVE_FORMATS.filter(x => supported.includes(x));
        if (f.includes('ean_13')) this.detector = new window.BarcodeDetector({ formats: f });
      }
    } catch { this.detector = null; }
    if (!this.detector) {
      const Z = window.ZXing;
      if (!Z) return;
      const hints = new Map();
      const F = Z.BarcodeFormat;
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR, F.QR_CODE]);
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      this.zx = new Z.MultiFormatReader();
      this.zx.setHints(hints);
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
  }

  async pickDevices() {
    try {
      const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      const back = list.filter(d => /back|rear|environment|پشت/i.test(d.label));
      // در اندروید «camera2 0» معمولاً دوربین اصلی (نه واید) است
      back.sort((a, b) => (/\b0\b/.test(a.label) ? -1 : 0) - (/\b0\b/.test(b.label) ? -1 : 0));
      this.devices = back.length ? [...back, ...list.filter(d => !back.includes(d))] : list;
    } catch { this.devices = []; }
  }

  async startCamera(deviceId) {
    this.stopStream();
    const base = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    const saved = deviceId || localStorage.getItem('mv-cam');
    const tries = [];
    if (saved) tries.push({ video: { ...base, deviceId: { exact: saved } }, audio: false });
    tries.push({ video: { ...base, facingMode: { ideal: 'environment' } }, audio: false });
    tries.push({ video: true, audio: false });
    let err;
    for (const c of tries) {
      try { this.stream = await navigator.mediaDevices.getUserMedia(c); break; }
      catch (e) { err = e; if (e.name === 'NotAllowedError' || e.name === 'SecurityError') break; }
    }
    if (!this.stream) {
      const n = err?.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') return this.fail('اجازه‌ی دوربین داده نشد. از تنظیمات مرورگر، دسترسی دوربین را برای این سایت روشن کنید و دوباره امتحان کنید.');
      if (n === 'NotFoundError' || n === 'OverconstrainedError') return this.fail('دوربینی پیدا نشد. بارکد را دستی وارد کنید.');
      if (n === 'NotReadableError') return this.fail('دوربین در اختیار برنامه‌ی دیگری است. آن را ببندید و دوباره امتحان کنید.');
      return this.fail('روشن کردن دوربین ممکن نشد. بارکد را دستی وارد کنید.');
    }
    if (!this.el) { this.stopStream(); return; }
    this.track = this.stream.getVideoTracks()[0];
    if (!this.devices.length) await this.pickDevices();
    const curId = this.track.getSettings?.().deviceId;
    // اگر دوربین پیش‌فرض واید بود، یک‌بار دوربین اصلی پشت را امتحان کن
    if (!saved && !deviceId && this.devices[0] && curId && this.devices[0].deviceId !== curId && /back|rear|environment/i.test(this.devices[0].label)) {
      return this.startCamera(this.devices[0].deviceId);
    }
    this.deviceIdx = Math.max(0, this.devices.findIndex(d => d.deviceId === curId));
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch { }
    await this.tuneTrack();
    this.status.textContent = 'بارکد را داخل کادر بگیرید';
    this.running = true;
    this.loop();
  }

  async tuneTrack() {
    const t = this.track;
    const caps = t.getCapabilities ? t.getCapabilities() : {};
    try { if (caps.focusMode?.includes('continuous')) await t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { }
    this.el.querySelector('[data-sc=torch]').hidden = !caps.torch;
    this.el.querySelector('[data-sc=zoom]').hidden = !(caps.zoom && caps.zoom.max >= 1.5);
    this.el.querySelector('[data-sc=switch]').hidden = this.devices.length < 2;
    this.caps = caps;
  }

  async toggleTorch(b) {
    this.torchOn = !this.torchOn;
    try { await this.track.applyConstraints({ advanced: [{ torch: this.torchOn }] }); b.classList.toggle('on', this.torchOn); } catch { }
  }
  async toggleZoom(b) {
    this.zoomOn = !this.zoomOn;
    const z = this.zoomOn ? Math.min(2, this.caps.zoom.max) : Math.max(1, this.caps.zoom.min);
    try { await this.track.applyConstraints({ advanced: [{ zoom: z }] }); b.classList.toggle('on', this.zoomOn); } catch { }
  }
  async switchCamera() {
    if (this.devices.length < 2) return;
    this.deviceIdx = (this.deviceIdx + 1) % this.devices.length;
    const id = this.devices[this.deviceIdx].deviceId;
    localStorage.setItem('mv-cam', id);
    this.running = false;
    await this.startCamera(id);
  }

  loop() {
    if (!this.running) return;
    const tick = async () => {
      if (!this.running) return;
      try { await this.scanFrame(); } catch { }
      if (this.running) this.timer = setTimeout(() => requestAnimationFrame(tick), this.detector ? 60 : 90);
    };
    requestAnimationFrame(tick);
  }

  async scanFrame() {
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    if (this.detector) {
      const codes = await this.detector.detect(v);
      if (codes && codes.length) {
        const c = codes[0];
        this.consider(c.rawValue, c.format, false);
      }
      return;
    }
    if (!this.zx) return;
    const Z = window.ZXing;
    const vw = v.videoWidth, vh = v.videoHeight;
    // سه برش متناوب: نوار وسط، کادر وسط، کل تصویر
    const mode = this.frame++ % 3;
    let sx, sy, sw, sh;
    if (mode === 0) { sw = vw * 0.9; sh = vh * 0.4; }
    else if (mode === 1) { sw = vw * 0.7; sh = vh * 0.7; }
    else { sw = vw; sh = vh; }
    sx = (vw - sw) / 2; sy = (vh - sh) / 2;
    const scale = Math.min(1, 960 / sw);
    const cw = Math.round(sw * scale), ch = Math.round(sh * scale);
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
    this.ctx.drawImage(v, sx, sy, sw, sh, 0, 0, cw, ch);
    try {
      const lum = new Z.HTMLCanvasElementLuminanceSource(this.canvas);
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(lum));
      const res = this.zx.decodeWithState(bmp);
      const fmt = Z.BarcodeFormat[res.getBarcodeFormat()] || '';
      this.consider(res.getText(), String(fmt).toLowerCase(), true);
    } catch { /* NotFound */ }
    finally { try { this.zx.reset(); } catch { } }
  }

  /** zxing: خوانش خطی باید دو بار پشت‌سرهم یکسان باشد */
  consider(code, format, needConfirm) {
    code = String(code || '').trim();
    if (!code) return;
    // همان بارکد تا وقتی جلوی دوربین است دوباره ثبت نشود؛ باید حداقل ۱٫۲ ثانیه از کادر خارج شود
    const t0 = Date.now();
    if (code === this.lastAccepted.code) {
      const gap = t0 - (this.lastSeen || 0);
      this.lastSeen = t0;
      if (gap >= 1200) this.rearmed = true;
      if (!this.rearmed) return;
    }
    if (!validEAN(code) && /ean|upc/.test(format)) return;
    const now = Date.now();
    const isQR = /qr/.test(format);
    if (needConfirm && !isQR) {
      if (!this.pending || this.pending.code !== code || now - this.pending.at > 1200) { this.pending = { code, at: now }; return; }
    }
    this.pending = null;
    this.accept(code, format, false);
  }

  accept(code, format, manual) {
    const now = Date.now();
    this.lastAccepted = { code, at: now };
    this.lastSeen = now;
    this.rearmed = false;
    beep();
    this.el?.classList.add('hit');
    setTimeout(() => this.el?.classList.remove('hit'), 350);
    let msg;
    try { msg = this.opts.onCode?.(code, format); } catch (e) { console.error(e); }
    if (this.opts.continuous) {
      const feed = this.el?.querySelector('.sc-feed');
      if (feed) {
        const item = document.createElement('div');
        item.className = 'sc-feed-item';
        item.textContent = msg || code;
        feed.prepend(item);
        while (feed.children.length > 3) feed.lastChild.remove();
      }
    } else {
      this.close();
    }
  }

  fail(msg) {
    if (this.status) { this.status.textContent = msg; this.status.classList.add('err'); }
    this.el?.querySelector('.sc-manual input')?.focus();
  }

  stopStream() {
    this.running = false;
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.track = null;
  }

  close(silent = false) {
    this.stopStream();
    if (this.el) { this.el.remove(); this.el = null; }
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
    if (!silent) this.opts?.onClose?.();
  }
}

export const scanner = new Scanner();
