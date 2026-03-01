export interface AppTheme {
  isDark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    card: string;
    text: string;
    textMuted: string;
    border: string;
    primary: string;
    primaryContrast: string;
    accent: string;
    success: string;
    warning: string;
    danger: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
  };
}

const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 36,
};

const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const lightTheme: AppTheme = {
  isDark: false,
  colors: {
    background: '#F6F7F9',
    surface: '#FFFFFF',
    surfaceAlt: '#F1F5F9',
    card: '#FFFFFF',
    text: '#0F172A',
    textMuted: '#64748B',
    border: '#E2E8F0',
    primary: '#F97316',
    primaryContrast: '#FFFFFF',
    accent: '#16A34A',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
  },
  spacing,
  radius,
};

export const darkTheme: AppTheme = {
  isDark: true,
  colors: {
    background: '#020617',
    surface: '#0F172A',
    surfaceAlt: '#1E293B',
    card: '#111827',
    text: '#E2E8F0',
    textMuted: '#94A3B8',
    border: '#334155',
    primary: '#FB923C',
    primaryContrast: '#111827',
    accent: '#22C55E',
    success: '#4ADE80',
    warning: '#FBBF24',
    danger: '#F87171',
  },
  spacing,
  radius,
};
