import { defaultInput, HZ } from './game.mjs';
import { nights } from './nights.mjs';

export const shadeStates = ['spawning', 'wander', 'chase', 'recoil', 'stunned'];
export const drifterStates = ['idle', 'chase', 'flee', 'removed'];
const gap = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const byId = (a, b) => a.id.localeCompare(b.id, 'en', { numeric: true });
const round = pos => pos.map(value => Number(value.toFixed(3)));
const ticks = seconds => Math.round(seconds * HZ);
const seconds = counter => counter / HZ;
const decrement = value => Math.max(0, value - 1);
const gravity = 20;

function unit(x, z, fallback = [1, 0]) {
  const length = Math.hypot(x, z);
  return length ? [x / length, z / length] : fallback;
}

function ids(prefix, entries) {
  let count = 0;
  const used = new Set(entries.map(entry => entry.id));
  return () => {
    let id;
    do { id = prefix + ++count; } while (used.has(id));
    return id;
  };
}

export class NightGame {
  constructor(tuning, seed, night = 1, scenario = {}, layout = nights[night]) {
    this.tuning = tuning;
    this.night = night;
    this.layout = layout;
    this.seedState = seed >>> 0;
    this.tick = 0;
    this.simTick = 0;
    this.state = 'playing';
    this.score = 0;
    this.duration = scenario.time_left_s ?? tuning['night' + night + '_duration_s'];
    this.previousInput = defaultInput;
    this.wind = { active: false, dir_deg: 0 };
    this.windEnabled = scenario.wind_enabled ?? night === 3;
    this.facing = [0, 1];
    this.dash = null;
    this.launch = null;
    this.respawnAt = 0;
    this.obstacles = [];
    this.randomShades = scenario.random_shades !== false;
    this.randomMotes = scenario.random_motes !== false;
    this.randomDrifters = scenario.random_drifters !== false && night > 1;

    const player = scenario.player ?? {};
    this.player = {
      pos: [...(player.pos ?? layout.spawn ?? [0, 0, 0])], vel: [0, 0, 0], carried: player.carried ?? 0,
      flames: player.flames ?? tuning.flames, invuln: player.invuln_ticks ?? 0,
      dashCd: player.dash_cd_ticks ?? 0, pulseCd: player.pulse_cd_ticks ?? 0, charm: player.charm_ticks ?? 0,
    };
    this.player.grounded = this.layout.floors(this.player.pos[0], this.player.pos[2]).includes(this.player.pos[1]);
    this.lanterns = this.layout.lanterns.map((pos, index) => {
      const id = 'L' + (index + 1);
      const override = scenario.lanterns?.find(item => item.id === id);

      const deposited = override?.deposited ?? (override?.lit ? tuning.lantern_cost : 0);
      return { id, pos: [...(override?.pos ?? pos)], deposited, lit: override?.lit ?? deposited >= tuning.lantern_cost };
    });

    const points = [...this.layout.motePoints];
    for (let index = points.length - 1; index > 0; index--) {
      const other = Math.floor(this.random() * (index + 1));
      [points[index], points[other]] = [points[other], points[index]];
    }
    const motes = scenario.motes ?? (this.randomMotes ? points.slice(0, 20) : []);
    const shades = scenario.shades ?? [];
    const drifters = scenario.drifters ?? [];
    const charms = scenario.charms ?? this.layout.charms.map(pos => ({ pos }));
    this.nextMote = ids('M', motes);
    this.nextShade = ids('S', shades);
    this.nextDrifter = ids('D', drifters);
    const nextCharm = ids('C', charms);
    this.motes = motes.map(mote => ({
      id: mote.id ?? this.nextMote(), pos: [...(mote.pos ?? mote)],
      kind: mote.kind ?? 'random', ttl: mote.ttl_ticks ?? (mote.kind === 'dropped' ? 480 : null),
    }));
    this.shades = shades.map(shade => ({
      id: shade.id ?? this.nextShade(), pos: [...shade.pos],
      state: shade.state ?? 'chase', timer: shade.state_ticks_left ?? 0,
    }));
    this.drifters = drifters.map(drifter => ({
      id: drifter.id ?? this.nextDrifter(), pos: [...drifter.pos], state: drifter.state ?? 'idle',
      stolen: drifter.stolen ?? 0, timer: drifter.state_ticks_left ?? (drifter.state === 'flee' ? 240 : 0),
    }));
    this.charms = charms.map((charm, index) => ({
      id: charm.id ?? nextCharm(), pos: [...(charm.pos ?? this.layout.charms[index] ?? [0, 0, 0])],
      timer: charm.respawn_ticks ?? (charm.available === false ? 2700 : 0),
    }));
  }

