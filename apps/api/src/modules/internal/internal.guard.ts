import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { DomainException } from '../../common/http';

@Injectable()
export class InternalAgentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const authorization = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>().headers.authorization;
    const expected = process.env.INTERNAL_AGENT_TOKEN;
    const received = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!expected || !received) throw new DomainException(401, 'INTERNAL_UNAUTHORIZED', 'Internal API token is required.');
    const left = Buffer.from(received);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new DomainException(401, 'INTERNAL_UNAUTHORIZED', 'Internal API token is invalid.');
    }
    return true;
  }
}

