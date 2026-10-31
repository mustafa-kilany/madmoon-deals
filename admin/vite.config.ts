import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// npm run dev → http://localhost:5174 (5173 is the Figma prototype's). Requests to /v1 go to the backend on
// port 4000 (npm run dev in backend/), so no CORS is needed while developing.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('../frontend/src', import.meta.url)) },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/v1': 'http://localhost:4000' },
  },
});
