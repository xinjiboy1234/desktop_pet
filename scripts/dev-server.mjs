import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
let reused = false;
try {
  const r = await fetch('http://127.0.0.1:5173/', { signal: AbortSignal.timeout(700) });
  const html = await r.text();
  if (!html.includes('Duckside') || !html.includes('/@vite/client')) throw new Error('Port 5173 is occupied by another service');
  reused = true;
} catch (error) { if (error.message?.includes('occupied')) throw error; }
if (!reused) {
  const child = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], { stdio: 'inherit' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
