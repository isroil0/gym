import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PaymentMethod, UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { PaginationMeta } from '../../common/dto/pagination.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { format } from '../../common/money/money';
import { AccountingService } from './accounting.service';
import { ExpenseCategoriesService } from './expense-categories.service';
import {
  AccountingEntryResponseDto,
  CreateAccountingEntryDto,
  DateRangeQueryDto,
  MonthlyQueryDto,
  QueryAccountingEntriesDto,
  VoidAccountingEntryDto,
} from './dto/accounting-entry.dto';
import {
  CreateExpenseCategoryDto,
  ExpenseCategoryResponseDto,
  QueryExpenseCategoriesDto,
  UpdateExpenseCategoryDto,
} from './dto/expense-category.dto';

export class PaginatedEntriesDto {
  @ApiProperty({ type: [AccountingEntryResponseDto] }) data!: AccountingEntryResponseDto[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}

export class PaginatedCategoriesDto {
  @ApiProperty({ type: [ExpenseCategoryResponseDto] }) data!: ExpenseCategoryResponseDto[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}

class CategoryBreakdownDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) expenseCategoryId!: string | null;
  @ApiProperty({ example: 'Rent' }) expenseCategoryName!: string;
  @ApiProperty({ example: '1200.00' }) amount!: string;
}

class MethodBreakdownDto {
  @ApiPropertyOptional({ enum: PaymentMethod, enumName: 'PaymentMethod', nullable: true })
  method!: PaymentMethod | null;
  @ApiProperty({ example: '800.00' }) income!: string;
  @ApiProperty({ example: '50.00' }) refunds!: string;
}

export class PeriodSummaryDto {
  @ApiProperty({ type: String, format: 'date' }) from!: Date;
  @ApiProperty({ type: String, format: 'date' }) to!: Date;
  @ApiProperty({ example: '1000.00', description: 'Money in from members' }) income!: string;
  @ApiProperty({ example: '150.00', description: 'Money returned to members' }) refunds!: string;
  @ApiProperty({ example: '850.00', description: 'income − refunds' }) revenue!: string;
  @ApiProperty({ example: '400.00' }) expenses!: string;
  @ApiProperty({ example: '450.00', description: 'revenue − expenses' }) profit!: string;
  @ApiProperty({ type: [CategoryBreakdownDto] }) expensesByCategory!: CategoryBreakdownDto[];
  @ApiProperty({ type: [MethodBreakdownDto] }) byPaymentMethod!: MethodBreakdownDto[];
}

export class PeriodBucketDto {
  @ApiProperty({ example: '2026-10-01', description: 'Day (YYYY-MM-DD) or month (YYYY-MM)' })
  date!: string;
  @ApiProperty({ example: '120.00' }) income!: string;
  @ApiProperty({ example: '0.00' }) refunds!: string;
  @ApiProperty({ example: '120.00' }) revenue!: string;
  @ApiProperty({ example: '40.00' }) expenses!: string;
  @ApiProperty({ example: '80.00' }) profit!: string;
}

