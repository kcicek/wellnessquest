import { LoadedData, PlayerStats, FoodsFile, FitnessFile, DiseasesFile, EconomyFile, GameRules } from './types';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

export async function loadAllData(): Promise<LoadedData> {
  // JSON expected in root directory relative to index.html
  const [playerStatsFile, foodsFile, fitnessFile, diseasesFile, economyFile, gameRulesFile] = await Promise.all([
    fetchJSON<{ playerStats: PlayerStats }>('playerStats.json'),
    fetchJSON<FoodsFile>('foods.json'),
    fetchJSON<FitnessFile>('fitnessActions.json'),
    fetchJSON<DiseasesFile>('diseases.json'),
    fetchJSON<EconomyFile>('economy.json'),
    fetchJSON<GameRules>('gameRules.json')
  ]);

  return {
    playerStats: playerStatsFile.playerStats,
    foods: foodsFile.foods,
    fitnessActions: fitnessFile.fitnessActions,
    diseases: diseasesFile.diseases,
    economy: economyFile,
    gameRules: gameRulesFile
  };
}
