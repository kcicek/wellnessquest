import { Game } from './game';
import { Food, FitnessAction } from './types';
import { qs, appendLog, updateStatsView, snapshotStatsForNextTurn, updateDaysSurvived, updatePenaltyLog, getPreviousStat } from './ui';
import { audioManager } from './audio';

interface GridItem {
  type: 'food' | 'fitness' | 'empty';
  food?: Food;
  fitness?: FitnessAction;
  emoji: string;
}
const GRID_ROWS = 3;
const GRID_COLS = 4; // number of selectable columns
// Default day duration (ms) will be configurable via welcome screen


export class DailyRunMinigame {
  private game: Game;
  private grid: GridItem[][] = [];
  private playerCol = 0;
  private timer: number | null = null;
  private remaining = 0; // initialized on startDay using current dayDurationMs
  private foodsCollected: Food[] = [];
  private fitnessChosen: FitnessAction | null = null;
  private running = false;
  private lastTick = 0;
  private dayCounter = 0; // local counter to label rows
  private paused = false;
  // Allow one bottom-row option refresh per day via arrow cell
  private bottomRefreshed = false;
  private dayDurationMs: number; // configurable length of a day selection window

  constructor(game: Game, dayDurationMs: number = 5000) {
    this.game = game;
    this.dayDurationMs = dayDurationMs;
    this.initEmptyGrid();
    this.randomizeTopRows(GRID_ROWS); // initial fill
    this.playerCol = Math.floor(GRID_COLS / 2);
    this.render();
    this.bindControls();
    // Note: day will start only when startDay() is explicitly invoked (welcome screen flow)
  }

  /**
   * Update the day duration (in seconds) for subsequent days. If a day is currently
   * running, the change will take effect on the next day start.
   */
  setDayDurationSeconds(seconds: number) {
    const ms = Math.round(seconds * 1000);
    if (ms < 1000) return; // ignore unrealistic
    this.dayDurationMs = ms;
  }

