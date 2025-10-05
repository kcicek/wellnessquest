async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok)
        throw new Error(`Failed to load ${path}`);
    return res.json();
}
export async function loadAllData() {
    // JSON expected in root directory relative to index.html
    // Assets now served from public/data/ (root-relative after build with base) so use relative folder path
    const basePath = 'data/';
    const [playerStatsFile, foodsFile, fitnessFile, diseasesFile, economyFile, gameRulesFile] = await Promise.all([
        fetchJSON(basePath + 'playerStats.json'),
        fetchJSON(basePath + 'foods.json'),
        fetchJSON(basePath + 'fitnessActions.json'),
        fetchJSON(basePath + 'diseases.json'),
        fetchJSON(basePath + 'economy.json'),
        fetchJSON(basePath + 'gameRules.json')
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