import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // In Docker: 'backend' resolves via the Docker internal network.
      // For local dev outside Docker: change to 'http://localhost:3000'
      // and run the backend separately.
      '/api': { target: 'http://backend:3000', changeOrigin: true },
    },
  },
});
