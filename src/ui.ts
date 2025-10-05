import { Game } from './game';

// --- Stat Icons & Ordering ---
const STAT_ICONS: Record<string, string> = {
  health: '❤️', money: '💰', energy: '⚡', fitness: '💪', mood: '😊',
  minerals: '🪨', sugar: '🍬', sodium: '🧂', vitamins: '💊', protein: '🥚', cholesterol: '🫀'
};
const ROW1 = ['health','money','energy','fitness','mood'];
const ROW2 = ['minerals','sugar','sodium','vitamins','protein','cholesterol'];

let previousStats: Record<string, number> | null = null;

// Threshold configuration:
// We treat values below MIN_WARN_PCT of their max (where applicable) or below global min as danger/warning.
// Likewise values above HIGH_WARN_PCT of their max for stats that have an upper concern (sugar, cholesterol, sodium) trigger warnings, and above HIGH_DANGER_ABS trigger danger.
// Health-specific: danger if < 30, warning if < 50.
// Money: warning if < 15, danger if < 5 (liquidity risk for affording food/fitness).
// These heuristics can be tuned without touching render logic.
const LOW_DANGER_PCT = 0.15; // 15% of max
const LOW_WARNING_PCT = 0.30; // 30% of max
const HIGH_WARNING_ABS = 105; // near cap but not quite over-limit (since clamp max 120)
const HIGH_DANGER_ABS = 115; // critical high (approaching hard clamp 120)
const MONEY_WARNING = 15;
const MONEY_DANGER = 5;
const HEALTH_WARNING = 50;
const HEALTH_DANGER = 30;

interface StatHighlightState { cls: '' | 'warning' | 'danger'; }

function classifyStat(name: string, value: number, game: Game): StatHighlightState {
  const limits = game.data.gameRules.rules.statLimits;
  // Determine max per stat
  const maxMap: Record<string, number> = {
    energy: limits.energyMax,
    fitness: limits.fitnessMax,
    mood: limits.moodMax,
    health: limits.healthMax
  };
  const max = maxMap[name] ?? limits.max;
  const min = limits.min;

  // Health custom
  if (name === 'health') {
    if (value <= HEALTH_DANGER) return { cls: 'danger' };
    if (value <= HEALTH_WARNING) return { cls: 'warning' };
    return { cls: '' };
  }
  // Money custom (not clamped by max but we only care about low end)
  if (name === 'money') {
    if (value <= MONEY_DANGER) return { cls: 'danger' };
    if (value <= MONEY_WARNING) return { cls: 'warning' };
    return { cls: '' };
  }
  // For nutrients where high is bad: sugar, cholesterol, sodium
  if (['sugar','cholesterol','sodium'].includes(name)) {
    if (value >= HIGH_DANGER_ABS) return { cls: 'danger' };
    if (value >= HIGH_WARNING_ABS) return { cls: 'warning' };
    // Also low-end depletion can matter (treat like generic low logic)
  }

  // Generic low thresholds using percentage of max
  const pct = value / max;
  if (value <= min + (max * LOW_DANGER_PCT)) return { cls: 'danger' };
  if (pct <= LOW_WARNING_PCT) return { cls: 'warning' };
  return { cls: '' };
}

export function qs<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el as T;
}

export function appendLog(msg: string) {
  // Log element removed; fallback to console for debugging.
  if (typeof console !== 'undefined') console.log('[Game]', msg);
}

function statDelta(key: string, current: number): string {
  if (!previousStats) return '';
  const prev = previousStats[key];
  if (prev === undefined) return '';
  const diff = current - prev;
  if (diff === 0) return '';
  const sign = diff > 0 ? '▲' : '▼';
  const cls = diff > 0 ? 'up' : 'down';
  return `<span class="delta ${cls}" aria-hidden="true">${sign}${Math.abs(Math.round(diff))}</span>`;
}

export function renderStats(game: Game) {
  const container = qs('#stats');
  container.innerHTML = '';
  const makeBar = (keys: string[], nutrient = false, inline = false) => {
    const bar = document.createElement('div');
    bar.className = 'stats-bar' + (nutrient ? ' nutrient-bar' : '');
    keys.forEach(k => {
      const rawVal = (game.state as any)[k];
      const val = Math.round(rawVal);
      const highlight = classifyStat(k, val, game);
      const seg = document.createElement('span');
      seg.className = 'stat-seg' + (highlight.cls ? ' ' + highlight.cls : '') + ((nutrient || inline) ? ' nutrient' : '');
      seg.setAttribute('data-stat', k);
      seg.title = k.charAt(0).toUpperCase() + k.slice(1);
      if (nutrient || inline) {
        seg.innerHTML = `<span class="i" aria-label="${k}">${STAT_ICONS[k] || k} <span class="v inline">${val}</span></span>${statDelta(k, val)}`;
      } else {
        seg.innerHTML = `<span class="i" aria-label="${k}">${STAT_ICONS[k] || k}</span><span class="v">${val}</span>${statDelta(k, val)}`;
      }
      bar.appendChild(seg);
    });
    return bar;
  };
  // First row: non-food stats (core condition & resources)
  container.appendChild(makeBar(ROW1, false, true));
  // Second row: food-related nutrient & risk stats
  container.appendChild(makeBar(ROW2, true));
  attachStatBubbleTooltips(container);
}

