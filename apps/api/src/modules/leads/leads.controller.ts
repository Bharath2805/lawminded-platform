import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { CreateNewsletterSubscriberDto } from './dto/create-newsletter-subscriber.dto';
import { LeadsService } from './leads.service';

@Controller('api/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('demo-request')
  @HttpCode(HttpStatus.CREATED)
  public createDemoRequest(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateDemoRequestDto,
  ) {
    return this.leadsService.createDemoRequest(body);
  }

  @Post('contact')
  @HttpCode(HttpStatus.CREATED)
  public createContact(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateContactMessageDto,
  ) {
    return this.leadsService.createContactMessage(body);
  }

  @Post('newsletter')
  @HttpCode(HttpStatus.CREATED)
  public createNewsletter(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateNewsletterSubscriberDto,
  ) {
    return this.leadsService.createNewsletterSubscriber(body);
  }
}
