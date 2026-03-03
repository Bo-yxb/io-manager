import { DecomposeService } from '../../../src/modules/blueprint/decompose.service';

describe('DecomposeService', () => {
  let service: DecomposeService;

  beforeEach(() => {
    service = new DecomposeService();
  });

  it('should parse markdown headers into milestones/modules/tasks', () => {
    const text = `# 用户系统
## 注册模块
### 实现注册页面
### 编写注册接口
## 登录模块
### 实现登录页面`;

    const nodes = service.decompose(text);

    expect(nodes.length).toBe(6);
    expect(nodes[0]).toMatchObject({ level: 'milestone', title: '用户系统' });
    expect(nodes[1]).toMatchObject({ level: 'module', title: '注册模块', parentIndex: 0 });
    expect(nodes[2]).toMatchObject({ level: 'task', title: '实现注册页面', parentIndex: 1 });
    expect(nodes[3]).toMatchObject({ level: 'task', title: '编写注册接口', parentIndex: 1 });
    expect(nodes[4]).toMatchObject({ level: 'module', title: '登录模块', parentIndex: 0 });
    expect(nodes[5]).toMatchObject({ level: 'task', title: '实现登录页面', parentIndex: 4 });
  });

  it('should parse numbered lists as milestones', () => {
    const text = `1. 后端开发
- API接口
* 编写controller
2. 前端开发
- 页面设计`;

    const nodes = service.decompose(text);

    expect(nodes[0]).toMatchObject({ level: 'milestone', title: '后端开发' });
    expect(nodes[1]).toMatchObject({ level: 'module', title: 'API接口', parentIndex: 0 });
    expect(nodes[2]).toMatchObject({ level: 'task', title: '编写controller', parentIndex: 1 });
    expect(nodes[3]).toMatchObject({ level: 'milestone', title: '前端开发' });
    expect(nodes[4]).toMatchObject({ level: 'module', title: '页面设计', parentIndex: 3 });
  });

  it('should infer taskType from keywords', () => {
    const text = `# 开发
### 实现前端页面
### 编写后端API接口
### 编写测试用例
### 撰写文档说明`;

    const nodes = service.decompose(text);

    const taskNodes = nodes.filter((n) => n.level === 'task');
    expect(taskNodes[0].taskType).toBe('frontend');
    expect(taskNodes[1].taskType).toBe('backend');
    expect(taskNodes[2].taskType).toBe('qa');
    expect(taskNodes[3].taskType).toBe('doc');
  });

  it('should handle empty input', () => {
    const nodes = service.decompose('');
    expect(nodes).toEqual([]);
  });

  it('should handle plain text with no structure via fallback', () => {
    const text = '实现一个完整的用户认证系统。包括注册功能。包括登录功能。包括密码重置。';
    const nodes = service.decompose(text);

    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodes[0].level).toBe('milestone');
    expect(nodes.some((n) => n.level === 'task')).toBe(true);
  });

  it('should create implicit milestone when modules appear without one', () => {
    const text = `- 前端模块
* 设计首页
- 后端模块
* 编写接口`;

    const nodes = service.decompose(text);

    expect(nodes[0]).toMatchObject({ level: 'milestone', title: '默认里程碑' });
    expect(nodes[1]).toMatchObject({ level: 'module', title: '前端模块', parentIndex: 0 });
  });

  it('should handle multi-paragraph text', () => {
    const text = `用户注册系统需要包括邮箱验证和手机号绑定

后台管理需要权限控制和角色管理`;

    const nodes = service.decompose(text);

    // Plain text lines parsed as tasks under an implicit milestone
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodes.some((n) => n.level === 'milestone')).toBe(true);
  });

  it('inferTaskType should return correct types', () => {
    expect(service.inferTaskType('前端页面开发')).toBe('frontend');
    expect(service.inferTaskType('API接口设计')).toBe('backend');
    expect(service.inferTaskType('测试用例编写')).toBe('qa');
    expect(service.inferTaskType('文档撰写')).toBe('doc');
    expect(service.inferTaskType('原型设计')).toBe('design');
    expect(service.inferTaskType('Docker部署')).toBe('devops');
    expect(service.inferTaskType('普通任务')).toBe('Task');
  });
});
