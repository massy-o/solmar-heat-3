// SOLMAR HEAT - make.fun entry builder.
//
// What this program does, in plain terms: it assembles the hand-in folder.
// The finished game already lives in game/ and its cover shots in
// screenshots/; this script copies both into the output directory and then
// asks the kit's dossier library to describe the result. The written
// dossier.json is the receipt the scorer compares against its own rebuild,
// so the caps passed to buildDossier below are the bounty's own limits and
// must not be "improved" locally.
//
// Run it with:  MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file sits in; game/ and screenshots/ live beside it.
const here = dirname(fileURLToPath(import.meta.url));

// Where the assembled entry goes: the environment wins, /output otherwise.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fresh output directory, then mirror the two payload folders into it.
mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// Describe exactly what was just assembled, under the bounty's caps.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

// One-line summary for the console, so a run is easy to eyeball.
const parsed = JSON.parse(new TextDecoder().decode(dossier));
const shots = parsed.images ? parsed.images.length : 0;
console.log(`solmar-heat: entry assembled in ${outDir} (dossier ${dossier.length} bytes, ${shots} screenshots)`);
