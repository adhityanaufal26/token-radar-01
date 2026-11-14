# Token Launch Radar

A program that reads a sealed snapshot of the protocol universe and writes
a dashboard ranking the protocols that record no token yet by what a launch
would be worth, each with a concrete plan to farm it.

## What it answers

Which pre-token protocol is worth farming next, and what do I do about it.
The board's implied value is this entry's own claim from the snapshot's
figures — never a prediction that a token ships, or when. A protocol is
described as recording no token when its DefiLlama record carries none;
that record is not proof it has none.

## The model (radar-2)

```
implied = TVL × category multiple × growth × maturity × breadth
```

- **Category multiple** — the median market-cap / TVL of the live-token
  protocols in the same category in this same snapshot, when at least three
  of them report both figures; otherwise the whole market's median. Clamped
  to 0.05…1.2. Protocols reporting a market cap of zero or less are left
  out: a dead token carries no price signal.
- **Growth** — the 7-day TVL change, clamped to −60%…+120% and
  half-weighted; unreported growth counts as zero.
- **Maturity** — 0.6 for a brand-new listing, rising to 1.0 after three
  years with no token yet; an unknown listing date counts as 365 days.
- **Breadth** — +2% per extra chain, capped at +10%.

## Coverage

178 rows: the full 40-protocol watchlist, plus every pre-token protocol
below the $50M floor that passes the watchlist's own visible tests (no token
on record, not a bridge / liquid staking / restaking / exchange product, no
wrapped / staked / staking word in the name, no version marker, no exchange
prefix). Above the floor, only the watchlist is ranked — the house rule also
reads the parent-protocol record, which the snapshot does not carry. The 24
largest live-token protocols sit on their own tab as the market the
multiples are read from, shown with market caps as facts, not a model.

Every row carries a six-step farm plan derived from its own record: the
category picks the action, the TVL picks the capital ($50 / $100 / $150 /
$250), the age picks the hold (30 / 45 / 60 days). Every step names its cost
and time, and the dashboard recomputes each row from its stored factors so
the page and `board.json` agree.

## The dashboard

Dark navy and amber, no network, no external fonts or images. Top-five
spotlight cards, a sortable table (rank / name / TVL / 7d / age / implied
value), filters for search, category, chain, watchlist-only, and pre-token /
live-token tabs. Clicking any row opens a detail view with the full model
breakdown, a plain-language reason for the rank, the six-step farm plan, and
a recompute check against `board.json`. The model panel states the formula
and lists every category multiple with its sample size and source. Deep
links work through the hash (`#p=<slug>`, `#category=`, `#chain=`, `#q=`,
`#watchlist=1`, `#tab=`).

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes
`board.json` and the dashboard's `data.js` to the output directory, copies
`dashboard/` and `screenshots/` there, and writes `dossier.json` with
`buildDossier` from `vendor/makefun-board.ts`. In the grading sandbox the
snapshot is at `/input/snapshot.json` and the output directory is `/output`.
Runs are deterministic: the same snapshot produces byte-identical output.

## Layout

```
main.ts                  snapshot in, board + dashboard + dossier out
lib/model.ts             radar-2 model, board builder, farm plans
vendor/makefun-board.ts  make.fun's dossier library, as the kit ships it
dashboard/               index.html, app.css, app.js
screenshots/             board, detail, and filtered views
```

## License

MIT — see `LICENSE`.
