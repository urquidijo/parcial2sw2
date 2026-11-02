import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../auth/auth-user';
import { AnswerInquiryDto, CreateInquiryDto } from './dto/inquiry.dto';
import { InquiriesService } from './inquiries.service';

@Controller('api/v1')
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Post('properties/:id/inquiries')
  @Roles('CLIENTE')
  @HttpCode(HttpStatus.CREATED)
  create(@Param('id') propertyId: string, @Body() dto: CreateInquiryDto, @CurrentUser() user: AuthUser) {
    return this.inquiriesService.create(propertyId, dto, user);
  }

  @Get('inquiries')
  @Roles('CLIENTE', 'AGENTE', 'ATENCION', 'ADMIN')
  list(@CurrentUser() user: AuthUser) {
    return this.inquiriesService.list(user);
  }

  @Patch('inquiries/:id/answer')
  @Roles('AGENTE', 'ATENCION', 'ADMIN')
  answer(@Param('id') id: string, @Body() dto: AnswerInquiryDto, @CurrentUser() user: AuthUser) {
    return this.inquiriesService.answer(id, dto, user);
  }
}
