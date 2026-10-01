import { createApp } from './app';
import { config } from './config';
import { pool } from './db/client';
import { logger } from './lib/logger';
import { ensureInitialAdmin } from './services/auth';

async function main() {
  await ensureInitialAdmin();
  const app = createApp();
  const server = app.listen(config.PORT, '0.0.0.0', () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'FinPlan rodando');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Encerrando...');
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err: err instanceof Error ? err.message : err }, 'Falha ao iniciar');
  process.exit(1);
});
