import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { sql } from 'drizzle-orm';
import { config, isProd } from './config';
import { db } from './db/client';
import { errorHandler, HttpError } from './lib/errors';
import { logger } from './lib/logger';
import { originGuard, requireAuth, requirePasswordChanged } from './middleware/auth';
import { authRouter } from './routes/auth';
import { apiRouter } from './routes/api';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1); // Render fica atrás de proxy reverso (necessário para cookies Secure e rate-limit)
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'font-src': ["'self'", 'data:'],
          'img-src': ["'self'", 'data:', 'blob:'],
          'connect-src': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
          'manifest-src': ["'self'"],
          'upgrade-insecure-requests': isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' || !req.url?.startsWith('/api') },
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // CORS apenas se houver origens extras configuradas (em produção o SPA é servido na mesma origem).
  const allowed = new Set((config.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  if (allowed.size) {
    app.use('/api', (req, res, next) => {
      const origin = req.get('origin');
      if (origin && allowed.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'unavailable' });
    }
  });

  app.use('/api', originGuard);
  app.use('/api/auth', authRouter);

  const api = express.Router();
  api.use(requireAuth, requirePasswordChanged);
  api.use(apiRouter);
  app.use('/api', api);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada', 'NOT_FOUND')));

  // Frontend (build do Vite) servido pelo mesmo processo.
  const webDist = config.WEB_DIST_PATH ?? path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(
      express.static(webDist, {
        index: false,
        setHeaders: (res, file) => {
          if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
