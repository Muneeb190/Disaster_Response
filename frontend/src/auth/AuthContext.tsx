/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AppRole = 'public' | 'responder' | 'admin';
export type AccountStatus = 'invited' | 'active' | 'suspended' | 'disabled';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  account_status: AccountStatus;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  roles: AppRole[];
  teamIds: string[];
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  refreshIdentity: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadIdentity = useCallback(async (nextSession?: Session | null) => {
    const activeSession = nextSession === undefined ? (await supabase.auth.getSession()).data.session : nextSession;
    setSession(activeSession);
    if (!activeSession?.user) {
      setProfile(null);
      setRoles([]);
      setTeamIds([]);
      setLoading(false);
      return;
    }

    const [profileResult, rolesResult, teamsResult] = await Promise.all([
      supabase.from('profiles').select('id,email,full_name,account_status').eq('id', activeSession.user.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', activeSession.user.id),
      supabase.from('team_members').select('team_id').eq('user_id', activeSession.user.id).eq('active', true),
    ]);

    setProfile((profileResult.data as UserProfile | null) ?? null);
    setRoles((rolesResult.data ?? []).map((row) => row.role as AppRole));
    setTeamIds((teamsResult.data ?? []).map((row) => row.team_id as string));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadIdentity();
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setLoading(true);
      setTimeout(() => void loadIdentity(nextSession), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [loadIdentity]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    roles,
    teamIds,
    loading,
    hasRole: (role) => roles.includes(role),
    refreshIdentity: async () => {
      setLoading(true);
      await supabase.auth.refreshSession();
      await loadIdentity();
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setRoles([]);
      setTeamIds([]);
    },
  }), [session, profile, roles, teamIds, loading, loadIdentity]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export function homeForRoles(roles: AppRole[]) {
  if (roles.includes('admin')) return '/dashboard';
  if (roles.includes('responder')) return '/responder';
  return '/my-reports';
}
