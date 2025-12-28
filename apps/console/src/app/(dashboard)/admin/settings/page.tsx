import { requireAdmin } from '@/lib/auth';
import { getSystemSettings } from '@/lib/queries/system-settings';
import { TotpSettingsCard } from '@/components/admin/totp-settings-card';

export default async function AdminSettingsPage() {
  await requireAdmin();

  const settings = await getSystemSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">系统设置</h1>
        <p className="mt-1 text-sm text-gray-500">
          管理系统全局配置和安全设置。
        </p>
      </div>

      <div className="grid gap-6">
        <TotpSettingsCard totpEnabled={settings.totpEnabled} />
      </div>
    </div>
  );
}
