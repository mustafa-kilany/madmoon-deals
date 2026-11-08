import react from '@vitejs/plugin-react';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { securityHeaders } from './securityHeaders';

// npm run dev → http://localhost:5174 (5173 is the Figma prototype's). Requests to /v1 go to the backend on
// port 4000 (npm run dev in backend/), so no CORS is needed while developing.
// npm run build with VITE_API_URL=https://api.sahla.jo/v1 for production (docs: B8.6).

/** S5.3: dist/_headers, for hosts that read that file. */
const headersFile = (headers: Record<string, string>): Plugin => ({
  name: 'sahla-headers-file',
  apply: 'build',
  closeBundle() {
    const lines = Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`);
    writeFileSync(new URL('./dist/_headers', import.meta.url), ['/*', ...lines, ''].join('\n'));
  },
});

export default defineConfig(({ mode }) => {
  const apiUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL ?? process.env.VITE_API_URL;
  const headers = securityHeaders(apiUrl?.startsWith('http') ? new URL(apiUrl).origin : '');
  return {
    plugins: [react(), headersFile(headers)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('../frontend/src', import.meta.url)) },
    },
    server: {
      port: 5174,
      strictPort: true,
      proxy: { '/v1': 'http://localhost:4000' },
    },
    preview: {
      port: 5175,
      strictPort: true,
      proxy: { '/v1': process.env.PREVIEW_API ?? 'http://localhost:4000' },
      headers,
    },
  };
});
