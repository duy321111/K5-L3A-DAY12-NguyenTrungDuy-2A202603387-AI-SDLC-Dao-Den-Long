import { palette, ambientStrength } from './palette.mjs';
import { HZ } from './game.mjs';
import { NightGame } from './night-game.mjs';
import { sounds } from './sound.mjs';
import { nights } from './nights.mjs';

const byId = id => document.getElementById(id);
const canvas = byId('world');
const ctx = canvas.getContext('2d');
const canvas3d = byId('world-3d');
let renderer3d;
const cover = byId('cover');
const stage = byId('stage');
const hp = byId('hp');
const play = byId('play');
const contract = await fetch(new URL('../game.contract.json', import.meta.url)).then(response => response.json());
const tuning = contract.tuning;
const campaignSeed = 2026;
hp.max = tuning.flames;
let night = 1;
const scoresByNight = new Map();
let coverAction = 'intro';
const itemTypes = {
  herb: { name: 'Lá hồi sức', detail: 'Hồi 1 HP', color: '#8be4b1', gain: 1 },
  light: { name: 'Túi ánh sáng', detail: 'Thêm tối đa 3 đom đóm', color: '#ffdb87', gain: 3 },
};
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const islandPoint = (angle, radius) => [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];

function unevenHeight(x, z) {
  const radius = Math.hypot(x, z);
  const fade = Math.max(0, Math.min(1, (40 - radius) / 7)) * Math.min(1, radius / 8);
  return fade * (2.1 * Math.sin(x * 0.16) * Math.cos(z * 0.14)
    + 1.1 * Math.sin((x - z) * 0.29) + 0.65 * Math.cos(z * 0.48 + x * 0.12));
}

const onUnevenGround = ([x, y, z]) => [x, y + unevenHeight(x, z), z];
const webNights = {
  ...nights,
  3: { ...nights[3], spawn: [0, 0, -10] },
  1: {
    ...nights[1],
    continuousTerrain: true,
    floors: (x, z) => Math.hypot(x, z) <= 40 ? [unevenHeight(x, z)] : [],
    lanterns: nights[1].lanterns.map(onUnevenGround),
    motePoints: nights[1].motePoints.map(onUnevenGround),
    shadePoints: nights[1].shadePoints.map(onUnevenGround),
  },
};

function decoration(layout) {
  const distribute = count => layout.islands.flatMap(([center, radius]) => Array.from({ length: count }, (_, i) => {
    const [x, , z] = islandPoint(i * 2.39996, Math.sqrt(i / count) * (radius - 1));
    const wx = x + center;
    return [wx, Math.max(...layout.floors(wx, z)), z];
  }));
  const groundDecor = distribute(285);
  const clear = [[0, 0, 0], ...layout.lanterns, ...layout.motePoints, ...layout.charms,
    ...layout.pads.map(pad => pad.pos)];
  const bushes = distribute(180).filter((_, index) => index % 5 === 0).map((pos, index) => {
    const size = 0.58 + (index * 17 % 11) / 11;
    const onPath = layout.bridge && pos[0] >= 23 && pos[0] <= 47 && Math.abs(pos[2]) <= 4;
    const kind = index % 3 === 0 && !onPath && !clear.some(point => distance(point, pos) < 3.2) ? 'rock' : 'bush';
    return { pos, kind, height: 0, size };
  });
  const groundPatches = groundDecor.filter((_, index) => index % 4 === 0).map(([x, y, z], index) => {
    const angle = index * 2.39996;
    const radius = 0.65 + index % 7 * 0.27;
    const vertices = Array.from({ length: 7 }, (_, edge) => {
      const turn = edge * Math.PI * 2 / 7;
      const scale = radius * (0.72 + ((index * 13 + edge * 7) % 11) / 25);
      const dx = Math.cos(turn) * scale * 1.4;
      const dz = Math.sin(turn) * scale;
      const wx = x + dx * Math.cos(angle) - dz * Math.sin(angle);
      const wz = z + dx * Math.sin(angle) + dz * Math.cos(angle);
      return [wx, Math.max(...layout.floors(wx, wz)), wz];
    });
    if (vertices.some(vertex => Math.abs(vertex[1] - y) > 0.85)) return null;
    return { pos: [x, y, z], vertices, shade: index % 4 };
  }).filter(Boolean);
  return { groundDecor, groundPatches, bushes };
}

const decorations = Object.fromEntries(Object.entries(webNights).map(([number, layout]) => [number, decoration(layout)]));

function createWorld() {
  const world = new NightGame(tuning, campaignSeed, night, {}, webNights[night]);
  world.obstacles = decorations[night].bushes.filter(item => item.kind === 'rock')
    .map(({ pos, size }) => ({ pos, radius: size * 0.85, height: size * 0.95 }));
  return world;
}

function placeItems() {
  return Array.from({ length: night === 1 ? 12 : 0 }, (_, index) => ({
    kind: index % 2 === 0 ? 'light' : 'herb',
    pos: onUnevenGround(islandPoint(index * 2.39996 + 0.6, 7 + index * 2.9)),
  }));
}

const keys = new Set();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let game = createWorld();
let items = placeItems();
let active = false;
let paused = false;
let hadMouseCapture = false;
let yaw = 0;
let accumulator = 0;
let last = performance.now();
let effect = '';
let effectUntil = 0;
let hitUntil = 0;
let lastCountdown = null;
const prefs = { volume: 35, sensitivity: 100 };
for (const key of Object.keys(prefs)) {
  const input = byId(key);
  try {
    const saved = localStorage.getItem('lantern-' + key);
    if (saved !== null) prefs[key] = Number(saved);
  } catch {}
  input.value = prefs[key];
  input.addEventListener('input', () => {
    prefs[key] = Number(input.value);
    try { localStorage.setItem('lantern-' + key, input.value); } catch {}
    sounds.volume = prefs.volume / 100;
  });
}
sounds.volume = prefs.volume / 100;
const contrastToggle = byId('accessible-colors');
try { contrastToggle.checked = localStorage.getItem('lantern-accessible-colors') === 'true'; } catch {}
function applyContrast() {
  stage.toggleAttribute('data-accessible', contrastToggle.checked);
}
applyContrast();
contrastToggle.addEventListener('change', () => {
  applyContrast();
  try { localStorage.setItem('lantern-accessible-colors', String(contrastToggle.checked)); } catch {}
});
const slots = Array.from({ length: tuning.capacity_max }, () => {
  const slot = document.createElement('i');
  byId('mote-slots').append(slot);
  return slot;
});
const navigation = byId('navigation');
const itemHint = byId('item-hint');
const map = byId('minimap').getContext('2d');
const largeMap = byId('large-map');
const expandedMap = largeMap.getContext('2d');
const mapPanel = byId('map-panel');
const lanternPrompt = byId('lantern-prompt');
const lanternAction = byId('lantern-action');
const lanternProgress = byId('lantern-progress');
const inventory = byId('inventory');
const cooldowns = byId('cooldowns');
const lampArrow = byId('lamp-arrow');
const pauseMenu = byId('pause-menu');
const resume = byId('resume');
const fullscreen = byId('fullscreen');
const queuedActions = new Set();
const defaultCameraPitch = 0.34;
let cameraPitch = defaultCameraPitch;
const cameraDistance = 7.5;
const focalScale = 0.95;
const horizonCenter = 0.46;

