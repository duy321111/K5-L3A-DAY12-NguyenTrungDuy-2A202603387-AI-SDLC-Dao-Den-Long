export const HZ = 60;
export const ISLAND_RADIUS = 32;
export const defaultInput = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false };
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

function randomFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export class Game {
  constructor(tuning, seed, scenario = {}) {
    this.tuning = tuning;
    this.tick = 0;
    this.state = 'playing';
    this.score = 0;
    this.duration = scenario.time_left_s ?? tuning.night1_duration_s;
    this.previousInput = defaultInput;
    this.velocityY = 0;
    this.invulnerableUntil = 0;
    this.pulseReady = 0;
    this.player = { pos: [0, 0, 0], carried: 0, flames: tuning.flames, ...scenario.player };
    this.player.pos = [...this.player.pos];
    this.lanterns = Array.from({ length: tuning.lantern_count_night1 }, (_, index) => {
      const angle = index * Math.PI * 2 / tuning.lantern_count_night1;
      const id = 'L' + (index + 1);
      const patch = scenario.lanterns?.find(item => item.id === id);
      const deposited = patch?.deposited ?? (patch?.lit ? tuning.lantern_cost : 0);
      return {
        id, pos: patch?.pos ?? [Math.sin(angle) * 20, 0, Math.cos(angle) * 20],
        deposited, lit: patch?.lit ?? deposited >= tuning.lantern_cost,
      };
    });
    const random = randomFor(seed);
    const randomPos = (min, max, y) => {
      const radius = min + (max - min) * random();
      const angle = random() * Math.PI * 2;
      return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
    };
    const motes = scenario.motes ?? (scenario.random_motes === false
      ? [] : Array.from({ length: 65 }, () => randomPos(2, 29, 0)));
    const shades = scenario.shades ?? (scenario.random_shades === false
      ? [] : Array.from({ length: 3 }, () => ({ pos: randomPos(22, 29, 0.75) })));
    this.motes = motes.map((pos, index) => ({ id: 'M' + (index + 1), pos }));
    const usedIds = new Set(shades.flatMap(shade => shade.id === undefined ? [] : [shade.id]));
    let shadeNumber = 1;
    this.shades = shades.map(shade => {
      let id = shade.id;
      if (id === undefined) {
        while (usedIds.has('S' + shadeNumber)) shadeNumber++;
        id = 'S' + shadeNumber++;
      }
      return { id, pos: [...shade.pos], stunnedUntil: 0 };
    });
  }

  get timeLeft() {
    return Math.max(0, this.duration - this.tick / HZ);
  }

  move(input, jumped) {
    const pos = this.player.pos;
    const [x, z] = input.move;
    const scale = this.tuning.player_speed / (HZ * Math.max(1, Math.hypot(x, z)));
    const yaw = input.cam_yaw_deg * Math.PI / 180;
    const nextX = pos[0] + (x * Math.cos(yaw) + z * Math.sin(yaw)) * scale;
    const nextZ = pos[2] + (-x * Math.sin(yaw) + z * Math.cos(yaw)) * scale;
    if (Math.hypot(nextX, nextZ) <= Math.max(ISLAND_RADIUS, Math.hypot(pos[0], pos[2]))) {
      pos[0] = nextX;
      pos[2] = nextZ;
    }
    if (jumped && pos[1] === 0) this.velocityY = 6;
    if (pos[1] > 0 || this.velocityY > 0) {
      pos[1] = Math.max(0, pos[1] + this.velocityY / HZ);
      this.velocityY -= 18 / HZ;
      if (pos[1] === 0) this.velocityY = 0;
    }
  }

  pickUp(emit) {
    const { tuning, player } = this;
    this.motes = this.motes.filter(mote => {
      if (player.carried >= tuning.carry_capacity || distance(player.pos, mote.pos) > tuning.pickup_radius) return true;
      player.carried++;
      this.score += tuning.score.per_mote;
      emit('mote_picked', { carried: player.carried });
      return false;
    });
  }

  deposit(emit) {
    const { tuning, player } = this;
    let nearest;
    let best = tuning.interact_radius;
    for (const lantern of this.lanterns) {
      const gap = distance(player.pos, lantern.pos);
      if (!lantern.lit && gap <= best && (!nearest || gap < best)) {
        nearest = lantern;
        best = gap;
      }
    }
    if (!nearest || player.carried === 0) return;
    const amount = Math.min(player.carried, tuning.lantern_cost - nearest.deposited);
    if (amount <= 0) return;
    player.carried -= amount;
    nearest.deposited += amount;
    emit('deposit', { lantern_id: nearest.id, amount, deposited: nearest.deposited });
    if (nearest.deposited === tuning.lantern_cost) {
      nearest.lit = true;
      this.score += tuning.score.per_lantern;
      emit('lantern_lit', { lantern_id: nearest.id });
    }
  }

  pulse(emit) {
    const { tuning, player } = this;
    if (this.tick < this.pulseReady || player.carried < tuning.pulse_cost) return;
    player.carried -= tuning.pulse_cost;
    this.pulseReady = this.tick + Math.ceil(tuning.pulse_cooldown_s * HZ);
    const stunnedIds = [];
    for (const shade of this.shades) {
      const gap = distance(shade.pos, player.pos);
      if (gap > tuning.pulse_radius) continue;
      const dx = gap === 0 ? 1 : (shade.pos[0] - player.pos[0]) / gap;
      const dz = gap === 0 ? 0 : (shade.pos[2] - player.pos[2]) / gap;
      shade.pos[0] += dx * tuning.pulse_push_m;
      shade.pos[2] += dz * tuning.pulse_push_m;
      shade.stunnedUntil = this.tick + Math.ceil(tuning.pulse_stun_s * HZ);
      stunnedIds.push(shade.id);
    }
    this.score += stunnedIds.length * tuning.score.per_stun;
    emit('pulse', { stunned_ids: stunnedIds });
  }

  chase(emit) {
    const { tuning, player } = this;
    const safe = this.lanterns.filter(lantern => lantern.lit);
    const playerSafe = safe.some(lantern => distance(player.pos, lantern.pos) <= tuning.safe_radius);
    for (const shade of this.shades) {
      if (this.tick < shade.stunnedUntil) continue;
      for (const lantern of safe) {
        const gap = distance(shade.pos, lantern.pos);
        if (gap >= tuning.safe_radius) continue;
        const dx = gap === 0 ? 1 : (shade.pos[0] - lantern.pos[0]) / gap;
        const dz = gap === 0 ? 0 : (shade.pos[2] - lantern.pos[2]) / gap;
        shade.pos[0] = lantern.pos[0] + dx * tuning.safe_radius;
        shade.pos[2] = lantern.pos[2] + dz * tuning.safe_radius;
      }
      const gap = distance(shade.pos, player.pos);
      if (gap > 0) {
        const fraction = Math.min(1, tuning.shade_speed / HZ / gap);
        const next = [
          shade.pos[0] + (player.pos[0] - shade.pos[0]) * fraction,
          shade.pos[1],
          shade.pos[2] + (player.pos[2] - shade.pos[2]) * fraction,
        ];
        if (safe.every(lantern => distance(next, lantern.pos) >= tuning.safe_radius)) shade.pos = next;
      }
      if (playerSafe || this.tick < this.invulnerableUntil || distance(shade.pos, player.pos) > tuning.shade_hit_radius) continue;
      player.flames = Math.max(0, player.flames - 1);
      const dropped = Math.floor(player.carried * tuning.hit_drop_ratio);
      player.carried -= dropped;
      this.invulnerableUntil = this.tick + Math.ceil(tuning.invuln_s * HZ);
      emit('player_hit', { by: 'shade', flames: player.flames, dropped });
      if (player.flames === 0) break;
    }
  }

  step(input = defaultInput) {
    if (this.state !== 'playing') return [];
    this.tick++;
    const events = [];
    const emit = (name, data) => events.push({ type: 'event', tick: this.tick, name, data });
    const pressed = key => input[key] && !this.previousInput[key];
    this.move(input, pressed('jump'));
    this.pickUp(emit);
    if (pressed('interact')) this.deposit(emit);
    if (pressed('pulse')) this.pulse(emit);
    const allLit = this.lanterns.every(lantern => lantern.lit);
    if (!allLit && this.player.flames > 0) this.chase(emit);

    let reason;
    if (this.player.flames === 0) reason = 'no_flames';
    else if (allLit) {
      reason = 'all_lit';
      this.score += Math.floor(this.timeLeft) * this.tuning.score.per_second_left
        + this.player.flames * this.tuning.score.per_flame_left;
    } else if (this.timeLeft === 0) reason = 'dawn';
    if (reason) {
      this.state = reason === 'all_lit' ? 'won' : 'lost';
      emit('game_over', { result: this.state, reason });
    }

    this.previousInput = { ...input };
    return events;
  }

  snapshot() {
    const position = item => item.pos.map(value => Number(value.toFixed(3)));
    return {
      type: 'snapshot', tick: this.tick, sim_tick: this.tick, state: this.state,
      time_left_s: this.timeLeft, score: this.score,
      player: { ...this.player, pos: position(this.player) },
      lanterns: this.lanterns.map(lantern => ({ ...lantern, pos: position(lantern) })),
      shades: this.shades.map(shade => ({
        id: shade.id, pos: position(shade),
        state: this.tick < shade.stunnedUntil ? 'stunned' : 'chase',
      })),
      motes_active: this.motes.length,
      motes: this.motes.map(mote => ({ id: mote.id, pos: position(mote) })),
    };
  }
}
