import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, platform, release, arch } from 'node:os';
import { join } from 'node:path';
import { gameServer } from '../server.mjs';

const started = performance.timeOrigin;
const [seedArg, seedText, durationArg, durationText, outArg, out] = process.argv.slice(2);
const seed = Number(seedText);
const duration = Number(durationText);
if (seedArg !== '--seed' || !Number.isSafeInteger(seed) || durationArg !== '--duration'
  || !Number.isFinite(duration) || duration <= 0 || outArg !== '--out' || !out || process.argv.length !== 8) {
  console.error('Usage: --seed <int> --duration <seconds> --out bench.json');
  process.exit(2);
}

const candidates = {
  win32: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};
const chrome = process.env.BENCH_CHROME ?? candidates[platform()]?.find(existsSync);
if (!chrome) {
  console.error('Chrome/Chromium not found. Set BENCH_CHROME to its executable path.');
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'dao-den-long-bench-'));
let browser;
let server;
let timeout;
let closing = false;
function finish(error, report) {
  if (closing) return;
  closing = true;
  clearTimeout(timeout);
  if (error) {
    console.error(error);
    process.exitCode = 1;
  } else {
    try {
      report.os = platform() + ' ' + release() + ' ' + arch();
      writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify(report));
    } catch (exception) {
      console.error(exception.message);
      process.exitCode = 1;
    }
  }
  browser?.kill();
  server?.closeAllConnections();
  server?.close();
  setTimeout(() => {
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }, 350).unref();
}
server = gameServer(data => finish(data.error, data));
server.on('error', error => finish(error.message));
server.listen(0, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/bench.html?' + new URLSearchParams({ seed, duration, started });
  const flags = ['--window-size=1280,720', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--user-data-dir=' + profile];
  if (process.env.BENCH_HEADLESS === '1') flags.push('--headless');
  if (process.env.BENCH_SOFTWARE === '1') flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  if (process.env.BENCH_NO_SANDBOX === '1') flags.push('--no-sandbox');
  browser = spawn(chrome, [...flags, '--app=' + url], { stdio: 'ignore', windowsHide: false });
  browser.once('error', error => finish(error.message));
  browser.once('exit', code => {
    if (!closing) finish('Browser exited before benchmark result: ' + code);
  });
  timeout = setTimeout(() => finish('Benchmark timed out'), (duration + 55) * 1000);
});
