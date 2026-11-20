import { NightGame } from './night-game.mjs';
import { makeRenderer } from './world-renderer.mjs';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed'));
const duration = Number(params.get('duration'));
const started = Number(params.get('started'));
const report = data => fetch('/api/benchmark', { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
try {
  const contract = await fetch('/game.contract.json').then(response => response.json());
  const canvas = document.getElementById('bench');
  const renderer = makeRenderer(canvas, { pixelRatio: 1 });
  const game = new NightGame(contract.tuning, seed, 1, {
    random_motes: false, random_shades: false, random_drifters: false,
    lanterns: [1, 2, 3].map(index => ({ id: 'L' + index, lit: true, fuel: 100 })),
  });
  function distribute(count, radius) {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i + game.random() * 0.65) * 2.399963229728653;
      const distance = ((i + 0.5) / count) ** 0.5 * radius;
      return [Math.cos(angle) * distance, 0, Math.sin(angle) * distance];
    });
  }
  game.shades = distribute(200, 38).map((pos, i) => ({ id: 'S' + (i + 1), pos, state: 'wander', timer: 0 }));
  game.motes = distribute(100, 38).map((pos, i) => ({ id: 'M' + (i + 1), pos }));
  const scenery = { surfaces: [], groundDecor: distribute(285, 39), bushes: [] };
  const samples = [];
  const measurementEnd = 3000 + duration * 1000;
  let t0;
  let previous;
  let load;
  function frame(now) {
    try {
      t0 ??= now;
      const elapsed = now - t0;
      while (game.simTick < Math.floor(elapsed * 0.06)) {
        game.simTick++;
        game.moveEnemies(false);
      }
      const angle = elapsed / 15000 * 2 * Math.PI;
      renderer.draw(game, scenery, [], 0, 0, false, false, [30 * Math.cos(angle), 15, 30 * Math.sin(angle)]);
      load ??= performance.timeOrigin + performance.now() - started;
      if (previous !== undefined && previous >= 3000 && elapsed <= measurementEnd) samples.push(elapsed - previous);
      previous = elapsed;
      if (elapsed < measurementEnd) {
        requestAnimationFrame(frame);
        return;
      }
      if (!samples.length) throw new Error('No complete frames inside the measurement interval');
      const sorted = [...samples].sort((a, b) => a - b);
      const count = samples.length;
      const worst = sorted.slice(-Math.max(1, Math.ceil(count * 0.01)));
      const sum = values => values.reduce((a, b) => a + b, 0);
      const round = value => Number(value.toFixed(2));
      void report({
        contract_version: contract.contract_version,
        avg_fps: round(1000 * count / sum(samples)),
        p1_low_fps: round(1000 * worst.length / sum(worst)),
        frame_ms_p95: round(sorted[Math.ceil(count * 0.95) - 1]),
        frames: count, load_ms: Math.round(load), peak_mem_mb: null, vsync_off: false,
        renderer: renderer.description,
      });
    } catch (error) {
      void report({ error: error.message });
    }
  }
  requestAnimationFrame(frame);
} catch (error) {
  await report({ error: error.message });
}
