// ui.js — Interface utilisateur

const UI = (() => {

  let assetsDB = [];

  // ── Theme ─────────────────────────────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem('etf_theme') || 'light'; // light est le défaut
    applyTheme(saved, false);
  }

  function applyTheme(theme, save = true) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.innerHTML = theme === 'dark'
        ? '<span class="icon">☀️</span> Thème clair'
        : '<span class="icon">🌙</span> Thème sombre';
    }
    if (save) localStorage.setItem('etf_theme', theme);
  }

  function toggleTheme() {
    const current = localStorage.getItem('etf_theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(assets) {
    assetsDB = assets;
    initTheme();

    document.querySelectorAll('[data-tab]').forEach(btn =>
      btn.addEventListener('click', () => switchTab(btn.dataset.tab))
    );
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
    document.getElementById('btn-analyze-all')?.addEventListener('click', () => App.analyzeAll());
    document.getElementById('btn-save-config')?.addEventListener('click', saveConfig);
    document.getElementById('btn-test-key')?.addEventListener('click', testGeminiKey);
    document.getElementById('btn-add-symbol')?.addEventListener('click', addSymbol);
    document.getElementById('input-new-symbol')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') addSymbol();
    });
    document.getElementById('btn-reset-watchlist')?.addEventListener('click', () => {
      Watchlist.reset(); renderWatchlist(); renderCards();
    });
    loadConfigIntoForm();
  }

  function switchTab(tab) {
    document.querySelectorAll('[data-tab]').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.tab === tab)
    );
    document.querySelectorAll('.tab-content').forEach(el =>
      el.classList.toggle('active', el.id === `tab-${tab}`)
    );
    if (tab === 'assets') renderAssetsDB();
    if (tab === 'watchlist') renderWatchlist();
    if (tab === 'dashboard') renderCards();
  }

  // ── Config ────────────────────────────────────────────────────────────────
  function loadConfigIntoForm() {
    const k = Config.getGeminiKey();
    if (k) document.getElementById('input-gemini-key').value = k;
    document.getElementById('input-min-gain').value = Config.getMinGainPct();
    updateKeyStatus(k ? 'saved' : 'missing');
  }

  function updateKeyStatus(state, modelName) {
    const el = document.getElementById('key-status');
    const mi = document.getElementById('model-info');
    if (!el) return;
    const map = {
      missing:  { text: 'Non configurée', cls: 'status-warn' },
      saved:    { text: 'Configurée (session)', cls: 'status-ok' },
      valid:    { text: 'Valide ✓', cls: 'status-ok' },
      invalid:  { text: 'Invalide ✗', cls: 'status-err' },
      testing:  { text: 'Détection modèle…', cls: 'status-neutral' },
    };
    const s = map[state] || map.missing;
    el.textContent = s.text; el.className = `key-status ${s.cls}`;
    if (mi) mi.innerHTML = modelName
      ? `Modèle actif: <strong>${modelName}</strong>`
      : '';
  }

  function saveConfig() {
    const key = document.getElementById('input-gemini-key')?.value?.trim();
    const mg  = parseFloat(document.getElementById('input-min-gain')?.value || '2');
    if (key) { Config.setGeminiKey(key); }
    Config.setMinGainPct(isNaN(mg) ? 2 : mg);
    updateKeyStatus(key ? 'saved' : 'missing');
    showToast('Configuration sauvegardée', 'success');
  }

  async function testGeminiKey() {
    const btn = document.getElementById('btn-test-key');
    const key = document.getElementById('input-gemini-key')?.value?.trim();
    if (!key) { showToast('Entrez une clé d\'abord', 'error'); return; }
    btn.textContent = 'Test…'; btn.disabled = true;
    updateKeyStatus('testing');
    try {
      // Utilise LLMInterface.testKey qui auto-détecte le bon modèle
      const model = await LLMInterface.testKey(key);
      Config.setGeminiKey(key); // Sauvegarder si valide
      updateKeyStatus('valid', model);
      showToast(`Clé valide — modèle: ${model}`, 'success');
    } catch (e) {
      updateKeyStatus('invalid');
      showToast(`Erreur: ${e.message}`, 'error');
    }
    btn.textContent = 'Tester la clé'; btn.disabled = false;
  }

  // ── Watchlist ─────────────────────────────────────────────────────────────
  function renderWatchlist() {
    const c = document.getElementById('watchlist-items');
    if (!c) return;
    const list = Watchlist.get();
    if (!list.length) {
      c.innerHTML = '<p style="color:var(--text-3);font-size:12px;">Watchlist vide. Ajoutez des actifs via l\'onglet "Actifs".</p>';
      return;
    }
    c.innerHTML = list.map(sym => `
      <div class="watchlist-item">
        <span class="wl-symbol">${sym}</span>
        <span class="wl-name">${getAssetName(sym)}</span>
        <div class="wl-actions">
          <button class="btn-sm btn-analyze" onclick="UI.analyzeOne('${sym}')">Analyser</button>
          <button class="btn-sm btn-remove"  onclick="UI.removeFromWatchlist('${sym}')">✕</button>
        </div>
      </div>`).join('');
  }

  function addSymbol() {
    const input = document.getElementById('input-new-symbol');
    const sym = input?.value?.toUpperCase().trim();
    if (!sym) return;
    if (Watchlist.add(sym)) {
      input.value = ''; renderWatchlist(); renderCards();
      showToast(`${sym} ajouté`, 'success');
    } else {
      showToast(`${sym} déjà dans la watchlist`, 'error');
    }
  }

  function removeFromWatchlist(sym) {
    Watchlist.remove(sym);
    document.getElementById(`card-${sym}`)?.remove();
    renderWatchlist();
    showToast(`${sym} retiré`, 'success');
  }

  function analyzeOne(sym) {
    switchTab('dashboard');
    setTimeout(() => App.analyzeSymbol(sym), 50);
  }

  // ── Cards ─────────────────────────────────────────────────────────────────
  function renderCards() {
    const container = document.getElementById('cards-container');
    if (!container) return;
    const list = Watchlist.get();

    if (!list.length) {
      container.innerHTML = '<p class="empty-state">Ajoutez des actifs dans la Watchlist pour commencer.</p>';
      return;
    }
    // Supprimer l'état vide
    container.querySelector('.empty-state')?.remove();

    list.forEach(sym => {
      if (!document.getElementById(`card-${sym}`)) {
        const card = document.createElement('div');
        card.id = `card-${sym}`;
        card.className = 'asset-card card-idle';
        card.innerHTML = `
          <div class="card-header">
            <div class="card-title-row">
              <span class="card-symbol">${sym}</span>
              <span class="card-name">${getAssetName(sym)}</span>
            </div>
          </div>
          <div class="card-idle-body">
            <button class="btn btn-secondary" onclick="App.analyzeSymbol('${sym}')">▶ Analyser</button>
          </div>`;
        container.appendChild(card);
      }
    });

    container.querySelectorAll('.asset-card').forEach(card => {
      const sym = card.id.replace('card-', '');
      if (!list.includes(sym)) card.remove();
    });
  }

  function setSymbolStatus(symbol, status, message = '') {
    let card = document.getElementById(`card-${symbol}`);
    if (!card) { renderCards(); card = document.getElementById(`card-${symbol}`); }
    if (!card) return;

    if (status === 'loading') {
      card.className = 'asset-card card-loading';
      card.innerHTML = `
        <div class="card-header">
          <div class="card-title-row">
            <span class="card-symbol">${symbol}</span>
            <span class="card-name">${getAssetName(symbol)}</span>
          </div>
        </div>
        <div class="card-idle-body loading-state">
          <div class="spinner"></div>
          <span class="loading-msg">${message}</span>
        </div>`;
    } else if (status === 'error') {
      const body = card.querySelector('.card-idle-body, .loading-state');
      if (body) {
        body.className = 'card-idle-body loading-state';
        body.innerHTML = `<span class="error-msg">⚠ ${message}</span>
          <button class="btn-sm" style="margin-top:8px" onclick="App.analyzeSymbol('${symbol}')">Réessayer</button>`;
      }
    }
  }

  // ── Mini sparkline ────────────────────────────────────────────────────────
  function makeSparkline(closes, changePct) {
    if (!closes || closes.length < 2) return '';
    const w = 80, h = 28;
    const min = Math.min(...closes), max = Math.max(...closes);
    const range = max - min || 1;
    const pts = closes.map((c, i) => {
      const x = (i / (closes.length - 1)) * w;
      const y = h - ((c - min) / range) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const upColor   = isDark ? '#00d97e' : '#00a65a';
    const downColor = isDark ? '#ff4d6a' : '#d9314a';
    const color = (changePct ?? 0) >= 0 ? upColor : downColor;
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  // ── Rendu carte complète ──────────────────────────────────────────────────
  function renderCard(symbol, result) {
    const { marketData: d, deterministicResult: det, llmResult: llm } = result;

    const finalSignal = llm?.signal || det.signal;
    const finalConf   = llm?.confidence ?? det.confidence ?? 0;
    const meetsGain   = llm?.meetsMinGain || det.meetsMinGain;
    const trend       = llm?.trendAssessment || 'uncertain';

    const sigClass = { BUY: 'sig-buy', SELL: 'sig-sell', HOLD: 'sig-hold' }[finalSignal] || 'sig-hold';
    const sigLabel = { BUY: '▲ ACHETER', SELL: '▼ VENDRE', HOLD: '— ATTENDRE' }[finalSignal];

    const cp = d.changePct ?? 0;
    const cpStr = `${cp >= 0 ? '+' : ''}${cp.toFixed(2)}%`;
    const priceStr = d.price != null ? `$${d.price.toFixed(2)}` : '—';
    const spark = makeSparkline(d.closes, cp);

    // Niveau de confiance: description textuelle
    const confText = finalConf >= 75 ? 'Élevée' : finalConf >= 55 ? 'Modérée' : finalConf >= 35 ? 'Faible' : 'Très faible';

    const rulesHTML = det.allTriggeredRules?.length > 0
      ? det.allTriggeredRules.map(r => `
          <div class="rule-pill ${r.signal.toLowerCase()}">
            <span>${r.name}</span>
            <span class="pill-conf">${(r.confidence*100).toFixed(0)}%</span>
          </div>`).join('')
      : '<span class="no-rules">Aucune règle — HOLD par défaut</span>';

    const gainBadge = meetsGain
      ? `<span class="gain-ok">≥ ${Config.getMinGainPct()}% ✓</span>`
      : `<span class="gain-no">< ${Config.getMinGainPct()}%</span>`;

    const trendClass = trend === 'bullish' ? 'trend-bullish' : trend === 'bearish' ? 'trend-bearish' : '';
    const trendLabel = { bullish: '↗ Haussier', bearish: '↘ Baissier', neutral: '→ Neutre', uncertain: '? Incertain' }[trend] || '?';

    const totalAn = (d.analystBuy||0)+(d.analystHold||0)+(d.analystSell||0);
    const analystHTML = totalAn > 0 ? `
      <div class="analyst-bar">
        <div class="ab-buy"  style="flex:${d.analystBuy||0}" ></div>
        <div class="ab-hold" style="flex:${d.analystHold||0}"></div>
        <div class="ab-sell" style="flex:${d.analystSell||0}"></div>
      </div>
      <div class="analyst-labels">
        <span style="color:var(--green)">▲ ${d.analystBuy||0} BUY</span>
        <span style="color:var(--text-3)">— ${d.analystHold||0} HOLD</span>
        <span style="color:var(--red)">▼ ${d.analystSell||0} SELL</span>
      </div>` : '';

    // Confiance Gemini indépendante (si disponible)
    const llmConfBadge = llm
      ? `<span class="llm-conf-badge ${sigClass}" title="Confiance Gemini">G: ${llm.confidence}%</span>`
      : '';

    const llmHTML = llm ? `
      <div class="llm-block">
        <div class="block-title-row">
          <span class="block-title">Gemini — Analyse LLM</span>
          <span class="llm-conf-inline ${sigClass}">${llm.confidence}% confiance</span>
        </div>
        <div class="llm-summary">${llm.summary || ''}</div>
        ${(llm.targetSell || llm.stopLoss) ? `
          <div class="price-targets">
            ${llm.targetSell ? `<span class="pt-sell">Objectif $${Number(llm.targetSell).toFixed(2)}</span>` : ''}
            ${llm.stopLoss   ? `<span class="pt-stop">Stop $${Number(llm.stopLoss).toFixed(2)}</span>` : ''}
          </div>` : ''}
      </div>` : `<div class="llm-block muted"><div class="block-title">Gemini</div><span style="font-size:11px;color:var(--text-3)">Clé Gemini non configurée — analyse technique seule.</span></div>`;

    const fgColor = d.fearGreedScore == null ? 'var(--text-3)'
      : d.fearGreedScore < 25 ? 'var(--red)' : d.fearGreedScore < 45 ? 'var(--amber)'
      : d.fearGreedScore > 75 ? 'var(--green)' : 'var(--text-2)';

    const card = document.getElementById(`card-${symbol}`);
    if (!card) return;

    card.className = `asset-card ${sigClass}`;
    card.innerHTML = `
      <div class="card-header">
        <div class="card-title-row">
          <span class="card-symbol">${symbol}</span>
          <span class="card-name">${d.name}</span>
          <button class="btn-sm refresh-btn" onclick="App.analyzeSymbol('${symbol}')" title="Rafraîchir">↻</button>
        </div>
        <div class="card-price-row">
          <span class="card-price">${priceStr}</span>
          <span class="card-chg ${cp >= 0 ? 'pos' : 'neg'}">${cpStr}</span>
          <span class="market-state">${d.marketState || ''}</span>
          <div class="sparkline">${spark}</div>
        </div>
      </div>

      <!-- ═══ SIGNAL + SCORE DE CONFIANCE ═══ -->
      <div class="signal-block ${sigClass}">
        <div class="signal-main-row">
          <div class="sig-badge">${sigLabel}</div>

          <!-- Score technique -->
          <div class="confidence-score">
            <span class="conf-number">${det.confidence?.toFixed(0) ?? finalConf.toFixed(0)}</span>
            <span class="conf-label">Tech %</span>
          </div>

          <!-- Score Gemini (si disponible) -->
          ${llm ? `<div class="confidence-score llm-score">
            <span class="conf-number">${llm.confidence.toFixed(0)}</span>
            <span class="conf-label">Gemini %</span>
          </div>` : ''}

          <div class="conf-bar-row">
            <div class="conf-track">
              <div class="conf-fill" style="width:${Math.min(finalConf,100)}%"></div>
            </div>
            <div class="conf-meta">
              <span>${confText}</span>
              <span>${llm ? 'Tech + LLM' : 'Tech seule'}</span>
            </div>
          </div>
        </div>
        <div class="signal-badges-row">
          ${gainBadge}
          <span class="trend-badge ${trendClass}">${trendLabel}</span>
        </div>
      </div>

      <div class="card-body">
        <!-- Indicateurs -->
        <div class="inds-grid">
          <div class="ind"><span class="ind-l">RSI</span>
            <span class="ind-v ${d.rsi != null && d.rsi < 30 ? 'v-green' : d.rsi > 70 ? 'v-red' : ''}">${d.rsi?.toFixed(1) ?? '—'}</span></div>
          <div class="ind"><span class="ind-l">Bollinger %</span>
            <span class="ind-v ${d.bollingerPosition < 0.15 ? 'v-green' : d.bollingerPosition > 0.85 ? 'v-red' : ''}">${d.bollingerPosition != null ? `${(d.bollingerPosition*100).toFixed(0)}%` : '—'}</span></div>
          <div class="ind"><span class="ind-l">Vol ×</span>
            <span class="ind-v ${d.volumeRatio > 1.5 ? 'v-amber' : ''}">${d.volumeRatio?.toFixed(2) ?? '—'}</span></div>
          <div class="ind"><span class="ind-l">F&amp;G</span>
            <span class="ind-v" style="color:${fgColor}">${d.fearGreedScore ?? '—'}</span></div>
          <div class="ind"><span class="ind-l">Beta</span>
            <span class="ind-v">${d.beta?.toFixed(2) ?? '—'}</span></div>
          <div class="ind"><span class="ind-l">Gap</span>
            <span class="ind-v ${d.gapPct > 0 ? 'v-green' : d.gapPct < 0 ? 'v-red' : ''}">${d.gapPct != null ? `${d.gapPct > 0 ? '+' : ''}${d.gapPct.toFixed(2)}%` : '—'}</span></div>
          <div class="ind"><span class="ind-l">MACD</span>
            <span class="ind-v ${d.macd?.crossover === 'bullish' ? 'v-green' : d.macd?.crossover === 'bearish' ? 'v-red' : ''}">${d.macd?.crossover ? d.macd.crossover : d.macd?.histogram?.toFixed(3) ?? '—'}</span></div>
          <div class="ind"><span class="ind-l">SMA20/50</span>
            <span class="ind-v ${d.price > d.sma20 && d.sma20 > d.sma50 ? 'v-green' : d.price < d.sma20 && d.sma20 < d.sma50 ? 'v-red' : ''}">${d.sma20 && d.sma50 ? (d.price > d.sma20 ? '▲ haussier' : '▼ baissier') : '—'}</span></div>
          <div class="ind"><span class="ind-l">ATR</span>
            <span class="ind-v">${d.atr && d.price ? `${((d.atr/d.price)*100).toFixed(2)}%` : '—'}</span></div>
        </div>

        ${analystHTML}

        <div class="rules-block">
          <div class="block-title">Règles techniques — ${det.allTriggeredRules?.length || 0} déclenchées (confluence ≥ ${det.confluence?.required || 2})</div>
          <div class="rules-pills">${rulesHTML}</div>
          <div class="conf-info">▲ ${det.confluence?.buy||0} BUY  ▼ ${det.confluence?.sell||0} SELL  (scores: BUY ${det.buyScore||0} / SELL ${det.sellScore||0})</div>
        </div>

        ${llmHTML}
      </div>

      <div class="card-footer">
        <span>${d.sources?.join(' · ') || '—'}</span>
        <span>${new Date(d.timestamp).toLocaleTimeString('fr-FR')}</span>
      </div>`;
  }

  // ── Summary bar ───────────────────────────────────────────────────────────
  function updateSummary(analyses) {
    const el = document.getElementById('summary-bar');
    if (!el) return;
    const vals = Object.values(analyses);
    if (!vals.length) { el.innerHTML = ''; return; }
    const getSignal = a => a.llmResult?.signal || a.deterministicResult?.signal || 'HOLD';
    const buy  = vals.filter(a => getSignal(a) === 'BUY').length;
    const sell = vals.filter(a => getSignal(a) === 'SELL').length;
    const hold = vals.length - buy - sell;
    const avgConf = Math.round(vals.reduce((s,a) => s + (a.llmResult?.confidence ?? a.deterministicResult?.confidence ?? 0), 0) / vals.length);
    el.innerHTML = `
      <span class="sum-item sum-buy">▲ ${buy} ACHAT</span>
      <span class="sum-item sum-sell">▼ ${sell} VENTE</span>
      <span class="sum-item sum-hold">— ${hold} ATTENDRE</span>
      <span class="sum-sep">·</span>
      <span class="sum-item" style="background:var(--blue-bg);color:var(--blue);border:1px solid var(--blue-bd)">Confiance moy. ${avgConf}%</span>`;
  }

  // ── Assets DB ─────────────────────────────────────────────────────────────
  function renderAssetsDB() {
    const c = document.getElementById('assets-grid');
    if (!c) return;
    c.innerHTML = assetsDB.map(a => {
      const inWL = Watchlist.get().includes(a.symbol);
      return `
        <div class="asset-db-card ${a.recommended ? 'rec' : ''}">
          ${a.recommended ? '<span class="rec-badge">Recommandé</span>' : ''}
          <div class="db-sym">${a.symbol}</div>
          <div class="db-name">${a.name}</div>
          <div class="db-cat">${a.category}</div>
          <div class="db-desc">${a.description}</div>
          <div class="db-risk" title="Risque ${a.riskLevel}/5">${'●'.repeat(a.riskLevel)}${'○'.repeat(5-a.riskLevel)}</div>
          <button class="btn-sm ${inWL ? 'btn-remove' : 'btn-add'}" onclick="UI.toggleDB('${a.symbol}',this)">
            ${inWL ? '✕ Retirer' : '+ Watchlist'}
          </button>
        </div>`;
    }).join('');
  }

  function toggleDB(sym, btn) {
    if (Watchlist.get().includes(sym)) {
      Watchlist.remove(sym);
      document.getElementById(`card-${sym}`)?.remove();
      btn.textContent = '+ Watchlist'; btn.className = 'btn-sm btn-add';
    } else {
      Watchlist.add(sym);
      btn.textContent = '✕ Retirer'; btn.className = 'btn-sm btn-remove';
    }
    renderWatchlist();
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────
  function getAssetName(sym) {
    return assetsDB.find(a => a.symbol === sym)?.name || sym;
  }

  function setAnalyzingAll(active) {
    const btn = document.getElementById('btn-analyze-all');
    if (btn) { btn.disabled = active; btn.textContent = active ? '⏳ En cours…' : '▶ Analyser tout'; }
  }

  function showLastUpdateTime() {
    const el = document.getElementById('last-update');
    if (el) el.textContent = `Mis à jour ${new Date().toLocaleTimeString('fr-FR')}`;
  }

  function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  return {
    init, switchTab, renderCards, renderWatchlist, renderAssetsDB,
    setSymbolStatus, renderCard, setAnalyzingAll, showLastUpdateTime,
    updateSummary, showToast, toggleDB, removeFromWatchlist, analyzeOne
  };
})();
