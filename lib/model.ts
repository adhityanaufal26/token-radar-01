// Token launch radar model (radar-2).
//
// Scores every pre-token protocol in the snapshot by what its launch would
// be worth if its record stayed as it is: TVL times the market-cap/TVL
// ratio its category's live tokens trade at, adjusted for seven-day growth,
// for how long it has run with no token, and for how many chains it runs on.
// The board is the watchlist plus every other rankable pre-token protocol.

export interface Protocol {
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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface ModelDetail {
  category_ratio: number;
  ratio_comps: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
}

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
  model: ModelDetail;
  farm_steps: string[];
}

export interface RatioRow {
  category: string | null;
  ratio: number;
  comps: number;
  used_category: boolean;
}

export interface CompactRow {
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
  breadth_multiplier: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_tau_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_max_extra_chains: number;
  min_category_comps: number;
  ratio_floor: number;
  ratio_cap: number;
}

export interface Radar {
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
  rows: CompactRow[];
  live: LiveRow[];
}

export const MODEL_VERSION = 'radar-2';

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 200,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_tau_days: 365,
  unknown_age_days: 365,
  breadth_step: 0.02,
  breadth_max_extra_chains: 5,
  min_category_comps: 8,
  ratio_floor: 0.05,
  ratio_cap: 0.8,
};

const LIVE_VIEW_SIZE = 24;

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

const PROTOCOL_FIELDS = [
  'slug',
  'name',
  'category',
  'chains',
  'tvl_usd',
  'change_7d',
  'mcap_usd',
  'listed_at',
  'gecko_id',
  'symbol',
];

const DAY_MS = 86400000;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Strict YYYY-MM-DD to UTC midnight, or null when it is not a real day.
function parseDay(value: string | null): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }
  return ms;
}

function ageInDays(protocol: Protocol, asOfMs: number): number | null {
  const listedMs = parseDay(protocol.listed_at);
  if (listedMs === null) return null;
  return Math.max(0, Math.floor((asOfMs - listedMs) / DAY_MS));
}

export function isPreToken(protocol: Protocol): boolean {
  return (
    protocol.mcap_usd === null &&
    protocol.gecko_id === null &&
    protocol.symbol === null
  );
}

export function isRankable(protocol: Protocol): boolean {
  if (!isPreToken(protocol)) return false;
  if (EXCLUDED_CATEGORIES.has(protocol.category)) return false;
  if (VERSION_SUFFIX.test(protocol.name)) return false;
  if (WRAPPED_WORD.test(protocol.name)) return false;
  if (EXCHANGE_PREFIXES.some((prefix) => protocol.name.startsWith(prefix))) {
    return false;
  }
  return true;
}

