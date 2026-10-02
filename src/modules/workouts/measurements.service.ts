import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberAccessService } from './member-access.service';
import { ConflictError, NotFoundError } from '../../common/errors/app.exception';
import { paginate, type PaginatedResult } from '../../common/dto/pagination.dto';
import { toDateOnly } from '../memberships/membership-period';
import { memberCode } from '../../common/profiles/profile-code';
import {
  TRACKED_METRICS,
  currentBmi,
  latestValues,
  summariseProgress,
  type MeasurementPoint,
} from './progress-math';
import { MeasurementResponseDto, MetricProgressDto } from './dto/measurement.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import type {
  CreateMeasurementDto,
  MeasurementWithRelations,
  MemberProgressDto,
  QueryMeasurementsDto,
  UpdateMeasurementDto,
} from './dto/measurement.dto';

const MEASUREMENT_INCLUDE = {
  member: { include: { user: true } },
  recordedBy: true,
} satisfies Prisma.MemberMeasurementInclude;

/**
 * Maps the DTO's numeric fields onto column values, skipping any the caller
 * omitted so a partial update never blanks a reading it did not mention.
 */
type MeasurementScalars = Partial<Record<string, Prisma.Decimal | number | string>>;

function measurementData(dto: UpdateMeasurementDto): MeasurementScalars {
  const data: MeasurementScalars = {};

  for (const metric of TRACKED_METRICS) {
    const value = dto[metric];
    if (value === undefined) continue;

    // restingHeartRate is the only integer column among them.
    data[metric] = metric === 'restingHeartRate' ? value : new Prisma.Decimal(value);
  }

  if (dto.notes !== undefined) data.notes = dto.notes;

  return data;
}

@Injectable()
export class MeasurementsService {
  private readonly logger = new Logger(MeasurementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MemberAccessService,
  ) {}

  async create(
    dto: CreateMeasurementDto,
    principal: AuthenticatedUser,
  ): Promise<MeasurementWithRelations> {
    await this.access.assertCanManage(dto.memberId, principal);

    const measuredOn = toDateOnly(new Date(dto.measuredOn));

    const existing = await this.prisma.memberMeasurement.findUnique({
      where: { memberId_measuredOn: { memberId: dto.memberId, measuredOn } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError(
        `This member already has measurements recorded for ${dto.measuredOn.slice(0, 10)}`,
        [{ field: 'measuredOn', messages: ['one set of measurements per member per date'] }],
      );
    }

    const measurement = await this.prisma.memberMeasurement.create({
      data: {
        ...measurementData(dto),
        memberId: dto.memberId,
        measuredOn,
        recordedByUserId: principal.id,
      },
      include: MEASUREMENT_INCLUDE,
    });

    this.logger.log(
      `Recorded measurements for member ${dto.memberId} on ${measuredOn.toISOString().slice(0, 10)}`,
    );
    return measurement;
  }

  async findMany(
    query: QueryMeasurementsDto,
    principal: AuthenticatedUser,
  ): Promise<PaginatedResult<MeasurementWithRelations>> {
    const where = await this.buildWhere(query, principal);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.memberMeasurement.findMany({
        where,
        include: MEASUREMENT_INCLUDE,
        skip: query.skip,
        take: query.take,
        orderBy: [{ measuredOn: 'desc' }],
      }),
      this.prisma.memberMeasurement.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findOneScoped(id: string, principal: AuthenticatedUser): Promise<MeasurementWithRelations> {
    const measurement = await this.prisma.memberMeasurement.findFirst({
      where: { AND: [{ id }, { member: await this.access.readScope(principal) }] },
      include: MEASUREMENT_INCLUDE,
    });

    if (!measurement) throw new NotFoundError('Measurement', id);
    return measurement;
  }

  async update(
    id: string,
    dto: UpdateMeasurementDto,
    principal: AuthenticatedUser,
  ): Promise<MeasurementWithRelations> {
    const existing = await this.prisma.memberMeasurement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Measurement', id);

    await this.access.assertCanManage(existing.memberId, principal);

    return this.prisma.memberMeasurement.update({
      where: { id },
      data: measurementData(dto),
      include: MEASUREMENT_INCLUDE,
    });
  }

  async remove(id: string, principal: AuthenticatedUser): Promise<void> {
    const existing = await this.prisma.memberMeasurement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Measurement', id);

    await this.access.assertCanManage(existing.memberId, principal);
    await this.prisma.memberMeasurement.delete({ where: { id } });

    this.logger.log(`Deleted measurement ${id}`);
  }

  /**
   * A member's progress: the series, the latest figures, and the first-to-latest
   * change for every metric with at least two readings.
   */
  async progressFor(
    memberId: string,
    query: QueryMeasurementsDto,
    principal: AuthenticatedUser,
  ): Promise<MemberProgressDto> {
    // readScope is a MemberWhereInput, so it applies directly here.
    const member = await this.prisma.member.findFirst({
      where: { AND: [{ id: memberId }, await this.access.readScope(principal)] },
      include: { user: true },
    });

    if (!member) throw new NotFoundError('Member', memberId);

    const filters: Prisma.MemberMeasurementWhereInput[] = [{ memberId }];
    if (query.from) filters.push({ measuredOn: { gte: toDateOnly(new Date(query.from)) } });
    if (query.to) filters.push({ measuredOn: { lte: toDateOnly(new Date(query.to)) } });

    const measurements = await this.prisma.memberMeasurement.findMany({
      where: { AND: filters },
      include: MEASUREMENT_INCLUDE,
      orderBy: [{ measuredOn: 'desc' }],
    });

    const points: MeasurementPoint[] = measurements.map((measurement) => ({
      measuredOn: measurement.measuredOn,
      values: {
        weightKg: measurement.weightKg,
        heightCm: measurement.heightCm,
        bodyFatPercent: measurement.bodyFatPercent,
        muscleMassKg: measurement.muscleMassKg,
        chestCm: measurement.chestCm,
        waistCm: measurement.waistCm,
        hipsCm: measurement.hipsCm,
        thighCm: measurement.thighCm,
        armCm: measurement.armCm,
        restingHeartRate: measurement.restingHeartRate,
      },
    }));

    return {
      memberId: member.id,
      memberCode: memberCode(member.memberNumber),
      memberName: `${member.user.firstName} ${member.user.lastName}`,
      measurementCount: measurements.length,
      current: latestValues(points),
      bmi: currentBmi(points),
      progress: summariseProgress(points).map((entry) => MetricProgressDto.from(entry)),
      measurements: measurements.map((measurement) => MeasurementResponseDto.from(measurement)),
    };
  }

  private async buildWhere(
    query: QueryMeasurementsDto,
    principal: AuthenticatedUser,
  ): Promise<Prisma.MemberMeasurementWhereInput> {
    const filters: Prisma.MemberMeasurementWhereInput[] = [
      { member: await this.access.readScope(principal) },
    ];

    if (query.memberId) filters.push({ memberId: query.memberId });
    if (query.from) filters.push({ measuredOn: { gte: toDateOnly(new Date(query.from)) } });
    if (query.to) filters.push({ measuredOn: { lte: toDateOnly(new Date(query.to)) } });

    return { AND: filters };
  }
}
