import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { loginSchema, registerSchema, updateProfileSchema } from './auth.schema.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Register
  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = registerSchema.parse(request.body);
      const user = await AuthService.register(input);
      const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });
      
      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return reply.code(201).send({
        success: true,
        message: 'Compte créé avec succès !',
        token,
        user,
      });
    } catch (error: any) {
      let message = 'Erreur lors de l\'inscription';
      if (error?.errors && Array.isArray(error.errors) && error.errors.length > 0) {
        message = error.errors[0].message;
      } else if (error?.message) {
        message = error.message;
      }
      return reply.code(400).send({
        success: false,
        message,
      });
    }
  });

  // Login
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = loginSchema.parse(request.body);
      const user = await AuthService.login(input);
      const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });

      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({
        success: true,
        message: 'Connexion réussie !',
        token,
        user,
      });
    } catch (error: any) {
      return reply.code(401).send({
        success: false,
        message: error.message || 'Identifiants invalides',
      });
    }
  });

  // Demo 1-Click Login
  fastify.post('/demo', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await AuthService.getDemoUser();
      const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });

      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({
        success: true,
        message: 'Connexion Démo réussie !',
        token,
        user,
      });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        message: 'Erreur lors de la connexion démo',
      });
    }
  });

  // Social Login (Google, Apple, Discord)
  fastify.post('/social', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { provider, email, displayName, avatarUrl } = request.body as any;
      const user = await AuthService.socialLogin(provider || 'google', email, displayName, avatarUrl);
      const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });

      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({
        success: true,
        message: `Connexion avec ${provider || 'Google'} réussie !`,
        token,
        user,
      });
    } catch (error: any) {
      return reply.code(400).send({
        success: false,
        message: error.message || 'Erreur d\'authentification sociale',
      });
    }
  });

  // Me (Profile)
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply: FastifyReply) => {
    try {
      const user = await AuthService.getProfile(request.user.id);
      return reply.send({ success: true, user });
    } catch (error: any) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  });

  // Logout
  fastify.post('/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.send({ success: true, message: 'Déconnexion effectuée' });
  });
}
