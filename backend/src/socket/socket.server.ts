import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { MessagesService } from '../modules/messages/messages.service.js';

export function setupSocketServer(server: any, jwtVerify: (token: string) => any) {
  const allowedOrigins = env.FRONTEND_URL.split(',').map((u) => u.trim());

  const io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || env.NODE_ENV === 'development') {
          callback(null, true);
        } else {
          callback(null, true); // Permissive in dev
        }
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Setup Redis Adapter if enabled for horizontal clustering
  if (env.ENABLE_REDIS) {
    try {
      const pubClient = new Redis(env.REDIS_URL);
      const subClient = pubClient.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
      console.log('📡 Socket.IO Redis Adapter connected for horizontal clustering!');
    } catch (err) {
      console.warn('⚠️ Could not connect to Redis for Socket.IO. Running with local memory adapter:', err);
    }
  } else {
    console.log('⚡ Socket.IO running with ultra-fast local memory adapter (Single Node / Dev).');
  }

  // Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        // Allow guest or demo connection with fallback
        socket.data.user = {
          id: 'guest-' + socket.id.slice(0, 5),
          displayName: 'Visiteur',
          username: 'guest',
        };
        return next();
      }

      const decoded = jwtVerify(token as string);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, username: true, displayName: true, avatarUrl: true, role: true },
      });

      if (!user) return next(new Error('Utilisateur non trouvé'));

      socket.data.user = user;
      next();
    } catch (err) {
      next(new Error('Authentification WebSocket invalide'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log(`🔌 Client connected: ${user.displayName} (${socket.id})`);

    // Broadcast user presence online
    io.emit('presence:update', {
      userId: user.id,
      status: 'online',
    });

    // Join a Salon Room
    socket.on('salon:join', async ({ salonId }) => {
      const room = `salon:${salonId}`;
      socket.join(room);
      console.log(`🏠 ${user.displayName} joined ${room}`);

      // Notify salon members
      socket.to(room).emit('salon:user_joined', {
        user,
        timestamp: new Date(),
      });
    });

    // Leave a Salon Room
    socket.on('salon:leave', ({ salonId }) => {
      const room = `salon:${salonId}`;
      socket.leave(room);
      console.log(`🚪 ${user.displayName} left ${room}`);

      socket.to(room).emit('salon:user_left', {
        user,
        timestamp: new Date(),
      });
    });

    // Real-time Chat Message
    socket.on('chat:send', async ({ salonId, content, type }) => {
      try {
        if (!content || !content.trim()) return;

        // Persist message in PostgreSQL/SQLite
        const message = await MessagesService.createMessage(
          salonId,
          user.id,
          content.trim(),
          type || 'TEXT'
        );

        // Broadcast to everyone in the salon (including sender)
        io.to(`salon:${salonId}`).emit('chat:message', message);
      } catch (error) {
        socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
      }
    });

    // Typing Indicator
    socket.on('chat:typing', ({ salonId, isTyping }) => {
      socket.to(`salon:${salonId}`).emit('chat:user_typing', {
        userId: user.id,
        displayName: user.displayName,
        isTyping,
      });
    });

    // Voice State Update (Mic mute/unmute, speaking)
    socket.on('voice:state', ({ salonId, isMuted, isSpeaking }) => {
      socket.to(`salon:${salonId}`).emit('voice:update', {
        userId: user.id,
        isMuted,
        isSpeaking,
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`❌ Client disconnected: ${user.displayName} (${socket.id})`);
      io.emit('presence:update', {
        userId: user.id,
        status: 'offline',
      });
    });
  });

  return io;
}
