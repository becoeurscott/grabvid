/**
 * GrabVid Theme & Platform Constants
 */

// ─── Theme Colors ────────────────────────────────────────────
export const Colors = {
  background: '#0A0A0B',
  surfacePrimary: '#141416',
  surfaceSecondary: '#1C1C1F',
  surfaceTertiary: '#252528',
  surfaceQuaternary: '#2F2F33',

  textPrimary: '#E8E8ED',
  textSecondary: '#8E8E93',
  textTertiary: '#636366',

  border: '#2C2C2E',
  borderFocused: '#48484A',

  success: '#30D158',
  warning: '#FFD60A',
  error: '#FF453A',

  white: '#FFFFFF',
  black: '#000000',
};

// ─── Platform Definitions ────────────────────────────────────
export type PlatformId =
  | 'youtube' | 'instagram' | 'tiktok' | 'twitter'
  | 'facebook' | 'vimeo' | 'soundcloud' | 'pinterest'
  | 'reddit' | 'twitch' | 'snapchat' | 'unknown';

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  color: string;
  icon: string; // Ionicons name
  domains: string[];
}

export const PLATFORMS: PlatformInfo[] = [
  { id: 'youtube',    name: 'YouTube',     color: '#FF0000', icon: 'logo-youtube',    domains: ['youtube.com', 'youtu.be', 'm.youtube.com'] },
  { id: 'instagram',  name: 'Instagram',   color: '#E1306C', icon: 'logo-instagram',  domains: ['instagram.com'] },
  { id: 'tiktok',     name: 'TikTok',      color: '#00F2EA', icon: 'musical-notes',   domains: ['tiktok.com', 'vm.tiktok.com'] },
  { id: 'twitter',    name: 'X / Twitter',  color: '#1DA1F2', icon: 'logo-twitter',    domains: ['twitter.com', 'x.com'] },
  { id: 'facebook',   name: 'Facebook',    color: '#1877F2', icon: 'logo-facebook',   domains: ['facebook.com', 'fb.watch', 'fb.com'] },
  { id: 'vimeo',      name: 'Vimeo',       color: '#1AB7EA', icon: 'logo-vimeo',      domains: ['vimeo.com'] },
  { id: 'soundcloud', name: 'SoundCloud',  color: '#FF5500', icon: 'musical-note',    domains: ['soundcloud.com'] },
  { id: 'pinterest',  name: 'Pinterest',   color: '#E60023', icon: 'logo-pinterest',  domains: ['pinterest.com', 'pin.it'] },
  { id: 'reddit',     name: 'Reddit',      color: '#FF4500', icon: 'logo-reddit',     domains: ['reddit.com', 'redd.it'] },
  { id: 'twitch',     name: 'Twitch',      color: '#9146FF', icon: 'logo-twitch',     domains: ['twitch.tv'] },
  { id: 'snapchat',   name: 'Snapchat',    color: '#FFFC00', icon: 'logo-snapchat',   domains: ['snapchat.com', 'story.snapchat.com', 't.snapchat.com'] },
];

/**
 * Detect platform from URL string
 */
export function detectPlatform(url: string): PlatformInfo | null {
  const lower = url.toLowerCase().trim();
  // strip protocol
  let domain = lower;
  if (domain.includes('://')) domain = domain.split('://')[1];
  domain = domain.split('/')[0].split('?')[0].split('#')[0];

  for (const p of PLATFORMS) {
    for (const d of p.domains) {
      if (domain === d || domain.endsWith('.' + d) || domain === 'www.' + d) {
        return p;
      }
    }
  }
  return null;
}

// ─── Media Types ─────────────────────────────────────────────
export type MediaType = 'video' | 'audio' | 'image';

export interface FormatInfo {
  format_id: string;
  label: string;
  type: MediaType;
  quality: string;
  extension: string;
  estimated_size: string;
  estimated_size_bytes: number;
  has_watermark?: boolean | null;
}

export interface AnalyzeResponse {
  platform: PlatformId;
  platform_name: string;
  platform_color: string;
  title: string;
  thumbnail?: string | null;
  duration?: number | null;
  duration_formatted?: string | null;
  author?: string | null;
  formats: FormatInfo[];
}

// ─── App State ───────────────────────────────────────────────
export type AppState = 'idle' | 'analyzing' | 'analyzed' | 'downloading' | 'completed' | 'error';

// ─── Download Record ─────────────────────────────────────────
export interface DownloadRecord {
  id: string;
  url: string;
  title: string;
  platform: PlatformId;
  platform_color: string;
  format_label: string;
  format_type: MediaType;
  file_size: string;
  download_date: number; // timestamp ms
  local_path?: string | null;
}

// ─── API Config ──────────────────────────────────────────────
export const API_CONFIG = {
  // VPS Production server route
  baseURL: 'http://157.173.210.2:8000', 
  timeout: 90000, // 90 seconds
  downloadTimeout: 600000, // 10 minutes
};
