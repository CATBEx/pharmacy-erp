import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../types/jwt-payload.js';

// Always read pharmacyId/role from here (the verified JWT), never from client-supplied
// route params or body fields -- that is what keeps one pharmacy's data from another's.
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as AuthUser;
});
