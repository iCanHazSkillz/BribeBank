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
    
    // Plugin to inject build timestamp into PWA assets
    const swTimestampPlugin = {
      name: 'sw-timestamp',
      apply: 'build',
      writeBundle() {
        try {
          const filesToPatch = [
            'dist/service-worker.js',
            'dist/manifest.webmanifest',
            'dist/index.html',
          ];
          for (const filePath of filesToPatch) {
            let content = readFileSync(filePath, 'utf-8');
            content = content.replace(/{{BUILD_TIMESTAMP}}/g, buildId);
            writeFileSync(filePath, content);
          }
          console.log(`✓ PWA assets cache busted with build id: ${buildId}`);
        } catch (error: any) {
          console.warn(`⚠ Could not update PWA asset timestamps:`, error.message);
        }
      }
    };

    const versionManifestPlugin = {
      name: 'version-manifest',
      apply: 'build',
      writeBundle() {
        try {
          const versionPath = 'dist/version.json';
          const payload = {
            buildId,
            releaseVersion,
            builtAt: new Date().toISOString(),
          };
          writeFileSync(versionPath, JSON.stringify(payload, null, 2));
          console.log(`✓ Version manifest written: ${versionPath}`);
        } catch (error: any) {
          console.warn(`⚠ Could not write version manifest:`, error.message);
        }
      },
    };
    
    const allowedHosts = (env.VITE_ALLOWED_HOSTS || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: allowedHosts.length > 0
          ? allowedHosts
          : ['localhost', '127.0.0.1', 'bribebankdev.homeflixlab.com'],
      },
      plugins: [react(), tailwindcss(), swTimestampPlugin, versionManifestPlugin],
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
