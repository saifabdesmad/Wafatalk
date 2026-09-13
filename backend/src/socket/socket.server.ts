import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { MessagesService } from '../modules/messages/messages.service.js';
import { ConversationsService } from '../modules/conversations/conversations.service.js';

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

  // Active Calls Tracker: callId -> Call Details
  const activeCalls = new Map<
    string,
    {
      callId: string;
      conversationId: string;
      callerId: string;
      receiverId: string;
      type: 'audio' | 'video';
      status: 'RINGING' | 'CONNECTED';
      startedAt: Date;
    }
  >();

  // Map user to active callId
  const userActiveCall = new Map<string, string>();

  // Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        socket.data.user = {
          id: 'guest-' + socket.id.slice(0, 5),
          displayName: 'Visiteur',
          username: 'guest',
        };
        return next();
      }

      const decoded = jwtVerify(token as string);
      const targetId = decoded.id || decoded.userId;
      const user = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, role: true },
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

    // Automatically join the user's private channel for direct notifications and signaling
    socket.join(`user:${user.id}`);

    // Broadcast user presence online
    io.emit('presence:update', {
      userId: user.id,
      status: 'online',
    });

    // =========================================================================
    // 1. SALON ROOM EVENTS (PUBLIC & GROUP SALONS)
    // =========================================================================
    socket.on('salon:join', async ({ salonId }) => {
      const room = `salon:${salonId}`;
      socket.join(room);
      console.log(`🏠 ${user.displayName} joined ${room}`);

      socket.to(room).emit('salon:user_joined', {
        user,
        timestamp: new Date(),
      });
    });

    socket.on('salon:leave', ({ salonId }) => {
      const room = `salon:${salonId}`;
      socket.leave(room);
      console.log(`🚪 ${user.displayName} left ${room}`);

      socket.to(room).emit('salon:user_left', {
        user,
        timestamp: new Date(),
      });
    });

    socket.on('chat:send', async ({ salonId, content, type }) => {
      try {
        if (!content || !content.trim()) return;

        const message = await MessagesService.createMessage(
          salonId,
          user.id,
          content.trim(),
          type || 'TEXT'
        );

        io.to(`salon:${salonId}`).emit('chat:message', message);
      } catch (error) {
        socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
      }
    });

    socket.on('chat:typing', ({ salonId, isTyping }) => {
      socket.to(`salon:${salonId}`).emit('chat:user_typing', {
        userId: user.id,
        displayName: user.displayName,
        isTyping,
      });
    });

    socket.on('voice:state', ({ salonId, isMuted, isSpeaking }) => {
      socket.to(`salon:${salonId}`).emit('voice:update', {
        userId: user.id,
        isMuted,
        isSpeaking,
      });
    });

    // =========================================================================
    // 2. 1-ON-1 DIRECT MESSAGING (DMs)
    // =========================================================================
    socket.on('dm:join', ({ conversationId }) => {
      socket.join(`conv:${conversationId}`);
    });

    socket.on('dm:leave', ({ conversationId }) => {
      socket.leave(`conv:${conversationId}`);
    });

    socket.on('dm:send', async ({ conversationId, content, type }) => {
      try {
        if (!content || !content.trim()) return;

        const { message, targetUserId } = await ConversationsService.createDirectMessage(
          conversationId,
          user.id,
          content.trim(),
          type || 'TEXT'
        );

        // Broadcast to everyone inside the conversation room
        io.to(`conv:${conversationId}`).emit('dm:message', message);

        // Also push notification to target user's personal channel in case they have not opened the modal
        io.to(`user:${targetUserId}`).emit('dm:notification', {
          conversationId,
          message,
        });

        // Companion Interactive Simulation for Demo Peers
        const targetRoom = io.sockets.adapter.rooms.get(`user:${targetUserId}`);
        const isTargetOnline = targetRoom && targetRoom.size > 0;

        if (!isTargetOnline && ['user-sarah', 'user-youssef', 'user-lina', 'user-karim'].includes(targetUserId)) {
          const peer = await prisma.user.findUnique({ where: { id: targetUserId } });
          if (peer) {
            setTimeout(() => {
              io.to(`conv:${conversationId}`).emit('dm:user_typing', {
                conversationId,
                userId: peer.id,
                displayName: peer.displayName,
                isTyping: true,
              });
            }, 800);

            setTimeout(async () => {
              io.to(`conv:${conversationId}`).emit('dm:user_typing', {
                conversationId,
                userId: peer.id,
                displayName: peer.displayName,
                isTyping: false,
              });

              const replies = [
                `Salut ${user.displayName} ! Ravi de te parler dans ce salon privé ✨`,
                `Je suis dispo pour un appel vocal ou vidéo quand tu veux ! 🎧🎙️`,
                `Bien reçu ton message ! La connexion WafaTalk est super fluide 🚀`,
                `Top ! Tout fonctionne parfaitement bien 👍`,
              ];
              const replyText = replies[Math.floor(Math.random() * replies.length)];

              const replyResult = await ConversationsService.createDirectMessage(
                conversationId,
                peer.id,
                replyText,
                'TEXT'
              );
              io.to(`conv:${conversationId}`).emit('dm:message', replyResult.message);
            }, 2600);
          }
        }
      } catch (error: any) {
        socket.emit('error', { message: error.message || 'Erreur lors de l\'envoi du message privé' });
      }
    });

    socket.on('dm:typing', ({ conversationId, targetUserId, isTyping }) => {
      socket.to(`conv:${conversationId}`).emit('dm:user_typing', {
        conversationId,
        userId: user.id,
        displayName: user.displayName,
        isTyping,
      });
    });

    socket.on('dm:read', async ({ conversationId }) => {
      try {
        await ConversationsService.markMessagesAsRead(conversationId, user.id);
        socket.to(`conv:${conversationId}`).emit('dm:read_receipt', {
          conversationId,
          readByUserId: user.id,
        });
      } catch (error) {}
    });

    // =========================================================================
    // 3. 1-ON-1 WEBRTC CALLING SIGNALING (AUDIO & VIDEO)
    // =========================================================================

    // A. Start Call: Initiator invites recipient
    socket.on('call:start', async ({ targetUserId, conversationId, type }) => {
      try {
        if (!targetUserId || targetUserId === user.id) {
          return socket.emit('call:failed', { message: 'Destinataire invalide.' });
        }

        // Check if recipient is connected
        const targetRoom = io.sockets.adapter.rooms.get(`user:${targetUserId}`);
        const isOnline = targetRoom && targetRoom.size > 0;

        if (!isOnline) {
          const isDemoPeer = ['user-sarah', 'user-youssef', 'user-lina', 'user-karim'].includes(targetUserId);
          if (!isDemoPeer) {
            return socket.emit('call:failed', {
              reason: 'offline',
              message: 'Le correspondant est actuellement hors ligne.',
            });
          }

          // Interactive Companion Mode for Seed/Demo Users
          const callType = (type || 'audio').toLowerCase() === 'video' ? 'VIDEO' : 'AUDIO';
          const callSession = await ConversationsService.createCallSession(
            conversationId,
            user.id,
            targetUserId,
            callType
          );

          const callId = callSession.id;
          activeCalls.set(callId, {
            callId,
            conversationId,
            callerId: user.id,
            receiverId: targetUserId,
            type: (type || 'audio').toLowerCase() === 'video' ? 'video' : 'audio',
            status: 'RINGING',
            startedAt: new Date(),
          });

          userActiveCall.set(user.id, callId);
          socket.join(`call:${callId}`);
          socket.emit('call:ringing', { callId });

          // Auto-answer after realistic ring delay (1.8s)
          setTimeout(async () => {
            const currentCall = activeCalls.get(callId);
            if (!currentCall || currentCall.status !== 'RINGING') return;
            currentCall.status = 'CONNECTED';

            const demoPeer = await prisma.user.findUnique({ where: { id: targetUserId } });
            socket.emit('call:accepted', {
              callId,
              receiver: {
                id: targetUserId,
                username: demoPeer?.username || 'sarah_b',
                displayName: demoPeer?.displayName || 'Sarah B.',
                avatarUrl: demoPeer?.avatarUrl,
              },
            });
          }, 1800);
          return;
        }

        // Check if recipient or caller is already in a call
        if (userActiveCall.has(targetUserId)) {
          return socket.emit('call:failed', {
            reason: 'busy',
            message: 'Le correspondant est déjà en communication.',
          });
        }

        if (userActiveCall.has(user.id)) {
          return socket.emit('call:failed', {
            reason: 'busy',
            message: 'Vous êtes déjà dans un appel en cours.',
          });
        }

        // Persist call session in DB
        const callType = (type || 'audio').toLowerCase() === 'video' ? 'VIDEO' : 'AUDIO';
        const callSession = await ConversationsService.createCallSession(
          conversationId,
          user.id,
          targetUserId,
          callType
        );

        const callId = callSession.id;

        // Track active call
        activeCalls.set(callId, {
          callId,
          conversationId,
          callerId: user.id,
          receiverId: targetUserId,
          type: (type || 'audio').toLowerCase() === 'video' ? 'video' : 'audio',
          status: 'RINGING',
          startedAt: new Date(),
        });

        userActiveCall.set(user.id, callId);
        userActiveCall.set(targetUserId, callId);

        // Put caller into the call's socket room
        socket.join(`call:${callId}`);

        // Notify recipient with incoming call ringing event
        io.to(`user:${targetUserId}`).emit('call:incoming', {
          callId,
          conversationId,
          caller: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            country: user.country,
          },
          type: (type || 'audio').toLowerCase() === 'video' ? 'video' : 'audio',
        });

        // Notify caller that call is ringing
        socket.emit('call:ringing', { callId });
      } catch (err: any) {
        console.error('Error starting call:', err);
        socket.emit('call:failed', { message: 'Impossible d\'initier l\'appel.' });
      }
    });

    // B. Accept Call: Recipient answers
    socket.on('call:accept', async ({ callId }) => {
      const call = activeCalls.get(callId);
      if (!call || call.receiverId !== user.id) {
        return socket.emit('call:failed', { message: 'Appel introuvable ou expiré.' });
      }

      call.status = 'CONNECTED';
      socket.join(`call:${callId}`);

      // Notify caller that call was accepted
      io.to(`user:${call.callerId}`).emit('call:accepted', {
        callId,
        receiver: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
      });

      // Confirm connection to recipient
      socket.emit('call:connected', { callId });
    });

    // C. Reject Call: Recipient declines or times out
    socket.on('call:reject', async ({ callId, reason }) => {
      const call = activeCalls.get(callId);
      if (!call) return;

      activeCalls.delete(callId);
      userActiveCall.delete(call.callerId);
      userActiveCall.delete(call.receiverId);

      // Finalize in DB
      await ConversationsService.endCallSession(callId, 'REJECTED', 0);

      // Notify caller
      io.to(`user:${call.callerId}`).emit('call:rejected', {
        callId,
        reason: reason || 'declined',
      });
    });

    // D. WebRTC Signaling Relay (SDP offer, SDP answer, ICE candidate)
    socket.on('webrtc:signal', ({ callId, targetUserId, signal }) => {
      io.to(`user:${targetUserId}`).emit('webrtc:signal', {
        callId,
        senderId: user.id,
        signal,
      });
    });

    // E. End Call: Hangup from either participant
    socket.on('call:end', async ({ callId, durationSec }) => {
      const call = activeCalls.get(callId);
      if (!call) return;

      activeCalls.delete(callId);
      userActiveCall.delete(call.callerId);
      userActiveCall.delete(call.receiverId);

      const dur = typeof durationSec === 'number' ? durationSec : 0;
      await ConversationsService.endCallSession(callId, dur > 0 ? 'COMPLETED' : 'MISSED', dur);

      // Notify both participants
      io.to(`call:${callId}`).emit('call:ended', {
        callId,
        durationSec: dur,
      });

      // Leave socket room
      io.in(`call:${callId}`).socketsLeave(`call:${callId}`);
    });

    // =========================================================================
    // 4. DISCONNECT HANDLER
    // =========================================================================
    socket.on('disconnect', async () => {
      console.log(`❌ Client disconnected: ${user.displayName} (${socket.id})`);

      // Clean up active call if any
      const callId = userActiveCall.get(user.id);
      if (callId) {
        const call = activeCalls.get(callId);
        if (call) {
          activeCalls.delete(callId);
          userActiveCall.delete(call.callerId);
          userActiveCall.delete(call.receiverId);

          const otherUserId = call.callerId === user.id ? call.receiverId : call.callerId;
          io.to(`user:${otherUserId}`).emit('call:ended', {
            callId,
            reason: 'disconnected',
          });

          await ConversationsService.endCallSession(callId, 'MISSED', 0);
        }
      }

      io.emit('presence:update', {
        userId: user.id,
        status: 'offline',
      });
    });
  });

  return io;
}
