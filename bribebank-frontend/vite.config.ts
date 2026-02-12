import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync } from 'fs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version?: string };
    const buildId = Date.now().toString();
    const releaseVersion = env.RELEASE_VERSION || packageJson.version || '0.0.0';
    
    // Plugin to inject build timestamp into service worker
    const swTimestampPlugin = {
      name: 'sw-timestamp',
      apply: 'build',
      writeBundle() {
        try {
          const swPath = 'dist/service-worker.js';
          let swContent = readFileSync(swPath, 'utf-8');
          swContent = swContent.replace(/{{BUILD_TIMESTAMP}}/g, buildId);
          writeFileSync(swPath, swContent);
          console.log(`✓ Service Worker cache busted with build id: ${buildId}`);
        } catch (error: any) {
          console.warn(`⚠ Could not update service worker timestamp:`, error.message);
        }
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
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        __APP_BUILD_ID__: JSON.stringify(buildId),
        __APP_RELEASE_VERSION__: JSON.stringify(releaseVersion)
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
