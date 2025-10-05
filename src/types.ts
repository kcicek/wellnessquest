// Domain model interfaces for WellnessQuest

export interface PlayerStats {
  health: number;
  energy: number;
  fitness: number;
  vitamins: number;
  minerals: number;
  protein: number;
  sugar: number;
  cholesterol: number;
  sodium: number;
  mood: number;
  money: number;
}

export interface Food {
  name: string;
  price: number;
  energy: number; // delta
  vitamins: number;
  protein: number;
  sugar: number;
  cholesterol: number;
  sodium: number;
  mood: number;
  fitness: number;
  minerals?: number; // optional extension
}

export interface FitnessAction {
  action: string;
  cost: number; // money cost
  energyChange: number;
  fitnessChange: number;
  moodChange: number;
}


export interface DiseaseEffect {
  energy?: number;
  money?: number;
  mood?: number;
  canWork?: boolean;
  incomeMultiplier?: number; // modifies income
}

export interface Disease {
  name: string;
  trigger: string; // textual rule we parse minimally / simplified
  effect: DiseaseEffect;
}

export interface GameRules {
  rules: {
    turnCycle: string[];
    statLimits: {
      min: number;
      max: number;
      moodMax: number;
      energyMax: number;
      fitnessMax: number;
      healthMax: number;
    };
    statDecay: Record<string, number>;
  };
}

// Job system removed
export interface FoodsFile { foods: Food[]; }
export interface FitnessFile { fitnessActions: FitnessAction[]; }
export interface DiseasesFile { diseases: Disease[]; }
export interface EconomyFile {
  baseIncome: number;
  healthyBonus: number;
  moodBonus: number;
  diseasePenalty: number;
  peakBonus: number;
  lowMoodPenalty: number;
  energyMultiplier: string; // expression string
  healthBonusFormula: string; // expression
  incomeFormula: string; // expression
}

export interface PlayerState extends PlayerStats {
  day: number;
  streakHealthyMeals: number;
  history: { sugar: number[]; cholesterol: number[]; sodium: number[]; };
  activeDiseases: Disease[];
  blockedWork: boolean;
  isDead?: boolean;
  deathReason?: string;
}

export interface LoadedData {
  playerStats: PlayerStats;
  foods: Food[];
  fitnessActions: FitnessAction[];
  diseases: Disease[];
  economy: EconomyFile;
  gameRules: GameRules;
}
