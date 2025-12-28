/**
 * 审计日志工具函数
 * 提供操作类型、目标类型的中文翻译，以及格式化展示功能
 */

// ============================================================================
// 操作类型翻译映射
// ============================================================================

export interface ActionInfo {
  label: string; // 中文标签
  description: string; // 操作描述
  icon: string; // 图标
  color: 'green' | 'red' | 'blue' | 'purple' | 'yellow' | 'gray' | 'orange';
}

export const ACTION_TRANSLATIONS: Record<string, ActionInfo> = {
  // 用户管理
  'user.activate': {
    label: '激活用户',
    description: '将待审核用户激活为正式用户',
    icon: '✅',
    color: 'green',
  },
  'user.suspend': {
    label: '暂停用户',
    description: '暂停用户的系统访问权限',
    icon: '⏸️',
    color: 'red',
  },
  'user.restore': {
    label: '恢复用户',
    description: '恢复被暂停用户的访问权限',
    icon: '🔄',
    color: 'blue',
  },
  'user.role_change': {
    label: '变更角色',
    description: '修改用户的系统角色',
    icon: '👤',
    color: 'purple',
  },

  // SQL 请求
  'request.create': {
    label: '创建请求',
    description: '创建新的 SQL 执行请求',
    icon: '📝',
    color: 'green',
  },
  'request.update': {
    label: '更新请求',
    description: '修改 SQL 请求内容',
    icon: '✏️',
    color: 'blue',
  },
  'request.revert_version': {
    label: '回滚版本',
    description: '将请求回滚到历史版本',
    icon: '⏪',
    color: 'yellow',
  },
  'request.execute': {
    label: '执行完成',
    description: 'SQL 请求执行完成',
    icon: '✨',
    color: 'green',
  },
  'request.terminate': {
    label: '终止执行',
    description: '手动终止正在执行的请求',
    icon: '🛑',
    color: 'red',
  },

  // 审批操作
  APPROVE_REQUEST: {
    label: '批准请求',
    description: '批准 SQL 执行请求',
    icon: '✅',
    color: 'green',
  },
  REJECT_REQUEST: {
    label: '拒绝请求',
    description: '拒绝 SQL 执行请求',
    icon: '❌',
    color: 'red',
  },
  REQUEST_CHANGES: {
    label: '要求修改',
    description: '要求申请人修改请求内容',
    icon: '📋',
    color: 'yellow',
  },
  RETRY_EXECUTION: {
    label: '重试执行',
    description: '重新执行失败的请求',
    icon: '🔁',
    color: 'blue',
  },

  // 语句执行
  'statement.execute': {
    label: '执行语句',
    description: '执行单条 SQL 语句',
    icon: '▶️',
    color: 'purple',
  },
  'statement.fail': {
    label: '执行失败',
    description: 'SQL 语句执行失败',
    icon: '💥',
    color: 'red',
  },

  // 会话管理
  'session.kill': {
    label: '终止会话',
    description: '终止数据库会话连接',
    icon: '🔌',
    color: 'red',
  },

  // 模板管理
  'template.create': {
    label: '创建模板',
    description: '创建新的 SQL 模板',
    icon: '📄',
    color: 'green',
  },
  'template.update': {
    label: '更新模板',
    description: '修改 SQL 模板内容',
    icon: '📝',
    color: 'blue',
  },
  'template.publish': {
    label: '发布模板',
    description: '将模板发布为可用状态',
    icon: '📢',
    color: 'green',
  },
  'template.delete': {
    label: '删除模板',
    description: '删除 SQL 模板',
    icon: '🗑️',
    color: 'red',
  },

  // 数据库管理
  'database.create': {
    label: '添加数据库',
    description: '添加新的目标数据库',
    icon: '🗄️',
    color: 'green',
  },
  'database.update': {
    label: '更新数据库',
    description: '修改数据库配置',
    icon: '⚙️',
    color: 'blue',
  },
  'database.enable': {
    label: '启用数据库',
    description: '启用目标数据库',
    icon: '✅',
    color: 'green',
  },
  'database.disable': {
    label: '禁用数据库',
    description: '禁用目标数据库',
    icon: '🚫',
    color: 'red',
  },
  'database.delete': {
    label: '删除数据库',
    description: '删除目标数据库配置',
    icon: '🗑️',
    color: 'red',
  },

  // 集群管理
  'cluster.create': {
    label: '添加集群',
    description: '添加新的数据库集群',
    icon: '🌐',
    color: 'green',
  },
  'cluster.update': {
    label: '更新集群',
    description: '修改集群配置',
    icon: '⚙️',
    color: 'blue',
  },
  'cluster.enable': {
    label: '启用集群',
    description: '启用数据库集群',
    icon: '✅',
    color: 'green',
  },
  'cluster.disable': {
    label: '禁用集群',
    description: '禁用数据库集群',
    icon: '🚫',
    color: 'red',
  },
  'cluster.delete': {
    label: '删除集群',
    description: '删除数据库集群配置',
    icon: '🗑️',
    color: 'red',
  },

  // 自动过期
  'approval.expire': {
    label: '审批过期',
    description: '请求审批超时自动过期',
    icon: '⏰',
    color: 'orange',
  },
};

