import { AuthError } from '@supabase/supabase-js';

export function formatAuthError(error: unknown, fallback = 'Unable to complete authentication.'): string {
  if (!error) {
    return fallback;
  }

  if (error instanceof AuthError) {
    switch (error.code) {
      case 'email_not_confirmed':
        return 'Unable to sign in. Please try again.';
      case 'invalid_credentials':
        return 'Incorrect username or password. Please try again.';
      case 'validation_failed':
        return error.message?.toLowerCase().includes('missing email')
          ? 'Username is required.'
          : error.message || fallback;
      case 'user_not_found':
        return 'No account found. Please sign up first.';
      case 'too_many_requests':
        return 'Too many attempts. Please wait a few minutes and try again.';
      default:
        return error.message || fallback;
    }
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}