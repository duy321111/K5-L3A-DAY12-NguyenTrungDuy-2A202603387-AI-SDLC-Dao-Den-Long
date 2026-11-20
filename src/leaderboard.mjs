import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const disk = resolve(process.env.LEADERBOARD_FILE ?? '.local/leaderboard.json');
export const validName = name => typeof name === 'string' && /^[A-Za-z0-9_]{3,12}$/.test(name);

export async function entries() {
  try {
    return JSON.parse(await readFile(disk, 'utf8')).entries;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

let pending = Promise.resolve();
export function addScore(input) {
  if (!validName(input?.name) || !Number.isSafeInteger(input.score) || input.score < 0
    || !Number.isInteger(input.nights_won) || input.nights_won < 0 || input.nights_won > 3
    || !Number.isSafeInteger(input.seed)) {
    throw new RangeError('Tên hoặc điểm không hợp lệ');
  }
  const row = { name: input.name, score: input.score, nights_won: input.nights_won,
    achieved_at: new Date().toISOString(), seed: input.seed };
  const operation = pending.then(async () => {
    const rows = [...(await entries()), row].sort((a, b) => b.score - a.score
      || a.achieved_at.localeCompare(b.achieved_at)).slice(0, 10);
    await mkdir(dirname(disk), { recursive: true });
    const temp = disk + '.' + randomUUID() + '.tmp';
    await writeFile(temp, JSON.stringify({ entries: rows }, null, 2) + '\n');
    await rename(temp, disk);
    return rows;
  });
  pending = operation.catch(() => {});
  return operation;
}