function fail(message: string): never {
  throw new Error(`invalid snapshot: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSnapshot(text: string): Snapshot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail('not valid JSON');
  }
  if (!isRecord(data)) fail('top level is not an object');
  if (typeof data.as_of !== 'string' || parseDay(data.as_of) === null) {
    fail('as_of must be a YYYY-MM-DD date');
  }
  if (typeof data.source !== 'string') fail('source must be a string');
  if (
    typeof data.floor_usd !== 'number' ||
    !Number.isInteger(data.floor_usd) ||
    data.floor_usd <= 0
  ) {
    fail('floor_usd must be a positive integer');
  }
  if (!Array.isArray(data.protocols)) fail('protocols must be an array');
  if (
    !Array.isArray(data.watchlist) ||
    !data.watchlist.every((slug) => typeof slug === 'string')
  ) {
    fail('watchlist must be an array of strings');
  }
  for (const protocol of data.protocols) {
    if (!isRecord(protocol)) fail('protocol is not an object');
    const keys = Object.keys(protocol);
    if (
      keys.length !== PROTOCOL_FIELDS.length ||
      !PROTOCOL_FIELDS.every((field) => keys.includes(field))
    ) {
      fail('protocol must carry exactly the ten fields');
    }
    if (typeof protocol.slug !== 'string' || protocol.slug.length === 0) {
      fail('protocol slug must be a non-empty string');
    }
    if (typeof protocol.name !== 'string' || protocol.name.length === 0) {
      fail('protocol name must be a non-empty string');
    }
    if (!(protocol.category === null || typeof protocol.category === 'string')) {
      fail('protocol category must be a string or null');
    }
    if (
      !Array.isArray(protocol.chains) ||
      !protocol.chains.every((chain) => typeof chain === 'string')
    ) {
      fail('protocol chains must be an array of strings');
    }
    if (typeof protocol.tvl_usd !== 'number' || !Number.isFinite(protocol.tvl_usd)) {
      fail('protocol tvl_usd must be a finite number');
    }
    if (
      !(
        protocol.change_7d === null ||
        (typeof protocol.change_7d === 'number' && Number.isFinite(protocol.change_7d))
      )
    ) {
      fail('protocol change_7d must be a number or null');
    }
    if (
      !(
        protocol.mcap_usd === null ||
        (typeof protocol.mcap_usd === 'number' && Number.isFinite(protocol.mcap_usd))
      )
    ) {
      fail('protocol mcap_usd must be a number or null');
    }
    if (!(protocol.listed_at === null || typeof protocol.listed_at === 'string')) {
      fail('protocol listed_at must be a string or null');
    }
    if (!(protocol.gecko_id === null || typeof protocol.gecko_id === 'string')) {
      fail('protocol gecko_id must be a string or null');
    }
    if (!(protocol.symbol === null || typeof protocol.symbol === 'string')) {
      fail('protocol symbol must be a string or null');
    }
  }
  return data as unknown as Snapshot;
}

// A live token's market-cap/TVL ratio, or null when it cannot be one.
function liveRatio(protocol: Protocol): number | null {
  if (isPreToken(protocol)) return null;
  if (protocol.mcap_usd === null || protocol.mcap_usd <= 0) return null;
  if (!(protocol.tvl_usd > 0)) return null;
  const ratio = protocol.mcap_usd / protocol.tvl_usd;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return ratio;
}

const GAS_BY_CHAIN: Record<string, number> = {
  ethereum: 6,
  bitcoin: 4,
  tron: 2,
  solana: 0.2,
  avalanche: 0.8,
  base: 0.5,
  arbitrum: 0.5,
  optimism: 0.5,
  polygon: 0.5,
  binance: 0.5,
  bsc: 0.5,
  ink: 0.5,
  mantle: 0.5,
  linea: 0.5,
  scroll: 0.5,
  zksync: 0.5,
  mode: 0.5,
  blast: 0.5,
};

function gasFor(chain: string | null): number {
  if (chain === null) return 1.5;
  return GAS_BY_CHAIN[chain.toLowerCase()] ?? 1.5;
}

function money(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 1000000000) return 250;
  if (tvlUsd >= 100000000) return 150;
  if (tvlUsd >= 25000000) return 100;
  return 50;
}

interface PlanText {
  core: string;
  weekly: string;
}

function planFor(
  category: string | null,
  name: string,
  firstChain: string,
  capital: number,
): PlanText {
  const text = (category ?? '').toLowerCase();
  const cap = `$${capital}`;
  if (
    text.includes('risk curator') ||
    text.includes('curator') ||
    text.includes('allocator') ||
    text.includes('capital allocator')
  ) {
    return {
      core: `Deposit ${cap} of USDC into a ${name} vault on ${firstChain} and keep the vault shares in your wallet.`,
      weekly: `Check the vault's allocation and top it up by $10 once a week so the position keeps growing.`,
    };
  }
  if (
    text.includes('lending') ||
    text.includes('cdp') ||
    text.includes('collateral')
  ) {
    return {
      core: `Supply ${cap} as collateral to ${name} on ${firstChain} and keep the position open.`,
      weekly: `Borrow $10 against the position and repay it in the same week.`,
    };
  }
  if (
    /(^|\s)dex/.test(text) ||
    text.includes('liquidity manager') ||
    text.includes('leveraged farm')
  ) {
    return {
      core: `Provide ${cap} of liquidity to the main ${name} pool on ${firstChain} and keep it open.`,
      weekly: `Swap $10 through the pool once a week and re-add the earned fees.`,
    };
  }
  if (text.includes('yield aggregator') || text.includes('yield')) {
    return {
      core: `Deposit ${cap} into the highest-TVL ${name} strategy on ${firstChain} and keep the receipt tokens.`,
      weekly: `Harvest the yield and re-deposit it.`,
    };
  }
  if (text.includes('rwa')) {
    return {
      core: `Mint ${cap} of the yield-bearing asset from ${name} on ${firstChain} and hold it.`,
      weekly: `Top the position up by $10.`,
    };
  }
  if (
    text.includes('derivative') ||
    text.includes('perpetual') ||
    text.includes('basis trading')
  ) {
    return {
      core: `Deposit ${cap} as margin with ${name} on ${firstChain} and open one small hedged position.`,
      weekly: `Make one small trade and close it the same day.`,
    };
  }
  if (text.includes('stable')) {
    return {
      core: `Mint or deposit ${cap} of the ${name} stable asset on ${firstChain} and hold it.`,
      weekly: `Move $10 in and out once a week.`,
    };
  }
  if (text.includes('prediction')) {
    return {
      core: `Fund your ${name} account with ${cap} on ${firstChain} and place one market position.`,
      weekly: `Place one small prediction on a market closing within seven days.`,
    };
  }
  if (text.includes('staking') || text.includes('restaking')) {
    return {
      core: `Stake ${cap} with ${name} on ${firstChain} and keep the receipt token.`,
      weekly: `Restake the rewards.`,
    };
  }
  if (text === 'chain') {
    return {
      core: `Bridge ${cap} to ${name} and deploy it in the chain's flagship app.`,
      weekly: `Make one on-chain transaction a week.`,
    };
  }
  if (text.includes('insurance')) {
    return {
      core: `Buy ${cap} of cover from ${name} on ${firstChain} and keep the policy active.`,
      weekly: `Check the policy and renew it before it lapses.`,
    };
  }
  return {
    core: `Deposit ${cap} with ${name} on ${firstChain} and keep the position open.`,
    weekly: `Do one qualifying action each week, such as a deposit, a swap, a borrow or a vote.`,
  };
}

