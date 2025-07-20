import React, { useState } from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const LoginPage: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, setError: setAuthError } = useAuthStore();

  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      setError('No credential received from Google');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Decode the JWT token to get user info (in a real app, you'd verify this on the backend)
      const userInfo = JSON.parse(atob(credentialResponse.credential.split('.')[1]));
      
      // For now, we'll create a user object from the Google JWT
      // In production, you'd send the credential to your backend for verification
      const user = {
        id: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        given_name: userInfo.given_name,
        family_name: userInfo.family_name,
        verified_email: userInfo.email_verified,
        hd: userInfo.hd
      };

      // Store the credential as auth token (in production, your backend would return a proper JWT)
      localStorage.setItem('auth-token', credentialResponse.credential);
      
      login(user);
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to sign in with Google. Please try again.');
      setAuthError('Failed to sign in with Google');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google sign-in was cancelled or failed. Please try again.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-primary-600 mb-6">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to Meet Transcription
          </h2>
          <p className="text-gray-600">
            Sign in with your Google account to access real-time meeting transcription and AI-powered insights
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl shadow-lg p-8 space-y-6">
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Sign in to your account</h3>
            <p className="text-sm text-gray-600">
              Use the same Google account you use for Google Meet
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Google Login Button */}
          <div className="flex flex-col items-center space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner size="md" className="mr-3" />
                <span className="text-gray-600">Signing you in...</span>
              </div>
            ) : (
              <GoogleLogin
                onSuccess={handleGoogleLogin}
                onError={handleGoogleError}
                size="large"
                text="signin_with"
                shape="rectangular"
                theme="outline"
                width="320"
              />
            )}
          </div>

          {/* Features */}
          <div className="border-t border-gray-200 pt-6">
            <h4 className="text-sm font-medium text-gray-900 mb-3">What you'll get:</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center">
                <svg className="h-4 w-4 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Real-time meeting transcription
              </li>
              <li className="flex items-center">
                <svg className="h-4 w-4 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                AI-powered meeting summaries
              </li>
              <li className="flex items-center">
                <svg className="h-4 w-4 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Voice-activated AI assistant
              </li>
              <li className="flex items-center">
                <svg className="h-4 w-4 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Meeting analytics and insights
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500">
          <p>
            By signing in, you agree to our{' '}
            <a href="#" className="text-primary-600 hover:text-primary-700">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-primary-600 hover:text-primary-700">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage; 