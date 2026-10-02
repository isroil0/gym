import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { PaginationMeta } from '../../common/dto/pagination.dto';
import { Roles, ScopedAccess } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AttendanceService, type CheckInOutcome } from './attendance.service';
import {
  AttendanceResponseDto,
  CheckInResultDto,
  CheckOutDto,
  ManualCheckInDto,
  QrScanDto,
  QueryAttendanceDto,
  TodayAttendanceDto,
} from './dto/attendance.dto';

export class PaginatedAttendanceDto {
  @ApiProperty({ type: [AttendanceResponseDto] }) data!: AttendanceResponseDto[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}

function presentCheckIn(outcome: CheckInOutcome): CheckInResultDto {
  return {
    admitted: true,
    attendance: AttendanceResponseDto.from(outcome.attendance),
    visitsRemaining: outcome.visitsRemaining,
    membershipDaysRemaining: outcome.membershipDaysRemaining,
  };
}

/**
 * Door and front-desk operations.
 *
 * A refusal is a 422 whose `details` carries a stable reason code
 * (`MEMBERSHIP_EXPIRED`, `NO_VISITS_LEFT`, `CARD_REVOKED`, …) alongside a
 * readable message, so a terminal can react and staff can explain.
 */
@ApiTags(SWAGGER_TAGS.attendance)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Role not permitted', type: ApiErrorResponse })
@Controller({ path: 'attendance' })
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // --- Fixed paths before /:id ---

  @Get('me')
  @Roles(UserRole.MEMBER)
  @ApiOperation({ summary: 'Own attendance history', description: 'Staff notes are omitted.' })
  @ApiOkResponse({ type: PaginatedAttendanceDto })
  async findOwn(
    @CurrentUser() principal: AuthenticatedUser,
    @Query() query: QueryAttendanceDto,
  ): Promise<PaginatedAttendanceDto> {
    const result = await this.attendance.findMany(query, principal);
    return {
      data: result.data.map((visit) => AttendanceResponseDto.from(visit, false)),
      meta: result.meta,
    };
  }

  @Get('today')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: "Today's attendance",
    description: 'Every visit started today, plus how many members are inside right now.',
  })
  @ApiOkResponse({ type: TodayAttendanceDto })
  async today(): Promise<TodayAttendanceDto> {
    const { date, visits, currentlyInside } = await this.attendance.forDay(new Date());

    return {
      date,
      totalVisits: visits.length,
      currentlyInside,
      visits: visits.map((visit) => AttendanceResponseDto.from(visit)),
    };
  }

  @Post('check-in')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Check a member in manually',
    description:
      'Requires an active membership. Deducts a visit from a limited allowance. ' +
      'Refusals carry a reason code in `details`.',
  })
  @ApiCreatedResponse({ type: CheckInResultDto })
  @ApiUnprocessableEntityResponse({
    description: 'Entry refused — see details for the reason code',
    type: ApiErrorResponse,
  })
  async checkIn(
    @Body() dto: ManualCheckInDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CheckInResultDto> {
    return presentCheckIn(await this.attendance.checkInManually(dto.memberId, actor, dto.notes));
  }

  @Post('check-in/qr')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Check a member in from a scanned QR card',
    description:
      'Verifies the card signature before any lookup, then checks the card is ' +
      'neither revoked nor superseded, then applies the same membership rules ' +
      'as a manual check-in.',
  })
  @ApiCreatedResponse({ type: CheckInResultDto })
  @ApiUnprocessableEntityResponse({
    description: 'Entry refused — see details for the reason code',
    type: ApiErrorResponse,
  })
  async checkInByQr(
    @Body() dto: QrScanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CheckInResultDto> {
    return presentCheckIn(await this.attendance.checkInByCard(dto.token, actor));
  }

  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Check a member out by member id' })
  @ApiOkResponse({ type: AttendanceResponseDto })
  @ApiConflictResponse({ description: 'Member is not checked in', type: ApiErrorResponse })
  async checkOut(@Body() dto: CheckOutDto): Promise<AttendanceResponseDto> {
    return AttendanceResponseDto.from(await this.attendance.checkOutMember(dto.memberId));
  }

  @Post('check-out/qr')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Check a member out from a scanned QR card',
    description:
      'A revoked or superseded card can still close a visit — somebody inside ' +
      'must always be able to leave.',
  })
  @ApiOkResponse({ type: AttendanceResponseDto })
  @ApiConflictResponse({ description: 'Member is not checked in', type: ApiErrorResponse })
  async checkOutByQr(@Body() dto: QrScanDto): Promise<AttendanceResponseDto> {
    return AttendanceResponseDto.from(await this.attendance.checkOutByCard(dto.token));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Attendance history',
    description:
      'An administrator sees every visit. A trainer sees only visits by their ' +
      'assigned members.',
  })
  @ApiOkResponse({ type: PaginatedAttendanceDto })
  async findMany(
    @Query() query: QueryAttendanceDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<PaginatedAttendanceDto> {
    const result = await this.attendance.findMany(query, principal);
    return {
      data: result.data.map((visit) => AttendanceResponseDto.from(visit)),
      meta: result.meta,
    };
  }

  @ScopedAccess(
    'Scoped in the service: an administrator sees all, a trainer their assigned members, a member only their own.',
  )
  @Get(':id')
  @ApiOperation({
    summary: 'Get one visit',
    description: 'Scoped like the history; anything out of reach reports 404.',
  })
  @ApiOkResponse({ type: AttendanceResponseDto })
  @ApiNotFoundResponse({ description: 'No such visit within your scope', type: ApiErrorResponse })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<AttendanceResponseDto> {
    const visit = await this.attendance.findOneScoped(id, principal);
    return AttendanceResponseDto.from(visit, principal.role !== UserRole.MEMBER);
  }

  @Post(':id/check-out')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Check out a specific visit' })
  @ApiOkResponse({ type: AttendanceResponseDto })
  @ApiConflictResponse({ description: 'Already checked out', type: ApiErrorResponse })
  async checkOutVisit(@Param('id', ParseUUIDPipe) id: string): Promise<AttendanceResponseDto> {
    return AttendanceResponseDto.from(await this.attendance.checkOutById(id));
  }
}
