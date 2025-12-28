import { z } from 'zod';

/**
 * Schema for statement type validation
 * Must match the allowed types in the database enum
 * Note: StatementType is already defined in types/statement.ts
 */
export const statementTypeSchema = z.enum(['select', 'update', 'delete'], {
  errorMap: () => ({ message: '语句类型必须是 select、update 或 delete' }),
});

/**
 * Schema for creating a new SQL request
 */
export const createRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  statements: z.array(
    z.object({
      sql: z.string().min(1),
      clusterId: z.string().min(1),
      dbType: z.enum(['polardb_mysql', 'redis', 'adb']),
      code: z.string().min(1),
      orderIndex: z.number().int().min(0),
    })
  ).min(1),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

/**
 * Schema for updating a SQL request
 */
export const updateRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  statements: z.array(
    z.object({
      sql: z.string().min(1),
      clusterId: z.string().min(1),
      dbType: z.enum(['polardb_mysql', 'redis', 'adb']),
      code: z.string().min(1),
      orderIndex: z.number().int().min(0),
    })
  ).min(1).optional(),
});

export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

/**
 * Schema for approval action
 */
export const approvalActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES']),
  comment: z.string().max(1000).nullable().optional(),
});

export type ApprovalActionInput = z.infer<typeof approvalActionSchema>;
