import { GYM_TIMEZONE_KEY, GymTimeService } from './gym-time.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('GymTimeService', () => {
  let prisma: { appSetting: { findUnique: jest.Mock } };
  let service: GymTimeService;

  beforeEach(() => {
    prisma = { appSetting: { findUnique: jest.fn().mockResolvedValue({ value: 'UTC' }) } };
    service = new GymTimeService(prisma as unknown as PrismaService);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  describe('refresh', () => {
    it('adopts the configured zone', async () => {
      prisma.appSetting.findUnique.mockResolvedValue({ value: 'America/New_York' });

      await expect(service.refresh()).resolves.toBe('America/New_York');
      expect(service.zone).toBe('America/New_York');
      expect(prisma.appSetting.findUnique).toHaveBeenCalledWith({
        where: { key: GYM_TIMEZONE_KEY },
      });
    });

    it('trims surrounding whitespace', async () => {
      prisma.appSetting.findUnique.mockResolvedValue({ value: '  Asia/Tokyo \n' });
      await expect(service.refresh()).resolves.toBe('Asia/Tokyo');
    });

    it('falls back to UTC when the setting is missing', async () => {
      prisma.appSetting.findUnique.mockResolvedValue(null);
      await expect(service.refresh()).resolves.toBe('UTC');
    });

    it('falls back to UTC when the setting is blank', async () => {
      prisma.appSetting.findUnique.mockResolvedValue({ value: '   ' });
      await expect(service.refresh()).resolves.toBe('UTC');
    });

    it('falls back to UTC and warns on an unknown zone, rather than failing reports', async () => {
      const warn = jest.spyOn(service['logger'], 'warn');
      prisma.appSetting.findUnique.mockResolvedValue({ value: 'Mars/Olympus' });

      await expect(service.refresh()).resolves.toBe('UTC');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a known IANA timezone'));
    });

    it('survives the settings table being unreadable', async () => {
      prisma.appSetting.findUnique.mockRejectedValue(new Error('relation does not exist'));
      await expect(service.refresh()).resolves.toBe('UTC');
    });

    it('picks up a change without a restart', async () => {
      await service.refresh();
      expect(service.zone).toBe('UTC');

      prisma.appSetting.findUnique.mockResolvedValue({ value: 'Europe/London' });
      await service.refresh();
      expect(service.zone).toBe('Europe/London');
    });
  });

  describe('derived periods', () => {
    beforeEach(async () => {
      prisma.appSetting.findUnique.mockResolvedValue({ value: 'America/New_York' });
      await service.refresh();
    });

    it("reports the gym's local date, not the UTC date", () => {
      // 02:00 UTC is still the previous evening in New York.
      expect(service.today(new Date('2026-07-02T02:00:00.000Z'))).toBe('2026-07-01');
    });

    it("bounds a local day in the gym's zone", () => {
      const { start, end } = service.day('2026-07-01');

      expect(start.toISOString()).toBe('2026-07-01T04:00:00.000Z');
      expect(end.toISOString()).toBe('2026-07-02T04:00:00.000Z');
    });

    it("bounds a local month in the gym's zone", () => {
      const { start, end } = service.month(2026, 7);

      expect(start.toISOString()).toBe('2026-07-01T04:00:00.000Z');
      expect(end.toISOString()).toBe('2026-08-01T04:00:00.000Z');
    });

    it('reports the local month of an instant near midnight', () => {
      // 01:00 UTC on 1 August is still 31 July in New York.
      expect(service.localMonthOf(new Date('2026-08-01T01:00:00.000Z'))).toEqual({
        year: 2026,
        month: 7,
      });
    });

    it('derives the current month as a date range', () => {
      expect(service.currentMonthDates(new Date('2026-07-15T12:00:00.000Z'))).toEqual({
        from: '2026-07-01',
        to: '2026-07-31',
      });
    });

    it('shifts local dates across month boundaries', () => {
      expect(service.shift('2026-08-01', -1)).toBe('2026-07-31');
    });

    it('converts a local date to UTC midnight for a SQL date column', () => {
      // Date columns carry no zone, so they are compared to a date, not an instant.
      expect(service.localDateAsUtcMidnight('2026-07-01').toISOString()).toBe(
        '2026-07-01T00:00:00.000Z',
      );
    });
  });
});
