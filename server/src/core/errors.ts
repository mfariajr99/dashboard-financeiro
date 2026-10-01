/** Erro de negócio com status HTTP — tratado igual no servidor e no ambiente de teste. */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export const badRequest = (m: string, code = 'BAD_REQUEST') => new AppError(400, m, code);
export const notFound = (m = 'Registro não encontrado') => new AppError(404, m, 'NOT_FOUND');
export const conflict = (m: string, code = 'CONFLICT') => new AppError(409, m, code);
