import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { env } from './config/env.js';
import { authRoutes } from './modules/auth/auth.controller.js';
import { salonsRoutes } from './modules/salons/salons.controller.js';
import { usersRoutes } from './modules/users/users.controller.js';
import { messagesRoutes } from './modules/messages/messages.controller.js';
import { setupSocketServer } from './socket/socket.server.js';
import { prisma } from './database/prisma.js';

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    io: any;
  }
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

  // Decorate fastify with authenticate middleware
  fastify.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ success: false, message: 'Non authentifié. Token requis.' });
    }
  });

  // 4. API Routes Registration
  fastify.get('/api/health', async () => ({
    status: 'ok',
    service: 'WafaTalk Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }));

  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(salonsRoutes, { prefix: '/api/salons' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(messagesRoutes, { prefix: '/api' });

  return fastify;
}

async function start() {
  try {
    const app = await buildApp();

    // Attach Socket.IO to raw Node HTTP Server
    const io = setupSocketServer(app.server, (token: string) => app.jwt.verify(token));
    app.decorate('io', io);

    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    console.log(`
  🚀 WafaTalk Backend running on http://${env.HOST}:${env.PORT}
  📡 WebSocket Gateway ready on ws://${env.HOST}:${env.PORT}
  📋 Health check: http://localhost:${env.PORT}/api/health
    `);

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
