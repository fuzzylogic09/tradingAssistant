# ETF Advisor — Analyse Court-Terme

Application web PWA d'aide à l'investissement court-terme (1j–1 semaine) basée sur l'analyse technique multi-source et des LLMs (Gemini).

## Déploiement GitHub Pages

1. Fork / clone ce dépôt
2. Allez dans **Settings → Pages → Source**: sélectionnez "GitHub Actions"
3. Pushez sur `main` — le workflow déploie automatiquement
4. Accédez à `https://[votre-username].github.io/[repo-name]/`

## Utilisation

### Configuration (obligatoire)
1. Ouvrez l'onglet **Configuration**
2. Entrez votre clé **Google Gemini** (obtenez-la sur [Google AI Studio](https://aistudio.google.com/app/apikey))
3. Cliquez **Sauvegarder** puis **Tester la clé**

> ⚠ La clé est stockée en `sessionStorage` uniquement — elle disparaît à la fermeture de l'onglet. Elle n'est jamais transmise à GitHub.

### Watchlist
1. Onglet **Actifs** → ajoutez des instruments depuis la base recommandée
2. Ou onglet **Watchlist** → saisissez manuellement un symbole

### Analyse
- Onglet **Dashboard** → **"▶ Analyser tout"** pour analyser toute la watchlist
- Ou **"Analyser"** sur une carte individuelle

## Sources de données

| Source | Données |
|--------|---------|
| Yahoo Finance Chart | Prix OHLCV historiques, calcul indicateurs |
| Yahoo Finance Quote | Prix temps réel, volume, 52s high/low |
| Yahoo Finance Summary | Fondamentaux, consensus analystes |
| CNN Fear & Greed | Sentiment marché global |
| Finviz | Données techniques complémentaires |

## Règles déterministes

| Règle | Signal | Déclencheur |
|-------|--------|-------------|
| RSI Survente | BUY | RSI < 30 |
| RSI Surachat | SELL | RSI > 70 |
| Support Bollinger | BUY | Prix < 10% dans les bandes |
| Résistance Bollinger | SELL | Prix > 90% dans les bandes |
| MACD Crossover | BUY/SELL | Histogramme change de signe |
| Volume Confirmé | BUY/SELL | Volume > 1.5x moyenne + direction |
| Tendance SMA | BUY/SELL | Prix > SMA20 > SMA50 (ou inverse) |
| Gap Overnight | BUY/SELL | Gap > 1.5% |
| Fear & Greed | BUY/SELL | Score < 20 ou > 80 (contrarian) |
| Position 52 semaines | BUY/SELL | Distance extrême des bornes |

**Confluence requise: ≥ 2 règles concordantes** pour déclencher un signal.

## Actifs recommandés (trading court-terme)

| Symbole | Type | Volatilité |
|---------|------|-----------|
| TQQQ | ETF 3x Nasdaq | ★★★★★ |
| SOXL | ETF 3x Semis | ★★★★★ |
| FNGU | ETN 3x FANG+ | ★★★★★ |
| BITO | ETF Bitcoin | ★★★★★ |
| NVDA | Action | ★★★★ |
| TSLA | Action | ★★★★ |
| SPXL | ETF 3x S&P500 | ★★★★ |

## Avertissement

> Cet outil est **expérimental**. Il ne constitue **pas un conseil financier**.
> Les marchés financiers sont imprévisibles. Vous pouvez perdre tout votre capital.
> N'investissez jamais plus que ce que vous pouvez vous permettre de perdre.
