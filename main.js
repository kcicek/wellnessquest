import { loadAllData } from './src/dataLoader';
import { Game } from './src/game';
import { updateStatsView, appendLog, snapshotStatsForNextTurn, updateDaysSurvived } from './src/ui';
import { DailyRunMinigame } from './src/minigame';
import { audioManager } from './src/audio';
(async function init() {
    appendLog('Loading data...');
    const data = await loadAllData();
    const game = new Game(data);
    window.game = game; // for console debugging
    snapshotStatsForNextTurn(game);
    updateStatsView(game);
    updateDaysSurvived(game);
    // Initialize minigame but DO NOT start the day yet (welcome screen will trigger)
    const mini = new DailyRunMinigame(game, 5000);
    window.minigame = mini;
    appendLog('Game initialized. Configure settings then start your first day.');
})();
// Overlay reliability helpers (module scope)
let __wq_overlayHealChecks = 0;
const __WQ_MAX_HEAL_CHECKS = 8;
let __wq_healTimer = null;
function __wq_scheduleOverlayHeal(buildFn, startedFlagFn) {
    if (__wq_healTimer != null)
        return;
    const loop = () => {
        if (window.__WQ_USER_START) {
            if (__wq_healTimer)
                clearTimeout(__wq_healTimer);
            __wq_healTimer = null;
            return;
        }
        const hasOverlay = !!document.getElementById('welcomeOverlay');
        if (!hasOverlay && !startedFlagFn()) {
            console.info('[WelcomeOverlay] heal loop reinject (overlay missing, not started)');
            buildFn();
        }
        __wq_overlayHealChecks++;
        if (__wq_overlayHealChecks < __WQ_MAX_HEAL_CHECKS)
            __wq_healTimer = window.setTimeout(loop, 700);
        else {
            console.info('[WelcomeOverlay] heal loop finished');
            __wq_healTimer = null;
        }
    };
    __wq_healTimer = window.setTimeout(loop, 700);
}
function __wq_attachOverlayGuardian(buildFn, startedFlagFn) {
    if (window.__WQ_OVERLAY_GUARD)
        return;
    try {
        const obs = new MutationObserver(() => {
            if (window.__WQ_USER_START)
                return;
            const hasOverlay = !!document.getElementById('welcomeOverlay');
            if (!hasOverlay && !startedFlagFn()) {
                console.info('[WelcomeOverlay] guardian reinject (overlay removed unexpectedly)');
                buildFn();
            }
        });
        obs.observe(document.body, { childList: true });
        window.__WQ_OVERLAY_GUARD = obs;
        console.info('[WelcomeOverlay] guardian attached');
    }
    catch (e) {
        console.info('[WelcomeOverlay] guardian attach failed', e);
    }
}
// PWA: register service worker
// Service Worker: only register in production to avoid dev HMR reconnect issues
if ('serviceWorker' in navigator) {
    if (import.meta.env && import.meta.env.PROD) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed', err));
            setTimeout(() => {
                const headerIcon = document.querySelector('header img');
                if (headerIcon instanceof HTMLImageElement) {
                    if (!headerIcon.complete || headerIcon.naturalWidth === 0) {
                        console.warn('Header icon not loaded, forcing reload of src');
                        const src = headerIcon.getAttribute('src');
                        if (src)
                            headerIcon.src = src + '?v=' + Date.now();
                    }
                }
            }, 600);
        });
    }
    else {
        // Dev mode: aggressively unregister any previously installed SW to prevent stale cache & HMR websocket interference
        navigator.serviceWorker.getRegistrations().then(regs => {
            if (regs.length)
                console.info('[DevSW] Unregistering stale service workers:', regs.length);
            regs.forEach(r => r.unregister());
        }).catch(() => { });
        if (caches && caches.keys) {
            caches.keys().then(keys => {
                keys.filter(k => /wellnessquest|vite|workbox/i.test(k)).forEach(k => caches.delete(k));
            }).catch(() => { });
        }
    }
}
// Welcome screen bootstrapping (injected dynamically if markup exists later)
document.addEventListener('DOMContentLoaded', () => {
    const START_FLAG = 'wq.started.v1';
    const LEGACY_FLAG = 'wq.started';
    const SESSION_FLAG = 'wq.intro.shown.session';
    const DIAG = (msg, meta) => console.info('[WelcomeOverlay]', msg, meta || '');
    let overlayAttempted = false;
    // Accessor used by guardian/heal helpers
    const startedFlagFn = () => !!localStorage.getItem(START_FLAG);
    // Migrate legacy flag if present
    try {
        if (!localStorage.getItem(START_FLAG) && localStorage.getItem(LEGACY_FLAG)) {
            localStorage.setItem(START_FLAG, '1');
            localStorage.removeItem(LEGACY_FLAG);
            DIAG('migrated legacy flag');
        }
    }
    catch { }
    const urlForce = new URL(location.href).searchParams.has('intro');
    const hasStarted = !!localStorage.getItem(START_FLAG);
    const sessionShown = !!sessionStorage.getItem(SESSION_FLAG);
    DIAG('init', { hasStarted, sessionShown, urlForce, allowFlag: window.__WQ_ALLOW_START });
    if (urlForce) {
        DIAG('forcing intro via ?intro');
        try {
            localStorage.removeItem(START_FLAG);
            localStorage.removeItem(LEGACY_FLAG);
        }
        catch { }
        sessionStorage.removeItem(SESSION_FLAG);
        buildWelcomeOverlay();
        overlayAttempted = true;
        sessionStorage.setItem(SESSION_FLAG, '1');
    }
    else if (!sessionShown) {
        // Show once per tab session
        buildWelcomeOverlay();
        overlayAttempted = true;
        sessionStorage.setItem(SESSION_FLAG, '1');
    }
    else if (!hasStarted) {
        // Player never started (flag absent) but session already marked -> rebuild
        DIAG('rebuilding overlay (not started yet this session)');
        buildWelcomeOverlay();
        overlayAttempted = true;
    }
    // Header reset intro
    const resetIntroBtn = document.getElementById('resetIntroBtn');
    if (resetIntroBtn) {
        resetIntroBtn.addEventListener('click', () => {
            DIAG('manual reset');
            try {
                localStorage.removeItem(START_FLAG);
                localStorage.removeItem(LEGACY_FLAG);
            }
            catch { }
            try {
                sessionStorage.removeItem(SESSION_FLAG);
            }
            catch { }
            window.__WQ_ALLOW_START = false;
            const existing = document.getElementById('welcomeOverlay');
            if (existing)
                existing.remove();
            buildWelcomeOverlay();
            overlayAttempted = true;
            sessionStorage.setItem(SESSION_FLAG, '1');
        });
    }
    // Restart button logic: full wipe and re-init
    const restartBtn = document.getElementById('restartGameBtn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            DIAG('hard restart invoked');
            try {
                localStorage.removeItem(START_FLAG);
                localStorage.removeItem(LEGACY_FLAG);
                sessionStorage.removeItem(SESSION_FLAG);
            }
            catch { }
            // Attempt to stop any running minigame loop
            try {
                window.minigame && (window.minigame.running = false);
            }
            catch { }
            // Clear penalty log display
            const logEl = document.getElementById('penaltyLog');
            if (logEl)
                logEl.innerHTML = '';
            // Remove stats & reset days badge
            const statsEl = document.getElementById('stats');
            if (statsEl)
                statsEl.innerHTML = '';
            const dayBadge = document.getElementById('daysSurvived');
            if (dayBadge) {
                const lbl = dayBadge.querySelector('.label');
                if (lbl)
                    lbl.textContent = 'Day 1';
                const prog = dayBadge.querySelector('.progress');
                if (prog)
                    prog.style.width = '0%';
            }
            // Recreate game + minigame fresh
            (async () => {
                try {
                    const data = await loadAllData();
                    const game = new Game(data);
                    window.game = game;
                    snapshotStatsForNextTurn(game);
                    updateStatsView(game);
                    updateDaysSurvived(game);
                    const mini = new DailyRunMinigame(game, 5000);
                    window.minigame = mini;
                    window.__WQ_ALLOW_START = false;
                    DIAG('restart new instances ready');
                    // Build intro overlay anew
                    const existing = document.getElementById('welcomeOverlay');
                    if (existing)
                        existing.remove();
                    overlayAttempted = false;
                    buildWelcomeOverlay();
                    overlayAttempted = true;
                    sessionStorage.setItem(SESSION_FLAG, '1');
                }
                catch (e) {
                    DIAG('restart failed', e);
                }
            })();
        });
    }
    function bindStart() {
        const startBtn = document.getElementById('welcomeStartBtn');
        if (!startBtn)
            return;
        startBtn.addEventListener('click', () => {
            const slider = document.getElementById('dayLenSlider');
            const hardshipSlider = document.getElementById('hardshipSlider');
            if (window.minigame && slider) {
                window.minigame.setDayDurationSeconds(Number(slider.value));
            }
            if (window.game && hardshipSlider) {
                window.game.setHardshipFactor(Number(hardshipSlider.value));
            }
            // Initialize audio context on first explicit user action
            audioManager.init();
            // Mark explicit user start to allow overlay removal inside startDay
            window.__WQ_USER_START = true;
            window.__WQ_ALLOW_START = true;
            try {
                window.minigame.startDay();
                DIAG('startDay invoked from button');
            }
            catch (e) {
                DIAG('startDay failed from button', e);
            }
            try {
                localStorage.setItem(START_FLAG, '1');
            }
            catch { }
            try {
                sessionStorage.setItem(SESSION_FLAG, '1');
            }
            catch { }
            const overlay = document.getElementById('welcomeOverlay');
            if (overlay)
                overlay.remove();
            try {
                window.__WQ_OVERLAY_GUARD?.disconnect?.();
                delete window.__WQ_OVERLAY_GUARD;
                DIAG('guardian disconnected (user start)');
            }
            catch { }
            if (__wq_healTimer) {
                clearTimeout(__wq_healTimer);
                __wq_healTimer = null;
            }
        });
    }
    const detailsToggle = document.getElementById('detailsToggle');
    if (detailsToggle) {
        detailsToggle.addEventListener('click', () => {
            const expanded = detailsToggle.getAttribute('aria-expanded') === 'true';
            detailsToggle.setAttribute('aria-expanded', (!expanded).toString());
            const panel = document.getElementById('detailsPanel');
            if (panel)
                panel.classList.toggle('hidden', expanded);
        });
    }
    const slider = document.getElementById('dayLenSlider');
    const sliderVal = document.getElementById('dayLenValue');
    if (slider && sliderVal) {
        const updateVal = () => sliderVal.textContent = slider.value + 's';
        slider.addEventListener('input', updateVal);
        updateVal();
    }
    const hardshipSlider = document.getElementById('hardshipSlider');
    const hardshipValue = document.getElementById('hardshipValue');
    const hardshipLabel = document.getElementById('hardshipLabel');
    if (hardshipSlider && hardshipValue && hardshipLabel) {
        const descFor = (v) => {
            if (v < 0.75)
                return 'Easy: slower decay & more income';
            if (v < 1.15)
                return 'Normal: standard decay & income';
            if (v < 1.5)
                return 'Challenging: faster decay';
            if (v < 1.9)
                return 'Hard: tough decay & reduced income';
            return 'Brutal: survival is rare';
        };
        const updateHardship = () => {
            const val = Number(hardshipSlider.value);
            hardshipValue.textContent = val.toFixed(1) + 'x';
            hardshipLabel.textContent = descFor(val);
        };
        hardshipSlider.addEventListener('input', updateHardship);
        updateHardship();
    }
    // Sound toggle logic
    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
        soundToggle.addEventListener('click', () => {
            // Lazy initialize if toggle pressed pre-start
            audioManager.init();
            const enabled = audioManager.toggle();
            soundToggle.textContent = enabled ? '🔊' : '🔇';
            soundToggle.setAttribute('aria-pressed', (!enabled).toString());
        });
    }
    // Gesture-based audio unlock
    window.addEventListener('pointerdown', oneTimeUnlock, { once: true, passive: true });
    window.addEventListener('keydown', oneTimeUnlock, { once: true });
    function oneTimeUnlock() {
        try {
            window.audioManager?.init();
        }
        catch { }
    }
    // (Removed duplicate inline overlay reliability helpers; using global versions declared above.)
    function buildWelcomeOverlay() {
        if (document.getElementById('welcomeOverlay'))
            return;
        DIAG('building overlay');
        const wrap = document.createElement('div');
        wrap.id = 'welcomeOverlay';
        wrap.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,#123050,#0d1e33);color:#fff;display:flex;align-items:center;justify-content:center;z-index:2000;padding:1rem;';
        wrap.innerHTML = `
      <div style="background:#152a43;width:min(560px,92%);max-height:92%;overflow:auto;border-radius:24px;padding:1.35rem 1.4rem 1.55rem;box-shadow:0 12px 42px -8px rgba(0,0,0,0.65);display:flex;flex-direction:column;gap:1rem;font-size:0.85rem;line-height:1.4;">
        <div style="display:flex;flex-direction:row;align-items:flex-start;gap:0.9rem;">
          <img src="icons/icon-192.png" alt="WellnessQuest Icon" width="72" height="72" style="border-radius:18px;flex:0 0 auto;box-shadow:0 4px 14px -4px rgba(0,0,0,0.55);background:#0f1826;object-fit:cover;" />
          <div style="display:flex;flex-direction:column;gap:0.65rem;">
            <h2 style="margin:0;font-size:1.35rem;letter-spacing:.5px;font-weight:700;">Welcome to WellnessQuest</h2>
            <p style="margin:0;font-size:0.78rem;opacity:0.9;">Balance nutrition, fitness, mood, and energy. Collect foods and maybe hit the gym each day. Avoid excess while preventing deficiencies.</p>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.5rem;background:#0f1f33;padding:0.75rem 0.85rem 0.9rem;border:1px solid #1e3d62;border-radius:16px;">
          <label for="dayLenSlider" style="font-size:0.72rem;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#b9d6ff;">Day Duration <span id="dayLenValue" style="color:#fff;font-weight:700;margin-left:4px;">5s</span></label>
          <input id="dayLenSlider" type="range" min="5" max="20" step="1" value="5" style="width:100%;accent-color:#4a8fff;" />
          <div style="display:flex;justify-content:space-between;font-size:0.55rem;letter-spacing:.5px;opacity:0.7;margin-top:-4px;"><span>Faster</span><span>Slower</span></div>
          <div style="margin-top:0.6rem;display:flex;flex-direction:column;gap:0.5rem;">
            <label for="hardshipSlider" style="font-size:0.72rem;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#b9d6ff;">Life Hardship <span id="hardshipValue" style="color:#fff;font-weight:700;margin-left:4px;">1.0x</span></label>
            <input id="hardshipSlider" type="range" min="0.5" max="2" step="0.1" value="1" style="width:100%;accent-color:#ff8d3a;" />
            <div style="display:flex;justify-content:space-between;font-size:0.5rem;letter-spacing:.5px;opacity:0.65;"><span>Easy</span><span>Normal</span><span>Brutal</span></div>
            <div id="hardshipLabel" style="font-size:0.55rem;letter-spacing:.5px;color:#ffd5b0;font-weight:600;text-align:center;">Normal: standard decay & income</div>
          </div>
        </div>
        <div>
          <button id="detailsToggle" aria-expanded="false" style="background:#23466d;color:#fff;border:1px solid #3a6a9d;padding:0.5rem 0.8rem;font-size:0.65rem;border-radius:10px;cursor:pointer;letter-spacing:.5px;font-weight:600;">Show Detailed Rules ▾</button>
        </div>
        <div id="detailsPanel" class="hidden" style="background:#0f1f33;border:1px solid #1d3a5d;padding:0.8rem 0.85rem 0.95rem;border-radius:16px;font-size:0.66rem;display:flex;flex-direction:column;gap:0.55rem;">
          <div style="font-weight:600;letter-spacing:.5px;text-transform:uppercase;font-size:0.55rem;color:#b6d4ff;">Health & Risk System</div>
          <ul style="margin:0 0 0 1.1rem;padding:0;display:flex;flex-direction:column;gap:0.25rem;">
            <li>Deficiencies (vitamins / minerals / protein) hurt health.</li>
            <li>Excess sugar/cholesterol/sodium penalize at 100+, worse at 110+.</li>
            <li>Low energy or mood stacks penalties.</li>
            <li>Good fitness + mood + energy gives a bonus.</li>
            <li>Streak of healthy meals adds a bonus.</li>
          </ul>
        </div>
        <button id="welcomeStartBtn" style="background:#4a8fff;color:#fff;border:none;padding:0.9rem 1.2rem;font-size:0.9rem;font-weight:600;border-radius:14px;cursor:pointer;letter-spacing:.5px;box-shadow:0 4px 12px -3px rgba(0,0,0,0.5);">Start Day 1 ▸</button>
        <div style="text-align:center;font-size:0.5rem;letter-spacing:.5px;opacity:0.5;">v0.1 prototype</div>
      </div>`;
        document.body.appendChild(wrap);
        __wq_attachOverlayGuardian(buildWelcomeOverlay, startedFlagFn);
        __wq_scheduleOverlayHeal(buildWelcomeOverlay, startedFlagFn);
        bindStart();
    }
    // Bind start if overlay already injected (cold load path)
    bindStart();
    // Fallback phases to ensure at least one overlay appears. Removed previous auto-start
    // behavior because it could start the game then immediately remove the overlay before
    // the user interacted, creating a flashing effect with no stable intro.
    setTimeout(() => {
        const running = window.minigame?.running;
        const hasOverlay = !!document.getElementById('welcomeOverlay');
        const started = !!localStorage.getItem(START_FLAG);
        const sessionSeen = !!sessionStorage.getItem(SESSION_FLAG);
        if (!running && !hasOverlay && !sessionSeen && !overlayAttempted) {
            DIAG('fallback phase1 inject (no overlay, not running)');
            buildWelcomeOverlay();
            overlayAttempted = true;
            sessionStorage.setItem(SESSION_FLAG, '1');
            return;
        }
        // Second check only attempts to (re)inject overlay; never auto-start
        if (!started && !hasOverlay && !running) {
            DIAG('scheduling second check (overlay still missing)');
            setTimeout(() => {
                const againOverlay = !!document.getElementById('welcomeOverlay');
                const againStarted = !!localStorage.getItem(START_FLAG);
                const runningNow = window.minigame?.running;
                if (!againOverlay && !againStarted && !runningNow) {
                    DIAG('second check force inject (still missing)');
                    buildWelcomeOverlay();
                }
            }, 900);
        }
    }, 800);
    // Manual dev helper for debugging
    window.forceIntro = () => {
        try {
            localStorage.removeItem(START_FLAG);
            sessionStorage.removeItem(SESSION_FLAG);
        }
        catch { }
        const existing = document.getElementById('welcomeOverlay');
        if (existing)
            existing.remove();
        overlayAttempted = false;
        buildWelcomeOverlay();
        overlayAttempted = true;
        DIAG('forceIntro invoked');
    };
});
//# sourceMappingURL=main.js.map