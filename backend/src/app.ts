import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { authRoutes } from './modules/auth/auth.controller.js';
import { salonsRoutes } from './modules/salons/salons.controller.js';
import { usersRoutes } from './modules/users/users.controller.js';
import { messagesRoutes } from './modules/messages/messages.controller.js';
import { conversationsRoutes } from './modules/conversations/conversations.controller.js';
import { setupSocketServer } from './socket/socket.server.js';
import { prisma } from './database/prisma.js';
import { ConversationsService } from './modules/conversations/conversations.service.js';
import path from 'path';
import fs from 'fs';

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    io: any;
  }
}

const UPLOADS_DIR = path.resolve('./uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function buildApp() {
  const fastify = Fastify({
    logger: env.NODE_ENV === 'development',
  });

  // 1. CORS Configuration
  const allowedOrigins = env.FRONTEND_URL.split(',').map((u) => u.trim());
  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || env.NODE_ENV === 'development') {
        cb(null, true);
      } else {
        cb(null, true); // Permissive in dev
      }
    },
    credentials: true,
  });

  // 2. Cookie Support
  await fastify.register(cookie);

  // 3. JWT Authentication Plugin
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  });

  // 4. Multipart (File Uploads) — 50 MB limit
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB
    },
  });

  // Decorate fastify with authenticate middleware
  fastify.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ success: false, message: 'Non authentifié. Token requis.' });
    }
  });

  // 5. Static uploads serving
  fastify.get('/uploads/:filename', async (request: any, reply: any) => {
    const { filename } = request.params;
    // Prevent path traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(UPLOADS_DIR, safeFilename);
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Fichier introuvable.' });
    }
    const ext = path.extname(safeFilename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.zip': 'application/zip',
      '.txt': 'text/plain',
    };
    if (mimeMap[ext]) {
      reply.type(mimeMap[ext]);
    }
    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  });

  // 6. API Routes Registration
  fastify.get('/api/health', async () => ({
    status: 'ok',
    service: 'WafaTalk Backend',
    version: '1.0.0',
    smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    timestamp: new Date().toISOString(),
  }));

  // Dynamic WebRTC ICE/STUN/TURN Configuration Endpoint for crystal-clear WAN / Cross-Country connectivity
  fastify.get('/api/rtc-config', async () => {
    return {
      iceServers: [
        // 1. Google High-Availability Global STUN Cluster
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },

        // 2. Cloudflare, Twilio, and Mozilla Global STUN
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'stun:stun.services.mozilla.com' },

        // 3. WafaTalk Dedicated VPS Coturn STUN & TURN (Production IONOS VPS 31.70.139.221)
        { urls: 'stun:api.wafatalk.com:3478' },
        { urls: 'stun:31.70.139.221:3478' },
        {
          urls: [
            'turn:api.wafatalk.com:3478?transport=udp',
            'turn:api.wafatalk.com:3478?transport=tcp',
            'turn:31.70.139.221:3478?transport=udp',
            'turn:31.70.139.221:3478?transport=tcp',
          ],
          username: 'wafatalk',
          credential: 'WafaTalkGlobalTurn2026!',
        },
        {
          urls: 'turns:api.wafatalk.com:5349?transport=tcp',
          username: 'wafatalk',
          credential: 'WafaTalkGlobalTurn2026!',
        },

        // 4. Global Fallback OpenRelay via TLS & TCP (Bypasses restrictive enterprise firewalls)
        {
          urls: [
            'turn:staticauth.openrelay.metered.ca:443?transport=tcp',
            'turns:staticauth.openrelay.metered.ca:443?transport=tcp',
          ],
          username: 'openrelayproject',
          credential: 'openrelayprojectsecret',
        },
      ],
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    };
  });

  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(salonsRoutes, { prefix: '/api/salons' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(messagesRoutes, { prefix: '/api' });
  await fastify.register(conversationsRoutes, { prefix: '/api/conversations' });

  return fastify;
}

async function start() {
  try {
    const app = await buildApp();

    // Attach Socket.IO to raw Node HTTP Server
    const io = setupSocketServer(app.server, (token: string) => app.jwt.verify(token));
    app.decorate('io', io);

    // Clean reset any stale database presence to OFFLINE on startup
    await prisma.user.updateMany({ data: { status: 'OFFLINE' } }).catch(() => {});

    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    console.log(`
  🚀 WafaTalk Backend running on http://${env.HOST}:${env.PORT}
  📡 WebSocket Gateway ready on ws://${env.HOST}:${env.PORT}
  📋 Health check: http://localhost:${env.PORT}/api/health
    `);

    // ── 24h Conversation Cleanup Cron ──────────────────────────────────────────
    // Runs every 10 minutes, deletes conversations whose expiresAt has passed.
    const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    setInterval(async () => {
      try {
        await ConversationsService.cleanupExpiredConversations(io);
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    }, CLEANUP_INTERVAL_MS);

    // Also run once on startup to clean any stale expired conversations
    ConversationsService.cleanupExpiredConversations(io).catch(() => {});

    // Graceful Shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        console.log(`\nReceived ${signal}, closing server gracefully...`);
        await app.close();
        await prisma.$disconnect();
        process.exit(0);
      });
    }
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
