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
    successBg: string;
    warning: string;
    warningBg: string;
    danger: string;
    dangerBg: string;
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
  shadow: {
    card: Record<string, unknown>;
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

const lightShadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
};

const darkShadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 2,
  },
};

export const lightTheme: AppTheme = {
  isDark: false,
  colors: {
    background: '#FBF9F5',
    surface: '#FFFFFF',
    surfaceAlt: '#F5F0EB',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textMuted: '#7A7067',
    border: 'rgba(0,0,0,0.06)',
    primary: '#E06D3B',
    primaryContrast: '#FFFFFF',
    accent: '#2D6A4F',
    success: '#2D6A4F',
    successBg: '#E8F5E9',
    warning: '#C77B20',
    warningBg: '#FFF3E0',
    danger: '#C62828',
    dangerBg: '#FFEBEE',
  },
  spacing,
  radius,
  shadow: lightShadow,
};

export const darkTheme: AppTheme = {
  isDark: true,
  colors: {
    background: '#1A1614',
    surface: '#2A2420',
    surfaceAlt: '#3A3430',
    card: '#2A2420',
    text: '#F5F0EB',
    textMuted: '#A89E94',
    border: 'rgba(255,255,255,0.08)',
    primary: '#E8956A',
    primaryContrast: '#1A1A1A',
    accent: '#52B788',
    success: '#52B788',
    successBg: 'rgba(82, 183, 136, 0.15)',
    warning: '#E8B86A',
    warningBg: 'rgba(232, 184, 106, 0.15)',
    danger: '#EF5350',
    dangerBg: 'rgba(239, 83, 80, 0.15)',
  },
  spacing,
  radius,
  shadow: darkShadow,
};
