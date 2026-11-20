import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Game } from '../src/game.mjs';

const t = JSON.parse(readFileSync('game.contract.json', 'utf8')).tuning;
const isolated = { random_motes: false, random_shades: false };

function run({ scenario, frames, ticks = 120, seed = 42 } = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'dao-den-long-'));
  try {
    const out = join(temp, 'out.jsonl');
    const args = ['headless.mjs', '--seed', String(seed), '--night', '1',
      '--ticks', String(ticks), '--out', out, '--snapshot-every', '1'];
    for (const [flag, data] of Object.entries({ scenario, inputs: frames && { frames } })) {
      if (!data) continue;
      const path = join(temp, flag + '.json');
      writeFileSync(path, JSON.stringify(data));
      args.push('--' + flag, path);
    }
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    if (result.status !== 0) return result;
    const raw = readFileSync(out, 'utf8');
    const rows = raw.trim().split('\n').map(JSON.parse);
    return { raw, rows, snapshots: rows.filter(row => row.type === 'snapshot'),
      events: rows.filter(row => row.type === 'event'), end: rows.at(-1) };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

test('tick 0, đổi hướng theo camera, chuẩn hóa move và giữ input giữa các frame', () => {
  const result = run({ scenario: isolated, ticks: 61,
    frames: [{ tick: 0, move: [1, 1], cam_yaw_deg: 90 }, { tick: 60, jump: true }] });
  assert.deepEqual(result.snapshots[0].player.pos, [0, 0, 0]);
  const delta = Number((t.player_speed / Math.sqrt(2)).toFixed(3));
  assert.deepEqual(result.snapshots[60].player.pos, [delta, 0, -delta]);
  assert.ok(result.snapshots[61].player.pos[1] > 0);
  assert.equal(result.snapshots[61].sim_tick, 61);
  assert.equal(result.end.ticks, 61);
});

test('nhặt trong bán kính, giới hạn sức chứa và không nạp lặp khi giữ E', () => {
  const result = run({
    scenario: { ...isolated, motes: Array.from({ length: 20 }, () => [t.pickup_radius, 0, 0]),
      lanterns: [{ id: 'L1', pos: [0, 0, 0] }, { id: 'L2', pos: [0, 0, 0] }] },
    ticks: 4,
    frames: [{ tick: 0, interact: true }, { tick: 2, interact: false }, { tick: 3, interact: true }],
  });
  assert.equal(result.snapshots[1].player.carried, t.carry_capacity - t.lantern_cost);
  assert.deepEqual(result.events.filter(event => event.name === 'deposit').map(event => [event.tick, event.data.lantern_id]), [[1, 'L1'], [4, 'L2']]);
});

test('nạp một phần rồi thắp đèn cuối, cộng điểm và dừng ngay ở tick thắng', () => {
  const result = run({ scenario: { ...isolated, time_left_s: 60, player: { carried: 2 },
    motes: [[0, 0, 0]], lanterns: [
      { id: 'L1', pos: [0, 0, 0], deposited: 2 },
      ...[2, 3, 4, 5].map(id => ({ id: 'L' + id, lit: true })),
    ] }, frames: [{ tick: 0, interact: true }] });
  assert.equal(result.snapshots[0].score, 0);
  assert.deepEqual(result.events.map(row => row.name), ['mote_picked', 'deposit', 'lantern_lit', 'game_over']);
  assert.deepEqual(result.events[1].data, { lantern_id: 'L1', amount: 3, deposited: 5 });
  assert.deepEqual(result.end, { type: 'end', ticks: 1, state: 'won',
    score: t.score.per_mote + t.score.per_lantern + 59 * t.score.per_second_left + t.flames * t.score.per_flame_left });
});

test('xung đẩy và làm choáng theo XZ, tôn trọng cooldown và cạnh lên', () => {
  const result = run({ scenario: { ...isolated, player: { carried: 8 },
    shades: [{ id: 'ink', pos: [4, 10, 0] }, { id: 'far', pos: [6, 0, 0] }] },
    frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 2, pulse: true }] });
  assert.deepEqual(result.events.filter(row => row.name === 'pulse').map(row => row.data), [{ stunned_ids: ['ink'] }]);
  assert.deepEqual(result.snapshots[1].shades[0], { id: 'ink', pos: [6, 10, 0], state: 'stunned' });
  assert.equal(result.snapshots[120].player.carried, 8 - t.pulse_cost);
});

test('sát thương theo nhịp bất tử, thua khi hết lửa, vùng đèn bảo vệ và bình minh', () => {
  const shades = [{ pos: [0, 0, 0] }];
  const hit = run({ scenario: { ...isolated, shades, player: { flames: 2 } }, ticks: 400 });
  assert.deepEqual(hit.events.filter(row => row.name === 'player_hit').map(row => row.tick), [1, 91]);
  assert.deepEqual(hit.events.at(-1).data, { result: 'lost', reason: 'no_flames' });
  const dawn = run({ scenario: { ...isolated, shades, time_left_s: 0.1,
    lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }] } });
  assert.equal(dawn.end.ticks, 6);
  assert.deepEqual(dawn.events.map(row => row.data), [{ result: 'lost', reason: 'dawn' }]);
});

test('output trùng từng byte với cùng seed; đổi seed thay đổi màn mặc định', () => {
  const first = run({ ticks: 30 });
  assert.ok(first.snapshots[0].motes.length > 0);
  assert.ok(first.snapshots[0].motes.every(mote => mote.pos[1] === 0));
  assert.equal(first.raw, run({ ticks: 30 }).raw);
  assert.notEqual(first.raw, run({ ticks: 30, seed: 43 }).raw);
});

test('màn mặc định của bản web có đường chơi thắng đủ năm đèn', () => {
  const seed = 2026;
  const game = new Game(t, seed);
  const frames = [];
  const distance = pos => Math.hypot(pos[0] - game.player.pos[0], pos[2] - game.player.pos[2]);
  const closest = items => items.reduce((a, b) => distance(a.pos) < distance(b.pos) ? a : b);
  while (game.state === 'playing' && game.tick < 3600) {
    const { player, previousInput } = game;
    const lantern = closest(game.lanterns.filter(item => !item.lit));
    const target = player.carried >= t.lantern_cost ? lantern : closest(game.motes);
    const gap = distance(target.pos);
    const input = {
      move: gap ? [(target.pos[0] - player.pos[0]) / gap, (target.pos[2] - player.pos[2]) / gap] : [0, 0],
      cam_yaw_deg: 0,
      interact: !previousInput.interact && target === lantern && gap <= t.interact_radius,
      pulse: !previousInput.pulse && player.carried >= t.pulse_cost
        && game.shades.some(shade => shade.stunnedUntil <= game.tick && distance(shade.pos) < 1.5),
    };
    frames.push({ tick: game.tick, ...input });
    game.step(input);
  }
  const replay = run({ seed, frames, ticks: 3600 });
  assert.equal(replay.events.filter(row => row.name === 'lantern_lit').length, 5);
  assert.deepEqual(replay.events.at(-1).data, { result: 'won', reason: 'all_lit' });
  assert.equal(replay.end.ticks, 1683);
  assert.equal(replay.end.score, 1162);
});

test('inputs hoặc scenario sai định dạng thoát mã 2 và ghi stderr', () => {
  for (const result of [run({ frames: [{ tick: 1 }, { tick: 1 }] }),
    run({ scenario: { motes: [[0, 0]] } })]) {
    assert.equal(result.status, 2);
    assert.match(result.stderr, /sai định dạng/);
  }
});
