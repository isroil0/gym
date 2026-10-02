import { Gender, ProfileStatus, UserStatus } from '@prisma/client';
import { MemberResponseDto, type MemberWithRelations } from './member-response.dto';

function makeMember(overrides: Partial<MemberWithRelations> = {}): MemberWithRelations {
  return {
    id: 'member-1',
    userId: 'user-1',
    memberNumber: 42,
    dateOfBirth: new Date('1995-04-17'),
    gender: Gender.FEMALE,
    address: '12 Queen Street',
    emergencyContactName: 'Jane',
    emergencyContactPhone: '+15550199',
    notes: 'Prefers morning sessions. Behind on payment.',
    joinedAt: new Date('2026-01-15'),
    status: ProfileStatus.ACTIVE,
    archivedAt: null,
    assignedTrainerId: 'trainer-1',
    assignedAt: new Date('2026-02-01'),
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-02-01'),
    user: {
      id: 'user-1',
      email: 'mia@gym.test',
      passwordHash: 'super-secret-hash',
      role: 'MEMBER',
      status: UserStatus.ACTIVE,
      firstName: 'Mia',
      lastName: 'Member',
      phone: '+15550100',
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    assignedTrainer: {
      id: 'trainer-1',
      userId: 'user-2',
      trainerNumber: 3,
      specialization: 'Strength',
      bio: null,
      certifications: null,
      compensationType: 'NONE',
      monthlySalary: null,
      commissionRate: null,
      hiredAt: new Date(),
      status: ProfileStatus.ACTIVE,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user-2',
        email: 'tina@gym.test',
        passwordHash: 'another-secret',
        role: 'TRAINER',
        status: UserStatus.ACTIVE,
        firstName: 'Tina',
        lastName: 'Trainer',
        phone: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    ...overrides,
  };
}

describe('MemberResponseDto', () => {
  it('formats the member and trainer codes', () => {
    const dto = MemberResponseDto.from(makeMember());

    expect(dto.memberCode).toBe('M-000042');
    expect(dto.assignedTrainer?.trainerCode).toBe('T-000003');
  });

  it('never exposes a password hash', () => {
    const serialized = JSON.stringify(MemberResponseDto.from(makeMember()));

    expect(serialized).not.toContain('super-secret-hash');
    expect(serialized).not.toContain('another-secret');
    expect(serialized).not.toContain('passwordHash');
  });

  it('includes staff notes for staff', () => {
    expect(MemberResponseDto.from(makeMember(), true).notes).toMatch(/Behind on payment/);
  });

  it('omits staff notes entirely when the member reads their own profile', () => {
    const dto = MemberResponseDto.from(makeMember(), false);

    expect(dto).not.toHaveProperty('notes');
    expect(JSON.stringify(dto)).not.toContain('Behind on payment');
  });

  it('handles a member with no trainer', () => {
    const dto = MemberResponseDto.from(makeMember({ assignedTrainer: null, assignedAt: null }));

    expect(dto.assignedTrainer).toBeNull();
    expect(dto.assignedAt).toBeNull();
  });

  it('exposes the account without credentials', () => {
    const dto = MemberResponseDto.from(makeMember());

    expect(dto.account).toEqual({
      id: 'user-1',
      email: 'mia@gym.test',
      firstName: 'Mia',
      lastName: 'Member',
      phone: '+15550100',
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
    });
  });
});
