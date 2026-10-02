import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { AppConfigService } from '../../config/configuration';

/**
 * Owns every password hash comparison in the system so the cost factor and
 * the algorithm are configured in exactly one place.
 */
@Injectable()
export class PasswordService {
  constructor(private readonly config: AppConfigService) {}

  hash(plainPassword: string): Promise<string> {
    return hash(plainPassword, this.config.bcryptRounds);
  }

  verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    return compare(plainPassword, passwordHash);
  }

  /**
   * Burns roughly the same CPU as a real verification against a throwaway
   * hash. Called when an account does not exist so that login timing cannot
   * be used to discover which email addresses are registered.
   */
  async burnTiming(): Promise<void> {
    await compare(
      'timing-equalisation',
      '$2b$12$V3L5a0mWUkYwFQ2j1lR1xeHtkqgVq1Y0qQ0sM2nQ0H2cMyr0D2Jm2',
    );
  }
}
