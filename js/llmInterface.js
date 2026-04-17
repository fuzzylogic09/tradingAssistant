// llmInterface.js — Interface Gemini avec fallback automatique de modèles

const LLMInterface = (() => {

  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  // Liste de modèles tentés dans l'ordre (le premier disponible sur le compte est utilisé)
  const MODEL_CANDIDATES = [
    'gemini-flash-latest',          // Alias toujours à jour — correspond à ton curl
    'gemini-2.0-flash-latest',
    'gemini-2.0-flash',
    'gemini-2.5-flash-latest',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
  ];

  let _resolvedModel = null; // Mis en cache après le premier succès

  // ── Test d'une clé + résolution du meilleur modèle disponible ───────────
  async function resolveModel(apiKey) {
    if (_resolvedModel) return _resolvedModel;

    for (const model of MODEL_CANDIDATES) {
      try {
        const resp = await fetch(
          `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Reply with the single word: OK' }] }],
              generationConfig: { maxOutputTokens: 10 }
            })
          }
        );
        if (resp.ok) {
          _resolvedModel = model;
          console.info(`[Gemini] Modèle actif: ${model}`);
          return model;
        }
        // 429 = quota épuisé mais modèle valide → remonter l'erreur directement
        if (resp.status === 429) {
          const err = await resp.json();
          throw new Error(`Quota dépassé pour ${model}: ${err?.error?.message || 'limite atteinte'}`);
        }
        // 404 = modèle inexistant → essayer le suivant
      } catch (e) {
        if (e.message.includes('Quota') || e.message.includes('quota') || e.message.includes('429')) throw e;
        // Sinon continuer
      }
    }
    throw new Error('Aucun modèle Gemini disponible avec cette clé. Vérifiez vos droits sur Google AI Studio.');
  }

  // ── Appel API principal ──────────────────────────────────────────────────
  async function callGemini(apiKey, userPrompt, systemPrompt) {
    const model = await resolveModel(apiKey);
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}&_cb=${Date.now()}`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.15,
        maxOutputTokens: 2048
      }
    };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 429) throw new Error(`Quota Gemini dépassé: ${msg}`);
      throw new Error(`Gemini API (${model}): ${msg}`);
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Réponse Gemini vide');

    const clean = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(clean);
    } catch {
      throw new Error(`JSON invalide dans la réponse Gemini: ${clean.slice(0, 80)}`);
    }
  }

  // ── Construction du prompt ────────────────────────────────────────────────
  //
  // Sur les données intra-day (closes 5min) :
  // Bénéfice: le LLM peut voir la tendance intra-journalière, les rebonds, les supports.
  // Coût en tokens: ~30 valeurs × 7 chars ≈ 210 tokens supplémentaires, négligeable.
  // → On les inclut sous forme simplifiée (15 dernières valeurs 5min).
  //
  function buildPrompt(d, det, minGain) {

    // Résumé tendance récente (derniers 5 closes journaliers)
    const recentTrend = d.closes?.slice(-5).map(v => v?.toFixed(2)).join(' → ') || 'N/A';

    // Variation intra-day depuis l'ouverture (si dispo)
    const intraDayNote = d.changePct != null
      ? `La séance en cours est ${d.changePct > 0 ? 'haussière' : 'baissière'} de ${Math.abs(d.changePct).toFixed(2)}%.`
      : '';

    const prompt = `Tu es un trader quantitatif expert en analyse technique court-terme (1-7 jours).
Objectif: identifier uniquement des opportunités à ${minGain}%+ de gain. Préfère HOLD à un signal incertain.

=== DONNÉES ${d.symbol} (${d.name}) ===
Prix: ${d.price?.toFixed(2)} ${d.currency || 'USD'} | Variation J: ${d.changePct?.toFixed(2) ?? 'N/A'}%
Marché: ${d.marketState || 'N/A'} | Gap overnight: ${d.gapPct != null ? `${d.gapPct > 0 ? '+' : ''}${d.gapPct.toFixed(2)}%` : 'N/A'}
${intraDayNote}

Tendance 5 dernières séances (fermetures): ${recentTrend}

--- INDICATEURS TECHNIQUES ---
RSI(14): ${d.rsi ?? 'N/A'} ${d.rsi < 30 ? '→ SURVENTE' : d.rsi > 70 ? '→ SURACHAT' : ''}
MACD: macd=${d.macd?.macd?.toFixed(3) ?? 'N/A'} | signal=${d.macd?.signal?.toFixed(3) ?? 'N/A'} | histo=${d.macd?.histogram?.toFixed(3) ?? 'N/A'}${d.macd?.crossover ? ` → CROSSOVER ${d.macd.crossover.toUpperCase()}` : ''}
Bollinger(20): haute=${d.bollinger?.upper?.toFixed(2) ?? 'N/A'} | mid=${d.bollinger?.middle?.toFixed(2) ?? 'N/A'} | basse=${d.bollinger?.lower?.toFixed(2) ?? 'N/A'}
  Prix dans les bandes: ${d.bollingerPosition != null ? `${(d.bollingerPosition * 100).toFixed(1)}%` : 'N/A'} (0%=bande basse, 100%=bande haute)
SMA20=${d.sma20?.toFixed(2) ?? 'N/A'} | SMA50=${d.sma50?.toFixed(2) ?? 'N/A'} | SMA200=${d.sma200?.toFixed(2) ?? 'N/A'}
ATR(14): ${d.atr?.toFixed(3) ?? 'N/A'} (volatilité journalière attendue: ${d.atr && d.price ? `${((d.atr/d.price)*100).toFixed(2)}%` : 'N/A'})
Volume relatif: ${d.volumeRatio?.toFixed(2) ?? 'N/A'}x la moyenne 20j

--- POSITION & FONDAMENTAUX ---
52s Haut: ${d.fiftyTwoWeekHigh?.toFixed(2) ?? 'N/A'} (${d.distanceFrom52wHigh?.toFixed(1) ?? 'N/A'}% du sommet)
52s Bas:  ${d.fiftyTwoWeekLow?.toFixed(2) ?? 'N/A'} (${d.distanceFrom52wLow?.toFixed(1) ?? 'N/A'}% du creux)
Beta: ${d.beta?.toFixed(2) ?? 'N/A'} | Short %: ${d.shortPct != null ? `${(d.shortPct*100).toFixed(1)}%` : 'N/A'}
Analystes: ${d.analystBuy ?? 0} BUY / ${d.analystHold ?? 0} HOLD / ${d.analystSell ?? 0} SELL | Cible: ${d.targetMeanPrice?.toFixed(2) ?? 'N/A'}

--- SENTIMENT ---
CNN Fear & Greed: ${d.fearGreedScore ?? 'N/A'}/100 (${d.fearGreedRating ?? 'N/A'})

--- PRÉ-ANALYSE (règles déterministes) ---
Signal brut: ${det.signal} | Score BUY: ${det.buyScore} | Score SELL: ${det.sellScore}
Règles actives: ${det.allTriggeredRules?.map(r => `[${r.signal} ${r.name} ${(r.confidence*100).toFixed(0)}%]`).join(' ') || 'aucune'}
Gain ATR estimé: ${det.estimatedGainPct ?? 'N/A'}%

Réponds UNIQUEMENT avec ce JSON (sans markdown):
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": <entier 0-100>,
  "reasoning": "<explication en 2-3 phrases, incluant pourquoi ce signal malgré les indicateurs contradictoires s'il y en a>",
  "keyFactors": ["<facteur décisif 1>", "<facteur décisif 2>", "<facteur décisif 3>"],
  "risks": ["<risque principal>", "<risque secondaire>"],
  "timeHorizon": "intraday" | "1-2j" | "3-5j",
  "targetPriceBuy": <number ou null>,
  "targetPriceSell": <number ou null>,
  "stopLoss": <number ou null>,
  "estimatedGainPct": <number ou null>,
  "meetsMinGain": <boolean>,
  "marketContext": "<contexte macro/sectoriel en 1 phrase courte>",
  "trendAssessment": "bullish" | "bearish" | "neutral" | "uncertain"
}

Règles strictes:
- HOLD si confidence < 55
- N'émets BUY/SELL que si le gain estimé est ≥ ${minGain}%
- Si RSI > 70 ET prix en haut des bandes Bollinger ET tendance haussière récente → ce peut être un momentum fort, pas forcément un signal SELL immédiat — évalue le contexte
- Tiens compte de la DIRECTION DE LA TENDANCE récente, pas seulement des niveaux extrêmes`;

    return prompt;
  }

  // ── Analyse publique ──────────────────────────────────────────────────────
  async function analyzeAsset(apiKey, marketData, deterministicResult, minGainPct = 2.0) {
    const systemPrompt = `Tu es un assistant d'analyse financière quantitative.
Tu réponds TOUJOURS en JSON valide uniquement, sans aucun texte avant ou après.
Tu es conservateur: HOLD est préférable à un signal incertain.`;

    const result = await callGemini(apiKey, buildPrompt(marketData, deterministicResult, minGainPct), systemPrompt);

    return {
      signal:           ['BUY','SELL','HOLD'].includes(result.signal) ? result.signal : 'HOLD',
      confidence:       Math.max(0, Math.min(100, result.confidence || 0)),
      reasoning:        result.reasoning || '',
      keyFactors:       Array.isArray(result.keyFactors) ? result.keyFactors : [],
      risks:            Array.isArray(result.risks) ? result.risks : [],
      timeHorizon:      result.timeHorizon || '1-2j',
      targetPriceBuy:   result.targetPriceBuy  || null,
      targetPriceSell:  result.targetPriceSell || null,
      stopLoss:         result.stopLoss        || null,
      estimatedGainPct: result.estimatedGainPct || null,
      meetsMinGain:     result.meetsMinGain    || false,
      marketContext:    result.marketContext   || '',
      trendAssessment:  result.trendAssessment || 'uncertain',
    };
  }

  // ── Exposé pour le test de clé dans ui.js ────────────────────────────────
  async function testKey(apiKey) {
    _resolvedModel = null; // reset cache pour forcer re-détection
    const model = await resolveModel(apiKey);
    return model;
  }

  return { analyzeAsset, testKey };
})();
