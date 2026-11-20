import { mkdir, copyFile, cp, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const destination = 'dist/dao-den-long-v1.0.0';
const files = ['index.html','style.css','server.mjs','headless.mjs','bench.html','game.contract.json','README.md',
  'LICENSE','CREDITS.md','CHANGELOG.md','package.json','package-lock.json','bench.json','soak.json',
  'AGENTS.md','SUBMISSION.md','RULES.md','RUBRIC.md','GUIDE.md','CHECKPOINTS.md','node_modules/three/build/three.module.js',
  'node_modules/three/build/three.core.js','node_modules/three/LICENSE'];
for (const file of files) {
  const output = join(destination, file);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(file, output);
}
for (const dir of ['src','scripts','tests','docs']) await cp(dir, join(destination, dir), { recursive: true });
await writeFile(join(destination, 'CHAY-GAME.txt'), 'Can Node.js 20 tro len. Tai thu muc nay, chay node server.mjs\nMo http://127.0.0.1:8080 trong Chrome hoac Edge.\n');
console.log(destination);
