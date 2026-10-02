import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';
import { LoginDto } from './login.dto';

function messagesFor(dto: object): string[] {
  return validateSync(dto).flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('password policy', () => {
  function changeTo(newPassword: unknown) {
    return plainToInstance(ChangePasswordDto, { currentPassword: 'OldPass123', newPassword });
  }

  it('accepts a password with letters and digits at the minimum length', () => {
    expect(messagesFor(changeTo('Passw0rd12'))).toHaveLength(0);
  });

  it('rejects a password that is too short', () => {
    expect(messagesFor(changeTo('Pass123'))).toContain(
      'newPassword must be at least 10 characters long',
    );
  });

  it('rejects a password with no digit', () => {
    expect(messagesFor(changeTo('PasswordOnly'))).toContain(
      'newPassword must contain at least one letter and one number',
    );
  });

  it('rejects a password with no letter', () => {
    expect(messagesFor(changeTo('1234567890'))).toContain(
      'newPassword must contain at least one letter and one number',
    );
  });

  it('rejects a password beyond the maximum length', () => {
    expect(messagesFor(changeTo(`${'a'.repeat(130)}1`))).toContain(
      'newPassword must not exceed 128 characters',
    );
  });

  it('names the property it is applied to', () => {
    const messages = messagesFor(changeTo('short'));
    expect(messages.every((message) => message.startsWith('newPassword'))).toBe(true);
  });
});

describe('LoginDto', () => {
  it('lower-cases and trims the email before validation', () => {
    const dto = plainToInstance(LoginDto, { email: '  Admin@Gym.Local ', password: 'secret' });

    expect(messagesFor(dto)).toHaveLength(0);
    expect(dto.email).toBe('admin@gym.local');
  });

  it('rejects a malformed email', () => {
    const dto = plainToInstance(LoginDto, { email: 'not-an-email', password: 'secret' });
    expect(messagesFor(dto)).toContain('email must be a valid email address');
  });

  it('rejects an empty password', () => {
    const dto = plainToInstance(LoginDto, { email: 'a@gym.local', password: '' });
    expect(messagesFor(dto)).toContain('password should not be empty');
  });

  it('does not apply the strong-password policy to login', () => {
    const dto = plainToInstance(LoginDto, { email: 'a@gym.local', password: 'weak' });
    expect(messagesFor(dto)).toHaveLength(0);
  });
});
