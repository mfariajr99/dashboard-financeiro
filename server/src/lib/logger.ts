import pino from 'pino';
import { config } from '../config';

/** Logger estruturado com redação de campos sensíveis (senhas, tokens, cookies). */
export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.passwordHash',
      'password',
      'passwordHash',
    ],
    censor: '[REDACTED]',
  },
});
