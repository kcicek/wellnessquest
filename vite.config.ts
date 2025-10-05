import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  // GitHub Pages base (repo name). Ensures asset URLs resolve under /wellnessquest/
  base: '/wellnessquest/',
  build: { outDir: 'dist', sourcemap: true },
  server: {
    host: 'localhost', // or true to expose on LAN
    port: 5173,
    strictPort: true,
    hmr: {
      host: 'localhost',
      port: 5173,
      protocol: 'ws'
    }
  }
});
