'use client';

import type { StatementValidation } from '@sql-ops/shared';

interface PrecheckItem {
  statementIndex: number;
  precheckSql: string;
  expectedRows: number | null;
}

interface PrecheckConfigProps {
  statements: StatementValidation[];
  prechecks: PrecheckItem[];
  onChange: (prechecks: PrecheckItem[]) => void;
  disabled?: boolean;
}

export function PrecheckConfig({
  statements,
  prechecks,
  onChange,
  disabled = false,
}: PrecheckConfigProps) {
  const writeStatements = statements.filter((s) => s.requiresPrecheck);

  if (writeStatements.length === 0) {
    return null;
  }

  const updatePrecheck = (
    index: number,
    field: 'precheckSql' | 'expectedRows',
    value: string | number | null
  ) => {
    const newPrechecks = [...prechecks];
    const existingIndex = newPrechecks.findIndex(
      (p) => p.statementIndex === index
    );

    if (existingIndex >= 0) {
      if (field === 'precheckSql') {
        newPrechecks[existingIndex] = {
          ...newPrechecks[existingIndex],
          precheckSql: value as string,
        };
      } else {
        newPrechecks[existingIndex] = {
          ...newPrechecks[existingIndex],
          expectedRows: value as number | null,
        };
      }
    } else {
      newPrechecks.push({
        statementIndex: index,
        precheckSql:
          field === 'precheckSql'
            ? (value as string)
            : statements[index]?.suggestedPrecheck || '',
        expectedRows: field === 'expectedRows' ? (value as number | null) : null,
      });
    }

    onChange(newPrechecks);
  };

  const getPrecheck = (index: number): PrecheckItem => {
    return (
      prechecks.find((p) => p.statementIndex === index) || {
        statementIndex: index,
        precheckSql: statements[index]?.suggestedPrecheck || '',
        expectedRows: null,
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
        <h3 className="text-sm font-medium text-yellow-800">
          需要配置预检查
        </h3>
        <p className="mt-1 text-sm text-yellow-700">
          写操作（UPDATE/DELETE）需要预检查 SQL 来验证执行前受影响的行数。
        </p>
      </div>

      {writeStatements.map((stmt) => {
        const precheck = getPrecheck(stmt.index);
        const sqlPreview =
          stmt.sql.length > 100 ? stmt.sql.substring(0, 100) + '...' : stmt.sql;

        return (
          <div
            key={stmt.index}
            className="rounded-md border border-gray-200 bg-white p-4"
          >
            <div className="mb-3">
              <span
                className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                  stmt.type === 'update'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                #{stmt.index + 1} {stmt.type.toUpperCase()}
              </span>
            </div>

            <div className="mb-4 rounded bg-gray-50 p-2 font-mono text-xs text-gray-700">
              {sqlPreview}
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor={`precheck-sql-${stmt.index}`}
                  className="block text-sm font-medium text-gray-700"
                >
                  预检查 SQL
                </label>
                <p className="mb-1 text-xs text-gray-500">
                  此 SELECT 查询将首先执行以统计受影响的行数。
                </p>
                <textarea
                  id={`precheck-sql-${stmt.index}`}
                  value={precheck.precheckSql}
                  onChange={(e) =>
                    updatePrecheck(stmt.index, 'precheckSql', e.target.value)
                  }
                  disabled={disabled}
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="SELECT COUNT(*) FROM table WHERE condition"
                />
              </div>

              <div>
                <label
                  htmlFor={`expected-rows-${stmt.index}`}
                  className="block text-sm font-medium text-gray-700"
                >
                  预期行数（可选）
                </label>
                <p className="mb-1 text-xs text-gray-500">
                  如果指定，当预检查行数不匹配时执行将失败。
                </p>
                <input
                  id={`expected-rows-${stmt.index}`}
                  type="number"
                  min="0"
                  value={precheck.expectedRows ?? ''}
                  onChange={(e) =>
                    updatePrecheck(
                      stmt.index,
                      'expectedRows',
                      e.target.value ? parseInt(e.target.value, 10) : null
                    )
                  }
                  disabled={disabled}
                  className="mt-1 block w-40 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="例如：5"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type { PrecheckItem };
