import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function desktopEnv() {
  const env = { ...process.env };
  if (process.platform === 'win32') {
    const vswhere = join(env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
    if (existsSync(vswhere)) {
      const location = spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8', windowsHide: true }).stdout?.trim();
      const script = location && join(location, 'Common7/Tools/VsDevCmd.bat');
      if (script && !script.includes('"') && existsSync(script)) {
        const result = spawnSync(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${script}" -arch=x64 -host_arch=x64 >nul && set"`], { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true });
        if (result.status === 0) for (const line of result.stdout.split(/\r?\n/)) {
          const match = line.match(/^([^=]+)=(.*)$/);
          if (match) env[match[1]] = match[2];
        }
      }
    }
    if (existsSync('.tools/cargo/bin/cargo.exe')) {
      env.CARGO_HOME = resolve('.tools/cargo');
      env.RUSTUP_HOME = resolve('.tools/rustup');
      env.Path = `${resolve('.tools/cargo/bin')};${env.Path || env.PATH}`;
      delete env.PATH;
    }
  }
  return env;
}
