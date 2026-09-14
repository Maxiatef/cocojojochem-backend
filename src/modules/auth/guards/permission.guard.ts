import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No @RequirePermission on the route: this guard has nothing to say.
    // JwtAuthGuard still decides whether the caller is authenticated.
    if (!permission) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Not authenticated');

    // Permissions are attached by JwtStrategy.validate from the role row that
    // was read on this request, so no extra query is needed and a permission
    // edit takes effect immediately. Only a strict `true` grants.
    if (user.permissions?.[permission] !== true) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
    return true;
  }
}
