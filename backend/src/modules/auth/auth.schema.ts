import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(2, 'Le pseudo doit comporter au moins 2 caractères').max(40, 'Le pseudo ne peut pas dépasser 40 caractères'),
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(6, 'Le mot de passe doit comporter au moins 6 caractères'),
  displayName: z.string().min(1).max(60).optional(),
});

export const loginSchema = z.object({
  login: z.string().min(1, 'Email ou nom d\'utilisateur requis'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  bio: z.string().max(200).optional(),
  avatarUrl: z.string().url().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
