import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NightGame } from '../src/night-game.mjs';

const t = JSON.parse(readFileSync('game.contract.json', 'utf8')).tuning;
const isolated = { random_motes: false, random_shades: false };

function run({ scenario, frames, ticks = 120, seed = 42, night = 1 } = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'dao-den-long-'));
  try {
    const out = join(temp, 'out.jsonl');
    const args = ['headless.mjs', '--seed', String(seed), '--night', String(night),
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
  assert.deepEqual(result.events.filter(event => event.name === 'deposit')
    .map(event => [event.tick, event.data.lantern_id]), [[1, 'L1'], [4, 'L2']]);
});


test('thắp chiếc đèn cuối thì thắng ngay với công thức Phase 2', () => {
  const result = run({ scenario: { ...isolated, time_left_s: 60, player: { carried: 2 },
    motes: [[0, 0, 0]], lanterns: [
      { id: 'L1', pos: [0, 0, 0], deposited: t.lantern_cost - 3 },
      ...[2, 3, 4, 5].map(id => ({ id: 'L' + id, lit: true })),
    ] }, frames: [{ tick: 0, interact: true }] });
  assert.equal(result.snapshots[0].score, 0);
  assert.deepEqual(result.events.at(-1).data, { result:'won', reason:'all_lit' });
  assert.equal(result.end.ticks, 1);
  assert.equal(result.end.score, 3 * t.score.per_mote + t.score.per_lantern + 59 * t.score.per_second_left + t.flames * 50);
});

test('xung đẩy đo 3D, đẩy 4 m trong 15 tick và chặn xung thứ hai khi hồi chiêu', () => {
  const result = run({ scenario: { ...isolated, player: { carried: 8 },
    shades: [{ id: 'ink', pos: [4, 0.8, 0] }, { id: 'far', pos: [4, 10, 0] }] },
    frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 2, pulse: true }] });
  assert.deepEqual(result.events.filter(row => row.name === 'pulse').map(row => row.data), [{ stunned_ids: ['ink'] }]);
  assert.deepEqual(result.snapshots[1].shades[0], { id: 'ink', pos: [4.267, 0.8, 0], state: 'stunned' });
  assert.deepEqual(result.snapshots[15].shades[0], { id: 'ink', pos: [8, 0.8, 0], state: 'stunned' });
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
  assert.deepEqual(dawn.events.at(-1).data, { result: 'lost', reason: 'dawn' });
});

test('output trùng từng byte với cùng seed; đổi seed thay đổi màn mặc định', () => {
  const first = run({ ticks: 30 });
  assert.ok(first.snapshots[0].motes.length > 0);
  assert.ok(first.snapshots[0].motes.every(mote => mote.pos[1] === 0));
  assert.equal(first.raw, run({ ticks: 30 }).raw);
  assert.notDeepEqual(first.snapshots[0].motes, run({ ticks: 0, seed: 43 }).snapshots[0].motes);
});

test('pause giữ sim_tick, thời gian, TTL và hồi chiêu qua nhiều tick', () => {
  const result = run({ night: 3, ticks: 6, scenario: { ...isolated, wind_enabled: false,
    player: { dash_cd_ticks: 30 }, motes: [{ pos: [20,0,0], kind: 'dropped', ttl_ticks: 60 }] },
  frames: [{ tick: 1, pause: true }, { tick: 2, pause: false }, { tick: 4, pause: true }] });
  const [playing, paused, resumed] = [1, 4, 5].map(tick => result.snapshots[tick]);
  assert.equal(paused.state, 'paused');
  assert.equal(paused.sim_tick, 1);
  assert.equal(paused.time_left_s, playing.time_left_s);
  assert.equal(paused.player.dash_cd_s, playing.player.dash_cd_s);
  assert.equal(paused.motes[0].ttl_s, playing.motes[0].ttl_s);
  assert.equal(resumed.sim_tick, 2);
  assert.deepEqual(result.events.map(row => row.name), ['night_start', 'paused', 'resumed']);
});

test('Lướt 12 tick có hướng và hồi chiêu; Bùa Gió cho lướt lại', () => {
  const frames = [{ tick: 0, dash: true, move: [1,0] }, { tick: 1, dash: false },
    { tick: 12, dash: true }];
  const normal = run({ scenario: isolated, frames, ticks: 13 });
  assert.deepEqual(normal.snapshots[12].player.pos, [2.8,0,0]);
  assert.equal(normal.events.filter(row => row.name === 'dash').length, 1);
  const charm = run({ night: 2, scenario: { ...isolated, player: { pos: [35,0,0] } },
    frames: [{ tick: 1, dash: true }, { tick: 2, dash: false }, { tick: 13, dash: true }], ticks: 14 });
  assert.equal(charm.events.filter(row => row.name === 'dash').length, 2);
  assert.deepEqual(charm.events.find(row => row.name === 'charm_picked').data, { charm_id: 'C1', charm_ticks: 600 });
  assert.equal(charm.snapshots[1].charms[0].respawn_s, 45);
  assert.equal(charm.snapshots[14].player.dash_cd_s, 0);
});

