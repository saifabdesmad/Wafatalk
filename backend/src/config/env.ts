import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:8085,https://wafatalk.vercel.app'),
  JWT_SECRET: z.string().default('wafatalk_dev_secret_key_change_in_production_2026'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ENABLE_REDIS: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
});

export const env = envSchema.parse(process.env);
