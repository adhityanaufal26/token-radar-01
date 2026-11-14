// radar-2: the value model behind the token launch radar.
//
// The question this model answers is narrow: if a protocol that records no
// token today issued one tomorrow and its record stayed exactly as it is,
// what would that token plausibly be worth? The answer is built only from
// the sealed snapshot's own figures — TVL, seven-day growth, age, chain
// count, and the market caps of tokens that already trade. No protocol name
// is ever special-cased; the same arithmetic runs over every row.
//
//   implied = round(
//     tvl_usd * categoryMultiple
//     * (1 + clamp(change_7d, -60, 120) / 100 * 0.5)
//     * (0.6 + min(age_days, 1095) / 1095 * 0.4)
//     * (1 + min(0.02 * (chains - 1), 0.10))
//   )
//
// categoryMultiple is the market's own price for a dollar of TVL in that
// kind of protocol: the median market-cap/TVL ratio of the live-token
// protocols in the same category in this same snapshot, used when at least
// three of them report both figures, and otherwise the whole market's
// median. The median here takes the upper middle value when the count is
// even. The multiple is clamped to [0.05, 1.2] so one thin category cannot
// stretch the board. Dead tokens are left out of the medians: protocols
// reporting a market cap of zero or less carry no price signal, and letting
// them in would hand their whole category a near-zero multiple on a dead
// token's back.
//
// Growth is the seven-day TVL change, clamped to [-60%, +120%] and
// half-weighted, so a hot week lifts a protocol without letting one spike
// decide the board; unreported growth counts as zero. Maturity is days
// since the protocol was first listed, capped at three years, so a long
// track record with no token yet earns up to the full weight and a newcomer
// starts at 0.6; an unknown listing date counts as 365 days. Chain breadth
// adds 2% per extra chain, capped at +10%, because TVL spread over several
// chains is harder to fake and easier to keep.
//
// Coverage: the watchlist is the floor, never the ceiling. Every protocol
// on it is ranked. Below the floor, a pre-token protocol is ranked when it
// passes the watchlist's own visible tests: it records no token
// (market cap, CoinGecko id and symbol all null), its category is not a
// bridge, a liquid staking or restaking product, or a centralised exchange,
// its name carries no whole word wrapped, staked or staking, ends in no
// version marker, and starts with no exchange name. Above the floor, only
// the watchlist is ranked: the house rule also reads the parent-protocol
// record, which the snapshot does not carry, so a large pre-token protocol
// the list leaves out is a bridge, a staked product, an exchange product, a
// versioned pool, or a product of a protocol whose token already trades —
// a reason this entry cannot see, and ranking it would contradict the
// house's own rule. Live-token protocols are set aside in their own tab:
// they are facts with market caps, not a model, and they are the market the
// multiples are read from.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  category_multiple: number;
  growth_factor: number;
  maturity_factor: number;
  breadth_factor: number;
  watchlist: boolean;
  farm_steps: string[];
}

export interface LiveEntry {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  age_days: number;
  ratio: number;
}

export interface MultipleEntry {
  category: string;
  multiple: number;
  sample: number;
  fallback: boolean;
}

export interface BoardMeta {
  asOf: string;
  source: string;
  floorUsd: number;
}

export interface BoardBuild {
  meta: BoardMeta;
  rows: BoardRow[];
  live: LiveEntry[];
  multiples: MultipleEntry[];
  totalImplied: number;
  watchlistCovered: number;
  watchlistTotal: number;
}

const BLOCKED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_PREFIXES = [
  "Binance",
  "Coinbase",
  "Bybit",
  "Kraken",
  "Bitget",
  "OKX",
  "Bitfinex",
  "Gemini",
];

const VERSION_TAIL = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

const MIN_LIVE_FOR_OWN_MULTIPLE = 3;
const MULTIPLE_LOW = 0.05;
const MULTIPLE_HIGH = 1.2;
const LIVE_TAB_SIZE = 24;

export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function passesVisibleTests(p: SnapshotProtocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category !== null && BLOCKED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (VERSION_TAIL.test(p.name)) return false;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return false;
  }
  return true;
}

