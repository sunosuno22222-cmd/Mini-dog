import fs from 'node:fs';
import {
  generateCarouselSlideshowVideo,
  generateTikTokTestMedia,
  TIKTOK_TEST_POST_CAPTION,
} from './expMediaGenerator.ts';
import {
  EXP_HASHTAGS,
  formatExpCode,
  getExpMediaFilePath,
  updateExpRecord,
  type CarouselPublishMode,
  type ExpAudioTrackMeta,
  type ExpRecord,
} from './expStore.ts';
import { selectRandomPreferredTrack, selectRussianTrackForPost } from './tiktokMusic.ts';
import {
  isZernioConfigured,
  publishPostViaZernio,
  verifyZernioAccountHealth,
  type TikTokPrivacyLevel,
} from './zernioService.ts';
import {
  getZernioAccount,
  getZernioAccounts,
  toPublicZernioInfo,
  type ZernioAccountRecord,
  type ZernioPublicAccountInfo,
} from './zernioStore.ts';

export type TikTokConnectionRecord = ZernioAccountRecord;
export type TikTokPublicAccountInfo = ZernioPublicAccountInfo;

export type TikTokPublishMode = 'auto' | 'inbox_draft' | 'direct_private' | 'direct_public';

export function isTikTokConfigured(): boolean {
  return isZernioConfigured();
}

export function getTikTokAccounts(discordUserId?: string): ZernioAccountRecord[] {
  return getZernioAccounts(discordUserId);
}

export function getTikTokAccount(idOrKey: string, discordUserId?: string): ZernioAccountRecord | null {
  return getZernioAccount(idOrKey, discordUserId);
}

export function getTikTokConnection(
  discordUserId: string,
  preferredId?: string | null,
): ZernioAccountRecord | null {
  const accounts = getZernioAccounts(discordUserId);
  if (accounts.length === 0) return null;
  if (preferredId) {
    const found = accounts.find((a) => a.id === preferredId || a.zernioAccountId === preferredId);
    if (found) return found;
  }
  return accounts.find((a) => a.isDefault) || accounts[0] || null;
}

export function getAnyConnectedTikTok(preferredDiscordUserIds: string[] = []): ZernioAccountRecord | null {
  for (const uid of preferredDiscordUserIds) {
    if (uid) {
      const conn = getTikTokConnection(uid);
      if (conn) return conn;
    }
  }
  const all = getZernioAccounts();
  if (all.length === 0) return null;
  return all.find((a) => a.isDefault) || all[0] || null;
}

export function toPublicTikTokInfo(record: ZernioAccountRecord | null): ZernioPublicAccountInfo | null {
  return toPublicZernioInfo(record);
}

export async function verifyTikTokAccountHealth(
  accountIdOrKey: string,
  discordUserId: string,
): Promise<{ valid: boolean; status?: 'connected' | 'expired' | 'revoked'; reason?: string }> {
  return verifyZernioAccountHealth(accountIdOrKey, discordUserId);
}

function getSlideImagePaths(record: ExpRecord): string[] {
  const slideFiles = record.generatedFiles.filter(
    (f) => f.toLowerCase().endsWith('.jpg') && f !== 'video-preview.jpg',
  );
  return slideFiles
    .map((f) => getExpMediaFilePath(record.id, f))
    .filter((p): p is string => Boolean(p && fs.existsSync(p)));
}

