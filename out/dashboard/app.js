// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, filters, a per-protocol detail view with
// the model's own inputs and the protocol's farm plan, the live-token comparison
// set, and a sandbox that re-runs the model in the browser. No network: every
// byte it shows is in data.js.
//
// Deep links, for the screenshots and for sharing a view:
//   #detail=<slug>            open a protocol's detail view
//   #cat=<category>&watch=1  filter the board (watch=1 keeps the watchlist only)
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var rows = DATA.rows || [];
  var live = DATA.live || [];
  var model = DATA.model;

  var $ = function (id) { return document.getElementById(id); };
  var app = $('app');
  app.setAttribute('aria-busy', 'false');

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- header, KPIs, method -------------------------------------------------
  var top = rows[0];
  $('meta').textContent = 'Snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · floor $' +
    (DATA.floor_usd / 1e6).toFixed(0) + 'M TVL';
  $('modelBadge').textContent = 'Model ' + DATA.model_version + ' · TVL × ' + model.base_multiple;
  var watchRows = rows.filter(function (r) { return r.on_watchlist; });
  var excluded = DATA.excluded || [];
  $('kpis').innerHTML =
    kpi(fmtUsd(top ? top.implied_value_usd : 0), 'Top implied value' + (top ? ' — ' + esc(top.name) : '')) +
    kpi(String(DATA.board_size), 'Protocols ranked · ' + watchRows.length + ' on the watchlist') +
    kpi(String(excluded.length), 'Not ranked: wrapped / staked / bridged products') +
    kpi(fmtUsd(median(rows.map(function (r) { return r.implied_value_usd; }))), 'Median implied value');
  function kpi(n, l) {
    return '<div class="kpi"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>';
  }
  function median(xs) {
    if (!xs.length) return 0;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    return s[Math.floor(s.length / 2)];
  }
  $('method').innerHTML =
    '<p><strong>Formula.</strong> <code>implied = TVL × ' + model.base_multiple + ' × growth × maturity × chains</code>, ' +
    'where growth clamps the 7-day TVL change to [' + model.growth_floor + '%, ' + model.growth_cap + '%] and weights it ' +
    model.growth_weight + '; maturity runs 0.5 → 1.0 over ' + (model.maturity_days / 365).toFixed(1) + ' years of listing age ' +
    '(unknown age counts as ' + model.unknown_age_days + ' days); and chains add ' + model.chain_step + ' each up to ' +
    model.chain_cap + ' chains. Wrapped / staked / bridged products are not ranked at all: their token already ' +
    'trades in another form, so no discount can make them launch candidates — they are listed, with the reason, ' +
    'in the “Not ranked” section instead.</p>' +
    '<p><strong>Coverage.</strong> The board ranks every protocol on the snapshot watchlist (' + DATA.watchlist_size +
    ') plus every other rankable pre-token protocol below the floor (' + DATA.early_size +
    ' early rows). Rankable means: the record carries no token (no market cap, no CoinGecko id, no symbol), ' +
    'not a CEX, and not a versioned pool. Live-token protocols are never ranked — they sit in the live set below.</p>' +
    '<p><strong>Farm plans.</strong> Each row carries six steps derived from its own record — category decides the ' +
    'action, TVL decides the capital ($50–$300), age decides the hold (30–90 days) — with a cost and a time on ' +
    'every step. The page regenerates them from the same derivation main.ts writes to board.json.</p>' +
    '<p><strong>Limits.</strong> Implied value is the entry\u2019s own claim from the snapshot\u2019s figures, never ' +
    'make.fun\u2019s. A protocol that “records no token” may still have one its DefiLlama record does not carry. ' +
    'Nothing here predicts whether or when a token launches, and no step is financial advice.</p>';
  $('foot').textContent = 'Token Radar · model ' + DATA.model_version + ' · snapshot ' + DATA.as_of +
    ' · source: DefiLlama (api.llama.fi/protocols) · board.json carries ' + DATA.board_size + ' rows.';

  // ---- filters ---------------------------------------------------------------
  var state = { q: '', category: 'all', chain: 'all', minTvl: 50000000, watchOnly: false, sort: 'rank', selected: null };
  var cats = unique(rows.map(function (r) { return r.category || 'Uncategorised'; })).sort();
  var chains = unique(rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, [])).sort();
  fillSelect($('cat'), ['all'].concat(cats), 'All categories');
  fillSelect($('chain'), ['all'].concat(chains), 'All chains');
  function fillSelect(sel, values, allLabel) {
    sel.innerHTML = values.map(function (v, i) {
      return '<option value="' + esc(v) + '"' + (i === 0 ? ' selected' : '') + '>' + (i === 0 ? allLabel : esc(v)) + '</option>';
    }).join('');
  }
  function unique(xs) { return xs.filter(function (v, i, a) { return a.indexOf(v) === i; }); }

  $('q').addEventListener('input', function () { state.q = $('q').value.trim().toLowerCase(); renderBoard(); });
  $('cat').addEventListener('change', function () { state.category = $('cat').value; renderBoard(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; renderBoard(); });
  $('minTvl').addEventListener('change', function () { state.minTvl = Number($('minTvl').value); renderBoard(); });
  $('watchOnly').addEventListener('change', function () { state.watchOnly = $('watchOnly').checked; renderBoard(); });
  $('sort').addEventListener('change', function () { state.sort = $('sort').value; renderBoard(); });
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      state.sort = key === 'rank' ? 'rank' : key === 'implied' ? 'rank' : key;
      $('sort').value = state.sort === 'rank' ? 'rank' : state.sort;
      renderBoard();
    });
  });

  function filtered() {
    var list = rows.filter(function (r) {
      if (state.q && (r.name.toLowerCase().indexOf(state.q) < 0 && r.slug.toLowerCase().indexOf(state.q) < 0)) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.watchOnly && !r.on_watchlist) return false;
      return true;
    });
    var key = state.sort;
    var cmp = {
      rank: function (a, b) { return a.rank - b.rank; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
      name: function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; },
    }[key] || (function (a, b) { return a.rank - b.rank; });
    return list.slice().sort(cmp);
  }

  function renderBoard() {
    var list = filtered();
    $('count').textContent = list.length + ' of ' + rows.length + ' rows shown';
    $('shownNote').textContent = 'Showing ' + list.length + ' rows.';
    $('rows').innerHTML = list.map(function (r) {
      var g = r.change_7d;
      var cls = g === null ? '' : g >= 0 ? 'pos' : 'neg';
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td><span class="nm">' + esc(r.name) + '</span><br><span class="sl">' + esc(r.slug) + '</span>' +
        (r.on_watchlist ? '<span class="badge wl">WATCHLIST</span>' : '') +
        (r.discounted ? '<span class="badge dc">½ DISCOUNT</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc((r.chains || []).slice(0, 3).join(', ') || '—') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls + '">' + fmtPct(g) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><strong>' + fmtUsd(r.implied_value_usd) + '</strong></td></tr>';
    }).join('');
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  // ---- farm plan (the same derivation main.ts writes to board.json) ----------
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 300;
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' (' + chain + ') and leave the loan open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + '\u2019s deepest pool on ' + chain + ' and leave it in range.';
    if (c.indexOf('bridge') >= 0) return 'Move $' + capital + ' of USDC across ' + name + ' to ' + chain + ', then put the bridged funds to work in its app.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + capital + ' through ' + name + ' on ' + chain + ' and hold the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Post $' + capital + ' of USDC as margin on ' + name + ' and open a single small hedged trade.';
    if (c.indexOf('yield') >= 0 || c.indexOf('aggregator') >= 0) return 'Deposit $' + capital + ' into ' + name + '\u2019s highest-yield vault on ' + chain + ' and let it compound.';
    if (c.indexOf('rwa') >= 0) return 'Buy $' + capital + ' of the yield-bearing asset ' + name + ' issues on ' + chain + ' and hold it.';
    if (c.indexOf('stable') >= 0) return 'Mint $' + capital + ' of the stable asset on ' + name + ' (' + chain + ') and keep it minted.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital') >= 0) return 'Allocate $' + capital + ' to a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('prediction') >= 0) return 'Back one outcome with $' + capital + ' on ' + name + ' and keep the position until it resolves.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover on ' + name + ' (' + chain + ') and keep the policy live.';
    if (c.indexOf('launchpad') >= 0) return 'Commit $' + capital + ' to the next launch on ' + name + ' and hold the allocation.';
    return 'Put $' + capital + ' of USDC to work in ' + name + ' on ' + chain + ' and keep the position live.';
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 200 ? 10 : 5;
    return [
      'Open a fresh wallet for this farm only, fund it with $' + (capital + 20) + ', and store its seed phrase offline where nobody else can read it. Cost: about $3 of gas to fund it. Time: 10 minutes.',
      actionFor(p, capital, chain) + ' Cost: $' + capital + ' of capital plus about $' + gas + ' of gas. Time: 20 minutes to set up.',
      'Do one real action on the protocol every week — a deposit, a swap, a borrow or a vote — so the wallet reads as a user, not a single deposit. Cost: about $2 of gas a week. Time: 10 minutes a week.',
      'Leave the position untouched for at least ' + hold + ' days, so it is counted in several snapshots instead of one. Cost: the $' + capital + ' stays locked in the position. Time: ' + hold + ' days.',
      'When a claim opens, go to the protocol\u2019s own site or its official announcement and claim only from the link it publishes; never pay anyone to claim for you. Cost: no fee to check, and a claim never asks for payment. Time: 10 minutes.',
      'Log the wallet address, the dates and every transaction hash, so you can repeat the farm or unwind it without guessing. Cost: nothing but the log. Time: 5 minutes.',
    ];
  }

  // ---- detail view ------------------------------------------------------------
  function openDetail(slug) {
    var r = rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    state.selected = slug;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, r.change_7d === null ? 0 : r.change_7d));
    var age = r.age_days === null ? model.unknown_age_days : r.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = 1 + Math.min((r.chains || []).length, model.chain_cap) * model.chain_step;
    var base = r.tvl_usd * model.base_multiple;
    $('detailTitle').textContent = '#' + r.rank + ' — ' + r.name;
    $('detailBody').innerHTML =
      '<div class="detail-grid"><div><h3>Facts</h3><table class="facts"><tbody>' +
      fact('Implied value', '<strong>' + fmtUsd(r.implied_value_usd) + '</strong>') +
      fact('TVL', fmtUsd(r.tvl_usd)) +
      fact('7-day TVL change', fmtPct(r.change_7d)) +
      fact('Category', esc(r.category || '—')) +
      fact('Chains', esc((r.chains || []).join(', ') || '—')) +
      fact('Listed', esc(r.listed_at || 'unknown') + ' (' + fmtAge(r.age_days) + ')') +
      fact('Token status', 'Records no token' + (r.on_watchlist ? ' · on the watchlist' : ' · below the watchlist floor')) +
      '</tbody></table></div>' +
      '<div><h3>The model, step by step</h3><div class="math">' +
      'base      = ' + fmtUsd(r.tvl_usd) + ' × ' + model.base_multiple + ' = ' + fmtUsd(base) + '\n' +
      'growth    = ' + fmtPct(growth) + ' → ×' + r.growth_multiplier.toFixed(4) + '\n' +
      'maturity  = ' + age + 'd → ×' + r.maturity_multiplier.toFixed(4) + '\n' +
      'chains    = ' + (r.chains || []).length + ' → ×' + r.chain_multiplier.toFixed(4) + '\n' +
      'discount  = ×' + r.derivative_discount + '\n' +
      'implied   = ' + fmtUsd(r.implied_value_usd) +
      '</div></div></div>' +
      '<h3 style="margin-top:18px">How to farm it</h3><ol class="farm">' +
      farmSteps(r).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="why">Why this rank: ' + esc(r.name) + ' sits at #' + r.rank + ' because its TVL of ' + fmtUsd(r.tvl_usd) +
      ' times the base multiple, adjusted for ' + fmtPct(r.change_7d) + ' 7-day growth and ' + fmtAge(r.age_days) +
      ' of listing age, beats the ' + (rows.length - r.rank) + ' protocols below it. ' +
      'The plan above costs about $' + (capitalFor(r) + 20) + ' to start and runs for at least ' + holdDaysFor(r.age_days) + ' days.</p>';
    $('detail').hidden = false;
    renderBoard();
    $('detail').scrollIntoView({ behavior: 'auto', block: 'start' });
    function fact(k, v) { return '<tr><td>' + k + '</td><td>' + v + '</td></tr>'; }
  }
  $('detailClose').addEventListener('click', function () {
    $('detail').hidden = true;
    state.selected = null;
    renderBoard();
  });

  // ---- live set ----------------------------------------------------------------
  $('liveRows').innerHTML = live.map(function (p) {
    var ratio = p.tvl_usd > 0 && p.mcap_usd !== null ? (p.mcap_usd / p.tvl_usd) : null;
    return '<tr><td><span class="nm">' + esc(p.name) + '</span><br><span class="sl">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + fmtUsd(p.tvl_usd) + '</td>' +
      '<td class="num">' + fmtUsd(p.mcap_usd) + '</td>' +
      '<td class="num">' + (ratio === null ? 'n/a' : ratio.toFixed(2) + '×') + '</td>' +
      '<td class="num ' + (p.change_7d !== null && p.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(p.change_7d) + '</td></tr>';
  }).join('');

  // ---- not ranked ---------------------------------------------------------------
  $('excludedRows').innerHTML = excluded.map(function (p) {
    return '<tr><td><span class="nm">' + esc(p.name) + '</span><br><span class="sl">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + fmtUsd(p.tvl_usd) + '</td>' +
      '<td>' + esc(p.reason) + '</td></tr>';
  }).join('');

  // ---- sandbox ------------------------------------------------------------------
  function recompute() {
    var base = Number($('sBase').value);
    var gw = Number($('sGrowth').value);
    var matY = Number($('sMat').value);
    var cs = Number($('sChain').value);
    $('vBase').textContent = base.toFixed(2);
    $('vGrowth').textContent = gw.toFixed(2);
    $('vMat').textContent = matY.toFixed(1);
    $('vChain').textContent = cs.toFixed(2);
    var matDays = matY * 365;
    var scored = rows.map(function (r) {
      var g = Math.min(model.growth_cap, Math.max(model.growth_floor, r.change_7d === null ? 0 : r.change_7d));
      var gm = 1 + (g / 100) * gw;
      var age = r.age_days === null ? model.unknown_age_days : r.age_days;
      var mm = model.maturity_floor + (Math.min(Math.max(age, 0), matDays) / matDays) * model.maturity_range;
      var cm = 1 + Math.min((r.chains || []).length, model.chain_cap) * cs;
      return { r: r, v: Math.max(1, Math.round(r.tvl_usd * base * gm * mm * cm * r.derivative_discount)) };
    }).sort(function (a, b) { return b.v - a.v; }).slice(0, 10);
    $('sandboxTop').innerHTML = scored.map(function (s, i) {
      return '<li><span>' + (i + 1) + '. ' + esc(s.r.name) + ' <span style="color:var(--dim)">(board #' + s.r.rank + ')</span></span><span class="v">' + fmtUsd(s.v) + '</span></li>';
    }).join('');
  }
  ['sBase', 'sGrowth', 'sMat', 'sChain'].forEach(function (id) {
    $(id).addEventListener('input', recompute);
  });
  recompute();

  // ---- deep links + first render -------------------------------------------------
  renderBoard();
  var hash = (location.hash || '').replace(/^#/, '');
  var params = {};
  hash.split('&').forEach(function (part) {
    var kv = part.split('=');
    if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
  });
  if (params.cat) {
    state.category = params.cat;
    $('cat').value = params.cat;
  }
  if (params.watch === '1') { state.watchOnly = true; $('watchOnly').checked = true; }
  if (params.minTvl) { state.minTvl = Number(params.minTvl); $('minTvl').value = params.minTvl; }
  if (params.q) { state.q = params.q; $('q').value = params.q; }
  renderBoard();
  if (params.detail) openDetail(params.detail);
})();