  random() {
    this.seedState = (Math.imul(this.seedState, 1664525) + 1013904223) >>> 0;
    return this.seedState / 4294967296;
  }

  get timeLeft() {
    return Math.max(0, this.duration - seconds(this.simTick));
  }


  get capacity() { return this.tuning.carry_capacity; }

  cost() { return this.tuning.lantern_cost; }

  isWeak() { return false; }

  nearestLamp(pos, predicate) {
    return this.lanterns.filter(predicate).sort((a, b) => gap(a.pos, pos) - gap(b.pos, pos) || byId(a, b))[0];
  }

  repel(lamp) {
    for (const shade of this.shades) {
      const distance = gap(shade.pos, lamp.pos);
      if (distance >= 6) continue;
      const [dx, dz] = unit(shade.pos[0] - lamp.pos[0], shade.pos[2] - lamp.pos[2]);
      shade.repel = { x: lamp.pos[0] + dx * 6, z: lamp.pos[2] + dz * 6, remaining: 30 };
      if (shade.state !== 'stunned') {
        shade.state = 'recoil';
        shade.timer = 0;
      }
      shade.target = undefined;
      shade.drainTicks = 0;
    }
  }

  timers() {
    const p = this.player;
    p.invuln = decrement(p.invuln);
    p.dashCd = decrement(p.dashCd);
    p.pulseCd = decrement(p.pulseCd);
    p.charm = decrement(p.charm);
    for (const charm of this.charms) charm.timer = decrement(charm.timer);
    this.motes = this.motes.filter(mote => mote.ttl === null || --mote.ttl > 0);
    for (const shade of this.shades) {
      if (shade.timer > 0 && --shade.timer === 0) {
        if (shade.state === 'stunned') shade.recoveredAt = this.simTick;
        shade.state = shade.state === 'recoil' ? 'chase' : 'wander';
      }
    }
    for (const drifter of this.drifters) {
      if (drifter.state === 'flee' && --drifter.timer <= 0) drifter.state = 'removed';
    }
    if (this.windEnabled) {
      if (this.simTick % 1800 === 1680) this.wind.dir_deg = Math.floor(this.random() * 360);
      this.wind.active = this.simTick >= 1800 && this.simTick % 1800 < 300;
    }
  }

