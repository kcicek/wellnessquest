import { LoadedData, PlayerStats, FoodsFile, FitnessFile, DiseasesFile, EconomyFile, GameRules } from './types';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

export async function loadAllData(): Promise<LoadedData> {
  // JSON expected in root directory relative to index.html
  // Assets now served from public/data/ (root-relative after build with base) so use relative folder path
  const basePath = 'data/';
  const [playerStatsFile, foodsFile, fitnessFile, diseasesFile, economyFile, gameRulesFile] = await Promise.all([
    fetchJSON<{ playerStats: PlayerStats }>(basePath + 'playerStats.json'),
    fetchJSON<FoodsFile>(basePath + 'foods.json'),
    fetchJSON<FitnessFile>(basePath + 'fitnessActions.json'),
    fetchJSON<DiseasesFile>(basePath + 'diseases.json'),
    fetchJSON<EconomyFile>(basePath + 'economy.json'),
    fetchJSON<GameRules>(basePath + 'gameRules.json')
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
