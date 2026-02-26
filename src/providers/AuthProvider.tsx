import { Session } from '@supabase/supabase-js';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { AppProfile, UserRole } from '../types/models';

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  profile: AppProfile | null;
  role: UserRole;
  signIn: (email: string, password: string, asAdmin?: boolean) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeRole(role?: string): Exclude<UserRole, 'guest'> {
  return role === 'admin' ? 'admin' : 'customer';
}

async function resolveProfile(session: Session): Promise<AppProfile | null> {
  if (!supabase) {
    return null;
  }

  const user = session.user;
  const email = user.email ?? '';

  const { data, error } = await supabase.from('profiles').select('id, full_name, role').eq('id', user.id).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return {
      id: data.id,
      email,
      fullName: data.full_name || email.split('@')[0] || 'Suki User',
      role: normalizeRole(data.role),
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
      },
      { onConflict: 'id' },
    )
    .select('id, full_name, role')
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return {
    id: created.id,
    email,
    fullName: created.full_name || fullName,
    role: normalizeRole(created.role),
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!supabase || !session) {
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
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

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
    if (!supabase) {
      return 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.';
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return error.message;
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

      if (asAdmin && resolved?.role !== 'admin') {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        return 'This account is not registered as an admin.';
      }

      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Unable to sign in.';
    }
  };

  const signUp = async (name: string, email: string, password: string) => {
    if (!supabase) {
      return 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.';
    }

    try {
      const redirectUrl = process.env.EXPO_PUBLIC_SUPABASE_EMAIL_REDIRECT || 'sukisend://auth/confirmed';
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: name,
            role: 'customer',
          },
        },
      });

      if (error) {
        return error.message;
      }

      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Unable to create account.';
    }
  };

  const signOut = async () => {
    if (!supabase) {
      setSession(null);
      setProfile(null);
      return;
    }

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
