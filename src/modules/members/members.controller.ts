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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto, UpdateOwnMemberProfileDto } from './dto/update-member.dto';
import { AssignTrainerDto } from './dto/assign-trainer.dto';
import { QueryMembersDto } from './dto/query-members.dto';
import { MemberResponseDto } from './dto/member-response.dto';

export class PaginatedMembersDto {
  data!: MemberResponseDto[];
  meta!: PaginationMeta;
}

@ApiTags(SWAGGER_TAGS.members)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Role not permitted', type: ApiErrorResponse })
@Controller({ path: 'members' })
export class MembersController {
  constructor(private readonly members: MembersService) {}

  // --- Self-service. Declared before /:id so "me" is never read as an id. ---

  @Get('me')
  @Roles(UserRole.MEMBER)
  @ApiOperation({
    summary: 'Own member profile',
    description: 'Staff notes are omitted — they are about the member, not for them.',
  })
  @ApiOkResponse({ type: MemberResponseDto })
  async findOwn(@CurrentUser('id') userId: string): Promise<MemberResponseDto> {
    const member = await this.members.findByUserIdOrFail(userId);
    return MemberResponseDto.from(member, false);
  }

  @Patch('me')
  @Roles(UserRole.MEMBER)
  @ApiOperation({
    summary: 'Update own contact details',
    description:
      'A member may change their phone, address and emergency contact. Name, ' +
      'status, staff notes and trainer assignment are administrator decisions.',
  })
  @ApiOkResponse({ type: MemberResponseDto })
  async updateOwn(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateOwnMemberProfileDto,
  ): Promise<MemberResponseDto> {
    const member = await this.members.updateOwn(userId, dto);
    return MemberResponseDto.from(member, false);
  }

  // --- Staff ---

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a member',
    description:
      'Creates the login account and the profile in one transaction, or links ' +
      'an existing MEMBER account when userId is supplied.',
  })
  @ApiCreatedResponse({ type: MemberResponseDto })
  @ApiConflictResponse({
    description: 'Email taken, or account already linked',
    type: ApiErrorResponse,
  })
  async create(@Body() dto: CreateMemberDto): Promise<MemberResponseDto> {
    return MemberResponseDto.from(await this.members.create(dto));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'List members',
    description:
      'An administrator sees every member. A trainer sees only the members ' +
      'assigned to them, regardless of the filters they pass.',
  })
  @ApiOkResponse({ type: PaginatedMembersDto })
  async findMany(
    @Query() query: QueryMembersDto,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<PaginatedMembersDto> {
    const result = await this.members.findMany(query, principal);
    return { data: result.data.map((member) => MemberResponseDto.from(member)), meta: result.meta };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TRAINER)
  @ApiOperation({
    summary: 'Get a member',
    description:
      'A trainer may only read a member assigned to them; any other member ' +
      'reports 404 rather than 403, so ids cannot be probed.',
  })
  @ApiOkResponse({ type: MemberResponseDto })
  @ApiNotFoundResponse({ description: 'No such member within your scope', type: ApiErrorResponse })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ): Promise<MemberResponseDto> {
    return MemberResponseDto.from(await this.members.findOneScoped(id, principal));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a member profile' })
  @ApiOkResponse({ type: MemberResponseDto })
  @ApiNotFoundResponse({ description: 'No such member', type: ApiErrorResponse })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<MemberResponseDto> {
    return MemberResponseDto.from(await this.members.update(id, dto));
  }

  @Patch(':id/trainer')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Assign or unassign a trainer',
    description: 'Pass trainerId: null to unassign. The trainer must be active.',
  })
  @ApiOkResponse({ type: MemberResponseDto })
  async assignTrainer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTrainerDto,
  ): Promise<MemberResponseDto> {
    return MemberResponseDto.from(await this.members.assignTrainer(id, dto.trainerId));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Archive a member',
    description:
      'Keeps the profile and all history, deactivates the login account and ' +
      'revokes its sessions. Reversible with /reactivate.',
  })
  @ApiOkResponse({ type: MemberResponseDto })
  @ApiConflictResponse({ description: 'Already archived', type: ApiErrorResponse })
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<MemberResponseDto> {
    return MemberResponseDto.from(await this.members.archive(id));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Reactivate an archived member',
    description: 'Restores the profile and re-enables the login account.',
  })
  @ApiOkResponse({ type: MemberResponseDto })
  @ApiConflictResponse({ description: 'Already active', type: ApiErrorResponse })
  async reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<MemberResponseDto> {
    return MemberResponseDto.from(await this.members.reactivate(id));
  }
}
