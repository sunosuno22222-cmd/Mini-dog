import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  ImagePlus,
  Music,
  Pause,
  Play,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  CarouselPublishMode,
  ExpAudioTrackMeta,
  GuildItem,
  RussianMusicTrack,
  TikTokAccountInfo,
} from '../types';

interface ExpCarouselStudioProps {
  nextExpCode: string;
  tiktokConnected: boolean;
  tiktokAccounts?: TikTokAccountInfo[];
  managedGuilds?: GuildItem[];
  fixedGuildId?: string;
  fixedGuildName?: string;
  onCreated: () => void;
  onOpenTikTokSettings?: () => void;
}

interface PreviewSlideItem {
  index: number;
  label: string;
  dataUrl: string;
}

interface UploadedSlot {
  name: string;
  dataUrl: string;
  isVideo?: boolean;
  videoInfo?: string;
}

async function readImageFileAsDataUrl(file: File): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Falha ao ler arquivo de imagem'));
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });

  if (file.size <= 2.5 * 1024 * 1024) {
    return rawDataUrl;
  }

  return await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
      const w = Math.max(1, Math.round((img.width || 1080) * scale));
      const h = Math.max(1, Math.round((img.height || 1080) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

async function extractVideoFrameClient(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;

    let seeked = false;

    video.onloadeddata = () => {
      const targetTime = Math.min(1.0, Math.max(0.1, (video.duration || 1) * 0.25));
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      if (seeked) return;
      seeked = true;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Contexto 2D do canvas não disponível'));
          return;
        }

        const vw = video.videoWidth || 1080;
        const vh = video.videoHeight || 1350;
        const targetAspect = 1080 / 1350;
        const videoAspect = vw / vh;

        let sx = 0;
        let sy = 0;
        let sw = vw;
        let sh = vh;

        if (videoAspect > targetAspect) {
          sw = vh * targetAspect;
          sx = (vw - sw) / 2;
        } else {
          sh = vw / targetAspect;
          sy = (vh - sh) / 2;
        }

        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 1080, 1350);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Falha ao decodificar arquivo de vídeo no navegador'));
    };
  });
}

async function extractVideoFrameServer(file: File): Promise<string> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Falha ao ler vídeo'));
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });

  const resp = await apiFetch('/api/exp/media/extract-frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoBase64: base64Data }),
  });

  if (!resp.ok) {
    const errData = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || 'Falha ao extrair quadro do vídeo no servidor');
  }

  const data = (await resp.json()) as { ok: boolean; dataUrl: string };
  return data.dataUrl;
}

