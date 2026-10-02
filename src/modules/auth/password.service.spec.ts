import { PasswordService } from './password.service';
import type { AppConfigService } from '../../config/configuration';

describe('PasswordService', () => {
  const service = new PasswordService({ bcryptRounds: 4 } as AppConfigService);

  it('produces a bcrypt hash that is not the plaintext', async () => {
    const hash = await service.hash('StrongPass123');

    expect(hash).not.toBe('StrongPass123');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([
      service.hash('StrongPass123'),
      service.hash('StrongPass123'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifies a correct password', async () => {
    const hash = await service.hash('StrongPass123');
    await expect(service.verify('StrongPass123', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('StrongPass123');
    await expect(service.verify('WrongPass123', hash)).resolves.toBe(false);
  });

  it('rejects a password that differs only in case', async () => {
    const hash = await service.hash('StrongPass123');
    await expect(service.verify('strongpass123', hash)).resolves.toBe(false);
  });

  it('burns timing without throwing', async () => {
    await expect(service.burnTiming()).resolves.toBeUndefined();
  });

  it('uses the configured cost factor', async () => {
    const expensive = new PasswordService({ bcryptRounds: 6 } as AppConfigService);
    const hash = await expensive.hash('StrongPass123');
    expect(hash).toContain('$06$');
  });
});
