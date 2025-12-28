'use client';

import { useState, useCallback, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { validateSql, type ValidationResult } from '@sql-ops/shared';
import { SqlEditor } from './sql-editor';
import { ValidationFeedback } from './validation-feedback';
import { PrecheckConfig, type PrecheckItem } from './precheck-config';
import { TemplateSelector } from './template-selector';
import { updateRequest } from '@/app/(dashboard)/requests/[id]/edit/actions';
import type { TemplateOption } from '@/lib/queries/templates';

interface RequestEditFormProps {
  requestId: string;
  initialTitle: string;
  initialDescription: string;
  initialSqlRaw: string;
  initialPrechecks: PrecheckItem[];
  targetDisplayName: string;
  dbType: string;
  clusterName: string;
  clusterRegion: string | null;
  templates: TemplateOption[];
}

export function RequestEditForm({
  requestId,
  initialTitle,
  initialDescription,
  initialSqlRaw,
  initialPrechecks,
  targetDisplayName,
  dbType,
  clusterName,
  clusterRegion,
  templates,
}: RequestEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form state
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [sqlRaw, setSqlRaw] = useState(initialSqlRaw);
  const [prechecks, setPrechecks] = useState<PrecheckItem[]>(initialPrechecks);

  // Validation state
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationTimeout, setValidationTimeout] =
    useState<ReturnType<typeof setTimeout> | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Track if SQL has changed
  const sqlChanged = sqlRaw !== initialSqlRaw;

  // Debounced validation
  const runValidation = useCallback((sql: string) => {
    if (!sql.trim()) {
      setValidationResult(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);

    // Clear existing timeout
    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }

    // Debounce validation
    const timeout = setTimeout(() => {
      try {
        const result = validateSql(sql);
        setValidationResult(result);

        // Initialize prechecks for statements that need them
        const writeStatements = result.statements.filter(
          (s) => s.requiresPrecheck
        );
        setPrechecks((prev) => {
          const newPrechecks: PrecheckItem[] = [];
          for (const stmt of writeStatements) {
            const existing = prev.find(
              (p) => p.statementIndex === stmt.index
            );
            if (existing) {
              newPrechecks.push(existing);
            } else {
              newPrechecks.push({
                statementIndex: stmt.index,
                precheckSql: stmt.suggestedPrecheck || '',
                expectedRows: null,
              });
            }
          }
          return newPrechecks;
        });
      } catch (e) {
        setValidationResult({
          valid: false,
          statements: [],
          errors: [
            `验证错误：${e instanceof Error ? e.message : '未知错误'}`,
          ],
          warnings: [],
        });
      }
      setIsValidating(false);
    }, 300);

    setValidationTimeout(timeout);
  }, [validationTimeout]);

  // Run initial validation
  useEffect(() => {
    runValidation(sqlRaw);
    return () => {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sqlRaw]);

  // Handle template selection
  const handleTemplateSelect = (template: TemplateOption) => {
    setSqlRaw(template.sqlText);
  };

  // Form validation
  const isFormValid = () => {
    if (!title.trim()) return false;
    if (!sqlRaw.trim()) return false;
    if (!validationResult?.valid) return false;

    // Check that all precheck SQLs are filled for write operations
    const writeStatements =
      validationResult?.statements.filter((s) => s.requiresPrecheck) || [];
    for (const stmt of writeStatements) {
      const precheck = prechecks.find((p) => p.statementIndex === stmt.index);
      if (!precheck?.precheckSql.trim()) return false;
    }

    return true;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isFormValid()) {
      setError('请填写所有必填字段并修复验证错误。');
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('title', title);
        formData.set('description', description);
        formData.set('sqlRaw', sqlRaw);
        formData.set('prechecks', JSON.stringify(prechecks));
        formData.set(
          'validationResult',
          JSON.stringify(validationResult)
        );

        const result = await updateRequest(requestId, formData);

        if (result.success) {
          router.push(`/requests/${requestId}`);
          router.refresh();
        } else {
          setError(result.error || '更新请求失败');
        }
      } catch (e) {
        setError(
          `发生错误：${e instanceof Error ? e.message : '未知错误'}`
        );
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Error display */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm text-red-800">{error}</span>
          </div>
        </div>
      )}

      {/* SQL Changed Warning */}
      {sqlChanged && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm text-blue-800">
              SQL 内容已修改。保存时将创建新版本。
            </span>
          </div>
        </div>
      )}

      {/* Title */}
      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium text-gray-700"
        >
          标题 <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPending}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          placeholder="简要描述此 SQL 的用途"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-gray-700"
        >
          描述
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isPending}
          rows={3}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          placeholder="附加说明或解释（可选）"
        />
      </div>

      {/* Target (read-only) */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-gray-700">
          目标数据库
        </h3>
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-sm font-medium text-gray-900">
                {clusterName}
              </span>
              {clusterRegion && (
                <span className="ml-2 text-sm text-gray-500">
                  ({clusterRegion})
                </span>
              )}
            </div>
            <div className="text-sm text-gray-600">
              {targetDisplayName}
            </div>
            <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
              {dbType}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            创建后无法更改目标数据库。
          </p>
        </div>
      </div>

      {/* SQL Editor */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">
            SQL <span className="text-red-500">*</span>
          </h3>
          <TemplateSelector
            templates={templates}
            dbType={dbType}
            onSelect={handleTemplateSelect}
            disabled={isPending}
          />
        </div>
        <SqlEditor
          value={sqlRaw}
          onChange={setSqlRaw}
          disabled={isPending}
          placeholder="在此输入 SQL 语句..."
        />
      </div>

      {/* Validation feedback */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-gray-700">
          验证结果
        </h3>
        <ValidationFeedback
          result={validationResult}
          isValidating={isValidating}
        />
      </div>

      {/* Precheck configuration */}
      {validationResult?.valid &&
        validationResult.statements.some((s) => s.requiresPrecheck) && (
          <div>
            <PrecheckConfig
              statements={validationResult.statements}
              prechecks={prechecks}
              onChange={setPrechecks}
              disabled={isPending}
            />
          </div>
        )}

      {/* Submit button */}
      <div className="flex items-center justify-end gap-4 border-t pt-6">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isPending}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isPending || !isFormValid()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? '保存中...' : sqlChanged ? '保存并创建新版本' : '保存更改'}
        </button>
      </div>
    </form>
  );
}