export function ExpCarouselStudio({
  nextExpCode,
  tiktokConnected,
  tiktokAccounts = [],
  managedGuilds = [],
  fixedGuildId,
  fixedGuildName,
  onCreated,
  onOpenTikTokSettings,
}: ExpCarouselStudioProps) {
  // 3 core poster fields
  const [targetName, setTargetName] = useState('');
  const [imageSlot, setImageSlot] = useState<UploadedSlot | null>(null);
  const [explanation, setExplanation] = useState('');

  // Optional publishing & audio settings
  const [watermarkText, setWatermarkText] = useState('@5573exp');
  const [targetGuildId, setTargetGuildId] = useState<string>(fixedGuildId || 'web-studio');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [carouselMode, setCarouselMode] = useState<CarouselPublishMode>('video_slideshow');
  const [customCaption, setCustomCaption] = useState('');
  const [customHashtags, setCustomHashtags] = useState('#573 #5573 #exp #fyb');

  // Russian audio catalog & playback
  const [audioMode, setAudioMode] = useState<'auto' | 'custom'>('auto');
  const [tracks, setTracks] = useState<RussianMusicTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<RussianMusicTrack | null>(null);
  const [activeAudioTrack, setActiveAudioTrack] = useState<ExpAudioTrackMeta | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Live poster preview viewer
  const [slides, setSlides] = useState<PreviewSlideItem[]>([]);
  const [previewExpCode, setPreviewExpCode] = useState(nextExpCode);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [submitting, setSubmitting] = useState<'save' | 'publish' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [playerViewMode, setPlayerViewMode] = useState<'clean' | 'tiktok'>('clean');
  const [isAudioPlayingInPreview, setIsAudioPlayingInPreview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (fixedGuildId) {
      setTargetGuildId(fixedGuildId);
    }
  }, [fixedGuildId]);

  useEffect(() => {
    setPreviewExpCode(nextExpCode);
  }, [nextExpCode]);

  useEffect(() => {
    if (tiktokAccounts.length > 0 && !selectedAccountId) {
      const def = tiktokAccounts.find((a) => a.isDefault) || tiktokAccounts[0];
      if (def?.id) setSelectedAccountId(def.id);
    }
  }, [tiktokAccounts, selectedAccountId]);

  const loadRussianTracks = useCallback(async (forceRefresh = false) => {
    setTracksLoading(true);
    try {
      const resp = await apiFetch(`/api/exp/music/russian${forceRefresh ? '?refresh=1' : ''}`);
      if (!resp.ok) return;
      const data = (await resp.json()) as { tracks?: RussianMusicTrack[] };
      if (Array.isArray(data.tracks)) {
        setTracks(data.tracks);
        if (data.tracks.length > 0 && !selectedTrack) {
          setSelectedTrack(data.tracks[0]);
        }
      }
    } catch {
      // Non-blocking
    } finally {
      setTracksLoading(false);
    }
  }, [selectedTrack]);

  useEffect(() => {
    void loadRussianTracks(false);
  }, [loadRussianTracks]);

  const stopAudioPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingTrackId(null);
    setIsAudioPlayingInPreview(false);
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    const trackUrl = activeAudioTrack?.previewUrl || selectedTrack?.previewUrl;
    if (!trackUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
    }

    if (audioRef.current.src !== trackUrl) {
      audioRef.current.src = trackUrl;
    }

    audioRef.current.muted = audioMuted;
    audioRef.current.volume = 0.65;

    if (isAudioPlayingInPreview && slides.length > 0) {
      void audioRef.current.play().catch(() => {});
    } else if (!playingTrackId) {
      audioRef.current.pause();
    }
  }, [isAudioPlayingInPreview, slides.length, activeAudioTrack, selectedTrack, audioMuted, playingTrackId]);

  const handleTogglePlayTrack = (track: { id?: string; previewUrl?: string }) => {
    if (!track.previewUrl) return;
    const trackKey = track.id || track.previewUrl;
    if (playingTrackId === trackKey) {
      stopAudioPlayback();
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setPlayingTrackId(null);
    }
    setIsAudioPlayingInPreview(false);
    audioRef.current.src = track.previewUrl;
    audioRef.current.muted = false;
    audioRef.current.volume = 0.65;
    void audioRef.current
      .play()
      .then(() => setPlayingTrackId(trackKey))
      .catch(() => setPlayingTrackId(null));
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);

    if (!isVideo && !isImage) {
      setFeedback({
        type: 'error',
        text: 'Formato não suportado. Envie imagem (PNG, JPG, WEBP) ou vídeo (MP4, WebM, MOV).',
      });
      return;
    }

    try {
      let dataUrl: string;
      let videoInfo: string | undefined;

      if (isVideo) {
        try {
          dataUrl = await extractVideoFrameClient(file);
          videoInfo = 'Quadro extraído do vídeo';
        } catch {
          dataUrl = await extractVideoFrameServer(file);
          videoInfo = 'Quadro extraído no servidor';
        }
      } else {
        dataUrl = await readImageFileAsDataUrl(file);
      }

      setImageSlot({
        name: file.name,
        dataUrl,
        isVideo,
        videoInfo,
      });
      setFeedback(null);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível processar o arquivo selecionado.',
      });
    }
  };

  const handleGeneratePreview = async () => {
    const cleanName = targetName.trim();
    const cleanExplanation = explanation.trim();

    if (cleanName.length < 1) {
      setFeedback({ type: 'error', text: 'Preencha o campo 1 (Nome) antes de gerar a prévia.' });
      return;
    }
    if (cleanExplanation.length < 3) {
      setFeedback({
        type: 'error',
        text: 'Preencha o campo 3 (O que ela fez / faz) antes de gerar a prévia.',
      });
      return;
    }

    setGeneratingPreview(true);
    setFeedback(null);

    try {
      const resp = await apiFetch('/api/exp/studio/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetName: cleanName,
          explanation: cleanExplanation,
          title: cleanName,
          information: cleanExplanation,
          imagesBase64: imageSlot?.dataUrl ? [imageSlot.dataUrl] : [],
          watermarkText: watermarkText.trim() || '@5573exp',
          theme: 'gallery',
          audioMode,
          selectedAudioTrack: audioMode === 'custom' ? selectedTrack : null,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        slides?: PreviewSlideItem[];
        nextExpCode?: string;
        suggestedAudioTrack?: ExpAudioTrackMeta | null;
        error?: string;
      };

      if (!resp.ok || !data.slides || data.slides.length === 0) {
        setFeedback({
          type: 'error',
          text: data.error || 'Não foi possível gerar a prévia do cartaz.',
        });
        return;
      }

      setSlides(data.slides);
      if (data.nextExpCode) setPreviewExpCode(data.nextExpCode);
      if (data.suggestedAudioTrack) {
        setActiveAudioTrack(data.suggestedAudioTrack);
      }
    } catch {
      setFeedback({ type: 'error', text: 'Erro de comunicação ao gerar a prévia.' });
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleCreateAndOptionallyPublish = async (mode: 'save' | 'publish') => {
    const cleanName = targetName.trim();
    const cleanExplanation = explanation.trim();

    if (cleanName.length < 1) {
      setFeedback({ type: 'error', text: 'Preencha o campo 1 (Nome) para continuar.' });
      return;
    }
    if (cleanExplanation.length < 3) {
      setFeedback({
        type: 'error',
        text: 'Preencha o campo 3 (O que ela fez / faz) para continuar.',
      });
      return;
    }

    setSubmitting(mode);
    setFeedback(null);

    try {
      const resp = await apiFetch('/api/exp/studio/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId: targetGuildId,
          targetName: cleanName,
          explanation: cleanExplanation,
          title: cleanName,
          information: cleanExplanation,
          imagesBase64: imageSlot?.dataUrl ? [imageSlot.dataUrl] : [],
          watermarkText: watermarkText.trim() || '@5573exp',
          theme: 'gallery',
          audioMode,
          selectedAudioTrack: audioMode === 'custom' ? selectedTrack : activeAudioTrack,
          carouselMode,
          publishNow: mode === 'publish',
          draftOnly: false,
          accountId: selectedAccountId || undefined,
          caption: customCaption.trim() || `A PUTA DE HOJE É: ${cleanName.toUpperCase()}`,
          hashtags: customHashtags.trim() || undefined,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        record?: { expCode?: string | null; audioTrack?: ExpAudioTrackMeta | null };
        tiktokOutcome?: { outcome?: string; statusText?: string; error?: string } | null;
        error?: string;
      };

      if (!resp.ok || !data.ok) {
        setFeedback({
          type: 'error',
          text: data.error || 'Não foi possível concluir a criação do cartaz.',
        });
        return;
      }

      const audioInfo = data.record?.audioTrack
        ? ` · Áudio: ${data.record.audioTrack.artist} — ${data.record.audioTrack.title}`
        : '';

      if (mode === 'save') {
        setFeedback({
          type: 'success',
          text: `${data.record?.expCode || 'Cartaz'} gerado e salvo no histórico${audioInfo}.`,
        });
      } else if (
        data.tiktokOutcome?.outcome === 'published' ||
        data.tiktokOutcome?.outcome === 'inbox_draft'
      ) {
        setFeedback({
          type: 'success',
          text: `${data.record?.expCode || 'Cartaz'}: ${data.tiktokOutcome.statusText}${audioInfo}`,
        });
      } else {
        setFeedback({
          type: 'error',
          text: `${data.record?.expCode || 'Cartaz'} gerado e salvo, mas houve erro ao enviar ao TikTok: ${
            data.tiktokOutcome?.error || data.tiktokOutcome?.statusText || 'verifique sua conta TikTok.'
          }`,
        });
      }

      onCreated();
    } catch {
      setFeedback({ type: 'error', text: 'Erro de comunicação ao salvar/publicar o cartaz.' });
    } finally {
      setSubmitting(null);
    }
  };

  const currentSlide = slides[0] ?? null;
  const formattedTargetName = targetName.trim().toUpperCase();

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
      {/* Studio Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="space-y-1">
          <h3 className="text-lg font-bold tracking-tight text-slate-900">
            Criador de Cartaz EXP — 573
          </h3>
          <p className="text-xs sm:text-sm text-slate-500">
            Preencha os 3 campos abaixo para montar o cartaz e publicar direto no TikTok.
          </p>
        </div>

        <div className="text-right shrink-0">
          <div className="text-xs text-slate-500">Registro</div>
          <div className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
            {previewExpCode}
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-xs sm:text-sm border ${
            feedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: 3 Required Poster Fields + Publishing Controls */}
        <div className="lg:col-span-7 space-y-5">
          {/* Campo 1: Nome */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="poster-name" className="text-xs font-semibold text-slate-900">
                1. Nome
              </label>
              <span className="text-xs text-slate-400 tabular-nums">{targetName.length}/60</span>
            </div>
            <input
              id="poster-name"
              type="text"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              maxLength={60}
              placeholder="Ex.: VAMP"
              className="w-full h-11 px-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 font-medium"
            />
            <p className="text-xs text-slate-500">
              No cartaz:{' '}
              <span className="font-semibold text-slate-800">
                A PUTA DE HOJE É: {formattedTargetName || '...'}
              </span>
            </p>
          </div>

          {/* Campo 2: Imagem */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-900 block">
              2. Imagem dela
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
            />

            {imageSlot ? (
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center gap-4">
                <img
                  src={imageSlot.dataUrl}
                  alt="Imagem selecionada"
                  className="w-24 h-24 rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="text-xs font-medium text-slate-900 truncate">
                    {imageSlot.name}
                  </div>
                  {imageSlot.videoInfo && (
                    <div className="text-xs text-slate-500">{imageSlot.videoInfo}</div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700"
                    >
                      Trocar imagem
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageSlot(null)}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-xs font-medium text-red-700 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-slate-100 text-slate-600 flex flex-col items-center justify-center gap-1.5 text-xs font-medium transition-colors"
              >
                <ImagePlus className="w-5 h-5 text-slate-500" aria-hidden="true" />
                <span>Selecionar Foto ou Vídeo</span>
                <span className="text-[11px] text-slate-400 font-normal">PNG, JPG, WEBP ou MP4</span>
              </button>
            )}
          </div>

          {/* Campo 3: Explicação (O que ela fez / O que ela faz) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="poster-explanation" className="text-xs font-semibold text-slate-900">
                3. O que ela fez / O que ela faz
              </label>
              <span className="text-xs text-slate-400 tabular-nums">
                {explanation.length}/900
              </span>
            </div>
            <textarea
              id="poster-explanation"
              rows={5}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              maxLength={900}
              placeholder="Explique aqui em detalhes o que ela fez ou faz. Esse texto vai aparecer organizado lá embaixo no cartaz sem sair da tela..."
              className="w-full p-3.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900"
            />
          </div>

          {/* Compact TikTok + Music Settings */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-slate-600" aria-hidden="true" />
                <span className="text-xs font-semibold text-slate-900">
                  Trilha Sonora (para vídeo TikTok)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setAudioMode('auto')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      audioMode === 'auto'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Automático
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioMode('custom')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      audioMode === 'custom'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Escolher faixa
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void loadRussianTracks(true)}
                  disabled={tracksLoading}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${tracksLoading ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>
            </div>

            {audioMode === 'custom' && (
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {tracks.length === 0 ? (
                  <div className="text-xs text-slate-500 py-2 text-center">
                    {tracksLoading ? 'Carregando músicas...' : 'Nenhuma faixa carregada.'}
                  </div>
                ) : (
                  tracks.map((track) => {
                    const isSelected = selectedTrack?.id === track.id;
                    const isPlaying = playingTrackId === track.id;
                    return (
                      <div
                        key={track.id}
                        className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg border text-xs ${
                          isSelected
                            ? 'bg-slate-100 border-slate-400 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTrack(track);
                            setActiveAudioTrack({
                              id: track.id,
                              artist: track.artist,
                              title: track.title,
                              previewUrl: track.previewUrl,
                            });
                          }}
                          className="flex-1 text-left min-w-0 truncate"
                        >
                          <span className="font-semibold text-slate-900">{track.artist}</span>
                          <span className="text-slate-400 mx-1.5">—</span>
                          <span>{track.title}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTogglePlayTrack(track)}
                          className="w-7 h-7 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 inline-flex items-center justify-center shrink-0"
                          aria-label={isPlaying ? 'Pausar música' : 'Ouvir música'}
                        >
                          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Formato no TikTok
                </label>
                <select
                  value={carouselMode}
                  onChange={(e) => setCarouselMode(e.target.value as CarouselPublishMode)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                >
                  <option value="video_slideshow">Vídeo + Música (MP4)</option>
                  <option value="photo_carousel">Foto Estática (Post de Imagem)</option>
                </select>
              </div>

              {!fixedGuildId ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Destino do registro
                  </label>
                  <select
                    value={targetGuildId}
                    onChange={(e) => setTargetGuildId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                  >
                    <option value="web-studio">Direto do Site (573)</option>
                    {managedGuilds.map((g) => (
                      <option key={g.id} value={g.id}>
                        Servidor: {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Servidor vinculado
                  </label>
                  <div className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 flex items-center truncate">
                    {fixedGuildName || fixedGuildId}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Legenda TikTok
                </label>
                <input
                  type="text"
                  value={customCaption}
                  onChange={(e) => setCustomCaption(e.target.value)}
                  placeholder={formattedTargetName ? `A PUTA DE HOJE É: ${formattedTargetName}` : 'Legenda do post'}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hashtags
                </label>
                <input
                  type="text"
                  value={customHashtags}
                  onChange={(e) => setCustomHashtags(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Rodapé / @
                </label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  maxLength={40}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-900"
                />
              </div>
            </div>

            {tiktokAccounts.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-xs text-slate-600">Conta TikTok conectada:</span>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-900"
                >
                  {tiktokAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      @{acc.username} {acc.isDefault ? '(Padrão)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void handleGeneratePreview()}
              disabled={generatingPreview || submitting !== null}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-900 inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50 transition-colors"
            >
              <Eye className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span>{generatingPreview ? 'Gerando prévia...' : 'Gerar Prévia do Cartaz'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCreateAndOptionallyPublish('save')}
              disabled={submitting !== null || generatingPreview}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
            >
              <Save className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span>{submitting === 'save' ? 'Salvando...' : 'Salvar no Histórico'}</span>
            </button>

            {tiktokConnected ? (
              <button
                type="button"
                onClick={() => void handleCreateAndOptionallyPublish('publish')}
                disabled={submitting !== null || generatingPreview}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{submitting === 'publish' ? 'Publicando...' : 'Publicar no TikTok'}</span>
              </button>
            ) : (
              onOpenTikTokSettings && (
                <button
                  type="button"
                  onClick={onOpenTikTokSettings}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-medium inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <span>Conectar TikTok</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Right Column: Live Poster Preview */}
        <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
          <div className="border border-slate-200 rounded-xl bg-slate-900 p-4 text-white space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPlayerViewMode('clean')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    playerViewMode === 'clean'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cartaz Completo
                </button>
                <button
                  type="button"
                  onClick={() => setPlayerViewMode('tiktok')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    playerViewMode === 'tiktok'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Prévia TikTok
                </button>
              </div>

              {slides.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsAudioPlayingInPreview(!isAudioPlayingInPreview)}
                    className="px-2 py-1 rounded-md hover:bg-slate-800 text-slate-300 text-xs inline-flex items-center gap-1"
                  >
                    {isAudioPlayingInPreview ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    <span>Som</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioMuted(!audioMuted)}
                    className="p-1 rounded-md hover:bg-slate-800 text-slate-300"
                    aria-label={audioMuted ? 'Desmutar áudio' : 'Mutar áudio'}
                  >
                    {audioMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>

            {currentSlide ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-black aspect-[4/5]">
                <img
                  src={currentSlide.dataUrl}
                  alt={currentSlide.label}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />

                {playerViewMode === 'tiktok' && (
                  <>
                    <div className="absolute bottom-0 inset-x-0 h-28 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />
                    <div className="absolute left-3.5 bottom-3 right-12 pointer-events-none text-left space-y-1">
                      <div className="text-xs font-semibold text-white">
                        {watermarkText.trim() || '@5573exp'}
                      </div>
                      <div className="text-xs text-slate-200 line-clamp-1">
                        A PUTA DE HOJE É: {formattedTargetName || '...'}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        {customHashtags}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="aspect-[4/5] rounded-xl border border-dashed border-slate-700 bg-slate-950/60 flex flex-col items-center justify-center text-center p-6 space-y-2.5">
                <div className="text-sm font-semibold text-slate-200">
                  Prévia do Cartaz (4:5)
                </div>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Preencha o nome, envie a imagem e explique o motivo à esquerda, depois clique em Gerar Prévia do Cartaz.
                </p>
              </div>
            )}

            {activeAudioTrack && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Áudio:</span>
                <span className="font-medium text-white truncate ml-2">
                  {activeAudioTrack.artist} — {activeAudioTrack.title}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
