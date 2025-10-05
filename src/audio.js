// Simple audio manager using Web Audio API with synthesized tones / noise bursts
// No external assets – keeps bundle light.
class AudioManager {
    constructor() {
        Object.defineProperty(this, "ctx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "enabled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "started", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "masterGain", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "debug", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "playCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "lastError", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "keepAliveId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "reinitAttempts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "maxReinit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 3
        });
        Object.defineProperty(this, "fallbackAudioEl", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
    }
    init() {
        if (this.started && this.ctx) {
            if (this.ctx.state === 'suspended')
                this.ctx.resume().catch(() => { });
            return;
        }
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.6;
            this.masterGain.connect(this.ctx.destination);
            this.started = true;
            if (this.debug)
                console.log('[Audio] context started state=', this.ctx.state);
            // iOS unlock silent buffer
            const buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
            const src = this.ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(this.masterGain);
            src.start(0);
            // Start keep-alive loop to guard against browsers auto-suspending inactive contexts
            this.startKeepAlive();
            this.prepareFallbackElement();
        }
        catch (e) {
            console.warn('Audio init failed', e);
            this.enabled = false;
            this.lastError = e;
        }
    }
    setDebug(on) { this.debug = on; }
    setEnabled(on) {
        this.enabled = on;
        if (this.masterGain)
            this.masterGain.gain.value = on ? 0.6 : 0;
        if (on)
            this.confirm();
    }
    toggle() { this.setEnabled(!this.enabled); return this.enabled; }
    status() { return { started: this.started, enabled: this.enabled, ctxState: this.ctx?.state, sampleRate: this.ctx?.sampleRate, suspended: this.ctx?.state === 'suspended', playCount: this.playCount, lastError: this.lastError ? String(this.lastError) : null }; }
    logAttempt(label) { if (this.debug)
        console.log('[Audio] play attempt', label, this.status()); }
    autoInit() { if (!this.started) {
        if (this.debug)
            console.log('[Audio] autoInit attempt');
        this.init();
    } }
    ensureContext() {
        if (!this.ctx || this.ctx.state === 'closed') {
            if (this.reinitAttempts < this.maxReinit) {
                this.reinitAttempts++;
                if (this.debug)
                    console.warn('[Audio] context missing/closed – reinitializing attempt', this.reinitAttempts);
                this.started = false; // force init path
                this.init();
            }
            else if (this.debug) {
                console.error('[Audio] max reinit attempts reached');
            }
        }
    }
    prepareFallbackElement() {
        if (this.fallbackAudioEl)
            return;
        // 200ms 440Hz sine encoded as small wav (base64). Not critical fidelity.
        const wavBase64 = 'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAAA';
        try {
            this.fallbackAudioEl = new Audio(wavBase64);
            this.fallbackAudioEl.preload = 'auto';
        }
        catch { }
    }
    fallbackBeep(label) {
        if (!this.fallbackAudioEl)
            return;
        try {
            this.fallbackAudioEl.currentTime = 0;
            this.fallbackAudioEl.play().then(() => {
                if (this.debug)
                    console.log('[Audio] fallback beep played', label);
            }).catch(err => {
                if (this.debug)
                    console.warn('[Audio] fallback beep failed', err);
            });
        }
        catch (e) {
            if (this.debug)
                console.warn('[Audio] fallback beep exception', e);
        }
    }
    installLifecycleHandlers() {
        const resume = () => { try {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
                if (this.debug)
                    console.log('[Audio] visibility/focus resume');
            }
        }
        catch { } };
        document.addEventListener('visibilitychange', () => { if (!document.hidden)
            resume(); });
        window.addEventListener('focus', resume);
        window.addEventListener('pageshow', resume);
    }
    startKeepAlive() {
        if (this.keepAliveId != null)
            return;
        this.keepAliveId = window.setInterval(() => {
            if (!this.ctx)
                return;
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => { });
                if (this.debug)
                    console.log('[Audio] keepAlive resume attempted', this.status());
            }
        }, 4000);
    }
    playTone(opts) {
        this.autoInit();
        this.ensureContext();
        if (!this.enabled) {
            if (this.debug)
                console.warn('[Audio] skip play (disabled)', opts.__label);
            return;
        }
        if (!this.ctx || !this.masterGain) {
            if (this.debug)
                console.warn('[Audio] skip play (no ctx/masterGain)', opts.__label, this.status());
            return;
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
            if (this.debug)
                console.log('[Audio] resume before play', this.status());
        }
        this.logAttempt(opts.__label || 'tone');
        const { freq = 440, type = 'sine', duration = 0.25, volume = 0.6, attack = 0.005, release = 0.12, sweepTo } = opts;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            if (sweepTo && sweepTo !== freq) {
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), this.ctx.currentTime + duration);
            }
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + attack);
            gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration + release);
            osc.connect(gain).connect(this.masterGain);
            osc.start();
            osc.stop(this.ctx.currentTime + duration + release + 0.02);
            this.playCount++;
            if (this.debug)
                console.log('[Audio] play ok', opts.__label, 'count=', this.playCount);
            // If still early (first few plays) and user hasn't heard anything, fallback beep can layer (optional) – only when count < 2
            if (this.playCount < 2)
                this.fallbackBeep(opts.__label);
        }
        catch (err) {
            this.lastError = err;
            if (this.debug)
                console.error('[Audio] play error', opts.__label, err);
            this.fallbackBeep(opts.__label);
        }
    }
    // Semantic sound wrappers
    collectFood() { this.playTone({ freq: 540, type: 'triangle', duration: 0.18, sweepTo: 760, __label: 'collectFood' }); }
    collectFitness() { this.playTone({ freq: 380, type: 'sawtooth', duration: 0.22, sweepTo: 200, __label: 'collectFitness' }); }
    refresh() { this.playTone({ freq: 260, type: 'square', duration: 0.16, sweepTo: 520, __label: 'refresh' }); }
    dayStart() { this.playTone({ freq: 330, type: 'triangle', duration: 0.25, sweepTo: 660, __label: 'dayStart' }); }
    dayEndPositive() { this.playTone({ freq: 480, type: 'sine', duration: 0.22, sweepTo: 720, __label: 'dayEndPositive' }); }
    dayEndNegative() { this.playTone({ freq: 180, type: 'sine', duration: 0.35, sweepTo: 90, __label: 'dayEndNegative' }); }
    disease() { this.playTone({ freq: 120, type: 'square', duration: 0.4, sweepTo: 70, __label: 'disease' }); }
    death() { this.playTone({ freq: 70, type: 'sawtooth', duration: 0.7, sweepTo: 40, __label: 'death' }); }
    warning() { this.playTone({ freq: 260, type: 'square', duration: 0.18, __label: 'warning' }); }
    confirm() { this.playTone({ freq: 750, type: 'sine', duration: 0.08, sweepTo: 900, volume: 0.4, __label: 'confirm' }); }
    testPing() { this.playTone({ freq: 600, type: 'square', duration: 0.15, sweepTo: 500, volume: 0.5, __label: 'testPing' }); }
    // Alternate buffer-based test (rules out oscillator issues)
    __bufferTest() {
        this.autoInit();
        this.ensureContext();
        if (!this.ctx || !this.masterGain) {
            if (this.debug)
                console.warn('[Audio] bufferTest no ctx');
            return;
        }
        try {
            const sr = this.ctx.sampleRate;
            const len = Math.floor(sr * 0.25);
            const buffer = this.ctx.createBuffer(1, len, sr);
            const data = buffer.getChannelData(0);
            // Simple sine 660 Hz with fade in/out
            for (let i = 0; i < len; i++) {
                const t = i / sr;
                const env = Math.min(1, t / 0.01) * Math.min(1, (0.25 - t) / 0.05);
                data[i] = Math.sin(2 * Math.PI * 660 * t) * env * 0.5;
            }
            const src = this.ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(this.masterGain);
            src.start();
            this.playCount++;
            if (this.debug)
                console.log('[Audio] bufferTest ok count=', this.playCount);
        }
        catch (e) {
            this.lastError = e;
            if (this.debug)
                console.error('[Audio] bufferTest error', e);
            this.fallbackBeep('bufferTest');
        }
    }
}
export const audioManager = new AudioManager();
;
window.audioManager = audioManager; // expose for console debugging
//# sourceMappingURL=audio.js.map