import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';

export function releaseMaintenance(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  // Browser preflights carry no cookies; CORS validates their origin downstream.
  if (
    !env.RELEASE_MAINTENANCE ||
    request.path === '/v1/health' ||
    request.method === 'OPTIONS'
  )
    return next();
  const supplied: unknown = request.cookies?.lilink_release_access;
  const expected = env.RELEASE_ACCESS_KEY;
  if (
    typeof supplied === 'string' &&
    expected &&
    Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return next();
  response.setHeader('Retry-After', '60');
  response.setHeader('Cache-Control', 'no-store');
  response.status(503).json({
    statusCode: 503,
    message: '系统正在升级，请稍后重试。你的账号和历史记录会保留。',
  });
}