async function resolveExpMp4WithRussianAudio(record: ExpRecord): Promise<{
  videoPath: string;
  trackMeta: ExpAudioTrackMeta | null;
}> {
  const existingMp4Name = record.generatedFiles.find((f) => f.toLowerCase().endsWith('.mp4'));
  if (existingMp4Name) {
    const mp4Path = getExpMediaFilePath(record.id, existingMp4Name);
    if (mp4Path && fs.existsSync(mp4Path)) {
      return { videoPath: mp4Path, trackMeta: record.audioTrack ?? null };
    }
  }

  const slideFiles = record.generatedFiles.filter(
    (f) => f.toLowerCase().endsWith('.jpg') && f !== 'video-preview.jpg',
  );
  if (slideFiles.length > 0) {
    const russianTrack = await selectRussianTrackForPost(record.audioTrack ?? null).catch(() => null);
    const outPath = await generateCarouselSlideshowVideo(
      record.id,
      slideFiles,
      russianTrack?.localPath ?? null,
    );
    const trackMeta: ExpAudioTrackMeta | null = russianTrack
      ? {
          id: russianTrack.id,
          artist: russianTrack.artist,
          title: russianTrack.title,
          previewUrl: russianTrack.previewUrl,
        }
      : record.audioTrack ?? null;

    const updatedFiles = record.generatedFiles.includes('exp-carousel.mp4')
      ? record.generatedFiles
      : [...record.generatedFiles, 'exp-carousel.mp4'];
    updateExpRecord(record.id, {
      generatedFiles: updatedFiles,
      audioTrack: trackMeta,
    });

    return { videoPath: outPath, trackMeta };
  }

  throw new Error('Nenhum arquivo de vídeo MP4 ou slide gerado encontrado para envio ao Zernio.');
}

function parseHashtagsInput(rawTags?: string[] | string | null, fallback = EXP_HASHTAGS): string[] {
  if (Array.isArray(rawTags)) {
    const cleaned = rawTags
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
    return cleaned.length > 0 ? cleaned : fallback.split(/\s+/);
  }
  if (typeof rawTags === 'string' && rawTags.trim()) {
    const cleaned = rawTags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
    return cleaned.length > 0 ? cleaned : fallback.split(/\s+/);
  }
  return fallback.split(/\s+/);
}

export async function publishExpToTikTok(
  record: ExpRecord,
  discordUserId: string | null,
  mode: TikTokPublishMode = 'auto',
  targetAccountId?: string | null,
  options?: {
    caption?: string;
    hashtags?: string[] | string;
    privacyLevel?: TikTokPrivacyLevel;
    carouselMode?: CarouselPublishMode;
  },
): Promise<{
  outcome: 'published' | 'inbox_draft' | 'not_connected' | 'error';
  publishId?: string;
  publishMode?: string;
  platformPostUrl?: string | null;
  statusText: string;
  error?: string;
  trackArtist?: string | null;
  trackTitle?: string | null;
}> {
  if (!isZernioConfigured()) {
    return {
      outcome: 'error',
      statusText: 'ZERNIO_API_KEY não configurada.',
      error: 'Configure ZERNIO_API_KEY no ambiente do servidor para publicar no TikTok via Zernio.',
    };
  }

  if (!discordUserId) {
    return {
      outcome: 'not_connected',
      statusText: 'Nenhuma conta TikTok conectada.',
      error: 'Conecte sua conta TikTok via Zernio na aba Contas TikTok antes de publicar.',
    };
  }

  const account = getTikTokConnection(discordUserId, targetAccountId);
  if (!account) {
    return {
      outcome: 'not_connected',
      statusText: 'Conta TikTok não encontrada.',
      error: targetAccountId
        ? 'A conta selecionada não foi encontrada ou não pertence ao seu usuário.'
        : 'Nenhuma conta TikTok conectada via Zernio. Conecte sua conta em Contas TikTok.',
    };
  }

  const expCode = record.expCode || formatExpCode(record.expNumber || 1);
  const titleSummary = record.title?.trim() || record.description;
  const defaultCaption = `${expCode} — ${titleSummary}${
    record.involvedName ? `\nEnvolvido(a): ${record.involvedName}` : ''
  }`;
  const caption = options?.caption?.trim() || defaultCaption;
  const hashtags = parseHashtagsInput(options?.hashtags);

  const privacyLevel: TikTokPrivacyLevel =
    options?.privacyLevel ||
    (mode === 'direct_private' ? 'SELF_ONLY' : 'PUBLIC_TO_EVERYONE');

  const requestedCarouselMode: CarouselPublishMode =
    options?.carouselMode || record.carouselPublishMode || 'video_slideshow';

  const slidePaths = getSlideImagePaths(record);
  const shouldUseNativePhotoCarousel =
    requestedCarouselMode === 'photo_carousel' && slidePaths.length >= 1;

  let videoPath: string | undefined;
  let trackMeta: ExpAudioTrackMeta | null = record.audioTrack ?? null;

  if (!shouldUseNativePhotoCarousel) {
    try {
      const resolved = await resolveExpMp4WithRussianAudio(record);
      videoPath = resolved.videoPath;
      trackMeta = resolved.trackMeta;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao preparar mídia da exposição.';
      return { outcome: 'error', statusText: msg, error: msg };
    }
  }

  const result = await publishPostViaZernio({
    discordUserId,
    accountId: account.zernioAccountId,
    videoPath,
    imagePaths: shouldUseNativePhotoCarousel ? slidePaths : undefined,
    mediaMode: shouldUseNativePhotoCarousel ? 'photo_carousel' : 'video',
    filename: `${expCode.replace(/\s+/g, '-').toLowerCase()}.mp4`,
    caption,
    hashtags,
    privacyLevel,
    draft: mode === 'inbox_draft',
    expId: record.id,
    expCode,
  });

  if (!result.ok) {
    return {
      outcome: 'error',
      publishId: result.postId,
      publishMode: shouldUseNativePhotoCarousel ? 'zernio_photo_carousel' : 'zernio_api',
      statusText: result.statusText,
      error: result.error || 'Falha ao publicar conteúdo via Zernio.',
      trackArtist: trackMeta?.artist ?? null,
      trackTitle: trackMeta?.title ?? null,
    };
  }

  if (result.status === 'draft' || mode === 'inbox_draft') {
    return {
      outcome: 'inbox_draft',
      publishId: result.postId,
      publishMode: 'inbox_draft',
      platformPostUrl: result.platformPostUrl,
      statusText: result.statusText,
      trackArtist: trackMeta?.artist ?? null,
      trackTitle: trackMeta?.title ?? null,
    };
  }

  return {
    outcome: 'published',
    publishId: result.postId,
    publishMode: shouldUseNativePhotoCarousel ? 'zernio_photo_carousel' : 'zernio_api',
    platformPostUrl: result.platformPostUrl,
    statusText: result.statusText,
    trackArtist: trackMeta?.artist ?? null,
    trackTitle: trackMeta?.title ?? null,
  };
}

