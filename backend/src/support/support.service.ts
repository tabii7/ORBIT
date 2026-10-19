import { Injectable } from '@nestjs/common';
import { BrevoMailService } from '../auth/services/brevo-mail.service';
import { ContactSupportDto } from './dto/contact-support.dto';

@Injectable()
export class SupportService {
  constructor(private readonly brevoMail: BrevoMailService) {}

  async contact(dto: ContactSupportDto) {
    const result = await this.brevoMail.sendSupportContactEmail({
      email: dto.email.trim().toLowerCase(),
      subject: dto.subject.trim(),
      description: dto.description.trim(),
    });

    return {
      sent: true,
      message: 'Your message has been sent to support',
      adminNotified: Boolean(result.ok),
    };
  }
}
