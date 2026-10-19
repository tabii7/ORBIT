import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCode, ApiSuccess } from '../common/response';
import { ContactSupportDto } from './dto/contact-support.dto';
import { SupportService } from './support.service';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('contact')
  @HttpCode(201)
  @ApiSuccess({
    code: ApiCode.SUPPORT_CONTACT_SENT,
    message: 'Support message sent successfully',
  })
  @ApiOperation({
    summary: 'Contact support',
    description:
      'Public endpoint. Sends **email**, **subject**, and **description** to the admin inbox via Brevo. ' +
      'Admin address = `SUPPORT_ADMIN_EMAIL` (fallback `BREVO_FROM_EMAIL`). Reply-To = user email.',
  })
  contact(@Body() dto: ContactSupportDto) {
    return this.supportService.contact(dto);
  }
}
