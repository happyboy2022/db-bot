'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { TargetSelector } from './target-selector';
import { previewImportFile, importFromFile } from '@/app/(dashboard)/requests/import/actions';
import type { ClusterOption, DbTargetOption } from '@/lib/queries/targets';

interface ImportFormProps {
  clusters: Array<ClusterOption & { targets: DbTargetOption[] }>;
}

interface PreviewData {
  requests: Array<{
    originalId: string;
    title: string;
    statementCount: number;
    hasWriteOperations: boolean;
    originalStatus: string;
    validationErrors: string[];
  }>;
  totalCount: number;
  validCount: number;
  invalidCount: number;
}

export function ImportForm({ clusters }: ImportFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setPreview(null);
    setFileName(file.name);

    try {
      const content = await file.text();
      setFileContent(content);

      // Preview the import
      setIsLoading(true);
      const result = await previewImportFile(content);

      if (result.success && result.preview) {
        setPreview(result.preview);
      } else {
        setError(result.error || '预览文件失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取文件失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!fileContent || !targetId) {
      setError('请选择文件和目标数据库');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const result = await importFromFile(fileContent, targetId);

      if (result.success && result.result) {
        if (result.result.successCount > 0) {
          router.push('/requests');
        } else {
          setError('未导入任何请求。请检查文件内容。');
        }
      } else {
        setError(result.error || '导入失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setFileContent(null);
    setFileName(null);
    setPreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-medium text-gray-900">
          1. 选择导入文件
        </h3>

        <div className="space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
              id="import-file"
            />
            <label
              htmlFor="import-file"
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              选择 JSON 文件
            </label>

            {fileName && (
              <span className="ml-3 text-sm text-gray-600">
                {fileName}
                <button
                  type="button"
                  onClick={handleReset}
                  className="ml-2 text-red-600 hover:text-red-500"
                >
                  移除
                </button>
              </span>
            )}
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              正在分析文件...
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-medium text-gray-900">
            2. 预览导入内容
          </h3>

          <div className="mb-4 flex gap-4 text-sm">
            <span className="rounded-full bg-gray-100 px-3 py-1">
              总计：{preview.totalCount}
            </span>
            <span className="rounded-full bg-green-100 px-3 py-1 text-green-800">
              有效：{preview.validCount}
            </span>
            {preview.invalidCount > 0 && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-red-800">
                无效：{preview.invalidCount}
              </span>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    标题
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    语句数
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    类型
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    状态
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {preview.requests.map((req) => (
                  <tr
                    key={req.originalId}
                    className={
                      req.validationErrors.length > 0 ? 'bg-red-50' : ''
                    }
                  >
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {req.title}
                      {req.validationErrors.length > 0 && (
                        <p className="text-xs text-red-600">
                          {req.validationErrors.join(', ')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {req.statementCount}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {req.hasWriteOperations ? (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                          写操作
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-800">
                          只读
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {req.validationErrors.length === 0 ? (
                        <span className="text-green-600">有效</span>
                      ) : (
                        <span className="text-red-600">无效</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Target Selection */}
      {preview && preview.validCount > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-medium text-gray-900">
            3. 选择目标数据库
          </h3>
          <p className="mb-4 text-sm text-gray-600">
            所有导入的请求将创建到此目标数据库。
          </p>
          <TargetSelector
            clusters={clusters}
            value={targetId}
            onChange={(id) => setTargetId(id)}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Actions */}
      {preview && preview.validCount > 0 && targetId && (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={isImporting}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {isImporting ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                导入中...
              </>
            ) : (
              `导入 ${preview.validCount} 个请求`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
