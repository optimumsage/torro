import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requireSession } from './middleware/requireSession.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import torrentRoutes from './routes/torrents.js';
import fileRoutes from './routes/files.js';
import streamRoutes from './routes/stream.js';
import downloadRoutes from './routes/downloads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(): Express {
  const app = express();

  // Behind Traefik/nginx — trust the first proxy so rate-limit/IP logging see the real client.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          mediaSrc: ["'self'"],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    })
  );

  const allowList = new Set(env.expectedOrigins);
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowList.has(origin)) cb(null, true);
        else cb(new Error('Origin not allowed'));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/torrents', apiLimiter, requireSession, torrentRoutes);
  app.use('/api/files', apiLimiter, requireSession, fileRoutes);
  app.use('/api/downloads', apiLimiter, requireSession, downloadRoutes);
  app.use('/api/stream', requireSession, streamRoutes);

  // Serve the built SPA (when bundled into the image) with a history-API fallback.
  const publicDir = path.join(__dirname, '../public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
