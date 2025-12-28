/**
 * 数据库类型显示和配置工具
 */

export const DB_TYPE_LABELS: Record<string, string> = {
  polardb_mysql: 'PolarDB MySQL',
  redis: 'Redis',
  adb: 'ADB',
};

export const DB_TYPE_OPTIONS = [
  { value: 'polardb_mysql', label: 'PolarDB MySQL', supported: true },
  { value: 'redis', label: 'Redis', supported: false },
  { value: 'adb', label: 'ADB', supported: false },
] as const;

/**
 * 获取数据库类型的显示标签
 */
export function getDbTypeLabel(dbType: string): string {
  return DB_TYPE_LABELS[dbType] || dbType;
}

/**
 * 检查数据库类型是否支持
 */
export function isDbTypeSupported(dbType: string): boolean {
  const option = DB_TYPE_OPTIONS.find((opt) => opt.value === dbType);
  return option?.supported ?? false;
}
