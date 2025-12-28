import { pgEnum } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['PENDING', 'USER', 'ADMIN']);

export const userStatus = pgEnum('user_status', ['ACTIVE', 'SUSPENDED']);

export const requestStatus = pgEnum('request_status', [
  'PENDING_APPROVAL',
  'CHANGES_REQUESTED',
  'REJECTED',
  'APPROVED',
  'APPROVAL_EXPIRED',
  'EXECUTING',
  'SUCCEEDED',
  'FAILED',
  'TERMINATED',
]);

export const statementType = pgEnum('statement_type', ['select', 'update', 'delete']);

export const statementStatus = pgEnum('statement_status', [
  'PENDING',
  'EXECUTING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED',
]);

export const executionStatus = pgEnum('execution_status', [
  'EXECUTING',
  'SUCCEEDED',
  'FAILED',
  'TERMINATED',
]);

export const approvalDecision = pgEnum('approval_decision', [
  'APPROVE',
  'REJECT',
  'CHANGES_REQUESTED',
]);

export const dbType = pgEnum('db_type', ['polardb_mysql', 'redis', 'adb']);
