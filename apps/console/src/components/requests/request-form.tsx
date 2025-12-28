'use client';

import { useState, useCallback, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { validateSql, type ValidationResult } from '@sql-ops/shared';
import { MultiTargetSelector } from './multi-target-selector';
import { SqlEditor } from './sql-editor';
import { ValidationFeedback } from './validation-feedback';
import { PrecheckConfig, type PrecheckItem } from './precheck-config';
import { TemplateSelector } from './template-selector';
import { createRequest } from '@/app/(dashboard)/requests/new/actions';
import type { ClusterOption, DbTargetOption } from '@/lib/queries/targets';
import type { TemplateOption } from '@/lib/queries/templates';

export interface RequestFormInitialData {
  title: string;
  description: string | null;
  targetId: string;
  targetIds?: string[];
  sqlRaw: string;
}

interface RequestFormProps {
  clusters: Array<ClusterOption & { targets: DbTargetOption[] }>;
  templates: TemplateOption[];
  initialData?: RequestFormInitialData;
}

// Helper to find targets from clusters
function findTargetsById(
  clusters: Array<ClusterOption & { targets: DbTargetOption[] }>,
  targetIds: string[]
): DbTargetOption[] {
  const targets: DbTargetOption[] = [];
  for (const cluster of clusters) {
    for (const target of cluster.targets) {
      if (targetIds.includes(target.id)) {
        targets.push(target);
      }
    }
  }
  return targets;
}

export function RequestForm({ clusters, templates, initialData }: RequestFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Get initial target IDs - support both new multi-target and legacy single target
  const getInitialTargetIds = (): string[] => {
    if (initialData?.targetIds && initialData.targetIds.length > 0) {
      return initialData.targetIds;
    }
    if (initialData?.targetId) {
      return [initialData.targetId];
    }
    return [];
  };

  const initialTargetIds = getInitialTargetIds();
  const initialTargets = findTargetsById(clusters, initialTargetIds);

  // Form state - use initialData if provided
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [targetIds, setTargetIds] = useState<string[]>(initialTargetIds);
  const [selectedTargets, setSelectedTargets] = useState<DbTargetOption[]>(initialTargets);
  const [sqlRaw, setSqlRaw] = useState(initialData?.sqlRaw ?? '');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [prechecks, setPrechecks] = useState<PrecheckItem[]>([]);

  // Validation state
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationTimeout, setValidationTimeout] =
    useState<ReturnType<typeof setTimeout> | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

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

  // Run validation when SQL changes
  useEffect(() => {
    runValidation(sqlRaw);
    return () => {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sqlRaw]);

  // Handle target change (multi-select)
  const handleTargetsChange = (
    newTargetIds: string[],
    targets: DbTargetOption[]
  ) => {
    setTargetIds(newTargetIds);
    setSelectedTargets(targets);
  };

  // Handle template selection
  const handleTemplateSelect = (template: TemplateOption) => {
    setSqlRaw(template.sqlText);
    setSelectedTemplateId(template.id);
  };

  // Form validation
  const isFormValid = () => {
    if (!title.trim()) return false;
    if (targetIds.length === 0) return false;
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
        formData.set('targetIds', JSON.stringify(targetIds));
        formData.set('sqlRaw', sqlRaw);
        if (selectedTemplateId) {
          formData.set('templateId', selectedTemplateId);
        }
        formData.set('prechecks', JSON.stringify(prechecks));
        formData.set(
          'validationResult',
          JSON.stringify(validationResult)
        );

        const result = await createRequest(formData);

        if (result.success) {
          router.push(`/requests/${result.requestId}`);
        } else {
          setError(result.error || '创建请求失败');
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

      {/* Target selector */}
      <div>
        <MultiTargetSelector
          clusters={clusters}
          value={targetIds}
          onChange={handleTargetsChange}
          disabled={isPending}
        />
      </div>

      {/* SQL Editor */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">
            SQL <span className="text-red-500">*</span>
          </h3>
          <TemplateSelector
            templates={templates}
            dbType={selectedTargets[0]?.dbType || null}
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
          {isPending ? '创建中...' : '创建请求'}
        </button>
      </div>
    </form>
  );
}
