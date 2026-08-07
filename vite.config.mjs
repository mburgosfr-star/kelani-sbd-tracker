import { defineConfig, transformWithOxc } from 'vite';
import react from '@vitejs/plugin-react';

function transformSourceJsAsJsx() {
  return {
    name: 'kelani-jsx-in-js',
    enforce: 'pre',
    async transform(code, id) {
      if (!/\/src\/.*\.js$/.test(id)) return null;

      return transformWithOxc(code, id, {
        lang: 'jsx',
        jsx: {
          runtime: 'automatic',
        },
        sourcemap: true,
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [transformSourceJsAsJsx(), react()],
  server: {
    port: 3000,
    strictPort: true,
  },
  optimizeDeps: {
    entries: ['index.html'],
    rolldownOptions: {
      moduleTypes: {
        '.js': 'jsx',
      },
      transform: {
        jsx: {
          runtime: 'automatic',
        },
      },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
});
