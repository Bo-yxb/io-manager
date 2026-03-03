import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly logger = new Logger(RedisService.name);

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST');
    if (!host) {
      this.logger.warn('REDIS_HOST not set, running without Redis cache');
      return;
    }
    try {
      this.client = new Redis({
        host,
        port: this.config.get<number>('REDIS_PORT', 6379),
        password: this.config.get<string>('REDIS_PASSWORD') || undefined,
        db: this.config.get<number>('REDIS_DB', 0),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      await this.client.connect();
      await this.client.ping();
      this.logger.log('Redis connected');
    } catch {
      this.logger.warn('Redis connection failed, running without cache');
      try { this.client?.disconnect(); } catch {}
      this.client = null;
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;
    if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
    else await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.client) return;
    await this.client.publish(channel, message);
  }

  async onModuleDestroy() {
    try { await this.client?.disconnect(); } catch {}
  }
}
