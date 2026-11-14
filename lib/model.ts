// Token Radar v3 model (radar-3): one snapshot in, one ranked board out.
//
// The board ranks every genuine launch candidate in the snapshot: every protocol that records
// no token and is not a wrapped, staked or bridged product of a token that already trades, not
// an exchange, and not a versioned pool of another protocol. The watchlist's own exclusion rule,
// applied to the whole pre-token universe instead of only the $50M floor. The 40 watchlist
// slugs are the floor; the board adds every rankable protocol below it, so the radar covers
// the full launch universe the snapshot holds, not just its biggest names.
//
// Implied value is calibrated on the snapshot's own live market, not on a flat multiple:
//   ratio    = median market-cap / TVL of the live-token protocols in the same category
//              (at least 8 live comps, else the global median over all live protocols),
//              clamped to [0.05, 0.80]
//   growth   = clamp(change_7d, -50, 200) per cent
//   growthMult   = 1 + (growth / 100) x 0.6
//   maturityMult = 0.55 + 0.45 x (1 - exp(-age_days / 365))
//   momentumMult = 1 + 0.25 x clamp((growth - category_median_growth) / 100, -0.40, 1.00)
//   breadthMult  = 1 + 0.02 x min(chains - 1, 5)
//   implied  = max(1, round(tvl_usd x ratio x growthMult x maturityMult x momentumMult x breadthMult))
//
// The new term is peer-relative momentum: category_median_growth is the median seven-day
// growth of the LIVE-token protocols in the same category (the priced set is the benchmark;
// the global live median where a category has no live growth figure). A protocol growing
// while its own category shrinks is heating up; one growing slower than its category is
// cooling, even when its absolute growth looks fine. TVL is the size, the category ratio is
// what the market already pays per dollar of TVL for that kind of protocol, growth is
// momentum, maturity is how long the protocol has run with no token (the longer the record,
// the more launch value is pent up, with diminishing returns), and breadth is distribution
// across chains. No protocol name is ever special-cased: the same function scores every row,
// and the dashboard recomputes each row from these figures and checks the number board.json
// carries.
//
// Live-token protocols are kept apart and shown with their market caps, the market's own
// values, never mixed into the pre-token ranking and never presented as farming targets.
//
// Farm plans are seven steps, and every step is written for this protocol alone: the setup
// names its first chain, the core and weekly actions name its category, the why-now step
// carries its own growth against its category's median, its age and its ratio, the hold
// follows its age, the verify step names its own record, and the log step carries its own
// capital and gas. No two rows share a plan unless their figures coincide.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_tau_days: number;
  unknown_age_days: number;
  momentum_weight: number;
  momentum_floor: number;
  momentum_cap: number;
  breadth_step: number;
  breadth_max_extra_chains: number;
  min_category_comps: number;
  ratio_floor: number;
  ratio_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 200,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_tau_days: 365,
  unknown_age_days: 365,
  momentum_weight: 0.25,
  momentum_floor: -0.4,
  momentum_cap: 1.0,
  breadth_step: 0.02,
  breadth_max_extra_chains: 5,
  min_category_comps: 8,
  ratio_floor: 0.05,
  ratio_cap: 0.8,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** How many heating-up rows the dashboard's strip carries. */
export const HEATING_ROWS = 5;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_ratio: number;
    ratio_comps: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    momentum_multiplier: number;
    category_median_growth: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_ratio: number;
  ratio_comps: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  momentum_multiplier: number;
  category_median_growth: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's market ratio, for the dashboard's ratio table. */
export interface RatioRow {
  category: string;
  ratio: number;
  comps: number;
  used_category: boolean;
  median_growth: number;
}

/** One heating-up row: the fastest protocol against its own category. */
export interface HeatingRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  implied_value_usd: number;
  momentum_multiplier: number;
  growth_pct: number;
  category_median_growth: number;
}

/** Everything the dashboard needs: the board, the live set, the ratios, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  global_ratio: number;
  ratios: RatioRow[];
  rows: RadarRow[];
  live: LiveRow[];
  heating: HeatingRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Clamp a ratio into the model's band. */