// ============================================================================
// 目标类型翻译映射
// ============================================================================

export interface TargetTypeInfo {
  label: string;
  icon: string;
}

export const TARGET_TYPE_TRANSLATIONS: Record<string, TargetTypeInfo> = {
  user: { label: '用户', icon: '👤' },
  profile: { label: '用户资料', icon: '👤' },
  sql_request: { label: 'SQL 请求', icon: '📝' },
  request: { label: 'SQL 请求', icon: '📝' },
  statement: { label: 'SQL 语句', icon: '▶️' },
  session: { label: '数据库会话', icon: '🔌' },
  template: { label: 'SQL 模板', icon: '📄' },
  database: { label: '目标数据库', icon: '🗄️' },
  db_target: { label: '目标数据库', icon: '🗄️' },
  cluster: { label: '数据库集群', icon: '🌐' },
  db_cluster: { label: '数据库集群', icon: '🌐' },
  approval: { label: '审批', icon: '✅' },
};

// ============================================================================
// 翻译函数
// ============================================================================

/**
 * 获取操作类型信息
 */
export function getActionInfo(action: string): ActionInfo {
  if (ACTION_TRANSLATIONS[action]) {
    return ACTION_TRANSLATIONS[action];
  }

  // 尝试从操作名推断
  const inferredInfo = inferActionInfo(action);
  if (inferredInfo) {
    return inferredInfo;
  }

  // 默认返回
  return {
    label: action,
    description: action,
    icon: '📋',
    color: 'gray',
  };
}

/**
 * 从操作名推断信息
 */
function inferActionInfo(action: string): ActionInfo | null {
  const lowerAction = action.toLowerCase();

  if (lowerAction.includes('create')) {
    return {
      label: '创建',
      description: action,
      icon: '➕',
      color: 'green',
    };
  }
  if (lowerAction.includes('delete') || lowerAction.includes('remove')) {
    return {
      label: '删除',
      description: action,
      icon: '🗑️',
      color: 'red',
    };
  }
  if (lowerAction.includes('update') || lowerAction.includes('edit')) {
    return {
      label: '更新',
      description: action,
      icon: '✏️',
      color: 'blue',
    };
  }
  if (lowerAction.includes('approve')) {
    return {
      label: '批准',
      description: action,
      icon: '✅',
      color: 'green',
    };
  }
  if (lowerAction.includes('reject')) {
    return {
      label: '拒绝',
      description: action,
      icon: '❌',
      color: 'red',
    };
  }
  if (lowerAction.includes('execute')) {
    return {
      label: '执行',
      description: action,
      icon: '▶️',
      color: 'purple',
    };
  }
  if (lowerAction.includes('suspend') || lowerAction.includes('disable')) {
    return {
      label: '禁用',
      description: action,
      icon: '🚫',
      color: 'red',
    };
  }
  if (lowerAction.includes('activate') || lowerAction.includes('enable')) {
    return {
      label: '启用',
      description: action,
      icon: '✅',
      color: 'green',
    };
  }
  if (lowerAction.includes('restore')) {
    return {
      label: '恢复',
      description: action,
      icon: '🔄',
      color: 'blue',
    };
  }

  return null;
}

