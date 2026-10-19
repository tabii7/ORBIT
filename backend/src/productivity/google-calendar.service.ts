import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';

export type GoogleCalendarEventPayload = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  etag?: string;
  status?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isOAuthConfigured() {
    return Boolean(
      this.config.get<string>('GOOGLE_CLIENT_ID') &&
        this.config.get<string>('GOOGLE_CLIENT_SECRET'),
    );
  }

  private oauthClient() {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured',
      );
    }
    return new OAuth2Client(clientId, clientSecret);
  }

  async status(userId: string) {
    const conn = await this.prisma.googleCalendarConnection.findUnique({
      where: { userId },
    });
    return {
      connected: Boolean(conn),
      googleEmail: conn?.googleEmail ?? null,
      calendarId: conn?.calendarId ?? null,
      lastSyncAt: conn?.lastSyncAt ?? null,
      oauthConfigured: this.isOAuthConfigured(),
      scopes: conn?.scopes ?? null,
    };
  }

  /**
   * Connect Google Calendar.
   * Prefer `serverAuthCode` from Flutter GoogleSignIn(serverClientId: WEB_CLIENT_ID).
   * Or pass `refreshToken` directly (advanced / already exchanged).
   */
  async connect(
    userId: string,
    input: {
      serverAuthCode?: string;
      refreshToken?: string;
      accessToken?: string;
      expiresIn?: number;
      googleEmail?: string;
    },
  ) {
    let refreshToken = input.refreshToken?.trim();
    let accessToken = input.accessToken?.trim();
    let tokenExpiry: Date | undefined =
      input.expiresIn && accessToken
        ? new Date(Date.now() + input.expiresIn * 1000)
        : undefined;
    let scopes =
      'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email';
    let googleEmail = input.googleEmail;

    if (input.serverAuthCode?.trim()) {
      if (!this.isOAuthConfigured()) {
        throw new ServiceUnavailableException(
          'Set GOOGLE_CLIENT_SECRET to exchange serverAuthCode',
        );
      }
      const client = this.oauthClient();
      const { tokens } = await client.getToken(input.serverAuthCode.trim());
      refreshToken = tokens.refresh_token || refreshToken;
      accessToken = tokens.access_token || accessToken;
      if (tokens.expiry_date) {
        tokenExpiry = new Date(tokens.expiry_date);
      }
      if (tokens.scope) scopes = tokens.scope;
    }

    // Reconnect: Google often omits refresh_token on repeat consent — keep existing
    const existing = await this.prisma.googleCalendarConnection.findUnique({
      where: { userId },
    });
    if (!refreshToken && existing?.refreshToken) {
      refreshToken = existing.refreshToken;
    }

    if (!refreshToken) {
      throw new BadRequestException(
        'Provide serverAuthCode (preferred) or refreshToken. Flutter must use serverClientId=GOOGLE_CLIENT_ID and request offline access (prompt=consent once).',
      );
    }

    const access = await this.getAccessTokenFromRefresh(refreshToken);
    accessToken = access.accessToken;
    tokenExpiry = access.expiry;

    if (!googleEmail) {
      googleEmail = await this.fetchGoogleEmail(accessToken);
    }

    const conn = await this.prisma.googleCalendarConnection.upsert({
      where: { userId },
      create: {
        userId,
        refreshToken,
        accessToken,
        tokenExpiry,
        googleEmail,
        calendarId: 'primary',
        scopes,
      },
      update: {
        refreshToken,
        accessToken,
        tokenExpiry,
        googleEmail,
        scopes,
      },
    });

    return {
      connected: true,
      googleEmail: conn.googleEmail,
      calendarId: conn.calendarId,
      message:
        'Google Calendar connected. Call POST /api/productivity/calendar/google/sync to import events.',
    };
  }

  async disconnect(userId: string) {
    const conn = await this.prisma.googleCalendarConnection.findUnique({
      where: { userId },
    });
    if (conn) {
      try {
        await this.oauthClient().revokeToken(
          conn.accessToken || conn.refreshToken,
        );
      } catch {
        // ignore revoke errors
      }
      await this.prisma.googleCalendarConnection.delete({ where: { userId } });
    }
    return { connected: false, deleted: true };
  }

  async getValidAccessToken(userId: string) {
    const conn = await this.prisma.googleCalendarConnection.findUnique({
      where: { userId },
    });
    if (!conn) return null;

    const stillValid =
      conn.accessToken &&
      conn.tokenExpiry &&
      conn.tokenExpiry.getTime() > Date.now() + 60_000;

    if (stillValid) {
      return { accessToken: conn.accessToken!, conn };
    }

    const refreshed = await this.getAccessTokenFromRefresh(conn.refreshToken);
    const updated = await this.prisma.googleCalendarConnection.update({
      where: { userId },
      data: {
        accessToken: refreshed.accessToken,
        tokenExpiry: refreshed.expiry,
      },
    });
    return { accessToken: refreshed.accessToken, conn: updated };
  }

  private async getAccessTokenFromRefresh(refreshToken: string) {
    const client = this.oauthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new BadRequestException('Failed to refresh Google access token');
    }
    return {
      accessToken: credentials.access_token,
      expiry: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3500_000),
    };
  }

  private async fetchGoogleEmail(accessToken: string) {
    try {
      const res = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return undefined;
      const data = (await res.json()) as { email?: string };
      return data.email;
    } catch {
      return undefined;
    }
  }

  async listEvents(
    userId: string,
    opts?: { timeMin?: Date; timeMax?: Date; maxResults?: number },
  ): Promise<GoogleCalendarEventPayload[]> {
    const auth = await this.getValidAccessToken(userId);
    if (!auth) {
      throw new BadRequestException('Google Calendar not connected');
    }

    const calendarId = encodeURIComponent(auth.conn.calendarId || 'primary');
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(opts?.maxResults ?? 100),
    });
    if (opts?.timeMin) params.set('timeMin', opts.timeMin.toISOString());
    if (opts?.timeMax) params.set('timeMax', opts.timeMax.toISOString());

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Google list events failed: ${res.status} ${text}`);
      throw new BadRequestException(
        `Google Calendar list failed (${res.status})`,
      );
    }
    const data = (await res.json()) as { items?: GoogleCalendarEventPayload[] };
    return (data.items ?? []).filter((e) => e.status !== 'cancelled');
  }

  async insertEvent(
    userId: string,
    event: {
      title: string;
      description?: string | null;
      location?: string | null;
      startAt: Date;
      endAt?: Date | null;
      allDay?: boolean;
      timezone?: string;
    },
  ) {
    const auth = await this.getValidAccessToken(userId);
    if (!auth) return null;

    const timezone = event.timezone || 'Asia/Dubai';
    const endAt =
      event.endAt ||
      new Date(event.startAt.getTime() + 60 * 60 * 1000);

    const body = event.allDay
      ? {
          summary: event.title,
          description: event.description || undefined,
          location: event.location || undefined,
          start: {
            date: event.startAt.toISOString().slice(0, 10),
          },
          end: {
            date: endAt.toISOString().slice(0, 10),
          },
        }
      : {
          summary: event.title,
          description: event.description || undefined,
          location: event.location || undefined,
          start: {
            dateTime: event.startAt.toISOString(),
            timeZone: timezone,
          },
          end: {
            dateTime: endAt.toISOString(),
            timeZone: timezone,
          },
        };

    const calendarId = encodeURIComponent(auth.conn.calendarId || 'primary');
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Google insert event failed: ${res.status} ${text}`);
      return null;
    }
    return (await res.json()) as GoogleCalendarEventPayload;
  }

  async updateEvent(
    userId: string,
    externalEventId: string,
    event: {
      title: string;
      description?: string | null;
      location?: string | null;
      startAt: Date;
      endAt?: Date | null;
      allDay?: boolean;
      timezone?: string;
    },
  ) {
    const auth = await this.getValidAccessToken(userId);
    if (!auth) return null;

    const timezone = event.timezone || 'Asia/Dubai';
    const endAt =
      event.endAt ||
      new Date(event.startAt.getTime() + 60 * 60 * 1000);

    const body = event.allDay
      ? {
          summary: event.title,
          description: event.description || undefined,
          location: event.location || undefined,
          start: { date: event.startAt.toISOString().slice(0, 10) },
          end: { date: endAt.toISOString().slice(0, 10) },
        }
      : {
          summary: event.title,
          description: event.description || undefined,
          location: event.location || undefined,
          start: {
            dateTime: event.startAt.toISOString(),
            timeZone: timezone,
          },
          end: {
            dateTime: endAt.toISOString(),
            timeZone: timezone,
          },
        };

    const calendarId = encodeURIComponent(auth.conn.calendarId || 'primary');
    const eventId = encodeURIComponent(externalEventId);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Google update event failed: ${res.status} ${text}`);
      return null;
    }
    return (await res.json()) as GoogleCalendarEventPayload;
  }

  async deleteEvent(userId: string, externalEventId: string) {
    const auth = await this.getValidAccessToken(userId);
    if (!auth) return false;

    const calendarId = encodeURIComponent(auth.conn.calendarId || 'primary');
    const eventId = encodeURIComponent(externalEventId);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      },
    );
    return res.ok || res.status === 404;
  }

  parseGoogleTimes(ev: GoogleCalendarEventPayload) {
    const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
    const startAt = ev.start?.dateTime
      ? new Date(ev.start.dateTime)
      : ev.start?.date
        ? new Date(`${ev.start.date}T00:00:00.000Z`)
        : null;
    const endAt = ev.end?.dateTime
      ? new Date(ev.end.dateTime)
      : ev.end?.date
        ? new Date(`${ev.end.date}T00:00:00.000Z`)
        : null;
    return { allDay, startAt, endAt };
  }

  /** Import Google events into ORBIT CalendarEvent (upsert by externalEventId). */
  async syncFromGoogle(userId: string, daysAhead = 90) {
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 7);
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + daysAhead);

    const remote = await this.listEvents(userId, {
      timeMin,
      timeMax,
      maxResults: 250,
    });

    let upserted = 0;
    for (const ev of remote) {
      if (!ev.id || !ev.summary) continue;
      const { allDay, startAt, endAt } = this.parseGoogleTimes(ev);
      if (!startAt) continue;

      await this.prisma.calendarEvent.upsert({
        where: {
          userId_externalProvider_externalEventId: {
            userId,
            externalProvider: 'google',
            externalEventId: ev.id,
          },
        },
        create: {
          userId,
          title: ev.summary,
          description: ev.description,
          location: ev.location,
          startAt,
          endAt: endAt ?? undefined,
          allDay,
          externalProvider: 'google',
          externalEventId: ev.id,
          externalEtag: ev.etag,
        },
        update: {
          title: ev.summary,
          description: ev.description,
          location: ev.location,
          startAt,
          endAt: endAt ?? null,
          allDay,
          externalEtag: ev.etag,
        },
      });
      upserted += 1;
    }

    await this.prisma.googleCalendarConnection.update({
      where: { userId },
      data: { lastSyncAt: new Date() },
    });

    return {
      ok: true,
      imported: upserted,
      window: { timeMin, timeMax },
    };
  }
}
