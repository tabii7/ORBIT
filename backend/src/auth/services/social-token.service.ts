import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export type VerifiedSocialIdentity = {
  providerUserId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
};

@Injectable()
export class SocialTokenService {
  private readonly googleClient: OAuth2Client;
  private readonly firebaseProjectId: string;
  private readonly googleAudiences: string[];
  private readonly microsoftClientId?: string;
  private readonly facebookAppId?: string;
  private readonly microsoftJwks = jwksClient({
    jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
    cache: true,
    rateLimit: true,
  });

  constructor(private readonly config: ConfigService) {
    this.googleClient = new OAuth2Client();
    this.firebaseProjectId = this.config.getOrThrow<string>(
      'FIREBASE_PROJECT_ID',
    );
    this.googleAudiences = [
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
      this.config.get<string>('GOOGLE_IOS_CLIENT_ID'),
    ].filter((id): id is string => Boolean(id && id.trim()));
    this.microsoftClientId = this.config.get<string>('MICROSOFT_CLIENT_ID');
    this.facebookAppId = this.config.get<string>('FACEBOOK_APP_ID');
  }

  async verify(
    provider: 'google' | 'facebook' | 'microsoft',
    idToken: string,
  ): Promise<VerifiedSocialIdentity> {
    const firebaseIdentity = await this.tryVerifyFirebaseToken(idToken);
    if (firebaseIdentity) {
      return firebaseIdentity;
    }

    switch (provider) {
      case 'google':
        return this.verifyGoogleToken(idToken);
      case 'microsoft':
        return this.verifyMicrosoftToken(idToken);
      case 'facebook':
        return this.verifyFacebookToken(idToken);
      default:
        throw new UnauthorizedException('Unsupported social provider');
    }
  }

  private async tryVerifyFirebaseToken(
    idToken: string,
  ): Promise<VerifiedSocialIdentity | null> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.firebaseProjectId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        return null;
      }

      const issuer = payload.iss ?? '';
      if (
        issuer !== `https://securetoken.google.com/${this.firebaseProjectId}`
      ) {
        return null;
      }

      return {
        providerUserId: payload.sub,
        email: payload.email.toLowerCase(),
        fullName: payload.name ?? payload.email.split('@')[0],
        avatarUrl: payload.picture,
      };
    } catch {
      return null;
    }
  }

  private async verifyGoogleToken(
    idToken: string,
  ): Promise<VerifiedSocialIdentity> {
    if (!this.googleAudiences.length) {
      throw new UnauthorizedException('Google client ID is not configured');
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleAudiences,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        throw new UnauthorizedException('Invalid Google token');
      }

      return {
        providerUserId: payload.sub,
        email: payload.email.toLowerCase(),
        fullName: payload.name ?? payload.email.split('@')[0],
        avatarUrl: payload.picture,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  private async verifyMicrosoftToken(
    idToken: string,
  ): Promise<VerifiedSocialIdentity> {
    if (!this.microsoftClientId) {
      throw new UnauthorizedException('Microsoft client ID is not configured');
    }

    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new UnauthorizedException('Invalid Microsoft token');
    }

    const key = await this.microsoftJwks.getSigningKey(decoded.header.kid);
    const signingKey = key.getPublicKey();
    const payload = jwt.verify(idToken, signingKey, {
      algorithms: ['RS256'],
      audience: this.microsoftClientId,
    }) as jwt.JwtPayload;

    const email = (payload.preferred_username ?? payload.email) as
      | string
      | undefined;
    if (!payload.sub || !email) {
      throw new UnauthorizedException('Invalid Microsoft token');
    }

    return {
      providerUserId: payload.sub,
      email: email.toLowerCase(),
      fullName: (payload.name as string | undefined) ?? email.split('@')[0],
      avatarUrl: undefined,
    };
  }

  private async verifyFacebookToken(
    accessToken: string,
  ): Promise<VerifiedSocialIdentity> {
    if (!this.facebookAppId) {
      throw new UnauthorizedException('Facebook app ID is not configured');
    }

    // Flutter sends a Facebook *access* token (EAA…), not a JWT id_token.
    try {
      const debugUrl = new URL('https://graph.facebook.com/debug_token');
      debugUrl.searchParams.set('input_token', accessToken);
      debugUrl.searchParams.set('access_token', accessToken);

      const debugRes = await fetch(debugUrl);
      if (debugRes.ok) {
        const debugJson = (await debugRes.json()) as {
          data?: { app_id?: string; is_valid?: boolean; user_id?: string };
        };
        const data = debugJson.data;
        if (data?.is_valid === false) {
          throw new UnauthorizedException('Invalid Facebook token');
        }
        if (data?.app_id && data.app_id !== this.facebookAppId) {
          throw new UnauthorizedException('Invalid Facebook token audience');
        }
      }

      const meUrl = new URL('https://graph.facebook.com/me');
      meUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');
      meUrl.searchParams.set('access_token', accessToken);

      const meRes = await fetch(meUrl);
      if (!meRes.ok) {
        throw new UnauthorizedException('Invalid Facebook token');
      }

      const me = (await meRes.json()) as {
        id?: string;
        name?: string;
        email?: string;
        picture?: { data?: { url?: string } };
        error?: { message?: string };
      };

      if (me.error || !me.id) {
        throw new UnauthorizedException('Invalid Facebook token');
      }

      if (!me.email) {
        throw new UnauthorizedException(
          'Facebook account has no email. Grant email permission and try again.',
        );
      }

      return {
        providerUserId: me.id,
        email: me.email.toLowerCase(),
        fullName: me.name ?? me.email.split('@')[0],
        avatarUrl: me.picture?.data?.url,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Facebook token');
    }
  }
}
