import { palette, ambientStrength } from './palette.mjs';

const T = await import('../node_modules/three/build/three.module.js')
  .catch(() => import('/vendor/three.module.js'));

const standard = (color, options = {}) => new T.MeshStandardMaterial({ color, roughness: 0.83, ...options });
const sphere = new T.SphereGeometry(1, 12, 8);
const box = new T.BoxGeometry();
const boulder = new T.IcosahedronGeometry(1, 1);
const leaf = new T.IcosahedronGeometry(1, 0);
const wood = standard(palette.wood);
const stone = standard(0x84867a, { flatShading: true });
const skin = standard(0xd6aa82);
const coat = standard(palette.coat);
const scarf = standard(palette.scarf);
const darkCloth = standard(0x292733);
const straw = standard(0xc69a56);
const amber = standard(palette.lantern, { emissive: palette.lantern, emissiveIntensity: 1.5 });
const dormant = standard(palette.lanternOff);
const lampCore = new T.MeshBasicMaterial({ color: palette.lanternCore, toneMapped: false });
const tint = new T.Color();
const cameraPoint = new T.Vector3();
const transform = new T.Object3D();
const groundTileMeters = 22;
const h = (i, j = 0) => {
  const n = Math.sin(i * 127.1 + j * 311.7 + 0.73) * 43758.5453;
  return n - Math.floor(n);
};

function mesh(parent, geometry, material, pos = [0,0,0], scale = [1,1,1]) {
  const object = new T.Mesh(geometry, material);
  object.position.set(...pos);
  object.scale.set(...scale);
  object.castShadow = object.receiveShadow = true;
  parent.add(object);
  return object;
}