function fitStep(step: string): string {
  let text = step;
  if (text.length > 600) text = `${text.slice(0, 597)}...`;
  if (text.length < 20) text = text.padEnd(20, '.');
  return text;
}

function farmSteps(protocol: Protocol, ageDays: number | null): string[] {
  const firstChain =
    protocol.chains.length > 0 ? protocol.chains[0] : 'its main chain';
  const gas = money(
    gasFor(protocol.chains.length > 0 ? protocol.chains[0] : null),
  );
  const capital = capitalFor(protocol.tvl_usd);
  const holdDays =
    ageDays === null ? 45 : ageDays < 90 ? 60 : ageDays < 365 ? 45 : 30;
  const plan = planFor(protocol.category, protocol.name, firstChain, capital);
  const parts = [
    {
      action:
        'Set up a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.',
      cost: `about ${gas} of gas for the first transaction on ${firstChain}`,
      time: '5 minutes',
    },
    {
      action: plan.core,
      cost: `${money(capital)} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      action: plan.weekly,
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      action: `Hold the position for at least ${holdDays} days so the activity is counted in more than one snapshot.`,
      cost: `the ${money(capital)} stays in the position`,
      time: `${holdDays} days`,
    },
    {
      action: `Before you withdraw, open ${protocol.name}'s own points or rewards page from the link the protocol itself publishes and claim only there.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      action:
        'Write the wallet, the dates and every transaction hash in a farm log, and plan the exit now: if a token launches, sell a quarter at launch and keep the rest for a month.',
      cost: `nothing but the log, plus about ${gas} of gas to exit`,
      time: '5 minutes to log, 15 minutes to exit',
    },
  ];
  return parts.map(
    ({ action, cost, time }) => fitStep(`${action} Cost: ${cost}. Time: ${time}.`),
  );
}

