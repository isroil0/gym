import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { PaginationMeta } from '../../common/dto/pagination.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { PermissionAuditService } from './permission-audit.service';
import { AuditLogResponseDto, PermissionAuditDto, QueryAuditLogsDto } from './dto/audit-log.dto';

export class PaginatedAuditLogsDto {
  @ApiProperty({ type: [AuditLogResponseDto] }) data!: AuditLogResponseDto[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}

/**
 * The audit trail, and the permission matrix.
 *
 * Read-only by design: a log an administrator can edit is not evidence.
 */
@ApiTags(SWAGGER_TAGS.settings)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Requires the ADMIN role', type: ApiErrorResponse })
@Roles(UserRole.ADMIN)
@Controller({ path: 'audit' })
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly permissions: PermissionAuditService,
  ) {}

  @Get('permissions')
  @ApiOperation({
    summary: 'What every route requires',
    description:
      'Read from the running metadata, not a hand-kept document, so it cannot ' +
      'drift. Use it to answer "is anything accidentally public?".',
  })
  @ApiOkResponse({ type: PermissionAuditDto })
  permissionAudit(): PermissionAuditDto {
    return this.permissions.audit();
  }

  @Get('logs')
  @ApiOperation({
    summary: 'The audit trail',
    description:
      'Every state-changing request, successful or refused, with credentials ' +
      'redacted from the recorded payload.',
  })
  @ApiOkResponse({ type: PaginatedAuditLogsDto })
  async findMany(@Query() query: QueryAuditLogsDto): Promise<PaginatedAuditLogsDto> {
    const result = await this.audit.findMany(query);
    return {
      data: result.data.map((log) => AuditLogResponseDto.from(log)),
      meta: result.meta,
    };
  }

  @Get('logs/entity/:entityType/:entityId')
  @ApiOperation({
    summary: 'Everything that touched one record',
    description: 'The history of a single payment, membership or member.',
  })
  @ApiOkResponse({ type: PaginatedAuditLogsDto })
  async findForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query() query: QueryAuditLogsDto,
  ): Promise<PaginatedAuditLogsDto> {
    const result = await this.audit.findForEntity(entityType, entityId, query);
    return {
      data: result.data.map((log) => AuditLogResponseDto.from(log)),
      meta: result.meta,
    };
  }

  @Get('logs/:id')
  @ApiOperation({ summary: 'One audit entry' })
  @ApiOkResponse({ type: AuditLogResponseDto })
  @ApiNotFoundResponse({ description: 'No such entry', type: ApiErrorResponse })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AuditLogResponseDto> {
    return AuditLogResponseDto.from(await this.audit.findOneOrFail(id));
  }
}
