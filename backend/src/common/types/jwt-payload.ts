export type Role = 'super_admin' | 'pharmacy_admin' | 'manager' | 'salesman';

export interface JwtPayload {
  sub: number; // user id
  role: Role;
  pharmacyId: number | null; // null for super_admin
}

// What ends up on request.user after JwtStrategy.validate()
export type AuthUser = JwtPayload;
