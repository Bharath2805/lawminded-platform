import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { CreateNewsletterSubscriberDto } from './dto/create-newsletter-subscriber.dto';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  public async createDemoRequest(input: CreateDemoRequestDto) {
    const record = await this.prisma.demoRequest.create({
      data: {
        fullName: input.fullName,
        workEmail: input.workEmail.toLowerCase(),
        company: input.company,
        jobTitle: input.jobTitle,
        teamSize: input.teamSize,
        useCase: input.useCase,
        message: input.message,
        source: 'website',
      },
    });

    return { id: record.id, status: record.status };
  }

  public async createContactMessage(input: CreateContactMessageDto) {
    const record = await this.prisma.contactMessage.create({
      data: {
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        company: input.company,
        topic: input.topic,
        message: input.message,
        source: 'website',
      },
    });

    return { id: record.id };
  }

  public async createNewsletterSubscriber(
    input: CreateNewsletterSubscriberDto,
  ) {
    const email = input.email.toLowerCase();

    const record = await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      update: {
        fullName: input.fullName,
        status: 'SUBSCRIBED',
        subscribedAt: new Date(),
        unsubscribedAt: null,
        source: 'website',
      },
      create: {
        email,
        fullName: input.fullName,
        status: 'SUBSCRIBED',
        subscribedAt: new Date(),
        source: 'website',
      },
    });

    return { id: record.id, status: record.status };
  }
}
