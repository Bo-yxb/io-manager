import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Legacy /api/* -> /api/v1/* redirect (applied at Express level)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/') && !req.path.startsWith('/api/v1/')) {
      const newPath = req.path.replace('/api/', '/api/v1/');
      const qs = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
      return res.redirect(307, newPath + qs);
    }
    next();
  });

  const port = process.env.PORT || 7100;
  await app.listen(port);
  console.log(`io-manager v2 running on :${port}`);
}
bootstrap();
