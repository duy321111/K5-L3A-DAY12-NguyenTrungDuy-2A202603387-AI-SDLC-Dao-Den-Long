import { Game, HZ, ISLAND_RADIUS } from './game.mjs';

const byId = id => document.getElementById(id);
const canvas = byId('world');
const ctx = canvas.getContext('2d');
const cover = byId('cover');
const play = byId('play');
const contract = await fetch(new URL('../game.contract.json', import.meta.url)).then(response => response.json());
const tuning = contract.tuning;
const keys = new Set();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let game = new Game(tuning, 2026);
let active = false;
let yaw = 0;
let accumulator = 0;
let last = performance.now();
let effect = '';
let effectUntil = 0;

const controls = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyQ']);
addEventListener('keydown', event => {
  if (!active || !controls.has(event.code) || event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  keys.add(event.code);
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => keys.clear());

function restart() {
  game = new Game(tuning, 2026);
  yaw = 0;
  accumulator = 0;
  effect = '';
  effectUntil = 0;
  active = true;
  keys.clear();
  cover.hidden = true;
  document.activeElement?.blur();
}

play.disabled = false;
play.addEventListener('click', restart);
byId('restart').addEventListener('click', restart);

const axis = (positive, negative) => Number(keys.has(positive)) - Number(keys.has(negative));

function simulate() {
  yaw += axis('ArrowRight', 'ArrowLeft') * 2;
  for (const event of game.step({
    move: [axis('KeyD', 'KeyA'), axis('KeyW', 'KeyS')],
    cam_yaw_deg: yaw, jump: keys.has('Space'), interact: keys.has('KeyE'), pulse: keys.has('KeyQ'),
  })) {
    const messages = {
      lantern_lit: 'Một ngọn đèn đã sáng',
      player_hit: 'Bóng Mực chạm vào Mây',
      pulse: 'Mây tỏa sáng',
    };
    if (messages[event.name]) {
      effect = messages[event.name];
      effectUntil = game.tick + HZ;
    }
    if (event.name === 'game_over') {
      active = false;
      byId('cover-title').textContent = game.state === 'won' ? 'Đảo Bến bừng sáng' : 'Đêm chưa qua';
      byId('cover-copy').textContent = event.data.reason === 'dawn' ? 'Bình minh đã đến.'
        : game.state === 'won' ? 'Mây đã thắp sáng cả năm ngọn đèn.'
        : 'Mây đã hết lửa.';
      play.textContent = 'Chơi lại';
      cover.hidden = false;
      play.focus();
    }
  }
}

function updateHud() {
  const seconds = Math.ceil(game.timeLeft);
  const values = {
    flames: game.player.flames,
    carried: game.player.carried + ' / ' + tuning.carry_capacity,
    lit: game.lanterns.filter(lantern => lantern.lit).length + ' / ' + tuning.lantern_count_night1,
    time: Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'),
    score: game.score,
  };
  for (const [id, value] of Object.entries(values)) {
    if (byId(id).textContent !== String(value)) byId(id).textContent = value;
  }
  const nearby = game.lanterns.find(lantern => !lantern.lit && Math.hypot(
    lantern.pos[0] - game.player.pos[0], lantern.pos[2] - game.player.pos[2],
  ) <= tuning.interact_radius);
  const message = game.tick < effectUntil ? effect : nearby
    ? 'E để nạp đèn ' + nearby.id + ' (' + nearby.deposited + '/' + tuning.lantern_cost + ')' : '';
  if (byId('message').textContent !== message) byId('message').textContent = message;
}

const ring = Array.from({ length: 80 }, (_, i) => {
  const angle = i * Math.PI * 2 / 80;
  return [ISLAND_RADIUS * Math.cos(angle), 0, ISLAND_RADIUS * Math.sin(angle)];
});
const stars = Array.from({ length: 75 }, (_, i) => [(i * 137.29 % 100) / 100, (i * 61.77 % 100) / 100, 0.7 + i % 3 * 0.45]);
const grass = Array.from({ length: 190 }, (_, i) => {
  const angle = i * 2.39996;
  const radius = Math.sqrt(i / 190) * 31;
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
});

function ellipse(x, y, width, height, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function glow(x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const dpr = Math.min(devicePixelRatio, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#15162e');
  sky.addColorStop(0.64, '#505367');
  sky.addColorStop(1, '#92929a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  for (const [x, y, size] of stars) ellipse(x * width, y * height * 0.47, size, size, '#dac9be9c');
  glow(width * 0.78, height * 0.21, 65, '#ffd38855');
  ellipse(width * 0.78, height * 0.21, 21, 21, '#ffe1a6');

  const angle = yaw * Math.PI / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const [px, py, pz] = game.player.pos;
  const focal = height * 0.87;
  const toCamera = ([x, y, z]) => {
    const dx = x - px;
    const dz = z - pz;
    const forward = dx * sin + dz * cos + 8;
    const up = y - py * 0.3 - 5.2;
    return [dx * cos - dz * sin, 0.93 * up + 0.36755952 * forward,
      0.93 * forward - 0.36755952 * up];
  };
  const project = ([x, y, z]) => [width / 2 + focal * x / z, height * 0.46 - focal * y / z, z];
  const ground = ring.map(toCamera);
  const clipped = [];
  for (let i = 0; i < ground.length; i++) {
    const a = ground[i];
    const b = ground[(i + 1) % ground.length];
    if (a[2] >= 0.5) clipped.push(a);
    if ((a[2] >= 0.5) !== (b[2] >= 0.5)) {
      const amount = (0.5 - a[2]) / (b[2] - a[2]);
      clipped.push([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, 0.5]);
    }
  }
  ctx.beginPath();
  for (const [x, y] of clipped.map(project)) ctx.lineTo(x, y);
  ctx.closePath();
  const lit = game.lanterns.filter(lantern => lantern.lit);
  ctx.fillStyle = 'hsl(' + (172 - lit.length * 9) + ' 24% ' + (19 + lit.length * 2) + '%)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (const lantern of lit) {
    const camera = toCamera(lantern.pos);
    if (camera[2] > 0.5) {
      const [x, y, depth] = project(camera);
      glow(x, y, focal * 5 / depth, '#ffb75b66');
    }
  }
  for (const pos of grass) {
    const camera = toCamera(pos);
    if (camera[2] < 0.5) continue;
    const [x, y, depth] = project(camera);
    ellipse(x, y, Math.max(1, focal * 0.25 / depth), Math.max(0.5, focal * 0.045 / depth), '#9da88442');
  }
  ctx.restore();

  const objects = [
    ...game.motes.map((item, index) => ({ ...item, kind: 'mote', height: 0.55 + (reducedMotion.matches ? 0 : Math.sin(game.tick / 18 + index) * 0.2) })),
    ...game.lanterns.map(item => ({ ...item, kind: 'lantern', height: 0 })),
    ...game.shades.map(item => ({ ...item, kind: 'shade', height: 0 })),
    { ...game.player, kind: 'player', height: 0 },
  ].map(item => {
    const [x, y, z] = item.pos;
    return { ...item, camera: toCamera([x, y + item.height, z]) };
  }).filter(item => item.camera[2] > 0.5).sort((a, b) => b.camera[2] - a.camera[2]);

  for (const item of objects) {
    const [x, y, depth] = project(item.camera);
    const scale = focal / depth;
    if (x < -scale * 2 || x > width + scale * 2) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (item.kind === 'mote') {
      glow(0, 0, 0.75, '#ffd271b5');
      ellipse(0, 0, 0.085, 0.085, '#ffe6ab');
    } else if (item.kind === 'lantern') {
      ellipse(0, 0, 0.56, 0.15, '#151a27');
      ctx.fillStyle = '#705143';
      ctx.fillRect(-0.085, -2.3, 0.17, 2.3);
      glow(0, -2.5, item.lit ? 2.7 : 0.95, item.lit ? '#ffb358b5' : '#a979584c');
      ctx.fillStyle = item.lit ? '#ffca74' : '#966350';
      ctx.fillRect(-0.35, -2.78, 0.7, 0.63);
      ellipse(0, -2.82, 0.48, 0.15, '#513436');
      ellipse(0, -2.12, 0.38, 0.09, '#513436');
      ctx.font = '0.27px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffedce';
      ctx.fillText(item.lit ? item.id : item.id + '  ' + item.deposited + '/' + tuning.lantern_cost, 0, -3.15);
    } else if (item.kind === 'shade') {
      glow(0, 0, 1.4, '#41185fa6');
      ellipse(0, 0, 0.48, 0.72, game.tick < item.stunnedUntil ? '#716292' : '#251834');
      ellipse(-0.15, -0.14, 0.055, 0.07, '#d1a0f7');
      ellipse(0.15, -0.14, 0.055, 0.07, '#d1a0f7');
    } else {
      ellipse(0, 0, 0.42, 0.1, '#182025');
      if (game.tick < game.invulnerableUntil && (reducedMotion.matches || game.tick % 12 < 6)) ctx.globalAlpha = 0.65;
      ellipse(-0.13, -0.14, 0.11, 0.15, '#322f38');
      ellipse(0.13, -0.14, 0.11, 0.15, '#322f38');
      ellipse(0, -0.64, 0.31, 0.48, '#a64b45');
      ellipse(0, -1.19, 0.23, 0.28, '#d4a779');
      ctx.beginPath();
      ctx.moveTo(-0.58, -1.39);
      ctx.lineTo(0, -1.82);
      ctx.lineTo(0.58, -1.39);
      ctx.closePath();
      ctx.fillStyle = '#d4a067';
      ctx.fill();
      ellipse(0, -1.39, 0.58, 0.09, '#a9754f');
      glow(0.48, -1.12, 0.53, '#ffb857b5');
      ellipse(0.48, -1.12, 0.10, 0.15, '#ffd181');
    }
    ctx.restore();
  }
}

function frame(now) {
  if (active) {
    accumulator += Math.min(100, now - last);
    while (active && accumulator >= 1000 / HZ) {
      simulate();
      accumulator -= 1000 / HZ;
    }
  }
  last = now;
  updateHud();
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
