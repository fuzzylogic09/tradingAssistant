// app.js — Orchestrateur principal

const App = (() => {

  let assetsDB = [];
  let analyses = {};
  let isAnalyzing = false;

  // ── Chargement initial ───────────────────────────────────────────────────
  async function init() {
    try {
      const r = await fetch(`./data/assets.json?v=${Date.now()}`);
      const d = await r.json();
      assetsDB = d.assets || [];
    } catch (e) {
      console.warn('Impossible de charger assets.json', e);
      assetsDB = [];
    }

    UI.init(assetsDB);
    UI.renderWatchlist();
    UI.renderCards();   // ← affiche les cartes vides dès le démarrage
    UI.updateSummary(analyses);
  }

  // ── Analyse d'un actif ───────────────────────────────────────────────────
  async function analyzeSymbol(symbol) {
    const apiKey = Config.getGeminiKey();
    const minGain = Config.getMinGainPct();

    // S'assurer que la carte existe avant de modifier son statut
    UI.renderCards();
    UI.setSymbolStatus(symbol, 'loading', 'Récupération des données...');

    let marketData;
    try {
      marketData = await DataFetcher.fetchAll(symbol);
    } catch (e) {
      UI.setSymbolStatus(symbol, 'error', `Erreur données: ${e.message}`);
      return null;
    }

    UI.setSymbolStatus(symbol, 'loading', 'Analyse technique...');

    let deterministicResult;
    try {
      deterministicResult = Rules.analyze(marketData);
    } catch (e) {
      deterministicResult = {
        signal: 'HOLD', confidence: 0,
        allTriggeredRules: [], buyRules: [], sellRules: [],
        confluence: { buy: 0, sell: 0, required: 2 },
        meetsMinGain: false
      };
    }

    let llmResult = null;
    if (apiKey) {
      UI.setSymbolStatus(symbol, 'loading', 'Analyse LLM Gemini...');
      try {
        llmResult = await LLMInterface.analyzeAsset(apiKey, marketData, deterministicResult, minGain);
      } catch (e) {
        console.warn('LLM error for', symbol, e.message);
        llmResult = {
          signal: deterministicResult.signal,
          confidence: deterministicResult.confidence,
          reasoning: `LLM indisponible: ${e.message}`,
          keyFactors: [], risks: [],
          meetsMinGain: deterministicResult.meetsMinGain
        };
      }
    }

    const result = { marketData, deterministicResult, llmResult, timestamp: new Date() };
    analyses[symbol] = result;

    UI.renderCard(symbol, result);
    UI.updateSummary(analyses);

    return result;
  }

  // ── Analyse de toute la watchlist ────────────────────────────────────────
  async function analyzeAll() {
    if (isAnalyzing) return;
    isAnalyzing = true;
    UI.setAnalyzingAll(true);

    const watchlist = Watchlist.get();
    for (const symbol of watchlist) {
      await analyzeSymbol(symbol);
      await new Promise(r => setTimeout(r, 1200));
    }

    isAnalyzing = false;
    UI.setAnalyzingAll(false);
    UI.showLastUpdateTime();
  }

  function getAnalysis(symbol) { return analyses[symbol] || null; }
  function getAssetsDB() { return assetsDB; }

  return { init, analyzeSymbol, analyzeAll, getAnalysis, getAssetsDB };
})();

// Démarrage — on attend que tous les scripts soient chargés
// (le loader dans index.html appelle App.init() après injection)

