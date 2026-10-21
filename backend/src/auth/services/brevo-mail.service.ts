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

  async sendOtpEmail(params: {
    to: string;
    code: string;
    fullName?: string;
    purpose?: 'register' | 'password_reset';
  }) {
    const minutes = Number(this.config.get('OTP_EXPIRES_MINUTES') || 10);
    const name = params.fullName?.trim() || 'there';
    const transporter = this.createTransporter();
    const safeName = escapeHtml(name);
    const safeCode = escapeHtml(params.code);
    const isReset = params.purpose === 'password_reset';
    const eyebrow = isReset ? 'Password reset' : 'Verification';
    const intro = isReset
      ? 'Use this one-time code to reset your password. Enter it in the app — do not share it with anyone.'
      : 'Use this one-time code to verify your account. Enter it in the app — do not share it with anyone.';
    const ignore = isReset
      ? 'If you didn’t request a password reset, you can ignore this email.'
      : 'If you didn’t request this, you can ignore this email.';
    const subject = isReset
      ? `${params.code} is your ORBIT password reset code`
      : `${params.code} is your ORBIT verification code`;

    try {
      await transporter.verify();
      const info = await transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: params.to,
        subject,
        text: [
          `Hi ${name},`,
          '',
          isReset
            ? `Your ORBIT password reset code is: ${params.code}`
            : `Your ORBIT verification code is: ${params.code}`,
          '',
          `This code expires in ${minutes} minutes.`,
          ignore,
          '',
          '— ORBIT',
        ].join('\n'),
        html: buildOtpEmailHtml({
          name: safeName,
          code: safeCode,
          minutes,
          brand: this.fromName,
          eyebrow,
          intro,
          ignore,
        }),
      });

      this.logger.log(
        `OTP email sent via Brevo SMTP to=${params.to} purpose=${params.purpose || 'register'} messageId=${info.messageId || 'n/a'}`,
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

/** Black-primary transactional OTP — table layout for email clients. */
function buildOtpEmailHtml(params: {
  name: string;
  code: string;
  minutes: number;
  brand: string;
  eyebrow?: string;
  intro?: string;
  ignore?: string;
}) {
  const { name, code, minutes, brand } = params;
  const year = new Date().getFullYear();
  const eyebrow = params.eyebrow || 'Verification';
  const intro =
    params.intro ||
    'Use this one-time code to verify your account. Enter it in the app — do not share it with anyone.';
  const ignore =
    params.ignore || 'If you didn’t request this, you can ignore this email.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(brand)} ${escapeHtml(eyebrow)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5;">
          <!-- Header -->
          <tr>
            <td style="background:#000000;padding:28px 32px;text-align:center;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:4px;color:#ffffff;">
                ${escapeHtml(brand)}
              </div>
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1px;color:#a3a3a3;margin-top:6px;text-transform:uppercase;">
                ${escapeHtml(eyebrow)}
              </div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;">
              <p style="margin:0 0 8px;font-size:16px;line-height:1.5;color:#171717;">
                Hi ${name},
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#525252;">
                ${escapeHtml(intro)}
              </p>
              <!-- Code block -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center" style="background:#0a0a0a;border-radius:12px;padding:24px 16px;">
                    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:#ffffff;line-height:1.2;">
                      ${code}
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#525252;text-align:center;">
                This code expires in <strong style="color:#171717;">${minutes} minutes</strong>.
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#737373;text-align:center;">
                ${escapeHtml(ignore)}
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #f0f0f0;text-align:center;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#a3a3a3;line-height:1.5;">
                © ${year} ${escapeHtml(brand)}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
