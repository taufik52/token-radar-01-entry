# Token Radar — pre-token protocols ranked by implied launch value

Entry for make.fun's **"Build the best token launch radar"**
(`token-radar-01`) bounty.

A program (`main.ts`, Node 22, standard library only) reads the sealed
DefiLlama snapshot, scores every rankable pre-token protocol with the
**radar-2** model, and writes a ranked board, a static dashboard, three
screenshots and a dossier.

## The model (radar-2)

```
implied = TVL × 0.30 × growth × maturity × chains
```

- **growth**: the 7-day TVL change clamped to [-50%, +150%], weighted 0.70.
- **maturity**: 0.5 → 1.0 over 2 years of listing age (unknown age = 365 days).
- **chains**: +0.03 per chain, up to 5 chains.
- **not ranked**: wrapped / staked / bridged products (Bridge, Canonical
  Bridge, Liquid Staking, Liquid Restaking, Restaked BTC) are never ranked —
  their token already trades in another form. They are listed, with the
  reason, in the dashboard's "Not ranked" section instead of topping the
  board (WBTC and Binance staked ETH would otherwise sit at #1–#3 on TVL
  alone).

The board ranks **every** rankable pre-token protocol (all 40 watchlist
protocols plus every other rankable one below the floor), never a top-N cut.
Live-token protocols are never ranked; they appear in the dashboard's live
set at the market's own values.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Outputs: `board.json`, `data.js`, `dashboard/`, `screenshots/`,
`dossier.json`. Two runs on the same snapshot write identical bytes.

## Dashboard

`dashboard/` is a static page (no network, no framework): a sortable,
filterable board, a detail view for every protocol with the model's step by
step arithmetic and a six-step farm plan, the live-token comparison set, a
"Not ranked" list of wrapped / staked / bridged products with their reasons,
and a model sandbox that re-ranks the top 10 in the browser.

Deep links: `#detail=<slug>` opens a protocol; `#cat=<category>&watch=1`
filters the board.

## Files

- `main.ts` — the program (entrypoint).
- `lib/model.ts` — the radar-2 model, farm plans, board validation.
- `vendor/makefun-board.ts` — the kit's dossier library, as shipped.
- `dashboard/` — `index.html`, `app.css`, `app.js`.
- `screenshots/` — board, detail view, filtered view.

## License

MIT — see `LICENSE`.
