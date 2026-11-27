export const COLORS = {
  bg: '#0B1017',
  surface: '#151E29',
  surfaceElevated: '#202D3B',
  surfacePressed: '#263647',
  border: '#293746',
  borderSubtle: '#1D2836',

  textPrimary: '#F4F7FB',
  textSecondary: '#91A2B5',
  textMuted: '#64748B',

  energyGreen: '#36E6A3',
  energyGreenDim: 'rgba(54, 230, 163, 0.14)',
  energyGreenBorder: 'rgba(54, 230, 163, 0.35)',

  navBlue: '#3B82F6',
  navBlueDim: 'rgba(59, 130, 246, 0.16)',
  navBlueBorder: 'rgba(59, 130, 246, 0.38)',

  warningAmber: '#F5B942',
  warningAmberDim: 'rgba(245, 185, 66, 0.15)',
  warningAmberBorder: 'rgba(245, 185, 66, 0.38)',

  criticalRed: '#EF4444',
  criticalRedDim: 'rgba(239, 68, 68, 0.15)',
  criticalRedBorder: 'rgba(239, 68, 68, 0.38)',

  unknownGray: '#64748B',
  unknownGrayDim: 'rgba(100, 116, 139, 0.16)',
  unknownGrayBorder: 'rgba(100, 116, 139, 0.38)',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

export const SHADOWS = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
} as const;

export const TOUCH_TARGET_MIN = 44;
