import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PaginationQueryDto, buildPaginationMeta, paginate } from './pagination.dto';

describe('PaginationQueryDto', () => {
  it('defaults to page 1 with 20 items', () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.skip).toBe(0);
    expect(dto.take).toBe(20);
  });

  it('computes skip from page and limit', () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '3', limit: '25' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.skip).toBe(50);
  });

  it('rejects a page below 1', () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '0' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects a limit above 100', () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: '101' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});

describe('buildPaginationMeta', () => {
  it('describes a middle page', () => {
    expect(buildPaginationMeta(137, 2, 20)).toEqual({
      page: 2,
      limit: 20,
      total: 137,
      totalPages: 7,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('describes an empty result set', () => {
    expect(buildPaginationMeta(0, 1, 20)).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('marks the last page as having no next page', () => {
    const meta = buildPaginationMeta(40, 2, 20);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(true);
  });
});

describe('paginate', () => {
  it('wraps data with its meta', () => {
    const result = paginate(['a', 'b'], 2, 1, 20);
    expect(result.data).toEqual(['a', 'b']);
    expect(result.meta.total).toBe(2);
  });
});
