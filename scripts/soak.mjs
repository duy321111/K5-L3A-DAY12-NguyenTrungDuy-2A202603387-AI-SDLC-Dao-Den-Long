import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { NightGame } from '../src/night-game.mjs';
const { tuning } = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));

const [seedArg, seedText, nightsArg, nightsText, outArg, out] = process.argv.slice(2);
const seed = Number(seedText);
const nights = Number(nightsText);
if (seedArg !== '--seed' || !Number.isSafeInteger(seed) || nightsArg !== '--nights'
  || !Number.isSafeInteger(nights) || nights < 1 || outArg !== '--out' || !out || process.argv.length !== 8) {
  console.error('Usage: --seed <int> --nights <positive int> --out soak.json');
  process.exit(2);
}

function inputRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
const rss = () => {
  global.gc?.();
  return Number((process.memoryUsage.rss() / 2 ** 20).toFixed(2));
};
const start = performance.now();
const results = [];
let crashes = 0;
let game = new NightGame(tuning, seed, 1);
const mem_start_mb = rss();
for (let i = 0; i < nights; i++) {
  const night = i % 3 + 1;
  try {
    game ??= new NightGame(tuning, seed + i, night);
    const next = inputRandom(seed + i);
    let move = [0, 0];
    for (let tick = 0; tick < tuning['night' + night + '_duration_s'] * 60 && game.state === 'playing'; tick++) {
      if (tick % 30 === 0) {
        const angle = next() * Math.PI * 2;
        move = [Math.sin(angle), Math.cos(angle)];
      }
      game.step({ move, cam_yaw_deg: 0, jump: next() < 0.05, dash: next() < 0.03,
        pulse: next() < 0.02, interact: next() < 0.10 });
    }
    if (!['won', 'lost'].includes(game.state)) throw new Error('Night did not finish');
    results.push(game.state);
  } catch (error) {
    crashes++;
    console.error('Night', i + 1, error.message);
    results.push('crash');
  } finally {
    game = null;
  }
}
const mem_end_mb = rss();
const report = { nights, crashes, results, mem_start_mb, mem_end_mb,
  duration_s: Number(((performance.now() - start) / 1000).toFixed(3)) };
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
if (crashes) process.exitCode = 1;
