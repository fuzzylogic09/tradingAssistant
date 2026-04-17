// rules.js — Règles déterministes d'analyse technique
// Philosophie: peu de signaux, haute précision, confluence obligatoire

const Rules = (() => {

  // ── Règles individuelles ─────────────────────────────────────────────────

  function ruleRSIOversold(data) {
    if (!data.rsi) return null;
    const score = data.rsi < 25 ? 1.0 : data.rsi < 30 ? 0.7 : data.rsi < 35 ? 0.4 : null;
    if (!score) return null;
    return {
      name: 'RSI Survente',
      signal: 'BUY',
      confidence: score,
      detail: `RSI à ${data.rsi.toFixed(1)} (< ${data.rsi < 25 ? '25 – survente extrême' : '30 – survente'})`
    };
  }

  function ruleRSIOverbought(data) {
    if (!data.rsi) return null;
    const score = data.rsi > 75 ? 1.0 : data.rsi > 70 ? 0.7 : data.rsi > 65 ? 0.4 : null;
    if (!score) return null;
    return {
      name: 'RSI Surachat',
      signal: 'SELL',
      confidence: score,
      detail: `RSI à ${data.rsi.toFixed(1)} (> ${data.rsi > 75 ? '75 – surachat extrême' : '70 – surachat'})`
    };
  }

  function ruleBollingerSupport(data) {
    if (!data.bollingerPosition || !data.price) return null;
    if (data.bollingerPosition < 0.1) {
      return {
        name: 'Support Bollinger Inf.',
        signal: 'BUY',
        confidence: 0.8,
        detail: `Prix à ${(data.bollingerPosition * 100).toFixed(1)}% dans les bandes (touche la bande basse)`
      };
    }
    if (data.bollingerPosition < 0.2) {
      return {
        name: 'Proche Bollinger Inf.',
        signal: 'BUY',
        confidence: 0.5,
        detail: `Prix à ${(data.bollingerPosition * 100).toFixed(1)}% dans les bandes (proche bande basse)`
      };
    }
    return null;
  }

  function ruleBollingerResistance(data) {
    if (!data.bollingerPosition || !data.price) return null;
    if (data.bollingerPosition > 0.9) {
      return {
        name: 'Résistance Bollinger Sup.',
        signal: 'SELL',
        confidence: 0.8,
        detail: `Prix à ${(data.bollingerPosition * 100).toFixed(1)}% dans les bandes (touche la bande haute)`
      };
    }
    if (data.bollingerPosition > 0.8) {
      return {
        name: 'Proche Bollinger Sup.',
        signal: 'SELL',
        confidence: 0.5,
        detail: `Prix à ${(data.bollingerPosition * 100).toFixed(1)}% dans les bandes (proche bande haute)`
      };
    }
    return null;
  }

  function ruleMACDCrossover(data) {
    if (!data.macd) return null;
    const { histogram } = data.macd;
    if (histogram > 0 && histogram / Math.abs(data.macd.signal) > 0.05) {
      return {
        name: 'MACD Croisement Haussier',
        signal: 'BUY',
        confidence: 0.6,
        detail: `MACD au-dessus du signal (histogram: ${histogram.toFixed(3)})`
      };
    }
    if (histogram < 0 && Math.abs(histogram) / Math.abs(data.macd.signal) > 0.05) {
      return {
        name: 'MACD Croisement Baissier',
        signal: 'SELL',
        confidence: 0.6,
        detail: `MACD en-dessous du signal (histogram: ${histogram.toFixed(3)})`
      };
    }
    return null;
  }

  function ruleVolumeConfirmation(data) {
    if (!data.volumeRatio) return null;
    if (data.volumeRatio > 1.5 && data.changePct > 0) {
      return {
        name: 'Volume Haussier Confirmé',
        signal: 'BUY',
        confidence: 0.65,
        detail: `Volume ${data.volumeRatio.toFixed(1)}x la moyenne avec hausse du prix`
      };
    }
    if (data.volumeRatio > 1.5 && data.changePct < 0) {
      return {
        name: 'Volume Baissier Confirmé',
        signal: 'SELL',
        confidence: 0.65,
        detail: `Volume ${data.volumeRatio.toFixed(1)}x la moyenne avec baisse du prix`
      };
    }
    return null;
  }

  function ruleSMATrend(data) {
    if (!data.sma20 || !data.sma50 || !data.price) return null;
    if (data.price > data.sma20 && data.sma20 > data.sma50) {
      return {
        name: 'Tendance Haussière (SMA)',
        signal: 'BUY',
        confidence: 0.55,
        detail: `Prix > SMA20 > SMA50 — tendance courte et moyen terme alignées`
      };
    }
    if (data.price < data.sma20 && data.sma20 < data.sma50) {
      return {
        name: 'Tendance Baissière (SMA)',
        signal: 'SELL',
        confidence: 0.55,
        detail: `Prix < SMA20 < SMA50 — tendance courte et moyen terme baissières`
      };
    }
    return null;
  }

  function ruleGapOvernight(data) {
    if (!data.gapPct) return null;
    if (Math.abs(data.gapPct) < 1.5) return null;
    const signal = data.gapPct > 0 ? 'BUY' : 'SELL';
    const confidence = Math.abs(data.gapPct) > 3 ? 0.6 : 0.45;
    return {
      name: `Gap Overnight ${data.gapPct > 0 ? 'Haussier' : 'Baissier'}`,
      signal,
      confidence,
      detail: `Gap de ${data.gapPct.toFixed(2)}% — momentum possible dans la direction du gap`
    };
  }

  function ruleFearGreed(data) {
    if (!data.fearGreedScore) return null;
    if (data.fearGreedScore < 20) {
      return {
        name: 'Peur Extrême (CNN)',
        signal: 'BUY',
        confidence: 0.6,
        detail: `Fear & Greed: ${data.fearGreedScore}/100 — marchés en panique (signal contrarian)`
      };
    }
    if (data.fearGreedScore > 80) {
      return {
        name: 'Avidité Extrême (CNN)',
        signal: 'SELL',
        confidence: 0.6,
        detail: `Fear & Greed: ${data.fearGreedScore}/100 — euphorie (signal contrarian baissier)`
      };
    }
    return null;
  }

  function rule52WeekPosition(data) {
    if (!data.distanceFrom52wHigh) return null;
    if (data.distanceFrom52wHigh < -30) {
      return {
        name: 'Loin des Sommets 52s',
        signal: 'BUY',
        confidence: 0.45,
        detail: `${data.distanceFrom52wHigh.toFixed(1)}% sous le plus haut 52 semaines — potentiel rebond`
      };
    }
    if (data.distanceFrom52wHigh > -3) {
      return {
        name: 'Proche du Sommet 52s',
        signal: 'SELL',
        confidence: 0.4,
        detail: `${data.distanceFrom52wHigh.toFixed(1)}% du plus haut 52 semaines — résistance potentielle`
      };
    }
    return null;
  }

  // ── Moteur de confluence ─────────────────────────────────────────────────
  // Filtre clé: signal seulement si ≥ MIN_CONFLUENCE règles concordent
  const MIN_CONFLUENCE = 2; // Au moins 2 règles dans la même direction

  function analyze(data) {
    const allRules = [
      ruleRSIOversold,
      ruleRSIOverbought,
      ruleBollingerSupport,
      ruleBollingerResistance,
      ruleMACDCrossover,
      ruleVolumeConfirmation,
      ruleSMATrend,
      ruleGapOvernight,
      ruleFearGreed,
      rule52WeekPosition
    ];

    const triggered = allRules
      .map(fn => fn(data))
      .filter(r => r !== null);

    const buyRules = triggered.filter(r => r.signal === 'BUY');
    const sellRules = triggered.filter(r => r.signal === 'SELL');

    // Score de confluence (somme pondérée des confidences)
    const buyScore = buyRules.reduce((sum, r) => sum + r.confidence, 0);
    const sellScore = sellRules.reduce((sum, r) => sum + r.confidence, 0);

    // Seuil de confluence: au moins MIN_CONFLUENCE règles concordantes
    let deterministicSignal = 'HOLD';
    let deterministicConfidence = 0;
    let dominantRules = [];

    if (buyRules.length >= MIN_CONFLUENCE && buyScore > sellScore) {
      deterministicSignal = 'BUY';
      deterministicConfidence = Math.min(buyScore / buyRules.length, 1.0);
      dominantRules = buyRules;
    } else if (sellRules.length >= MIN_CONFLUENCE && sellScore > buyScore) {
      deterministicSignal = 'SELL';
      deterministicConfidence = Math.min(sellScore / sellRules.length, 1.0);
      dominantRules = sellRules;
    }

    // Calcul du gain potentiel estimé (basé sur ATR)
    const estimatedGainPct = data.atr && data.price
      ? (data.atr / data.price) * 100
      : null;

    return {
      signal: deterministicSignal,
      confidence: parseFloat((deterministicConfidence * 100).toFixed(1)),
      dominantRules,
      allTriggeredRules: triggered,
      buyRules,
      sellRules,
      buyScore: parseFloat(buyScore.toFixed(2)),
      sellScore: parseFloat(sellScore.toFixed(2)),
      confluence: {
        buy: buyRules.length,
        sell: sellRules.length,
        required: MIN_CONFLUENCE
      },
      estimatedGainPct: estimatedGainPct ? parseFloat(estimatedGainPct.toFixed(2)) : null,
      meetsMinGain: estimatedGainPct ? estimatedGainPct >= 2.0 : false
    };
  }

  return { analyze };
})();