function clampRatio(r: number, model: ModelConstants): number {
  return Math.min(model.ratio_cap, Math.max(model.ratio_floor, r));
}

/**
 * The market ratios, from the snapshot's own live-token protocols: for each category, the
 * median market-cap / TVL of live protocols in that category; the global median over all live
 * protocols is the fallback where a category has fewer than `min_category_comps` comps.
 */
export function categoryRatios(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; byCategory: Map<string, { ratio: number; comps: number }> } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const r = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(r) || r <= 0) continue;
    all.push(r);
    const c = p.category ?? 'Other';
    const list = byCat.get(c) ?? [];
    list.push(r);
    byCat.set(c, list);
  }
  const global = all.length > 0 ? clampRatio(median(all), model) : 0.2;
  const byCategory = new Map<string, { ratio: number; comps: number }>();
  for (const [c, list] of byCat) {
    byCategory.set(c, { ratio: list.length >= model.min_category_comps ? clampRatio(median(list), model) : global, comps: list.length });
  }
  return { global, byCategory };
}

/**
 * The peer benchmark: for each category, the median seven-day growth of its LIVE-token
 * protocols (the priced set is the benchmark a pre-token protocol is heating up against);
 * the global median over all live protocols is the fallback where a category carries no
 * live growth figure at all.
 */
export function categoryMedianGrowth(snapshot: Snapshot): { global: number; byCategory: Map<string, number> } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.change_7d === null || !Number.isFinite(p.change_7d)) continue;
    all.push(p.change_7d);
    const c = p.category ?? 'Other';
    const list = byCat.get(c) ?? [];
    list.push(p.change_7d);
    byCat.set(c, list);
  }
  const global = all.length > 0 ? median(all) : 0;
  const byCategory = new Map<string, number>();
  for (const [c, list] of byCat) {
    if (list.length > 0) byCategory.set(c, median(list));
  }
  return { global, byCategory };
}

/** The median growth a protocol's category is heating up against. */
export function medianGrowthFor(p: SnapshotProtocol, medians: { global: number; byCategory: Map<string, number> }): number {
  return medians.byCategory.get(p.category ?? 'Other') ?? medians.global;
}

/** The ratio a protocol's category earns, and how many live comps back it. */
export function ratioFor(p: SnapshotProtocol, ratios: { global: number; byCategory: Map<string, { ratio: number; comps: number }> }): { ratio: number; comps: number; usedCategory: boolean } {
  const entry = ratios.byCategory.get(p.category ?? 'Other');
  if (entry !== undefined && entry.comps >= MODEL.min_category_comps) return { ratio: entry.ratio, comps: entry.comps, usedCategory: true };
  return { ratio: ratios.global, comps: entry?.comps ?? 0, usedCategory: false };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  ratios: { global: number; byCategory: Map<string, { ratio: number; comps: number }> },
  medians: { global: number; byCategory: Map<string, number> },
  model: ModelConstants = MODEL,
): { implied: number; ratio: number; comps: number; usedCategory: boolean; growthPct: number; growthMult: number; maturityMult: number; momentumMult: number; categoryMedian: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { ratio, comps, usedCategory } = ratioFor(protocol, ratios);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(ageForModel, 0) / model.maturity_tau_days));
  const categoryMedian = medianGrowthFor(protocol, medians);
  const momentumGap = Math.min(model.momentum_cap, Math.max(model.momentum_floor, (growthPct - categoryMedian) / 100));
  const momentumMult = 1 + momentumGap * model.momentum_weight;
  const breadthMult = 1 + model.breadth_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_extra_chains);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * ratio * growthMult * maturityMult * momentumMult * breadthMult));
  return { implied, ratio, comps, usedCategory, growthPct, growthMult, maturityMult, momentumMult, categoryMedian, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a product of a token that already trades, not a launch of their own. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names: a protocol beginning with one is the exchange's own product. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a genuine launch candidate: pre-token, and not an exchange, not a
 * versioned pool, not a wrapped/staked/bridged product of a token that already trades. This
 * is the watchlist's own exclusion rule, applied to the whole pre-token universe.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const ratios = categoryRatios(snapshot, model);
  const medians = categoryMedianGrowth(snapshot);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other genuine launch candidate below the floor. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, ratios, medians, model);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_ratio: s.v.ratio,
      ratio_comps: s.v.comps,
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      momentum_multiplier: round4(s.v.momentumMult),
      category_median_growth: round4(s.v.categoryMedian),
      breadth_multiplier: round4(s.v.breadthMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 25_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 90) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Typical gas for one transaction on a chain, in dollars, from the chain's own fee level. */
