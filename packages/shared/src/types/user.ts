/**
 * User roles in the system
 */
export type UserRole = 'PENDING' | 'USER' | 'ADMIN';

/**
 * User entity
 */
export interface User {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}
