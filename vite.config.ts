import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/video-metadata-extractor-js/',
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    include: ['buffer']
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        big2gb: resolve(__dirname, 'browser-2gb-test.html'),
      },
      output: {
        manualChunks: {
          'ffmpeg': ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
          'mp4box': ['mp4box']
        }
      }
    }
  }
})