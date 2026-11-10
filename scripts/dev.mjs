import { spawn } from 'node:child_process';
import path from 'node:path';

const projectRoot = process.cwd();
const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const preview = process.argv.includes('--preview');
const children = [];
let shuttingDown = false;

function start(args) {
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const other of children) {
      if (other !== child && !other.killed) other.kill('SIGTERM');
    }
    process.exitCode = signal ? 1 : code ?? 1;
  });
  return child;
}

start(['server/index.mjs']);
start([viteBin, ...(preview ? ['preview'] : []), '--host', '127.0.0.1']);

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
