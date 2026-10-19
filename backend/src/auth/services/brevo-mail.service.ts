import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Brevo email via SMTP (smtp-relay.brevo.com).
 * Login: BREVO_SMTP_USER (e.g. xxx@smtp-brevo.com)
 * Password: BREVO_SMTP_KEY (xsmtpsib-...)
 * From: BREVO_FROM_EMAIL (verified sender in Brevo)
 */
@Injectable()
export class BrevoMailService {
  private readonly logger = new Logger(BrevoMailService.name);

  constructor(private readonly config: ConfigService) {}

  private get smtpUser() {
    return (this.config.get<string>('BREVO_SMTP_USER') || '').trim();
  }

  private get smtpKey() {
    return (
      this.config.get<string>('BREVO_SMTP_KEY') ||
      this.config.get<string>('BREVO_API_KEY') ||
      ''
    ).trim();
  }

  private get fromEmail() {
    return (this.config.get<string>('BREVO_FROM_EMAIL') || '').trim();
  }

  private get fromName() {
    return this.config.get<string>('BREVO_FROM_NAME') || 'ORBIT';
  }

  isConfigured() {
    return Boolean(this.smtpUser && this.smtpKey && this.fromEmail);
  }

  /** Inbox that receives Contact Support messages. */
  get supportAdminEmail() {
    return (
      this.config.get<string>('SUPPORT_ADMIN_EMAIL') ||
      this.config.get<string>('BREVO_FROM_EMAIL') ||
      ''
    ).trim();
  }

  private createTransporter() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Email is not configured. Set BREVO_SMTP_USER, BREVO_SMTP_KEY, and BREVO_FROM_EMAIL in backend .env',
      );
    }
    const host =
      this.config.get<string>('BREVO_SMTP_HOST') || 'smtp-relay.brevo.com';
    const port = Number(this.config.get('BREVO_SMTP_PORT') || 587);
    return nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: {
        user: this.smtpUser,
        pass: this.smtpKey,
      },
    });
  }

  async sendOtpEmail(params: { to: string; code: string; fullName?: string }) {
    const minutes = Number(this.config.get('OTP_EXPIRES_MINUTES') || 10);
    const name = params.fullName?.trim() || 'there';
    const transporter = this.createTransporter();

    try {
      await transporter.verify();
      const info = await transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: params.to,
        subject: `${params.code} is your ORBIT verification code`,
        text: [
          `Hi ${name},`,
          '',
          `Your ORBIT verification code is: ${params.code}`,
          '',
          `This code expires in ${minutes} minutes.`,
          'If you did not create an ORBIT account, ignore this email.',
        ].join('\n'),
        html: [
          `<p>Hi ${name},</p>`,
          `<p>Your ORBIT verification code is:</p>`,
          `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${params.code}</p>`,
          `<p>This code expires in ${minutes} minutes.</p>`,
          `<p>If you did not create an ORBIT account, ignore this email.</p>`,
        ].join(''),
      });

      this.logger.log(
        `OTP email sent via Brevo SMTP to=${params.to} messageId=${info.messageId || 'n/a'}`,
      );
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`OTP email failed to=${params.to}: ${message}`);
      throw new ServiceUnavailableException(
        `Failed to send verification email: ${message}`,
      );
    }
  }

  /**
   * Contact Support → email admin with user email, subject, description.
   * Reply-To is set to the user's email so admin can reply directly.
   */
  async sendSupportContactEmail(params: {
    email: string;
    subject: string;
    description: string;
  }) {
    const adminTo = this.supportAdminEmail;
    if (!adminTo) {
      throw new ServiceUnavailableException(
        'SUPPORT_ADMIN_EMAIL is not configured',
      );
    }

    const transporter = this.createTransporter();
    const subject = `[ORBIT Support] ${params.subject}`.slice(0, 200);

    try {
      await transporter.verify();
      const info = await transporter.sendMail({
        from: `"${this.fromName} Support" <${this.fromEmail}>`,
        to: adminTo,
        replyTo: params.email,
        subject,
        text: [
          'New Contact Support message from ORBIT app',
          '',
          `From: ${params.email}`,
          `Subject: ${params.subject}`,
          '',
          'Description:',
          params.description,
          '',
          '— ORBIT Contact Support',
        ].join('\n'),
        html: [
          `<h2>New Contact Support message</h2>`,
          `<p><strong>From:</strong> ${escapeHtml(params.email)}</p>`,
          `<p><strong>Subject:</strong> ${escapeHtml(params.subject)}</p>`,
          `<p><strong>Description:</strong></p>`,
          `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(params.description)}</pre>`,
          `<p style="color:#666">Reply to this email to respond to the user.</p>`,
        ].join(''),
      });

      this.logger.log(
        `Support contact emailed admin=${adminTo} from=${params.email} messageId=${info.messageId || 'n/a'}`,
      );
      return { ok: true as const, adminTo, messageId: info.messageId || null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Support contact email failed from=${params.email}: ${message}`,
      );
      throw new ServiceUnavailableException(
        `Failed to send support message: ${message}`,
      );
    }
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