test('Đêm 2 qua cầu và bục phóng; rơi mất Ngọn Lửa và ánh sáng', () => {
  const crossing = run({ night: 2, scenario: { ...isolated, player: { pos: [25,0,0] }, charms: [] },
    frames: [{ tick: 0, move: [1,0] }], ticks: 210 });
  assert.ok(crossing.snapshots.at(-1).player.pos[0] > 44);
  assert.equal(crossing.events.some(row => row.name === 'player_hit'), false);
  const pad = run({ night: 2, scenario: { ...isolated, player: { pos: [20,0,18] } }, ticks: 100 });
  assert.equal(pad.snapshots[1].player.vel[0] > 20, true);
  assert.equal(pad.snapshots[100].player.grounded, true);
  assert.ok(pad.snapshots[100].player.pos[0] > 42);
  const fall = run({ scenario: { ...isolated, player: { pos: [39.9,0,0], carried: 5 } },
    frames: [{ tick: 0, move: [1,0] }], ticks: 90 });
  assert.deepEqual(fall.events.find(row => row.name === 'player_hit').data,
    { by: 'fall', flames: t.flames - 1, dropped: 0, lost: 5 });
});

test('Đêm 3 có dốc lên tầng 1, bục phóng lên tầng 2 và gió đúng lịch', () => {
  const angle = Math.PI / 6;
  const ramp = run({ night: 3, scenario: { ...isolated, wind_enabled: false,
    player: { pos: [31 * Math.cos(angle),0,31 * Math.sin(angle)] } },
  frames: [{ tick: 0, move: [-Math.cos(angle),-Math.sin(angle)] }], ticks: 85 });
  assert.equal(ramp.snapshots[85].player.pos[1], 3);
  const pad = run({ night: 3, scenario: { ...isolated, player: { pos: [0,3,13] } }, ticks: 95 });
  assert.equal(pad.snapshots[95].player.pos[1], 6);
  const wind = run({ night: 3, scenario: { ...isolated, random_drifters: false }, ticks: 2101 });
  assert.equal(wind.snapshots[1799].wind.active, false);
  assert.equal(wind.snapshots[1800].wind.active, true);
  assert.equal(wind.snapshots[2100].wind.active, false);
});

test('Gió Lạc cướp trước Bóng Mực, rơi lại đồ khi trúng Tỏa Sáng', () => {
  const order = run({ night: 2, scenario: { ...isolated, player: { carried: 8 },
    shades: [{ pos: [0,0,0] }], drifters: [{ pos: [0,0,0], state: 'chase' }] }, ticks: 1 });
  assert.deepEqual(order.events.map(row => row.name), ['night_start', 'drifter_steal', 'player_hit']);
  assert.equal(order.snapshots[1].player.carried, 3);
  const pulse = run({ night: 2, scenario: { ...isolated, player: { carried: 4 },
    drifters: [{ pos: [2,0,0], state: 'flee', stolen: 3 }] },
  frames: [{ tick: 0, pulse: true }], ticks: 122 });
  assert.deepEqual(pulse.events.find(row => row.name === 'drifter_drop').data, { drifter_id: 'D1', amount: 3 });
  assert.equal(pulse.snapshots[1].motes.filter(mote => mote.kind === 'dropped').length, 3);
  assert.equal(pulse.snapshots[121].drifters[0].state, 'removed');
});

test('nhảy 7 m/s, lướt trên không giữ cao độ, đứng yên dùng hướng Mây đã quay', () => {
  const result = run({ ticks: 16, scenario: isolated, frames: [
    { tick:0, move:[1,0], jump:true },
    { tick:1, move:[0,0], cam_yaw_deg:75, dash:true },
  ] });
  assert.equal(result.snapshots[1].player.pos[1], 0.117);
  assert.equal(result.snapshots[13].player.pos[1], 0.117);
  assert.deepEqual(result.snapshots[13].player.pos, [2.9,0.117,0]);
  assert.equal(result.snapshots[2].player.dash_cd_s, 1.5);
  assert.ok(result.snapshots[14].player.pos[1] > 0.117);
});

test('20 đom đóm lúc đầu, sinh thêm đúng tick 240 và nhặt theo chênh cao', () => {
  const spawn = run({ ticks:240, scenario:{ random_shades:false } });
  assert.equal(spawn.snapshots[0].motes.length,20);
  assert.equal(spawn.snapshots[239].motes.length,20);
  assert.equal(spawn.snapshots[240].motes.length,21);
  const pickup = run({ ticks:1, scenario:{ ...isolated, motes:[[1,1.5,0],[0,1.51,0]] } });
  assert.equal(pickup.snapshots[1].player.carried,1);
  assert.equal(pickup.snapshots[1].motes.length,1);
});

