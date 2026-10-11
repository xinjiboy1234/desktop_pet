import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { desktopEnv } from './desktop-env.mjs';
const child = spawn(process.execPath, [resolve('node_modules/@tauri-apps/cli/tauri.js'), ...process.argv.slice(2)], { env: desktopEnv(), stdio: 'inherit' });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
