import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const routes = new Map([
  ['/', ['index.html', 'text/html']],
  ['/style.css', ['style.css', 'text/css']],
  ['/src/browser.mjs', ['src/browser.mjs', 'text/javascript']],
  ['/src/game.mjs', ['src/game.mjs', 'text/javascript']],
  ['/src/night-game.mjs', ['src/night-game.mjs', 'text/javascript']],
  ['/src/nights.mjs', ['src/nights.mjs', 'text/javascript']],
  ['/src/palette.mjs', ['src/palette.mjs', 'text/javascript']],
  ['/src/sound.mjs', ['src/sound.mjs', 'text/javascript']],
  ['/src/world-renderer.mjs', ['src/world-renderer.mjs', 'text/javascript']],
  ['/vendor/three.module.js', ['node_modules/three/build/three.module.js', 'text/javascript']],
  ['/vendor/three.core.js', ['node_modules/three/build/three.core.js', 'text/javascript']],
  ['/node_modules/three/build/three.module.js', ['node_modules/three/build/three.module.js', 'text/javascript']],
  ['/node_modules/three/build/three.core.js', ['node_modules/three/build/three.core.js', 'text/javascript']],
  ['/game.contract.json', ['game.contract.json', 'application/json']],
]);

export function gameServer() {
  return createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const route = routes.get(path);
  if (!route) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(new URL(route[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': route[1] + '; charset=utf-8' }).end(body);
  } catch {
    response.writeHead(500).end();
  }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  gameServer().listen(port, '127.0.0.1', () => console.log('Đảo Đèn Lồng — http://127.0.0.1:' + port));
}