  move(input, pressed, emit) {
    const p = this.player;
    const t = this.tuning;
    const [x, z] = input.move;
    const yaw = input.cam_yaw_deg * Math.PI / 180;
    const wx = x * Math.cos(yaw) + z * Math.sin(yaw);
    const wz = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const normalizer = Math.max(1, Math.hypot(wx, wz));
    if (wx || wz) this.facing = unit(wx, wz);
    if (pressed('dash') && !this.dash && (p.charm || !p.dashCd)) {
      this.dash = { remaining: ticks(t.dash_duration_s), heading: this.facing, airborne: !p.grounded };
      p.dashCd = p.charm ? 0 : ticks(t.dash_cooldown_s);
      emit('dash', {});
    }
    const pad = p.grounded && this.layout.pads.find(item =>
      Math.abs(p.pos[1] - item.pos[1]) < 0.05 && gap(item.pos, p.pos) <= 1);
    if (pad) {
      const [dx, dz] = unit(pad.target[0] - pad.pos[0], pad.target[2] - pad.pos[2]);
      this.launch = [dx * pad.speed, dz * pad.speed];
      p.vel[1] = pad.up;
      p.grounded = false;
    } else if (pressed('jump') && p.grounded) {
      p.vel[1] = 7;
      p.grounded = false;
    }
    if (this.dash && !p.grounded) this.dash.airborne = true;

    const pace = p.charm ? 7.2 : t.player_speed;
    const [vx, vz] = this.dash ? this.dash.heading.map(value => value * t.dash_speed)
      : this.launch ?? [wx * pace / normalizer, wz * pace / normalizer];
    const windAngle = this.wind.dir_deg * Math.PI / 180;
    p.vel[0] = vx + (this.wind.active ? 2 * Math.cos(windAngle) : 0);
    p.vel[2] = vz + (this.wind.active ? 2 * Math.sin(windAngle) : 0);
    let nextX = p.pos[0] + p.vel[0] / HZ;
    let nextZ = p.pos[2] + p.vel[2] / HZ;
    const previousFloors = this.layout.floors(p.pos[0], p.pos[2]);
    if (this.obstacles.length || this.night === 3) {
      const previousTop = Math.max(0, ...previousFloors);
      const blocked = (x, z) => {
        if (this.night === 3) {
          const top = Math.max(0, ...this.layout.floors(x, z));
          if (top > previousTop + 0.2 && top > p.pos[1] + 0.15) return true;
          const radius = Math.hypot(x, z);
          if (p.pos[1] >= 6 && p.pos[1] < 14 && radius < 2.28
            && radius < Math.hypot(p.pos[0], p.pos[2])) return true;
        }
        return this.obstacles.some(({ pos, radius, height }) => {
        if (p.pos[1] >= pos[1] + height || p.pos[1] + 1 < pos[1]) return false;
        const before = Math.hypot(p.pos[0] - pos[0], p.pos[2] - pos[2]);
        const after = Math.hypot(x - pos[0], z - pos[2]);
        return after < radius + 0.28 && after < before;
        });
      };
      if (blocked(nextX, nextZ)) {
        if (!blocked(nextX, p.pos[2])) nextZ = p.pos[2];
        else if (!blocked(p.pos[0], nextZ)) nextX = p.pos[0];
        else [nextX, , nextZ] = p.pos;
        p.vel[0] = (nextX - p.pos[0]) * HZ;
        p.vel[2] = (nextZ - p.pos[2]) * HZ;
      }
    }
    const floors = this.layout.floors(nextX, nextZ);
    const ramp = floors.some(height => height > 0 && height < 3)
      || previousFloors.some(height => height > 0 && height < 3);
    const boundary = p.pos[1] + (ramp || this.layout.continuousTerrain ? 0.35 : 0.00001);
    const floor = Math.max(-Infinity, ...floors.filter(height => height <= boundary));
    p.pos[0] = nextX;
    p.pos[2] = nextZ;
    if (this.dash?.airborne) {
      p.grounded = false;
    } else if (p.grounded && Number.isFinite(floor)
      && (ramp || this.layout.continuousTerrain || Math.abs(floor - p.pos[1]) < 0.001)) {
      p.pos[1] = floor;
    } else {
      p.grounded = false;
      const nextY = p.pos[1] + p.vel[1] / HZ;
      if (p.vel[1] <= 0 && nextY <= floor) {
        p.pos[1] = floor;
        p.vel[1] = 0;
        p.grounded = true;
        this.launch = null;
      } else {
        p.pos[1] = nextY;
        p.vel[1] -= gravity / HZ;
      }
    }
    if (this.dash && --this.dash.remaining === 0) this.dash = null;
    if (p.pos[1] < -10) {
      const lost = p.carried;
      p.carried = 0;
      p.flames = Math.max(0, p.flames - 1);
      p.vel = [0, 0, 0];
      p.grounded = false;
      this.dash = this.launch = null;
      this.respawnAt = this.simTick + 60;
      emit('player_hit', { by: 'fall', flames: p.flames, dropped: 0, lost });
    }
  }

  pickUp(emit) {
    const p = this.player;
    const t = this.tuning;
    const reachable = item => gap(p.pos, item.pos) <= t.pickup_radius
      && Math.abs(p.pos[1] - item.pos[1]) <= 1.5;
    this.motes = this.motes.filter(mote => {
      if (p.carried >= this.capacity || !reachable(mote)) return true;
      emit('mote_picked', { carried: ++p.carried });
      return false;
    });
    for (const charm of this.charms) {
      if (charm.timer || !reachable(charm)) continue;
      p.charm = 600;
      p.dashCd = 0;
      charm.timer = 2700;
      emit('charm_picked', { charm_id: charm.id, charm_ticks: 600 });
    }
  }

  interactable() {
    const pos = this.player.pos;
    return this.lanterns.filter(item => !item.lit
      && gap(item.pos, pos) <= this.tuning.interact_radius
      && (this.night !== 3 || Math.abs(item.pos[1] - pos[1]) < 2))
      .sort((a, b) => gap(a.pos, pos) - gap(b.pos, pos) || byId(a, b))[0];
  }

