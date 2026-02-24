import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import type { AuthenticatedRequest } from '../auth.types';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.authService.extractSessionToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const session = await this.authService.resolveSession(token);

    if (!session) {
      throw new UnauthorizedException('Session is invalid or expired');
    }

    request.auth = session;
    return true;
  }
}