/**
 * 获取目标类型信息
 */
export function getTargetTypeInfo(targetType: string): TargetTypeInfo {
  if (TARGET_TYPE_TRANSLATIONS[targetType]) {
    return TARGET_TYPE_TRANSLATIONS[targetType];
  }

  return {
    label: targetType,
    icon: '📦',
  };
}

// ============================================================================
// Badge 样式
// ============================================================================

export function getActionBadgeClasses(
  color: ActionInfo['color']
): { bg: string; text: string } {
  const colorMap = {
    green: { bg: 'bg-green-100', text: 'text-green-800' },
    red: { bg: 'bg-red-100', text: 'text-red-800' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-800' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-800' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-800' },
    gray: { bg: 'bg-gray-100', text: 'text-gray-800' },
  };

  return colorMap[color] || colorMap.gray;
}

// ============================================================================
// Payload 格式化
// ============================================================================

export interface FormattedPayloadItem {
  label: string;
  value: string | number | boolean | null;
  type: 'text' | 'code' | 'status' | 'number' | 'duration' | 'date' | 'link';
  color?: 'green' | 'red' | 'blue' | 'gray';
}

/**
 * 格式化 payload 数据为人类可读的格式
 */
export function formatPayload(
  action: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any> | null
): FormattedPayloadItem[] {
  if (!payload) return [];

  // 根据不同的操作类型格式化
  switch (action) {
    case 'statement.execute':
    case 'statement.fail':
      return formatStatementPayload(payload);

    case 'request.execute':
      return formatRequestExecutePayload(payload);

    case 'APPROVE_REQUEST':
    case 'approval.expire':
      return formatApprovalPayload(payload);

    case 'REJECT_REQUEST':
    case 'REQUEST_CHANGES':
      return formatRejectionPayload(payload);

    case 'user.role_change':
      return formatRoleChangePayload(payload);

    case 'user.activate':
    case 'user.suspend':
    case 'user.restore':
      return formatUserStatusPayload(payload);

    case 'request.create':
    case 'request.update':
      return formatRequestPayload(payload);

    case 'request.revert_version':
      return formatRevertPayload(payload);

    case 'session.kill':
      return formatSessionKillPayload(payload);

    case 'template.create':
    case 'template.update':
    case 'template.publish':
    case 'template.delete':
      return formatTemplatePayload(payload);

    case 'database.create':
    case 'database.update':
    case 'database.enable':
    case 'database.disable':
    case 'database.delete':
      return formatDatabasePayload(payload);

    case 'cluster.create':
    case 'cluster.update':
    case 'cluster.enable':
    case 'cluster.disable':
    case 'cluster.delete':
      return formatClusterPayload(payload);

    default:
      // 通用格式化
      return formatGenericPayload(payload);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatStatementPayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  if (payload.sqlText) {
    items.push({
      label: 'SQL 语句',
      value: payload.sqlText,
      type: 'code',
    });
  }

  if (payload.status) {
    const statusMap: Record<string, { label: string; color: 'green' | 'red' }> = {
      SUCCEEDED: { label: '成功', color: 'green' },
      FAILED: { label: '失败', color: 'red' },
    };
    const statusInfo = statusMap[payload.status] || { label: payload.status, color: 'gray' as const };
    items.push({
      label: '执行状态',
      value: statusInfo.label,
      type: 'status',
      color: statusInfo.color,
    });
  }

  if (payload.affectedRows !== undefined) {
    items.push({
      label: '影响行数',
      value: payload.affectedRows,
      type: 'number',
    });
  }

  if (payload.resultRowCount !== undefined) {
    items.push({
      label: '返回行数',
      value: payload.resultRowCount,
      type: 'number',
    });
  }

  if (payload.durationMs !== undefined) {
    items.push({
      label: '执行耗时',
      value: payload.durationMs,
      type: 'duration',
    });
  }

  if (payload.error) {
    items.push({
      label: '错误信息',
      value: payload.error,
      type: 'text',
      color: 'red',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatRequestExecutePayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  if (payload.totalStatements !== undefined) {
    items.push({
      label: '总语句数',
      value: payload.totalStatements,
      type: 'number',
    });
  }

  if (payload.succeededCount !== undefined) {
    items.push({
      label: '成功语句数',
      value: payload.succeededCount,
      type: 'number',
    });
  }

  if (payload.totalDurationMs !== undefined) {
    items.push({
      label: '总耗时',
      value: payload.totalDurationMs,
      type: 'duration',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatApprovalPayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  if (payload.expiresAt) {
    items.push({
      label: '过期时间',
      value: payload.expiresAt,
      type: 'date',
    });
  }

  if (payload.versionId) {
    items.push({
      label: '版本 ID',
      value: payload.versionId.substring(0, 8) + '...',
      type: 'text',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatRejectionPayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  if (payload.reason) {
    items.push({
      label: '原因',
      value: payload.reason,
      type: 'text',
    });
  }

  if (payload.versionId) {
    items.push({
      label: '版本 ID',
      value: payload.versionId.substring(0, 8) + '...',
      type: 'text',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatRoleChangePayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  const roleMap: Record<string, string> = {
    PENDING: '待审核',
    USER: '普通用户',
    ADMIN: '管理员',
  };

  if (payload.previousRole) {
    items.push({
      label: '原角色',
      value: roleMap[payload.previousRole] || payload.previousRole,
      type: 'text',
    });
  }

  if (payload.newRole) {
    items.push({
      label: '新角色',
      value: roleMap[payload.newRole] || payload.newRole,
      type: 'text',
      color: 'blue',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatUserStatusPayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  if (payload.email) {
    items.push({
      label: '用户邮箱',
      value: payload.email,
      type: 'text',
    });
  }

  if (payload.reason) {
    items.push({
      label: '原因',
      value: payload.reason,
      type: 'text',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatRequestPayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  if (payload.title) {
    items.push({
      label: '请求标题',
      value: payload.title,
      type: 'text',
    });
  }

  if (payload.targetDatabase) {
    items.push({
      label: '目标数据库',
      value: payload.targetDatabase,
      type: 'text',
    });
  }

  if (payload.statementCount !== undefined) {
    items.push({
      label: 'SQL 语句数',
      value: payload.statementCount,
      type: 'number',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatRevertPayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  if (payload.fromVersion !== undefined) {
    items.push({
      label: '从版本',
      value: `v${payload.fromVersion}`,
      type: 'text',
    });
  }

  if (payload.toVersion !== undefined) {
    items.push({
      label: '回滚到版本',
      value: `v${payload.toVersion}`,
      type: 'text',
      color: 'blue',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatSessionKillPayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  if (payload.sessionId) {
    items.push({
      label: '会话 ID',
      value: payload.sessionId,
      type: 'text',
    });
  }

  if (payload.database) {
    items.push({
      label: '数据库',
      value: payload.database,
      type: 'text',
    });
  }

  if (payload.user) {
    items.push({
      label: '数据库用户',
      value: payload.user,
      type: 'text',
    });
  }

  if (payload.reason) {
    items.push({
      label: '终止原因',
      value: payload.reason,
      type: 'text',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTemplatePayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  if (payload.name) {
    items.push({
      label: '模板名称',
      value: payload.name,
      type: 'text',
    });
  }

  if (payload.description) {
    items.push({
      label: '模板描述',
      value: payload.description,
      type: 'text',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatDatabasePayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  if (payload.name) {
    items.push({
      label: '数据库名称',
      value: payload.name,
      type: 'text',
    });
  }

  if (payload.host) {
    items.push({
      label: '主机地址',
      value: payload.host,
      type: 'text',
    });
  }

  if (payload.database) {
    items.push({
      label: '数据库',
      value: payload.database,
      type: 'text',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatClusterPayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  if (payload.name) {
    items.push({
      label: '集群名称',
      value: payload.name,
      type: 'text',
    });
  }

  if (payload.description) {
    items.push({
      label: '集群描述',
      value: payload.description,
      type: 'text',
    });
  }

  return items;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatGenericPayload(payload: Record<string, any>): FormattedPayloadItem[] {
  const items: FormattedPayloadItem[] = [];

  // 常见字段的中文标签映射
  const labelMap: Record<string, string> = {
    id: 'ID',
    requestId: '请求 ID',
    versionId: '版本 ID',
    version: '版本号',
    status: '状态',
    error: '错误信息',
    reason: '原因',
    message: '消息',
    title: '标题',
    description: '描述',
    name: '名称',
    email: '邮箱',
    role: '角色',
    type: '类型',
    target: '目标',
    source: '来源',
    duration: '耗时',
    count: '数量',
    total: '总数',
    success: '成功',
    failed: '失败',
    createdAt: '创建时间',
    updatedAt: '更新时间',
    expiresAt: '过期时间',
  };

  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;

    const label = labelMap[key] || key;
    let displayValue: string | number | boolean = value;
    let type: FormattedPayloadItem['type'] = 'text';

    if (typeof value === 'number') {
      type = 'number';
    } else if (typeof value === 'boolean') {
      displayValue = value ? '是' : '否';
    } else if (typeof value === 'object') {
      displayValue = JSON.stringify(value, null, 2);
      type = 'code';
    } else if (key.includes('At') || key.includes('Time') || key.includes('Date')) {
      type = 'date';
    }

    items.push({
      label,
      value: displayValue,
      type,
    });
  }

  return items;
}

// ============================================================================
// 时间格式化
// ============================================================================

/**
 * 格式化毫秒为人类可读的时间
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms} 毫秒`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)} 秒`;
  }
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes} 分 ${seconds} 秒`;
  }
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours} 小时 ${minutes} 分`;
}

/**
 * 格式化日期时间
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 60000) {
    return '刚刚';
  }
  if (diffMs < 3600000) {
    const minutes = Math.floor(diffMs / 60000);
    return `${minutes} 分钟前`;
  }
  if (diffMs < 86400000) {
    const hours = Math.floor(diffMs / 3600000);
    return `${hours} 小时前`;
  }
  if (diffMs < 604800000) {
    const days = Math.floor(diffMs / 86400000);
    return `${days} 天前`;
  }

  return formatDateTime(d);
}

// ============================================================================
// 操作摘要生成
// ============================================================================

/**
 * 生成操作摘要描述
 */
export function generateActionSummary(
  action: string,
  targetType: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any> | null,
  actorName: string
): string {
  const actionInfo = getActionInfo(action);
  // targetType 可用于将来扩展摘要信息
  void targetType;

  // 基本摘要
  let summary = `${actorName} ${actionInfo.label}`;

  // 根据不同操作类型添加详情
  switch (action) {
    case 'user.activate':
    case 'user.suspend':
    case 'user.restore':
      if (payload?.email) {
        summary += `：${payload.email}`;
      }
      break;

    case 'user.role_change':
      if (payload?.newRole) {
        const roleMap: Record<string, string> = {
          PENDING: '待审核',
          USER: '普通用户',
          ADMIN: '管理员',
        };
        summary += `为 ${roleMap[payload.newRole] || payload.newRole}`;
      }
      break;

    case 'statement.execute':
    case 'statement.fail':
      if (payload?.status === 'SUCCEEDED') {
        summary += `成功`;
        if (payload?.affectedRows) {
          summary += `，影响 ${payload.affectedRows} 行`;
        }
      } else if (payload?.status === 'FAILED') {
        summary += `失败`;
      }
      break;

    case 'REJECT_REQUEST':
    case 'REQUEST_CHANGES':
      if (payload?.reason) {
        summary += `：${payload.reason.substring(0, 50)}${payload.reason.length > 50 ? '...' : ''}`;
      }
      break;

    default:
      break;
  }

  return summary;
}
