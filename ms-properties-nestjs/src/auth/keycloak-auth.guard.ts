import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppRole, ROLES_KEY, toAuthUser } from './auth-user';

const PUBLIC_METHODS = ['GET', 'HEAD', 'OPTIONS'];

@Injectable()
export class KeycloakAuthGuard implements CanActivate {
  private readonly issuer = process.env.KEYCLOAK_ISSUER_URI || 'http://localhost:8080/realms/habitat';
  private readonly jwks = createRemoteJWKSet(new URL(`${this.issuer}/protocol/openid-connect/certs`));

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    const requiresAuth = !!requiredRoles || !PUBLIC_METHODS.includes(request.method);

    const header: string = request.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      if (!requiresAuth) return true;
      throw new UnauthorizedException('Falta el token de Keycloak (Authorization: Bearer ...)');
    }

    try {
      const { payload } = await jwtVerify(header.slice(7), this.jwks, { issuer: this.issuer });
      request.user = toAuthUser(payload);
    } catch {
      if (!requiresAuth) return true;
      throw new UnauthorizedException('Token de Keycloak inválido o expirado');
    }

    if (requiredRoles && !requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException(`Tu rol (${request.user.role}) no puede realizar esta acción`);
    }
    return true;
  }
}
