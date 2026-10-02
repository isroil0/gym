import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SWAGGER_TAGS } from '../../common/swagger/swagger.setup';
import { ApiErrorResponse } from '../../common/dto/api-error.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MembershipCardsService } from './membership-cards.service';
import { MembershipCardResponseDto, RevokeCardDto } from './dto/membership-card.dto';

/**
 * QR membership cards.
 *
 * The response carries the exact string to encode into a QR image; rendering
 * the bitmap is a client concern. The payload is derived from the member id and
 * the card version rather than stored, so it can always be shown again, and a
 * regeneration invalidates every copy already in circulation.
 */
@ApiTags(SWAGGER_TAGS.attendance)
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Role not permitted', type: ApiErrorResponse })
@Controller({ path: 'membership-cards' })
export class MembershipCardsController {
  constructor(private readonly cards: MembershipCardsService) {}

  @Get('me')
  @Roles(UserRole.MEMBER)
  @ApiOperation({
    summary: 'Own QR membership card',
    description: 'Issues one on first request, so every member always has a card.',
  })
  @ApiOkResponse({ type: MembershipCardResponseDto })
  async findOwn(@CurrentUser('id') userId: string): Promise<MembershipCardResponseDto> {
    return this.cards.present(await this.cards.forUser(userId));
  }

  @Post('me/regenerate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.MEMBER)
  @ApiOperation({
    summary: 'Replace own card',
    description: 'For a lost or shared card. Every previous copy stops working immediately.',
  })
  @ApiOkResponse({ type: MembershipCardResponseDto })
  async regenerateOwn(@CurrentUser('id') userId: string): Promise<MembershipCardResponseDto> {
    const { card } = await this.cards.forUser(userId);
    return this.cards.present(await this.cards.regenerate(card.memberId));
  }

  @Get('members/:memberId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "A member's QR membership card" })
  @ApiOkResponse({ type: MembershipCardResponseDto })
  async findForMember(
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<MembershipCardResponseDto> {
    return this.cards.present(await this.cards.ensureForMember(memberId));
  }

  @Post('members/:memberId/regenerate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: "Replace a member's card",
    description: 'Also clears a revocation, so this is how a blocked card is reinstated.',
  })
  @ApiOkResponse({ type: MembershipCardResponseDto })
  async regenerate(
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<MembershipCardResponseDto> {
    return this.cards.present(await this.cards.regenerate(memberId));
  }

  @Post('members/:memberId/revoke')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: "Block a member's card",
    description:
      'The card stops opening the door immediately. Regenerate to issue a ' +
      'working replacement.',
  })
  @ApiOkResponse({ type: MembershipCardResponseDto })
  @ApiConflictResponse({ description: 'Already revoked', type: ApiErrorResponse })
  async revoke(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: RevokeCardDto,
  ): Promise<MembershipCardResponseDto> {
    return this.cards.present(await this.cards.revoke(memberId, dto.reason));
  }
}
