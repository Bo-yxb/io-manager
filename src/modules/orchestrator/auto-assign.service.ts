import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class AutoAssignService {
  constructor(private prisma: PrismaService) {}

  async assignWorker(taskType: string): Promise<string> {
    const template = await this.prisma.template.findFirst({
      where: {
        OR: [{ id: taskType }, { name: { contains: taskType } }],
      },
    });
    if (!template) return 'unassigned';

    const requiredTags: string[] = JSON.parse(template.tags);
    const workers = await this.prisma.worker.findMany({ where: { status: 'idle' } });

    const matched = workers.find((w) => {
      const workerTags: string[] = JSON.parse(w.tags);
      return workerTags.some((tag) => requiredTags.includes(tag));
    });

    return matched?.id || 'unassigned';
  }
}
