import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ContactMessageStatus, UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
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
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  findAll(@Query('status') status?: ContactMessageStatus) {
    return this.contactMessagesService.findAll(status);
  }

  @Get('stats')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  getStats() {
    return this.contactMessagesService.getStats();
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contactMessagesService.findOne(id);
  }

  @Patch(':id/status')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContactMessageStatusDto) {
    return this.contactMessagesService.updateStatus(id, dto.status);
  }

  @Patch(':id/replied')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  setReplied(@Param('id', ParseIntPipe) id: number, @Body() dto: SetRepliedDto) {
    return this.contactMessagesService.setReplied(id, dto.replied ?? true);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contactMessagesService.remove(id);
  }
}
