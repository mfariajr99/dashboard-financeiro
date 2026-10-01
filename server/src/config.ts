import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  /** SSL para o Postgres: "require" (Render externo), "disable" (local/rede interna). */
  DATABASE_SSL: z.enum(['require', 'disable', 'auto']).default('auto'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter ao menos 32 caracteres'),
  JWT_EXPIRES_IN_HOURS: z.coerce.number().positive().default(12),
  APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
  /** Origens adicionais permitidas (CORS), separadas por vírgula. Em produção o SPA é servido na mesma origem. */
  CORS_ORIGINS: z.string().optional(),
  INITIAL_ADMIN_USERNAME: z.string().min(1).default('mlf'),
  INITIAL_ADMIN_PASSWORD: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Caminho do build do frontend (servido pelo Express em produção). */
  WEB_DIST_PATH: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Não imprime valores, apenas quais variáveis falharam.
  console.error('Variáveis de ambiente inválidas:', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
