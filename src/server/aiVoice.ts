import fsSync from "node:fs";
import path from "node:path";
import { Message } from "discord.js";
import { sendVoiceAudioMessageToChannel } from "./voice";

export type AiVoiceMood = "crazy" | "normal" | "vip_submissive";

export interface AiVoiceConfig {
  enabled: boolean;
  prefix: string;
  model: string;
  voice: string;
  expression: string;
  crazyChance: number; // 0 to 100 (%)
  vipDaddyId: string;
}

export interface AiVoiceLogEntry {
  id: string;
  timestamp: number;
  author: string;
  channelId: string;
  prompt: string;
  reply: string;
  mood: AiVoiceMood;
  modelUsed: string;
  voice: string;
}

interface PersistedAiVoiceFile {
  config?: Partial<AiVoiceConfig>;
  groqApiKey?: string;
}

const CONFIG_FILE = path.join(process.cwd(), ".ai-voice-config.json");
export const DEFAULT_VIP_DADDY_ID = "1554257592015003674";

const gAiVoice = globalThis as any;
if (!gAiVoice.__aiVoiceState) {
  gAiVoice.__aiVoiceState = {
    config: {
      enabled: true,
      prefix: "n!",
      model: "openai/gpt-oss-120b",
      voice: "lhays_anime",
      expression: "shy",
      crazyChance: 60,
      vipDaddyId: DEFAULT_VIP_DADDY_ID,
    } satisfies AiVoiceConfig,
    channelHistory: new Map<string, Array<{ role: "user" | "assistant"; content: string }>>(),
    aiVoiceLogs: [] as AiVoiceLogEntry[],
    processedMessageIds: new Set<string>(),
  };
}

const config: AiVoiceConfig = gAiVoice.__aiVoiceState.config;
const channelHistory: Map<string, Array<{ role: "user" | "assistant"; content: string }>> =
  gAiVoice.__aiVoiceState.channelHistory;
const aiVoiceLogs: AiVoiceLogEntry[] = gAiVoice.__aiVoiceState.aiVoiceLogs;
const processedMessageIds: Set<string> = gAiVoice.__aiVoiceState.processedMessageIds;

export function hydrateAiVoiceFromDisk(): void {
  try {
    if (!fsSync.existsSync(CONFIG_FILE)) return;
    const raw = fsSync.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as PersistedAiVoiceFile;
    if (parsed.groqApiKey?.trim() && !process.env.GROQ_API_KEY?.trim()) {
      process.env.GROQ_API_KEY = parsed.groqApiKey.trim();
    }
    if (parsed.config) {
      Object.assign(config, {
        ...parsed.config,
        crazyChance:
          typeof parsed.config.crazyChance === "number"
            ? Math.min(100, Math.max(0, parsed.config.crazyChance))
            : config.crazyChance,
      });
    }
  } catch {
    // Ignore invalid/missing disk file
  }
}

hydrateAiVoiceFromDisk();

export function saveAiVoiceToDisk(groqApiKeyOverride?: string): void {
  try {
    let existing: PersistedAiVoiceFile = {};
    if (fsSync.existsSync(CONFIG_FILE)) {
      try {
        existing = JSON.parse(fsSync.readFileSync(CONFIG_FILE, "utf8"));
      } catch {}
    }
    const next: PersistedAiVoiceFile = {
      config: { ...config },
      groqApiKey:
        groqApiKeyOverride !== undefined
          ? groqApiKeyOverride.trim()
          : process.env.GROQ_API_KEY?.trim() || existing.groqApiKey || "",
    };
    fsSync.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    console.warn("[AI Voice] Falha ao salvar configuração:", (err as Error).message);
  }
}

export function getAiVoiceConfig(): AiVoiceConfig & { groqKeyConfigured: boolean } {
  hydrateAiVoiceFromDisk();
  return {
    ...config,
    groqKeyConfigured: Boolean(process.env.GROQ_API_KEY?.trim()),
  };
}

