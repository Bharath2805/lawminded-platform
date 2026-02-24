import type { Request } from 'express';

export type AuthenticatedUser = {
  id: string;
  email: string;
  roles: string[];
};

export type AuthenticatedSession = {
  sessionId: string;
  user: AuthenticatedUser;
  expiresAt: Date;
};

export type AuthenticatedRequest = Request & {
  auth?: AuthenticatedSession;
};

export type SessionRequestMeta = {
  ip: string | null;
  userAgent: string | null;
};
