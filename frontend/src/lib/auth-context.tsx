'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { useRouter } from 'next/navigation';

export interface UserSession {
  id: string;
  username: string;
  fullName: string;
  phone?: string;
  role: 'ADMIN' | 'TENANT';
  tenantProfile?: {
    id: string;
    roomId: string;
    roomNumber?: number;
    roomName?: string;
    numberOfPeople: number;
    monthlyRent: number;
    moveInDateBS: string;
    room?: {
      id: string;
      roomNumber: number;
      name: string;
      defaultRent: number;
    };
  } | null;
}

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<UserSession>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Initialize immediately from localStorage synchronously if available
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('user_info');
      const token = localStorage.getItem('access_token');
      if (savedUser && token) {
        setUser(JSON.parse(savedUser));
        setLoading(false); // Immediate unblock
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
    // Background validation
    refreshUser();
  }, []);

  const refreshUser = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const data = await api.get('/auth/me');
      if (data) {
        setUser(data);
        localStorage.setItem('user_info', JSON.stringify(data));
      }
    } catch {
      // If token expired or unauthorized
      setUser(null);
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_info');
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<UserSession> => {
    const res = await api.post('/auth/login', { username, password });
    if (res.accessToken) {
      localStorage.setItem('access_token', res.accessToken);
    }
    if (res.user) {
      setUser(res.user);
      localStorage.setItem('user_info', JSON.stringify(res.user));
    }
    setLoading(false);
    return res.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    setUser(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_info');
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