  deposit(emit) {
    const lamp = this.interactable();
    const t = this.tuning;
    if (!lamp) return;

    const amount = Math.min(this.player.carried, t.lantern_cost - lamp.deposited);
    if (amount <= 0) return;
    this.player.carried -= amount;
    lamp.deposited += amount;
    this.score += amount * t.score.per_mote;
    emit('deposit', { lantern_id: lamp.id, amount, deposited: lamp.deposited });
    if (lamp.deposited === t.lantern_cost) {
      lamp.lit = true;
      this.score += t.score.per_lantern;
      this.repel(lamp);
      emit('lantern_lit', { lantern_id: lamp.id });
    }
  }

  drop(pos, amount, spread = false) {
    for (let index = 0; index < amount; index++) {
      const location = [...pos];
      if (spread) {
        const angle = this.random() * Math.PI * 2;
        const radius = 1.5 + this.random();
        location[0] += radius * Math.cos(angle);
        location[2] += radius * Math.sin(angle);
        const floors = this.layout.floors(location[0], location[2]).filter(height => height <= pos[1] + 0.35);
        location[1] = floors.length ? Math.max(...floors) : 0;
      }
      this.motes.push({ id: this.nextMote(), pos: location, kind: 'dropped', ttl: 480 });
    }
  }

  pulse(emit) {
    const p = this.player;
    const t = this.tuning;
    if (p.pulseCd || p.carried < t.pulse_cost) return;
    p.carried -= t.pulse_cost;
    p.pulseCd = ticks(t.pulse_cooldown_s);
    const stunned = [];
    for (const shade of this.shades) {
      const dx = shade.pos[0] - p.pos[0];
      const dz = shade.pos[2] - p.pos[2];
      if (Math.hypot(dx, shade.pos[1] - p.pos[1] - 0.8, dz) > t.pulse_radius) continue;
      this.score += t.score.per_stun;
      const [ux, uz] = unit(dx, dz);
      shade.force = { dx: ux * t.pulse_push_m / 15, dz: uz * t.pulse_push_m / 15, remaining: 15 };
      shade.state = 'stunned';
      shade.timer = ticks(t.pulse_stun_s);
      shade.target = undefined;
      shade.drainTicks = 0;
      stunned.push(shade.id);
    }
    emit('pulse', { stunned_ids: stunned });
    for (const drifter of this.drifters) {
      if (gap(drifter.pos, p.pos) > t.pulse_radius) continue;
      if (drifter.state === 'chase') {
        drifter.state = 'flee';
        drifter.timer = 240;
      } else if (drifter.state === 'flee' && drifter.stolen) {
        const amount = drifter.stolen;
        drifter.stolen = 0;
        drifter.timer = 120;
        this.drop(drifter.pos, amount);
        emit('drifter_drop', { drifter_id: drifter.id, amount });
      }
    }
  }