function captureMouse() {
  if (document.pointerLockElement === canvas) return;
  try {
    canvas.requestPointerLock?.()?.catch(() => {});
  } catch {
    // Camera movement over the canvas still works if pointer lock is unavailable.
  }
}

function releaseMouse() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  const captured = document.pointerLockElement === canvas;
  if (hadMouseCapture && !captured && active && !paused) pauseGame();
  hadMouseCapture = captured;
});

function pauseGame() {
  paused = true;
  keys.clear();
  queuedActions.clear();
  accumulator = 0;
  pauseMenu.hidden = false;
  releaseMouse();
  sounds.pause();
  resume.focus();
}

resume.addEventListener('click', () => {
  if (!paused) return;
  paused = false;
  pauseMenu.hidden = true;
  last = performance.now();
  resume.blur();
  captureMouse();
  sounds.start();
});
byId('retry').addEventListener('click', restart);
byId('menu').addEventListener('click', backToMenu);
byId('settings').addEventListener('click', () => {
  const panel = byId('settings-panel');
  panel.hidden = !panel.hidden;
});

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement === stage) await document.exitFullscreen();
    else await stage.requestFullscreen();
  } catch {
    effect = 'Trình duyệt không bật được toàn màn hình';
    effectUntil = game.tick + 180;
  }
}

fullscreen.addEventListener('click', toggleFullscreen);
fullscreen.hidden = !document.fullscreenEnabled;


const bindings = { forward:'KeyW', left:'KeyA', back:'KeyS', right:'KeyD', jump:'Space',
  dash:'ShiftLeft', interact:'KeyE', pulse:'KeyQ', pause:'KeyP' };
