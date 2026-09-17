import { ContactMessageStatus } from '../../entities';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ContactMessagesService } from './contact-messages.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

class UpdateContactMessageStatusDto {
  @IsEnum(ContactMessageStatus)
  status: ContactMessageStatus;
}

class SetRepliedDto {
  @IsOptional()
  @IsBoolean()
  replied?: boolean;
}

@ApiTags('Contact Messages')
@Controller('wholesale/contact-messages')
export class ContactMessagesController {
  constructor(private readonly contactMessagesService: ContactMessagesService) {}

  // Public — this is the storefront "Contact Us" form. Rate-limited against
  // spam submissions.
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post()
  create(@Body() dto: CreateContactMessageDto) {
    return this.contactMessagesService.create(dto);
  }

  @Get()
  @RequirePermission('canViewContactMessages')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findAll(@Query('status') status?: ContactMessageStatus) {
    return this.contactMessagesService.findAll(status);
  }

  @Get('stats')
  @RequirePermission('canViewContactMessages')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  getStats() {
    return this.contactMessagesService.getStats();
  }

  @Get(':id')
  @RequirePermission('canViewContactMessages')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactMessagesService.findOne(id);
  }

  @Patch(':id/status')
  @RequirePermission('canEditContactMessage')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContactMessageStatusDto) {
    return this.contactMessagesService.updateStatus(id, dto.status);
  }

  @Patch(':id/replied')
  @RequirePermission('canEditContactMessage')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  setReplied(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetRepliedDto) {
    return this.contactMessagesService.setReplied(id, dto.replied ?? true);
  }

  @Delete(':id')
  @RequirePermission('canDeleteContactMessage')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactMessagesService.remove(id);
  }
}
