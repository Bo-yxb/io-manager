import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LegacyRedirectMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (req.path.startsWith('/api/') && !req.path.startsWith('/api/v1/')) {
      const newPath = req.path.replace('/api/', '/api/v1/');
      const queryString = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
      return res.redirect(307, newPath + queryString);
    }
    next();
  }
}
