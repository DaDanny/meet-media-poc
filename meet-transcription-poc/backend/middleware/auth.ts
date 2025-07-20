import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { databaseService } from '../services/database';
import { User, AuthTokenPayload } from '../types';

// Google OAuth Client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

/**
 * Middleware to verify JWT token and attach user to request
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
        code: 'TOKEN_REQUIRED'
      });
    }

    // For development: Handle Google JWT tokens directly
    if (token.split('.').length === 3) {
      try {
        // Try to verify as our JWT first
        const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
        const user = await databaseService.getUser(decoded.userId);
        
        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND'
          });
        }

        req.user = user;
        req.userId = user.id;
        next();
      } catch (jwtError) {
        // If our JWT verification fails, try Google JWT
        try {
          const googleDecoded = await verifyGoogleToken(token);
          
          // Get or create user from Google token
          const user = await databaseService.createOrUpdateUser({
            id: googleDecoded.sub,
            email: googleDecoded.email,
            name: googleDecoded.name,
            picture: googleDecoded.picture,
            given_name: googleDecoded.given_name,
            family_name: googleDecoded.family_name,
            verified_email: googleDecoded.email_verified,
            hd: googleDecoded.hd
          });

          req.user = user;
          req.userId = user.id;
          next();
        } catch (googleError) {
          return res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
          });
        }
      }
    } else {
      return res.status(401).json({
        success: false,
        error: 'Invalid token format',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      // If token is provided, try to authenticate
      await authenticateToken(req, res, next);
    } else {
      // If no token, continue without user
      next();
    }
  } catch (error) {
    // If authentication fails, continue without user
    next();
  }
};

/**
 * Verify Google JWT token
 */
async function verifyGoogleToken(token: string): Promise<any> {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid Google token payload');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      given_name: payload.given_name,
      family_name: payload.family_name,
      email_verified: payload.email_verified,
      hd: payload.hd
    };
  } catch (error) {
    console.error('Google token verification failed:', error);
    throw new Error('Invalid Google token');
  }
}

/**
 * Generate our own JWT token for a user
 */
export function generateJWTToken(user: User): string {
  const payload: AuthTokenPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d', // Token expires in 7 days
    issuer: 'meet-transcription-api',
    audience: 'meet-transcription-app'
  });
}

/**
 * Verify and decode JWT token without Express middleware
 */
export function verifyJWTToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

/**
 * Google OAuth URL generation
 */
export function getGoogleAuthUrl(): string {
  const scopes = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/meetings.space',
  ];

  return googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    include_granted_scopes: true,
    prompt: 'consent',
  });
}

/**
 * Exchange Google OAuth code for tokens and user info
 */
export async function exchangeGoogleCode(code: string): Promise<{ user: User; token: string }> {
  try {
    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    
    if (!tokens.id_token) {
      throw new Error('No ID token received from Google');
    }

    // Verify and decode the ID token
    const googleUser = await verifyGoogleToken(tokens.id_token);

    // Create or update user in our database
    const user = await databaseService.createOrUpdateUser({
      id: googleUser.sub,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      given_name: googleUser.given_name,
      family_name: googleUser.family_name,
      verified_email: googleUser.email_verified,
      hd: googleUser.hd
    });

    // Generate our own JWT token
    const jwtToken = generateJWTToken(user);

    return { user, token: jwtToken };
  } catch (error) {
    console.error('Google OAuth exchange failed:', error);
    throw new Error('Failed to exchange Google OAuth code');
  }
}

/**
 * Refresh JWT token
 */
export async function refreshUserToken(currentToken: string): Promise<string> {
  try {
    const decoded = verifyJWTToken(currentToken);
    const user = await databaseService.getUser(decoded.userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Generate new token
    return generateJWTToken(user);
  } catch (error) {
    console.error('Token refresh failed:', error);
    throw new Error('Failed to refresh token');
  }
} 