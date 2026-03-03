import { Injectable } from '@nestjs/common';

export interface DecomposedNode {
  level: 'milestone' | 'module' | 'task';
  title: string;
  description: string;
  taskType: string;
  sortOrder: number;
  parentIndex: number | null; // index in the flat array pointing to parent
}

@Injectable()
export class DecomposeService {
  decompose(text: string): DecomposedNode[] {
    const lines = text
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0);

    if (lines.length === 0) return [];

    const nodes: DecomposedNode[] = [];
    let currentMilestoneIdx: number | null = null;
    let currentModuleIdx: number | null = null;
    let order = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      const parsed = this.parseLine(trimmed, line);

      if (!parsed) continue;

      if (parsed.level === 'milestone') {
        currentMilestoneIdx = nodes.length;
        currentModuleIdx = null;
        nodes.push({
          level: 'milestone',
          title: parsed.title,
          description: '',
          taskType: 'Task',
          sortOrder: order++,
          parentIndex: null,
        });
      } else if (parsed.level === 'module') {
        if (currentMilestoneIdx === null) {
          // No milestone yet — create an implicit one
          currentMilestoneIdx = nodes.length;
          nodes.push({
            level: 'milestone',
            title: '默认里程碑',
            description: '',
            taskType: 'Task',
            sortOrder: order++,
            parentIndex: null,
          });
        }
        currentModuleIdx = nodes.length;
        nodes.push({
          level: 'module',
          title: parsed.title,
          description: '',
          taskType: this.inferTaskType(parsed.title),
          sortOrder: order++,
          parentIndex: currentMilestoneIdx,
        });
      } else {
        // task level
        let parentIdx: number | null;
        if (currentModuleIdx !== null) {
          parentIdx = currentModuleIdx;
        } else if (currentMilestoneIdx !== null) {
          parentIdx = currentMilestoneIdx;
        } else {
          // No parent at all — create implicit milestone
          currentMilestoneIdx = nodes.length;
          nodes.push({
            level: 'milestone',
            title: '默认里程碑',
            description: '',
            taskType: 'Task',
            sortOrder: order++,
            parentIndex: null,
          });
          parentIdx = currentMilestoneIdx;
        }
        nodes.push({
          level: 'task',
          title: parsed.title,
          description: '',
          taskType: this.inferTaskType(parsed.title),
          sortOrder: order++,
          parentIndex: parentIdx,
        });
      }
    }

    // If no structure detected at all, fall back to paragraph-based splitting
    if (nodes.length === 0) {
      return this.fallbackDecompose(text);
    }

    return nodes;
  }

  private parseLine(
    trimmed: string,
    _raw: string,
  ): { level: 'milestone' | 'module' | 'task'; title: string } | null {
    // ### header → task
    if (/^###\s+/.test(trimmed)) {
      return { level: 'task', title: trimmed.replace(/^###\s+/, '') };
    }
    // ## header → module
    if (/^##\s+/.test(trimmed)) {
      return { level: 'module', title: trimmed.replace(/^##\s+/, '') };
    }
    // # header → milestone
    if (/^#\s+/.test(trimmed)) {
      return { level: 'milestone', title: trimmed.replace(/^#\s+/, '') };
    }
    // Numbered list top-level: "1." "2." → milestone
    if (/^\d+\.\s+/.test(trimmed)) {
      return { level: 'milestone', title: trimmed.replace(/^\d+\.\s+/, '') };
    }
    // Dash list: "- item" → module
    if (/^[-]\s+/.test(trimmed)) {
      return { level: 'module', title: trimmed.replace(/^[-]\s+/, '') };
    }
    // Star/bullet list: "* item" / "· item" → task
    if (/^[*·•]\s+/.test(trimmed)) {
      return { level: 'task', title: trimmed.replace(/^[*·•]\s+/, '') };
    }
    // Indented content (2+ spaces or tab) → task
    if (/^(\s{2,}|\t)/.test(_raw) && trimmed.length > 0) {
      return { level: 'task', title: trimmed.replace(/^[-*·•]\s*/, '') };
    }

    // Plain text line — treat as task if we have context, or skip
    if (trimmed.length > 0) {
      return { level: 'task', title: trimmed };
    }

    return null;
  }

  private fallbackDecompose(text: string): DecomposedNode[] {
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const nodes: DecomposedNode[] = [];
    let order = 0;

    if (paragraphs.length <= 1) {
      // Single block — create one milestone with sentence-level tasks
      const milestoneIdx = 0;
      nodes.push({
        level: 'milestone',
        title: text.trim().substring(0, 60) + (text.trim().length > 60 ? '...' : ''),
        description: text.trim(),
        taskType: 'Task',
        sortOrder: order++,
        parentIndex: null,
      });

      const sentences = text
        .split(/[。；;！!？?\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2);

      for (const s of sentences) {
        nodes.push({
          level: 'task',
          title: s.substring(0, 80),
          description: '',
          taskType: this.inferTaskType(s),
          sortOrder: order++,
          parentIndex: milestoneIdx,
        });
      }
    } else {
      for (let i = 0; i < paragraphs.length; i++) {
        const milestoneIdx = nodes.length;
        const para = paragraphs[i];
        const firstLine = para.split('\n')[0].trim();
        nodes.push({
          level: 'milestone',
          title: firstLine.substring(0, 60),
          description: para,
          taskType: 'Task',
          sortOrder: order++,
          parentIndex: null,
        });

        const sentences = para
          .split(/[。；;！!？?\n]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 2 && s !== firstLine);

        for (const s of sentences) {
          nodes.push({
            level: 'task',
            title: s.substring(0, 80),
            description: '',
            taskType: this.inferTaskType(s),
            sortOrder: order++,
            parentIndex: milestoneIdx,
          });
        }
      }
    }

    return nodes;
  }

  inferTaskType(text: string): string {
    const lower = text.toLowerCase();
    if (/前端|页面|ui|css|html|组件|样式|界面/.test(lower)) return 'frontend';
    if (/后端|接口|api|服务|数据库|db|sql/.test(lower)) return 'backend';
    if (/测试|test|qa|验收|检查/.test(lower)) return 'qa';
    if (/部署|deploy|运维|ci\/cd|docker|k8s/.test(lower)) return 'devops';
    if (/文档|doc|说明|readme/.test(lower)) return 'doc';
    if (/设计|design|原型|figma|sketch/.test(lower)) return 'design';
    return 'Task';
  }
}
