import type { VercelRequest, VercelResponse } from '@vercel/node';
import { methodNotAllowed, ok } from './_lib/http';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  ok(res, {
    application: 'Proof Video System',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