test('bị đánh rơi nửa túi trong vành 1,5–2,5 m và hết hạn đúng 480 tick', () => {
  const hit = run({ ticks:481, scenario:{ ...isolated, player:{ carried:5, flames:50 },
    shades:[{ pos:[0,0,0] }] } });
  assert.equal(hit.events.find(row=>row.name==='player_hit').data.dropped,2);
  const drops = hit.snapshots[1].motes;
  assert.equal(drops.length,2);
  assert.ok(drops.every(mote => mote.ttl_s===8 && Math.hypot(mote.pos[0],mote.pos[2])>=1.499
    && Math.hypot(mote.pos[0],mote.pos[2])<=2.501));
  assert.ok(hit.snapshots[480].motes.some(mote=>mote.id===drops[0].id));
  assert.ok(hit.snapshots[481].motes.every(mote=>mote.id!==drops[0].id));
});

test('rơi dưới -10 bỏ qua bất tử, không nhặt khi chờ, hồi sinh sau 60 tick', () => {
  const fall = run({ ticks:61, scenario:{ ...isolated,
    player:{ pos:[41,-10.1,0], carried:4, invuln_ticks:90 },
    motes:[[41,-10.1,0]] } });
  assert.equal(fall.events.find(row=>row.name==='player_hit').tick,1);
  assert.equal(fall.events.filter(row=>row.name==='player_hit').length,1);
  assert.equal(fall.snapshots[60].player.carried,0);
  assert.deepEqual(fall.snapshots[61].player.pos,[0,0,0]);
  assert.deepEqual(fall.snapshots[61].player.vel,[0,0,0]);
  assert.equal(fall.snapshots[61].player.invuln,true);
});

test('Bóng Mực sinh đúng mốc đầu tiên và Gió Lạc tự sinh tại tick 1200', () => {
  const first = run({ scenario: { random_motes: false }, ticks: 301 });
  assert.deepEqual(first.events.filter(row => row.name === 'shade_spawned').map(row => row.tick), [300,300]);
  assert.ok(first.snapshots[300].shades.every(shade => shade.state === 'spawning'
    && Math.hypot(shade.pos[0], shade.pos[2]) >= 36.999));
  const second = run({ night: 2, scenario: isolated, ticks: 1200 });
  assert.equal(second.snapshots[1199].drifters.length, 0);
  assert.equal(second.snapshots[1200].drifters[0].id, 'D1');
});

test('Bùa hết hiệu lực sau 600 tick và xuất hiện lại sau 2700 tick', () => {
  const result = run({ night: 2, ticks: 2701, scenario: {
    ...isolated, random_drifters: false, charms: [{ id: 'C1', pos: [0,0,0] }],
  }, frames: [{ tick: 0, move: [1,0] }, { tick: 30, move: [0,0] }] });
  assert.equal(result.snapshots[601].player.charm_s, 0);
  assert.equal(result.snapshots[2700].charms[0].available, false);
  assert.equal(result.snapshots[2701].charms[0].available, true);
});

test('Đêm 3 không leo được vách tầng; bước khỏi vành khăn thì đáp ở tầng 0', () => {
  const frames = [{ tick: 0, move: [0, 1] }];
  const lower = run({ night: 3, scenario: { ...isolated, player: { pos: [0,0,25] } },
    frames: [{ tick: 0, move: [0,-1], dash: true }], ticks: 30 });
  assert.ok(lower.snapshots[30].player.pos[2] > 24, 'cannot dash into the lower terrace wall');
  const upper = run({ night: 3, scenario: { ...isolated, player: { pos: [0,0,-9] } }, frames, ticks: 30 });
  assert.ok(upper.snapshots[30].player.pos[2] <= -8, 'cannot walk under the tower terrace');
  const falling = run({ night: 3, scenario: { ...isolated, player: { pos: [0,3,23.9] } }, frames, ticks: 40 });
  assert.equal(falling.snapshots[40].player.pos[1], 0);
  assert.equal(falling.snapshots[40].player.grounded, true);
  assert.equal(falling.events.some(row => row.name === 'player_hit'), false);
});

test('đá trang trí chặn đi bộ và lướt; Mây vẫn đi vòng được', () => {
  const game = new NightGame(t, 42, 1, isolated);
  game.obstacles = [{ pos: [2, 0, 0], radius: 0.85, height: 0.95 }];
  for (let tick = 0; tick < 60; tick++) {
    game.step({ move: [1, 0], cam_yaw_deg: 0, dash: tick === 0 });
  }
  assert.ok(game.player.pos[0] < 0.9);
  for (let tick = 0; tick < 16; tick++) game.step({ move: [0, 1], cam_yaw_deg: 0 });
  for (let tick = 0; tick < 40; tick++) game.step({ move: [1, 0], cam_yaw_deg: 0 });
  assert.ok(game.player.pos[0] > 3);
});

test('inputs hoặc scenario sai định dạng thoát mã 2 và ghi stderr', () => {
  for (const result of [run({ frames: [{ tick: 1 }, { tick: 1 }] }),
    run({ scenario: { motes: [[0, 0]] } })]) {
    assert.equal(result.status, 2);
    assert.match(result.stderr, /sai định dạng/);
  }
});