function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return '$6';
  if (c === 'bitcoin') return '$4';
  if (c === 'tron') return '$2';
  if (c === 'solana') return '$0.20';
  if (c === 'avalanche') return '$0.80';
  if (['base', 'arbitrum', 'optimism', 'polygon', 'binance', 'bsc', 'ink', 'mantle', 'linea', 'scroll', 'zksync', 'mode', 'blast'].includes(c)) return '$0.50';
  return '$1.50';
}

/** A growth figure in words, with its sign; 'unreported growth' when the snapshot carries none. */
function growthWords(growth: number | null): string {
  if (growth === null || !Number.isFinite(growth)) return 'unreported growth';
  return `${growth >= 0 ? '+' : ''}${growth.toFixed(2)}% over seven days`;
}

/** An age in words; 'an unlisted age' when the snapshot carries no listing date. */
function ageWords(age: number | null): string {
  if (age === null) return 'an unlisted age';
  if (age >= 365) return `${(age / 365).toFixed(1)} years with no token`;
  return `${Math.max(0, Math.round(age))} days with no token`;
}

/** The category's core action and its weekly qualifying action, from the category alone. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { core: string; weekly: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const usdc = `$${capital} of USDC`;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator') || c.includes('capital allocator')) {
    return {
      core: `Deposit ${usdc} into a ${name} vault on ${chain} and keep the vault shares in your wallet.`,
      weekly: `Check the vault's allocation and top it up by $10 once a week so the position keeps growing.`,
    };
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      core: `Supply ${usdc} to ${name} on ${chain} as collateral and keep the position open.`,
      weekly: `Borrow $10 against the collateral and repay it in the same week to register borrow activity.`,
    };
  }
  if (c.includes('dex') || c.includes('liquidity manager') || c.includes('leveraged farm')) {
    return {
      core: `Provide ${usdc} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
      weekly: `Swap $10 through the pool once a week and re-add any fees you earn to the position.`,
    };
  }
  if (c.includes('yield aggregator') || c.includes('yield')) {
    return {
      core: `Deposit ${usdc} into ${name}'s highest-TVL strategy on ${chain} and keep the receipt tokens.`,
      weekly: `Harvest and re-deposit the yield once a week instead of letting it sit idle.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      core: `Mint ${usdc} of the yield-bearing asset ${name} offers on ${chain} and hold it in your wallet.`,
      weekly: `Top up the position by $10 once a week and keep the asset untouched between top-ups.`,
    };
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('basis trading')) {
    return {
      core: `Deposit ${usdc} as margin on ${name} on ${chain} and open one small hedged position.`,
      weekly: `Place one small trade a week and close it the same day so volume accrues without overnight risk.`,
    };
  }
  if (c.includes('stable')) {
    return {
      core: `Mint or deposit ${usdc} of the stable asset through ${name} on ${chain} and hold it.`,
      weekly: `Move $10 in and out of the stable asset once a week to keep the wallet active.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      core: `Fund your ${name} account with ${usdc} on ${chain} and place one market position.`,
      weekly: `Place one small prediction a week on a market that closes within seven days.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      core: `Stake ${usdc} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`,
      weekly: `Restake the staking rewards once a week instead of claiming them to your wallet.`,
    };
  }
  if (c.includes('chain')) {
    return {
      core: `Bridge ${usdc} to ${name}'s chain and deploy it in the chain's flagship app for at least one transaction.`,
      weekly: `Make one on-chain transaction a week on ${name}'s chain, such as a swap or a deposit.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      core: `Buy ${usdc} of cover from ${name} on ${chain} and keep the policy active.`,
      weekly: `Check the policy once a week and renew or extend it before it lapses.`,
    };
  }
  return {
    core: `Deposit ${usdc} into ${name} on ${chain} and keep the position open.`,
    weekly: `Make one qualifying action each week, such as a deposit, a swap, a borrow or a vote.`,
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. Every step is
 * written for this protocol alone: the setup names its first chain, the core and weekly
 * actions name its category, the why-now step carries its own growth against its category's
 * live median, its age and its ratio, the hold follows its age, the verify step names its
 * own record, and the log step carries its own capital and gas. Step 2 stays the category's
 * core action, so the dashboard's detail view keeps showing it first after setup.
 */