function groundTexture() {
  const canvas = document.createElement('canvas');
  const size = 512;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(size, size);
  function noise(x, z, frequency, salt) {
    const ix = Math.floor(x * frequency);
    const iz = Math.floor(z * frequency);
    const sx = T.MathUtils.smoothstep(x * frequency - ix, 0, 1);
    const sz = T.MathUtils.smoothstep(z * frequency - iz, 0, 1);
    const sample = (a, b) => h(T.MathUtils.euclideanModulo(a, frequency) + salt,
      T.MathUtils.euclideanModulo(b, frequency) + salt * 3);
    const lower = T.MathUtils.lerp(sample(ix, iz), sample(ix + 1, iz), sx);
    const upper = T.MathUtils.lerp(sample(ix, iz + 1), sample(ix + 1, iz + 1), sx);
    return T.MathUtils.lerp(lower, upper, sz);
  }
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const index = (x + z * size) * 4;
      const u = x / size;
      const v = z / size;
      const warpedU = u + (noise(u, v, 4, 13) - 0.5) * 0.21;
      const warpedV = v + (noise(u, v, 4, 37) - 0.5) * 0.21;
      const brown = T.MathUtils.smoothstep(noise(warpedU, warpedV, 7, 93), 0.35, 0.76);
      const grain = 20 * (noise(u, v, 61, 3) - 0.5) + 12 * (noise(warpedU, warpedV, 19, 51) - 0.5)
        + 10 * (h(x, z) - 0.5);
      pixels.data[index] = 47 + brown * 13 + grain * 0.36;
      pixels.data[index + 1] = 93 - brown * 9 + grain * 0.36;
      pixels.data[index + 2] = 80 - brown * 10 + grain * 0.36;
      pixels.data[index + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}

function polygonGeometry(faces) {
  const positions = [];
  const uv = [];
  for (const face of faces) {
    for (let i = 1; i + 1 < face.length; i++) {
      for (const point of [face[0], face[i], face[i + 1]]) {
        positions.push(...point);
        uv.push(point[0] / groundTileMeters, point[2] / groundTileMeters);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function terrainGeometry(center, radius, layout) {
  const segments = 112;
  const bands = layout.continuousTerrain ? 38 : 1;
  const positions = [center, layout.continuousTerrain ? layout.floors(center, 0)[0] : 0, 0];
  const uv = [center / groundTileMeters, 0];
  const indices = [];
  for (let band = 1; band <= bands; band++) {
    for (let index = 0; index < segments; index++) {
      const angle = index / segments * Math.PI * 2;
      const x = center + Math.cos(angle) * radius * band / bands;
      const z = Math.sin(angle) * radius * band / bands;
      positions.push(x, layout.continuousTerrain ? layout.floors(x, z)[0] ?? 0 : 0, z);
      uv.push(x / groundTileMeters, z / groundTileMeters);
      const outer = 1 + (band - 1) * segments + index;
      const next = 1 + (band - 1) * segments + (index + 1) % segments;
      if (band === 1) indices.push(0, next, outer);
      else indices.push(outer - segments, next, outer, outer - segments, next - segments, next);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function scatter(group, geometry, material, entries) {
  if (!entries.length) return;
  const instances = new T.InstancedMesh(geometry, material, entries.length);
  entries.forEach(({ pos, scale, yaw, color }, index) => {
    transform.position.set(...pos);
    transform.scale.set(...scale);
    transform.rotation.set(0, yaw, 0);
    transform.updateMatrix();
    instances.setMatrixAt(index, transform.matrix);
    if (color) instances.setColorAt(index, tint.set(color));
  });
  instances.receiveShadow = true;
  group.add(instances);
  return instances;
}

function grassGeometry() {
  const blades = Array.from({ length: 7 }, (_, i) => {
    const x = (h(i) - 0.5) * 0.36;
    const z = (h(i, 1) - 0.5) * 0.36;
    const tall = 0.22 + h(i, 2) * 0.25;
    return [[x - 0.04, 0, z], [x + 0.04, 0, z], [x + 0.025, tall * 0.65, z + 0.04],
      [x + 0.15, tall, z + 0.09]];
  });
  return polygonGeometry(blades);
}

function makePlayer(scene) {
  const root = new T.Group();
  scene.add(root);
  const body = new T.Group();
  root.add(body);
  mesh(body, new T.CylinderGeometry(0.24, 0.31, 0.64, 12), coat, [0,1.02,0]);
  mesh(body, sphere, skin, [0,1.52,0.02], [0.22,0.26,0.21]);
  mesh(body, new T.ConeGeometry(0.59, 0.43, 24), straw, [0,1.83,0]);
  mesh(body, new T.TorusGeometry(0.56, 0.025, 6, 24), wood, [0,1.62,0]).rotation.x = Math.PI / 2;
  mesh(body, new T.CylinderGeometry(0.235, 0.247, 0.10, 14), scarf, [0,1.36,0]);
  mesh(body, new T.CylinderGeometry(0.29, 0.29, 0.055, 14), wood, [0,0.88,0]);
  const lantern = new T.Group();
  lantern.position.set(0.42, 1.6, 0.16);
  body.add(lantern);
  mesh(lantern, new T.CylinderGeometry(0.014, 0.014, 0.29, 5), wood, [0,-0.14,0]);
  mesh(lantern, sphere, amber, [0,-0.32,0], [0.105,0.14,0.105]);
  const legs = [];
  const arms = [];
  for (const side of [-1, 1]) {
    const leg = new T.Group();
    leg.position.set(side * 0.145,0.73,0);
    body.add(leg);
    mesh(leg, new T.CapsuleGeometry(0.093, 0.38, 4, 8), darkCloth, [0,-0.29,0]);
    mesh(leg, sphere, wood, [0,-0.64,0.07], [0.108,0.09,0.19]);
    legs.push(leg);
    const arm = new T.Group();
    arm.position.set(side * 0.27,1.23,0);
    arm.rotation.z = side * 0.2;
    body.add(arm);
    mesh(arm, new T.CapsuleGeometry(0.081, 0.29, 4, 8), coat, [0,-0.20,0]);
    mesh(arm, sphere, skin, [0,-0.42,0], [0.076,0.083,0.077]);
    arms.push(arm);
  }
  return { root, body, legs, arms, lantern };
}

function lampModel(group, lamp) {
  const base = new T.Group();
  base.position.set(...lamp.pos);
  group.add(base);
  mesh(base, new T.CylinderGeometry(0.13, 0.23, 2.8, 9), wood, [0,1.4,0]);
  mesh(base, new T.CylinderGeometry(0.42, 0.55, 0.28, 8), stone, [0,0.14,0]);
  const lantern = mesh(base, new T.CylinderGeometry(0.4, 0.44, 0.72, 8), dormant, [0,2.79,0]);
  const core = mesh(base, sphere, lampCore, [0,2.79,0], [0.24,0.25,0.405]);
  core.castShadow = false;
  const lid = mesh(base, new T.ConeGeometry(0.62, 0.33, 8), wood, [0,3.28,0]);
  mesh(base, new T.CylinderGeometry(0.48, 0.39, 0.10, 8), wood, [0,2.38,0]);
  const rip = new T.Shape().moveTo(-0.04, 0.19).lineTo(0.04, 0.03).lineTo(0.005, -0.015)
    .lineTo(0.065, -0.20).lineTo(-0.05, -0.025).lineTo(-0.012, 0.015).closePath();
  const tear = new T.Group();
  for (let side = 0; side < 4; side++) {
    const turn = side * Math.PI / 2;
    const mark = mesh(tear, new T.ShapeGeometry(rip), tornPaper,
      [Math.sin(turn) * 0.43, 2.72, Math.cos(turn) * 0.43]);
    mark.rotation.y = turn;
    mark.castShadow = mark.receiveShadow = false;
  }
  base.add(tear);
  const display = document.createElement('canvas');
  display.width = 192;
  display.height = 48;
  const texture = new T.CanvasTexture(display);
  texture.colorSpace = T.SRGBColorSpace;
  const gauge = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, toneMapped: false }));
  gauge.position.set(0,3.86,0);
  gauge.scale.set(1.46,0.365,1);
  base.add(gauge);
  const light = new T.PointLight(0xffbd76, 0, 10, 2);
  light.position.y = 2.7;
  base.add(light);
  return { lantern, core, lid, tear, light, gauge, texture, brush: display.getContext('2d'), gaugeKey: '' };
}

const tornPaper = new T.MeshBasicMaterial({ color: 0x20171d, side: T.DoubleSide });


function updateLamp(model, lamp) {
  model.lantern.material = lamp.lit ? amber : dormant;
  model.light.intensity = lamp.lit ? 24 : 0;
  model.tear.visible = false;
  model.core.visible = lamp.lit;
  model.gauge.visible = false;
}

function ocean(scene) {
  const material = new T.ShaderMaterial({
    uniforms: { time: { value: 0 }, seaColor: { value: new T.Color(palette.sea) }, fogColor: { value: new T.Color(palette.fog) } },
    vertexShader: `
      varying vec3 world;
      void main() {
        world = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: `
      varying vec3 world;
      uniform float time;
      uniform vec3 seaColor;
      uniform vec3 fogColor;
      void main() {
        vec2 p = world.xz;
        float a = p.x * 0.57 + p.y * 0.86 + time * 1.25;
        float b = p.x * -1.37 + p.y * 0.23 - time * 1.08;
        float c = p.x * 2.1 + p.y * 1.84 - time * 1.72;
        vec3 normal = normalize(vec3(
          -0.065*cos(a)+0.048*cos(b)-0.039*cos(c), 1.0,
          -0.100*cos(a)-0.018*cos(b)-0.041*cos(c)));
        vec3 view = normalize(cameraPosition - world);
        vec3 moon = normalize(vec3(-0.42, 0.26, 0.86));
        float grazing = pow(1.0 - max(0.0, dot(normal, view)), 3.2);
        float reflection = pow(max(0.0, dot(reflect(-moon, normal), view)), 45.0);
        float ripple = sin(a) * sin(b) * 0.013 + sin(c) * 0.005;
        vec3 color = mix(seaColor, seaColor * 2.2, grazing);
        color += vec3(0.83,0.69,0.47) * reflection * 0.49 + ripple * 0.62;
        float mist = smoothstep(65.0, 390.0, distance(world, cameraPosition));
        gl_FragColor = vec4(mix(color, fogColor, mist), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new T.Mesh(new T.PlaneGeometry(1300, 1300), material);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -4.2;
  scene.add(water);
  return material.uniforms.time;
}

function sky(scene) {
  scene.background = new T.Color(palette.sky);
  const stars = [];
  for (let i = 0; i < 700; i++) {
    const yaw = h(i, 4) * Math.PI * 2;
    const altitude = 0.05 + h(i, 7) * 1.48;
    stars.push(Math.sin(yaw) * Math.cos(altitude) * 460,
      Math.sin(altitude) * 460, Math.cos(yaw) * Math.cos(altitude) * 460);
  }
  const points = new T.BufferGeometry();
  points.setAttribute('position', new T.Float32BufferAttribute(stars, 3));
  scene.add(new T.Points(points, new T.PointsMaterial({ color: 0xc9deff, size: 1.6, fog: false })));
  const moon = new T.Mesh(sphere, new T.MeshBasicMaterial({ color: 0xffe7b9, fog: false }));
  moon.position.set(-190, 118, 387);
  moon.scale.setScalar(8);
  scene.add(moon);
}

export function makeRenderer(canvas, { pixelRatio = Math.min(devicePixelRatio, 1.35) } = {}) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(palette.fog, 0.0047);
  const camera = new T.PerspectiveCamera(55, 1, 0.15, 900);
  const ambient = new T.HemisphereLight(0xbad4fc, 0x46533e, 1.05);
  scene.add(ambient);
  const moonlight = new T.DirectionalLight(0xc4d7ff, 1.8);
  moonlight.castShadow = true;
  moonlight.shadow.mapSize.set(1536, 1536);
  moonlight.shadow.radius = 2.5;
  Object.assign(moonlight.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 75 });
  moonlight.shadow.bias = -0.0003;
  moonlight.shadow.normalBias = 0.035;
  scene.add(moonlight, moonlight.target);
  const player = makePlayer(scene);
  const playerLight = new T.PointLight(0xffb665, 5, 6, 2);
  scene.add(playerLight);
  const time = ocean(scene);
  sky(scene);
  const texture = groundTexture();
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const earth = standard(0xffffff, { map: texture, bumpMap: texture, bumpScale: 0.025, side: T.DoubleSide });
  const cliff = standard(palette.sand, { side: T.DoubleSide });
  const grass = grassGeometry();
  const grassMaterial = standard(0xffffff, { side: T.DoubleSide, emissive: 0x182113, emissiveIntensity: 0.24 });
  const leaves = standard(0xffffff, { flatShading: true });
  const plank = standard(palette.wood, { side: T.DoubleSide });
  let world;
  let currentGame;
  let lamps = [];
  const dynamic = new Map();
  const mote = new T.MeshBasicMaterial({ color: palette.moteCore, toneMapped: false });
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 32;
  const glowBrush = glowCanvas.getContext('2d');
  const glowGradient = glowBrush.createRadialGradient(16, 16, 1, 16, 16, 16);
  glowGradient.addColorStop(0, palette.moteGlow + '99');
  glowGradient.addColorStop(1, palette.moteGlow + '00');
  glowBrush.fillStyle = glowGradient;
  glowBrush.fillRect(0, 0, 32, 32);
  const glowTexture = new T.CanvasTexture(glowCanvas);
  glowTexture.colorSpace = T.SRGBColorSpace;
  const moteHalo = new T.SpriteMaterial({ map: glowTexture, depthWrite: false, transparent: true, toneMapped: false });
  const shade = standard(palette.shade, { emissive: palette.shade, emissiveIntensity: 0.65 });
  const stunned = standard(palette.stunned);
  const ribbon = standard(palette.drifter);
  const green = standard(0x7acb9b, { emissive: 0x26784d });
  const red = standard(palette.scarf, { emissive: 0x691d22 });
  const eye = new T.MeshBasicMaterial({ color: palette.shadeRim });
  const outline = new T.MeshBasicMaterial({ color: palette.shadeRim, side: T.BackSide });
  const shadeBody = shade.clone();
  shadeBody.color.set(0xffffff);
  let shadeBatch;
  const shadeMatrix = new T.Matrix4();
  const shadeColor = new T.Color();
  const shared = new Set([sphere, box, boulder, leaf, grass]);

  function clearWorld() {
    if (!world) return;
    for (const lamp of lamps) {
      lamp.texture.dispose();
      lamp.gauge.material.dispose();
    }
    world.traverse(object => {
      if (object.isMesh && !shared.has(object.geometry)) object.geometry.dispose();
      if (object.isInstancedMesh) object.dispose();
    });
    scene.remove(world);
    dynamic.clear();
  }

  function build(game, scenery) {
    clearWorld();
    currentGame = game;
    world = new T.Group();
    scene.add(world);
    for (const [center, radius] of game.layout.islands) {
      mesh(world, terrainGeometry(center, radius, game.layout), earth).castShadow = false;
      const coast = new T.Mesh(new T.CylinderGeometry(radius, radius * 1.065, 4.4, 112, 1, true), cliff);
      coast.position.set(center, -2.2, 0);
      coast.receiveShadow = true;
      world.add(coast);
    }
    if (!game.layout.continuousTerrain) {
      for (const isWood of [false, true]) {
        const faces = scenery.surfaces.filter(surface =>
          ['#a4875e', '#846c4b', '#987957'].includes(surface.color) === isWood).map(surface => surface.vertices);
        if (faces.length) mesh(world, polygonGeometry(faces), isWood ? plank : earth);
      }
    }
    scatter(world, grass, grassMaterial, scenery.groundDecor.flatMap((pos, index) => {
      const entries = [];
      for (let n = 0; n < 4; n++) {
        const x = pos[0] + (h(index, n) - 0.5) * 2.7;
        const z = pos[2] + (h(n, index + 200) - 0.5) * 2.7;
        const y = Math.max(...game.layout.floors(x, z));
        if (!Number.isFinite(y)) continue;
        const s = 0.6 + h(n + 18, index) * 0.95;
        entries.push({ pos: [x,y,z], scale: [s,s,s], yaw: h(index, n + 5) * 6.28,
          color: palette.grass });
      }
      return entries;
    }));
    const rocks = [];
    const shrubs = [];
    for (const [index, item] of scenery.bushes.entries()) {
      const s = item.size;
      if (item.kind === 'rock') {
        rocks.push({ pos: [item.pos[0], item.pos[1] + s * 0.32, item.pos[2]], scale: [s * 0.86,s * 0.63,s * 0.83],
          yaw: h(index) * 6.28, color: index % 2 ? 0xbbbab1 : 0x9a9b90 });
      } else {
        for (let n = 0; n < 15; n++) {
          const phase = h(index, n) * Math.PI * 2;
          const radius = Math.sqrt(h(n + 17, index)) * s * 0.72;
          const k = s * (0.18 + h(index + 8, n) * 0.25);
          shrubs.push({ pos: [item.pos[0] + Math.cos(phase) * radius,
            item.pos[1] + k * 0.7 + (0.8 - radius / s) * s * 0.55,
            item.pos[2] + Math.sin(phase) * radius], scale: [k,k * 0.68,k],
          yaw: phase, color: [0x3b5735,0x536d41,0x6b8450,0x324e39][n % 4] });
        }
      }
    }
    const rocksMesh = scatter(world, boulder, stone, rocks);
    if (rocksMesh) rocksMesh.castShadow = true;
    const shrubMesh = scatter(world, leaf, leaves, shrubs);
    if (shrubMesh) shrubMesh.castShadow = true;
    lamps = game.lanterns.map(lamp => lampModel(world, lamp));
    for (const pad of game.layout.pads) {
      mesh(world, new T.CylinderGeometry(1, 1, 0.11, 16), green, [pad.pos[0], pad.pos[1] + 0.03, pad.pos[2]]);
    }
    if (game.night === 3) {
      mesh(world, new T.CylinderGeometry(1.8, 2, 6.6, 16), cliff, [0,9.3,0]);
      mesh(world, new T.ConeGeometry(2.3, 1.4, 16), plank, [0,13.3,0]);
      mesh(world, sphere, amber, [0,11.8,-1.79], [0.45,0.53,0.12]);
    }
    const capacity = Math.max(game.layout.shadeLimit, game.shades.length);
    shadeBatch = [shadeBody, outline, eye].map((material, index) => {
      const batch = new T.InstancedMesh(sphere, material, capacity * (index === 2 ? 2 : 1));
      batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
      batch.frustumCulled = false;
      batch.castShadow = index === 0;
      world.add(batch);
      return batch;
    });
  }

  function drawShades(game, frame) {
    const [bodies, rims, eyes] = shadeBatch;
    const player = game.player.pos;
    const piece = (batch, index, pos, scale, yaw) => {
      transform.position.set(...pos);
      transform.scale.set(...scale);
      transform.rotation.set(0, yaw, 0);
      transform.updateMatrix();
      shadeMatrix.copy(transform.matrix);
      batch.setMatrixAt(index, shadeMatrix);
    };
    for (const [index, item] of game.shades.entries()) {
      const [x,y,z] = item.pos;
      const lift = y + 0.72 + Math.sin(frame * 0.065 + x * 0.4) * 0.11;
      const yaw = Math.atan2(player[0] - x, player[2] - z);
      piece(bodies, index, [x,lift,z], [0.48,0.7,0.43], yaw);
      bodies.setColorAt(index, shadeColor.copy(item.state === 'stunned' ? stunned.color : shade.color));
      piece(rims, index, [x,lift,z], [0.505,0.725,0.455], yaw);
      for (let side = 0; side < 2; side++) {
        const offset = side ? 0.14 : -0.14;
        piece(eyes, 2 * index + side,
          [x + offset * Math.cos(yaw) + 0.39 * Math.sin(yaw), lift + 0.11,
            z - offset * Math.sin(yaw) + 0.39 * Math.cos(yaw)], [0.055,0.07,0.047], yaw);
      }
    }
    bodies.count = rims.count = game.shades.length;
    eyes.count = game.shades.length * 2;
    for (const batch of shadeBatch) batch.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  }

  function showEntity(key, item, type, alive, frame) {
    alive.add(key);
    let object = dynamic.get(key);
    if (!object) {
      const material = type === 'mote' ? mote : type === 'charm' ? red : type === 'drifter' ? ribbon
        : item.kind === 'herb' ? green : amber;
      object = mesh(world, type === 'charm' ? box : sphere, material);
      object.castShadow = false;
      if (type === 'mote') {
        const halo = new T.Sprite(moteHalo);
        halo.scale.setScalar(4.4);
        object.add(halo);
      }
      dynamic.set(key, object);
    }
    const offset = type === 'drifter' ? 1.2 : 0.55;
    const wobble = Math.sin(frame * 0.065 + item.pos[0] * 0.4) * 0.11;
    object.position.set(item.pos[0], item.pos[1] + offset + wobble, item.pos[2]);
    object.scale.set(...(type === 'mote' ? [0.15,0.15,0.15] : type === 'drifter' ? [0.74,0.16,0.19]
      : type === 'charm' ? [0.18,0.47,0.05] : [0.17,0.22,0.16]));
    object.rotation.y = frame * 0.023;
  }

  return {
    get description() {
      const context = renderer.getContext();
      const debug = context.getExtension('WEBGL_debug_renderer_info');
      const gpu = context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER);
      return 'Three.js r' + T.REVISION + ' / WebGL 2 / ' + gpu;
    },
    draw(game, scenery, items, yaw, pitch, reduced, accessible, orbit) {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      if (currentGame !== game) build(game, scenery);
      if (camera.aspect !== width / height || renderer.domElement.width !== Math.floor(width * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      const [x,y,z] = game.player.pos;
      const theta = yaw * Math.PI / 180;
      const back = Math.cos(pitch) * 7.5;
      const cx = x - Math.sin(theta) * back;
      const cz = z - Math.cos(theta) * back;
      const floor = Math.max(-Infinity, ...game.layout.floors(cx, cz));
      camera.position.set(cx, Math.max(floor + 1.2, y + 2.25 + Math.sin(pitch) * 7.5), cz);
      camera.lookAt(x + Math.sin(theta) * 1.8, y + 1.27, z + Math.cos(theta) * 1.8);
      if (orbit) {
        camera.position.set(...orbit);
        camera.lookAt(0, 0, 0);
      }
      moonlight.position.set(x - 14, y + 26, z + 18);
      moonlight.target.position.set(x, y, z);
      playerLight.position.set(x + 0.25, y + 1.55, z);
      const lit = game.lanterns.filter(lamp => lamp.lit).length;
      ambient.intensity = ambientStrength(lit, game.lanterns.length);
      const timeStep = reduced ? 0 : game.simTick;
      time.value = timeStep / 60;
      const pace = Math.hypot(game.player.vel[0], game.player.vel[2]);
      const stride = game.player.grounded ? Math.sin(timeStep * (game.dash ? 0.42 : 0.24)) * Math.min(pace / 6, 1) : 0;
      player.root.position.set(x, y, z);
      player.root.rotation.y = Math.atan2(game.facing[0], game.facing[1]);
      player.body.position.y = Math.abs(stride) * 0.045 + Math.sin(timeStep * 0.06) * 0.024;
      player.body.rotation.x = game.dash ? 0.23 : pace > 1 ? 0.075 : 0;
      player.lantern.rotation.x = stride * 0.38;
      player.legs.forEach((leg, i) => { leg.rotation.x = game.player.grounded ? stride * (i ? 0.7 : -0.7) : i ? 0.45 : -0.32; });
      player.arms.forEach((arm, i) => { arm.rotation.x = game.player.grounded ? stride * (i ? -0.55 : 0.55) : -0.48; });
      eye.color.set(accessible ? '#00B3FF' : palette.shadeRim);
      outline.color.copy(eye.color);
      game.lanterns.forEach((lamp, i) => updateLamp(lamps[i], lamp, game, reduced, accessible));
      const alive = new Set();
      for (const item of game.motes) showEntity('m' + item.id, item, 'mote', alive, timeStep);
      drawShades(game, timeStep);
      for (const item of game.drifters) if (item.state !== 'removed') showEntity('d' + item.id, item, 'drifter', alive, timeStep);
      for (const item of game.charms) if (!item.timer) showEntity('c' + item.id, item, 'charm', alive, timeStep);
      for (const item of items) showEntity('i' + item.pos.join(','), item, 'item', alive, timeStep);
      for (const [key, object] of dynamic) if (!alive.has(key)) {
        world.remove(object);
        dynamic.delete(key);
      }
      renderer.render(scene, camera);
    },
    marker(pos) {
      cameraPoint.set(pos[0], pos[1] + 2.5, pos[2]).applyMatrix4(camera.matrixWorldInverse);
      const direction = Math.atan2(cameraPoint.x, -cameraPoint.z);
      cameraPoint.applyMatrix4(camera.projectionMatrix);
      return { direction, visible: cameraPoint.z > -1 && cameraPoint.z < 1
        && Math.abs(cameraPoint.x) <= 1 && Math.abs(cameraPoint.y) <= 1 };
    },
  };
}
