import { clamp, evalExpression } from './utils';
import { audioManager } from './audio';
export class Game {
    constructor(data) {
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "selectedFoods", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "selectedFitness", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "dayLog", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "hardshipFactor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1.0
        }); // 1.0 = normal; >1 harder (more decay, less income), <1 easier
        this.data = data;
        this.state = this.initState();
    }
    initState() {
        const st = this.data.playerStats;
        return {
            ...st,
            day: 1,
            streakHealthyMeals: 0,
            history: { sugar: [], cholesterol: [], sodium: [] },
            activeDiseases: [],
            blockedWork: false
        };
    }
    getLog() { return this.dayLog.join('\n'); }
    pushLog(line) { this.dayLog.push(line); }
    resetDayLog() { this.dayLog = []; }
    setHardshipFactor(f) {
        if (f < 0.25)
            f = 0.25;
        else if (f > 3)
            f = 3; // clamp safety
        this.hardshipFactor = Number(f.toFixed(2));
        this.pushLog(`Hardship factor set to ${this.hardshipFactor}x`);
    }
    setFood(foods) {
        if (Array.isArray(foods)) {
            this.selectedFoods = foods;
        }
        else {
            this.selectedFoods = [foods];
        }
    }
    setFitness(action) { this.selectedFitness = action; }
    // Job system removed for simplicity
    nextDay() {
        this.resetDayLog();
        this.pushLog(`--- Day ${this.state.day} ---`);
        // Sequence: eat -> fitness -> work -> disease check -> end
        this.eatPhase();
        this.fitnessPhase();
        this.workPhase();
        this.diseaseCheckPhase();
        this.endOfDay();
        this.state.day++;
    }
    applyFoodEffects(food) {
        const s = this.state;
        s.energy += food.energy;
        s.vitamins += food.vitamins;
        s.protein += food.protein;
        s.sugar += food.sugar;
        s.cholesterol += food.cholesterol;
        s.sodium += food.sodium;
        s.mood += food.mood;
        s.fitness += food.fitness;
        if (food.minerals)
            s.minerals += food.minerals;
        s.money -= food.price;
    }
    eatPhase() {
        if (!this.selectedFoods.length) {
            this.pushLog('No food selected.');
            return;
        }
        let healthyCount = 0;
        this.selectedFoods.forEach(food => {
            this.pushLog(`Eating: ${food.name}`);
            this.applyFoodEffects(food);
            // Healthy meal heuristic: low sugar & cholesterol & some vitamins
            const healthy = food.sugar <= 3 && food.cholesterol <= 2 && food.vitamins >= 3;
            if (healthy)
                healthyCount++;
        });
        if (healthyCount === this.selectedFoods.length && healthyCount > 0) {
            this.state.streakHealthyMeals++;
            this.pushLog(`Healthy meal streak: ${this.state.streakHealthyMeals}`);
        }
        else {
            this.state.streakHealthyMeals = 0;
        }
    }
    fitnessPhase() {
        if (!this.selectedFitness) {
            this.pushLog('No fitness action selected.');
            return;
        }
        const act = this.selectedFitness;
        this.pushLog(`Fitness: ${act.action}`);
        this.state.money -= act.cost;
        this.state.energy += act.energyChange;
        this.state.fitness += act.fitnessChange;
        this.state.mood += act.moodChange;
    }
    workPhase() {
        if (this.state.blockedWork) {
            this.pushLog('Unable to work due to a condition.');
            return;
        }
        const { economy } = this.data;
        const context = { ...this.state, baseIncome: economy.baseIncome, fitness: this.state.fitness, energy: this.state.energy };
        let income = evalExpression(economy.incomeFormula.split('=')[1].trim(), context);
        if (this.state.mood < 25)
            income *= economy.lowMoodPenalty;
        else
            income += income * economy.moodBonus * (this.state.mood / 100);
        const healthyStats = ['vitamins', 'minerals', 'protein'].filter(k => this.state[k] >= 60).length;
        const healthBonus = evalExpression(economy.healthBonusFormula.replace('healthyStats', healthyStats.toString()), { healthyStats });
        income *= healthBonus;
        const fitness = clamp(this.state.fitness, 0, 100);
        const fitnessMultiplier = 0.5 + (fitness / 100) * 0.7;
        income *= fitnessMultiplier;
        this.pushLog(`Fitness multiplier applied: x${fitnessMultiplier.toFixed(2)}`);
        if (this.state.streakHealthyMeals >= 3 && this.state.fitness >= 70) {
            income += economy.peakBonus;
            this.pushLog('Peak condition bonus applied.');
        }
        for (const d of this.state.activeDiseases) {
            if (d.effect.incomeMultiplier !== undefined)
                income *= d.effect.incomeMultiplier;
            if (d.effect.money)
                income += d.effect.money;
        }
        // Hardship: income reduced by factor (>1 harder => less income). Inverse scaling.
        income = income / this.hardshipFactor;
        income = Math.max(0, Math.round(income));
        this.pushLog(`Income earned: ${income}`);
        this.state.money += income;
    }
    diseaseCheckPhase() {
        const s = this.state;
        const hist = s.history;
        hist.sugar.push(s.sugar);
        if (hist.sugar.length > 5)
            hist.sugar.shift();
        hist.cholesterol.push(s.cholesterol);
        if (hist.cholesterol.length > 5)
            hist.cholesterol.shift();
        hist.sodium.push(s.sodium);
        if (hist.sodium.length > 5)
            hist.sodium.shift();
        const triggered = [];
        for (const disease of this.data.diseases) {
            if (s.activeDiseases.find(d => d.name === disease.name))
                continue; // already active
            const trig = disease.trigger;
            let ok = false;
            if (trig.includes('sugar > 110')) {
                ok = hist.sugar.slice(-3).every(v => v > 110);
            }
            else if (trig.includes('cholesterol > 110')) {
                ok = hist.cholesterol.slice(-2).every(v => v > 110);
            }
            else if (trig.includes('sodium > 110')) {
                ok = hist.sodium.slice(-3).every(v => v > 110);
            }
            else if (trig.includes('energy < 20')) {
                ok = s.energy < 20;
            }
            else if (trig.includes('mood < 25')) {
                ok = s.mood < 25;
            }
            if (ok) {
                triggered.push(disease);
                s.activeDiseases.push(disease);
                if (disease.effect.canWork === false)
                    s.blockedWork = true;
            }
        }
        for (const d of triggered) {
            this.pushLog(`Disease triggered: ${d.name}`);
            // immediate effects (non-income ones): energy, money, mood
            if (d.effect.energy)
                s.energy += d.effect.energy;
            if (d.effect.mood)
                s.mood += d.effect.mood;
            if (d.effect.money)
                s.money += d.effect.money;
        }
        if (triggered.length) {
            audioManager.disease();
        }
    }
    endOfDay() {
        const decay = this.data.gameRules.rules.statDecay;
        for (const [k, v] of Object.entries(decay)) {
            const scaled = v * this.hardshipFactor; // v is negative so harder => more negative
            this.state[k] += scaled;
        }
        // Apply cross-stat health adjustments before clamping
        this.adjustHealth();
        // Clamp
        const lim = this.data.gameRules.rules.statLimits;
        const clampKeys = ['energy', 'fitness', 'mood', 'vitamins', 'minerals', 'protein', 'sugar', 'cholesterol', 'sodium', 'health'];
        for (const k of clampKeys) {
            const maxMap = { energy: lim.energyMax, fitness: lim.fitnessMax, mood: lim.moodMax, health: lim.healthMax };
            const max = maxMap[k] ?? lim.max;
            this.state[k] = clamp(this.state[k], lim.min, max);
        }
        // Death roll: below 50 health there is a growing chance to die
        this.evaluateDeath();
        this.pushLog('End of day: stats decayed & clamped.');
    }
    // Cross-stat health logic: penalize extremes, reward balance.
    // Heuristics (can be externalized later):
    //  - Severe deficiency (vitamins/minerals/protein < 20) => -4 each
    //  - Mild deficiency (< 40) => -2 each
    //  - Balanced trio (all >= 60) => +3 bonus
    //  - Excess sugar/cholesterol/sodium: 100-109 => -2 each, 110+ => -5 each
    //  - Very low energy (< 25) => -3; critical (< 15) => -6 (replaces the -3)
    //  - Very low mood (< 25) => -3; critical (< 15) => -6 (replaces the -3)
    //  - Good fitness (>= 70) & good mood (>= 60) & energy (>= 60) => +2 synergy
    //  - Healthy meal streak (>=3) => +2
    //  - Cap net daily health change to [-12, +8]
    adjustHealth() {
        const s = this.state;
        let delta = 0;
        const add = (d) => { delta += d; };
        // Macro / micro nutrients
        for (const k of ['vitamins', 'minerals', 'protein']) {
            const v = s[k];
            if (v < 20)
                add(-4);
            else if (v < 40)
                add(-2);
        }
        if (['vitamins', 'minerals', 'protein'].every(k => s[k] >= 60))
            add(3);
        // Excess markers
        for (const k of ['sugar', 'cholesterol', 'sodium']) {
            const v = s[k];
            if (v >= 110)
                add(-5);
            else if (v >= 100)
                add(-2);
        }
        // Energy & mood low penalties
        if (s.energy < 15)
            add(-6);
        else if (s.energy < 25)
            add(-3);
        if (s.mood < 15)
            add(-6);
        else if (s.mood < 25)
            add(-3);
        // Positive synergy for good condition
        if (s.fitness >= 70 && s.mood >= 60 && s.energy >= 60)
            add(2);
        if (s.streakHealthyMeals >= 3)
            add(2);
        // Bound total daily delta
        if (delta < -12)
            delta = -12;
        else if (delta > 8)
            delta = 8;
        if (delta !== 0) {
            s.health += delta;
            this.pushLog(`Health adjusted by ${delta} from cross-stat factors.`);
        }
        else {
            this.pushLog('Health unchanged by cross-stat factors.');
        }
    }
    evaluateDeath() {
        const s = this.state;
        if (s.isDead)
            return; // already dead
        if (s.health >= 50)
            return; // no death checks above this threshold
        // Probability scales: health 49 => 2% .. health 0 => 90%
        const chance = Math.min(0.9, 0.02 + ((50 - s.health) / 50) * 0.88); // 0.02 to ~0.90
        const roll = Math.random();
        this.pushLog(`Death check: health=${s.health} chance=${(chance * 100).toFixed(1)}% roll=${(roll * 100).toFixed(1)}%`);
        if (roll < chance) {
            s.isDead = true;
            s.deathReason = this.deriveDeathReason();
            this.pushLog(`YOU DIED: ${s.deathReason}`);
            audioManager.death();
        }
    }
    deriveDeathReason() {
        const s = this.state;
        // Simple heuristic: pick the worst offending stat extremes
        const issues = [];
        if (s.sugar > 115)
            issues.push('Complications from high sugar');
        if (s.cholesterol > 115)
            issues.push('Cardiovascular failure');
        if (s.sodium > 115)
            issues.push('Hypertensive crisis');
        if (s.energy < 10)
            issues.push('Systemic exhaustion');
        if (s.mood < 10)
            issues.push('Severe depressive collapse');
        if (issues.length === 0)
            return 'Health failure';
        return issues[0];
    }
}
//# sourceMappingURL=game.js.map