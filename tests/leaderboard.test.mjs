import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('bảng điểm lưu top 10, ổn định khi bằng điểm và xuất được sau khi mở lại', () => {
  const temp = mkdtempSync(join(tmpdir(), 'dao-leaderboard-'));
  const env = { ...process.env, LEADERBOARD_FILE: join(temp, 'scores.json') };
  try {
    const write = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { addScore } from './src/leaderboard.mjs';
      for(let i=0;i<12;i++) await addScore({ name:'player_'+i, score:i<2?999:i, nights_won:2, seed:42 });
      try { addScore({ name:'x', score:1, nights_won:0, seed:42 }); process.exitCode=3; }
      catch(error){ if(!(error instanceof RangeError)) throw error; }
    `], { env, encoding: 'utf8' });
    assert.equal(write.status, 0, write.stderr);
    const out = join(temp, 'out.json');
    const exportResult = spawnSync(process.execPath, ['server.mjs', '--export-leaderboard', out], { env, encoding: 'utf8' });
    assert.equal(exportResult.status, 0, exportResult.stderr);
    const rows = JSON.parse(readFileSync(out, 'utf8')).entries;
    assert.equal(rows.length, 10);
    assert.deepEqual(rows.slice(0, 3).map(row => row.name), ['player_0','player_1','player_11']);
    assert.equal(rows[0].seed, 42);
    assert.equal(rows[0].nights_won, 2);
    assert.match(rows[0].achieved_at, /T.*Z$/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
