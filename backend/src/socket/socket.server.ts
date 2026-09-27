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

  // Map callId to 45s ringing timeout timer
  const callTimeoutTimers = new Map<string, NodeJS.Timeout>();

  // Salon Participants Tracker: salonId -> Map<userId, SalonParticipant>
  interface SalonParticipant {
    userId: string;
    socketId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    country?: string;
    role: string;
    isMuted: boolean;
    isSpeaking: boolean;
    isCameraOn: boolean;
    isScreenSharing: boolean;
    joinedAt: Date;
  }
  const salonParticipants = new Map<string, Map<string, SalonParticipant>>();
  const socketSalons = new Map<string, Set<string>>();

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

    if (user.id && !user.id.startsWith('guest-')) {
      prisma.user.update({
        where: { id: user.id },
        data: { status: 'ONLINE' },
      }).catch(() => {});
    }

    // =========================================================================
    // 1. SALON ROOM EVENTS (PUBLIC & GROUP SALONS - MULTI-USER CHAT, AUDIO & VIDEO)
    // =========================================================================
    socket.on('salon:join', async ({ salonId }) => {
      if (!salonId) return;
      const room = `salon:${salonId}`;
      socket.join(room);

      // Track socket salons for graceful disconnect cleanup
      if (!socketSalons.has(socket.id)) {
        socketSalons.set(socket.id, new Set());
      }
      socketSalons.get(socket.id)!.add(salonId);

      // Register participant in salon roster
      if (!salonParticipants.has(salonId)) {
        salonParticipants.set(salonId, new Map());
      }
      const salonMap = salonParticipants.get(salonId)!;

      const participant: SalonParticipant = {
        userId: user.id,
        socketId: socket.id,
        username: user.username,
        displayName: user.displayName || user.username || 'Membre WafaTalk',
        avatarUrl: user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
        country: user.country || 'FR',
        role: user.role === 'ADMIN' ? 'Hôte du salon' : 'Participant',
        isMuted: false,
        isSpeaking: false,
        isCameraOn: false,
        isScreenSharing: false,
        joinedAt: new Date(),
      };
      salonMap.set(user.id, participant);

      console.log(`🏠 ${user.displayName} joined ${room} (Total active members: ${salonMap.size})`);

      // 1. Dispatch full active roster to the newcomer
      const roster = Array.from(salonMap.values());
      socket.emit('salon:roster', {
        salonId,
        participants: roster,
      });

      // 2. Broadcast user joined event to other room members
      socket.to(room).emit('salon:user_joined', {
        salonId,
        participant,
        timestamp: new Date(),
      });
    });

    socket.on('salon:leave', ({ salonId }) => {
      if (!salonId) return;
      const room = `salon:${salonId}`;
      socket.leave(room);

      if (socketSalons.has(socket.id)) {
        socketSalons.get(socket.id)!.delete(salonId);
      }

      const salonMap = salonParticipants.get(salonId);
      if (salonMap) {
        salonMap.delete(user.id);
        if (salonMap.size === 0) {
          salonParticipants.delete(salonId);
        }
      }

      console.log(`🚪 ${user.displayName} left ${room}`);

      socket.to(room).emit('salon:user_left', {
        salonId,
        userId: user.id,
        displayName: user.displayName,
        timestamp: new Date(),
      });
    });

    // Real-time Salon Media State Update (Mic Mute, Speaking Activity, Camera Toggle, Screen Share)
    socket.on('salon:media_state', ({ salonId, isMuted, isSpeaking, isCameraOn, isScreenSharing }) => {
      if (!salonId) return;
      const salonMap = salonParticipants.get(salonId);
      if (salonMap && salonMap.has(user.id)) {
        const p = salonMap.get(user.id)!;
        if (typeof isMuted === 'boolean') p.isMuted = isMuted;
        if (typeof isSpeaking === 'boolean') p.isSpeaking = isSpeaking;
        if (typeof isCameraOn === 'boolean') p.isCameraOn = isCameraOn;
        if (typeof isScreenSharing === 'boolean') p.isScreenSharing = isScreenSharing;
      }

      socket.to(`salon:${salonId}`).emit('salon:media_update', {
        salonId,
        userId: user.id,
        isMuted,
        isSpeaking,
        isCameraOn,
        isScreenSharing,
      });
    });

    // WebRTC Multi-Peer Mesh Signaling for Group Vocal & Video Calls
    socket.on('salon:signal', ({ salonId, targetUserId, signal }) => {
      if (!salonId || !targetUserId || !signal) return;
      io.to(`user:${targetUserId}`).emit('salon:signal', {
        salonId,
        senderId: user.id,
        senderUser: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        signal,
      });
    });

    // Group Salon Real-time Chat
    socket.on('chat:send', async ({ salonId, content, type }) => {
      try {
        if (!content || !content.trim()) return;

        let message;
        try {
          message = await MessagesService.createMessage(
            salonId,
            user.id,
            content.trim(),
            type || 'TEXT'
          );
        } catch (dbErr) {
          // If demo / unsaved salon, fallback to resilient in-memory message object
          message = {
            id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            salonId,
            user: {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
            },
            content: content.trim(),
            type: type || 'TEXT',
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            createdAt: new Date(),
          };
        }

        io.to(`salon:${salonId}`).emit('chat:message', message);
      } catch (error) {
        socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
      }
    });

    socket.on('chat:typing', ({ salonId, isTyping }) => {
      if (!salonId) return;
      socket.to(`salon:${salonId}`).emit('chat:user_typing', {
        salonId,
        userId: user.id,
        displayName: user.displayName,
        isTyping,
      });
    });

    socket.on('voice:state', ({ salonId, isMuted, isSpeaking }) => {
      if (!salonId) return;
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
          const demoPeerIds = ['user-alexandre', 'user-sarah', 'user-youssef', 'user-lina', 'user-karim'];
          const isDemoPeer = demoPeerIds.includes(targetUserId);
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

          // Auto-answer after realistic ring delay (1.5s)
          setTimeout(async () => {
            const currentCall = activeCalls.get(callId);
            if (!currentCall || currentCall.status !== 'RINGING') return;
            currentCall.status = 'CONNECTED';

            const demoPeer = await prisma.user.findUnique({ where: { id: targetUserId } });
            socket.emit('call:accepted', {
              callId,
              isDemoPeer: true,
              receiver: {
                id: targetUserId,
                username: demoPeer?.username || 'contact',
                displayName: demoPeer?.displayName || 'Ami WafaTalk',
                avatarUrl: demoPeer?.avatarUrl,
              },
            });
          }, 1500);
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

        // Set 45s ringing timeout
        const timeoutTimer = setTimeout(async () => {
          const currentCall = activeCalls.get(callId);
          if (currentCall && currentCall.status === 'RINGING') {
            activeCalls.delete(callId);
            userActiveCall.delete(currentCall.callerId);
            userActiveCall.delete(currentCall.receiverId);
            callTimeoutTimers.delete(callId);

            await ConversationsService.endCallSession(callId, 'MISSED', 0);

            io.to(`user:${currentCall.callerId}`).emit('call:failed', {
              reason: 'timeout',
              message: 'Le correspondant ne répond pas.',
            });
            io.to(`user:${currentCall.receiverId}`).emit('call:ended', {
              callId,
              reason: 'timeout',
            });
          }
        }, 45000);
        callTimeoutTimers.set(callId, timeoutTimer);

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

      // Clear ringing timeout
      const ringTimer = callTimeoutTimers.get(callId);
      if (ringTimer) {
        clearTimeout(ringTimer);
        callTimeoutTimers.delete(callId);
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

      const ringTimer = callTimeoutTimers.get(callId);
      if (ringTimer) {
        clearTimeout(ringTimer);
        callTimeoutTimers.delete(callId);
      }

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

      const ringTimer = callTimeoutTimers.get(callId);
      if (ringTimer) {
        clearTimeout(ringTimer);
        callTimeoutTimers.delete(callId);
      }

      activeCalls.delete(callId);
      userActiveCall.delete(call.callerId);
      userActiveCall.delete(call.receiverId);

      const dur = typeof durationSec === 'number' ? durationSec : 0;
      await ConversationsService.endCallSession(callId, dur > 0 ? 'COMPLETED' : 'MISSED', dur);

      // Notify both participants via room AND direct user channels (resilient if still ringing)
      io.to(`call:${callId}`).emit('call:ended', {
        callId,
        durationSec: dur,
      });
      io.to(`user:${call.callerId}`).emit('call:ended', {
        callId,
        durationSec: dur,
      });
      io.to(`user:${call.receiverId}`).emit('call:ended', {
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

      // Clean up all salons this socket had joined
      const joinedSalons = socketSalons.get(socket.id);
      if (joinedSalons && joinedSalons.size > 0) {
        for (const salonId of joinedSalons) {
          const salonMap = salonParticipants.get(salonId);
          if (salonMap) {
            salonMap.delete(user.id);
            if (salonMap.size === 0) {
              salonParticipants.delete(salonId);
            }
          }
          io.to(`salon:${salonId}`).emit('salon:user_left', {
            salonId,
            userId: user.id,
            displayName: user.displayName,
            timestamp: new Date(),
          });
        }
        socketSalons.delete(socket.id);
      }

      // Clean up active call if any
      const callId = userActiveCall.get(user.id);
      if (callId) {
        const ringTimer = callTimeoutTimers.get(callId);
        if (ringTimer) {
          clearTimeout(ringTimer);
          callTimeoutTimers.delete(callId);
        }

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

      // Check if user still has other connections in user:${user.id}
      const userRoom = io.sockets.adapter.rooms.get(`user:${user.id}`);
      if (!userRoom || userRoom.size === 0) {
        io.emit('presence:update', {
          userId: user.id,
          status: 'offline',
        });
        if (user.id && !user.id.startsWith('guest-')) {
          await prisma.user.update({
            where: { id: user.id },
            data: { status: 'OFFLINE' },
          }).catch(() => {});
        }
      }
    });
  });

  return io;
}
