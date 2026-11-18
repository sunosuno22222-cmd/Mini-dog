import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';

const execFileAsync = promisify(execFile);

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

export interface DemonicExpGenerationResult {
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

export interface GenerateDemonicExpOptions {
  involvedName?: string;
  promptTopic?: string;
  currentTitle?: string;
  currentInfo?: string;
  currentAdditional?: string;
  currentInsult?: string;
  generateImages?: boolean;
  expCode?: string;
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 5);
}

/**
 * Escapes characters for SVG injection.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an SVG representation of a demonic occult seal / sigil / hellfire artwork
 * and converts it into a high-res 1080x1350 JPEG buffer for the carousel.
 */
export async function generateDemonicArtworkBuffer(params: {
  motifType: 'sigil' | 'chains' | 'verdict';
  expCode: string;
  targetName?: string;
}): Promise<Buffer> {
  const W = 1080;
  const H = 1350;
  const { motifType, expCode, targetName } = params;
  const cleanTarget = (targetName || 'O CONDENADO').toUpperCase().slice(0, 36);

  let centerArtSvg = '';

  if (motifType === 'sigil') {
    // Inverted Pentagram & Occult Baphomet Sigil with Hellfire Glow
    centerArtSvg = `
      <!-- Demonic Radial Aura -->
      <circle cx="540" cy="620" r="380" fill="url(#bloodCoreGlow)"/>
      <circle cx="540" cy="620" r="320" fill="none" stroke="#DC2626" stroke-width="3" stroke-dasharray="14 8" opacity="0.65"/>
      <circle cx="540" cy="620" r="290" fill="none" stroke="#991B1B" stroke-width="2" opacity="0.85"/>
      <circle cx="540" cy="620" r="220" fill="none" stroke="#EF4444" stroke-width="1.5" stroke-dasharray="6 6"/>

      <!-- Inverted Occult Pentagram -->
      <polygon points="540,840 405,480 720,600 360,600 675,480" fill="none" stroke="#EF4444" stroke-width="5" stroke-linejoin="round" opacity="0.9"/>
      <polygon points="540,840 405,480 720,600 360,600 675,480" fill="rgba(153, 27, 27, 0.15)" stroke="#FF2A2A" stroke-width="2" opacity="0.7"/>

      <!-- Inner Demonic Eye -->
      <ellipse cx="540" cy="620" rx="90" ry="50" fill="#1A0305" stroke="#DC2626" stroke-width="3"/>
      <circle cx="540" cy="620" r="26" fill="#EF4444"/>
      <polygon points="540,580 546,620 540,660 534,620" fill="#0A0102"/>
      <circle cx="536" cy="614" r="5" fill="#FFF"/>

      <!-- Occult Runes around perimeter -->
      <text x="540" y="340" text-anchor="middle" font-family="monospace" font-size="28" font-weight="700" fill="#DC2626" letter-spacing="12">⛧ V E R I T A S   I N F E R N A L I S ⛧</text>
      <text x="540" y="940" text-anchor="middle" font-family="monospace" font-size="24" font-weight="700" fill="#EF4444" letter-spacing="8">SELO INFERNAL DE CONDENAÇÃO</text>
      <text x="540" y="980" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="20" font-weight="600" fill="#9CA3AF">${escapeXml(cleanTarget)}</text>
    `;
  } else if (motifType === 'chains') {
    // Blood Moon, Purgatory Chains and Skull of Eternal Judgment
    centerArtSvg = `
      <!-- Blood Moon -->
      <circle cx="540" cy="560" r="240" fill="url(#bloodMoonGrad)" stroke="#DC2626" stroke-width="4"/>
      <circle cx="540" cy="560" r="236" fill="url(#moonTexture)" opacity="0.55"/>

      <!-- Sinister Silhouette of Skull / Reaper -->
      <path d="M 460 500 Q 540 430 620 500 Q 640 560 610 630 L 590 690 L 490 690 L 470 630 Q 440 560 460 500 Z" fill="#0A0102" stroke="#EF4444" stroke-width="3"/>
      <circle cx="500" cy="530" r="20" fill="#EF4444"/>
      <circle cx="580" cy="530" r="20" fill="#EF4444"/>
      <polygon points="540,570 548,595 532,595" fill="#EF4444"/>
      <line x1="510" y1="640" x2="570" y2="640" stroke="#EF4444" stroke-width="4"/>
      <line x1="520" y1="630" x2="520" y2="650" stroke="#EF4444" stroke-width="3"/>
      <line x1="540" y1="630" x2="540" y2="650" stroke="#EF4444" stroke-width="3"/>
      <line x1="560" y1="630" x2="560" y2="650" stroke="#EF4444" stroke-width="3"/>

      <!-- Infernal Chains -->
      <path d="M 180 280 L 460 500 M 900 280 L 620 500 M 200 880 L 470 690 M 880 880 L 590 690" stroke="#7F1D1D" stroke-width="6" stroke-dasharray="16 10"/>

      <text x="540" y="810" text-anchor="middle" font-family="monospace" font-size="28" font-weight="700" fill="#EF4444" letter-spacing="8">⛧ LAÇOS DO PURGATÓRIO ⛧</text>
      <text x="540" y="850" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="20" font-weight="600" fill="#DC2626">SEM PERDÃO · SEM RETORNO</text>
    `;
  } else {
    // Grim Grimoire Decree & Demonic Stamp of Guilt
    centerArtSvg = `
      <!-- Occult Document Plaque -->
      <rect x="220" y="320" width="640" height="660" rx="16" fill="#0C0406" stroke="#991B1B" stroke-width="3"/>
      <rect x="240" y="340" width="600" height="620" rx="12" fill="none" stroke="#DC2626" stroke-width="1.5" stroke-dasharray="8 6"/>

      <!-- Blood Inverted Cross & Sigils -->
      <path d="M 540 370 L 540 540 M 470 490 L 610 490" stroke="#EF4444" stroke-width="6" stroke-linecap="round"/>
      <circle cx="540" cy="490" r="16" fill="none" stroke="#FF2A2A" stroke-width="2"/>

      <text x="540" y="600" text-anchor="middle" font-family="monospace" font-size="34" font-weight="800" fill="#F87171" letter-spacing="4">CONDENADO</text>
      <text x="540" y="640" text-anchor="middle" font-family="monospace" font-size="20" font-weight="700" fill="#EF4444" letter-spacing="6">DECRETO INFERNAL DE EXPOSIÇÃO</text>

      <rect x="290" y="670" width="500" height="2" fill="#7F1D1D"/>

      <text x="540" y="730" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="24" font-weight="700" fill="#FFFFFF">${escapeXml(cleanTarget)}</text>
      <text x="540" y="770" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="19" font-weight="500" fill="#E5E7EB">PROVAS IRREFUTÁVEIS · ARQUIVADO NO TÁRTARO</text>
      <text x="540" y="810" text-anchor="middle" font-family="monospace" font-size="18" font-weight="600" fill="#9CA3AF">${escapeXml(expCode)} · TIKTOK EXPOSURE CAROUSEL</text>

      <!-- Demonic Seal Stamp in Corner -->
      <circle cx="730" cy="860" r="54" fill="rgba(220, 38, 38, 0.2)" stroke="#DC2626" stroke-width="3"/>
      <text x="730" y="855" text-anchor="middle" font-family="monospace" font-size="15" font-weight="800" fill="#EF4444">5573</text>
      <text x="730" y="875" text-anchor="middle" font-family="monospace" font-size="12" font-weight="700" fill="#EF4444">SATAN</text>
    `;
  }

  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bloodCoreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="rgba(220, 38, 38, 0.35)"/>
          <stop offset="60%" stop-color="rgba(127, 29, 29, 0.15)"/>
          <stop offset="100%" stop-color="rgba(10, 1, 2, 0)"/>
        </radialGradient>
        <radialGradient id="bloodMoonGrad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#FF4D4D"/>
          <stop offset="50%" stop-color="#DC2626"/>
          <stop offset="90%" stop-color="#450A0A"/>
        </radialGradient>
        <linearGradient id="abyssBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#050102"/>
          <stop offset="45%" stop-color="#0F0305"/>
          <stop offset="100%" stop-color="#030001"/>
        </linearGradient>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#abyssBg)"/>

      <!-- Blood Smoke / Embers Texture -->
      <circle cx="200" cy="200" r="180" fill="rgba(185, 28, 28, 0.12)"/>
      <circle cx="880" cy="300" r="220" fill="rgba(153, 27, 27, 0.10)"/>
      <circle cx="540" cy="1100" r="260" fill="rgba(220, 38, 38, 0.14)"/>

      <!-- Demonic Double Architectural Frame -->
      <rect x="44" y="44" width="${W - 88}" height="${H - 88}" rx="24" fill="none" stroke="#7F1D1D" stroke-width="3"/>
      <rect x="58" y="58" width="${W - 116}" height="${H - 116}" rx="18" fill="none" stroke="#DC2626" stroke-width="1.5" stroke-dasharray="12 6" opacity="0.6"/>

      <!-- Runic Corner Glyphs -->
      <path d="M 44 94 L 44 44 L 94 44" fill="none" stroke="#EF4444" stroke-width="4"/>
      <path d="M ${W - 44} 94 L ${W - 44} 44 L ${W - 94} 44" fill="none" stroke="#EF4444" stroke-width="4"/>
      <path d="M 44 ${H - 94} L 44 ${H - 44} L 94 ${H - 44}" fill="none" stroke="#EF4444" stroke-width="4"/>
      <path d="M ${W - 44} ${H - 94} L ${W - 44} ${H - 44} L ${W - 94} ${H - 44}" fill="none" stroke="#EF4444" stroke-width="4"/>

      <!-- Header Banner -->
      <text x="94" y="114" font-family="monospace" font-size="22" font-weight="700" letter-spacing="3" fill="#EF4444">⛧ ${escapeXml(expCode)} ⛧</text>
      <text x="${W / 2}" y="114" text-anchor="middle" font-family="monospace" font-size="20" font-weight="800" letter-spacing="4" fill="#F87171">INTELIGÊNCIA DEMONÍACA 5573</text>
      <text x="${W - 94}" y="114" text-anchor="end" font-family="monospace" font-size="22" font-weight="700" fill="#DC2626">AI · ART</text>
      <line x1="94" y1="142" x2="${W - 94}" y2="142" stroke="#7F1D1D" stroke-width="2"/>

      <!-- Main Demonic Artwork -->
      ${centerArtSvg}

      <!-- Footer Bar -->
      <line x1="94" y1="${H - 134}" x2="${W - 94}" y2="${H - 134}" stroke="#7F1D1D" stroke-width="2"/>
      <text x="94" y="${H - 88}" font-family="monospace" font-size="20" font-weight="600" fill="#EF4444">⛧ ${escapeXml(expCode)} · CONDENAÇÃO TIKTOK</text>
      <text x="${W - 94}" y="${H - 88}" text-anchor="end" font-family="monospace" font-size="20" font-weight="700" fill="#FCA5A5">@5573satan</text>
    </svg>`,
  );

  return await sharp(svg).jpeg({ quality: 92 }).toBuffer();
}

/**
 * Applies a sinister demonic styling/filter to an existing image buffer
 * (deep blood-red contrast curve, vignette, runic red border).
 */
export async function applyDemonicFilterToImage(inputBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(inputBuffer).metadata().catch(() => null);
  if (!meta || !meta.width || !meta.height) {
    return inputBuffer;
  }

  const targetW = 1080;
  const targetH = 1350;

  // Resize and crop to 4:5
  const baseResized = await sharp(inputBuffer)
    .resize(targetW, targetH, {
      fit: 'cover',
      position: 'center',
    })
    .modulate({
      brightness: 0.88,
      saturation: 1.25,
    })
    .tint({ r: 240, g: 60, b: 60 })
    .toBuffer();

  // Overlay a sinister dark vignette and demonic runic border
  const overlaySvg = Buffer.from(
    `<svg width="${targetW}" height="${targetH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="demonicVignette" cx="50%" cy="50%" r="55%">
          <stop offset="40%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="85%" stop-color="rgba(25,3,6,0.65)"/>
          <stop offset="100%" stop-color="rgba(8,0,2,0.92)"/>
        </radialGradient>
      </defs>
      <rect width="${targetW}" height="${targetH}" fill="url(#demonicVignette)"/>
      <rect x="36" y="36" width="${targetW - 72}" height="${targetH - 72}" rx="18" fill="none" stroke="#DC2626" stroke-width="2.5" stroke-dasharray="16 8" opacity="0.75"/>
      <path d="M 36 86 L 36 36 L 86 36" fill="none" stroke="#EF4444" stroke-width="5"/>
      <path d="M ${targetW - 36} 86 L ${targetW - 36} 36 L ${targetW - 86} 36" fill="none" stroke="#EF4444" stroke-width="5"/>
      <path d="M 36 ${targetH - 86} L 36 ${targetH - 36} L 86 ${targetH - 36}" fill="none" stroke="#EF4444" stroke-width="5"/>
      <path d="M ${targetW - 36} ${targetH - 86} L ${targetW - 36} ${targetH - 36} L ${targetW - 86} ${targetH - 36}" fill="none" stroke="#EF4444" stroke-width="5"/>
      <text x="${targetW / 2}" y="${targetH - 58}" text-anchor="middle" font-family="monospace" font-size="20" font-weight="800" fill="#EF4444" letter-spacing="4">⛧ PROVA INFERNAL VERIFICADA · 5573 SATAN ⛧</text>
    </svg>`,
  );

  return await sharp(baseResized)
    .composite([{ input: overlaySvg, blend: 'over' }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Extracts a high-res video frame from an MP4/WebM buffer using ffmpeg.
 */
export async function extractFrameFromVideoBuffer(videoBuffer: Buffer): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const id = crypto.randomBytes(8).toString('hex');
  const tempVideoPath = path.resolve(tmpDir, `vid-${id}.mp4`);
  const tempOutJpg = path.resolve(tmpDir, `frame-${id}.jpg`);

  try {
    fs.writeFileSync(tempVideoPath, videoBuffer);
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      '00:00:01',
      '-i',
      tempVideoPath,
      '-vframes',
      '1',
      '-q:v',
      '2',
      tempOutJpg,
    ]);

    if (!fs.existsSync(tempOutJpg) || fs.statSync(tempOutJpg).size === 0) {
      // Fallback: try taking frame at 0.1s
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss',
        '00:00:00.100',
        '-i',
        tempVideoPath,
        '-vframes',
        '1',
        '-q:v',
        '2',
        tempOutJpg,
      ]);
    }

    const frameBuf = fs.readFileSync(tempOutJpg);
    return frameBuf;
  } finally {
    try {
      if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
      if (fs.existsSync(tempOutJpg)) fs.unlinkSync(tempOutJpg);
    } catch {
      // Ignore cleanup
    }
  }
}

/**
 * Calls Groq API to generate structured demonic EXP content (with fallback to Gemini).
 */
export async function generateDemonicExpContent(
  options: GenerateDemonicExpOptions,
): Promise<DemonicExpGenerationResult> {
  const involved = (options.involvedName || options.currentTitle || 'Alvo da Exposição').trim();
  const topic = (options.promptTopic || options.currentInfo || 'Atos ilícitos e traição').trim();
  const expCode = options.expCode || 'Exp 001';

  const systemPrompt = `Você é o gerador oficial da 5573 SATAN, uma IA que formula textos de EXPOSED e CONDENAÇÃO para carrosséis do TikTok no estilo estético demoníaco, gótico, implacável e sombrio.
O carrossel segue 8 passos obrigatórios e oficiais:
1. Título (chocante, com cruzes invertidas ou símbolos demoníacos, ex: ⛧ EXP 00X: CONDENAÇÃO INFERNAL DE [NOME] ⛧)
2. Informações (relato cronológico e direto dos fatos, acusações, dados e provas sem enrolação, tom frio e acusatório)
3-5. Imagens (serão inseridas visualmente)
6. Texto adicional (circunstâncias agravantes, histórico de mentiras, purgatório dos atos)
7. Insulto (maldição demoníaca pesada, humilhação retórica sofisticada e implacável contra o alvo)
8. Finalização (declaração de sentença selada, assinatura das trevas e aviso de que as provas foram encaminhadas)

Responda ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "title": "título demoníaco e impactante",
  "information": "texto detalhado dos fatos e motivos da condenação",
  "additionalText": "agravantes e relatos adicionais das sombras",
  "insultText": "maldição e insulto demoníaco final contra o indivíduo",
  "closingText": "sentença final selada no inferno",
  "watermarkText": "@5573satan",
  "caption": "legenda atrativa para o TikTok com aviso de exposed",
  "hashtags": "#5573 #satan #exp #demoniaco #exposed #fyb #condenado"
}
Não use markdown extra fora do bloco JSON. Use português brasileiro.`;

  const userPrompt = `Gere uma exposição demoníaca completa para:
