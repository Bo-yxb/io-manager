import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class EventStoreService {
  constructor(private prisma: PrismaService) {}

  async append(
    type: string,
    payload: Record<string, any>,
    actorId: string,
    actorRole: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.eventLog.create({
      data: {
        type,
        payload: JSON.stringify(payload),
        actorId,
        actorRole,
      },
    });
  }

  async findRecent(limit: number = 100) {
    return this.prisma.eventLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }
}
