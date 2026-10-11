import { defineConfig, type Plugin } from 'vite';
import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

function petAssets(): Plugin {
  return {
    name: 'pet-assets',
    async closeBundle() {
      const destination = resolve('dist/desktop_pet_resources');
      await mkdir(destination, { recursive: true });
      await cp(resolve('desktop_pet_resources'), destination, {
        recursive: true,
        filter: (path) => !path.split(/[\\/]/).includes('frames'),
      });
    },
  };
}
export default defineConfig({
  base: './',
  plugins: [petAssets()],
  server: {
    port: 5173, strictPort: true, host: '127.0.0.1',
    watch: { ignored: ['**/.tools/**', '**/src-tauri/**', '**/artifacts/**', '**/desktop_pet_resources/**/frames/**', '**/dist-lib/**'] },
  },
  build: { rollupOptions: { input: { demo: resolve('index.html'), desktop: resolve('desktop.html') } } },
});
