// An error whose `message` is safe to expose to the client.
export class AppError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export const badRequest = (msg: string) => new AppError(400, msg);
export const unauthorized = (msg = 'Unauthorized') => new AppError(401, msg);
export const forbidden = (msg = 'Forbidden') => new AppError(403, msg);
export const notFound = (msg = 'Not found') => new AppError(404, msg);
export const tooManyRequests = (msg = 'Too many requests') => new AppError(429, msg);
