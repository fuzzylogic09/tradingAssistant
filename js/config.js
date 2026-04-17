// config.js — Gestion des clés API (session uniquement, jamais sur GitHub)
const Config = (() => {
  const SESSION_KEY = 'etfadvisor_session';

  function load() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function save(data) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  return {
    get(key) {
      return load()[key] || '';
    },
    set(key, value) {
      const d = load();
      d[key] = value;
      save(d);
    },
    getGeminiKey() {
      return this.get('gemini_api_key');
    },
    setGeminiKey(k) {
      this.set('gemini_api_key', k);
    },
    hasGeminiKey() {
      return !!this.getGeminiKey();
    },
    getLLMProvider() {
      return this.get('llm_provider') || 'gemini';
    },
    setLLMProvider(p) {
      this.set('llm_provider', p);
    },
    getMinGainPct() {
      return parseFloat(this.get('min_gain_pct') || '2.0');
    },
    setMinGainPct(v) {
      this.set('min_gain_pct', v.toString());
    },
    getWatchlist() {
      try {
        return JSON.parse(this.get('watchlist') || '["TQQQ","SOXL","NVDA","TSLA"]');
      } catch {
        return ['TQQQ', 'SOXL', 'NVDA', 'TSLA'];
      }
    },
    setWatchlist(arr) {
      this.set('watchlist', JSON.stringify(arr));
    }
  };
})();
