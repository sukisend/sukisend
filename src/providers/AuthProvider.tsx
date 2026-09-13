import { Session } from '@supabase/supabase-js';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { supabase, supabaseUrl } from '../lib/supabase';
import { fetchActiveCustomerRestriction } from '../services/chatModerationService';
import { AppProfile, UserRole } from '../types/models';
import { formatAuthError } from '../utils/authErrors';

interface SignUpMetadata {
  sitio?: string;
  barangay?: string;
  municipality?: string;
  province?: string;
  secret_question?: string;
  secret_answer?: string;
  contact_number?: string;
  birthdate?: string;
}

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  profile: AppProfile | null;
  role: UserRole;
  signIn: (email: string, password: string, asAdmin?: boolean) => Promise<string | null>;
  signUp: (name: string, username: string, password: string, metadata?: SignUpMetadata) => Promise<string | null>;
  resendSignupConfirmation: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeRole(role?: string): Exclude<UserRole, 'guest'> {
  if (role === 'admin') {
    return 'admin';
  }
  if (role === 'rider') {
    return 'rider';
  }
  return 'customer';
}

function usernameToEmail(username: string): string {
  const host = supabaseUrl
    ? new URL(supabaseUrl).hostname
    : 'sukisend.app';
  return `${username.toLowerCase()}@${host}`;
}

async function resolveProfile(session: Session): Promise<AppProfile | null> {
  const user = session.user;
  const email = user.email ?? '';

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, username, sitio, barangay, municipality, province, secret_question, secret_answer, contact_number, birthdate, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return {
      id: data.id,
      email,
      fullName: data.full_name || email.split('@')[0] || 'Suki User',
      role: normalizeRole(data.role),
      username: data.username || email.split('@')[0] || '',
      sitio: data.sitio || '',
      barangay: data.barangay || '',
      municipality: data.municipality || '',
      province: data.province || '',
      secretQuestion: data.secret_question || '',
      secretAnswer: data.secret_answer || '',
      contactNumber: data.contact_number || '',
      birthdate: data.birthdate || '',
      avatarUrl: data.avatar_url || '',
    };
  }

  const metadata = user.user_metadata ?? {};
  const role: Exclude<UserRole, 'guest'> = 'customer';
  const fullName = metadata.full_name ?? email.split('@')[0] ?? 'Suki User';

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        full_name: fullName,
        role,
        username: metadata.username ?? email.split('@')[0] ?? '',
        sitio: metadata.sitio ?? '',
        barangay: metadata.barangay ?? '',
        municipality: metadata.municipality ?? '',
        province: metadata.province ?? '',
        secret_question: metadata.secret_question ?? '',
        secret_answer: metadata.secret_answer ?? '',
        contact_number: metadata.contact_number ?? '',
        birthdate: metadata.birthdate ?? '',
      },
      { onConflict: 'id' },
    )
    .select('id, full_name, role, username, sitio, barangay, municipality, province, secret_question, secret_answer, contact_number, birthdate, avatar_url')
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return {
    id: created.id,
    email,
    fullName: created.full_name || fullName,
    role: normalizeRole(created.role),
    username: created.username || email.split('@')[0] || '',
    sitio: created.sitio || '',
    barangay: created.barangay || '',
    municipality: created.municipality || '',
    province: created.province || '',
    secretQuestion: created.secret_question || '',
    secretAnswer: created.secret_answer || '',
    contactNumber: created.contact_number || '',
    birthdate: created.birthdate || '',
    avatarUrl: created.avatar_url || '',
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!session) {
      setProfile(null);
      return;
    }

    try {
      const nextProfile = await resolveProfile(session);
      setProfile(nextProfile);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (error) {
          throw error;
        }

        setSession(data.session ?? null);
        if (data.session) {
          const nextProfile = await resolveProfile(data.session);
          setProfile(nextProfile);
        } else {
          setProfile(null);
        }
      })
      .catch(() => {
        setSession(null);
        setProfile(null);
      })
      .finally(() => {
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (!nextSession) {
        setProfile(null);
        return;
      }

      resolveProfile(nextSession)
        .then((nextProfile) => setProfile(nextProfile))
        .catch(() => setProfile(null));
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, asAdmin = false) => {
    const normalizedInput = email.trim();
    const normalizedPassword = password;

    if (!normalizedInput) {
      return 'Username or email is required.';
    }

    if (!normalizedPassword) {
      return 'Password is required.';
    }

    try {
      let resolvedEmail = normalizedInput;

      if (!normalizedInput.includes('@')) {
        resolvedEmail = usernameToEmail(normalizedInput);
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password: normalizedPassword,
      });
      if (error) {
        return formatAuthError(error, 'Unable to sign in.');
      }

      const {
        data: { session: nextSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !nextSession) {
        return 'Unable to verify your session. Please try again.';
      }

      const resolved = await resolveProfile(nextSession);
      setProfile(resolved);
      setSession(nextSession);

      if (asAdmin && !['admin', 'rider'].includes(resolved?.role ?? '')) {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        return 'This account is not registered as staff.';
      }

      if (!asAdmin && resolved?.role === 'customer') {
        const activeRestriction = await fetchActiveCustomerRestriction(resolved.id);
        if (activeRestriction && ['restricted', 'banned'].includes(activeRestriction.severity)) {
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          const untilLabel = activeRestriction.endsAt
            ? `until ${new Date(activeRestriction.endsAt).toLocaleString()}`
            : 'permanently';
          return `Your account is currently restricted ${untilLabel}. Reason: ${activeRestriction.reason}`;
        }
      }

      return null;
    } catch (error) {
      return formatAuthError(error, 'Unable to sign in.');
    }
  };

  const resendSignupConfirmation = async (email: string) => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      return 'Email is required.';
    }

    try {
      const redirectUrl = process.env.EXPO_PUBLIC_SUPABASE_EMAIL_REDIRECT || 'sukisend://auth/confirmed';
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        return formatAuthError(error, 'Unable to resend confirmation email.');
      }

      return null;
    } catch (error) {
      return formatAuthError(error, 'Unable to resend confirmation email.');
    }
  };

  const signUp = async (name: string, username: string, password: string, metadata?: SignUpMetadata) => {
    try {
      const email = usernameToEmail(username);
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            username,
            role: 'customer',
            sitio: metadata?.sitio ?? '',
            barangay: metadata?.barangay ?? '',
            municipality: metadata?.municipality ?? '',
            province: metadata?.province ?? '',
            secret_question: metadata?.secret_question ?? '',
            secret_answer: metadata?.secret_answer ?? '',
            contact_number: metadata?.contact_number ?? '',
            birthdate: metadata?.birthdate ?? '',
          },
        },
      });

      if (error) {
        return formatAuthError(error, 'Unable to create account.');
      }

      return null;
    } catch (error) {
      return formatAuthError(error, 'Unable to create account.');
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const role: UserRole = !session ? 'guest' : profile?.role ?? 'customer';

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      profile,
      role,
      signIn,
      signUp,
      resendSignupConfirmation,
      signOut,
      refreshProfile,
    }),
    [loading, session, profile, role],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
