import { z } from 'zod';

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Le pseudo doit comporter au moins 3 caractères')
    .max(30, 'Le pseudo ne peut pas dépasser 30 caractères')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Le pseudo ne peut contenir que des lettres (majuscules et minuscules), des chiffres, des tirets (-) et des underscores (_)'
    ),
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(6, 'Le mot de passe doit comporter au moins 6 caractères'),
  displayName: z.string().min(1).max(60).optional(),
  birthDate: z.string().optional(),
  country: z.string().optional(),
  termsAccepted: z.boolean().optional(),
});

export const loginSchema = z.object({
  login: z.string().min(1, 'Email ou nom d\'utilisateur requis'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  bio: z.string().max(200).optional(),
  avatarUrl: z.string().url().optional(),
  country: z.string().optional(),
  birthDate: z.string().optional(),
});

export const sendVerificationSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  username: z
    .string()
    .trim()
    .min(3, 'Le pseudo doit comporter au moins 3 caractères')
    .max(30, 'Le pseudo ne peut pas dépasser 30 caractères')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Le pseudo ne peut contenir que des lettres (A-Z, a-z), chiffres, tirets (-) et underscores (_)'
    ),
  birthDate: z.string().optional(),
  country: z.string().optional(),
  password: z.string().min(6, 'Le mot de passe doit comporter au moins 6 caractères').optional(),
});

export const verifyAndRegisterSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  code: z.string().min(6, 'Le code doit comporter 6 chiffres').max(6, 'Le code doit comporter 6 chiffres'),
  username: z
    .string()
    .trim()
    .min(3, 'Le pseudo doit comporter au moins 3 caractères')
    .max(30, 'Le pseudo ne peut pas dépasser 30 caractères')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Le pseudo ne peut contenir que des lettres (A-Z, a-z), chiffres, tirets (-) et underscores (_)'
    ),
  password: z.string().min(6, 'Le mot de passe doit comporter au moins 6 caractères'),
  displayName: z.string().min(1).max(60).optional(),
  birthDate: z.string().optional(),
  country: z.string().optional(),
  termsAccepted: z.boolean().optional(),
});

export const resendVerificationSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  username: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SendVerificationInput = z.infer<typeof sendVerificationSchema>;
export type VerifyAndRegisterInput = z.infer<typeof verifyAndRegisterSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
