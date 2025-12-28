import { getSecurityStatus } from './actions';
import { SecuritySettingsContent } from '@/components/settings/security-settings-content';

export default async function SecuritySettingsPage() {
  const status = await getSecurityStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">安全设置</h1>
        <p className="mt-1 text-sm text-gray-500">
          管理您的账户安全和双因素认证设置。
        </p>
      </div>

      <SecuritySettingsContent status={status} />
    </div>
  );
}
