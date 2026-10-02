import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { PaginationMeta } from '../../common/dto/pagination.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserResponseDto } from './dto/user-response.dto';

export class PaginatedUsersDto {
  data!: UserResponseDto[];
  meta!: PaginationMeta;
}

/**
 * Administration of login accounts. Every route here is ADMIN-only; a trainer
 * or member manages their own account through /auth instead.
 *
 * Phase 3 adds the member and trainer profiles that link to these accounts.
 */
@ApiTags(SWAGGER_TAGS.users)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Requires the ADMIN role', type: ApiErrorResponse })
@Roles(UserRole.ADMIN)
@Controller({ path: 'users' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a login account' })
  @ApiCreatedResponse({ type: UserResponseDto })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.users.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'List accounts', description: 'Filterable by role, status and search.' })
  @ApiOkResponse({ type: PaginatedUsersDto })
  async findMany(@Query() query: QueryUsersDto): Promise<PaginatedUsersDto> {
    const result = await this.users.findMany(query);
    return { data: result.data.map((user) => UserResponseDto.fromEntity(user)), meta: result.meta };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an account by id' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'No such account', type: ApiErrorResponse })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.users.findByIdOrFail(id));
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Activate or deactivate an account',
    description:
      'Deactivating takes effect immediately: the account can no longer sign in, ' +
      'and already-issued access tokens stop working on their next request.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'No such account', type: ApiErrorResponse })
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.users.setStatus(id, dto.status));
  }
}