  moveEnemies(allowChase = true) {
    const p = this.player;
    const t = this.tuning;
    const safe = this.lanterns.filter(lamp => lamp.lit && !this.isWeak(lamp));
    for (const shade of this.shades) {
      if (shade.repel) {
        const repel = shade.repel;
        shade.pos[0] += (repel.x - shade.pos[0]) / repel.remaining;
        shade.pos[2] += (repel.z - shade.pos[2]) / repel.remaining;
        if (--repel.remaining === 0) {
          shade.repel = undefined;
          if (shade.state === 'recoil') shade.state = 'wander';
        }
        continue;
      }
      if (shade.force) {
        const force = shade.force;
        const x = shade.pos[0] + force.dx;
        const z = shade.pos[2] + force.dz;
        const floor = Math.max(0, ...this.layout.floors(x, z));
        const previousFloor = Math.max(0, ...this.layout.floors(shade.pos[0], shade.pos[2]));
        const blocked = (this.night === 3 && (floor > Math.max(shade.pos[1], previousFloor) + 0.3
          || (shade.pos[1] >= 6 && shade.pos[1] < 14 && Math.hypot(x, z) < 2
            && Math.hypot(x, z) < Math.hypot(shade.pos[0], shade.pos[2]))))
          || this.obstacles.some(rock => gap([x, 0, z], rock.pos) < rock.radius
            && gap(shade.pos, rock.pos) > gap([x, 0, z], rock.pos)
            && shade.pos[1] >= rock.pos[1] - 0.5 && shade.pos[1] < rock.pos[1] + rock.height);
        if (blocked) shade.force = undefined;
        else {
          shade.pos[0] = x;
          shade.pos[2] = z;
          if (--force.remaining === 0) shade.force = undefined;
        }
        continue;
      }
      if (shade.recoveredAt === this.simTick) continue;
      if (shade.state !== 'chase' && shade.state !== 'wander') continue;
      const distanceToPlayer = gap(shade.pos, p.pos);
      if (shade.state === 'chase' && (distanceToPlayer > 18 || this.respawnAt)) shade.state = 'wander';
      if (allowChase && !this.respawnAt && shade.state === 'wander' && distanceToPlayer <= 12) shade.state = 'chase';
      for (const lamp of safe) {
        if (gap(lamp.pos, shade.pos) >= t.safe_radius) continue;
        const [dx, dz] = unit(shade.pos[0] - lamp.pos[0], shade.pos[2] - lamp.pos[2]);
        shade.pos[0] = lamp.pos[0] + dx * t.safe_radius;
        shade.pos[2] = lamp.pos[2] + dz * t.safe_radius;
      }
      const lamp = shade.state === 'wander' ? this.nearestLamp(shade.pos, item => !item.lit) : undefined;
      const target = shade.state === 'chase' ? p.pos : lamp?.pos;
      const [dx, dz] = target
        ? unit(target[0] - shade.pos[0], target[2] - shade.pos[2], [0, 0])
        : [Math.cos(this.simTick / 140), Math.sin(this.simTick / 140)];
      const pace = Math.min((t.shade_speed + (this.night === 3 ? 0.5 : 0)) / HZ,
        target ? gap(shade.pos, target) : Infinity);
      const next = [shade.pos[0] + dx * pace, shade.pos[1], shade.pos[2] + dz * pace];
      if (this.layout.continuousTerrain) next[1] = this.layout.floors(next[0], next[2])[0] ?? next[1];
      if (safe.every(lamp => gap(lamp.pos, next) >= t.safe_radius)) shade.pos = next;
    }
    for (const drifter of this.drifters) {
      if (drifter.state === 'removed') continue;
      const eligible = p.carried >= 5 && gap(drifter.pos, p.pos) <= 15;
      if (drifter.state === 'idle' || drifter.state === 'chase') drifter.state = eligible ? 'chase' : 'idle';
      const [dx, dz] = unit(p.pos[0] - drifter.pos[0], p.pos[2] - drifter.pos[2]);
      const heading = drifter.state === 'idle'
        ? [Math.cos(this.simTick / 100), Math.sin(this.simTick / 100)]
        : drifter.state === 'flee' ? [-dx, -dz] : [dx, dz];
      const pace = drifter.state === 'idle' ? 2 / HZ : 7 / HZ;
      drifter.pos[0] += heading[0] * pace;
      drifter.pos[2] += heading[1] * pace;
    }
  }

  touch(emit) {
    if (this.respawnAt) return;
    const p = this.player;
    const t = this.tuning;
    for (const drifter of this.drifters) {
      if (drifter.state !== 'chase' || gap(p.pos, drifter.pos) > 1.2) continue;
      const amount = Math.min(3, p.carried);
      p.carried -= amount;
      drifter.stolen = amount;
      drifter.state = 'flee';
      drifter.timer = 240;
      emit('drifter_steal', { drifter_id: drifter.id, amount, carried: p.carried });
    }
    if (p.invuln || !p.flames || this.lanterns.some(lamp =>
      lamp.lit && !this.isWeak(lamp) && gap(lamp.pos, p.pos) <= t.safe_radius)) return;
    const hit = [...this.shades].sort(byId).find(shade =>
      !shade.repel && !shade.force && shade.state === 'chase'
      && gap(p.pos, shade.pos) <= t.shade_hit_radius && Math.abs(p.pos[1] - shade.pos[1]) <= 1.5);
    if (!hit) return;
    const dropped = Math.floor(p.carried * t.hit_drop_ratio);
    p.carried -= dropped;
    p.flames--;
    p.invuln = ticks(t.invuln_s);
    hit.state = 'recoil';
    hit.timer = 60;
    const [dx, dz] = unit(hit.pos[0] - p.pos[0], hit.pos[2] - p.pos[2]);
    hit.force = { dx: dx * 2 / 60, dz: dz * 2 / 60, remaining: 60 };
    this.drop(p.pos, dropped, true);
    emit('player_hit', { by: 'shade', flames: p.flames, dropped });
  }

