import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { addScore, entries } from './src/leaderboard.mjs';

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
  ['/bench.html', ['bench.html', 'text/html']],
  ['/src/bench-page.mjs', ['src/bench-page.mjs', 'text/javascript']],
]);
async function json(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16384) throw new RangeError('Request too large');
  }
  return JSON.parse(body);
}

export function gameServer(benchReport) {
  return createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/api/leaderboard' || (benchReport && path === '/api/benchmark')) {
    try {
      if (path === '/api/benchmark' && request.method === 'POST') {
        const result = await json(request);
        response.writeHead(204).end();
        benchReport(result);
        return;
      }
      if (!['GET', 'POST'].includes(request.method)) {
        response.writeHead(405).end();
        return;
      }
      const rows = request.method === 'GET' ? await entries() : await addScore(await json(request));
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ entries: rows }));
    } catch (error) {
      const code = error instanceof RangeError || error instanceof SyntaxError ? 400 : 500;
      response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: error.message }));
    }
    return;
  }
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
  const [command, out] = process.argv.slice(2);
  if (command === '--export-leaderboard' && out && process.argv.length === 4) {
    await writeFile(out, JSON.stringify({ entries: await entries() }, null, 2) + '\n');
  } else if (command) {
    console.error('Usage: node server.mjs [--export-leaderboard out.json]');
    process.exitCode = 2;
  } else {
    const port = Number(process.env.PORT ?? 8080);
    gameServer().listen(port, '127.0.0.1', () => console.log('Đảo Đèn Lồng — http://127.0.0.1:' + port));
  }
}