export async function publishTestPostToTikTok(
  discordUserId: string,
  accountId?: string | null,
): Promise<{
  outcome: 'published' | 'error';
  postId?: string;
  platformPostUrl?: string | null;
  statusText: string;
  error?: string;
  trackArtist?: string | null;
  trackTitle?: string | null;
}> {
  if (!isZernioConfigured()) {
    return {
      outcome: 'error',
      statusText: 'ZERNIO_API_KEY não configurada.',
      error: 'Configure ZERNIO_API_KEY no servidor para executar a publicação de teste via Zernio.',
    };
  }

  const account = getTikTokConnection(discordUserId, accountId);
  if (!account) {
    return {
      outcome: 'error',
      statusText: 'Nenhuma conta TikTok conectada.',
      error: 'Nenhuma conta TikTok conectada via Zernio.',
    };
  }

  const track = await selectRandomPreferredTrack().catch(() => null);
  const testMedia = await generateTikTokTestMedia(track);

  const result = await publishPostViaZernio({
    discordUserId,
    accountId: account.zernioAccountId,
    videoPath: testMedia.videoPath,
    filename: 'teste-zernio-5573exp.mp4',
    caption: TIKTOK_TEST_POST_CAPTION,
    hashtags: EXP_HASHTAGS.split(/\s+/),
    privacyLevel: 'PUBLIC_TO_EVERYONE',
  });

  if (!result.ok) {
    return {
      outcome: 'error',
      postId: result.postId,
      statusText: result.statusText,
      error: result.error || 'Erro na publicação de teste via Zernio.',
      trackArtist: testMedia.trackArtist,
      trackTitle: testMedia.trackTitle,
    };
  }

  return {
    outcome: 'published',
    postId: result.postId,
    platformPostUrl: result.platformPostUrl,
    statusText: result.statusText,
    trackArtist: testMedia.trackArtist,
    trackTitle: testMedia.trackTitle,
  };
}
