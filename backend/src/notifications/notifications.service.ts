import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private ready = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.initFirebase();
  }

  isReady() {
    return this.ready;
  }

  private initFirebase() {
    if (admin.apps.length) {
      this.ready = true;
      return;
    }

    const pathFromEnv =
      this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH') ||
      './config/firebase-service-account.json';
    const absolute = resolve(process.cwd(), pathFromEnv);

    if (!existsSync(absolute)) {
      this.logger.warn(
        `Firebase service account not found at ${absolute}. Reminder push notifications are disabled until the file is added.`,
      );
      this.ready = false;
      return;
    }

    try {
      const raw = readFileSync(absolute, 'utf8');
      const serviceAccount = JSON.parse(raw) as admin.ServiceAccount;
      if (
        !serviceAccount.projectId &&
        !(serviceAccount as { project_id?: string }).project_id
      ) {
        throw new Error('Invalid service account JSON');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId:
          this.config.get<string>('FIREBASE_PROJECT_ID') ||
          (serviceAccount as { project_id?: string }).project_id,
      });
      this.ready = true;
      this.logger.log('Firebase Admin initialized — FCM push enabled');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Firebase Admin init failed: ${message}`);
      this.ready = false;
    }
  }

  async sendToUser(userId: string, payload: PushPayload) {
    if (!this.ready) {
      return { sent: 0, skipped: true, reason: 'FCM_NOT_CONFIGURED' as const };
    }

    const devices = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { id: true, token: true },
    });

    if (!devices.length) {
      return { sent: 0, skipped: true, reason: 'NO_DEVICES' as const };
    }

    let sent = 0;
    const invalidTokenIds: string[] = [];

    for (const device of devices) {
      try {
        await admin.messaging().send({
          token: device.token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            ...(payload.data ?? {}),
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'orbit_reminders',
              sound: 'default',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
        });
        sent += 1;
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String((error as { code?: string }).code)
            : '';
        this.logger.warn(
          `FCM send failed user=${userId} tokenId=${device.id}: ${code || (error instanceof Error ? error.message : 'unknown')}`,
        );
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token') ||
          code.includes('invalid-argument')
        ) {
          invalidTokenIds.push(device.id);
        }
      }
    }

    if (invalidTokenIds.length) {
      await this.prisma.deviceToken.deleteMany({
        where: { id: { in: invalidTokenIds } },
      });
      this.logger.log(
        `Removed ${invalidTokenIds.length} invalid FCM token(s) for user=${userId}`,
      );
    }

    return { sent, skipped: false as const, devices: devices.length };
  }

  async notifyReminder(reminder: {
    id: string;
    userId: string;
    type: string;
    title: string;
    medicineName?: string | null;
    description?: string | null;
    dosage?: string | null;
  }) {
    const bodyParts = [
      reminder.medicineName,
      reminder.dosage,
      reminder.description,
    ].filter(Boolean);

    return this.sendToUser(reminder.userId, {
      title: reminder.title || 'ORBIT Reminder',
      body: bodyParts.length
        ? bodyParts.join(' · ')
        : 'You have a reminder due now',
      data: {
        type: 'REMINDER',
        reminderId: reminder.id,
        reminderType: reminder.type,
      },
    });
  }
}
