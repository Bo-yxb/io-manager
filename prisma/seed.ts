import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const templates = [
    { id: 'tpl_frontend', name: '前端页面', tags: JSON.stringify(['frontend']), defaultTimeout: 120 },
    { id: 'tpl_backend', name: '后端接口', tags: JSON.stringify(['backend']), defaultTimeout: 180 },
    { id: 'tpl_db', name: '数据库设计', tags: JSON.stringify(['backend', 'db']), defaultTimeout: 240 },
    { id: 'tpl_test', name: '测试用例', tags: JSON.stringify(['qa']), defaultTimeout: 60 },
    { id: 'tpl_doc', name: '文档撰写', tags: JSON.stringify(['doc']), defaultTimeout: 30 },
  ];

  for (const t of templates) {
    await prisma.template.upsert({ where: { id: t.id }, update: t, create: t });
  }

  const workers = [
    { id: 'worker_gaoyuanyuan', name: '高圆圆', tags: JSON.stringify(['frontend']), status: 'idle' },
    { id: 'worker_zhaoliying', name: '赵丽颖', tags: JSON.stringify(['backend']), status: 'idle' },
    { id: 'worker_zhaojinmai', name: '赵今麦', tags: JSON.stringify(['qa', 'doc']), status: 'idle' },
  ];

  for (const w of workers) {
    await prisma.worker.upsert({ where: { id: w.id }, update: w, create: w });
  }

  console.log('Seed complete: templates=%d, workers=%d', templates.length, workers.length);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