const keyLabel = code => code.replace(/^(Key|Digit)/, '');
addEventListener('keydown', event => {
  if (active && !event.repeat && ['Escape', bindings.pause].includes(event.code) && !paused) {
    pauseGame();
    return;
  }
  if (active && !paused && !event.repeat && event.code === 'KeyM') {
    event.preventDefault();
    mapPanel.hidden = !mapPanel.hidden;
    return;
  }
  if (event.code === 'KeyF' && !event.repeat && document.fullscreenEnabled) {
    event.preventDefault();
    void toggleFullscreen();
    return;
  }
  if (!active || paused || (!Object.values(bindings).includes(event.code) && !['ArrowLeft','ArrowRight'].includes(event.code))
    || (event.code === 'Space' && event.target instanceof HTMLButtonElement)) return;
  event.preventDefault();
  keys.add(event.code);
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => keys.clear());

canvas.addEventListener('click', () => {
  if (!active || paused) return;
  queuedActions.add('interact');
  captureMouse();
});
canvas.addEventListener('mousemove', event => {
  if (!active || paused) return;
  const sensitivity = prefs.sensitivity / 100;
  yaw += event.movementX * 0.22 * sensitivity * cameraHorizontalSign();
  cameraPitch = Math.max(0.12, Math.min(0.88, cameraPitch + event.movementY * 0.0035 * sensitivity));
});

function restart() {
  game = createWorld();
  items = placeItems();
  yaw = 0;
  cameraPitch = defaultCameraPitch;
  accumulator = 0;
  effect = '';
  effectUntil = 0;
  hitUntil = 0;
  lastCountdown = null;
  queuedActions.clear();
  active = true;
  paused = false;
  pauseMenu.hidden = true;
  byId('settings-panel').hidden = true;
  mapPanel.hidden = true;
  keys.clear();
  cover.hidden = true;
  navigation.hidden = false;
  document.activeElement?.blur();
  captureMouse();
  sounds.start();
}

function showCover(title, copy, button, action) {
  coverAction = action;
  byId('cover-title').textContent = title;
  byId('cover-copy').textContent = copy;
  play.textContent = button;
  cover.hidden = false;
  play.focus();
}

function intro() {
  game = createWorld();
  byId('chapter').textContent = 'Đêm ' + night + ' (' + game.layout.name + ')';
  showCover('Đêm ' + night + ' — ' + game.layout.name, 'Ông Đăng: “' + game.layout.introduction + '”', 'Vào đêm', 'play');
}

function backToMenu() {
  active = paused = false;
  night = 1;
  scoresByNight.clear();
  game = createWorld();
  items = placeItems();
  yaw = 0;
  releaseMouse();
  sounds.pause();
  pauseMenu.hidden = navigation.hidden = mapPanel.hidden = true;
  byId('chapter').textContent = 'Đêm 1 (Đảo Bến)';
  showCover('Đảo Đèn Lồng', 'Thắp đèn và giữ đảo sáng tới bình minh qua ba đêm.', 'Bắt đầu', 'intro');
}

play.disabled = false;
play.addEventListener('click', () => {
  if (coverAction === 'intro') intro();
  else if (coverAction === 'next') { night++; intro(); }
  else if (coverAction === 'menu') backToMenu();
  else restart();
});
byId('restart').addEventListener('click', restart);

const axis = (positive, negative) => Number(keys.has(positive)) - Number(keys.has(negative));
// The Three.js camera faces +Z, which places world +X on the left at zero yaw.
const cameraHorizontalSign = () => renderer3d ? -1 : 1;

function actionInput(action, key) {
  if (keys.has(key)) return true;
  if (game.previousInput[action]) return false;
  return queuedActions.delete(action);
}


const campaignTotal = () => [...scoresByNight.values()].reduce((sum, score) => sum + score, 0);

function collectItems() {
  items = items.filter(item => {
    if (distance(item.pos, game.player.pos) > 1.1) return true;
    const { name, gain } = itemTypes[item.kind];
    const field = item.kind === 'herb' ? 'flames' : 'carried';
    const limit = field === 'flames' ? tuning.flames : game.capacity;
    const earned = Math.min(gain, limit - game.player[field]);
    if (earned <= 0) return true;
    game.player[field] += earned;
    effect = name + '  +' + earned + (field === 'flames' ? ' HP' : ' đom đóm');
    effectUntil = game.tick + HZ * 2;
    return false;
  });
}

function simulate() {
  const horizontal = cameraHorizontalSign();
  yaw += axis('ArrowRight', 'ArrowLeft') * 2 * horizontal;
  const jumping = actionInput('jump', bindings.jump);
  if (jumping && !game.previousInput.jump && game.player.grounded) sounds.effect('jump');
  for (const event of game.step({
    move: [axis(bindings.right, bindings.left) * horizontal, axis(bindings.forward, bindings.back)], cam_yaw_deg: yaw,
    jump: jumping, interact: actionInput('interact', bindings.interact), pulse: actionInput('pulse', bindings.pulse),
    dash: keys.has(bindings.dash),
  })) {
    const messages = {
      lantern_lit: 'Một ngọn đèn đã sáng',
      player_hit: 'Bóng Mực đánh trúng Mây. Mất 1 máu!',
      pulse: 'Mây tỏa sáng',
      charm_picked: 'Bùa Gió · Chạy nhanh và lướt không hồi chiêu',
      drifter_steal: 'Gió Lạc vừa cướp đom đóm',
      drifter_drop: 'Gió Lạc đã thả đom đóm',
      lantern_out: 'Đèn ' + event.data.lantern_id + ' đã cạn dầu',
      refuel: 'Đã châm dầu cho đèn ' + event.data.lantern_id,
    };
    sounds.effect(event.name);
    if (messages[event.name]) {
      effect = messages[event.name];
      effectUntil = game.tick + HZ;
    }
    if (event.name === 'player_hit') {
      hitUntil = game.tick + 12;
      if (event.data.by === 'fall') effect = 'Mây rơi xuống biển mây và mất một Ngọn Lửa';
    }
    if (event.name === 'game_over') {
      active = false;
      releaseMouse();
      navigation.hidden = true;
      mapPanel.hidden = true;
      sounds.pause();
      if (game.state === 'won') {
        scoresByNight.set(night, game.score);
        sounds.effect('won');
        if (night === 3) {
          showCover('Bình Minh', 'Tổng điểm ' + campaignTotal(), 'Về menu', 'menu');
        }
        else showCover(game.layout.name + ' bừng sáng', 'Điểm Đêm ' + night + ': ' + game.score, 'Đêm kế tiếp', 'next');
      } else {
        sounds.effect('lost');
        showCover('Đêm chưa qua', event.data.reason === 'dawn'
          ? 'Bình minh đã đến nhưng số đèn còn sáng chưa đủ.' : 'Mây đã hết Ngọn Lửa.', 'Chơi lại Đêm', 'play');
      }
    }
  }
  if (active) collectItems();
  const remaining = Math.ceil(game.timeLeft);
  if (remaining <= 10 && remaining !== lastCountdown && active) sounds.effect('countdown');
  lastCountdown = remaining;
  if (game.windEnabled && game.simTick % 1800 === 1680) {
    sounds.effect('wind');
    effect = 'Lá bắt đầu bay. Gió mạnh sắp đến.';
    effectUntil = game.tick + 120;
  }
}

function drawMap(context = map) {
  const map = context;
  map.setTransform(map.canvas.width / 132, 0, 0, map.canvas.height / 132, 0, 0);
  const center = 66;
  const middle = night === 2 ? 35 : 0;
  const scale = 58 / (night === 2 ? 63 : game.layout.islands[0][1]);
  const coords = ([x, , z]) => [center + (x - middle) * scale, center - z * scale];
  map.clearRect(0, 0, 132, 132);
  map.fillStyle = '#364f4b';
  for (const [x, radius] of game.layout.islands) {
    map.beginPath();
    map.arc(coords([x, 0, 0])[0], center, radius * scale, 0, Math.PI * 2);
    map.fill();
  }
  if (game.layout.bridge) {
    map.fillStyle = '#9b8059';
    map.fillRect(coords([26, 0, 2])[0], center - 2 * scale, 18 * scale, 4 * scale);
  }
  if (night === 3) {
    map.strokeStyle = '#789879';
    for (const [radius, end] of [[8, Math.PI * 2], [12, Math.PI], [24, Math.PI]]) {
      map.beginPath();
      map.arc(center, center, radius * scale, Math.PI, Math.PI + end);
      map.stroke();
    }
  }
  for (const lantern of game.lanterns) {
    const [x, y] = coords(lantern.pos);
    map.strokeStyle = palette.gold;
    map.fillStyle = palette.gold;
    map.beginPath();
    map.arc(x, y, 3.5, 0, Math.PI * 2);
    if (lantern.lit) map.fill();
    else map.stroke();
  }
  for (const item of [...items, ...game.charms.filter(charm => !charm.timer)]) {
    const [x, y] = coords(item.pos);
    map.fillStyle = itemTypes[item.kind]?.color ?? '#ff776d';
    map.fillRect(x - 3, y - 1, 6, 2);
    map.fillRect(x - 1, y - 3, 2, 6);
  }
  const [x, y] = coords(game.player.pos);
  map.save();
  map.translate(x, y);
  map.rotate(yaw * Math.PI / 180);
  map.beginPath();
  map.moveTo(0, -6);
  map.lineTo(4, 4);
  map.lineTo(-4, 4);
  map.closePath();
  map.fillStyle = '#fff4e3';
  map.fill();
  map.restore();
}

function updateHud() {
  const seconds = Math.ceil(game.timeLeft);
  const values = {
    flames: game.player.flames + ' / ' + tuning.flames + ' HP',
    carried: game.player.carried + ' / ' + game.capacity,
    lit: game.lanterns.filter(lantern => lantern.lit).length + ' / ' + game.lanterns.length,
    time: String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'),
    score: game.score,
  };
  hp.value = game.player.flames;
  inventory.hidden = cooldowns.hidden = !active;
  for (const [index, slot] of slots.entries()) {
    slot.hidden = index >= game.capacity;
    slot.toggleAttribute('data-full', index < game.player.carried);
  }
  byId('clock').toggleAttribute('data-urgent', active && seconds <= 30);
  const goal = 'Giữ ' + Math.ceil(tuning.win_ratio * game.lanterns.length) + ' đèn sáng tới bình minh';
  if (byId('dawn-goal').textContent !== goal) byId('dawn-goal').textContent = goal;
  const status = value => value ? (value / HZ).toFixed(1) + ' s' : 'Sẵn sàng';
  byId('dash-status').textContent = '⇥ Lướt ' + status(game.player.dashCd);
  byId('pulse-status').textContent = '✦ Tỏa sáng ' + status(game.player.pulseCd);
  stage.toggleAttribute('data-hit', active && !reducedMotion.matches && game.tick < hitUntil);
  for (const [id, value] of Object.entries(values)) {
    if (byId(id).textContent !== String(value)) byId(id).textContent = value;
  }
  const nearby = game.interactable();
  lanternPrompt.hidden = !active || paused || !nearby;
  if (!lanternPrompt.hidden) {
    const carried = game.player.carried;
    lanternPrompt.toggleAttribute('data-ready', carried > 0);
    const warning = game.isWeak(nearby);
    lanternPrompt.toggleAttribute('data-warning', warning);
    const symbol = warning && contrastToggle.checked ? '⚠ ' : '';
    const key = keyLabel(bindings.interact);
    lanternAction.textContent = nearby.lit ? symbol + key + ' — Châm dầu ' + nearby.id
      : key + ' — Nạp ánh sáng (' + nearby.deposited + '/' + game.cost(nearby) + ')';
    lanternProgress.textContent = nearby.lit ? 'Dầu ' + game.fuel(nearby).toFixed(1) + ' / ' + tuning.fuel_max
      : carried ? 'Chuột trái cũng có thể nạp đèn ' + nearby.id : 'Cần đom đóm';
  }
  const message = game.tick < effectUntil ? effect : '';
  if (byId('message').textContent !== message) byId('message').textContent = message;
  if (active) {
    const nearest = items.reduce((best, item) => !best
      || distance(item.pos, game.player.pos) < distance(best.pos, game.player.pos) ? item : best, null);
    const gap = nearest ? distance(nearest.pos, game.player.pos) : Infinity;
    const hint = gap < 12
      ? itemTypes[nearest.kind].name + ' (' + Math.ceil(gap) + ' m) · ' + itemTypes[nearest.kind].detail
      : '';
    if (itemHint.textContent !== hint) itemHint.textContent = hint;
    drawMap(mapPanel.hidden ? map : expandedMap);
  }
}

const ring = (center, radius, y = 0) => Array.from({ length: 52 }, (_, index) => {
  const [x, , z] = islandPoint(index * Math.PI * 2 / 52, radius);
  return [x + center, y, z];
});
const scenery = Object.fromEntries(Object.entries(webNights).map(([number, layout]) => {
  const bases = layout.islands.map(([center, radius]) => ring(center, radius));
  const surfaces = [];
  if (layout.continuousTerrain) {
    const rings = Array.from({ length: 13 }, (_, band) => ring(0, 40 * band / 12).map(onUnevenGround));
    for (let band = 1; band < rings.length; band++) {
      for (const [index, vertex] of rings[band].entries()) {
        const next = (index + 1) % rings[band].length;
        const inner = rings[band - 1];
        const outerNext = rings[band][next];
        const shade = (vertex[1] - inner[index][1]) * 3 + vertex[1] * 1.5;
        surfaces.push({ vertices: [inner[index], vertex, outerNext], shade });
        if (band > 1) surfaces.push({ vertices: [inner[index], outerNext, inner[next]], shade });
      }
    }
  }
  if (layout.bridge) {
    for (let x = 26; x < 44; x += 0.75) {
      const next = Math.min(44, x + 0.75);
      surfaces.push({ color: x % 1.5 < 0.75 ? '#a4875e' : '#846c4b',
        vertices: [[x,0.01,-2],[next,0.01,-2],[next,0.01,2],[x,0.01,2]] });
    }
  }
  if (number === '3') {
    const face = (vertices, color) => surfaces.push({ vertices, color });
    const top = ring(0, 8, 6);
    face(top, '#5d8058');
    for (let i = 0; i < top.length; i++) {
      const a = top[i], b = top[(i + 1) % top.length];
      face([a, b, [b[0],0,b[2]], [a[0],0,a[2]]], '#324b40');
    }
    for (let i = 0; i < 26; i++) {
      const point = (slice, radius, height) => { const [x, , z] = islandPoint(slice * Math.PI / 26, radius); return [x,height,z]; };
      const a = point(i,12,3), b = point(i,24,3), c = point(i+1,24,3), d = point(i+1,12,3);
      face([a,b,c,d], i % 2 ? '#557752' : '#597b56');
      face([b,c,point(i+1,24,0),point(i,24,0)], '#30483e');
      face([a,d,point(i+1,12,0),point(i,12,0)], '#344e42');
      if (i === 0) face([a,b,point(i,24,0),point(i,12,0)], '#344e42');
      if (i === 25) face([d,c,point(i+1,24,0),point(i+1,12,0)], '#344e42');
    }
    for (const degrees of [30, 150]) {
      const angle = degrees * Math.PI / 180;
      const point = (radius, width, y) => [radius * Math.cos(angle) - width * Math.sin(angle), y,
        radius * Math.sin(angle) + width * Math.cos(angle)];
      face([point(30,-1.5,0),point(30,1.5,0),point(24,1.5,3.005),point(24,-1.5,3.005)], '#987957');
    }
  }
  return [number, { bases, ...decorations[number], surfaces }];
}));
const stars = Array.from({ length: 160 }, (_, i) => [
  (i * 137.29 % 100) / 100, (i * 61.77 % 100) / 100, i % 11 === 0 ? 1.8 : 0.55 + i % 3 * 0.33,
]);

function ellipse(x, y, width, height, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

const leafColors = ['#172e27', '#20382d', '#294634', '#35523e', '#405f46', '#527252', '#67835f', '#819371'];

function foliageSprite(variant) {
  const image = document.createElement('canvas');
  image.width = 160;
  image.height = 112;
  const brush = image.getContext('2d');
  let seed = variant * 104729 + 7183;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  brush.strokeStyle = '#554a32';
  brush.lineWidth = 2;
  const clusters = Array.from({ length: 10 }, (_, index) => {
    const x = 32 + index * 10 + random() * 9;
    const y = 84 - Math.sin(index / 9 * Math.PI) * (24 + random() * 16);
    brush.beginPath();
    brush.moveTo(80, 104);
    brush.quadraticCurveTo(74 + (x - 80) * 0.45, 82, x, y);
    brush.stroke();
    return [x, y, 13 + random() * 9];
  });
  for (const [x, y, radius] of clusters.sort((a, b) => b[1] - a[1])) {
    for (let i = 0; i < 32; i++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius;
      const lx = x + Math.cos(angle) * distance;
      const ly = y + Math.sin(angle) * distance * 0.78;
      const light = Math.max(0, Math.min(leafColors.length - 1, Math.round((93 - ly) / 12 + random() * 3)));
      brush.beginPath();
      brush.ellipse(lx, ly, 2.3 + random() * 5, 1.2 + random() * 2.5, angle, 0, Math.PI * 2);
      brush.fillStyle = leafColors[light];
      brush.fill();
    }
  }
  return image;
}

const foliage = Array.from({ length: 5 }, (_, index) => foliageSprite(index));

function glow(x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawSea(width, height, horizon, moonX) {
  if (horizon >= height) return;
  const top = Math.max(0, horizon);
  const depth = height - horizon;
  const phase = reducedMotion.matches ? 0 : game.simTick / HZ;
  const water = ctx.createLinearGradient(0, horizon, 0, height);
  water.addColorStop(0, '#586c82');
  water.addColorStop(0.1, '#304c64');
  water.addColorStop(0.44, palette.sea);
  water.addColorStop(1, '#071d2a');
  ctx.fillStyle = water;
  ctx.fillRect(0, top, width, height - top);

  for (let row = 1; row <= 42; row++) {
    const near = (row / 42) ** 2;
    const lineY = horizon + near * depth;
    if (lineY < 0) continue;
    const segment = 12 + near * width * 0.1;
    const amplitude = 0.3 + near * 2.4;
    for (let x = -segment; x < width; x += segment) {
      const variation = Math.sin(x * 0.013 + row * 2.7 + phase);
      const offset = Math.sin(row * 1.2 + phase * 0.85) * segment * 0.45;
      const crest = x + offset;
      const reflection = Math.abs(crest - moonX + variation * 18) < width * (0.025 + near * 0.11);
      ctx.strokeStyle = reflection ? 'rgba(244,220,171,' + (0.09 + near * (variation + 1) * 0.14) + ')'
        : (row % 3 === 0 ? '#81b1c03b' : '#76a7b222');
      ctx.lineWidth = 0.45 + near * (reflection ? 1.9 : 0.75);
      ctx.beginPath();
      ctx.moveTo(crest, lineY);
      ctx.quadraticCurveTo(crest + segment * 0.37, lineY - amplitude * variation,
        crest + segment * (0.42 + 0.25 * variation), lineY + amplitude * 0.2);
      ctx.stroke();
    }
  }
}

function drawMay(cameraYaw) {
  const { player, simTick } = game;
  const speed = Math.hypot(player.vel[0], player.vel[2]);
  const moving = player.grounded && speed > 0.25;
  const jumping = !player.grounded;
  const animate = !reducedMotion.matches;
  const stride = animate && moving ? Math.sin(simTick * (game.dash ? 0.43 : 0.25)) : 0;
  const breath = animate && !moving && !jumping ? Math.sin(simTick * 0.08) : 0;
  const bob = moving ? -Math.abs(stride) * 0.09 : breath * 0.034;
  const side = game.facing[0] * Math.cos(cameraYaw) - game.facing[1] * Math.sin(cameraYaw);
  const sway = stride * 0.06;
  const lanternX = 0.41 + side * 0.12 - sway * 1.1;

  ellipse(0, 0.01, 0.43, 0.11, '#0b1517a8');
  if (player.invuln > 0 && (reducedMotion.matches || simTick % 12 < 6)) ctx.globalAlpha = 0.65;
  ctx.lineCap = 'round';
  for (const sign of [-1, 1]) {
    const swing = stride * sign;
    const hip = sign * 0.13;
    const footX = hip + swing * (0.15 + Math.abs(side) * 0.15) + (jumping ? side * 0.14 : 0);
    const footY = jumping ? -0.11 - (sign === 1 ? 0.14 : 0) : -0.06 - Math.max(0, swing) * 0.15;
    ctx.beginPath();
    ctx.moveTo(hip, -0.5 + bob);
    ctx.lineTo(hip + swing * 0.12, (footY - 0.46) / 2);
    ctx.lineTo(footX, footY);
    ctx.lineWidth = 0.17;
    ctx.strokeStyle = sign === -1 ? '#403847' : '#50404a';
    ctx.stroke();
    ellipse(footX + side * 0.035, footY, 0.118, 0.073, '#272838');
  }
  ctx.translate(side * Math.min(0.13, speed * 0.015), bob);
  for (const sign of [-1, 1]) {
    const armSwing = -stride * sign;
    const handX = sign * (jumping ? 0.41 : 0.29) + armSwing * 0.12;
    const handY = jumping ? -0.9 : -0.52 + armSwing * 0.15;
    ctx.beginPath();
    ctx.moveTo(sign * 0.21, -0.95);
    ctx.quadraticCurveTo(sign * 0.34, handY - 0.13, handX, handY);
    ctx.lineWidth = 0.16;
    ctx.strokeStyle = sign < 0 ? '#884541' : '#b85e4e';
    ctx.stroke();
    ellipse(handX, handY, 0.066, 0.07, '#d7a980');
  }
  ellipse(0, -0.76, 0.29, 0.39, palette.coat);
  ellipse(-0.065, -0.8, 0.18, 0.3, '#DED8C5');
  ctx.beginPath();
  ctx.moveTo(-0.21, -0.98);
  ctx.quadraticCurveTo(-0.1, -0.76, 0.22 + sway, -0.48);
  ctx.strokeStyle = palette.scarf;
  ctx.lineWidth = 0.045;
  ctx.stroke();
  ellipse(side * 0.045, -1.24, 0.23, 0.27, '#d4a779');
  ctx.beginPath();
  ctx.moveTo(-0.55, -1.42);
  ctx.lineTo(side * 0.12, -1.88);
  ctx.lineTo(0.55, -1.42);
  ctx.closePath();
  ctx.fillStyle = '#d4a067';
  ctx.fill();
  ellipse(0, -1.42, 0.55, 0.085, '#a9754f');
  ctx.beginPath();
  ctx.moveTo(0.34, -1.42);
  ctx.lineTo(lanternX, -1.14 + sway);
  ctx.strokeStyle = '#e7b775';
  ctx.lineWidth = 0.026;
  ctx.stroke();
  glow(lanternX, -1.06 + sway, 0.59, '#ffb857b5');
  ellipse(lanternX, -1.06 + sway, 0.105, 0.144, '#ffd181');
}

function draw() {
  if (renderer3d) {
    renderer3d.draw(game, scenery[night], items, yaw, cameraPitch, reducedMotion.matches, contrastToggle.checked);
    const target = game.lanterns.filter(lamp => !lamp.lit || game.isWeak(lamp))
      .sort((a,b) => distance(a.pos, game.player.pos) - distance(b.pos, game.player.pos))[0];
    lampArrow.hidden = !active || paused || !target;
    if (!lampArrow.hidden) {
      const marker = renderer3d.marker(target.pos);
      lampArrow.hidden = marker.visible;
      if (!marker.visible) lampArrow.style.setProperty('--direction', marker.direction + 'rad');
    }
    return;
  }
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
  sky.addColorStop(0, palette.sky);
  sky.addColorStop(0.64, palette.fog);
  sky.addColorStop(1, palette.fog);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  for (const [x, y, size] of stars) {
    const screenX = ((x - yaw / 900) % 1 + 1) % 1 * width;
    const screenY = (0.015 + y * 0.36) * height;
    if (size > 1.5) glow(screenX, screenY, 7, '#dbedff66');
    ellipse(screenX, screenY, size, size, '#f2f2e9cc');
  }
  const moonX = width * 0.78;
  const moonY = height * 0.07;
  glow(moonX, moonY, 65, '#ffd38855');
  ellipse(moonX, moonY, 21, 21, '#ffe1a6');
  ellipse(moonX - 6, moonY - 4, 4, 2.7, '#eacb9477');
  ellipse(moonX + 5, moonY + 5, 6, 3.1, '#eacb9477');
  for (let i = 0; i < 14; i++) {
    const x = ((i * 0.137 - yaw / 1300) % 1 + 1) % 1 * width;
    const y = height * (0.28 + i % 4 * 0.09);
    glow(x, y, width * (0.08 + i % 3 * 0.02), '#d1d6de24');
  }

  const angle = yaw * Math.PI / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const [px, py, pz] = game.player.pos;
  const cameraPitchCos = Math.cos(cameraPitch);
  const cameraPitchSin = Math.sin(cameraPitch);
  const cameraBack = cameraDistance * cameraPitchCos;
  const cameraX = px - sin * cameraBack;
  const cameraZ = pz - cos * cameraBack;
  const rough = game.layout.continuousTerrain;
  const cameraHeight = Math.max(py * 0.65 + 2.25 + cameraDistance * cameraPitchSin,
    rough ? unevenHeight(cameraX, cameraZ) + 2.7 : -Infinity);
  const focal = height * focalScale;
  drawSea(width, height, height * horizonCenter - focal * Math.tan(cameraPitch), moonX);
  const toCamera = ([x, y, z]) => {
    const dx = x - px;
    const dz = z - pz;
    const forward = dx * sin + dz * cos + cameraBack;
    const up = y - cameraHeight;
    return [dx * cos - dz * sin, cameraPitchCos * up + cameraPitchSin * forward,
      cameraPitchCos * forward - cameraPitchSin * up];
  };
  const project = ([x, y, z]) => [width / 2 + focal * x / z, height * horizonCenter - focal * y / z, z];
  function aboveTerrain([x, y, z]) {
    if (!rough) return true;
    const steps = Math.ceil(Math.hypot(x - cameraX, z - cameraZ) / 0.75);
    for (let step = 1; step < steps; step++) {
      const t = step / steps;
      const wx = cameraX + (x - cameraX) * t;
      const wz = cameraZ + (z - cameraZ) * t;
      const rayY = cameraHeight + (y - cameraHeight) * t;
      if (rayY < unevenHeight(wx, wz) - 0.03) return false;
    }
    return true;
  }
  for (let i = 0; i < 19; i++) {
    const [x, , z] = islandPoint(i * Math.PI * 2 / 19, 80 + i % 4 * 18);
    const camera = toCamera([x, -2.2, z]);
    if (camera[2] < 24) continue;
    const [screenX, screenY, depth] = project(camera);
    const size = focal * (5 + i % 4 * 2) / depth;
    const peak = (0.18 + i % 4 * 0.04) * size;
    ctx.beginPath();
    ctx.moveTo(screenX - size, screenY);
    ctx.lineTo(screenX - size * 0.71, screenY - peak * 0.42);
    ctx.lineTo(screenX - size * 0.4, screenY - peak * 0.84);
    ctx.lineTo(screenX - size * 0.23, screenY - peak * 0.65);
    ctx.lineTo(screenX + size * 0.1, screenY - peak);
    ctx.lineTo(screenX + size * 0.37, screenY - peak * 0.5);
    ctx.lineTo(screenX + size * 0.61, screenY - peak * 0.35);
    ctx.lineTo(screenX + size, screenY);
    ctx.lineTo(screenX + size * 0.22, screenY + size * 0.035);
    ctx.lineTo(screenX - size * 0.42, screenY + size * 0.065);
    ctx.closePath();
    ctx.fillStyle = '#293d4d';
    ctx.fill();
    glow(screenX, screenY, size * 1.2, '#aeb7d124');
  }
  function clipNear(vertices) {
    if (vertices.every(vertex => vertex[2] >= 0.5)) return vertices;
    if (vertices.every(vertex => vertex[2] < 0.5)) return [];
    const clipped = [];
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      if (a[2] >= 0.5) clipped.push(a);
      if ((a[2] >= 0.5) !== (b[2] >= 0.5)) {
        const amount = (0.5 - a[2]) / (b[2] - a[2]);
        clipped.push([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, 0.5]);
      }
    }
    return clipped;
  }
  function drawPolygon(points) {
    ctx.beginPath();
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.closePath();
  }

  const lit = game.lanterns.filter(lantern => lantern.lit);
  const ambient = ambientStrength(lit.length, game.lanterns.length);
  const { bases, groundDecor, groundPatches, bushes, surfaces } = scenery[night];
  for (const vertices of bases) {
    const center = vertices.reduce((sum, vertex) => sum + vertex[0], 0) / vertices.length;
    const coast = vertices.map(([x, , z]) => [center + (x - center) * 1.04, -1.9, z * 1.04]);
    for (const [index, vertex] of vertices.entries()) {
      const next = (index + 1) % vertices.length;
      const face = clipNear([vertex, vertices[next], coast[next], coast[index]].map(toCamera)).map(project);
      if (face.length < 3) continue;
      const ripple = reducedMotion.matches ? 0 : Math.sin(game.simTick / 41 + index * 0.8);
      const shade = 17 + 7 * Math.cos(index / vertices.length * Math.PI * 2 - 0.7);
      drawPolygon(face);
      ctx.fillStyle = palette.sand;
      ctx.fill();
      ctx.fillStyle = 'rgba(17,24,32,' + (0.76 - shade * 0.012) + ')';
      ctx.fill();
      const foam = [coast[index], coast[next]].map(toCamera);
      if (foam.some(point => point[2] < 0.5)) continue;
      const [foamStart, foamEnd] = foam.map(project);
      if (index % 7 === 5) continue;
      ctx.beginPath();
      ctx.moveTo(foamStart[0], foamStart[1]);
      ctx.quadraticCurveTo((foamStart[0] + foamEnd[0]) / 2, (foamStart[1] + foamEnd[1]) / 2 + ripple * 2,
        foamEnd[0], foamEnd[1]);
      ctx.strokeStyle = index % 3 === 0 ? '#c2e5e8aa' : '#86bcc87a';
      ctx.lineWidth = 0.8 + Math.min(2.2, focal * 0.06 / foamStart[2]);
      ctx.stroke();
    }
  }
  for (const vertices of bases) {
    if (rough) break;
    drawPolygon(clipNear(vertices.map(toCamera)).map(project));
    const earth = ctx.createLinearGradient(0, height * 0.1, 0, height);
    earth.addColorStop(0, palette.grass);
    earth.addColorStop(1, 'hsl(162 33% ' + (21 + ambient * 20) + '%)');
    ctx.fillStyle = earth;
    ctx.fill();
  }
  const facets = surfaces.map(({ color, shade, vertices }) => {
    const points = clipNear(vertices.map(toCamera)).map(project);
    return { color: color ?? 'hsl(163 33% ' + (24 + ambient * 18 + shade) + '%)', points,
      depth: points.reduce((total, point) => total + point[2], 0) / points.length };
  }).filter(face => face.points.length).sort((a, b) => b.depth - a.depth);
  for (const face of facets) {
    drawPolygon(face.points);
    ctx.fillStyle = face.color;
    ctx.fill();
    if (rough) {
      ctx.strokeStyle = face.color;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
  const patchColors = ['#87745b38', '#77734d28', '#11241337', '#76865432'];
  for (const patch of groundPatches) {
    const camera = toCamera(patch.pos);
    if (camera[2] < 1 || camera[2] > 48) continue;
    const [x, y] = project(camera);
    if (x < -120 || x > width + 120 || y < -40 || y > height + 80 || !aboveTerrain(patch.pos)) continue;
    const points = clipNear(patch.vertices.map(toCamera)).map(project);
    if (points.length < 3) continue;
    drawPolygon(points);
    ctx.fillStyle = patchColors[patch.shade];
    ctx.fill();
  }
  for (const lantern of lit) {
    if (!aboveTerrain([lantern.pos[0], lantern.pos[1] + 0.1, lantern.pos[2]])) continue;
    const camera = toCamera(lantern.pos);
    if (camera[2] > 0.5) {
      const [x, y, depth] = project(camera);
      glow(x, y, focal * 5 / depth, '#ffb75b66');
    }
  }
  for (const [index, pos] of groundDecor.entries()) {
    const camera = toCamera(pos);
    if (camera[2] < 0.5) continue;
    const [x, y, depth] = project(camera);
    if (x < -30 || x > width + 30 || y < 0 || y > height + 30) continue;
    if (!aboveTerrain([pos[0], pos[1] + 0.2, pos[2]])) continue;
    if (depth > 48) continue;
    const size = focal / depth;
    const growth = 0.17 + index % 9 * 0.035;
    const breeze = reducedMotion.matches ? 0 : Math.sin(game.simTick / 26 + pos[0] * 0.4) * 0.12;
    ctx.strokeStyle = index % 4 === 0 ? '#a4a2698c' : '#78985591';
    ctx.lineWidth = Math.max(0.55, size * 0.02);
    ctx.beginPath();
    for (let blade = -2; blade <= 2; blade++) {
      const spread = blade * growth * 0.37;
      const tall = growth * (1 - Math.abs(blade) * 0.12);
      ctx.moveTo(x + size * spread * 0.18, y);
      ctx.quadraticCurveTo(x + size * spread * 0.5, y - size * tall * 0.63,
        x + size * (spread + breeze), y - size * tall);
    }
    ctx.stroke();
  }

  const target = game.lanterns.filter(lamp => !lamp.lit || game.isWeak(lamp))
    .sort((a,b) => distance(a.pos, game.player.pos) - distance(b.pos, game.player.pos))[0];
  lampArrow.hidden = !active || paused || !target;
  if (!lampArrow.hidden) {
    const camera = toCamera([target.pos[0], target.pos[1] + 2.5, target.pos[2]]);
    const [sx, sy] = project(camera);
    lampArrow.hidden = camera[2] > 0.5 && sx >= 0 && sx <= width && sy >= 0 && sy <= height;
    if (!lampArrow.hidden) {
      const direction = Math.atan2(camera[0], camera[2] - cameraBack);
      lampArrow.style.setProperty('--direction', direction + 'rad');
    }
  }
  const windWarning = night === 3 && (game.wind.active || game.simTick % 1800 >= 1680);
  if (windWarning && !reducedMotion.matches) {
    const angle = game.wind.dir_deg * Math.PI / 180;
    for (let i = 0; i < 24; i++) {
      const x = ((i * 137 + game.simTick * Math.cos(angle) * 2) % width + width) % width;
      const y = ((i * 53 + game.simTick * Math.sin(angle)) % height + height) % height;
      ellipse(x, y, 4, 1.2, '#cdd79799');
    }
  }
  const objects = [
    ...bushes,
    ...game.layout.pads.map(item => ({ ...item, kind: 'pad', height: 0 })),
    ...game.charms.filter(item => !item.timer).map(item => ({ ...item, kind: 'charm', height: 0.4 })),
    ...game.drifters.filter(item => item.state !== 'removed').map(item => ({ ...item, kind: 'drifter', height: 1.3 })),
    ...(night === 3 ? [{ pos: [0,6,0], kind: 'tower', height: 0 }] : []),
    ...items.map(item => ({ ...item, itemKind: item.kind, kind: 'item', height: 0.32 })),
    ...game.motes.map((item, index) => ({ ...item, kind: 'mote', height: 0.55 + (reducedMotion.matches ? 0 : Math.sin(game.tick / 18 + index) * 0.2) })),
    ...game.lanterns.map(item => ({ ...item, kind: 'lantern', height: 0 })),
    ...game.shades.map(item => ({ ...item, kind: 'shade', height: 0.72 })),
    { ...game.player, kind: 'player', height: 0 },
  ].map(item => {
    const [x, y, z] = item.pos;
    const pos = [x, y + item.height, z];
    return { ...item, worldPos: pos, camera: toCamera(pos) };
  }).filter(item => item.camera[2] > 0.5).sort((a, b) => b.camera[2] - a.camera[2]);

  for (const item of objects) {
    const [x, y, depth] = project(item.camera);
    const scale = focal / depth;
    if (x < -scale * 2 || x > width + scale * 2) continue;
    let hiddenHeight = 0;
    if (rough && item.kind !== 'player' && !aboveTerrain(item.worldPos)) {
      const [wx, wy, wz] = item.worldPos;
      const top = item.kind === 'lantern' ? 3.6
        : item.kind === 'bush' ? item.size * 1.29 : item.kind === 'rock' ? item.size : 0.7;
      if (!aboveTerrain([wx, wy + top, wz])) continue;
      let low = 0;
      let high = top;
      for (let step = 0; step < 5; step++) {
        const middle = (low + high) / 2;
        if (aboveTerrain([wx, wy + middle, wz])) high = middle;
        else low = middle;
      }
      hiddenHeight = high;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (hiddenHeight) {
      ctx.beginPath();
      ctx.rect(-8, -12, 16, 12 - hiddenHeight);
      ctx.clip();
    }
    if (item.kind === 'pad') {
      ellipse(0, 0, 1, 0.35, '#355d64');
      ellipse(0, -0.04, 0.7, 0.22, '#79d6c4');
    } else if (item.kind === 'charm') {
      glow(0, -0.2, 0.8, '#ff746977');
      ctx.fillStyle = '#ffd27b';
      ctx.fillRect(-0.18, -0.66, 0.36, 0.65);
      ctx.fillStyle = palette.scarf;
      ctx.fillRect(-0.12, -0.60, 0.24, 0.53);
    } else if (item.kind === 'drifter') {
      glow(0, 0, 1.2, '#8bb4bc66');
      ellipse(0, 0, 0.64, 0.17, palette.drifter);
      ellipse(-0.42, 0.1, 0.45, 0.08, '#658e9e');
    } else if (item.kind === 'tower') {
      ctx.fillStyle = '#756c6e';
      ctx.fillRect(-1.95, -7, 3.9, 7);
      ellipse(0, -7.1, 2.35, 0.48, '#38323f');
      ellipse(0, -6.15, 0.72, 0.68, '#b99455');
    } else if (item.kind === 'item') {
      const type = itemTypes[item.itemKind];
      glow(0, -0.12, 1.1, type.color + '8c');
      ctx.fillStyle = type.color;
      if (item.itemKind === 'herb') {
        ctx.fillRect(-0.07, -0.48, 0.14, 0.46);
        ctx.fillRect(-0.23, -0.32, 0.46, 0.14);
      } else {
        ellipse(0, -0.16, 0.24, 0.22, type.color);
        ellipse(0, -0.37, 0.11, 0.05, '#fff0be');
      }
    } else if (item.kind === 'rock') {
      const size = item.size;
      const lean = Math.sin(item.pos[0] * 0.7) * 0.21;
      const ridge = [lean, -0.95];
      const left = [-0.7, -0.52];
      const right = [0.65, -0.49];
      const face = [0.22 + lean * 0.4, -0.34];
      ellipse(0, 0.02, size * 1.07, size * 0.23, '#071513b0');
      const faces = [
        { points: [[-0.85, 0], left, ridge, face, [-0.24, 0.09]], color: '#747e7d' },
        { points: [left, ridge, right, face], color: '#8b9693' },
        { points: [face, right, [0.85, 0], [0.34, 0.11]], color: '#3b484e' },
        { points: [[-0.24, 0.09], face, [0.34, 0.11]], color: '#56615f' },
      ];
      for (const { points, color } of faces) {
        drawPolygon(points.map(([x, y]) => [x * size, y * size]));
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(left[0] * size, left[1] * size);
      ctx.lineTo(lean * size, ridge[1] * size);
      ctx.lineTo(right[0] * size, right[1] * size);
      ctx.strokeStyle = '#c2c9bd77';
      ctx.lineWidth = size * 0.028;
      ctx.stroke();
    } else if (item.kind === 'bush') {
      const size = item.size;
      const variant = Math.floor(Math.abs(item.pos[0] * 7 + item.pos[2] * 11)) % foliage.length;
      ellipse(0, -0.01, size * 0.79, size * 0.2, '#0e241b92');
      ctx.drawImage(foliage[variant], -size, -size * 1.29, size * 2, size * 1.37);
    } else if (item.kind === 'mote') {
      glow(0, 0, 0.95, palette.moteGlow + 'd0');
      ellipse(0, 0, 0.145, 0.145, palette.moteCore);
    } else if (item.kind === 'lantern') {
      ellipse(0, 0, 0.56, 0.15, '#151a27');
      ctx.fillStyle = palette.wood;
      ctx.fillRect(-0.085, -2.3, 0.17, 2.3);
      const lowFuel = game.isWeak(item);
      const dim = lowFuel && !reducedMotion.matches && game.simTick % HZ >= HZ / 2;
      if (item.lit && !dim) glow(0, -2.5, 2.7, '#ffb358b5');
      ctx.fillStyle = item.lit && !dim ? palette.lantern : palette.lanternOff;
      ctx.fillRect(-0.35, item.lit ? -2.78 : -2.67, 0.7, item.lit ? 0.63 : 0.504);
      if (item.lit && !dim) ellipse(0, -2.46, 0.13, 0.19, palette.lanternCore);
      if (!item.lit) {
        ctx.beginPath();
        ctx.moveTo(-0.1, -2.65);
        ctx.lineTo(0.06, -2.48);
        ctx.lineTo(-0.02, -2.4);
        ctx.lineTo(0.14, -2.16);
        ctx.strokeStyle = '#362531';
        ctx.lineWidth = 0.045;
        ctx.stroke();
      }
      ellipse(0, item.lit ? -2.82 : -2.7, 0.48, 0.15, '#513436');
      ellipse(0, -2.12, 0.38, 0.09, '#513436');
      ctx.font = '0.27px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffedce';
      ctx.fillText(item.lit ? item.id : item.id + '  ' + item.deposited + '/' + game.cost(item), 0, -3.15);
      if (item.lit) {
        ctx.fillStyle = '#231b21';
        ctx.fillRect(-0.6, -3.55, 1.2, 0.13);
        ctx.fillStyle = lowFuel ? contrastToggle.checked ? '#ffffff' : '#ff5a5f' : '#ffd383';
        ctx.globalAlpha = dim ? 0.3 : 1;
        ctx.fillRect(-0.6, -3.55, 1.2 * item.fuelUnits / (tuning.fuel_max * HZ), 0.13);
      }
    } else if (item.kind === 'shade') {
      glow(0, 0, 1.4, '#41185fa6');
      const accent = contrastToggle.checked ? '#00B3FF' : palette.shadeRim;
      ellipse(0, 0, 0.51, 0.75, accent);
      ellipse(0, 0, 0.48, 0.72, item.state === 'stunned' ? palette.stunned : palette.shade);
      ellipse(-0.15, -0.14, 0.055, 0.07, accent);
      ellipse(0.15, -0.14, 0.055, 0.07, accent);
    } else if (item.kind === 'player') {
      drawMay(angle);
    }
    ctx.restore();
  }
}

function frame(now) {
  if (active && !paused) {
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

const rendererStatus = byId('renderer-status');
let rendererBeforeLoss;
function showRenderer(renderer) {
  renderer3d = renderer;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas3d.hidden = false;
  rendererStatus.hidden = true;
}
function useCanvas(reason, error) {
  renderer3d = undefined;
  canvas3d.hidden = true;
  rendererStatus.textContent = 'Đang chạy Canvas dự phòng. ' + reason;
  rendererStatus.title = error?.message ?? '';
  rendererStatus.hidden = false;
  if (error) console.warn(reason, error);
}
async function startRenderer() {
  let makeRenderer;
  try {
    ({ makeRenderer } = await import('./world-renderer.mjs'));
  } catch (error) {
    useCanvas('Không tải được thư viện Three.js.', error);
    return;
  }
  try {
    showRenderer(makeRenderer(canvas3d));
  } catch (error) {
    useCanvas('Trình duyệt không mở được WebGL 2.', error);
  }
}
void startRenderer();
canvas3d.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  rendererBeforeLoss = renderer3d;
  useCanvas('Trình duyệt đã mất kết nối với WebGL 2.');
});
canvas3d.addEventListener('webglcontextrestored', () => {
  if (rendererBeforeLoss) showRenderer(rendererBeforeLoss);
  rendererBeforeLoss = undefined;
});
