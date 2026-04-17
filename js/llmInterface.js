// llmInterface.js — Interface LLM (Gemini), équivalent JS de la classe Python

const LLMInterface = (() => {

  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
  const MODEL = 'gemini-2.0-flash'; // Rapide et performant pour l'analyse

  // ── Équivalent de getResponse() ──────────────────────────────────────────
  async function getResponse(apiKey, prompt, systemInstruction = null) {
    if (!apiKey) throw new Error('Clé API Gemini manquante. Configurez-la dans l\'onglet Configuration.');

    const url = `${GEMINI_BASE}/${MODEL}:generateContent?key=${apiKey}&v=${Date.now()}`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2, // Faible pour des analyses cohérentes
        maxOutputTokens: 2048
      }
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini API error ${response.status}: ${err?.error?.message || 'Erreur inconnue'}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Réponse Gemini vide ou malformée');

    // Parse JSON (Gemini peut ajouter des backticks parfois)
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }

  // ── Prompt principal d'analyse ───────────────────────────────────────────
  function buildAnalysisPrompt(data, deterministicResult, minGainPct) {
    const technicalSummary = `
Symbole: ${data.symbol} (${data.name})
Prix actuel: ${data.price?.toFixed(2)} ${data.currency || 'USD'}
Variation jour: ${data.changePct?.toFixed(2)}%
Gap overnight: ${data.gapPct?.toFixed(2) ?? 'N/A'}%
État marché: ${data.marketState || 'N/A'}

--- INDICATEURS TECHNIQUES ---
RSI (14): ${data.rsi ?? 'N/A'}
MACD: ${data.macd ? `valeur=${data.macd.macd.toFixed(3)}, signal=${data.macd.signal.toFixed(3)}, histogramme=${data.macd.histogram.toFixed(3)}` : 'N/A'}
Bandes de Bollinger: ${data.bollinger ? `haute=${data.bollinger.upper.toFixed(2)}, milieu=${data.bollinger.middle.toFixed(2)}, basse=${data.bollinger.lower.toFixed(2)}` : 'N/A'}
Position dans Bollinger: ${data.bollingerPosition != null ? `${(data.bollingerPosition * 100).toFixed(1)}%` : 'N/A'}
SMA20: ${data.sma20?.toFixed(2) ?? 'N/A'} | SMA50: ${data.sma50?.toFixed(2) ?? 'N/A'}
ATR: ${data.atr?.toFixed(3) ?? 'N/A'}
Rapport volume/moyenne: ${data.volumeRatio?.toFixed(2) ?? 'N/A'}x

--- POSITION MARCHÉ ---
Plus haut 52 semaines: ${data.fiftyTwoWeekHigh?.toFixed(2) ?? 'N/A'}
Plus bas 52 semaines: ${data.fiftyTwoWeekLow?.toFixed(2) ?? 'N/A'}
Distance depuis sommet 52s: ${data.distanceFrom52wHigh?.toFixed(1) ?? 'N/A'}%
Beta: ${data.beta?.toFixed(2) ?? 'N/A'}
Short %: ${data.shortPct != null ? `${(data.shortPct * 100).toFixed(1)}%` : 'N/A'}

--- SENTIMENT ---
CNN Fear & Greed: ${data.fearGreedScore ?? 'N/A'}/100 (${data.fearGreedRating ?? 'N/A'})
Analystes: ${data.analystBuy ?? 0} BUY / ${data.analystHold ?? 0} HOLD / ${data.analystSell ?? 0} SELL
Prix cible analyste: ${data.targetMeanPrice?.toFixed(2) ?? 'N/A'}

--- ANALYSE DÉTERMINISTE (règles techniques) ---
Signal: ${deterministicResult.signal}
Confluence: ${deterministicResult.confluence.buy} règles BUY, ${deterministicResult.confluence.sell} règles SELL
Règles déclenchées: ${deterministicResult.allTriggeredRules.map(r => `${r.name} (${r.signal}, conf=${(r.confidence * 100).toFixed(0)}%)`).join('; ') || 'Aucune'}
Gain journalier estimé (ATR): ${deterministicResult.estimatedGainPct ?? 'N/A'}%

--- SOURCES ---
${data.sources?.join(', ') || 'Yahoo Finance'}
Horodatage: ${data.timestamp}
`;

    return `Tu es un expert en analyse technique et en trading court-terme (horizon 1-7 jours).
Objectif de l'utilisateur: transactions ne rapportant qu'au moins ${minGainPct}% de gain net.
Préférence: MOINS de transactions mais HAUTE PRÉCISION plutôt que beaucoup de signaux incertains.

Analyse les données suivantes pour ${data.symbol}:

${technicalSummary}

Réponds UNIQUEMENT en JSON avec exactement ce format:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": <0-100>,
  "reasoning": "<2-3 phrases synthétiques expliquant le signal>",
  "keyFactors": ["<facteur 1>", "<facteur 2>", "<facteur 3>"],
  "risks": ["<risque 1>", "<risque 2>"],
  "timeHorizon": "1j" | "2-3j" | "1 semaine",
  "targetPriceBuy": <prix d'entrée suggéré ou null>,
  "targetPriceSell": <prix de vente suggéré ou null>,
  "stopLoss": <prix stop-loss suggéré ou null>,
  "estimatedGainPct": <gain estimé % ou null>,
  "meetsMinGain": <true si gain estimé >= ${minGainPct}%>,
  "marketContext": "<contexte macro/sentiment en 1 phrase>"
}

Si le signal est HOLD, confidence doit être < 40.
Ne recommande BUY ou SELL que si tu es confiant à plus de 55%.
Prends en compte l'analyse déterministe mais affine-la avec ton raisonnement.`;
  }

  // ── Analyse complète ─────────────────────────────────────────────────────
  async function analyzeAsset(apiKey, marketData, deterministicResult, minGainPct = 2.0) {
    const systemPrompt = `Tu es un assistant d'analyse financière technique.
Tu analyses des données de marché et fournis des recommandations court-terme (1-7 jours).
Tu réponds TOUJOURS en JSON valide, sans markdown, sans commentaires.
Tu es conservateur: tu préfères HOLD quand tu n'es pas sûr.`;

    const userPrompt = buildAnalysisPrompt(marketData, deterministicResult, minGainPct);

    const result = await getResponse(apiKey, userPrompt, systemPrompt);

    // Validation et nettoyage
    return {
      signal: ['BUY', 'SELL', 'HOLD'].includes(result.signal) ? result.signal : 'HOLD',
      confidence: Math.max(0, Math.min(100, result.confidence || 0)),
      reasoning: result.reasoning || '',
      keyFactors: Array.isArray(result.keyFactors) ? result.keyFactors : [],
      risks: Array.isArray(result.risks) ? result.risks : [],
      timeHorizon: result.timeHorizon || '1j',
      targetPriceBuy: result.targetPriceBuy || null,
      targetPriceSell: result.targetPriceSell || null,
      stopLoss: result.stopLoss || null,
      estimatedGainPct: result.estimatedGainPct || null,
      meetsMinGain: result.meetsMinGain || false,
      marketContext: result.marketContext || ''
    };
  }

  return { analyzeAsset };
})();