  spawn(emit) {
    const n = this.simTick;
    const layout = this.layout;
    if (this.randomMotes && n % 240 === 0 && this.motes.length < 30) {
      const start = Math.floor(this.random() * layout.motePoints.length);
      const points = [...layout.motePoints.slice(start), ...layout.motePoints.slice(0, start)];
      const pos = points.find(point => !this.motes.some(mote =>
        gap(mote.pos, point) < 0.01 && Math.abs(mote.pos[1] - point[1]) < 0.01));
      if (pos) this.motes.push({ id: this.nextMote(), pos, kind: 'random', ttl: null });
    }
    const first = 300;
    if (this.randomShades && n >= first && (n - first) % (layout.shadePeriod * HZ) === 0) {
      const candidates = layout.shadePoints.filter(pos => this.night !== 1 || gap(pos, this.player.pos) >= 15);
      const count = Math.min(layout.shadeLimit - this.shades.length, n === first ? 2 : 1);
      for (let index = 0; index < count && candidates.length; index++) {
        const [pos] = candidates.splice(Math.floor(this.random() * candidates.length), 1);
        const id = this.nextShade();
        this.shades.push({ id, pos: [...pos], state: 'spawning', timer: 30 });
        emit('shade_spawned', { id });
      }
    }
    if (this.randomDrifters && n % 1200 === 0 && this.drifters.filter(item => item.state !== 'removed').length < 2) {
      const pos = layout.shadePoints[Math.floor(this.random() * layout.shadePoints.length)];
      this.drifters.push({ id: this.nextDrifter(), pos: [...pos], state: 'idle', stolen: 0, timer: 0 });
    }
  }

  step(input = defaultInput) {
    if (this.state === 'won' || this.state === 'lost') return [];
    this.tick++;
    const events = [];
    const emit = (name, data) => events.push({ type: 'event', tick: this.tick, name, data });
    const previous = this.previousInput;
    const pressed = key => input[key] && !previous[key];
    this.previousInput = { ...input };
    if (pressed('pause')) {
      const pausing = this.state === 'playing';
      this.state = pausing ? 'paused' : 'playing';
      emit(pausing ? 'paused' : 'resumed', {});
    }
    if (this.state === 'paused') return events;
    if (this.simTick === 0) emit('night_start', { night: this.night });
    this.simTick++;
    this.timers();
    if (this.respawnAt === this.simTick) {
      this.respawnAt = 0;
      this.player.pos = [...(this.layout.spawn ?? [0, 0, 0])];
      this.player.vel = [0, 0, 0];
      this.player.grounded = true;
      this.player.invuln = ticks(this.tuning.invuln_s);
      this.facing = [0, 1];
    } else if (!this.respawnAt) {
      this.move(input, pressed, emit);
      if (!this.respawnAt) {
        this.pickUp(emit);
        if (pressed('interact')) this.deposit(emit);
        if (pressed('pulse')) this.pulse(emit);
      }
    }
    this.moveEnemies();
    this.touch(emit);
    this.spawn(emit);
    let reason;
    if (!this.player.flames) reason = 'no_flames';

    else if (this.lanterns.every(lamp => lamp.lit)) {
      reason = 'all_lit';
      this.score += Math.floor(this.timeLeft) * this.tuning.score.per_second_left
        + this.player.flames * this.tuning.score.per_flame_left;
    } else if (this.timeLeft === 0) reason = 'dawn';
    if (reason) {
      this.state = reason === 'all_lit' ? 'won' : 'lost';
      emit('game_over', { result: this.state, reason });
    }
    return events;
  }

  snapshot() {
    const p = this.player;
    return {
      type: 'snapshot', tick: this.tick, sim_tick: this.simTick, night: this.night, state: this.state,
      time_left_s: this.timeLeft, score: this.score, wind: { ...this.wind },
      player: { pos: round(p.pos), vel: round(p.vel), grounded: p.grounded,
        flames: p.flames, carried: p.carried, invuln: Boolean(p.invuln), dash_cd_s: seconds(p.dashCd),
        pulse_cd_s: seconds(p.pulseCd), charm_s: seconds(p.charm) },
      lanterns: this.lanterns.map(lamp => ({ ...lamp, pos: round(lamp.pos) })),
      shades: this.shades.map(shade => ({ id: shade.id, pos: round(shade.pos), state: shade.state })),
      motes_active: this.motes.length,
      motes: this.motes.map(mote => ({ id: mote.id, pos: round(mote.pos), kind: mote.kind,
        ttl_s: mote.ttl === null ? null : seconds(mote.ttl) })),
      drifters: this.drifters.map(({ id, pos, state, stolen }) => ({ id, pos: round(pos), state, stolen })),
      charms: this.charms.map(({ id, timer }) => ({ id, available: !timer, respawn_s: seconds(timer) })),
    };
  }
}
