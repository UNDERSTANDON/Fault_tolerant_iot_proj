import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export function getUsersFilePath() {
  const appDataDir = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'FaultTolerantIoT')
    : process.env.XDG_DATA_HOME
      ? path.join(process.env.XDG_DATA_HOME, 'FaultTolerantIoT')
      : path.join(os.homedir(), '.fault_tolerant_iot');
  return path.join(appDataDir, 'local-server', 'users.json');
}

export function createLocalAdminAccount({ usersFile, username, password }) {
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    throw new Error('Username must be 3-20 characters (letters, numbers, underscore).');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  if (existsSync(usersFile)) {
    throw new Error('An account file already exists; refusing to overwrite it.');
  }

  const salt = randomBytes(16).toString('hex');
  const user = {
    id: `admin-${randomBytes(16).toString('hex')}`,
    username: normalizedUsername,
    role: 'admin',
    enabled: true,
    createdAt: Date.now(),
    salt,
    passwordHash: pbkdf2Sync(password, Buffer.from(salt, 'hex'), 120000, 64, 'sha256').toString('hex'),
    preferences: { theme: 'light' }
  };
  mkdirSync(path.dirname(usersFile), { recursive: true });
  writeFileSync(usersFile, JSON.stringify([user], null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { id: user.id, username: user.username, role: user.role };
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      reject(new Error('Run this command from an interactive terminal so the password is not echoed.'));
      return;
    }

    const input = process.stdin;
    let value = '';
    let settled = false;
    process.stdout.write(prompt);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();

    const finish = (error) => {
      if (settled) return;
      settled = true;
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(new Error('Administrator setup cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u0008' || character === '\u007f') {
          value = Array.from(value).slice(0, -1).join('');
        } else if (character >= ' ') {
          value += character;
        }
      }
    };

    input.on('data', onData);
  });
}

async function main() {
  const usersFile = getUsersFilePath();
  const username = (await readHidden('New administrator username: ')).trim();
  const password = await readHidden('New administrator password (input hidden): ');
  const confirmation = await readHidden('Confirm password (input hidden): ');
  if (password !== confirmation) throw new Error('Passwords do not match.');

  const user = createLocalAdminAccount({ usersFile, username, password });
  console.log(`Created the local administrator account "${user.username}".`);
  console.log('Start or restart the local server, then sign in through the dashboard.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
