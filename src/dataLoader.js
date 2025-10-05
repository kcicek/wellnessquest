async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok)
        throw new Error(`Failed to load ${path}`);
    return res.json();
}
export async function loadAllData() {
    // JSON expected in root directory relative to index.html
    const [playerStatsFile, foodsFile, fitnessFile, diseasesFile, economyFile, gameRulesFile] = await Promise.all([
        fetchJSON('playerStats.json'),
        fetchJSON('foods.json'),
        fetchJSON('fitnessActions.json'),
        fetchJSON('diseases.json'),
        fetchJSON('economy.json'),
        fetchJSON('gameRules.json')
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
//# sourceMappingURL=dataLoader.js.map