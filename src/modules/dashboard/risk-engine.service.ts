import { Injectable } from '@nestjs/common';

@Injectable()
export class RiskEngineService {
  generateRiskSummary(risks: any[]): string {
    if (!risks.length) return '暂无风险，项目推进顺利';

    const blocked = risks.filter((r) => r.type === 'blocked').length;
    const timedOut = risks.filter((r) => r.type === 'timeout').length;

    let summary = '';
    if (blocked > 0) summary += `${blocked}个任务被阻塞 `;
    if (timedOut > 0) summary += `${timedOut}个任务超时 `;

    const assignees = [...new Set(risks.map((r) => r.assignee).filter(Boolean))];
    if (assignees.length > 0) summary += `责任人: ${assignees.join(', ')}`;

    return summary.trim();
  }
}