export function medianOf(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[ordered.length >> 1];
}

function clampMultiple(value: number): number {
  return Math.min(MULTIPLE_HIGH, Math.max(MULTIPLE_LOW, value));
}

export function ageInDays(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return 365;
  const start = Date.parse(listedAt + "T00:00:00Z");
  const end = Date.parse(asOf + "T00:00:00Z");
  if (Number.isNaN(start) || Number.isNaN(end)) return 365;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export interface ImpliedBreakdown {
  value: number;
  growthFactor: number;
  maturityFactor: number;
  breadthFactor: number;
  ageDays: number;
}

export function impliedFor(
  p: SnapshotProtocol,
  multiple: number,
  asOf: string,
): ImpliedBreakdown {
  const rawGrowth = p.change_7d === null ? 0 : p.change_7d;
  const growth = Math.min(120, Math.max(-60, rawGrowth));
  const growthFactor = 1 + (growth / 100) * 0.5;
  const ageDays = ageInDays(p.listed_at, asOf);
  const maturityFactor = 0.6 + (Math.min(ageDays, 1095) / 1095) * 0.4;
  const breadthFactor = 1 + Math.min(0.02 * (p.chains.length - 1), 0.1);
  const value = Math.round(
    p.tvl_usd * multiple * growthFactor * maturityFactor * breadthFactor,
  );
  return { value, growthFactor, maturityFactor, breadthFactor, ageDays };
}

// The category's own action, and the weekly action that keeps a position
// counting. Every farm plan is assembled from the protocol's own record —
// its category picks the action, its TVL picks the capital, its age picks
// the hold — so two protocols in one category farm the same way, and no
// protocol needs a hand-written plan.
const CATEGORY_PLAY: Record<string, [string, string]> = {
  "Lending": [
    "Supply stablecoins to the lending market",
    "supply a little more, or move the supply to the highest-yield market",
  ],
  "Dexs": [
    "Add liquidity to a core trading pool",
    "swap a small amount through the pool, or add a little more liquidity",
  ],
  "Risk Curators": [
    "Deposit into one of its curated vaults",
    "top up the vault, or move between vaults when a better one opens",
  ],
  "RWA": [
    "Mint or buy its tokenised yield-bearing asset",
    "reinvest the yield, or add to the position",
  ],
  "Yield": [
    "Deposit into its highest-yield vault",
    "harvest the yield and deposit it back in",
  ],
  "Yield Aggregator": [
    "Deposit into the aggregator vault",
    "harvest and compound the yield again",
  ],
  "Basis Trading": [
    "Deposit into its delta-neutral basis vault",
    "check the funding rate and rebalance if the vault allows it",
  ],
  "CDP": [
    "Lock collateral and mint its stablecoin",
    "adjust the collateral ratio, or mint a little more",
  ],
  "Restaking": [
    "Restake liquid staking tokens through the protocol",
    "add more restaked assets, or claim the restaking rewards",
  ],
  "Derivatives": [
    "Open a small hedged position on its derivatives market",
    "roll or rebalance the position",
  ],
  "Launchpad": [
    "Stake for an allocation slot in its next launch",
    "join each new launch the allocation covers",
  ],
  "Prediction Market": [
    "Take a small position in an open market",
    "settle the last market and open a new position",
  ],
  "Indexes": [
    "Buy the index token",
    "rebalance into the index again",
  ],
  "Synthetics": [
    "Mint a synthetic asset against collateral",
    "adjust the collateral backing",
  ],
  "Options": [
    "Open an options position through its vault",
    "roll the options position",
  ],
  "Insurance": [
    "Provide cover in its insurance pool",
    "review the open cover and top up the pool",
  ],
  "Payments": [
    "Route a small payment through the protocol",
    "repeat a payment through it",
  ],
  "Privacy": [
    "Use its private transfer or shielded pool",
    "make another private transfer",
  ],
  "Governance Incentives": [
    "Lock up and vote in its governance",
    "vote on each new proposal",
  ],
  "AI Agents": [
    "Use its agent for a small on-chain task",
    "run another agent task",
  ],
  "Token Locker": [
    "Lock tokens in its locker",
    "extend the lock, or add another one",
  ],
  "Stablecoin Issuer": [
    "Mint its stablecoin against collateral",
    "mint or redeem a little more",
  ],
  "Algo-Stables": [
    "Mint or stake its algorithmic stablecoin",
    "re-stake the yield",
  ],
  "Dual-Token Stablecoin": [
    "Mint its stablecoin pair",
    "rebalance the pair",
  ],
  "Collateral Markets": [
    "Supply collateral to its market",
    "top up the collateral",
  ],
  "Collateral Management": [
    "Deposit collateral into its manager",
    "review and adjust the collateral",
  ],
  "Liquidity Manager": [
    "Deposit into its managed liquidity position",
    "rebalance the managed position",
  ],
  "Onchain Capital Allocator": [
    "Allocate capital to one of its strategies",
    "review strategy performance and reallocate",
  ],
  "Leveraged Farming": [
    "Open a small leveraged farm position",
    "monitor the leverage and rebalance",
  ],
  "Uncollateralized Lending": [
    "Fund a loan through its credit market",
    "fund another small loan",
  ],
  "Cross Chain Bridge": [
    "Bridge a small amount to another chain",
    "bridge a small amount again",
  ],
  "Chain": [
    "Use the chain's own apps through the protocol",
    "interact with another app on the chain",
  ],
  "Staking Pool": [
    "Stake into the pool",
    "compound the staking rewards",
  ],
  "Farm": [
    "Deposit into its farm",
    "harvest and deposit the yield back in",
  ],
  "NFT Marketplace": [
    "List or buy an item through the marketplace",
    "make another marketplace trade",
  ],
  "Interest Rate Derivatives": [
    "Open an interest-rate position",
    "roll the rate position",
  ],
  "Decentralized BTC": [
    "Deposit BTC into its decentralised vault",
    "top up the BTC position",
  ],
  "Anchor BTC": [
    "Deposit BTC as anchor collateral",
    "add more anchor collateral",
  ],
  "DOR": [
    "Use its on-chain data product",
    "run another query",
  ],
  "CeDeFi": [
    "Deposit into its CeDeFi vault",
    "top up the vault",
  ],
  "Crypto Card Issuer": [
    "Order and load its crypto card",
    "spend a small amount on the card",
  ],
  "OTC Marketplace": [
    "Place a small OTC order",
    "place another small order",
  ],
  "Reserve Currency": [
    "Bond or stake for its reserve token",
    "add to the bond",
  ],
  "Options Vault": [
    "Deposit into its options vault",
    "roll the vault position",
  ],
  "Stablecoin Wrapper": [
    "Wrap stablecoins through the protocol",
    "wrap a little more",
  ],
  "Decentralized AI": [
    "Run a job on its decentralised AI network",
    "run another job",
  ],
  "CDP Manager": [
    "Manage a collateralised-debt position through it",
    "adjust the position",
  ],
};

const DEFAULT_PLAY: [string, string] = [
  "Use the protocol's main product with the deposit",
  "interact with the protocol again",
];

function capitalFor(tvlUsd: number): number {
  if (tvlUsd < 10_000_000) return 50;
  if (tvlUsd < 50_000_000) return 100;
  if (tvlUsd < 250_000_000) return 150;
  return 250;
}

function holdFor(ageDays: number): number {
  if (ageDays < 365) return 30;
  if (ageDays < 730) return 45;
  return 60;
}

export function farmPlan(p: SnapshotProtocol, ageDays: number): string[] {
  const capital = capitalFor(p.tvl_usd);
  const hold = holdFor(ageDays);
  const play = p.category !== null && CATEGORY_PLAY[p.category] !== undefined
    ? CATEGORY_PLAY[p.category]
    : DEFAULT_PLAY;
  const [action, weekly] = play;
  return [
    `Set up a fresh wallet for this farm and fund it with $${capital} in stablecoins plus about $2 for gas, keeping the seed phrase offline. Cost: about $2 in gas. Time: 15 minutes.`,
    `${action} with the full $${capital}, then check the position shows on the protocol's own dashboard before you leave. Cost: about $1 in gas plus the $${capital} deposit. Time: 20 minutes.`,
    `Every week, ${weekly}, so the position stays active and keeps counting toward any future distribution. Cost: about $1 in gas a week. Time: 10 minutes a week.`,
    `Hold the position for ${hold} days, checking the dashboard once a week for new quests, points, or announcements. Cost: no extra deposit. Time: 5 minutes a week.`,
    `Keep a short log of every deposit, date, and transaction hash, and watch the protocol's announcements for token or points news. Cost: nothing. Time: 5 minutes a week.`,
    `When a token or claim goes live, claim through the protocol's own page, then decide whether to hold, or sell half and keep the rest working. Cost: about $1 in gas to claim. Time: 20 minutes.`,
  ];
}

export function buildBoard(snap: Snapshot): BoardBuild {
  const watch = new Set(snap.watchlist);
  const asOf = snap.as_of;

  // The market the multiples are read from: live-token protocols whose
  // market cap is a real positive number.
  const priced = snap.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const ratiosByCategory = new Map<string, number[]>();
  for (const p of priced) {
    const key = p.category ?? "(no category)";
    const list = ratiosByCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    ratiosByCategory.set(key, list);
  }
  const globalMultiple = clampMultiple(
    medianOf(priced.map((p) => p.mcap_usd! / p.tvl_usd)),
  );

  const multipleFor = (category: string | null): { multiple: number; sample: number; fallback: boolean } => {
    const key = category ?? "(no category)";
    const ratios = ratiosByCategory.get(key) ?? [];
    if (ratios.length >= MIN_LIVE_FOR_OWN_MULTIPLE) {
      return { multiple: clampMultiple(medianOf(ratios)), sample: ratios.length, fallback: false };
    }
    return { multiple: globalMultiple, sample: ratios.length, fallback: true };
  };

  const ranked = snap.protocols.filter(
    (p) =>
      watch.has(p.slug) ||
      (p.tvl_usd < snap.floor_usd && passesVisibleTests(p)),
  );

  const scored: BoardRow[] = ranked.map((p) => {
    const { multiple } = multipleFor(p.category);
    const calc = impliedFor(p, multiple, asOf);
    return {
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: calc.value,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: calc.ageDays,
      category_multiple: multiple,
      growth_factor: calc.growthFactor,
      maturity_factor: calc.maturityFactor,
      breadth_factor: calc.breadthFactor,
      watchlist: watch.has(p.slug),
      farm_steps: farmPlan(p, calc.ageDays),
    };
  });
  scored.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
    return a.slug < b.slug ? -1 : 1;
  });
  scored.forEach((row, i) => {
    row.rank = i + 1;
  });

  const live: LiveEntry[] = priced
    .filter((p) => p.gecko_id !== null && p.symbol !== null)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
    .slice(0, LIVE_TAB_SIZE)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      age_days: ageInDays(p.listed_at, asOf),
      ratio: p.mcap_usd! / p.tvl_usd,
    }));

  const seenCategories = [...new Set(scored.map((r) => r.category))].sort((a, b) =>
    (a ?? "").localeCompare(b ?? ""),
  );
  const multiples: MultipleEntry[] = seenCategories.map((category) => {
    const info = multipleFor(category);
    return {
      category: category ?? "(no category)",
      multiple: info.multiple,
      sample: info.sample,
      fallback: info.fallback,
    };
  });

  return {
    meta: { asOf: snap.as_of, source: snap.source, floorUsd: snap.floor_usd },
    rows: scored,
    live,
    multiples,
    totalImplied: scored.reduce((sum, r) => sum + r.implied_value_usd, 0),
    watchlistCovered: scored.filter((r) => r.watchlist).length,
    watchlistTotal: snap.watchlist.length,
  };
}
