import { getDb } from '@/db';
import { profiles } from '@/db/schema';
import { desc, eq, or, ilike, and, count, SQL } from 'drizzle-orm';

export type UserRole = 'PENDING' | 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;
  activatedBy: string | null;
}

export interface UserFilters {
  role?: UserRole | null;
  status?: UserStatus | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export interface PaginatedUsers {
  users: UserProfile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get all users with filtering and pagination
 */
export async function getUsers(filters: UserFilters = {}): Promise<PaginatedUsers> {
  const { role, status, search, page = 1, pageSize = 20 } = filters;
  const offset = (page - 1) * pageSize;

  // Build where conditions
  const conditions: SQL<unknown>[] = [];

  if (role) {
    conditions.push(eq(profiles.role, role));
  }

  if (status) {
    conditions.push(eq(profiles.status, status));
  }

  if (search?.trim()) {
    const searchTerm = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(profiles.email, searchTerm),
        ilike(profiles.displayName, searchTerm)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [countResult] = await getDb()
    .select({ count: count() })
    .from(profiles)
    .where(whereClause);

  const total = countResult?.count ?? 0;

  // Get users
  const users = await getDb()
    .select({
      id: profiles.id,
      email: profiles.email,
      displayName: profiles.displayName,
      role: profiles.role,
      status: profiles.status,
      createdAt: profiles.createdAt,
      updatedAt: profiles.updatedAt,
      activatedAt: profiles.activatedAt,
      activatedBy: profiles.activatedBy,
    })
    .from(profiles)
    .where(whereClause)
    .orderBy(desc(profiles.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    users: users as UserProfile[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get a single user by ID
 */
export async function getUserById(userId: string): Promise<UserProfile | null> {
  const [user] = await getDb()
    .select({
      id: profiles.id,
      email: profiles.email,
      displayName: profiles.displayName,
      role: profiles.role,
      status: profiles.status,
      createdAt: profiles.createdAt,
      updatedAt: profiles.updatedAt,
      activatedAt: profiles.activatedAt,
      activatedBy: profiles.activatedBy,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  return user as UserProfile | null;
}
