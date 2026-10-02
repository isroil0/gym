import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditOutcome, UserRole, type AuditLog } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryAuditLogsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Who performed the action' })
  @IsOptional()
  @IsUUID('4', { message: 'actorId must be a valid UUID' })
  actorId?: string;

  @ApiPropertyOptional({ enum: UserRole, enumName: 'UserRole' })
  @IsOptional()
  @IsEnum(UserRole, { message: 'actorRole must be ADMIN, TRAINER or MEMBER' })
  actorRole?: UserRole;

  @ApiPropertyOptional({ example: 'payments.refund', description: 'Prefix match on the action' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(120)
  action?: string;

  @ApiPropertyOptional({ example: 'payments' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @ApiPropertyOptional({ description: 'The id of the record acted on' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @ApiPropertyOptional({ enum: AuditOutcome, enumName: 'AuditOutcome' })
  @IsOptional()
  @IsEnum(AuditOutcome, { message: 'outcome must be SUCCESS or FAILURE' })
  outcome?: AuditOutcome;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString({}, { message: 'from must be an ISO date' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString({}, { message: 'to must be an ISO date' })
  to?: string;
}

export class AuditLogResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) actorId!: string | null;
  @ApiPropertyOptional({ enum: UserRole, enumName: 'UserRole', nullable: true })
  actorRole!: UserRole | null;
  @ApiPropertyOptional({ nullable: true }) actorEmail!: string | null;

  @ApiProperty({ example: 'payments.refund' }) action!: string;
  @ApiPropertyOptional({ nullable: true }) entityType!: string | null;
  @ApiPropertyOptional({ nullable: true }) entityId!: string | null;

  @ApiProperty({ example: 'POST' }) method!: string;
  @ApiProperty({ example: '/api/v1/payments/…/refund' }) path!: string;
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ enum: AuditOutcome, enumName: 'AuditOutcome' }) outcome!: AuditOutcome;
  @ApiPropertyOptional({ nullable: true }) errorCode!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'The request body with credentials redacted',
  })
  payload!: unknown;

  @ApiPropertyOptional({ nullable: true }) requestId!: string | null;
  @ApiPropertyOptional({ nullable: true }) ipAddress!: string | null;
  @ApiPropertyOptional({ nullable: true }) userAgent!: string | null;
  @ApiPropertyOptional({ example: 42, nullable: true }) durationMs!: number | null;

  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  static from(log: AuditLog): AuditLogResponseDto {
    return {
      id: log.id,
      actorId: log.actorId,
      actorRole: log.actorRole,
      actorEmail: log.actorEmail,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      method: log.method,
      path: log.path,
      statusCode: log.statusCode,
      outcome: log.outcome,
      errorCode: log.errorCode,
      payload: log.payload,
      requestId: log.requestId,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      durationMs: log.durationMs,
      createdAt: log.createdAt,
    };
  }
}

export class RoutePermissionDto {
  @ApiProperty({ example: 'POST' }) method!: string;
  @ApiProperty({ example: '/v1/payments' }) path!: string;
  @ApiProperty({ example: 'PaymentsController' }) controller!: string;
  @ApiProperty({ example: 'create' }) handler!: string;
  @ApiProperty({ example: false }) public!: boolean;
  @ApiProperty({
    enum: UserRole,
    enumName: 'UserRole',
    isArray: true,
    description: 'Empty on a non-public route means any authenticated role.',
  })
  roles!: UserRole[];

  @ApiPropertyOptional({
    nullable: true,
    example: 'Scoped in the service: admin all, trainer assigned members, member own',
    description: 'Set when the route narrows access inside the service rather than by role.',
  })
  scopedAccess!: string | null;
}

export class PermissionAuditDto {
  @ApiProperty({ example: 118 }) totalRoutes!: number;
  @ApiProperty({ example: 6, description: 'Reachable without authentication' })
  publicRoutes!: number;
  @ApiProperty({
    example: 18,
    description: 'Open to any role but narrowed in the service, and declared as such',
  })
  serviceScoped!: number;
  @ApiProperty({
    example: 0,
    description: 'Open to any role with no scoping declared — each needs a human to confirm',
  })
  unrestricted!: number;
  @ApiProperty({ example: 115 }) roleRestricted!: number;
  @ApiProperty({
    type: [RoutePermissionDto],
    description: 'The subset needing review, lifted out so it cannot be missed',
  })
  needsReview!: RoutePermissionDto[];
  @ApiProperty({ type: [RoutePermissionDto] }) routes!: RoutePermissionDto[];
}
