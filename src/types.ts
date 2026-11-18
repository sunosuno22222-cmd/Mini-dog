export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
}

export interface ConfigStatus {
  oauthConfigured: boolean;
  botConfigured: boolean;
  groqConfigured?: boolean;
  zernioConfigured?: boolean;
  botStatus: {
    connected: boolean;
    botTag: string | null;
    guildCount: number;
    error: string | null;
  };
  authenticated: boolean;
  user: DiscordUser | null;
  redirectUri: string;
}

export interface DemonicAiGenerationResult {
  provider: 'groq' | 'gemini';
  model: string;
  title: string;
  information: string;
  additionalText: string;
  insultText: string;
  closingText: string;
  watermarkText: string;
  caption: string;
  hashtags: string;
  aiImagesBase64: string[];
}


export interface GuildItem {
  id: string;
  name: string;
  iconUrl: string | null;
  owner: boolean;
  isAdmin: boolean;
  botPresent: boolean;
}

export interface GuildsResponse {
  managedGuilds: GuildItem[];
  availableGuilds: GuildItem[];
}

export interface GuildTextChannel {
  id: string;
  name: string;
  categoryName: string | null;
}

export type BannerEventType = 'welcome' | 'leave';

export interface BannerRuleView {
  enabled: boolean;
  channelId: string | null;
  title: string;
  message: string;
  imageUrl: string | null;
}

export interface GuildWelcomeConfigResponse {
  guildId: string;
  updatedAt: string;
  restoredFromAccount?: boolean;
  hasSavedConfig?: boolean;
  welcome: BannerRuleView;
  leave: BannerRuleView;
}

export interface TikTokAccountInfo {
  id: string;
  zernioAccountId: string;
  zernioProfileId: string;
  platform: 'tiktok';
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: 'connected' | 'expired' | 'revoked';
  healthIssues?: string[];
  isDefault: boolean;
  connectedAt: string;
  updatedAt: string;
}

export interface TikTokStatusResponse {
  configured: boolean;
  connected: boolean;
  provider: 'zernio';
  account: TikTokAccountInfo | null;
  accounts: TikTokAccountInfo[];
  activeAccountId: string | null;
}

export type ZernioPostStatus =
  | 'draft'
  | 'processing'
  | 'published'
  | 'partial'
  | 'failed';

export interface ZernioPostHistoryItem {
  id: string;
  zernioPostId: string;
  discordUserId: string;
  accountId: string;
  accountUsername: string;
  expId: string | null;
  expCode: string | null;
  caption: string;
  hashtags: string[];
  status: ZernioPostStatus;
  platformPostId: string | null;
  platformPostUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ExpFormat = 'carousel' | 'video';

export type CarouselPublishMode = 'video_slideshow' | 'photo_carousel';

export interface RussianMusicTrack {
  id: string;
  artist: string;
  title: string;
  previewUrl: string;
  artworkUrl?: string | null;
  durationSec?: number;
}

export interface ExpAudioTrackMeta {
  id?: string;
  artist: string;
  title: string;
  previewUrl?: string;
}

export type ExpStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'awaiting_tiktok_confirmation'
  | 'published_tiktok'
  | 'tiktok_inbox'
  | 'tiktok_error';

export interface ExpRecordView {
  id: string;
  guildId: string;
  guildName: string;
  requesterId: string;
  requesterTag: string;
  involvedName: string;
  description: string;
  whatHappened: string;
  whyWrong: string;
  additionalInsults?: string;
  title?: string;
  information?: string;
  additionalText?: string;
  insultText?: string;
  closingText?: string;
  watermarkText?: string;
  audioTrack?: ExpAudioTrackMeta | null;
  carouselPublishMode?: CarouselPublishMode;
  mediaLinks: string[];
  otherLinks: string[];
  format: ExpFormat;
  status: ExpStatus;
  expNumber: number | null;
  expCode: string | null;
  caption: string | null;
  generatedFiles: string[];
  handledByTag: string | null;
  handledAt: string | null;
  tiktokPublishId: string | null;
  tiktokPublishMode: string | null;
  tiktokStatusText: string | null;
  tiktokError: string | null;
  tiktokPostUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpRecordsResponse {
  records: ExpRecordView[];
  nextExpNumber: number;
  nextExpCode: string;
}
