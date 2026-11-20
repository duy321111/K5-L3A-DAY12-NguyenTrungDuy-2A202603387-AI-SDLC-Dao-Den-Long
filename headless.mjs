import { readFileSync, writeFileSync } from 'node:fs';
import { Game, defaultInput } from './src/game.mjs';

const contract = JSON.parse(readFileSync(new URL('./game.contract.json', import.meta.url), 'utf8'));
const flags = new Set(['seed', 'night', 'scenario', 'inputs', 'ticks', 'out', 'snapshot-every']);
const args = {};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const position = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const boolean = value => typeof value === 'boolean';
const optional = (value, validate) => value === undefined || validate(value);
const arrayOf = (value, validate) => Array.isArray(value) && value.every(validate);

function inputsValid(inputs) {
  if (!object(inputs)) return false;
  let previous = -1;
  return arrayOf(inputs.frames, frame => {
    if (!object(frame) || !integer(frame.tick) || frame.tick <= previous) return false;
    previous = frame.tick;
    return optional(frame.move, move => Array.isArray(move) && move.length === 2
      && move.every(value => Number.isFinite(value) && Math.abs(value) <= 1))
      && optional(frame.cam_yaw_deg, Number.isFinite)
      && ['jump', 'interact', 'pulse', 'dash'].every(key => optional(frame[key], boolean));
  });
}

function scenarioValid(scenario) {
  const t = contract.tuning;
  return object(scenario)
    && optional(scenario.player, player => object(player) && optional(player.pos, position)
      && optional(player.carried, value => integer(value) && value <= t.carry_capacity)
      && optional(player.flames, integer))
    && optional(scenario.time_left_s, time => Number.isFinite(time) && time >= 0)
    && optional(scenario.random_motes, boolean) && optional(scenario.random_shades, boolean)
    && optional(scenario.motes, motes => arrayOf(motes, position))
    && optional(scenario.shades, shades => arrayOf(shades, shade => object(shade) && position(shade.pos)
      && optional(shade.id, id => typeof id === 'string' && id.length > 0))
      && new Set(shades.filter(shade => shade.id !== undefined).map(shade => shade.id)).size
        === shades.filter(shade => shade.id !== undefined).length)
    && optional(scenario.lanterns, lanterns => arrayOf(lanterns, lantern => object(lantern)
      && /^L[1-5]$/.test(lantern.id) && optional(lantern.pos, position)
      && optional(lantern.lit, boolean)
      && optional(lantern.deposited, value => integer(value) && value <= t.lantern_cost))
      && new Set(lanterns.map(lantern => lantern.id)).size === lanterns.length);
}

function readInput(path, validate) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
    if (!validate(value)) throw new Error('sai định dạng');
    return value;
  } catch (error) {
    error.exitCode = 2;
    error.message = path + ': ' + error.message;
    throw error;
  }
}

try {
  for (let i = 2; i < process.argv.length; i += 2) {
    const flag = process.argv[i].slice(2);
    const value = process.argv[i + 1];
    if (!process.argv[i].startsWith('--') || !flags.has(flag) || !value || value.startsWith('--') || flag in args) {
      throw new Error('Tham số không hợp lệ: ' + process.argv[i]);
    }
    args[flag] = value;
  }
  const seed = Number(args.seed);
  const ticks = Number(args.ticks);
  const every = Number(args['snapshot-every'] ?? 10);
  if (args.night !== '1' || !args.out || !Number.isSafeInteger(seed) || !integer(ticks) || !integer(every) || every === 0) {
    throw new Error('Cần --seed <int> --night 1 --ticks <int> --out <file.jsonl>');
  }
  const scenario = args.scenario ? readInput(args.scenario, scenarioValid) : {};
  const frames = args.inputs ? readInput(args.inputs, inputsValid).frames : [];
  const game = new Game(contract.tuning, seed, scenario);
  const lines = [];
  const append = value => lines.push(JSON.stringify(value));
  let input = defaultInput;
  let frame = 0;
  append(game.snapshot());
  while (game.tick < ticks && game.state === 'playing') {
    if (frames[frame]?.tick === game.tick) {
      const { tick, ...changes } = frames[frame++];
      input = { ...input, ...changes };
    }
    game.step(input).forEach(append);
    if (game.tick % every === 0) append(game.snapshot());
  }
  append({ type: 'end', ticks: game.tick, state: game.state, score: game.score });
  writeFileSync(args.out, lines.join('\n') + '\n');
} catch (error) {
  console.error(error.message);
  process.exitCode = error.exitCode ?? 1;
}
