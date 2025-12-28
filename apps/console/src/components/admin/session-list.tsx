'use client';

import type { SessionInfo } from '@/lib/executor/sessions';

interface SessionListProps {
  sessions: SessionInfo[];
  isLoading: boolean;
  onKill: (session: SessionInfo) => void;
}

function getTimeClass(time: number): string {
  if (time > 300) return 'text-red-600 font-bold'; // > 5 min
  if (time > 60) return 'text-orange-600 font-semibold'; // > 1 min
  if (time > 10) return 'text-yellow-600'; // > 10 sec
  return '';
}

export function SessionList({ sessions, isLoading, onKill }: SessionListProps) {
  if (isLoading && sessions.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <p className="text-gray-500">正在加载会话...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <p className="text-gray-500">未找到活跃会话。</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              用户
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              主机
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              数据库
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              命令
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              时间(秒)
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              状态
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              SQL
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              来源
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {sessions.map((session, index) => (
            <tr
              key={`${session.id}-${index}`}
              className={`hover:bg-gray-50 ${session.isSystemOwned ? 'bg-blue-50' : ''}`}
            >
              <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-900">
                {session.id}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {session.user}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {session.host}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {session.db || '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {session.command}
              </td>
              <td
                className={`whitespace-nowrap px-4 py-3 text-sm ${getTimeClass(session.time)}`}
              >
                {session.time}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {session.state || '-'}
              </td>
              <td className="max-w-xs px-4 py-3 text-sm text-gray-500">
                <div
                  className="truncate font-mono text-xs"
                  title={session.info || ''}
                >
                  {session.info || '-'}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm">
                {session.isSystemOwned ? (
                  <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                    系统
                  </span>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <button
                  onClick={() => onKill(session)}
                  className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                >
                  终止
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
