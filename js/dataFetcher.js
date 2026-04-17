// dataFetcher.js — Agrégation multi-sources, proxies CORS robustes

const DataFetcher = (() => {

  // ── Proxies CORS (cascade) ────────────────────────────────────────────────
  // Note: allorigins.win a un cert SSL invalide en 2025 — on le saute.
  // corsproxy.io retourne 401 sur Yahoo v10 — on utilise thingproxy + notre fallback direct.
  const PROXY_FNS = [
    url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    url => `https://thingproxy.freeboard.io/fetch/${url}`,
    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];

  async function tryFetch(url, timeoutMs = 7000) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch(e) {
      clearTimeout(tid);
      throw e;
    }
  }

  async function fetchViaProxy(url) {
    // Essayer chaque proxy en cascade
    for (const proxyFn of PROXY_FNS) {
      try {
        const text = await tryFetch(proxyFn(url), 7000);
        // corsproxy.io renvoie directement le corps
        // codetabs renvoie directement le corps
        // vérifier que ce n'est pas une page d'erreur HTML
        if (text.startsWith('<') || text.length < 10) continue;
        return text;
      } catch (_) {
        continue;
      }
    }
    throw new Error(`Tous les proxies ont échoué pour ${new URL(url).hostname}`);
  }

  // Cache-bust uniquement pour Yahoo (jamais pour Gemini)
  function cb(url) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_t=${Date.now()}`;
  }

  // ── Yahoo Finance Chart ───────────────────────────────────────────────────
  async function fetchYahooChart(symbol, range = '3mo', interval = '1d') {
    const url = cb(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`);
    const raw = await fetchViaProxy(url);
    const data = JSON.parse(raw);
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error(`Yahoo Chart: pas de données pour ${symbol}`);

    const timestamps = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const adj = result.indicators?.adjclose?.[0]?.adjclose || [];

    const valid = timestamps
      .map((t, i) => ({ t, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i], a: adj[i] }))
      .filter(d => d.c != null && d.v != null);

    return {
      meta: result.meta || {},
      timestamps: valid.map(d => d.t),
      opens:      valid.map(d => d.o),
      highs:      valid.map(d => d.h),
      lows:       valid.map(d => d.l),
      closes:     valid.map(d => d.c),
      volumes:    valid.map(d => d.v),
      adjCloses:  valid.map(d => d.a ?? d.c),
    };
  }

  // ── Yahoo Finance Quote (prix temps réel via chart 1d/5m) ─────────────────
  async function fetchYahooQuote(symbol) {
    const url = cb(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m&includePrePost=false`);
    const raw = await fetchViaProxy(url);
    const data = JSON.parse(raw);
    const meta = data?.chart?.result?.[0]?.meta || {};
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? 0;
    const price = meta.regularMarketPrice ?? 0;
    return {
      price,
      previousClose: prev,
      change: price - prev,
      changePct: prev ? ((price - prev) / prev) * 100 : 0,
      currency: meta.currency || 'USD',
      marketState: meta.marketState || 'CLOSED',
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow:  meta.fiftyTwoWeekLow,
      volume:    meta.regularMarketVolume,
      avgVolume: meta.averageDailyVolume3Month,
      name: meta.longName || meta.shortName || symbol,
    };
  }

  // ── Yahoo Finance Summary (fondamentaux) ──────────────────────────────────
  async function fetchYahooSummary(symbol) {
    // v10 est souvent bloqué par les proxies — on tente v11 aussi
    const urls = [
      cb(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,defaultKeyStatistics,financialData,recommendationTrend`),
      cb(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,defaultKeyStatistics,financialData,recommendationTrend`),
    ];
    for (const url of urls) {
      try {
        const raw = await fetchViaProxy(url);
        const data = JSON.parse(raw);
        const r  = data?.quoteSummary?.result?.[0] || {};
        const sd = r.summaryDetail || {};
        const ks = r.defaultKeyStatistics || {};
        const fd = r.financialData || {};
        const rt = r.recommendationTrend?.trend?.[0] || {};
        return {
          pe:          sd.trailingPE?.raw,
          forwardPE:   sd.forwardPE?.raw,
          beta:        sd.beta?.raw,
          shortPct:    ks.shortPercentOfFloat?.raw,
          targetMeanPrice: fd.targetMeanPrice?.raw,
          analystBuy:  (rt.strongBuy || 0) + (rt.buy || 0),
          analystHold: rt.hold || 0,
          analystSell: (rt.sell || 0) + (rt.strongSell || 0),
        };
      } catch (_) { continue; }
    }
    console.warn(`fetchYahooSummary: échec pour ${symbol}`);
    return {};
  }

  // ── CNN Fear & Greed ──────────────────────────────────────────────────────
  async function fetchFearGreed() {
    try {
      const url = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
      const raw = await fetchViaProxy(url);
      const data = JSON.parse(raw);
      const fg = data?.fear_and_greed;
      return { score: fg?.score != null ? Math.round(fg.score) : null, rating: fg?.rating || 'N/A' };
    } catch {
      return { score: null, rating: 'N/A' };
    }
  }

  // ── Calculs techniques ────────────────────────────────────────────────────
  function computeRSI(closes, period = 14) {
    if (closes.length < period + 1) return null;
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i-1];
      d > 0 ? avgGain += d : avgLoss -= d;
    }
    avgGain /= period; avgLoss /= period;
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i-1];
      avgGain = (avgGain * (period-1) + Math.max(d,0)) / period;
      avgLoss = (avgLoss * (period-1) + Math.max(-d,0)) / period;
    }
    return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  function computeEMAArr(arr, period) {
    if (arr.length < period) return [];
    const k = 2 / (period + 1);
    let ema = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const out = [ema];
    for (let i = period; i < arr.length; i++) { ema = arr[i]*k + ema*(1-k); out.push(ema); }
    return out;
  }

  function computeMACD(closes) {
    if (closes.length < 35) return null;
    const ema12 = computeEMAArr(closes, 12);
    const ema26 = computeEMAArr(closes, 26);
    const offset = 26 - 12;
    const macdLine = ema26.map((v, i) => ema12[i + offset] - v);
    const signalLine = computeEMAArr(macdLine, 9);
    const last = macdLine.length - 1;
    const lastSig = signalLine.length - 1;
    const macd = macdLine[last], signal = signalLine[lastSig];
    const prevHist = last > 0 ? macdLine[last-1] - (signalLine[lastSig-1]||0) : 0;
    const currHist = macd - signal;
    return { macd, signal, histogram: currHist,
      crossover: prevHist < 0 && currHist > 0 ? 'bullish' : prevHist > 0 && currHist < 0 ? 'bearish' : null };
  }

  function computeBollinger(closes, period = 20, k = 2) {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    const mean = slice.reduce((a,b) => a+b, 0) / period;
    const std = Math.sqrt(slice.reduce((a,b) => a + (b-mean)**2, 0) / period);
    return { upper: mean + k*std, middle: mean, lower: mean - k*std, std, bandwidth: std/mean };
  }

  function computeSMA(closes, period) {
    if (closes.length < period) return null;
    return closes.slice(-period).reduce((a,b) => a+b, 0) / period;
  }

  function computeATR(highs, lows, closes, period = 14) {
    if (closes.length < 2) return null;
    const trs = [];
    for (let i = 1; i < closes.length; i++) {
      trs.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
    }
    if (trs.length < period) return null;
    return trs.slice(-period).reduce((a,b) => a+b, 0) / period;
  }

  function computeVolumeRatio(volumes) {
    if (volumes.length < 21) return null;
    const avg = volumes.slice(-21, -1).reduce((a,b) => a+b, 0) / 20;
    return avg > 0 ? volumes[volumes.length-1] / avg : null;
  }

  // ── Agrégation principale ─────────────────────────────────────────────────
  async function fetchAll(symbol) {
    const timestamp = new Date().toISOString();

    const [chartRes, quoteRes, summaryRes, fgRes] = await Promise.allSettled([
      fetchYahooChart(symbol),
      fetchYahooQuote(symbol),
      fetchYahooSummary(symbol),
      fetchFearGreed(),
    ]);

    const chart   = chartRes.status   === 'fulfilled' ? chartRes.value   : null;
    const quote   = quoteRes.status   === 'fulfilled' ? quoteRes.value   : {};
    const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : {};
    const fg      = fgRes.status      === 'fulfilled' ? fgRes.value      : {};

    const sources = [
      chart   && 'Yahoo Chart',
      quoteRes.status === 'fulfilled'   && 'Yahoo Quote',
      summaryRes.status === 'fulfilled' && 'Yahoo Summary',
      fg.score != null                  && 'CNN F&G',
    ].filter(Boolean);

    if (!chart && !quote.price) {
      throw new Error(`Impossible de récupérer les données pour ${symbol}. Vérifiez le symbole.`);
    }

    const closes  = chart?.closes  || [];
    const highs   = chart?.highs   || [];
    const lows    = chart?.lows    || [];
    const volumes = chart?.volumes || [];

    const rsi         = computeRSI(closes);
    const macd        = computeMACD(closes);
    const bollinger   = computeBollinger(closes);
    const sma20       = computeSMA(closes, 20);
    const sma50       = computeSMA(closes, 50);
    const sma200      = computeSMA(closes, 200);
    const atr         = computeATR(highs, lows, closes);
    const volumeRatio = computeVolumeRatio(volumes);
    const currentPrice = quote.price || (closes.length ? closes[closes.length-1] : null);
    const gapPct = closes.length >= 2
      ? ((closes[closes.length-1] - closes[closes.length-2]) / closes[closes.length-2]) * 100
      : null;
    const bollingerPosition = bollinger && currentPrice && (bollinger.upper !== bollinger.lower)
      ? Math.max(0, Math.min(1, (currentPrice - bollinger.lower) / (bollinger.upper - bollinger.lower)))
      : null;

    return {
      symbol, name: quote.name || symbol, timestamp, sources,
      price: currentPrice, previousClose: quote.previousClose,
      change: quote.change, changePct: quote.changePct,
      marketState: quote.marketState, currency: quote.currency || 'USD',
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh, fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      distanceFrom52wHigh: quote.fiftyTwoWeekHigh && currentPrice
        ? ((currentPrice - quote.fiftyTwoWeekHigh) / quote.fiftyTwoWeekHigh) * 100 : null,
      distanceFrom52wLow: quote.fiftyTwoWeekLow && currentPrice
        ? ((currentPrice - quote.fiftyTwoWeekLow) / quote.fiftyTwoWeekLow) * 100 : null,
      volume: quote.volume, avgVolume: quote.avgVolume, volumeRatio,
      rsi: rsi != null ? parseFloat(rsi.toFixed(2)) : null,
      macd, bollinger, bollingerPosition,
      sma20, sma50, sma200, atr,
      gapPct: gapPct != null ? parseFloat(gapPct.toFixed(3)) : null,
      beta: summary.beta, pe: summary.pe, forwardPE: summary.forwardPE,
      targetMeanPrice: summary.targetMeanPrice, shortPct: summary.shortPct,
      analystBuy: summary.analystBuy, analystHold: summary.analystHold, analystSell: summary.analystSell,
      fearGreedScore: fg.score, fearGreedRating: fg.rating,
      closes: closes.slice(-30), volumes: volumes.slice(-30),
      timestamps: chart?.timestamps?.slice(-30) || [],
    };
  }

  return { fetchAll, computeRSI, computeMACD, computeBollinger, computeSMA, computeATR };
})();
