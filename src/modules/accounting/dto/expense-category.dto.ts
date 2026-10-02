import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ExpenseCategory } from '@prisma/client';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { TrimString } from '../../../common/transformers/normalize';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class CreateExpenseCategoryDto {
  @ApiProperty({ example: 'Rent' })
  @TrimString()
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional({ example: 'Monthly premises rent' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class UpdateExpenseCategoryDto {
  @ApiPropertyOptional({ example: 'Rent & utilities' })
  @IsOptional()
  @TrimString()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class QueryExpenseCategoriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'true to include archived categories. Defaults to active only.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'includeArchived must be true or false' })
  includeArchived?: boolean;

  @ApiPropertyOptional({ description: 'Case-insensitive match on name' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class ExpenseCategoryResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Rent' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ example: false }) archived!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  static from(category: ExpenseCategory): ExpenseCategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      archived: category.archivedAt !== null,
      archivedAt: category.archivedAt,
      createdAt: category.createdAt,
    };
  }
}
