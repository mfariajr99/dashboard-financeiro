import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Build do AMBIENTE DE TESTE: um único arquivo HTML, com JS/CSS/fontes embutidos,
 * que roda o app real com o backend simulado no navegador (src/demo).
 *   npm run build:demo -w web   →   web/dist-demo/dashboard-financeiro-teste.html
 */
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile({ removeViteModuleLoader: true }),
    {
      name: 'rename-demo-html',
      enforce: 'post',
      generateBundle(_, bundle) {
        const html = bundle['demo.html'];
        if (html) {
          html.fileName = 'dashboard-financeiro-teste.html';
        }
      },
    },
  ],
  publicDir: false,
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: 'demo.html' },
  },
});
