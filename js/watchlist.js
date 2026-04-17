// watchlist.js — Gestion de la watchlist

const Watchlist = (() => {

  function get() {
    return Config.getWatchlist();
  }

  function add(symbol) {
    symbol = symbol.toUpperCase().trim();
    if (!symbol) return false;
    const list = get();
    if (list.includes(symbol)) return false;
    list.push(symbol);
    Config.setWatchlist(list);
    return true;
  }

  function remove(symbol) {
    const list = get().filter(s => s !== symbol);
    Config.setWatchlist(list);
  }

  function reset() {
    Config.setWatchlist(['TQQQ', 'SOXL', 'NVDA', 'TSLA']);
  }

  function addRecommended(symbol) {
    return add(symbol);
  }

  return { get, add, remove, reset, addRecommended };
})();
