import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db, TeamMember } from '../db/db';
import { pb } from '../lib/pocketbase';
import { isPocketBaseRateLimited, notePocketBaseRateLimit } from '../lib/pocketbaseRateLimit';

const USER_PROFILE_CACHE_KEY = 'rafiki_user_profile';

interface CachedProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  module_permissions: string[];
}

function saveProfileCache(profile: CachedProfile) {
  try {
    localStorage.setItem(USER_PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch { /* ignore */ }
}

function loadProfileCache(): CachedProfile | null {
  try {
    const raw = localStorage.getItem(USER_PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearProfileCache() {
  localStorage.removeItem(USER_PROFILE_CACHE_KEY);
}

function buildUser(record: any): TeamMember {
  // PocketBase is the source of truth for name.
  // Fall back to localStorage cache only if PB returns an empty name (rare edge case).
  const pbName = record.name || record.username;
  const cached = loadProfileCache();
  const displayName = pbName || (cached?.id === record.id ? cached?.name : null) || 'User';
  return {
    id: record.id as any,
    name: displayName,
    email: record.email,
    role: record.role || 'Viewer',
    module_permissions: record.module_permissions || [],
    synced: true
  };
}

interface AuthContextType {
  currentUser: TeamMember | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password_hash: string) => Promise<boolean>;
  logout: () => Promise<void>;
  canAccess: (moduleId: string) => boolean;
  updateProfile: (name: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const authMode = import.meta.env.VITE_AUTH_MODE;

      if (authMode === 'pocketbase') {
        if (pb.authStore.isValid) {
          try {
            const authData = await pb.collection('users').authRefresh();
            if (authData.record) {
              const user = buildUser(authData.record);
              setCurrentUser(user);
              // Keep cache in sync with latest PB data (but preserve user's name override)
              saveProfileCache({
                id: user.id as any,
                name: user.name,
                email: user.email,
                role: user.role,
                module_permissions: user.module_permissions || []
              });
            }
          } catch (e) {
            if (isPocketBaseRateLimited(e)) {
              notePocketBaseRateLimit(undefined, (e as any)?.response);
              const cached = loadProfileCache();
              if (cached) {
                setCurrentUser({
                  id: cached.id as any,
                  name: cached.name,
                  email: cached.email,
                  role: cached.role,
                  module_permissions: cached.module_permissions || [],
                  synced: true,
                });
              }
            } else {
              pb.authStore.clear();
              clearProfileCache();
              setCurrentUser(null);
            }
          }
        } else {
          clearProfileCache();
        }
      } else {
        const session = await db.auth_session.get('current_session');
        if (session) {
          if (new Date(session.expires_at) > new Date()) {
            const user = await db.team_members.get(session.user_id);
            if (user) {
              setCurrentUser(user);
            } else {
              await db.auth_session.delete('current_session');
            }
          } else {
            await db.auth_session.delete('current_session');
          }
        }
      }
    } catch (e) {
      console.error('Session check failed', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const canAccess = useCallback((moduleId: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'Admin') return true;
    const perms = currentUser.module_permissions;
    if (!perms) return true;
    return perms.includes(moduleId);
  }, [currentUser]);

  const login = async (email: string, password_hash: string) => {
    const authMode = import.meta.env.VITE_AUTH_MODE;
    
    if (authMode === 'pocketbase') {
      try {
        const authData = await pb.collection('users').authWithPassword(email, password_hash);
        if (authData.record) {
          const user = buildUser(authData.record);
          setCurrentUser(user);
          saveProfileCache({
            id: user.id as any,
            name: user.name,
            email: user.email,
            role: user.role,
            module_permissions: user.module_permissions || []
          });

          // Keep local offline DB password in sync with PocketBase
          const localUser = await db.team_members.where('email').equalsIgnoreCase(email).first();
          if (localUser) {
            await db.team_members.update(localUser.id!, { password_hash: password_hash });
          }

          return true;
        }
      } catch (error: any) {
        if (isPocketBaseRateLimited(error)) {
          notePocketBaseRateLimit(undefined, error?.response);
        }
        console.warn('PocketBase login failed (possibly offline or rate-limited), falling back to local DB', error);
        // Do not return false here; let it fall through to local DB authentication for offline support
      }
    }

    // Local DB authentication
    const user = await db.team_members.where('email').equalsIgnoreCase(email).first();
    if (user && user.password_hash === password_hash) {
      const expires = new Date();
      expires.setHours(expires.getHours() + 8);
      await db.auth_session.put({
        key: 'current_session',
        user_id: user.id!,
        expires_at: expires.toISOString(),
        token: 'local-token-' + Date.now()
      });
      setCurrentUser(user);
      return true;
    }
    
    return false;
  };

  const updateProfile = async (name: string): Promise<boolean> => {
    if (!currentUser) return false;
    const authMode = import.meta.env.VITE_AUTH_MODE;

    if (authMode === 'pocketbase') {
      // 1. Optimistic UI update immediately
      setCurrentUser(prev => prev ? { ...prev, name } : null);
      // 2. Update localStorage display cache
      const cached = loadProfileCache();
      if (cached) saveProfileCache({ ...cached, name });

      try {
        // 3. Persist to PocketBase — this is the real source of truth
        const record = await pb.collection('users').update(currentUser.id as any, { name });
        // 4. Reconcile with what PB actually saved
        const savedName = record.name || name;
        setCurrentUser(prev => prev ? { ...prev, name: savedName } : null);
        if (cached) saveProfileCache({ ...cached, name: savedName });
        return true;
      } catch (e: any) {
        if (isPocketBaseRateLimited(e)) {
          notePocketBaseRateLimit(undefined, e?.response);
        }
        console.error('Failed to update name in PocketBase:', e?.response || e);
        // Revert UI to old name if PB failed
        setCurrentUser(prev => prev ? { ...prev, name: currentUser.name } : null);
        if (cached) saveProfileCache({ ...cached, name: currentUser.name });
        return false;
      }
    } else {
      await db.team_members.update(currentUser.id!, { name });
      setCurrentUser(prev => prev ? { ...prev, name } : null);
      return true;
    }
  };

  const logout = async () => {
    const authMode = import.meta.env.VITE_AUTH_MODE;
    if (authMode === 'pocketbase') {
      pb.authStore.clear();
    } else {
      await db.auth_session.delete('current_session');
    }
    clearProfileCache();
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, isAuthenticated: !!currentUser, isLoading, login, logout, canAccess, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
