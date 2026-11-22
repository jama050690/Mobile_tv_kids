// Backend endpoint'lari — bitta joyda, turlari bilan
import { api } from './client';
import type {
  AdminRole,
  AgeGroup,
  Admin,
  Channel,
  CopyDayResult,
  GuideResponse,
  HealthResponse,
  LoginResponse,
  Paged,
  Program,
  ProgramCheckResult,
  Region,
  SequenceResult,
  Slot,
  SlotMutationResult,
  StreamType,
  UrlCheckResult,
  UrlHealth,
  ValidationResult,
} from './types';

// ---------------- Auth ----------------
export const authApi = {
  login: (email: string, password: string) =>
    api<LoginResponse>('/admin/auth/login', { method: 'POST', body: { email, password }, noRefresh: true }),
  me: () => api<Admin>('/admin/auth/me'),
  logout: () => api<void>('/admin/auth/logout', { method: 'POST', body: {}, noRefresh: true }),
  logoutAll: () => api<void>('/admin/auth/logout-all', { method: 'POST' }),
};

// ---------------- Channels ----------------
export interface ChannelInput {
  title: string;
  slug?: string;
  number?: number;
  description?: string;
  logoUrl?: string;
  ageGroup?: AgeGroup;
  isActive?: boolean;
}

export const channelsApi = {
  list: () => api<Channel[]>('/admin/channels'),
  create: (body: ChannelInput) => api<Channel>('/admin/channels', { method: 'POST', body }),
  update: (id: string, body: Partial<ChannelInput>) => api<Channel>(`/admin/channels/${id}`, { method: 'PATCH', body }),
  setActive: (id: string, isActive: boolean) =>
    api<Channel>(`/admin/channels/${id}/active`, { method: 'PATCH', body: { isActive } }),
  remove: (id: string) => api<void>(`/admin/channels/${id}`, { method: 'DELETE' }),
};

// ---------------- Programs ----------------
export interface ProgramInput {
  title: string;
  description?: string;
  videoUrl: string;
  fallbackUrl?: string;
  streamType?: StreamType;
  isLiveStream?: boolean;
  durationSec: number;
  thumbnailUrl?: string;
  ageRating?: AgeGroup;
  isActive?: boolean;
  checkUrl?: boolean;
}

export interface ProgramQuery {
  search?: string;
  isActive?: boolean;
  ageRating?: AgeGroup;
  streamType?: StreamType;
  urlStatus?: UrlHealth;
  page?: number;
  limit?: number;
}

export const programsApi = {
  list: (q: ProgramQuery = {}, signal?: AbortSignal) =>
    api<Paged<Program>>('/admin/programs', { query: { ...q }, signal }),
  get: (id: string) => api<Program>(`/admin/programs/${id}`),
  create: (body: ProgramInput) => api<Program>('/admin/programs', { method: 'POST', body }),
  update: (id: string, body: Partial<ProgramInput>) =>
    api<Program>(`/admin/programs/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/admin/programs/${id}`, { method: 'DELETE' }),
  checkUrl: (url: string, streamType?: StreamType) =>
    api<UrlCheckResult>('/admin/programs/check-url', { method: 'POST', body: { url, streamType } }),
  checkProgram: (id: string) => api<ProgramCheckResult>(`/admin/programs/${id}/check-url`, { method: 'POST' }),
  checkAll: () =>
    api<{ checked: number; broken: number } | { skipped: true; reason: string }>('/admin/programs/check-all', {
      method: 'POST',
    }),
};

// ---------------- Schedule ----------------
export interface SlotInput {
  channelId: string;
  programId: string;
  startsAt: string;
  endsAt?: string;
  timezone?: string;
}

export const scheduleApi = {
  list: (channelId: string, from: string, to: string, tz?: string) =>
    api<Slot[]>('/admin/schedule', { query: { channelId, from, to, tz } }),
  create: (body: SlotInput) => api<SlotMutationResult>('/admin/schedule', { method: 'POST', body }),
  update: (id: string, body: Partial<Omit<SlotInput, 'channelId'>>) =>
    api<SlotMutationResult>(`/admin/schedule/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/admin/schedule/${id}`, { method: 'DELETE' }),
  sequence: (body: { channelId: string; programIds: string[]; startsAt?: string; timezone?: string; gapSec?: number }) =>
    api<SequenceResult>('/admin/schedule/sequence', { method: 'POST', body }),
  copyDay: (body: { channelId: string; sourceDate: string; targetDates: string[]; timezone: string; replace?: boolean }) =>
    api<CopyDayResult>('/admin/schedule/copy-day', { method: 'POST', body }),
  clearRange: (channelId: string, from: string, to: string) =>
    api<{ deleted: number }>('/admin/schedule', { method: 'DELETE', query: { channelId, from, to } }),
  validate: (channelId: string, from: string, to: string, tz?: string) =>
    api<ValidationResult>('/admin/schedule/validate', { query: { channelId, from, to, tz } }),
};

// ---------------- Regions ----------------
export const regionsApi = {
  list: () => api<Region[]>('/admin/regions'),
  create: (body: Region) => api<Region>('/admin/regions', { method: 'POST', body }),
  update: (code: string, body: Partial<Omit<Region, 'code'>>) =>
    api<Region>(`/admin/regions/${code}`, { method: 'PATCH', body }),
  remove: (code: string) => api<void>(`/admin/regions/${code}`, { method: 'DELETE' }),
};

// ---------------- Admin users ----------------
export interface AdminUserInput {
  email: string;
  password?: string;
  fullName?: string;
  role?: AdminRole;
  isActive?: boolean;
}

export const usersApi = {
  list: () => api<Admin[]>('/admin/users'),
  create: (body: AdminUserInput) => api<Admin>('/admin/users', { method: 'POST', body }),
  update: (id: string, body: Partial<AdminUserInput>) => api<Admin>(`/admin/users/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/admin/users/${id}`, { method: 'DELETE' }),
};

// ---------------- Public / monitoring ----------------
export const publicApi = {
  health: () => api<HealthResponse>('/health', { noRefresh: true }),
  guide: (tz: string) => api<GuideResponse>('/guide/now', { query: { tz }, noRefresh: true }),
};
