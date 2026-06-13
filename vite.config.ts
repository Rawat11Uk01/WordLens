import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { resolve } from 'node:path'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        viewer: resolve(__dirname, 'index.html'),
        vocabulary: resolve(__dirname, 'src/vocabulary/index.html')
      }
    }
  },
  // crxjs uses a dev server; this keeps HMR websocket stable for extensions
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    }
  }
})
