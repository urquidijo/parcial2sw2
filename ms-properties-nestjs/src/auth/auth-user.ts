import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

// Rol efectivo: ADMIN, CLIENTE o, para EMPLEADO, su sector.
export type AppRole = 'CLIENTE' | 'ADMIN' | 'AGENTE' | 'LEGAL' | 'FINANZAS' | 'ATENCION';

export interface AuthUser {
  id: string;
  email?: string;
  name: string;
  role: AppRole;
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined => context.switchToHttp().getRequest().user,
);

export function toAuthUser(payload: Record<string, any>): AuthUser {
  const realmRoles: string[] = payload?.realm_access?.roles ?? [];
  let role: AppRole = 'CLIENTE';
  if (realmRoles.includes('ADMIN')) role = 'ADMIN';
  else if (realmRoles.includes('EMPLEADO')) role = payload.sector as AppRole;
  return { id: payload.sub, email: payload.email, name: payload.name || payload.email || 'Usuario', role };
}
