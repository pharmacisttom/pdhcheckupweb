import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ find: vi.fn(), cookie: vi.fn() }));
vi.mock('../../src/lib/db', () => ({ db: { session: { findUnique: state.find } } }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: state.cookie }), headers: async () => new Headers() }));
import { session, permitted } from '../../src/lib/security';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('session authorization boundaries', () => {
  it('rejects missing cookies without querying private records', async () => {
    state.cookie.mockReturnValue(undefined);
    expect(await session(false)).toBeNull();
    expect(state.find).not.toHaveBeenCalled();
    await expect(session()).rejects.toMatchObject({ status: 401 });
  });
  it('rejects expired sessions', async () => {
    state.cookie.mockReturnValue({ value: 'synthetic-test-token' });
    state.find.mockResolvedValue({ expiresAt: new Date(0) });
    await expect(session()).rejects.toMatchObject({ status: 401 });
  });
  it('rejects disabled staff and production staff without MFA', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    state.cookie.mockReturnValue({ value: 'synthetic-test-token' });
    for (const user of [{ active: false, mfaSecret: 'encrypted' }, { active: true, mfaSecret: null }]) {
      state.find.mockResolvedValue({ stage: 'full', userId: 'staff', user, expiresAt: new Date(Date.now() + 60000) });
      expect(await session(false)).toBeNull();
    }
  });
  it('never treats onboarding or forced-password sessions as fully authenticated', async () => {
    state.cookie.mockReturnValue({ value: 'synthetic-test-token' });
    for (const stage of ['password', 'mfa', 'unknown', undefined]) {
      state.find.mockResolvedValue({ stage, userId: 'staff', user: { active: true, mfaSecret: 'encrypted' }, expiresAt: new Date(Date.now() + 60000) });
      expect(await session(false)).toBeNull();
    }
    for (const flag of ['activationRequired', 'mustChangePassword']) {
      state.find.mockResolvedValue({ stage: 'full', userId: 'staff', user: { active: true, mfaSecret: 'encrypted', [flag]: true }, expiresAt: new Date(Date.now() + 60000) });
      await expect(session()).rejects.toMatchObject({ status: 401 });
    }
  });
  it('accepts a live enrolled staff session and preserves superadmin permissions', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    state.cookie.mockReturnValue({ value: 'synthetic-test-token' });
    const active = { stage: 'full', userId: 'staff', user: { active: true, mfaSecret: 'encrypted' }, expiresAt: new Date(Date.now() + 60000) };
    state.find.mockResolvedValue(active);
    expect(await session()).toBe(active);
    expect(permitted('superadmin', 'packages:approve')).toBe(true);
    expect(permitted('registration', 'packages:approve')).toBe(false);
  });
});