Alvo: "${involved}"
Contexto e Atos: "${topic}"
Código da Ocorrência: "${expCode}"`;

  let parsedJson: {
    title?: string;
    information?: string;
    additionalText?: string;
    insultText?: string;
    closingText?: string;
    watermarkText?: string;
    caption?: string;
    hashtags?: string;
  } | null = null;

  let usedProvider: 'groq' | 'gemini' = 'groq';
  let usedModel = DEFAULT_GROQ_MODEL;

  // 1. Try Groq API first if configured
  if (isGroqConfigured()) {
    try {
      const groqKey = process.env.GROQ_API_KEY!.trim();
      const resp = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_GROQ_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });

      if (resp.ok) {
        const groqData = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          model?: string;
        };
        const content = groqData.choices?.[0]?.message?.content;
        if (content) {
          parsedJson = JSON.parse(content);
          usedProvider = 'groq';
          usedModel = groqData.model || DEFAULT_GROQ_MODEL;
        }
      } else {
        console.warn('[GroqService] Groq API returned status:', resp.status, await resp.text().catch(() => ''));
      }
    } catch (err) {
      console.warn('[GroqService] Groq request failed, falling back to Gemini:', err);
    }
  }

  // 2. Fallback to Gemini if Groq was not available or failed
  if (!parsedJson) {
    try {
      const ai = new GoogleGenAI();
      const geminiResp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${systemPrompt}\n\n${userPrompt}`,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.75,
        },
      });

      const text = geminiResp.text;
      if (text) {
        parsedJson = JSON.parse(text);
        usedProvider = 'gemini';
        usedModel = 'gemini-2.5-flash';
      }
    } catch (geminiErr) {
      console.error('[GroqService] Gemini fallback failed:', geminiErr);
    }
  }

  // 3. Fallback to deterministic demonic template if AI APIs fail
  const title =
    parsedJson?.title?.trim() ||
    `⛧ ${expCode.toUpperCase()}: CONDENAÇÃO INFERNAL DE ${involved.toUpperCase()} ⛧`;
  const information =
    parsedJson?.information?.trim() ||
    `Ocorrência registrada perante as forças da 5573. O indivíduo ${involved} foi julgado e considerado culpado por traição, perjúrio e conduta ilícita desmascarada pelos membros. Provas irrefutáveis anexadas aos anais da condenação.`;
  const additionalText =
    parsedJson?.additionalText?.trim() ||
    `Agravantes do Purgatório: O acusado reincidiu em mentiras deslavadas, manipulou provas e agiu com covardia ao ser confrontado. Toda a verdade vem à tona sob o selo de fogo.`;
  const insultText =
    parsedJson?.insultText?.trim() ||
    `Uma criatura rastejante que achou que passaria impune. Sua arrogância é seu túmulo e sua reputação agora arde sob o julgamento da 5573 SATAN. Desprezível e condenado.`;
  const closingText =
    parsedJson?.closingText?.trim() ||
    `⛧ SENTENÇA DEFINITIVA SELADA · EXPILATIO INFERNALIS CONCLUSA ⛧`;
  const watermarkText = parsedJson?.watermarkText?.trim() || '@5573satan';
  const caption = parsedJson?.caption?.trim() || `${expCode} — Condenação infernal de ${involved}`;
  const hashtags =
    parsedJson?.hashtags?.trim() || '#5573 #satan #exp #condenado #demoniaco #exposed #fyb';

  // 4. Generate demonic artwork images if requested
  const aiImagesBase64: string[] = [];
  if (options.generateImages !== false) {
    const motifs: Array<'sigil' | 'chains' | 'verdict'> = ['sigil', 'chains', 'verdict'];
    for (const motif of motifs) {
      try {
        const artBuf = await generateDemonicArtworkBuffer({
          motifType: motif,
          expCode,
          targetName: involved,
        });
        aiImagesBase64.push(`data:image/jpeg;base64,${artBuf.toString('base64')}`);
      } catch (err) {
        console.error('[GroqService] Falha ao gerar arte demoníaca:', err);
      }
    }
  }

  return {
    provider: usedProvider,
    model: usedModel,
    title,
    information,
    additionalText,
    insultText,
    closingText,
    watermarkText,
    caption,
    hashtags,
    aiImagesBase64,
  };
}