  private initEmptyGrid() {
    this.grid = Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => ({ type: 'empty', emoji: '' } as GridItem)));
  }

  // Helper to shuffle array
  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // Remove 'overeat' from fitness actions
  private getFitnessActions(): FitnessAction[] {
    // Only offer the "Go to Gym" action. Absence of collecting it = skipped exercise.
    return this.game.data.fitnessActions.filter(f => /go to gym/i.test(f.action));
  }

  // Generate a row sized to GRID_COLS (3 foods + optional fitness or 4 foods)
  private generateRow(): GridItem[] {
    const foods = this.shuffle([...this.game.data.foods]);
    const gym = this.getFitnessActions()[0];
    const includeGym = Math.random() < 0.55 && !!gym; // slightly lower chance with fewer columns
    let baseFoods = foods.slice(0, includeGym ? 3 : 4);
    const items: GridItem[] = baseFoods.map(food => ({ type: 'food' as const, food, emoji: this.extractEmoji(food.name) }));
    if (includeGym && gym) items.push({ type: 'fitness', fitness: gym, emoji: gym.action.split(' ').slice(-1)[0] });
    return this.shuffle(items).slice(0, GRID_COLS);
  }

  private extractEmoji(name: string): string {
    const parts = name.trim().split(/\s+/);
    const last = parts[parts.length - 1];
    if (/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/u.test(last)) return last; return '❔';
  }

  private randomizeTopRows(count: number) {
    for (let i = 0; i < count; i++) {
      this.grid[i] = this.generateRow();
    }
  }

  private shiftDownAndAddRow() {
    for (let r = GRID_ROWS - 1; r > 0; r--) {
      this.grid[r] = this.grid[r - 1];
    }
    // new row at top
    this.grid[0] = this.generateRow();
  }

  startDay() {
    if (this.running) return;
      // Allow either explicit allow flag OR persisted start flag as recovery path
      if (!(window as any).__WQ_ALLOW_START && !localStorage.getItem('wq.started.v1')) {
        console.info('[DailyRunMinigame] startDay blocked (no allow flag & no persisted start flag)');
        return;
      }
    this.running = true;
    try { if (!localStorage.getItem('wq.started.v1')) { localStorage.setItem('wq.started.v1','1'); console.log('[WelcomeOverlay] Flag set from startDay'); } } catch {}
    const overlay = document.getElementById('welcomeOverlay');
    // Only remove intro overlay if the user explicitly pressed Start (prevents unintended flashing removal)
    if (overlay) {
      if ((window as any).__WQ_USER_START) {
        overlay.remove();
        console.log('[WelcomeOverlay] Removed from startDay (explicit user start)');
      } else {
        console.log('[WelcomeOverlay] Overlay present but preserved (no explicit user start flag)');
      }
    }
    this.dayCounter++; // increment at each new day start
    this.foodsCollected = [];
    this.fitnessChosen = null;
    this.remaining = this.dayDurationMs;
    this.lastTick = performance.now();
    this.bottomRefreshed = false; // reset daily arrow usage
    // Re-render so the arrow visually resets to ▶ before ticking resumes
    this.render();
    // Reset day progress bar
    const badge = document.getElementById('daysSurvived');
    if (badge) {
      const prog = badge.querySelector('.progress') as HTMLElement | null;
      if (prog) prog.style.width = '0%';
    }
    // Snapshot stats at the start of the day (baseline for delta arrows)
    snapshotStatsForNextTurn(this.game);
    audioManager.dayStart();
    this.tick();
  }

  private tick() {
    if (!this.running) return;
    if (this.game.state.isDead) { this.running = false; return; }
    if (this.paused) { requestAnimationFrame(() => this.tick()); return; }
    const now = performance.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    this.remaining -= dt;
    // Update progress bar width (invert remaining to elapsed)
    const badge = document.getElementById('daysSurvived');
    if (badge) {
      const prog = badge.querySelector('.progress') as HTMLElement | null;
      if (prog) {
        const elapsed = this.dayDurationMs - this.remaining;
        const frac = Math.min(1, Math.max(0, elapsed / this.dayDurationMs));
        prog.style.width = (frac * 100).toFixed(2) + '%';
      }
    }
    if (this.remaining <= 0) {
      this.endDay();
      return;
    }
  // Removed auto-loop restart to prevent skipping intro
    requestAnimationFrame(() => this.tick());
  }

  // Removed countdown display function

  private endDay() {
    this.running = false;
    // Apply collected items to game then process day
    if (this.foodsCollected.length) this.game.setFood(this.foodsCollected);
    if (this.fitnessChosen) this.game.setFitness(this.fitnessChosen);
    const prevHealth = getPreviousStat('health');
    this.game.nextDay();
    appendLog(this.game.getLog());
    // Update stats view to show deltas vs baseline captured at startDay
    updateStatsView(this.game);
    updatePenaltyLog(this.game);
    updateDaysSurvived(this.game);
    // Trigger day badge animation
    const badge = document.getElementById('daysSurvived');
    if (badge) {
      badge.classList.remove('animate-day');
      // force reflow to restart animation
      void (badge as HTMLElement).offsetWidth;
      badge.classList.add('animate-day');
      // Fill bar to 100% at end just before transition
      const prog = badge.querySelector('.progress') as HTMLElement | null;
      if (prog) prog.style.width = '100%';
    }
    if (this.game.state.isDead) {
      // death sound already from game, ensure anyway
      audioManager.death();
      this.showGameOver();
      return;
    }
    if (prevHealth != null) {
      const newHealth = (this.game.state as any).health;
      if (newHealth > prevHealth) audioManager.dayEndPositive();
      else if (newHealth < prevHealth) audioManager.dayEndNegative();
    }
    this.animateShiftWithNewRow();
  }

  private showGameOver() {
    const gridEl = qs('#gameGrid');
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.background = 'radial-gradient(circle at 50% 40%, rgba(10,15,25,0.3), rgba(3,6,10,0.95)), #020509';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.color = '#e9eef5';
    overlay.style.fontSize = '0.8rem';
    overlay.style.letterSpacing = '.5px';
    overlay.style.overflow = 'hidden';
    const daysSurvived = this.game.state.day - 1;
    const reason = this.game.state.deathReason || 'Health failure';

    // Background layer (noise + gradient) built with DOM
    const bgLayer = document.createElement('div');
    bgLayer.style.position = 'absolute';
    bgLayer.style.inset = '0';
    bgLayer.style.pointerEvents = 'none';
    bgLayer.style.background = 'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 4px), linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 85%)';
    bgLayer.style.opacity = '0.4';
    overlay.appendChild(bgLayer);

    // Foreground panel
    const panel = document.createElement('div');
    panel.style.textAlign = 'center';
    panel.style.maxWidth = '260px';
    panel.style.lineHeight = '1.35';
    panel.style.position = 'relative';
    panel.style.padding = '1.1rem 1.2rem 1.3rem';
    panel.style.background = 'rgba(8,14,22,0.65)';
    panel.style.border = '1px solid #1e2f45';
    panel.style.borderRadius = '18px';
    panel.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.05) inset, 0 12px 28px -6px rgba(0,0,0,0.8)';
    panel.style.backdropFilter = 'blur(6px)';

    const heading = document.createElement('div');
    heading.textContent = 'Your Journey Ends';
    heading.style.fontSize = '0.75rem';
    heading.style.letterSpacing = '.35px';
    heading.style.textTransform = 'uppercase';
    heading.style.color = '#9cb8d4';
    heading.style.fontWeight = '600';
    panel.appendChild(heading);

    const skull = document.createElement('div');
    skull.textContent = '💀';
    skull.style.fontSize = '2.6rem';
    skull.style.lineHeight = '1';
    skull.style.margin = '0.2rem 0 0.4rem';
    skull.style.filter = 'drop-shadow(0 0 6px #5b0000)';
    panel.appendChild(skull);

    const title = document.createElement('div');
    title.textContent = 'You Died';
    title.style.fontSize = '0.95rem';
    title.style.fontWeight = '700';
    title.style.letterSpacing = '.5px';
    title.style.color = '#fff';
    title.style.textShadow = '0 0 6px rgba(255,0,0,0.35)';
    panel.appendChild(title);

    const survived = document.createElement('div');
    survived.innerHTML = `Survived <strong>${daysSurvived}</strong> ${daysSurvived === 1 ? 'Day' : 'Days'}.`;
    survived.style.marginTop = '0.5rem';
    survived.style.fontSize = '0.7rem';
    survived.style.color = '#c3d2e0';
    panel.appendChild(survived);

    const reasonEl = document.createElement('div');
    reasonEl.textContent = reason;
    reasonEl.style.marginTop = '0.4rem';
    reasonEl.style.fontSize = '0.6rem';
    reasonEl.style.color = '#ffb3b3';
    reasonEl.style.fontStyle = 'italic';
    panel.appendChild(reasonEl);

    const restart = document.createElement('button');
    restart.id = 'reloadBtn';
    restart.textContent = 'Restart';
    restart.style.marginTop = '0.8rem';
    restart.style.background = 'linear-gradient(145deg,#ff5252,#c21212)';
    restart.style.color = '#fff';
    restart.style.border = 'none';
    restart.style.padding = '8px 14px';
    restart.style.borderRadius = '10px';
    restart.style.cursor = 'pointer';
    restart.style.fontSize = '0.65rem';
    restart.style.fontWeight = '600';
    restart.style.letterSpacing = '.5px';
    restart.style.boxShadow = '0 4px 14px -4px rgba(255,0,0,0.5)';
    panel.appendChild(restart);

    const footer = document.createElement('div');
    footer.textContent = 'Balance was lost...';
    footer.style.marginTop = '0.65rem';
    footer.style.fontSize = '0.5rem';
    footer.style.letterSpacing = '.4px';
    footer.style.opacity = '0.45';
    panel.appendChild(footer);

    overlay.appendChild(panel);
    // Flicker effect
    overlay.animate([
      { opacity:0 },
      { opacity:1 }
    ], { duration: 600, easing:'ease-out' });
    // Subtle pulsating vignette
    setInterval(() => {
      overlay.style.backgroundPosition = `${Math.random()*4}px ${Math.random()*4}px`;
    }, 1400);
    const wrapper = gridEl.parentElement as HTMLElement;
    wrapper.style.position = 'relative';
    wrapper.appendChild(overlay);
    restart.addEventListener('click', () => { location.reload(); });
  }

  private getRecentDayNames(): { top: string; mid: string; bottom: string } {
    // Forward looking: bottom = current day, middle = tomorrow, top = day after tomorrow
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const currentIndex = (this.dayCounter - 1 + days.length * 1000) % days.length; // current
    const tomorrowIndex = (currentIndex + 1) % days.length;
    const nextIndex = (currentIndex + 2) % days.length;
    return { top: days[nextIndex], mid: days[tomorrowIndex], bottom: days[currentIndex] };
  }

  private bindControls() {
    window.addEventListener('keydown', (e) => {
      if (!this.running || this.paused) return;
      if (e.key === 'ArrowLeft') { this.playerCol = Math.max(0, this.playerCol - 1); this.collect(); this.render(); }
  else if (e.key === 'ArrowRight') { this.playerCol = Math.min(GRID_COLS - 1, this.playerCol + 1); this.collect(); this.render(); }
      else if (e.key === ' ') { this.collect(); this.render(); }
    });
    // Removed start button; continuous loop
    const btn = document.getElementById('pauseBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        this.paused = !this.paused;
        btn.setAttribute('aria-pressed', this.paused ? 'true' : 'false');
        btn.textContent = this.paused ? '▶' : '⏸';
      });
    }
  }

  private collect() {
    // Collect item in bottom row at playerCol
  if (this.paused) return;
  const cell = this.grid[GRID_ROWS - 1][this.playerCol];
    if (cell.type === 'food' && cell.food) {
      this.foodsCollected.push(cell.food);
      cell.type = 'empty'; cell.food = undefined; cell.emoji = ''; // mark collected
      if ((window as any).audioManager?.setDebug) {
        // lightweight inline log to correlate with audio attempts
        const st = (window as any).audioManager.status?.();
        console.log('[Game] collectFood triggering sound', st);
      }
      audioManager.collectFood();
    } else if (cell.type === 'fitness' && cell.fitness) {
      this.fitnessChosen = cell.fitness;
      cell.type = 'empty'; cell.fitness = undefined; cell.emoji = '';
      if ((window as any).audioManager?.setDebug) {
        const st = (window as any).audioManager.status?.();
        console.log('[Game] collectFitness triggering sound', st);
      }
      audioManager.collectFitness();
    }
  }

  private render() {
    const gridEl = qs('#gameGrid');
    gridEl.innerHTML = '';
  const dayNames = this.getRecentDayNames();
  for (let r = 0; r < GRID_ROWS; r++) {
      // Row label cell (first column)
      const labelDiv = document.createElement('div');
      labelDiv.className = 'row-label';
  // Assign based on row index referencing dayNames object
  labelDiv.textContent = r === 0 ? dayNames.top : r === 1 ? dayNames.mid : dayNames.bottom;
      gridEl.appendChild(labelDiv);
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = this.grid[r][c];
        const div = document.createElement('div');
        div.className = 'cell';
        if (cell.type === 'food') div.classList.add('food');
        if (cell.type === 'fitness') div.classList.add('fitness');
  // Apply dimming: top row strong, middle row mild
  if (r === 0) div.classList.add('future-strong');
  else if (r === 1) div.classList.add('future-mid');
  if (r === GRID_ROWS - 1 && c === this.playerCol) div.classList.add('player');
            // Show icon, name, and details below
            let label = '';
            let details = '';
            if (cell.type === 'food' && cell.food) {
              label = cell.food.name.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/gu, '').trim();
              // Short details: vitamins, sugar, price
              details = `Vit:${cell.food.vitamins} Sug:${cell.food.sugar} $${cell.food.price}`;
            } else if (cell.type === 'fitness' && cell.fitness) {
              label = cell.fitness.action.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/gu, '').trim();
              // Short details: fitness, energy, cost
              details = `Fit:${cell.fitness.fitnessChange} Eng:${cell.fitness.energyChange} $${cell.fitness.cost}`;
            }
            div.innerHTML = `<span class="grid-emoji">${cell.emoji}</span><span class="grid-label">${label}</span><span class="grid-details">${details}</span>`;
        // Interactive zones: bottom row (normal collect) and middle row (fast-forward)
        if (r === GRID_ROWS - 1) {
          div.style.cursor = 'pointer';
          const handler = () => {
            if (!this.running) return;
            this.playerCol = c;
            this.collect();
            this.render();
          };
          div.addEventListener('click', handler);
          div.addEventListener('touchstart', handler, { passive: true });
        } else if (r === 1) {
          div.style.cursor = 'pointer';
          const handler = () => {
            if (!this.running) return;
            this.playerCol = c;
            this.collectMiddleRow(c);
          };
          div.addEventListener('click', handler);
          div.addEventListener('touchstart', handler, { passive: true });
        }
        gridEl.appendChild(div);
      }
    }
    this.ensureFixedArrow();
    this.ensureFixedArrow();
  }

  // Middle row quick selection: accept item and end day immediately (simulate timer expiry)
  private collectMiddleRow(col: number) {
    if (!this.running) return;
    if (this.paused) return;
    const cell = this.grid[1][col];
    if (cell.type === 'food' && cell.food) {
      this.foodsCollected.push(cell.food);
      cell.type = 'empty'; cell.food = undefined; cell.emoji = '';
      if ((window as any).audioManager?.setDebug) {
        const st = (window as any).audioManager.status?.();
        console.log('[Game] collectFood (midRow) triggering sound', st);
      }
      audioManager.collectFood();
    } else if (cell.type === 'fitness' && cell.fitness) {
      this.fitnessChosen = cell.fitness;
      cell.type = 'empty'; cell.fitness = undefined; cell.emoji = '';
      if ((window as any).audioManager?.setDebug) {
        const st = (window as any).audioManager.status?.();
        console.log('[Game] collectFitness (midRow) triggering sound', st);
      }
      audioManager.collectFitness();
    }
    // Immediately end the day
    this.endDay();
  }

  // Create / update the fixed refresh arrow outside the sliding grid rows
  private ensureFixedArrow() {
    const wrapper = (qs('#gameGrid').parentElement) as HTMLElement;
    if (!wrapper) return;
    let btn = wrapper.querySelector('.fixed-refresh-btn') as HTMLDivElement | null;
    if (!btn) {
      btn = document.createElement('div');
      btn.className = 'fixed-refresh-btn';
      wrapper.appendChild(btn);
    }
    // Update visual state
    btn.classList.toggle('used', this.bottomRefreshed);
    if (this.bottomRefreshed) {
      btn.innerHTML = `⟳<span style="font-size:0.45rem; font-weight:600;">USED</span>`;
      btn.style.pointerEvents = 'none';
    } else {
      btn.innerHTML = `▶<span style="font-size:0.45rem; font-weight:600;">MORE</span>`;
      btn.style.pointerEvents = 'auto';
      const handler = () => { if (!this.running || this.paused) return; this.refreshBottomOptions(); };
      // Remove old to avoid multiple bindings
      btn.replaceWith(btn.cloneNode(true));
      btn = wrapper.querySelector('.fixed-refresh-btn') as HTMLDivElement; // reselect cloned
      btn.addEventListener('click', handler);
      btn.addEventListener('touchstart', handler, { passive: true });
    }
  }

  private animateShiftWithNewRow() {
    const gridEl = qs('#gameGrid');
    const wrapper = gridEl.parentElement as HTMLElement;
    // Compute row height
    const totalHeight = gridEl.getBoundingClientRect().height;
    const rowHeight = totalHeight / GRID_ROWS;
    // Prepare new data state (add new row at top, push others down, drop bottom)
    const newRow = this.generateRow();
    const prevRows = this.grid.map(r => [...r]);
    for (let r = GRID_ROWS - 1; r > 0; r--) this.grid[r] = prevRows[r - 1];
    this.grid[0] = newRow;
    // Render new state into a temporary off-DOM container to get HTML
    const temp = document.createElement('div');
    temp.className = 'grid';
    // Build 4-row visual: new + previous 3 (the last previous row will fade out)
  const visualRows = [this.grid[0], prevRows[0], prevRows[1], prevRows[2]];
  const dayNames = this.getRecentDayNames();
    temp.innerHTML = visualRows.map((row, rIdx) => {
      // Keep label column fixed (no shifting classes) to preserve stable day-name positions
      const labelCell = `<div class=\"row-label\">${rIdx===0?dayNames.top: rIdx===1?dayNames.mid: dayNames.bottom}</div>`;
      const items = row.map((cell, cIdx) => {
        const isPlayer = (rIdx === (visualRows.length -1) && cIdx === this.playerCol); // bottom visual row uses old bottom
        let label = '';
        let details = '';
        if (cell.type === 'food' && cell.food) {
          label = cell.food.name.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/gu, '').trim();
          details = `Vit:${cell.food.vitamins} Sug:${cell.food.sugar} $${cell.food.price}`;
        } else if (cell.type === 'fitness' && cell.fitness) {
          label = cell.fitness.action.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/gu, '').trim();
          details = `Fit:${cell.fitness.fitnessChange} Eng:${cell.fitness.energyChange} $${cell.fitness.cost}`;
        }
        const classes = ['cell'];
        if (cell.type === 'food') classes.push('food');
        if (cell.type === 'fitness') classes.push('fitness');
  if (isPlayer) classes.push('player');
  // visualRows order: 0 new top, 1 old top (becomes middle), 2 old middle (becomes bottom), 3 old bottom (fades out)
  if (rIdx === 0) classes.push('future-strong');
  else if (rIdx === 1) classes.push('future-mid');
        const fade = rIdx === visualRows.length -1 ? ' style="opacity:1;"' : '';
        return `<div class=\"${classes.join(' ')}\"${fade}><span class=\"grid-emoji\">${cell.emoji}</span><span class=\"grid-label\">${label}</span><span class=\"grid-details\">${details}</span></div>`;
      }).join('');
      return labelCell + items; // external fixed arrow only
    }).join('');
    // Place temp above existing grid and animate downward
    const cloneLayer = document.createElement('div');
    cloneLayer.className = 'grid-clone-layer';
    cloneLayer.style.height = gridEl.style.height;
    cloneLayer.appendChild(temp);
    // Style temp for stack animation
    temp.style.position = 'absolute';
    temp.style.left = '0';
    temp.style.right = '0';
    temp.style.top = `-${rowHeight}px`;
    temp.style.transform = `translateY(-${rowHeight}px)`;
  temp.style.transition = 'transform .7s cubic-bezier(.45,.85,.4,1)';
    // Fade out bottom part of old grid simultaneously
  gridEl.style.transition = 'transform .7s cubic-bezier(.45,.85,.4,1), opacity .7s linear';
    gridEl.style.transform = `translateY(${rowHeight}px)`;
    gridEl.style.opacity = '0';
    wrapper.style.position = 'relative';
    wrapper.appendChild(cloneLayer);
    // Trigger new render in actual grid after animation completes
    requestAnimationFrame(() => {
      temp.style.transform = 'translateY(0)';
      gridEl.style.transform = `translateY(${rowHeight}px)`; // stays until end
    });
    const finish = () => {
      temp.removeEventListener('transitionend', finish);
      // Clean up clone layer
      wrapper.removeChild(cloneLayer);
      // Render final 3-row grid (already updated in this.grid)
      gridEl.style.transition = '';
      gridEl.style.transform = '';
      gridEl.style.opacity = '1';
      this.render();
      // Provide a small control UI for starting the next day manually (or auto if user chooses)
      this.injectNextDayControls();
      // Auto-start next day if user enabled it and not dead
      try {
        const auto = localStorage.getItem('wq.autoNextDay') === '1';
        if (auto && !(this.game.state as any).isDead) {
          setTimeout(() => { this.startDay(); }, 350); // slight pause for readability
        }
      } catch {}
    };
    temp.addEventListener('transitionend', finish);
  }

  private injectNextDayControls() {
    // Avoid duplicates
    let bar = document.getElementById('nextDayBar') as HTMLDivElement | null;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'nextDayBar';
      bar.style.display = 'flex';
      bar.style.alignItems = 'center';
      bar.style.justifyContent = 'space-between';
      bar.style.gap = '0.5rem';
      bar.style.marginTop = '0.45rem';
      bar.style.background = '#eef3f9';
      bar.style.border = '1px solid #d2dde9';
      bar.style.padding = '0.4rem 0.55rem';
      bar.style.borderRadius = '10px';
      bar.style.boxShadow = '0 2px 4px rgba(0,0,0,0.08)';
      const parentSection = document.querySelector('#minigame');
      if (parentSection) parentSection.appendChild(bar);
    }
    bar.innerHTML = '';
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '0.5rem';
    left.style.fontSize = '0.55rem';
    left.style.letterSpacing = '.5px';
    left.style.fontWeight = '600';
    left.style.color = '#234';
    left.textContent = `Day ${(this.game.state.day)} ready`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Start Next Day ▸';
    btn.style.background = '#3f6cb3';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.padding = '0.45rem 0.75rem';
    btn.style.fontSize = '0.6rem';
    btn.style.fontWeight = '600';
    btn.style.borderRadius = '8px';
    btn.style.cursor = 'pointer';
    btn.style.letterSpacing = '.5px';
    btn.addEventListener('click', () => { this.startDay(); });
    const autoWrap = document.createElement('label');
    autoWrap.style.display = 'flex';
    autoWrap.style.alignItems = 'center';
    autoWrap.style.gap = '4px';
    autoWrap.style.fontSize = '0.5rem';
    autoWrap.style.letterSpacing = '.5px';
    autoWrap.style.fontWeight = '600';
    autoWrap.style.color = '#345';
    const auto = document.createElement('input');
    auto.type = 'checkbox';
    try { auto.checked = localStorage.getItem('wq.autoNextDay') === '1'; } catch {}
    auto.addEventListener('change', () => {
      try { localStorage.setItem('wq.autoNextDay', auto.checked ? '1' : '0'); } catch {}
    });
    autoWrap.appendChild(auto);
    autoWrap.appendChild(document.createTextNode('Auto'));    
    bar.appendChild(left);
    bar.appendChild(btn);
    bar.appendChild(autoWrap);
  }

  // Refresh only bottom row options (generate a new row) with horizontal slide animation
  private refreshBottomOptions() {
    if (this.bottomRefreshed) return;
    this.bottomRefreshed = true;
    audioManager.refresh();
    // Generate a fresh row; keep other rows unchanged
    const oldRow = this.grid[GRID_ROWS - 1];
    const newRow = this.generateRow();
    // Build animation layer
    const gridEl = qs('#gameGrid');
    const wrapper = gridEl.parentElement as HTMLElement;
    const height = gridEl.getBoundingClientRect().height;
    const rowHeight = height / GRID_ROWS;
    // Extract existing bottom row DOM nodes (excluding label first column and arrow at end if present)
    // We'll animate only the content cells + arrow cell.
    // Simpler: rebuild a horizontal layer representing bottom row.
    const bottomLayer = document.createElement('div');
    bottomLayer.className = 'bottom-refresh-layer';
    bottomLayer.style.position = 'absolute';
    bottomLayer.style.left = '0';
    bottomLayer.style.right = '0';
    bottomLayer.style.bottom = '0';
    bottomLayer.style.height = `${rowHeight}px`;
    bottomLayer.style.pointerEvents = 'none';
    wrapper.style.position = 'relative';
    // Compose two strips: old and new
    const stripWidthPct = 100; // percentage width of visible area
    const strip = document.createElement('div');
    strip.style.position = 'absolute';
    strip.style.inset = '0';
    strip.style.display = 'grid';
    // Current grid has: label + GRID_COLS cells + arrow cell (we simulate arrow cell)
    const totalCols = GRID_COLS + 1; // label + items (no arrow cell rendered here)
    strip.style.gridTemplateColumns = `24px repeat(${GRID_COLS}, 1fr)`;
    strip.style.transform = 'translateX(0)';
    strip.style.transition = 'transform .55s cubic-bezier(.55,.1,.3,1)';
    // Build helper to render a cell for a given item
    const renderCell = (cell: GridItem, isPlayer: boolean) => {
      let label = '';
      let details = '';
      if (cell.type === 'food' && cell.food) {
        label = cell.food.name.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/gu, '').trim();
        details = `Vit:${cell.food.vitamins} Sug:${cell.food.sugar} $${cell.food.price}`;
      } else if (cell.type === 'fitness' && cell.fitness) {
        label = cell.fitness.action.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/gu, '').trim();
        details = `Fit:${cell.fitness.fitnessChange} Eng:${cell.fitness.energyChange} $${cell.fitness.cost}`;
      }
      const classes = ['cell'];
      if (cell.type === 'food') classes.push('food');
      if (cell.type === 'fitness') classes.push('fitness');
      if (isPlayer) classes.push('player');
      return `<div class="${classes.join(' ')}"><span class="grid-emoji">${cell.emoji}</span><span class="grid-label">${label}</span><span class="grid-details">${details}</span></div>`;
    };
    const labelCell = `<div class="row-label">${this.getRecentDayNames().bottom}</div>`;
    // Old strip: label + old items (arrow excluded; fixed button overlay handles it)
    const oldStrip = labelCell + oldRow.map((c, idx) => renderCell(c, idx === this.playerCol)).join('');
    // New strip: label + new items
    const newStrip = labelCell + newRow.map((c, idx) => renderCell(c, idx === this.playerCol)).join('');
    // Container that holds both old and new side by side (old visible, new to right)
    const slider = document.createElement('div');
    slider.style.display = 'grid';
  slider.style.gridTemplateColumns = `repeat(2, ${totalCols} * 1fr)`; // structural placeholder
    slider.style.position = 'absolute';
    slider.style.inset = '0';
    slider.style.width = '200%';
    slider.style.display = 'flex';
    const oldContainer = document.createElement('div');
    oldContainer.className = 'bottom-old';
    oldContainer.style.display = 'grid';
    oldContainer.style.gridTemplateColumns = `24px repeat(${GRID_COLS}, 1fr)`;
    oldContainer.innerHTML = oldStrip;
    const newContainer = document.createElement('div');
    newContainer.className = 'bottom-new';
    newContainer.style.display = 'grid';
    newContainer.style.gridTemplateColumns = `24px repeat(${GRID_COLS}, 1fr)`;
    newContainer.innerHTML = newStrip;
    slider.appendChild(oldContainer);
    slider.appendChild(newContainer);
    strip.appendChild(slider);
    bottomLayer.appendChild(strip);
    wrapper.appendChild(bottomLayer);
    // Trigger sliding
    requestAnimationFrame(() => {
      strip.style.transform = 'translateX(-50%)';
    });
    const finish = () => {
      strip.removeEventListener('transitionend', finish);
      bottomLayer.remove();
      // Commit new row to grid data
      this.grid[GRID_ROWS - 1] = newRow;
      // Re-render to show updated items and arrow state
      this.render();
      this.ensureFixedArrow();
    };
    strip.addEventListener('transitionend', finish);
  }
}