export function farmSteps(
  p: SnapshotProtocol,
  v: { age: number | null; ratio: number; growthPct: number; categoryMedian: number },
): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(v.age);
  const gas = gasFor(chain);
  const { core, weekly } = actionsFor(p, capital, chain);
  const category = p.category ?? 'Other';
  const listed = p.listed_at ?? 'an unlisted date';
  const chains = p.chains.length > 0 ? p.chains.join(', ') : 'its main chain';
  return [
    {
      text: `Set up a fresh wallet that holds only the funds you plan to farm, move $${capital} of USDC onto ${chain}, and keep the seed phrase offline on paper.`,
      cost: `about ${gas} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    { text: core, cost: `$${capital} of capital and about ${gas} of gas`, time: '15 minutes to set up' },
    {
      text: weekly,
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Why now: ${p.name} is ${growthWords(p.change_7d)} against ${v.categoryMedian >= 0 ? '+' : ''}${v.categoryMedian.toFixed(2)}% for live ${category} tokens, has run ${ageWords(v.age)}, and its category trades at x${v.ratio.toFixed(3)} of TVL.`,
      cost: 'nothing to check',
      time: '5 minutes to check the figures',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you deposit, check ${p.name}'s own site and points page: the snapshot records no token, first listed ${listed}, on ${chains}. If a token or points program appears that the snapshot does not carry, stop and re-check before you farm.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, and plan the exit now: if a token launches, sell a quarter at launch and keep the rest for a month.`,
      cost: `nothing but the log, plus about ${gas} of gas to exit`,
      time: '5 minutes to log, 15 minutes to exit',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_ratio: row.model.category_ratio,
    ratio_comps: row.model.ratio_comps,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    momentum_multiplier: row.model.momentum_multiplier,
    category_median_growth: row.model.category_median_growth,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** The heating-up strip: the five rows gaining fastest on their own category. */
export function heatingRows(board: BoardRow[]): HeatingRow[] {
  return [...board]
    .sort((a, b) => b.model.momentum_multiplier - a.model.momentum_multiplier || b.implied_value_usd - a.implied_value_usd)
    .slice(0, HEATING_ROWS)
    .map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      implied_value_usd: r.implied_value_usd,
      momentum_multiplier: r.model.momentum_multiplier,
      growth_pct: r.model.growth_pct,
      category_median_growth: r.model.category_median_growth,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const ratios = categoryRatios(snapshot, model);
  const medians = categoryMedianGrowth(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const totalImplied = board.reduce((n, r) => n + r.implied_value_usd, 0);
  const seen = new Map<string, RatioRow>();
  for (const r of board) {
    const entry = ratios.byCategory.get(r.category ?? 'Other');
    const key = r.category ?? 'Other';
    if (!seen.has(key)) {
      seen.set(key, {
        category: key,
        ratio: r.model.category_ratio,
        comps: entry?.comps ?? 0,
        used_category: r.model.ratio_comps >= model.min_category_comps,
        median_growth: r.model.category_median_growth,
      });
    }
  }
  const ratioRows = [...seen.values()].sort((a, b) => b.ratio - a.ratio);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: totalImplied,
    global_ratio: round4(ratios.global),
    ratios: ratioRows,
    rows: board.map(radarRow),
    live,
    heating: heatingRows(board),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