export function buildRadar(snapshot: Snapshot): {
  board: BoardRow[];
  radar: Radar;
} {
  const asOfMs = parseDay(snapshot.as_of);

  const liveRatios = snapshot.protocols
    .map((protocol) => liveRatio(protocol))
    .filter((ratio): ratio is number => ratio !== null);
  const globalMedian = median(liveRatios);
  const globalRatio =
    globalMedian === null
      ? 0.2
      : clamp(globalMedian, MODEL.ratio_floor, MODEL.ratio_cap);

  const ratiosByCategory = new Map<string | null, number[]>();
  for (const protocol of snapshot.protocols) {
    const ratio = liveRatio(protocol);
    if (ratio === null) continue;
    const bucket = ratiosByCategory.get(protocol.category);
    if (bucket) bucket.push(ratio);
    else ratiosByCategory.set(protocol.category, [ratio]);
  }
  const ratioFor = (
    category: string | null,
  ): { ratio: number; comps: number; used: boolean } => {
    const bucket = ratiosByCategory.get(category) ?? [];
    if (bucket.length >= MODEL.min_category_comps) {
      const own = median(bucket);
      return {
        ratio: clamp(own ?? globalRatio, MODEL.ratio_floor, MODEL.ratio_cap),
        comps: bucket.length,
        used: true,
      };
    }
    return { ratio: globalRatio, comps: bucket.length, used: false };
  };

  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p] as const));
  const boardSlugs = new Set<string>();
  for (const slug of snapshot.watchlist) {
    if (bySlug.has(slug)) boardSlugs.add(slug);
  }
  for (const protocol of snapshot.protocols) {
    if (isRankable(protocol)) boardSlugs.add(protocol.slug);
  }

  const scored = [...boardSlugs].map((slug) => {
    const protocol = bySlug.get(slug) as Protocol;
    const age = asOfMs === null ? null : ageInDays(protocol, asOfMs);
    const effectiveAge = age === null ? MODEL.unknown_age_days : age;
    const rawGrowth =
      typeof protocol.change_7d === 'number' &&
      Number.isFinite(protocol.change_7d)
        ? protocol.change_7d
        : 0;
    const growthPct = clamp(rawGrowth, MODEL.growth_floor, MODEL.growth_cap);
    const growthMultiplier =
      1 + (growthPct / 100) * MODEL.growth_weight;
    const maturityMultiplier =
      MODEL.maturity_floor +
      MODEL.maturity_range *
        (1 - Math.exp(-effectiveAge / MODEL.maturity_tau_days));
    const breadthMultiplier =
      1 +
      MODEL.breadth_step *
        Math.min(
          MODEL.breadth_max_extra_chains,
          Math.max(0, protocol.chains.length - 1),
        );
    const { ratio, comps } = ratioFor(protocol.category);
    const implied = Math.max(
      1,
      Math.round(
        protocol.tvl_usd *
          ratio *
          growthMultiplier *
          maturityMultiplier *
          breadthMultiplier,
      ),
    );
    return {
      protocol,
      age,
      growthPct,
      growthMultiplier,
      maturityMultiplier,
      breadthMultiplier,
      ratio,
      comps,
      implied,
    };
  });
  scored.sort(
    (a, b) =>
      b.implied - a.implied ||
      (a.protocol.slug < b.protocol.slug
        ? -1
        : a.protocol.slug > b.protocol.slug
          ? 1
          : 0),
  );

  const board: BoardRow[] = scored.map((entry, index) => ({
    rank: index + 1,
    slug: entry.protocol.slug,
    name: entry.protocol.name,
    category: entry.protocol.category,
    chains: [...entry.protocol.chains],
    tvl_usd: entry.protocol.tvl_usd,
    change_7d: entry.protocol.change_7d,
    mcap_usd: entry.protocol.mcap_usd,
    listed_at: entry.protocol.listed_at,
    gecko_id: entry.protocol.gecko_id,
    symbol: entry.protocol.symbol,
    token_status: 'pre-token',
    age_days: entry.age,
    implied_value_usd: entry.implied,
    model: {
      category_ratio: entry.ratio,
      ratio_comps: entry.comps,
      growth_pct: round4(entry.growthPct),
      growth_multiplier: round4(entry.growthMultiplier),
      maturity_multiplier: round4(entry.maturityMultiplier),
      breadth_multiplier: round4(entry.breadthMultiplier),
      age_days: entry.age,
    },
    farm_steps: farmSteps(entry.protocol, entry.age),
  }));

  const seenCategories: (string | null)[] = [];
  for (const row of board) {
    if (!seenCategories.includes(row.category)) {
      seenCategories.push(row.category);
    }
  }
  const ratios: RatioRow[] = seenCategories.map((category) => {
    const { ratio, comps, used } = ratioFor(category);
    return { category, ratio, comps, used_category: used };
  });
  ratios.sort((a, b) => b.ratio - a.ratio);

  const live: LiveRow[] = snapshot.protocols
    .filter((protocol) => !isPreToken(protocol) && protocol.category !== 'CEX')
    .sort(
      (a, b) =>
        (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd,
    )
    .slice(0, LIVE_VIEW_SIZE)
    .map((protocol) => ({
      slug: protocol.slug,
      name: protocol.name,
      category: protocol.category,
      chains: [...protocol.chains],
      tvl_usd: protocol.tvl_usd,
      mcap_usd: protocol.mcap_usd,
      change_7d: protocol.change_7d,
    }));

  const watchlist = new Set(snapshot.watchlist);
  const radar: Radar = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((row) => !watchlist.has(row.slug)).length,
    live_size: live.length,
    total_implied_usd: board.reduce(
      (sum, row) => sum + row.implied_value_usd,
      0,
    ),
    global_ratio: round4(globalRatio),
    ratios,
    rows: board.map((row) => ({
      rank: row.rank,
      slug: row.slug,
      name: row.name,
      category: row.category,
      chains: [...row.chains],
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
      breadth_multiplier: row.model.breadth_multiplier,
      farm_steps: [...row.farm_steps],
    })),
    live,
  };

  return { board, radar };
}

