import { defineConfig, loadEnv } from 'vite';
import { frontendSecurityHeaders } from './securityHeaders.js';

export default defineConfig(({ mode }) => {
  const { VITE_API_BASE_URL: apiBaseUrl } = loadEnv(mode, import.meta.dirname, 'VITE_');
  return {
    // Windows/Hyper-V can reserve blocks of high ports, including Vite's 5173.
    // Use an explicit IPv4 loopback address and a stable, unreserved dev port.
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
      headers: frontendSecurityHeaders({ development: true, apiBaseUrl }),
    },
    preview: {
      host: '127.0.0.1',
      headers: frontendSecurityHeaders({ apiBaseUrl }),
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
