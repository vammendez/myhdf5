import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import { checker } from 'vite-plugin-checker';

// https://tauri.app/v1/guides/getting-started/setup/vite
export default defineConfig({
  // Tauri expects a fixed port for development
  clearScreen: false,
  server: { 
    open: false, // Don't open browser when using Tauri
    port: 5174,
    strictPort: true,
  },
  plugins: [
    react(),
    { ...checker({ typescript: true }), apply: 'serve' }, // dev only to reduce build time
  ],

  // Import HDF5 compression plugins as static assets
  assetsInclude: ['**/*.so'],

  // `es2020` required by @h5web/h5wasm for BigInt `123n` notation support
  optimizeDeps: { esbuildOptions: { target: 'es2020' } },
  build: {
    target: 'es2020',
    sourcemap: true,
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
  },
});
