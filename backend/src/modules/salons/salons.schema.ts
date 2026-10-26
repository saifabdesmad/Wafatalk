import { z } from 'zod';

export const createSalonSchema = z.object({
  name: z.string().min(2).max(60),
  topic: z.string().max(250).optional(),
  description: z.string().max(250).optional(),
  category: z.string().transform(v => v.toLowerCase()).pipe(z.enum(['chill', 'vocal', 'gaming', 'music', 'private'])).default('chill'),
  bannerUrl: z.string().optional(),
  isPrivate: z.boolean().default(false),
  accessCode: z.string().optional(),
  hasVoice: z.boolean().default(true),
  password: z.string().optional(),
  maxMembers: z.number().int().min(2).max(100).default(50),
});

export const joinSalonSchema = z.object({
  accessCode: z.string().optional(),
  inviteToken: z.string().optional(),
});

export const salonAdminActionSchema = z.object({
  action: z.enum(['mute', 'unmute', 'cut_camera', 'kick', 'ban_user', 'ban_ip', 'promote_admin', 'revoke_admin']),
  targetUserId: z.string(),
  reason: z.string().optional(),
});

export const salonFilterSchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type CreateSalonInput = z.infer<typeof createSalonSchema>;
export type JoinSalonInput = z.infer<typeof joinSalonSchema>;
export type SalonAdminActionInput = z.infer<typeof salonAdminActionSchema>;
export type SalonFilterInput = z.infer<typeof salonFilterSchema>;
