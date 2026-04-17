// llmInterface.js — Interface Gemini, prompt concis

const LLMInterface = (() => {

  const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
  const MODELS = [
    'gemini-flash-latest',
    'gemini-2.0-flash-latest',
    'gemini-2.0-flash',
    'gemini-2.5-flash-latest',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
  ];
  let _model = null;

  async function resolveModel(apiKey) {
    if (_model) return _model;
    for (const m of MODELS) {
      try {
        // NOTE: pas de cache-buster dans l'URL — l'API Gemini rejette les paramètres inconnus
        const r = await fetch(`${BASE}/${m}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'OK' }] }], generationConfig: { maxOutputTokens: 5 } })
        });
        if (r.ok) { _model = m; console.info('[Gemini] modèle:', m); return m; }
        if (r.status === 429) {
          const e = await r.json().catch(()=>({}));
          throw new Error(`Quota dépassé (${m}): ${e?.error?.message || '429'}`);
        }
        // 404 = modèle inexistant → essayer suivant
      } catch(e) {
        if (e.message.includes('Quota') || e.message.includes('quota') || e.message.includes('429')) throw e;
      }
    }
    throw new Error('Aucun modèle Gemini disponible avec cette clé.');
  }

  async function callGemini(apiKey, prompt, system) {
    const model = await resolveModel(apiKey);
    // URL SANS paramètre de cache — Gemini rejette tout paramètre inconnu
    const url = `${BASE}/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.15, maxOutputTokens: 512 }
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      const e = await r.json().catch(()=>({}));
      throw new Error(`Gemini (${model}): ${e?.error?.message || `HTTP ${r.status}`}`);
    }
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json\s*/g,'').replace(/```/g,'').trim();
    return JSON.parse(clean);
  }

  // ── Prompt volontairement court et JSON-only ──────────────────────────────
  // On demande: signal, confiance LLM (indépendante du déterministe), 1-2 phrases max.
  // Les données intra-day ne sont PAS incluses (horizon 1-7j, pas besoin).
  function buildPrompt(d, det, minGain) {
    const recentPrices = d.closes?.slice(-5).map(v => v?.toFixed(2)).join('→') || 'N/A';

    return `Analyse technique court-terme (1-7j) pour ${d.symbol} (${d.name}).
Objectif: gain ≥ ${minGain}%. Réponds UNIQUEMENT en JSON, aucun texte autour.

DONNÉES:
Prix: ${d.price?.toFixed(2)} ${d.currency||'USD'} | Variation J: ${d.changePct?.toFixed(2)??'N/A'}%
5 dernières clôtures: ${recentPrices}
RSI(14): ${d.rsi??'N/A'}${d.rsi<30?' [SURVENTE]':d.rsi>70?' [SURACHAT]':''}
MACD histo: ${d.macd?.histogram?.toFixed(3)??'N/A'}${d.macd?.crossover?' ['+d.macd.crossover.toUpperCase()+']':''}
Bollinger position: ${d.bollingerPosition!=null?(d.bollingerPosition*100).toFixed(0)+'%':'N/A'} (0=bas, 100=haut)
SMA20=${d.sma20?.toFixed(2)??'N/A'} SMA50=${d.sma50?.toFixed(2)??'N/A'}
Volume×moy: ${d.volumeRatio?.toFixed(2)??'N/A'}
ATR: ${d.atr&&d.price?((d.atr/d.price)*100).toFixed(2)+'%':'N/A'}
52s: haut=${d.fiftyTwoWeekHigh?.toFixed(2)??'N/A'} (${d.distanceFrom52wHigh?.toFixed(1)??'N/A'}%)
Fear&Greed: ${d.fearGreedScore??'N/A'}/100
Analystes: ${d.analystBuy??0}↑ ${d.analystHold??0}→ ${d.analystSell??0}↓

ANALYSE DÉTERMINISTE PRÉ-CALCULÉE:
Signal: ${det.signal} | BUY rules: ${det.confluence?.buy||0} | SELL rules: ${det.confluence?.sell||0}
Règles: ${det.allTriggeredRules?.map(r=>`${r.signal}:${r.name}`).join(', ')||'aucune'}

JSON demandé (exactement ces champs):
{
  "signal": "BUY"|"SELL"|"HOLD",
  "confidence": <0-100>,
  "summary": "<1-2 phrases max, synthèse du signal>",
  "estimatedGainPct": <number|null>,
  "meetsMinGain": <boolean>,
  "targetSell": <number|null>,
  "stopLoss": <number|null>,
  "trendAssessment": "bullish"|"bearish"|"neutral"|"uncertain"
}
Règles: HOLD si confiance<55. N'émets BUY/SELL que si gain estimé≥${minGain}%.
Si tendance haussière récente + RSI>70 → évalue si momentum plutôt que reversal.`;
  }

  async function analyzeAsset(apiKey, d, det, minGainPct = 2.0) {
    const system = 'Tu es un analyste quantitatif. Réponds UNIQUEMENT en JSON valide, sans aucun texte avant ou après.';
    const result = await callGemini(apiKey, buildPrompt(d, det, minGainPct), system);
    return {
      signal:           ['BUY','SELL','HOLD'].includes(result.signal) ? result.signal : 'HOLD',
      confidence:       Math.max(0, Math.min(100, result.confidence || 0)),
      summary:          result.summary || '',
      estimatedGainPct: result.estimatedGainPct || null,
      meetsMinGain:     result.meetsMinGain || false,
      targetSell:       result.targetSell || null,
      stopLoss:         result.stopLoss   || null,
      trendAssessment:  result.trendAssessment || 'uncertain',
    };
  }

  async function testKey(apiKey) {
    _model = null;
    return await resolveModel(apiKey);
  }

  return { analyzeAsset, testKey };
})();
