import { create } from 'zustand';
import { User } from '@workspace/api-client-react';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  login: (user, token) => {
    localStorage.setItem('pos_token', token);
    localStorage.setItem('pos_user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

// Initialize from localStorage
const storedToken = typeof localStorage !== 'undefined' ? localStorage.getItem('pos_token') : null;
const storedUser = typeof localStorage !== 'undefined' ? localStorage.getItem('pos_user') : null;

if (storedToken && storedUser) {
  try {
    useAuth.setState({
      token: storedToken,
      user: JSON.parse(storedUser),
      isAuthenticated: true,
    });
  } catch (e) {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
  }
}
