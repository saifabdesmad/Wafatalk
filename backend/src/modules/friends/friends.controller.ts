import { FastifyInstance, FastifyReply } from 'fastify';
import { FriendsService } from './friends.service.js';

export async function friendsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /api/friends — get friends list
  fastify.get('/', async (request: any, reply: FastifyReply) => {
    try {
      const friends = await FriendsService.getFriends(request.user.id);
      return reply.send({ success: true, friends });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // GET /api/friends/requests/pending — pending received requests
  fastify.get('/requests/pending', async (request: any, reply: FastifyReply) => {
    try {
      const requests = await FriendsService.getPendingReceived(request.user.id);
      return reply.send({ success: true, requests });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // GET /api/friends/requests/sent — sent pending requests
  fastify.get('/requests/sent', async (request: any, reply: FastifyReply) => {
    try {
      const requests = await FriendsService.getSentRequests(request.user.id);
      return reply.send({ success: true, requests });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // GET /api/friends/discover — discover users with friend status
  fastify.get('/discover', async (request: any, reply: FastifyReply) => {
    try {
      const search = (request.query as any)?.q;
      const users = await FriendsService.discoverUsers(request.user.id, search);
      return reply.send({ success: true, users });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // GET /api/friends/profile/:targetUserId — get rich user profile description
  fastify.get('/profile/:targetUserId', async (request: any, reply: FastifyReply) => {
    try {
      const { targetUserId } = request.params as { targetUserId: string };
      const profile = await FriendsService.getUserProfile(request.user.id, targetUserId);
      return reply.send({ success: true, profile });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // POST /api/friends/request/:targetUserId — send friend request
  fastify.post('/request/:targetUserId', async (request: any, reply: FastifyReply) => {
    try {
      const { targetUserId } = request.params as { targetUserId: string };
      const req = await FriendsService.sendRequest(request.user.id, targetUserId);

      // Real-time notification via Socket.IO
      const io = (fastify as any).io;
      if (io && req) {
        if (req.status === 'ACCEPTED') {
          io.to(`user:${targetUserId}`).emit('friend:request_accepted', { request: req });
          io.to(`user:${request.user.id}`).emit('friend:request_accepted', { request: req });
        } else {
          io.to(`user:${targetUserId}`).emit('friend:request_received', {
            request: req,
          });
        }
      }

      return reply.send({ success: true, request: req });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // POST /api/friends/accept/:requestId — accept friend request
  fastify.post('/accept/:requestId', async (request: any, reply: FastifyReply) => {
    try {
      const { requestId } = request.params as { requestId: string };
      const req = await FriendsService.acceptRequest(requestId, request.user.id);

      // Notify the original sender
      const io = (fastify as any).io;
      if (io && req) {
        io.to(`user:${req.senderId}`).emit('friend:request_accepted', {
          request: req,
          acceptedBy: { id: request.user.id },
        });
      }

      return reply.send({ success: true, request: req });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // POST /api/friends/reject/:requestId — reject friend request
  fastify.post('/reject/:requestId', async (request: any, reply: FastifyReply) => {
    try {
      const { requestId } = request.params as { requestId: string };
      const req = await FriendsService.rejectRequest(requestId, request.user.id);
      return reply.send({ success: true, request: req });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // POST /api/friends/cancel/:requestId — cancel sent request
  fastify.post('/cancel/:requestId', async (request: any, reply: FastifyReply) => {
    try {
      const { requestId } = request.params as { requestId: string };
      const req = await FriendsService.cancelRequest(requestId, request.user.id);
      return reply.send({ success: true, request: req });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // GET /api/friends/blocked — get blocked users list
  fastify.get('/blocked', async (request: any, reply: FastifyReply) => {
    try {
      const blockedUsers = await FriendsService.getBlockedUsers(request.user.id);
      return reply.send({ success: true, blockedUsers });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // PATCH /api/friends/:friendId/favorite — toggle favorite status
  fastify.patch('/:friendId/favorite', async (request: any, reply: FastifyReply) => {
    try {
      const { friendId } = request.params as { friendId: string };
      const result = await FriendsService.toggleFavorite(request.user.id, friendId);
      return reply.send({ success: true, ...result });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // PATCH /api/friends/:friendId/block-calls — toggle call block status
  fastify.patch('/:friendId/block-calls', async (request: any, reply: FastifyReply) => {
    try {
      const { friendId } = request.params as { friendId: string };
      const result = await FriendsService.toggleCallBlock(request.user.id, friendId);
      return reply.send({ success: true, ...result });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // POST /api/friends/block/:targetUserId — block user
  fastify.post('/block/:targetUserId', async (request: any, reply: FastifyReply) => {
    try {
      const { targetUserId } = request.params as { targetUserId: string };
      await FriendsService.blockUser(request.user.id, targetUserId);
      const io = (fastify as any).io;
      if (io) {
        io.to(`user:${targetUserId}`).emit('friend:removed', { userId: request.user.id });
      }
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // DELETE /api/friends/block/:targetUserId — unblock user
  fastify.delete('/block/:targetUserId', async (request: any, reply: FastifyReply) => {
    try {
      const { targetUserId } = request.params as { targetUserId: string };
      await FriendsService.unblockUser(request.user.id, targetUserId);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });

  // DELETE /api/friends/:friendId — unfriend
  fastify.delete('/:friendId', async (request: any, reply: FastifyReply) => {
    try {
      const { friendId } = request.params as { friendId: string };
      await FriendsService.removeFriend(request.user.id, friendId);
      const io = (fastify as any).io;
      if (io) {
        io.to(`user:${friendId}`).emit('friend:removed', { userId: request.user.id });
      }
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  });
}
