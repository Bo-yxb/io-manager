import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class BlueprintService {
  constructor(private prisma: PrismaService) {}

  async findAllTemplates() {
    const templates = await this.prisma.template.findMany();
    return templates.map((t) => ({
      ...t,
      tags: JSON.parse(t.tags),
    }));
  }
}
