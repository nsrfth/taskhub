import { api } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  globalRole: 'ADMIN' | 'MEMBER';
  // Phase 2A: non-null when the account is owned by a Directory (LDAP/SCIM).
  // Frontend uses this to hide "change password" + similar local-only actions.
  directoryId: string | null;
  externalId: string | null;
  // Phase 2C: surfaced so Settings → Security can show the right state
  // without an extra round-trip on render.
  totpEnabled: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

// /auth/login may instead return this pending-2FA challenge when the user
// has TOTP enabled. The frontend keeps `pendingToken` in memory and posts
// it back to /auth/2fa/login with a TOTP or recovery code.
export interface PendingTwoFactorResponse {
  pending2fa: true;
  pendingToken: string;
}

export type LoginResult = AuthResponse | PendingTwoFactorResponse;

export function isPending2fa(result: LoginResult): result is PendingTwoFactorResponse {
  return (result as PendingTwoFactorResponse).pending2fa === true;
}

export async function register(input: { email: string; name: string; password: string }): Promise<AuthResponse> {
  return (await api.post<AuthResponse>('/auth/register', input)).data;
}

export async function login(input: { email: string; password: string }): Promise<LoginResult> {
  return (await api.post<LoginResult>('/auth/login', input)).data;
}

export async function loginTwoFactor(input: { pendingToken: string; code: string }): Promise<AuthResponse> {
  return (await api.post<AuthResponse>('/auth/2fa/login', input)).data;
}

// 2FA management (require an authenticated session) -----------------------
export interface TwoFactorSetup {
  secret: string;
  uri: string;
  qrDataUrl: string;
}

export async function twoFactorSetup(): Promise<TwoFactorSetup> {
  return (await api.post<TwoFactorSetup>('/auth/2fa/setup')).data;
}

export async function twoFactorConfirm(input: { secret: string; code: string }): Promise<{ recoveryCodes: string[] }> {
  return (await api.post<{ recoveryCodes: string[] }>('/auth/2fa/confirm', input)).data;
}

export async function twoFactorDisable(code: string): Promise<void> {
  await api.post('/auth/2fa/disable', { code });
}

export async function regenerateRecoveryCodes(): Promise<{ recoveryCodes: string[] }> {
  return (await api.post<{ recoveryCodes: string[] }>('/auth/2fa/recovery-codes')).data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function refresh(): Promise<AuthResponse> {
  return (await api.post<AuthResponse>('/auth/refresh')).data;
}