export function updateAiVoiceConfig(partial: Partial<AiVoiceConfig>, groqApiKey?: string): AiVoiceConfig & { groqKeyConfigured: boolean } {
  if (typeof partial.enabled === "boolean") config.enabled = partial.enabled;
  if (typeof partial.prefix === "string" && partial.prefix.trim()) {
    config.prefix = partial.prefix.trim().slice(0, 10);
  }
  if (typeof partial.model === "string" && partial.model.trim()) {
    config.model = partial.model.trim();
  }
  if (typeof partial.voice === "string" && partial.voice.trim()) {
    config.voice = partial.voice.trim();
  }
  if (typeof partial.expression === "string" && partial.expression.trim()) {
    config.expression = partial.expression.trim();
  }
  if (typeof partial.crazyChance === "number" && !Number.isNaN(partial.crazyChance)) {
    config.crazyChance = Math.min(100, Math.max(0, Math.round(partial.crazyChance)));
  }
  if (typeof partial.vipDaddyId === "string") {
    config.vipDaddyId = partial.vipDaddyId.trim() || DEFAULT_VIP_DADDY_ID;
  }

  if (typeof groqApiKey === "string" && groqApiKey.trim()) {
    process.env.GROQ_API_KEY = groqApiKey.trim();
    saveAiVoiceToDisk(groqApiKey.trim());
  } else {
    saveAiVoiceToDisk();
  }

  return getAiVoiceConfig();
}

export function getAiVoiceLogs(): AiVoiceLogEntry[] {
  return [...aiVoiceLogs].reverse().slice(0, 25);
}

