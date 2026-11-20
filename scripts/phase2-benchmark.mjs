import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const temp = mkdtempSync(join(tmpdir(), 'dao-den-long-benchmark-'));
try {
  const out = join(temp, 'night-3.jsonl');
  const scenario = join(temp, 'scenario.json');
  writeFileSync(scenario, JSON.stringify({
    time_left_s: 360, player: { flames: 1000 },
  }));
  const start = performance.now();
  const result = spawnSync(process.execPath, [
    'headless.mjs', '--seed', '2026', '--night', '3', '--ticks', '21600',
    '--scenario', scenario, '--out', out,
  ], { encoding: 'utf8' });
  const elapsed = (performance.now() - start) / 1000;
  assert.equal(result.status, 0, result.stderr);
  const last = JSON.parse(readFileSync(out, 'utf8').trimEnd().split('\n').at(-1));
  assert.deepEqual(last, { type: 'end', ticks: 21600, state: 'lost', score: 0 });
  console.log(platform(), arch(), cpus()[0]?.model, (totalmem() / 2 ** 30).toFixed(1) + ' GiB', process.version);
  console.log(JSON.stringify(last));
  console.log('Headless 21600 ticks:', elapsed.toFixed(3), 's (limit: 30 s)');
  assert.ok(elapsed <= 30, 'Headless exceeded 30 s');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
