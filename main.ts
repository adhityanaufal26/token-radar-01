// token-radar-01: snapshot in, ranked board plus dashboard plus dossier out.
//
// Run from the repository root, for example:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
//
// In the grading sandbox the snapshot sits at /input/snapshot.json and the
// writable directory is /output, so those are the defaults when no flag or
// environment variable says otherwise. Node standard library only; nothing
// is fetched, and the run is deterministic: same snapshot, same bytes out.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBoard } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

function flagValue(argv: string[], name: string): string | null {
  const at = argv.indexOf(name);
  return at >= 0 && at + 1 < argv.length ? argv[at + 1] : null;
}

function main(): void {
  const argv = process.argv.slice(2);
  const inputPath = flagValue(argv, "--input") ?? "/input/snapshot.json";
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

  const snapshot = JSON.parse(readFileSync(inputPath, "utf8"));
  const built = buildBoard(snapshot);

  mkdirSync(outDir, { recursive: true });

  const board = {
    as_of: built.meta.asOf,
    source: built.meta.source,
    floor_usd: built.meta.floorUsd,
    model: "radar-2",
    total_implied_usd: built.totalImplied,
    rows: built.rows,
    live: built.live,
    multiples: built.multiples,
  };
  writeFileSync(join(outDir, "board.json"), JSON.stringify(board, null, 2) + "\n");

  const data = {
    meta: {
      asOf: built.meta.asOf,
      source: built.meta.source,
      floorUsd: built.meta.floorUsd,
      model: "radar-2",
      rows: built.rows.length,
      live: built.live.length,
      totalImplied: built.totalImplied,
    },
    rows: built.rows,
    live: built.live,
    multiples: built.multiples,
  };
  writeFileSync(join(outDir, "data.js"), "globalThis.RADAR_DATA = " + JSON.stringify(data) + ";\n");

  cpSync(join(ROOT, "dashboard"), join(outDir, "dashboard"), { recursive: true });
  mkdirSync(join(outDir, "screenshots"), { recursive: true });
  const shots = join(ROOT, "screenshots");
  if (existsSync(shots)) {
    cpSync(shots, join(outDir, "screenshots"), { recursive: true });
  }

  const dossier = buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  writeFileSync(join(outDir, "dossier.json"), dossier);

  const top = built.rows[0];
  console.log(
    `radar-2: ${built.rows.length} rows, ${built.watchlistCovered}/${built.watchlistTotal} watchlist, ` +
      `top ${top.name} $${top.implied_value_usd.toLocaleString("en-US")}, ` +
      `total implied $${built.totalImplied.toLocaleString("en-US")} -> ${outDir}`,
  );
}

main();
