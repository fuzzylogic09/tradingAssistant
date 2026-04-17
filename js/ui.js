// ui.js — Interface utilisateur complète

const UI = (() => {

  let assetsDB = [];

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(assets) {
    assetsDB = assets;

    document.querySelectorAll('[data-tab]').forEach(btn =>
      btn.addEventListener('click', () => switchTab(btn.dataset.tab))
    );

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

  function updateKeyStatus(state) {
    const el = document.getElementById('key-status');
    if (!el) return;
    const map = {
      missing:  { text: 'Non configurée', cls: 'status-warn' },
      saved:    { text: 'Configurée (session)', cls: 'status-ok' },
      valid:    { text: 'Valide ✓', cls: 'status-ok' },
      invalid:  { text: 'Invalide ✗', cls: 'status-err' },
      testing:  { text: 'Test en cours…', cls: 'status-neutral' },
    };
    const s = map[state] || map.missing;
    el.textContent = s.text;
    el.className = `key-status ${s.cls}`;
  }

  function saveConfig() {
    const key = document.getElementById('input-gemini-key')?.value?.trim();
    const mg  = parseFloat(document.getElementById('input-min-gain')?.value || '2');
    if (key) { Config.setGeminiKey(key); updateKeyStatus('saved'); }
    Config.setMinGainPct(isNaN(mg) ? 2 : mg);
    showToast('Configuration sauvegardée', 'success');
  }

  async function testGeminiKey() {
    const btn = document.getElementById('btn-test-key');
    const key = document.getElementById('input-gemini-key')?.value?.trim();
    if (!key) { showToast('Entrez une clé d\'abord', 'error'); return; }
    btn.textContent = 'Test…'; btn.disabled = true;
    updateKeyStatus('testing');
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'OK' }] }] }) }
      );
      if (resp.ok) {
        updateKeyStatus('valid');
        showToast('Clé Gemini valide ✓', 'success');
      } else {
        const err = await resp.json();
        updateKeyStatus('invalid');
        showToast(`Invalide: ${err?.error?.message || resp.status}`, 'error');
      }
    } catch (e) {
      updateKeyStatus('invalid');
      showToast(`Erreur réseau: ${e.message}`, 'error');
    }
    btn.textContent = 'Tester la clé'; btn.disabled = false;
  }

  // ── Watchlist ─────────────────────────────────────────────────────────────
  function renderWatchlist() {
    const container = document.getElementById('watchlist-items');
    if (!container) return;
    const list = Watchlist.get();
    if (list.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">Watchlist vide.</p>';
      return;
    }
    container.innerHTML = list.map(sym => `
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
      input.value = '';
      renderWatchlist(); renderCards();
      showToast(`${sym} ajouté`, 'success');
    } else {
      showToast(`${sym} déjà dans la watchlist`, 'error');
    }
  }

  function removeFromWatchlist(sym) {
    Watchlist.remove(sym);
    // Supprimer la carte du dashboard
    document.getElementById(`card-${sym}`)?.remove();
    renderWatchlist();
    showToast(`${sym} retiré`, 'success');
  }

  function analyzeOne(sym) {
    switchTab('dashboard');
    setTimeout(() => App.analyzeSymbol(sym), 50);
  }

  // ── Cards Dashboard ───────────────────────────────────────────────────────
  function renderCards() {
    const container = document.getElementById('cards-container');
    if (!container) return;
    const list = Watchlist.get();

    if (list.length === 0) {
      container.innerHTML = '<p class="empty-state">Ajoutez des actifs dans la Watchlist pour commencer.</p>';
      return;
    }

    // Créer les cartes manquantes
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

    // Supprimer les cartes obsolètes
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
      const card2 = document.getElementById(`card-${symbol}`);
      const body = card2?.querySelector('.card-idle-body, .loading-state');
      if (body) {
        body.innerHTML = `<span class="error-msg">⚠ ${message}</span>
          <button class="btn-sm" style="margin-top:8px" onclick="App.analyzeSymbol('${symbol}')">Réessayer</button>`;
      }
    }
  }

  // ── Mini sparkline SVG ────────────────────────────────────────────────────
  function makeSparkline(closes, changePct) {
    if (!closes || closes.length < 2) return '';
    const w = 100, h = 32;
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const pts = closes.map((c, i) => {
      const x = (i / (closes.length - 1)) * w;
      const y = h - ((c - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const color = (changePct ?? 0) >= 0 ? '#00d97e' : '#ff4d6a';
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
  }

  // ── Rendu d'une carte complète ────────────────────────────────────────────
  function renderCard(symbol, result) {
    const { marketData: d, deterministicResult: det, llmResult: llm } = result;

    const finalSignal = llm?.signal || det.signal;
    const finalConf   = llm?.confidence ?? det.confidence ?? 0;
    const meetsGain   = llm?.meetsMinGain || det.meetsMinGain;

    const sigClass = { BUY: 'sig-buy', SELL: 'sig-sell', HOLD: 'sig-hold' }[finalSignal] || 'sig-hold';
    const sigLabel = { BUY: '▲ ACHETER', SELL: '▼ VENDRE', HOLD: '— ATTENDRE' }[finalSignal];

    const cp  = d.changePct ?? 0;
    const cpStr = `${cp >= 0 ? '+' : ''}${cp.toFixed(2)}%`;
    const priceStr = d.price != null ? `$${d.price.toFixed(2)}` : '—';

    const rulesHTML = det.allTriggeredRules?.length > 0
      ? det.allTriggeredRules.map(r => `
          <div class="rule-pill ${r.signal.toLowerCase()}">
            <span>${r.name}</span>
            <span class="pill-conf">${(r.confidence * 100).toFixed(0)}%</span>
          </div>`).join('')
      : '<span class="no-rules">Aucune règle déclenchée — signal HOLD par défaut</span>';

    const gainBadge = meetsGain
      ? `<span class="gain-ok">≥ ${Config.getMinGainPct()}% ✓</span>`
      : `<span class="gain-no">< ${Config.getMinGainPct()}%</span>`;

    const spark = makeSparkline(d.closes, cp);

    // Bloc analystes
    const totalAnalysts = (d.analystBuy || 0) + (d.analystHold || 0) + (d.analystSell || 0);
    const analystHTML = totalAnalysts > 0 ? `
      <div class="analyst-bar">
        <div class="ab-buy"  style="flex:${d.analystBuy}"  title="BUY ${d.analystBuy}"></div>
        <div class="ab-hold" style="flex:${d.analystHold}" title="HOLD ${d.analystHold}"></div>
        <div class="ab-sell" style="flex:${d.analystSell}" title="SELL ${d.analystSell}"></div>
      </div>
      <div class="analyst-labels">
        <span style="color:var(--green)">▲${d.analystBuy}</span>
        <span style="color:var(--text-muted)">—${d.analystHold}</span>
        <span style="color:var(--red)">▼${d.analystSell}</span>
      </div>` : '';

    const llmHTML = llm ? `
      <div class="llm-block">
        <div class="block-title">Gemini — Analyse LLM</div>
        <div class="llm-reasoning">${llm.reasoning || ''}</div>
        ${llm.keyFactors?.length ? `<div class="factors">${llm.keyFactors.map(f => `<div class="factor">✓ ${f}</div>`).join('')}</div>` : ''}
        ${llm.risks?.length ? `<div class="factors">${llm.risks.map(r => `<div class="risk">⚠ ${r}</div>`).join('')}</div>` : ''}
        ${llm.targetPriceBuy || llm.targetPriceSell || llm.stopLoss ? `
          <div class="price-targets">
            ${llm.targetPriceBuy  ? `<span class="pt-buy">Entrée $${llm.targetPriceBuy.toFixed(2)}</span>` : ''}
            ${llm.targetPriceSell ? `<span class="pt-sell">Cible $${llm.targetPriceSell.toFixed(2)}</span>` : ''}
            ${llm.stopLoss        ? `<span class="pt-stop">Stop $${llm.stopLoss.toFixed(2)}</span>` : ''}
          </div>` : ''}
        ${llm.timeHorizon ? `<div class="horizon">Horizon: <strong>${llm.timeHorizon}</strong></div>` : ''}
        ${llm.marketContext ? `<div class="mkt-ctx">${llm.marketContext}</div>` : ''}
      </div>` : `<div class="llm-block muted">Clé Gemini non configurée — seule l'analyse technique est disponible.</div>`;

    const fgColor = d.fearGreedScore == null ? 'var(--text-muted)'
      : d.fearGreedScore < 25 ? 'var(--red)' : d.fearGreedScore < 45 ? 'var(--amber)'
      : d.fearGreedScore > 75 ? 'var(--green)' : 'var(--text-secondary)';

    const card = document.getElementById(`card-${symbol}`);
    if (!card) return;

    card.className = `asset-card ${sigClass}`;
    card.innerHTML = `
      <!-- HEADER -->
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

      <!-- SIGNAL -->
      <div class="signal-row">
        <div class="sig-badge ${sigClass}">${sigLabel}</div>
        <div class="conf-wrap">
          <div class="conf-track">
            <div class="conf-fill ${sigClass}" style="width:${Math.min(finalConf,100)}%"></div>
          </div>
          <span class="conf-val">${finalConf.toFixed(0)}%</span>
        </div>
        ${gainBadge}
      </div>

      <!-- BODY -->
      <div class="card-body">

        <!-- Indicateurs -->
        <div class="inds-grid">
          <div class="ind">
            <span class="ind-l">RSI</span>
            <span class="ind-v ${d.rsi < 30 ? 'v-green' : d.rsi > 70 ? 'v-red' : ''}">
              ${d.rsi?.toFixed(1) ?? '—'}
            </span>
          </div>
          <div class="ind">
            <span class="ind-l">Bollinger</span>
            <span class="ind-v ${d.bollingerPosition < 0.15 ? 'v-green' : d.bollingerPosition > 0.85 ? 'v-red' : ''}">
              ${d.bollingerPosition != null ? `${(d.bollingerPosition*100).toFixed(0)}%` : '—'}
            </span>
          </div>
          <div class="ind">
            <span class="ind-l">Vol ×</span>
            <span class="ind-v ${d.volumeRatio > 1.5 ? 'v-amber' : ''}">
              ${d.volumeRatio?.toFixed(2) ?? '—'}
            </span>
          </div>
          <div class="ind">
            <span class="ind-l">F&G</span>
            <span class="ind-v" style="color:${fgColor}">
              ${d.fearGreedScore ?? '—'}
            </span>
          </div>
          <div class="ind">
            <span class="ind-l">Beta</span>
            <span class="ind-v">${d.beta?.toFixed(2) ?? '—'}</span>
          </div>
          <div class="ind">
            <span class="ind-l">Gap</span>
            <span class="ind-v ${d.gapPct > 0 ? 'v-green' : d.gapPct < 0 ? 'v-red' : ''}">
              ${d.gapPct != null ? `${d.gapPct > 0 ? '+' : ''}${d.gapPct.toFixed(2)}%` : '—'}
            </span>
          </div>
          <div class="ind">
            <span class="ind-l">MACD</span>
            <span class="ind-v ${d.macd?.crossover === 'bullish' ? 'v-green' : d.macd?.crossover === 'bearish' ? 'v-red' : ''}">
              ${d.macd ? (d.macd.crossover ? d.macd.crossover : d.macd.histogram.toFixed(3)) : '—'}
            </span>
          </div>
          <div class="ind">
            <span class="ind-l">SMA20/50</span>
            <span class="ind-v ${d.price > d.sma20 && d.sma20 > d.sma50 ? 'v-green' : d.price < d.sma20 && d.sma20 < d.sma50 ? 'v-red' : ''}">
              ${d.sma20 && d.sma50 ? (d.price > d.sma20 ? '▲' : '▼') : '—'}
            </span>
          </div>
          <div class="ind">
            <span class="ind-l">Short %</span>
            <span class="ind-v">${d.shortPct != null ? `${(d.shortPct*100).toFixed(1)}%` : '—'}</span>
          </div>
        </div>

        <!-- Analystes -->
        ${analystHTML}

        <!-- Règles -->
        <div class="rules-block">
          <div class="block-title">Règles techniques (${det.allTriggeredRules?.length || 0} / confluence ≥ ${det.confluence?.required || 2})</div>
          <div class="rules-pills">${rulesHTML}</div>
          <div class="conf-info">▲ ${det.confluence?.buy || 0} BUY  ▼ ${det.confluence?.sell || 0} SELL</div>
        </div>

        <!-- LLM -->
        ${llmHTML}

      </div>

      <!-- FOOTER -->
      <div class="card-footer">
        <span>${d.sources?.join(' · ') || '—'}</span>
        <span>${new Date(d.timestamp).toLocaleTimeString('fr-FR')}</span>
      </div>`;
  }

  // ── Résumé global (barre en haut du dashboard) ────────────────────────────
  function updateSummary(analyses) {
    const el = document.getElementById('summary-bar');
    if (!el) return;
    const vals = Object.values(analyses);
    if (vals.length === 0) { el.innerHTML = ''; return; }
    const buy  = vals.filter(a => (a.llmResult?.signal || a.deterministicResult?.signal) === 'BUY').length;
    const sell = vals.filter(a => (a.llmResult?.signal || a.deterministicResult?.signal) === 'SELL').length;
    const hold = vals.length - buy - sell;
    el.innerHTML = `
      <span class="sum-item sum-buy">▲ ${buy} BUY</span>
      <span class="sum-item sum-sell">▼ ${sell} SELL</span>
      <span class="sum-item sum-hold">— ${hold} HOLD</span>`;
  }

  // ── Base d'actifs ─────────────────────────────────────────────────────────
  function renderAssetsDB() {
    const container = document.getElementById('assets-grid');
    if (!container) return;
    container.innerHTML = assetsDB.map(a => {
      const inWL = Watchlist.get().includes(a.symbol);
      const dots = '●'.repeat(a.riskLevel) + '○'.repeat(5 - a.riskLevel);
      return `
        <div class="asset-db-card ${a.recommended ? 'rec' : ''}">
          ${a.recommended ? '<span class="rec-badge">Recommandé</span>' : ''}
          <div class="db-sym">${a.symbol}</div>
          <div class="db-name">${a.name}</div>
          <div class="db-cat">${a.category}</div>
          <div class="db-desc">${a.description}</div>
          <div class="db-risk" title="Risque ${a.riskLevel}/5">${dots}</div>
          <button class="btn-sm ${inWL ? 'btn-remove' : 'btn-add'}"
            onclick="UI.toggleDB('${a.symbol}', this)">
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
    showToast(`${sym} ${Watchlist.get().includes(sym) ? 'ajouté' : 'retiré'}`, 'success');
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
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  return {
    init, switchTab, renderCards, renderWatchlist, renderAssetsDB,
    setSymbolStatus, renderCard, setAnalyzingAll, showLastUpdateTime,
    updateSummary, showToast, toggleDB, removeFromWatchlist, analyzeOne
  };
})();
