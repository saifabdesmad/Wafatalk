import { z } from 'zod';

export const createSalonSchema = z.object({
  name: z.string().min(3).max(60),
  topic: z.string().max(250).optional(),
  description: z.string().max(250).optional(),
  category: z.string().transform(v => v.toLowerCase()).pipe(z.enum(['chill', 'vocal', 'gaming', 'music', 'private'])).default('chill'),
  bannerUrl: z.string().optional(),
  isPrivate: z.boolean().default(false),
  hasVoice: z.boolean().default(true),
  password: z.string().optional(),
  maxMembers: z.number().int().min(2).max(100).default(50),
});

export const salonFilterSchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type CreateSalonInput = z.infer<typeof createSalonSchema>;
export type SalonFilterInput = z.infer<typeof salonFilterSchema>;