@ApiTags(SWAGGER_TAGS.accounting)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Requires the ADMIN role', type: ApiErrorResponse })
@Roles(UserRole.ADMIN)
@Controller({ path: 'accounting' })
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly categories: ExpenseCategoriesService,
  ) {}

  // ---- Expense categories ----

  @Post('expense-categories')
  @ApiOperation({ summary: 'Create an expense category' })
  @ApiCreatedResponse({ type: ExpenseCategoryResponseDto })
  @ApiConflictResponse({ description: 'Name already used', type: ApiErrorResponse })
  async createCategory(@Body() dto: CreateExpenseCategoryDto): Promise<ExpenseCategoryResponseDto> {
    return ExpenseCategoryResponseDto.from(await this.categories.create(dto));
  }

  @Get('expense-categories')
  @ApiOperation({ summary: 'List expense categories' })
  @ApiOkResponse({ type: PaginatedCategoriesDto })
  async findCategories(@Query() query: QueryExpenseCategoriesDto): Promise<PaginatedCategoriesDto> {
    const result = await this.categories.findMany(query);
    return {
      data: result.data.map((category) => ExpenseCategoryResponseDto.from(category)),
      meta: result.meta,
    };
  }

  @Patch('expense-categories/:id')
  @ApiOperation({ summary: 'Rename or re-describe an expense category' })
  @ApiOkResponse({ type: ExpenseCategoryResponseDto })
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategoryResponseDto> {
    return ExpenseCategoryResponseDto.from(await this.categories.update(id, dto));
  }

  @Post('expense-categories/:id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retire an expense category',
    description: 'Expenses already filed under it keep their history.',
  })
  @ApiOkResponse({ type: ExpenseCategoryResponseDto })
  @ApiConflictResponse({ description: 'Already archived', type: ApiErrorResponse })
  async archiveCategory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExpenseCategoryResponseDto> {
    return ExpenseCategoryResponseDto.from(await this.categories.archive(id));
  }

  @Post('expense-categories/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Put an archived expense category back in use' })
  @ApiOkResponse({ type: ExpenseCategoryResponseDto })
  @ApiConflictResponse({ description: 'Already active', type: ApiErrorResponse })
  async reactivateCategory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExpenseCategoryResponseDto> {
    return ExpenseCategoryResponseDto.from(await this.categories.reactivate(id));
  }

  // ---- Reports. Declared before entries/:id so the paths never collide. ----

  @Get('summary')
  @ApiOperation({
    summary: 'Income, refunds, revenue, expenses and profit over a period',
    description: 'revenue = income − refunds. profit = revenue − expenses.',
  })
  @ApiOkResponse({ type: PeriodSummaryDto })
  async summary(@Query() query: DateRangeQueryDto): Promise<PeriodSummaryDto> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    const [totals, byCategory, byMethod] = await Promise.all([
      this.accounting.totalsForPeriod(from, to),
      this.accounting.expensesByCategory(from, to),
      this.accounting.byPaymentMethod(from, to),
    ]);

    return {
      from: totals.from,
      to: totals.to,
      income: format(totals.income),
      refunds: format(totals.refunds),
      revenue: format(totals.revenue),
      expenses: format(totals.expenses),
      profit: format(totals.profit),
      expensesByCategory: byCategory.map((row) => ({
        expenseCategoryId: row.expenseCategoryId,
        expenseCategoryName: row.expenseCategoryName,
        amount: format(row.amount),
      })),
      byPaymentMethod: byMethod.map((row) => ({
        method: row.method,
        income: format(row.income),
        refunds: format(row.refunds),
      })),
    };
  }

  @Get('daily')
  @ApiOperation({ summary: 'Per-day totals across a date range' })
  @ApiOkResponse({ type: [PeriodBucketDto] })
  async daily(@Query() query: DateRangeQueryDto): Promise<PeriodBucketDto[]> {
    const rows = await this.accounting.dailyTotals(new Date(query.from), new Date(query.to));

    return rows.map((row) => ({
      date: row.date,
      income: format(row.income),
      refunds: format(row.refunds),
      revenue: format(row.revenue),
      expenses: format(row.expenses),
      profit: format(row.profit),
    }));
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Per-month totals for a calendar year' })
  @ApiOkResponse({ type: [PeriodBucketDto] })
  async monthly(@Query() query: MonthlyQueryDto): Promise<PeriodBucketDto[]> {
    const rows = await this.accounting.monthlyTotals(query.year);

    return rows.map((row) => ({
      date: row.date,
      income: format(row.income),
      refunds: format(row.refunds),
      revenue: format(row.revenue),
      expenses: format(row.expenses),
      profit: format(row.profit),
    }));
  }

  // ---- Ledger entries ----

  @Post('entries')
  @ApiOperation({
    summary: 'Record a manual income or expense',
    description:
      'An expense requires a category and may be attributed to a trainer, which ' +
      'is how salary and commission payouts are recorded. REFUND entries cannot ' +
      'be created here — refund the payment instead.',
  })
  @ApiCreatedResponse({ type: AccountingEntryResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'Missing or misplaced category, or archived category',
    type: ApiErrorResponse,
  })
  async createEntry(
    @Body() dto: CreateAccountingEntryDto,
    @CurrentUser('id') userId: string,
  ): Promise<AccountingEntryResponseDto> {
    return AccountingEntryResponseDto.from(await this.accounting.createEntry(dto, userId));
  }

  @Get('entries')
  @ApiOperation({ summary: 'List ledger entries' })
  @ApiOkResponse({ type: PaginatedEntriesDto })
  async findEntries(@Query() query: QueryAccountingEntriesDto): Promise<PaginatedEntriesDto> {
    const result = await this.accounting.findEntries(query);
    return {
      data: result.data.map((entry) => AccountingEntryResponseDto.from(entry)),
      meta: result.meta,
    };
  }

  @Get('entries/:id')
  @ApiOperation({ summary: 'Get a ledger entry' })
  @ApiOkResponse({ type: AccountingEntryResponseDto })
  async findEntry(@Param('id', ParseUUIDPipe) id: string): Promise<AccountingEntryResponseDto> {
    return AccountingEntryResponseDto.from(await this.accounting.findEntryOrFail(id));
  }

  @Post('entries/:id/void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Void a manual entry',
    description:
      'The row is kept for audit but stops counting towards any total. Entries ' +
      'generated by a payment or refund are immutable and cannot be voided.',
  })
  @ApiOkResponse({ type: AccountingEntryResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'Entry was generated automatically',
    type: ApiErrorResponse,
  })
  @ApiConflictResponse({ description: 'Already voided', type: ApiErrorResponse })
  async voidEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidAccountingEntryDto,
  ): Promise<AccountingEntryResponseDto> {
    return AccountingEntryResponseDto.from(await this.accounting.voidEntry(id, dto.reason));
  }
}
