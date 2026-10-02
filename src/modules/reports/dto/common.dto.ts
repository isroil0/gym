import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

/** How a time series is bucketed. */
export enum ReportGrouping {
  DAY = 'day',
  MONTH = 'month',
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every report period is a range of the gym's **local** calendar dates, read
 * from the `gym.timezone` setting — so "October" means the gym's October.
 */
export class ReportPeriodDto {
  @ApiProperty({ example: '2026-10-01', description: 'First local date, inclusive' })
  @Matches(LOCAL_DATE, { message: 'from must be a date in the form YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ example: '2026-10-31', description: 'Last local date, inclusive' })
  @Matches(LOCAL_DATE, { message: 'to must be a date in the form YYYY-MM-DD' })
  to!: string;
}

export class GroupedReportPeriodDto extends ReportPeriodDto {
  @ApiPropertyOptional({
    enum: ReportGrouping,
    enumName: 'ReportGrouping',
    default: ReportGrouping.DAY,
  })
  @IsOptional()
  @IsEnum(ReportGrouping, { message: 'groupBy must be day or month' })
  groupBy: ReportGrouping = ReportGrouping.DAY;
}

export class ExpiringWindowDto {
  @ApiPropertyOptional({
    example: 30,
    minimum: 1,
    maximum: 365,
    default: 30,
    description: 'How many days ahead to look for memberships about to lapse',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  withinDays: number = 30;
}

/** The period a report covers, echoed back so a client can label its output. */
export class ReportPeriodMetaDto {
  @ApiProperty({ example: '2026-10-01' }) from!: string;
  @ApiProperty({ example: '2026-10-31' }) to!: string;
  @ApiProperty({
    example: 'Europe/London',
    description: 'The zone the dates were interpreted in',
  })
  timeZone!: string;
}

export class SeriesPointDto {
  @ApiProperty({ example: '2026-10-01', description: 'Local day (YYYY-MM-DD) or month (YYYY-MM)' })
  bucket!: string;
  @ApiProperty({ example: '1250.00' }) value!: string;
}
