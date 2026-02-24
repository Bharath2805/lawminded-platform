import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly client: Resend | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.client = apiKey ? new Resend(apiKey) : null;
  }

  public getClient(): Resend | null {
    return this.client;
  }
}
