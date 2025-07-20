import { Request, Response } from 'express';

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export class AuthManager {
  private config: AuthConfig;

  constructor() {
    this.config = {
      clientId: process.env.MEET_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.MEET_OAUTH_CLIENT_SECRET || '',
      redirectUri: `${process.env.BASE_URL || 'http://localhost:8080'}/auth/callback`,
      scopes: [
        'https://www.googleapis.com/auth/meetings.space.readonly',
        'https://www.googleapis.com/auth/cloud-platform'
      ]
    };
  }

  /**
   * Generate OAuth2 authorization URL
   */
  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent'
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForTokens(code: string): Promise<AuthTokens> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in * 1000))
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: refreshToken, // Keep the original refresh token
      expiresAt: new Date(Date.now() + (data.expires_in * 1000))
    };
  }

  /**
   * Validate if token is still valid
   */
  isTokenValid(tokens: AuthTokens): boolean {
    return tokens.expiresAt > new Date();
  }
} 