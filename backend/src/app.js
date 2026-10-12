import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import {
  clearAccessCookie,
  createAccessCookie,
  createAccessToken,
  hasValidAccess,
  isAccessConfigured,
  isPasswordValid,
} from './accessControl.js';
import { dataSourceRouter } from './routes/dataSourceRoutes.js';
import { forecastRouter } from './routes/forecastRoutes.js';
import { mapRouter } from './routes/mapRoutes.js';
import { recommendationRouter } from './routes/recommendationRoutes.js';
import { regionRouter } from './routes/regionRoutes.js';
import { releaseInfo } from './releaseInfo.js';

export function createApp() {
  const app = express();
  const allowedFrontendOrigins = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(origin=>origin.trim());
  const usesHttps = request => request.secure || request.headers['x-forwarded-proto'] === 'https';
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use((_request, response, next) => {
    response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    next();
  });
  app.use(cors({ origin: allowedFrontendOrigins, credentials: true }));
  app.use(express.json({ limit: '20kb' }));
  app.get('/api/auth/status', (request, response) => {
    if (!isAccessConfigured()) {
      return response.status(503).json({ authenticated: false, message: 'Site access is not configured.' });
    }
    return response.json({ authenticated: hasValidAccess(request.headers.cookie) });
  });
  app.post('/api/auth/login', (request, response) => {
    if (!isAccessConfigured()) {
      return response.status(503).json({ authenticated: false, message: 'Site access is not configured.' });
    }
    if (!isPasswordValid(request.body?.password)) {
      return response.status(401).json({ authenticated: false, message: 'Incorrect password.' });
    }
    response.setHeader('Set-Cookie', createAccessCookie(createAccessToken(), usesHttps(request)));
    return response.json({ authenticated: true });
  });
  app.post('/api/auth/logout', (request, response) => {
    response.setHeader('Set-Cookie', clearAccessCookie(usesHttps(request)));
    return response.json({ authenticated: false });
  });
  app.get('/api/health', (_request, response) => response.json({ status: 'ok', ...releaseInfo }));
  app.use('/api', (request, response, next) => {
    if (hasValidAccess(request.headers.cookie)) return next();
    return response.status(401).json({ message: 'Password required.' });
  });
  app.use('/api/data-sources', dataSourceRouter);
  app.use('/api/forecasts', forecastRouter);
  app.use('/api/map', mapRouter);
  app.use('/api/regions', regionRouter);
  app.use('/api/recommendations', recommendationRouter);
  app.use((_request, response) => response.status(404).json({ message: 'API route not found.' }));
  return app;
}
