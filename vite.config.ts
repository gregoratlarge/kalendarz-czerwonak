import { defineConfig } from 'vite';

// Deployed to https://grgzx.github.io/kalendarz-czerwonak/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/kalendarz-czerwonak/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
  },
});
