'use client';

import { useRef, useEffect, useMemo } from 'react';
import { EditorView, placeholder as placeholderExt } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { MySQL, sql } from '@codemirror/lang-sql';
import { linter, lintGutter } from '@codemirror/lint';
import { sqlLint } from '@/lib/sql-linter';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  /** Enable inline error highlighting with linter */
  enableLinting?: boolean;
}

/**
 * Create a debounced SQL linter for CodeMirror
 */
function createSqlLinter() {
  return linter(
    (view) => {
      const sql = view.state.doc.toString();
      return sqlLint(sql);
    },
    {
      delay: 300, // Debounce delay in ms
    }
  );
}

export function SqlEditor({
  value,
  onChange,
  placeholder = '在此输入 SQL 语句...',
  disabled = false,
  minHeight = 200,
  enableLinting = true,
}: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  // Keep onChange ref up to date
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Memoize the linter to prevent recreation
  const sqlLinterExtension = useMemo(() => createSqlLinter(), []);

  // Initialize CodeMirror
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const theme = EditorView.theme({
      '&': {
        fontSize: '14px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-scroller': {
        minHeight: `${minHeight}px`,
      },
      '.cm-content': {
        padding: '12px 0',
      },
      '.cm-line': {
        padding: '0 12px',
      },
      '.cm-gutters': {
        backgroundColor: '#f9fafb',
        color: '#9ca3af',
        border: 'none',
        borderRight: '1px solid #e5e7eb',
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#f3f4f6',
      },
      '.cm-activeLine': {
        backgroundColor: '#f9fafb',
      },
      // Lint styling - red wavy underline for errors
      '.cm-lintRange-error': {
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L1 2 L2 3 L3 2 L4 3 L5 2 L6 3' fill='none' stroke='%23dc2626' stroke-width='1'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'bottom',
        paddingBottom: '2px',
      },
      // Warning styling - orange wavy underline
      '.cm-lintRange-warning': {
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L1 2 L2 3 L3 2 L4 3 L5 2 L6 3' fill='none' stroke='%23f59e0b' stroke-width='1'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'bottom',
        paddingBottom: '2px',
      },
      // Lint gutter marker - red dot for errors
      '.cm-lint-marker-error': {
        content: '""',
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: '#dc2626',
        marginLeft: '4px',
      },
      // Warning marker - orange dot
      '.cm-lint-marker-warning': {
        content: '""',
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: '#f59e0b',
        marginLeft: '4px',
      },
      // Lint tooltip styling
      '.cm-tooltip-lint': {
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        padding: '8px 12px',
        fontSize: '13px',
        maxWidth: '400px',
      },
      '.cm-diagnostic': {
        padding: '4px 0',
        borderLeft: '3px solid',
        paddingLeft: '8px',
        marginBottom: '4px',
      },
      '.cm-diagnostic-error': {
        borderLeftColor: '#dc2626',
        color: '#991b1b',
      },
      '.cm-diagnostic-warning': {
        borderLeftColor: '#f59e0b',
        color: '#92400e',
      },
      '.cm-diagnosticSource': {
        fontSize: '11px',
        color: '#6b7280',
        marginLeft: '8px',
      },
      // Lint gutter styling
      '.cm-gutter-lint': {
        width: '16px',
      },
    });

    // Build extensions array
    const extensions = [
      basicSetup,
      sql({ dialect: MySQL }),
      updateListener,
      theme,
      placeholderExt(placeholder),
      EditorState.readOnly.of(disabled),
      EditorView.editable.of(!disabled),
    ];

    // Add linting extensions if enabled and not disabled
    if (enableLinting && !disabled) {
      extensions.push(sqlLinterExtension);
      extensions.push(lintGutter());
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minHeight, placeholder, disabled, enableLinting, sqlLinterExtension]);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (value !== currentValue) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 ${
        disabled ? 'cursor-not-allowed bg-gray-100 opacity-75' : ''
      }`}
    />
  );
}
