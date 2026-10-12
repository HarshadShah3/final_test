// The production policy is also applied by Netlify and Vercel. Keep those
// copies aligned: test/securityHeaders.test.js checks deployment parity.
export function frontendSecurityHeaders({ development = false, apiBaseUrl } = {}) {
  const connections = ["'self'"];
  if (development) {
    connections.push('http://localhost:3001', 'http://127.0.0.1:3001', 'ws://localhost:*', 'ws://127.0.0.1:*');
  }
  if (apiBaseUrl && /^https?:\/\//.test(apiBaseUrl)) {
    connections.push(new URL(apiBaseUrl).origin);
  }

  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      // React chart styles and Vite's CSS injection require inline styles.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src ${[...new Set(connections)].join(' ')}`,
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}
