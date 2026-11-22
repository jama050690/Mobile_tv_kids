// Backend (NestJS) javoblari bilan mos turlar

export type AgeGroup = 'AGE_0_3' | 'AGE_4_7' | 'AGE_8_12' | 'ALL';
export type StreamType = 'HLS' | 'MP4';
export type SlotStatus = 'SCHEDULED' | 'LIVE' | 'ENDED';
export type UrlHealth = 'UNKNOWN' | 'OK' | 'BROKEN';
export type AdminRole = 'SUPER_ADMIN' | 'CONTENT_MANAGER';

export const AGE_GROUPS: AgeGroup[] = ['ALL', 'AGE_0_3', 'AGE_4_7', 'AGE_8_12'];
export const AGE_LABEL: Record<AgeGroup, string> = {
  ALL: 'Barcha yosh',
  AGE_0_3: '0–3 yosh',
  AGE_4_7: '4–7 yosh',
  AGE_8_12: '8–12 yosh',
};
export const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super admin',
  CONTENT_MANAGER: 'Kontent menejeri',
};

export interface Admin {
  id: string;
  email: string;
  fullName: string | null;
  role: AdminRole;
  isActive?: boolean;
  lastLoginAt: string | null;
  createdAt?: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  admin: Admin;
}

export interface Channel {
  id: string;
  title: string;
  slug: string;
  number: number;
  description: string | null;
  logoUrl: string | null;
  ageGroup: AgeGroup;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { slots: number };
}

export interface Program {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  fallbackUrl: string | null;
  streamType: StreamType;
  isLiveStream: boolean;
  durationSec: number;
  thumbnailUrl: string | null;
  ageRating: AgeGroup;
  isActive: boolean;
  urlStatus: UrlHealth;
  urlError: string | null;
  urlCheckedAt: string | null;
  fallbackUrlStatus: UrlHealth;
  createdAt: string;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface UrlCheckResult {
  url: string;
  ok: boolean;
  status: UrlHealth;
  streamType: StreamType | null;
  httpStatus: number | null;
  contentType: string | null;
  supportsRange: boolean | null;
  isLive: boolean | null;
  detectedDurationSec: number | null;
  finalUrl: string | null;
  latencyMs: number;
  warnings: string[];
  error: string | null;
  checkedAt: string;
}

export interface ProgramCheckResult {
  programId: string;
  primary: UrlCheckResult;
  fallback: UrlCheckResult | null;
}

export interface SlotProgram {
  id: string;
  title: string;
  durationSec: number;
  ageRating: AgeGroup;
  streamType: StreamType;
  urlStatus: UrlHealth;
  isActive: boolean;
  thumbnailUrl: string | null;
}

export interface Slot {
  id: string;
  channelId: string;
  programId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  startsAtLocal?: string;
  endsAtLocal?: string;
  durationSec: number;
  status: SlotStatus;
  program: SlotProgram;
}

export type WarningCode =
  | 'SLOT_LONGER_THAN_MEDIA'
  | 'MEDIA_TRUNCATED'
  | 'URL_BROKEN'
  | 'PROGRAM_INACTIVE'
  | 'AGE_MISMATCH'
  | 'IN_PAST';

export interface SlotWarning {
  code: WarningCode;
  message: string;
  slotStartsAtUtc?: string;
}

export interface SlotMutationResult {
  slot: Slot;
  warnings: SlotWarning[];
}

export interface SequenceResult {
  created: number;
  fromUtc: string;
  toUtc: string;
  warnings: SlotWarning[];
}

export interface CopyDayResult {
  sourceDate: string;
  timezone: string;
  results: { date: string; created: number; deleted: number }[];
}

export interface ValidationResult {
  channelId: string;
  fromUtc: string;
  toUtc: string;
  slots: number;
  coveragePercent: number;
  gaps: { fromUtc: string; toUtc: string; fromLocal?: string; toLocal?: string; durationSec: number }[];
  issues: (SlotWarning & { slotId: string; programTitle: string })[];
  isValid: boolean;
}

export interface Region {
  code: string;
  name: string;
  defaultTimezone: string;
  timezones: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  checks: { database: 'up' | 'down'; redis: 'up' | 'down' };
  uptimeSec: number;
  timestamp: string;
}

export interface GuideEntry {
  channel: { id: string; title: string; number: number; slug: string; ageGroup: AgeGroup; logoUrl: string | null };
  status: 'PLAYING' | 'FILLER' | 'UNAVAILABLE' | 'OFF_AIR';
  current: null | {
    startsAtLocal: string;
    endsAtLocal: string;
    remainingSec: number;
    progress: number;
    program: { title: string; thumbnailUrl: string | null };
  };
  next: null | { startsAtLocal: string; startsInSec: number; program: { title: string } };
}

export interface GuideResponse {
  timezone: string;
  localTime: string;
  channels: GuideEntry[];
}