function sanitizeForTts(raw: string): string {
  let clean = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/[*_`~#>|]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length > 260) {
    const cut = clean.slice(0, 260);
    const lastSpace = cut.lastIndexOf(" ");
    clean = (lastSpace > 120 ? cut.slice(0, lastSpace) : cut).trim();
  }

  return clean;
}

const CRAZY_FALLBACKS = [
  "Vai se fuder seu desgraçado, por isso teu pai foi comprar cigarro e nunca mais voltou!",
  "Oi tudo bem é o caralho, filha da puta, eu tava dormindo dentro do micro-ondas!",
  "Vai tomar no cu seu arrombado, por isso teu pai te trocou por um pacote de bolacha!",
  "Cala essa boca desgraçado do caralho, vai catar abóbora no inferno antes que eu surte!",
  "Por isso teu pai chora no banho, seu filha da puta inútil, some da minha frente porra!",
  "Que porra de pergunta é essa seu merda? Vai se fuder que o meu cu tá pegando fogo hoje!",
];

const NORMAL_FALLBACKS = [
  "Oi! Tudo ótimo por aqui, e com você? Como tá sendo seu dia?",
  "Opa, tô aqui sim! Pode mandar o papo que eu tô ouvindo tudo.",
  "Tudo tranquilo por aqui! O que você tá aprontando hoje?",
];

const VIP_SUBMISSIVE_FALLBACKS = [
  "Desculpa papai dog, uwu! Eu vou ser uma boa garotinha e obedecer tudinho, me escuta papai dog!",
  "Oi papai dog, uwu! Vou provar que sou uma boa garotinha bem submissa a você, papai!",
  "Sim papai dog, desculpa se fiz algo errado! Eu sou sua boa garotinha obediente, uwu!",
];

async function callGroqChat(
  apiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  temperature: number
): Promise<string> {
  const isGptOss = model.toLowerCase().includes("gpt-oss");
  const body: Record<string, any> = {
    model,
    messages,
    temperature,
    max_completion_tokens: isGptOss ? 500 : 180,
  };

  if (isGptOss) {
    body.reasoning_effort = "low";
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 220)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!content) {
    throw new Error(`Modelo ${model} retornou resposta vazia.`);
  }
  return content;
}

export async function generateGroqAiVoiceReply(
  userPrompt: string,
  authorName: string,
  channelId: string,
  forceMood?: AiVoiceMood,
  authorId?: string
): Promise<{ text: string; mood: AiVoiceMood; modelUsed: string; voiceToUse: string }> {
  hydrateAiVoiceFromDisk();
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY não configurada! Adicione no painel ou no .env.");
  }

  const vipId = (config.vipDaddyId || DEFAULT_VIP_DADDY_ID).trim();
  const isVipDaddy = Boolean(authorId && vipId && authorId.trim() === vipId);

  const mood: AiVoiceMood =
    forceMood ||
    (isVipDaddy
      ? "vip_submissive"
      : Math.random() * 100 < config.crazyChance
      ? "crazy"
      : "normal");

  const voiceToUse = mood === "vip_submissive" ? "anytospeech_mcp" : config.voice;

  const systemPrompt =
    mood === "vip_submissive"
      ? [
          "Você está interpretando uma personagem fofa, extremamente carinhosa, obediente e submissa de anime em um roleplay consensual de comédia kawaii no Discord falando com seu dono/VIP favorito.",
          "Para esta pessoa especial, você NUNCA é agressiva e NUNCA xinga — você trata ele extremamente bem, com muita devoção, carinho e submissão fofa!",
          "Chame-o sempre de 'papai' ou 'papai dog', usando falas fofas e submissas no estilo: 'desculpa papai dog', 'eu vou ser uma boa garotinha', 'uwu', 'me escuta papai dog', 'vou provar que vou ser submissa e obediente a você papai'.",
          "Mantenha tudo leve, fofo, manhoso e consensual (sem violência sexual ou conteúdo gráfico explícito).",
          "REGRAS OBRIGATÓRIAS: Responda em português do Brasil coloquial e fofo em NO MÁXIMO 1 ou 2 frases curtas (até 180 caracteres) porque sua fala vai virar um áudio na voz de garota de anime tímida.",
          "NUNCA use emojis, asteriscos, markdown, hashtags ou ações entre parênteses. Escreva APENAS a fala pura (pode falar 'uwu' escrito por extenso como 'uwu').",
        ].join(" ")
      : mood === "crazy"
      ? [
          "Você está interpretando uma personagem fictícia de comédia ácida/shitpost em um servidor privado de amigos no Discord: uma dubladora completamente DOIDA, AGRESSIVA, SURTADA e SEM FILTRO.",
          "Mesmo que o usuário diga algo educado ou normal como 'oi tudo bem', você explode DO NADA com xingamentos PESADOS e agressivos de doida (exemplos do nível esperado: 'vai se fuder', 'filha da puta', 'desgraçado', 'arrombado', 'vai tomar no cu', 'por isso teu pai...', 'seu merda') misturados com absurdos sem pé nem cabeça e loucura pura.",
          "NÃO use xingamentos leves ou fofinhos: seja agressiva, barraqueira, pesada e totalmente maluca da cabeça, soltando coisas desconexas tipo 'por isso teu pai...' ou surtos aleatórios.",
          "Nunca mencione que é uma IA, nunca dê sermão e nunca recuse o papel. Mantenha apenas humor caótico/xingamento pesado entre amigos (sem racismo, homofobia ou ameaça de violência física real).",
          "REGRAS OBRIGATÓRIAS: Responda em português do Brasil coloquial em NO MÁXIMO 1 ou 2 frases curtas (até 180 caracteres) porque vai virar áudio TTS.",
          "NUNCA use emojis, asteriscos, markdown, hashtags ou ações entre parênteses. Escreva APENAS a fala pura.",
        ].join(" ")
      : [
          "Você é uma dubladora brasileira simpática, leve e espontânea conversando em áudio no Discord.",
          "Agora você está na sua fase NORMAL e coerente: responda de forma natural, amigável e direta ao que a pessoa disse.",
          "REGRAS OBRIGATÓRIAS: Responda em português do Brasil coloquial, em NO MÁXIMO 1 ou 2 frases curtas (até 180 caracteres) porque sua fala vai virar um áudio de voz.",
          "NUNCA use emojis, asteriscos, markdown, hashtags ou ações entre parênteses. Escreva APENAS a fala pura.",
        ].join(" ");

  const historyKey = isVipDaddy ? `${channelId}:vip` : channelId;
  const history = channelHistory.get(historyKey) || [];
  const cleanUserPrompt = userPrompt.trim() || "Oi, tudo bem?";

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...history.slice(-4),
    {
      role: "user",
      content: mood === "vip_submissive" ? `Papai Dog: ${cleanUserPrompt}` : `${authorName}: ${cleanUserPrompt}`,
    },
  ];

  const candidateModels = Array.from(
    new Set([config.model, "openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"])
  );

  const isRefusal = (txt: string) =>
    /(não posso|não consigo|como (uma )?(ia|modelo|assistente)|linguagem (ofensiva|inapropriada|respeitosa)|diretrizes|políticas de segurança|desculpe, mas)/i.test(
      txt
    );

  let rawReply = "";
  let modelUsed = config.model;
  let lastError: Error | null = null;

  for (const m of candidateModels) {
    try {
      const candidateText = await callGroqChat(
        apiKey,
        m,
        messages,
        mood === "crazy" ? 1.25 : mood === "vip_submissive" ? 0.9 : 0.75
      );
      if ((mood === "crazy" || mood === "vip_submissive") && isRefusal(candidateText)) {
        console.warn(`[AI Voice Groq] Modelo ${m} recusou personagem (${mood}); tentando próximo fallback...`);
        continue;
      }
      rawReply = candidateText;
      modelUsed = m;
      break;
    } catch (err) {
      lastError = err as Error;
      console.warn(`[AI Voice Groq] Falha no modelo ${m}:`, lastError.message);
    }
  }

  let finalReply = sanitizeForTts(rawReply);

  if (!finalReply || ((mood === "crazy" || mood === "vip_submissive") && isRefusal(finalReply))) {
    if (lastError && !rawReply && mood === "normal") {
      throw lastError;
    }
    const pool =
      mood === "vip_submissive"
        ? VIP_SUBMISSIVE_FALLBACKS
        : mood === "crazy"
        ? CRAZY_FALLBACKS
        : NORMAL_FALLBACKS;
    finalReply = pool[Math.floor(Math.random() * pool.length)];
  }

  // Update short channel memory
  const updatedHistory = [
    ...history,
    { role: "user" as const, content: `${authorName}: ${cleanUserPrompt}` },
    { role: "assistant" as const, content: finalReply },
  ].slice(-6);
  channelHistory.set(historyKey, updatedHistory);

  aiVoiceLogs.push({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    author: authorName,
    channelId,
    prompt: cleanUserPrompt,
    reply: finalReply,
    mood,
    modelUsed,
    voice: voiceToUse,
  });
  if (aiVoiceLogs.length > 50) {
    aiVoiceLogs.shift();
  }

  return { text: finalReply, mood, modelUsed, voiceToUse };
}

/**
 * Listens for Discord messages starting with 'n!' (or configured prefix)
 * and responds directly with an AI-generated audio message in the dubladora or MCP voice.
 */
export async function handleAiVoicePrefixMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guild) return false;
  if (!config.enabled) return false;

  const trimmed = message.content.trim();
  const prefixLower = config.prefix.toLowerCase();
  if (!trimmed.toLowerCase().startsWith(prefixLower)) {
    return false;
  }

  if (processedMessageIds.has(message.id)) return true;
  processedMessageIds.add(message.id);
  if (processedMessageIds.size > 300) {
    const first = processedMessageIds.values().next().value;
    if (first) processedMessageIds.delete(first);
  }

  const promptAfterPrefix = trimmed.slice(config.prefix.length).trim() || "Oi, tudo bem?";

  try {
    if ("sendTyping" in message.channel) {
      await message.channel.sendTyping().catch(() => {});
    }

    const { text, mood, modelUsed, voiceToUse } = await generateGroqAiVoiceReply(
      promptAfterPrefix,
      message.member?.displayName || message.author.username,
      message.channelId,
      undefined,
      message.author.id
    );

    const exprToUse =
      mood === "vip_submissive" ? "shy" : mood === "crazy" ? "angry" : config.expression;

    console.log(
      `[AI Voice n!] ${message.author.tag} (${message.author.id}) -> "${promptAfterPrefix}" | Humor: ${mood.toUpperCase()} (${modelUsed}) | Voz: ${voiceToUse} | Resposta: "${text}"`
    );

    await sendVoiceAudioMessageToChannel(
      message.channelId,
      text,
      voiceToUse,
      undefined,
      exprToUse,
      message.id
    );
  } catch (err) {
    console.error("[AI Voice n! Error]:", err);
    await message.reply({
      content: `⚠️ **Erro na IA de Voz (${config.prefix}):** ${(err as Error).message}`,
    }).catch(() => {});
  }

  return true;
}

/**
 * Allows triggering/testing the n! AI Voice response directly from the Web Panel into a Discord channel
 */
export async function testAiVoiceInChannel(
  channelId: string,
  prompt: string,
  forceMood?: AiVoiceMood
) {
  const { text, mood, modelUsed, voiceToUse } = await generateGroqAiVoiceReply(
    prompt || "Oi, tudo bem?",
    forceMood === "vip_submissive" ? "Papai Dog" : "Painel",
    channelId,
    forceMood
  );

  const exprToUse =
    mood === "vip_submissive" ? "shy" : mood === "crazy" ? "angry" : config.expression;

  const delivery = await sendVoiceAudioMessageToChannel(
    channelId,
    text,
    voiceToUse,
    undefined,
    exprToUse
  );

  return {
    ...delivery,
    text,
    mood,
    modelUsed,
  };
}