export function boardIssue(
  board: BoardRow[] | { rows: BoardRow[] },
  snapshot: Snapshot,
): string | null {
  const rows = Array.isArray(board) ? board : board.rows;
  const present = new Set(rows.map((row) => row.slug));
  for (const slug of snapshot.watchlist) {
    if (!present.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  const ranks = rows.map((row) => row.rank).sort((a, b) => a - b);
  if (!ranks.every((rank, index) => rank === index + 1)) {
    return 'ranks are not exactly 1..N';
  }
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i].implied_value_usd > byRank[i - 1].implied_value_usd) {
      return 'implied values rise with rank';
    }
  }
  if (
    rows.length >= 2 &&
    rows.every((row) => row.implied_value_usd === rows[0].implied_value_usd)
  ) {
    return 'all implied values are equal';
  }
  for (const row of rows) {
    if (
      !Array.isArray(row.farm_steps) ||
      row.farm_steps.length < 3 ||
      row.farm_steps.length > 12
    ) {
      return `farm steps invalid for ${row.slug}`;
    }
    for (const step of row.farm_steps) {
      const text = typeof step === 'string' ? step.trim() : '';
      if (text.length < 20 || text.length > 600) {
        return `farm step length invalid for ${row.slug}`;
      }
    }
  }
  for (const row of rows) {
    if (
      !Number.isSafeInteger(row.implied_value_usd) ||
      row.implied_value_usd <= 0
    ) {
      return `implied value invalid for ${row.slug}`;
    }
  }
  return null;
}

export function dataScript(radar: Radar): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
