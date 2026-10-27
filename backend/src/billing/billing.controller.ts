import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/billing.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly config: ConfigService,
  ) {}

  @Get('plans')
  @ApiSuccess({
    code: ApiCode.FETCHED,
    message: 'Subscription plans fetched successfully',
  })
  @ApiOperation({
    summary: 'List subscription plans (Basic / Plus / Pro)',
    description:
      'Public. Each plan has MONTHLY and YEARLY prices with creditsPerPeriod.',
  })
  listPlans() {
    return this.billingService.listPlans();
  }

  @Get('config')
  @ApiSuccess({
    code: ApiCode.FETCHED,
    message: 'Billing config fetched successfully',
  })
  @ApiOperation({
    summary: 'Public Stripe publishable key + credit costs (for Flutter)',
  })
  configPublic() {
    return {
      publishableKey: (
        this.config.get<string>('STRIPE_PUBLISHABLE_KEY') || ''
      ).trim(),
      stripeEnabled: Boolean(
        (this.config.get<string>('STRIPE_SECRET_KEY') || '').trim(),
      ),
      signupBonusCredits: Number(
        this.config.get('SIGNUP_BONUS_CREDITS') || 20,
      ),
      chatCreditCost: Number(this.config.get('CHAT_CREDIT_COST') || 3),
      chatAttachmentExtraCredits: Number(
        this.config.get('CHAT_ATTACHMENT_EXTRA_CREDITS') || 2,
      ),
    };
  }

  @Get('success')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Checkout success landing page' })
  successPage(
    @Query('session_id') sessionId: string | undefined,
    @Res() res: Response,
  ) {
    const id = sessionId ? String(sessionId) : '';
    res.type('html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ORBIT — Payment successful</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0a0a0a;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{max-width:420px;padding:32px;border:1px solid #333;border-radius:16px;text-align:center}
h1{font-size:22px;margin:0 0 12px}p{color:#a3a3a3;line-height:1.5}
code{font-size:11px;color:#737373;word-break:break-all}
</style></head><body><div class="card">
<h1>Payment successful</h1>
<p>Your ORBIT subscription is activating. Credits will appear in the app shortly — open ORBIT and pull to refresh billing.</p>
${id ? `<p><code>${id.replace(/[<>&]/g, '')}</code></p>` : ''}
</div></body></html>`);
  }

  @Get('cancel')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Checkout cancel landing page' })
  cancelPage(@Res() res: Response) {
    res.type('html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ORBIT — Checkout canceled</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0a0a0a;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{max-width:420px;padding:32px;border:1px solid #333;border-radius:16px;text-align:center}
h1{font-size:22px;margin:0 0 12px}p{color:#a3a3a3;line-height:1.5}
</style></head><body><div class="card">
<h1>Checkout canceled</h1>
<p>No charge was made. You can return to ORBIT and try again anytime.</p>
</div></body></html>`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiSuccess({
    code: ApiCode.FETCHED,
    message: 'Billing status fetched successfully',
  })
  @ApiOperation({
    summary: 'My plan, credit balance, and recent ledger',
  })
  me(@CurrentUser() user: AuthUser) {
    return this.billingService.getMyBilling(user.id);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiSuccess({
    code: ApiCode.BILLING_CHECKOUT_CREATED,
    message: 'Checkout session created',
  })
  @ApiOperation({
    summary: 'Create Stripe Checkout for a plan (monthly or yearly)',
    description:
      'Returns checkoutUrl — open in browser / WebView. Credits granted via webhook after payment.',
  })
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CreateCheckoutDto) {
    return this.billingService.createCheckout(user.id, dto);
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiSuccess({
    code: ApiCode.BILLING_PORTAL_CREATED,
    message: 'Billing portal session created',
  })
  @ApiOperation({
    summary: 'Open Stripe Customer Portal (cancel / change plan)',
  })
  portal(@CurrentUser() user: AuthUser) {
    return this.billingService.createPortal(user.id);
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Stripe webhook (raw body)' })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const raw = req.rawBody;
    if (!raw || !signature) {
      return { received: false, error: 'Missing raw body or stripe-signature' };
    }
    return this.billingService.handleWebhook(raw, signature);
  }
}