export function snapshotStatsForNextTurn(game: Game) {
  previousStats = {};
  [...ROW1, ...ROW2].forEach(k => previousStats![k] = (game.state as any)[k]);
}

// Provide a convenience to update snapshot + render.
export function updateStatsView(game: Game) {
  renderStats(game);
  // Do not refresh snapshot here; caller sets snapshot before advancing day.
}

export function updateDaysSurvived(game: Game) {
  try {
    const el = document.getElementById('daysSurvived');
    if (el) {
      const label = el.querySelector('.label');
      if (label) label.textContent = `Day ${game.state.day}`;
    }
  } catch {}
}

export function getPreviousStat(stat: string): number | null {
  if (!previousStats) return null;
  return previousStats[stat] ?? null;
}

export function updatePenaltyLog(game: Game) {
  const container = document.getElementById('penaltyLog');
  if (!container) return;
  const raw = game.getLog().split(/\n+/).filter(l => l.trim().length);

  // We will group all Eating lines within each Day block into a single summarized line.
  // The original lines are replaced by: "Eating: <emoji list>" where emoji are extracted from the food names when possible.
  const dayHeaderRe = /^---\s*Day\s+\d+\s*---$/i;
  const eatingRe = /^Eating:\s*(.+)$/i;
  const fitnessRe = /^Fitness:\s*(.+)$/i; // left intact (still grouped consecutively later if needed).
  const emojiRe = /([\p{Emoji_Presentation}\p{Extended_Pictographic}])/u; // heuristic single emoji capture

  interface DayBlock { header: string; lines: string[]; eatItems: string[]; }
  const rebuilt: string[] = [];
  let current: DayBlock | null = null;

  const pushCurrent = () => {
    if (!current) return;
    // Insert summarized Eating line (if any collected) before other non-eating lines that followed.
    const other = current.lines.filter(l => !/^Eating:/i.test(l));
    if (current.eatItems.length) {
      // Extract emoji or fallback to name; de-duplicate sequence preserving order
      const seen = new Set<string>();
      const display = current.eatItems.map(name => {
        const m = name.match(emojiRe);
        const token = m ? m[1] : name; // fallback full name
        if (seen.has(token)) return null; seen.add(token); return token; }).filter(Boolean) as string[];
      rebuilt.push(`Eating: ${display.join(', ')}`);
    }
    // Append remaining lines (except original Eating lines which were summarized)
    rebuilt.push(...other);
    current = null;
  };

  for (const line of raw) {
    if (dayHeaderRe.test(line)) {
      // Flush previous block
      pushCurrent();
      // Start new block & emit its header
      rebuilt.push(line.replace(/^---\s*/,'').trim()); // keep style similar to earlier stripping
      current = { header: line, lines: [], eatItems: [] };
      continue;
    }
    const eat = line.match(eatingRe);
    if (eat && current) {
      current.eatItems.push(eat[1].trim());
      // Do not store original Eating line in lines (we summarize)
      continue;
    }
    // Any other line
    if (current) current.lines.push(line); else rebuilt.push(line);
  }
  pushCurrent();

  // Keep only latest ~40 logical lines after rebuild
  const limited = rebuilt.slice(-40);
  const classify = (line: string) => {
    if (/Health adjusted by -/.test(line) || /Disease triggered/i.test(line) || /Unable to work/i.test(line)) return 'penalty';
    if (/Health adjusted by \+/.test(line) || /bonus applied/i.test(line)) return 'bonus';
    if (/Day \d+/.test(line)) return 'day';
    return 'neutral';
  };
  container.innerHTML = limited.map(l => `<div class="line ${classify(l)}">${l.replace(/^---\s*/,'')}</div>`).join('');
  container.scrollTop = container.scrollHeight;
}

// --- Touch / click tooltip bubble (for mobile) ---
let activeBubble: HTMLElement | null = null;
function attachStatBubbleTooltips(container: HTMLElement) {
  const stats = container.querySelectorAll('.stat-seg');
  stats.forEach(stat => {
    stat.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = (stat.getAttribute('data-stat') || '').trim();
      showBubble(stat as HTMLElement, name.charAt(0).toUpperCase() + name.slice(1));
    }, { passive: true });
    stat.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      const name = (stat.getAttribute('data-stat') || '').trim();
      showBubble(stat as HTMLElement, name.charAt(0).toUpperCase() + name.slice(1));
    }, { passive: true });
  });
  document.addEventListener('click', dismissBubble, { once: true });
  document.addEventListener('touchstart', dismissBubble, { once: true });
}

function showBubble(anchor: HTMLElement, text: string) {
  dismissBubble();
  const bubble = document.createElement('div');
  bubble.className = 'stat-tooltip-bubble';
  bubble.textContent = text;
  document.body.appendChild(bubble);
  const rect = anchor.getBoundingClientRect();
  const bw = bubble.offsetWidth; const bh = bubble.offsetHeight;
  bubble.style.left = `${rect.left + rect.width / 2 - bw / 2}px`;
  bubble.style.top = `${rect.top - bh - 8}px`;
  activeBubble = bubble;
}

function dismissBubble() {
  if (activeBubble && activeBubble.parentNode) activeBubble.parentNode.removeChild(activeBubble);
  activeBubble = null;
}

