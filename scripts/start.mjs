import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { desktopEnv } from './desktop-env.mjs';

const desktop = process.argv[2] === 'desktop';
const children = [];
let stopping = false;
const env = desktop ? desktopEnv() : { ...process.env };
function run(bin, args) {
  const child = spawn(process.execPath, [resolve('node_modules', ...bin), ...args], { stdio: 'inherit', env });
  children.push(child);
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code ?? 1); });
  return child;
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) {
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    else child.kill();
  }
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

// Reuse a bridge only if it identifies itself as ours.
const port = env.PET_PORT || '17789';
let reuse = false;
try {
  const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(700) });
  const body = await response.json();
  reuse = body.service === 'agent-pet-bridge';
  if (!reuse) throw new Error(`Port ${port} is occupied by another service`);
  const check = await fetch(`http://127.0.0.1:${port}/snapshot`, { headers: env.PET_TOKEN ? { Authorization: `Bearer ${env.PET_TOKEN}` } : {}, signal: AbortSignal.timeout(700) });
  if (!check.ok) throw new Error('Existing bridge token does not match PET_TOKEN');
} catch (error) {
  if (error.message?.includes('occupied') || error.message?.includes('PET_TOKEN')) throw error;
}
if (!reuse) {
  run(['tsx', 'dist', 'cli.mjs'], ['bridge/server.ts']);
  let ready = false;
  for (let i = 0; i < 40 && !stopping; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      ready = (await r.json()).service === 'agent-pet-bridge';
      if (ready) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) { stop(1); throw new Error('Bridge did not start'); }
}
if (!stopping) {
  if (desktop) run(['@tauri-apps', 'cli', 'tauri.js'], ['dev']);
  else run(['vite', 'bin', 'vite.js'], ['--host', '127.0.0.1']);
}
