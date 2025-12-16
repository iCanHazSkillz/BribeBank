import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync } from 'fs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    // Plugin to inject build timestamp into service worker
    const swTimestampPlugin = {
      name: 'sw-timestamp',
      apply: 'build',
      closeBundle() {
        const swPath = 'dist/service-worker.js';
        const timestamp = Date.now();
        let swContent = readFileSync(swPath, 'utf-8');
        swContent = swContent.replace('{{BUILD_TIMESTAMP}}', timestamp.toString());
        writeFileSync(swPath, swContent);
        console.log(`✓ Service Worker cache busted with timestamp: ${timestamp}`);
      }
    };
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss(), swTimestampPlugin],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html'),
          },
          output: {
            entryFileNames: '[name].[hash].js',
            chunkFileNames: '[name].[hash].js',
            assetFileNames: '[name].[hash][extname]',
          }
        }
      }
    };
});
