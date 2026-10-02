import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateMemberDto } from './create-member.dto';
import { AssignTrainerDto } from './assign-trainer.dto';

function fieldsWithErrors(dto: object): string[] {
  return validateSync(dto).map((error) => error.property);
}

const UUID = '0b5f8a2e-0000-4000-8000-000000000000';

describe('CreateMemberDto', () => {
  describe('create-account mode', () => {
    const complete = {
      email: '  Mia@Gym.LOCAL ',
      password: 'MemberPass1',
      firstName: ' Mia ',
      lastName: ' Member ',
    };

    it('accepts full account details and normalizes them', () => {
      const dto = plainToInstance(CreateMemberDto, complete);

      expect(fieldsWithErrors(dto)).toHaveLength(0);
      expect(dto.email).toBe('mia@gym.local');
      expect(dto.firstName).toBe('Mia');
      expect(dto.lastName).toBe('Member');
    });

    it('requires every account field when no userId is given', () => {
      const dto = plainToInstance(CreateMemberDto, {});

      expect(fieldsWithErrors(dto)).toEqual(
        expect.arrayContaining(['email', 'password', 'firstName', 'lastName']),
      );
    });

    it('applies the shared password policy', () => {
      const dto = plainToInstance(CreateMemberDto, { ...complete, password: 'weak' });
      expect(fieldsWithErrors(dto)).toContain('password');
    });

    it('rejects a malformed email', () => {
      const dto = plainToInstance(CreateMemberDto, { ...complete, email: 'nope' });
      expect(fieldsWithErrors(dto)).toContain('email');
    });
  });

  describe('link-account mode', () => {
    it('accepts a userId alone', () => {
      const dto = plainToInstance(CreateMemberDto, { userId: UUID });
      expect(fieldsWithErrors(dto)).toHaveLength(0);
    });

    it('rejects a userId that is not a UUID', () => {
      const dto = plainToInstance(CreateMemberDto, { userId: 'not-a-uuid' });
      expect(fieldsWithErrors(dto)).toContain('userId');
    });
  });

  describe('profile fields', () => {
    const base = { userId: UUID };

    it('accepts an ISO date of birth', () => {
      const dto = plainToInstance(CreateMemberDto, { ...base, dateOfBirth: '1995-04-17' });
      expect(fieldsWithErrors(dto)).toHaveLength(0);
    });

    it('rejects a non-ISO date of birth', () => {
      const dto = plainToInstance(CreateMemberDto, { ...base, dateOfBirth: '17/04/1995' });
      expect(fieldsWithErrors(dto)).toContain('dateOfBirth');
    });

    it('rejects an unknown gender', () => {
      const dto = plainToInstance(CreateMemberDto, { ...base, gender: 'UNSPECIFIED' });
      expect(fieldsWithErrors(dto)).toContain('gender');
    });

    it('accepts every valid gender', () => {
      for (const gender of ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']) {
        const dto = plainToInstance(CreateMemberDto, { ...base, gender });
        expect(fieldsWithErrors(dto)).toHaveLength(0);
      }
    });

    it('caps staff notes', () => {
      const dto = plainToInstance(CreateMemberDto, { ...base, notes: 'x'.repeat(2001) });
      expect(fieldsWithErrors(dto)).toContain('notes');
    });
  });
});

describe('AssignTrainerDto', () => {
  it('accepts a trainer id', () => {
    const dto = plainToInstance(AssignTrainerDto, { trainerId: UUID });
    expect(fieldsWithErrors(dto)).toHaveLength(0);
  });

  it('accepts an explicit null to unassign', () => {
    const dto = plainToInstance(AssignTrainerDto, { trainerId: null });
    expect(fieldsWithErrors(dto)).toHaveLength(0);
  });

  it('rejects a non-UUID trainer id', () => {
    const dto = plainToInstance(AssignTrainerDto, { trainerId: 'nope' });
    expect(fieldsWithErrors(dto)).toContain('trainerId');
  });
});
