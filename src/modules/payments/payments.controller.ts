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
import { PaymentsService } from './payments.service';
import {
  CreatePaymentDto,
  CreateRefundDto,
  PaymentResponseDto,
  QueryPaymentsDto,
} from './dto/payment.dto';

export class PaginatedPaymentsDto {
  @ApiProperty({ type: [PaymentResponseDto] }) data!: PaymentResponseDto[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}

@ApiTags(SWAGGER_TAGS.payments)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Role not permitted', type: ApiErrorResponse })
@Controller({ path: 'payments' })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // --- Fixed paths before /:id ---

  @Get('me')
  @Roles(UserRole.MEMBER)
  @ApiOperation({
    summary: 'Own payment history',
    description: 'Staff notes are omitted.',
  })
  @ApiOkResponse({ type: PaginatedPaymentsDto })
  async findOwn(
    @CurrentUser() principal: AuthenticatedUser,
    @Query() query: QueryPaymentsDto,
  ): Promise<PaginatedPaymentsDto> {
    const result = await this.payments.findMany(query, principal);
    return {
      data: result.data.map((payment) => PaymentResponseDto.from(payment, false)),
      meta: result.meta,
    };
  }

  // --- Staff ---

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Record a payment received from a member',
    description:
      'Writes the payment and its INCOME ledger entry in one transaction. The ' +
      'ledger link is unique, so the income can never be posted twice. Link a ' +
      "membershipId to settle that membership's debt; omit it for other income.",
  })
  @ApiCreatedResponse({ type: PaymentResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'Membership belongs to another member',
    type: ApiErrorResponse,
  })
  async create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    return PaymentResponseDto.from(await this.payments.create(dto, actor));
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List payments',
    description: 'Filterable by member, membership, method, status and date range.',
  })
  @ApiOkResponse({ type: PaginatedPaymentsDto })
  async findMany(
    @Query() query: QueryPaymentsDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<PaginatedPaymentsDto> {
    const result = await this.payments.findMany(query, principal);
    return {
      data: result.data.map((payment) => PaymentResponseDto.from(payment)),
      meta: result.meta,
    };
  }

  @ScopedAccess(
    'Scoped in the service: an administrator sees all, a trainer their assigned members, a member only their own.',
  )
  @Get(':id')
  @ApiOperation({
    summary: 'Get a payment',
    description: 'A member may read only their own; anything else reports 404.',
  })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiNotFoundResponse({ description: 'No such payment within your scope', type: ApiErrorResponse })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    const payment = await this.payments.findOneScoped(id, principal);
    return PaymentResponseDto.from(payment, principal.role !== UserRole.MEMBER);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Refund a payment, in whole or in part',
    description:
      'Writes the refund and its REFUND ledger entry in one transaction. A ' +
      'refund can never exceed what is left of the payment. Refunding restores ' +
      'the debt on the membership the payment settled.',
  })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'Refund exceeds the refundable balance',
    type: ApiErrorResponse,
  })
  async refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRefundDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    return PaymentResponseDto.from(await this.payments.refund(id, dto, actor));
  }
}
