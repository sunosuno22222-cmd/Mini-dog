import fsSync from "node:fs";
import path from "node:path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Guild,
  GuildMember,
  Message,
  ModalBuilder,
  ModalSubmitInteraction,
  OverwriteResolvable,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  VoiceBasedChannel,
  VoiceState,
} from "discord.js";
import { getBotClient } from "./bot";
import { hydrateAiVoiceFromDisk } from "./aiVoice";
import {
  joinVoiceCall,
  leaveVoiceCall,
  speakInVoiceCall,
  waitForVoiceQueueIdle,
  synthesizeSpeechAudio,
  queuePreloadedAudioBuffersInVoiceCall,
} from "./voice";
import {
  ensureGameStickersReady,
  ensureUserAvatarSticker,
  getCachedUserAvatarSticker,
  getStickerTag,
  formatFichaRecord,
} from "./stickers";

export const DEFAULT_GAME_OWNER_ID = "1554257592015003674";

export const DEFAULT_CRIMINAL_QUESTIONS: string[] = [
  "Se você ficasse preso dentro de um elevador sozinho e sem sinal no celular, o que você faria?",
  "Se você ganhasse 1 milhão de reais na loteria hoje à tarde, qual seria a primeira coisa que faria?",
  "Se você acordasse atrasado 2 horas para o compromisso mais importante da sua vida, como resolveria?",
  "Se você perdesse seu celular e sua carteira em outra cidade durante uma viagem, o que faria primeiro?",
  "Se acabasse a energia elétrica no seu bairro por 3 dias seguidos, como você se viraria?",
  "Se você encontrasse uma carteira na rua com 5 mil reais e nenhum documento, o que você faria?",
  "Se você tivesse que cozinhar um jantar completo em 20 minutos para impressionar alguém, o que faria?",
  "Se seu cachorro ou gato saísse correndo para a rua à noite, como você faria para encontrá-lo rápido?",
  "Se você esquecesse o aniversário da pessoa mais importante para você no próprio dia, como salvaria a situação?",
  "Se você ficasse preso numa ilha deserta podendo levar apenas 3 itens da sua mochila, quais escolheria?",
  "Se o pneu do seu carro ou bicicleta furasse no meio da chuva longe de casa, o que você faria?",
  "Se você derrubasse café quente no notebook minutos antes de uma apresentação, qual seria seu plano?",
  "Se você recebesse uma mensagem dizendo que ganhou uma viagem gratuita para sair em 1 hora, para onde iria e como se prepararia?",
  "Se todos os seus aplicativos de banco parassem de funcionar bem na hora de pagar a conta no restaurante, como sairia dessa?",
  "Se você tivesse que sobreviver uma semana inteira gastando no máximo 50 reais, o que compraria?",
  "Se um amigo próximo contasse um segredo enorme e outra pessoa começasse a perguntar sobre isso, como reagiria?",
  "Se você ficasse trancado do lado de fora de casa de pijama e sem chave, como entraria ou o que faria?",
  "Se você pudesse voltar exatamente 5 anos no tempo mantendo todas as memórias de hoje, o que mudaria?",
  "Se você fosse convidado para dar uma palestra improvisada sobre um assunto que não domina, como conduziria?",
  "Se você perdesse o último ônibus ou metrô de volta para casa de madrugada sem bateria no celular, o que faria?",
  "Se você descobrisse que seu vizinho está fazendo uma obra barulhenta às 6 da manhã todo domingo, como resolveria?",
  "Se você tivesse que aprender uma habilidade nova do zero em apenas 7 dias, qual escolheria e como estudaria?",
  "Se a internet do mundo inteiro caísse por 30 dias, o que você faria com todo o seu tempo livre?",
  "Se você comprasse algo caro pela internet e chegasse uma caixa com um tijolo dentro, o que faria passo a passo?",
  "Se você entrasse no ônibus ou metrô errado e só percebesse 1 hora depois em um lugar desconhecido, como voltaria?",
  "Se você tivesse que escolher um único prato para comer pelo resto da vida, qual seria e por quê?",
  "Se você fosse chefe de uma empresa por um dia, qual mudança prática faria primeiro?",
  "Se você estivesse numa entrevista de emprego e o entrevistador fizesse uma pergunta que você não sabe responder, o que diria?",
  "Se você precisasse acalmar uma criança chorando muito no meio de um voo longo, qual estratégia usaria?",
  "Se você descobrisse que tem apenas 24 horas livres sem nenhuma obrigação no mundo, como aproveitaria?",
  "Se você fosse morar sozinho pela primeira vez amanhã com orçamento apertado, quais 3 coisas priorizaria?",
  "Se você encontrasse um animal silvestre perdido no quintal da sua casa, como agiria com segurança?",
  "Se você tivesse que convencer alguém desconhecido a te ajudar numa mudança sem pagar nada, o que ofereceria em troca?",
  "Se você recebesse por engano uma encomenda gigante na sua porta no nome de outra pessoa, o que faria?",
  "Se você percebesse no meio de uma prova importante que estudou a matéria errada, como tentaria ir bem mesmo assim?",
  "Se você tivesse que ficar 48 horas acordado trabalhando num projeto urgente, como manteria o foco sem desistir?",
  "Se você viajasse para um país onde ninguém fala o seu idioma e seu tradutor não funcionasse, como se comunicaria?",
  "Se você estivesse num restaurante e percebesse que a comida veio completamente errada, mas está com muita pressa, o que faria?",
  "Se você pudesse criar uma lei simples que todo mundo no Brasil tivesse que seguir amanhã, qual seria?",
  "Se você tivesse que organizar uma festa surpresa incrível em apenas 3 horas, qual seria o seu plano?",
  "Se o seu melhor amigo pedisse sua opinião sincera sobre uma ideia muito ruim que ele está animado, o que você diria?",
  "Se você acordasse falando fluentemente qualquer idioma que escolher, qual escolheria e como usaria isso?",
  "Se você precisasse guardar um objeto muito valioso em casa sem ter cofre, onde esconderia?",
  "Se você ficasse sem água em casa bem na hora de tomar banho antes de sair, como resolveria rápido?",
  "Se você visse alguém passando mal na rua e ninguém ao redor estivesse ajudando, quais seriam suas primeiras ações?",
  "Se você tivesse que escolher entre um trabalho dos sonhos ganhando pouco ou um trabalho chato ganhando muito, qual escolheria e como lidaria?",
  "Se você perdesse todas as fotos e arquivos do seu computador hoje, o que faria para reconstruir tudo?",
  "Se você tivesse que passar um fim de semana inteiro numa cabana na serra sem televisão nem celular, o que levaria para se divertir?",
  "Se um amigo te emprestasse algo caro e você acabasse quebrando sem querer, como contaria e resolveria?",
  "Se você recebesse uma proposta para mudar de país amanhã com tudo pago, aceitaria na hora ou o que avaliaria antes?",
  "Se você fosse responsável por animar uma festa em que ninguém se conhece e todo mundo está quieto, o que faria?",
  "Se você acordasse com 10 anos de idade mantendo a cabeça de hoje, qual seria seu plano de vida?",
  "Se você tivesse que economizar metade do seu dinheiro todo mês a partir de agora, o que cortaria primeiro?",
  "Se você estivesse perdido numa trilha no meio do mato ao entardecer, o que faria para ficar seguro?",
  "Se você pudesse conversar por 10 minutos com qualquer pessoa da história, quem escolheria e o que perguntaria?",
  "Se você tivesse que montar um pequeno negócio do zero com apenas 200 reais, o que venderia ou faria?",
  "Se você esquecesse completamente o nome de alguém que veio falar com você todo animado na rua, como disfarçaria?",
  "Se você percebesse que pegou o carrinho de compras de outra pessoa no supermercado só depois de chegar no caixa, o que faria?",
  "Se você pudesse eliminar um único problema do seu dia a dia para sempre, qual escolheria?",
  "Se você tivesse que escolher 3 regras básicas para uma amizade durar a vida toda, quais seriam?",
];

export const DEFAULT_QUESTIONS_PER_MATCH = 4;

export const DEFAULT_RULES =
  "1. Entre na call normal e clique em **Pronto** para fazer seu registro.\n2. Todos os participantes (incluindo o dono) precisam confirmar que estão prontos.\n3. Quando todos estiverem prontos, o dono clica em **Começar** e cada jogador responde na caixa de texto!";

export type CallGamePhase = "idle" | "lobby" | "starting" | "playing" | "finished";

export interface CallGameReadyPlayer {
  userId: string;
  username: string;
  gender: "m" | "f";
  voiceId?: string;
  readyAt: number;
}

export interface CallGameMatchPlayer {
  userId: string;
  username: string;
  gender: "m" | "f";
  voiceId?: string;
  privateTextChannelId: string | null;
  questionMessageId?: string | null;
  totalPoints: number;
}

export interface CallGameRoundAnswer {
  userId: string;
  username: string;
  answer: string;
  points: number;
  aiComment: string;
  answeredAt: number;
}

export interface CallGameRoundResult {
  roundIndex: number;
  question: string;
  winnerUserId: string | null;
  winnerUsername: string | null;
  winnerAnswer: string | null;
  explanation: string;
  answers: CallGameRoundAnswer[];
}

export interface CallGameEventLog {
  id: string;
  time: number;
  text: string;
}

export interface CallGameSession {
  active: boolean;
  phase: CallGamePhase;
  guildId: string;
  ownerUserId: string;
  voiceChannelId: string;
  voiceChannelName: string;
  tempVoiceChannelId: string | null;
  tempVoiceChannelName: string | null;
  privateChannelId: string | null;
  privateChannelName: string | null;
  smsChannelId: string | null;
  panelMessageId: string | null;
  allReadyMessageId?: string | null;
  currentRoundMessageId?: string | null;
  voice: string;
  expression: string;
  rulesText: string;
  questionPool: string[];
  questionsPerMatch: number;
  questions: string[];
  roundSeconds: number;
  currentRoundIndex: number;
  currentQuestion: string | null;
  roundDeadlineAt: number | null;
  startedAt: number;
  readyPlayers: CallGameReadyPlayer[];
  matchPlayers: CallGameMatchPlayer[];
  roundResults: CallGameRoundResult[];
  events: CallGameEventLog[];
}

interface PersistedGuildGameState {
  guildId: string;
  active: boolean;
  smsChannelId: string | null;
  privateChannelId: string | null;
  tempVoiceChannelId: string | null;
  playerChannelIds: string[];
  updatedAt: number;
}

interface InternalRuntimeState {
  session: CallGameSession;
  aborted: boolean;
  roundActive: boolean;
  currentAnswers: Map<string, { userId: string; username: string; answer: string; answeredAt: number }>;
  playerChannelToUserId: Map<string, string>;
  roundDoneResolver: (() => void) | null;
  roundTimeoutHandle: ReturnType<typeof setTimeout> | null;
}

const GAME_STATE_FILE = path.join(process.cwd(), ".call-game-state.json");

// Store runtime Maps on globalThis so Vite SSR reloads NEVER drop active games or player drafts
const gStateAny = globalThis as any;
if (!gStateAny.__callGameState) {
  gStateAny.__callGameState = {
    activeRuntimes: new Map<string, InternalRuntimeState>(),
    recentJoinDebounce: new Map<string, number>(),
    pendingAutoDeleteVoiceChannels: new Map<string, string>(),
    recentQuestionsByGuild: new Map<string, Set<string>>(),
    playerDrafts: new Map<string, any>(),
  };
}
const activeRuntimes: Map<string, InternalRuntimeState> = gStateAny.__callGameState.activeRuntimes;
const recentJoinDebounce: Map<string, number> = gStateAny.__callGameState.recentJoinDebounce;
const pendingAutoDeleteVoiceChannels: Map<string, string> = gStateAny.__callGameState.pendingAutoDeleteVoiceChannels;
const recentQuestionsByGuild: Map<string, Set<string>> = gStateAny.__callGameState.recentQuestionsByGuild;

function readPersistedGameStates(): Record<string, PersistedGuildGameState> {
  try {
    if (!fsSync.existsSync(GAME_STATE_FILE)) return {};
    const parsed = JSON.parse(fsSync.readFileSync(GAME_STATE_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePersistedGameStates(states: Record<string, PersistedGuildGameState>): void {
  try {
    if (Object.keys(states).length === 0) {
      if (fsSync.existsSync(GAME_STATE_FILE)) fsSync.unlinkSync(GAME_STATE_FILE);
      return;
    }
    fsSync.writeFileSync(GAME_STATE_FILE, JSON.stringify(states, null, 2), "utf8");
  } catch (err) {
    console.warn("[CallGame] Falha ao persistir estado em disco:", (err as Error).message);
  }
}

function syncPersistedGameState(session: CallGameSession): void {
  const states = readPersistedGameStates();
  const playerChannelIds = session.matchPlayers
    .map((p) => p.privateTextChannelId)
    .filter((id): id is string => Boolean(id));

  states[session.guildId] = {
    guildId: session.guildId,
    active: session.active,
    smsChannelId: session.smsChannelId || null,
    privateChannelId: session.privateChannelId || null,
    tempVoiceChannelId: session.tempVoiceChannelId || null,
    playerChannelIds,
    updatedAt: Date.now(),
  };
  writePersistedGameStates(states);
}

function clearPersistedGameState(guildId: string): void {
  const states = readPersistedGameStates();
  if (states[guildId]) {
    delete states[guildId];
    writePersistedGameStates(states);
  }
}

function isCallGameChannelName(name: string): boolean {
  const norm = name.normalize("NFKC").toLowerCase();
  return (
    norm.includes("jogo-da-call") ||
    norm.includes("jogo-principal") ||
    norm.includes("・resp-") ||
    norm.startsWith("resp-")
  );
}

async function findSmsMainChannel(
  guild: Guild,
  preferredChannelId?: string | null
): Promise<TextChannel | null> {
  if (preferredChannelId) {
    const pref =
      guild.channels.cache.get(preferredChannelId) ||
      (await guild.channels.fetch(preferredChannelId).catch(() => null));
    if (pref && pref.isTextBased() && !pref.isVoiceBased() && !pref.isThread()) {
      return pref as TextChannel;
    }
  }

  if (guild.channels.cache.size === 0) {
    await guild.channels.fetch().catch(() => null);
  }

  const textChannels = Array.from(guild.channels.cache.values()).filter(
    (c): c is TextChannel =>
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
      !isCallGameChannelName(c.name)
  );

  // 1. Exact or partial match on "sms" (handles Mathematical Bold "𝐒𝐌𝐒" via NFKC!)
  const smsExact = textChannels.find((c) => {
    const clean = c.name.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
    return clean === "sms";
  });
  if (smsExact) return smsExact;

  const smsMatch = textChannels.find((c) =>
    c.name.normalize("NFKC").toLowerCase().includes("sms")
  );
  if (smsMatch) return smsMatch;

  // 2. Fallback to main/general chat channels
  const fallbackNames = ["chat", "geral", "principal", "bate-papo"];
  for (const kw of fallbackNames) {
    const found = textChannels.find((c) =>
      c.name.normalize("NFKC").toLowerCase().includes(kw)
    );
    if (found) return found;
  }

  if (
    guild.systemChannel &&
    !isCallGameChannelName(guild.systemChannel.name) &&
    guild.systemChannel.isTextBased()
  ) {
    return guild.systemChannel;
  }

  return textChannels[0] || null;
}

async function closeChannelsAndNotifySms(
  guild: Guild,
  trackedIds: string[],
  preferredSmsChannelId: string | null | undefined,
  reasonMessage: string,
  wasActive = true
): Promise<number> {
  if (guild.channels.cache.size === 0) {
    await guild.channels.fetch().catch(() => null);
  }

  const deleteSet = new Set<string>(trackedIds.filter(Boolean));

  // Also sweep any leftover Jogo da Call channels in the guild by name/topic
  for (const [, ch] of guild.channels.cache) {
    if (isCallGameChannelName(ch.name)) {
      deleteSet.add(ch.id);
    }
  }

  let closedCount = 0;
  for (const chId of deleteSet) {
    const ch =
      guild.channels.cache.get(chId) ||
      (await guild.channels.fetch(chId).catch(() => null));
    if (ch) {
      const ok = await ch
        .delete("Fechamento automático do Jogo da Call após reinicialização/edição do site.")
        .then(() => true)
        .catch(() => false);
      if (ok) closedCount++;
    }
  }

  if (closedCount === 0 && !wasActive) {
    return 0;
  }

  // Send notice to SMS / main channel
  try {
    const smsChan = await findSmsMainChannel(guild, preferredSmsChannelId);
    if (smsChan) {
      const embed = new EmbedBuilder()
        .setTitle("🔄 Site / Bot Reiniciado — Jogo da Call Fechado")
        .setColor(0xf59e0b)
        .setDescription(reasonMessage)
        .setFooter({ text: `Canais temporários fechados: ${closedCount}` })
        .setTimestamp();

      await smsChan
        .send({
          content: `⚠️ **Aviso do Sistema:** ${reasonMessage}`,
          embeds: [embed],
        })
        .catch(() => {});
    }
  } catch (err) {
    console.warn("[CallGame SMS Notify Error]:", (err as Error).message);
  }

  return closedCount;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandomMatchQuestions(
  guildId: string,
  pool: string[],
  count: number
): string[] {
  const uniquePool = Array.from(new Set(pool.map((q) => q.trim()).filter(Boolean)));
  if (uniquePool.length === 0) return [];
  const targetCount = Math.min(uniquePool.length, Math.max(1, count));

  let usedSet = recentQuestionsByGuild.get(guildId);
  if (!usedSet) {
    usedSet = new Set<string>();
    recentQuestionsByGuild.set(guildId, usedSet);
  }

  let unseen = uniquePool.filter((q) => !usedSet!.has(q));
  if (unseen.length < targetCount) {
    // Cycle the deck cleanly once remaining unseen < targetCount
    const pickedFromRemaining = shuffleArray(unseen);
    usedSet.clear();
    const restPool = uniquePool.filter((q) => !pickedFromRemaining.includes(q));
    const needed = targetCount - pickedFromRemaining.length;
    const extra = shuffleArray(restPool).slice(0, needed);
    const combined = [...pickedFromRemaining, ...extra];
    for (const q of combined) usedSet.add(q);
    return combined;
  }

  const chosen = shuffleArray(unseen).slice(0, targetCount);
  for (const q of chosen) usedSet.add(q);
  return chosen;
}

function addGameEvent(session: CallGameSession, text: string) {
  session.events.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    time: Date.now(),
    text,
  });
  if (session.events.length > 40) {
    session.events.length = 40;
  }
}

function sanitizeForSpeech(name: string, maxLen = 220): string {
  const cleaned = name
    .replace(/[*_`~#>|]/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "jogador";
  if (cleaned.length <= maxLen) return cleaned;
  const cut = cleaned.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut).trim();
}

function sanitizeChannelSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  return slug || "jogador";
}

export const SOLID_GREY_EMBED = 0x2b2d31;

export const UNCOMMON_MALE_TIKTOK_VOICES = [
  { id: "tiktok_contra", label: "🧔 Contra / Luiz (PT-BR Masculino)" },
  { id: "tiktok_bueno", label: "⚽ Galvão Bueno (PT-BR Masculino)" },
  { id: "narrator", label: "🎙️ Lucas / Narrador (PT-BR Masculino)" },
  { id: "tiktok_bv_male", label: "🎧 Bruno (PT-BR Masculino)" },
];

export const UNCOMMON_FEMALE_TIKTOK_VOICES = [
  { id: "tiktok_laizza", label: "👩 Laizza (PT-BR Feminino)" },
  { id: "lhays_anime", label: "🎀 Lhays Macedo (PT-BR Feminino)" },
  { id: "tiktok_ivete", label: "🎤 Ivete Sangalo (PT-BR Feminino)" },
  { id: "tiktok_ludmilla", label: "🎶 Ludmilla (PT-BR Feminino)" },
  { id: "garota_timida", label: "🌸 Júlia / Tímida (PT-BR Feminino)" },
  { id: "tiktok_br_f1", label: "✨ Camila (PT-BR Feminino)" },
  { id: "tiktok_br_f3", label: "💎 Ana (PT-BR Feminino)" },
];

export const OWNER_EXCLUSIVE_MALE_FUNNY_VOICES = [
  { id: "tiktok_funny_male", label: "🤡 Zé Maluco / Esquilo (PT-BR Engraçada · Exclusiva 👑)" },
  { id: "tiktok_funny_male_grumpy", label: "🐸 Pato / Voz Engrossada (PT-BR Engraçada · Exclusiva 👑)" },
];

export const OWNER_EXCLUSIVE_FEMALE_FUNNY_VOICES = [
  { id: "tiktok_funny_female", label: "🤪 Paty Esquilo / Maluca (PT-BR Engraçada · Exclusiva 👑)" },
  { id: "tiktok_funny_female_drama", label: "🎭 Tia Dramática / Doida (PT-BR Engraçada · Exclusiva 👑)" },
];

const EXCLUSIVE_VOICE_IDS = new Set<string>([
  ...OWNER_EXCLUSIVE_MALE_FUNNY_VOICES.map((v) => v.id),
  ...OWNER_EXCLUSIVE_FEMALE_FUNNY_VOICES.map((v) => v.id),
]);

function isGameOwner(session: CallGameSession | undefined | null, userId: string): boolean {
  return Boolean(session && session.ownerUserId === userId);
}

function getVoicePoolForGender(gender: "m" | "f", isOwner = false) {
  if (gender === "f") {
    return isOwner
      ? [...OWNER_EXCLUSIVE_FEMALE_FUNNY_VOICES, ...UNCOMMON_FEMALE_TIKTOK_VOICES]
      : UNCOMMON_FEMALE_TIKTOK_VOICES;
  }
  return isOwner
    ? [...OWNER_EXCLUSIVE_MALE_FUNNY_VOICES, ...UNCOMMON_MALE_TIKTOK_VOICES]
    : UNCOMMON_MALE_TIKTOK_VOICES;
}

function resolvePortugueseVoiceId(voiceId: string | undefined, gender: "m" | "f", fallbackIdx = 0, isOwner = false): string {
  const pool = getVoicePoolForGender(gender, isOwner);
  if (voiceId && (!EXCLUSIVE_VOICE_IDS.has(voiceId) || isOwner) && pool.some((v) => v.id === voiceId)) {
    return voiceId;
  }
  return pool[Math.abs(fallbackIdx) % pool.length].id;
}

function getVoiceLabel(voiceId: string, gender: "m" | "f"): string {
  const allVoices = [
    ...OWNER_EXCLUSIVE_MALE_FUNNY_VOICES,
    ...OWNER_EXCLUSIVE_FEMALE_FUNNY_VOICES,
    ...UNCOMMON_MALE_TIKTOK_VOICES,
    ...UNCOMMON_FEMALE_TIKTOK_VOICES,
  ];
  const found = allVoices.find((v) => v.id === voiceId);
  return found?.label || getVoicePoolForGender(gender, false)[0].label;
}

export interface PlayerDraftSetup {
  customName: string;
  gender: "m" | "f";
  voiceId: string;
}

const playerDrafts: Map<string, PlayerDraftSetup> = gStateAny.__callGameState.playerDrafts;

export function buildPlayerSetupEmbed(draft: PlayerDraftSetup, isOwner = false): EmbedBuilder {
  const genderLabel = draft.gender === "f" ? "👩 Feminino" : "👨 Masculino";
  const effectiveVoiceId = resolvePortugueseVoiceId(draft.voiceId, draft.gender, 0, isOwner);
  const voiceLabel = getVoiceLabel(effectiveVoiceId, draft.gender);
  const ownerExclusiveHint = isOwner
    ? `\n👑 **Exclusivo de quem começa o jogo:** Você desbloqueou as **Vozes Engraçadas em Português** (masculina e feminina)!\n`
    : "";
  return new EmbedBuilder()
    .setTitle("⚙️ Identificador & Perfil no Jogo")
    .setColor(SOLID_GREY_EMBED)
    .setDescription(
      `Configure como você será anunciado e qual voz em português do TikTok lerá suas respostas na call:${ownerExclusiveHint}\n` +
        `👤 **Identificador / Nome:** \`${draft.customName}\`\n` +
        `⚧️ **Sexo:** **${genderLabel}**\n` +
        `🎭 **Voz do TikTok (PT-BR):** **${voiceLabel}**\n\n` +
        `• Clique em **✏️ Alterar Nome** para digitar seu identificador via formulário.\n` +
        `• Escolha **👨 Masculino** ou **👩 Feminino** e clique em **🎭 Trocar Voz TikTok** para escolher entre as vozes em português.\n` +
        `• Clique em **✅ Confirmar Pronto** para entrar no jogo e o narrador te anunciar na call!`
    );
}

export function buildPlayerSetupComponents(guildId: string, draft: PlayerDraftSetup): ActionRowBuilder<ButtonBuilder>[] {
  const rowName = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`callgame_open_name_modal:${guildId}`)
      .setLabel("✏️ Alterar Nome")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`callgame_cycle_voice:${guildId}`)
      .setLabel("🎭 Trocar Voz TikTok")
      .setStyle(ButtonStyle.Secondary)
  );

  const rowGender = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`callgame_set_gender:m:${guildId}`)
      .setLabel("👨 Masculino")
      .setStyle(draft.gender === "m" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`callgame_set_gender:f:${guildId}`)
      .setLabel("👩 Feminino")
      .setStyle(draft.gender === "f" ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const rowConfirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`callgame_confirm_ready:${guildId}`)
      .setLabel("✅ Confirmar Pronto")
      .setStyle(ButtonStyle.Success)
  );

  return [rowName, rowGender, rowConfirm];
}

function buildLobbyEmbed(session: CallGameSession): EmbedBuilder {
  const readyTag = getStickerTag("ready");
  const waitTag = getStickerTag("wait");
  const lockTag = getStickerTag("lock");
  const ownerRegistered = session.readyPlayers.some((p) => p.userId === session.ownerUserId);

  const readyLines =
    session.readyPlayers.length > 0
      ? session.readyPlayers
          .map((p) => {
            const isOwner = p.userId === session.ownerUserId;
            const fig = getCachedUserAvatarSticker(p.userId, isOwner);
            const vLabel = getVoiceLabel(p.voiceId || "", p.gender);
            const roleSuffix = isOwner ? ` · ${getStickerTag("crown")} Dono` : "";
            return formatFichaRecord(
              fig,
              p.username,
              `${readyTag} Pronto (${p.gender === "f" ? "Feminino" : "Masculino"} · ${vLabel})${roleSuffix}`
            );
          })
          .join("\n")
      : `_${waitTag} Nenhum jogador concluiu o registro ainda._`;

  const statusLine =
    session.phase === "playing"
      ? `${getStickerTag("mic")} **Partida em andamento** na call <#${session.tempVoiceChannelId}> (Pergunta ${session.currentRoundIndex + 1}/${session.questions.length})`
      : session.phase === "starting"
      ? `🚀 **Movendo todos para a call principal privada...**`
      : session.phase === "finished"
      ? `${getStickerTag("trophy")} **Partida encerrada!** Veja o placar abaixo.`
      : `${waitTag} **Aguardando registro na call** (${session.voiceChannelName}) — **todos** os participantes e o dono (<@${session.ownerUserId}>) precisam concluir o registro e marcar **Pronto**.`;

  return new EmbedBuilder()
    .setTitle("🎮 Jogo da Call — Registro & Regras")
    .setColor(SOLID_GREY_EMBED)
    .setDescription(
      `${statusLine}\n\n` +
        `📜 **Regras:**\n${session.rulesText}\n\n` +
        `👥 **Fichas Registradas (${session.readyPlayers.length}):**\n${readyLines}\n\n` +
        `👑 **Status do Dono (<@${session.ownerUserId}>):** ${ownerRegistered ? `${readyTag} Registrado e pronto` : `${waitTag} Ainda não registrado`}\n` +
        `${lockTag} **Canal compartilhado:** Apenas o bot envia mensagens aqui. Clique em **Pronto** abaixo para se registrar!`
    )
    .setFooter({ text: `Perguntas configuradas: ${session.questions.length} • Tempo/rodada: ${session.roundSeconds}s` })
    .setTimestamp();
}

function buildLobbyComponents(session: CallGameSession): ActionRowBuilder<ButtonBuilder> {
  const isPlaying = session.phase === "playing" || session.phase === "starting";
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`callgame_ready:${session.guildId}`)
      .setLabel("Pronto")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isPlaying)
  );
}

async function getLobbyReadinessStatus(guild: Guild, session: CallGameSession): Promise<{
  allReady: boolean;
  ownerReady: boolean;
  humansInVoice: GuildMember[];
  missingMembers: GuildMember[];
}> {
  const readyIds = new Set(session.readyPlayers.map((p) => p.userId));
  const ownerReady = readyIds.has(session.ownerUserId);

  const lobbyVoice = (guild.channels.cache.get(session.voiceChannelId) ||
    (await guild.channels.fetch(session.voiceChannelId).catch(() => null))) as VoiceBasedChannel | null;

  const humansInVoice: GuildMember[] = lobbyVoice && lobbyVoice.isVoiceBased()
    ? Array.from(lobbyVoice.members.values()).filter((m) => !m.user.bot)
    : [];

  const missingMembers = humansInVoice.filter((m) => !readyIds.has(m.id));
  const allReady = humansInVoice.length > 0 && ownerReady && missingMembers.length === 0;

  return { allReady, ownerReady, humansInVoice, missingMembers };
}

async function checkAndNotifyAllPlayersReady(guild: Guild, session: CallGameSession): Promise<void> {
  if (session.phase !== "lobby" || !session.privateChannelId) return;

  const chan = (guild.channels.cache.get(session.privateChannelId) ||
    (await guild.channels.fetch(session.privateChannelId).catch(() => null))) as TextChannel | null;
  if (!chan) return;

  const { allReady, ownerReady, humansInVoice, missingMembers } = await getLobbyReadinessStatus(guild, session);
  const lockTag = getStickerTag("lock");
  const readyTag = getStickerTag("ready");
  const waitTag = getStickerTag("wait");

  if (allReady) {
    const fichas = session.readyPlayers
      .map((p) =>
        formatFichaRecord(
          getCachedUserAvatarSticker(p.userId, p.userId === session.ownerUserId),
          p.username,
          `${readyTag} Pronto`
        )
      )
      .join("\n");

    const warningContent = `${lockTag} **AVISO:** Somente o dono (<@${session.ownerUserId}>) pode iniciar a partida!`;
    const readyEmbed = new EmbedBuilder()
      .setTitle(`${readyTag} Tudo preparado!`)
      .setColor(SOLID_GREY_EMBED)
      .setDescription(
        `Todos os **${humansInVoice.length}** participante(s) (incluindo o dono) concluíram o registro e confirmaram que estão prontos.\n\n` +
          `${fichas}\n\n` +
          `Clique em **Começar** abaixo para iniciar a partida no canal compartilhado.`
      )
      .setTimestamp();

    const startRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`callgame_owner_start:${session.guildId}`)
        .setLabel("Começar")
        .setEmoji("🚀")
        .setStyle(ButtonStyle.Success)
    );

    if (session.allReadyMessageId) {
      const existingMsg = await chan.messages.fetch(session.allReadyMessageId).catch(() => null);
      if (existingMsg) {
        await existingMsg.edit({ content: warningContent, embeds: [readyEmbed], components: [startRow] }).catch(() => {});
        return;
      }
    }

    const sent = await chan.send({
      content: warningContent,
      embeds: [readyEmbed],
      components: [startRow],
    }).catch(() => null);
    if (sent) {
      session.allReadyMessageId = sent.id;
      addGameEvent(session, "Todos os participantes + dono estão prontos! Botão 'Começar' liberado.");
    }
  } else if (session.allReadyMessageId) {
    // Someone new joined or hasn't registered yet: update the readiness message so Começar stays locked
    const existingMsg = await chan.messages.fetch(session.allReadyMessageId).catch(() => null);
    if (existingMsg) {
      const missingText = [
        !ownerReady ? `<@${session.ownerUserId}> (Dono)` : null,
        ...missingMembers.filter((m) => m.id !== session.ownerUserId).map((m) => `<@${m.id}>`),
      ]
        .filter(Boolean)
        .join(", ");

      const pendingEmbed = new EmbedBuilder()
        .setTitle(`${waitTag} Aguardando conclusão de registro...`)
        .setColor(SOLID_GREY_EMBED)
        .setDescription(
          `A partida só poderá começar quando **todos** os participantes e o dono concluírem o registro e clicarem em **Pronto**.\n\n` +
            `📌 **Faltam registrar:** ${missingText || "Nenhum participante na call"}`
        );

      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`callgame_owner_start:${session.guildId}`)
          .setLabel("Começar")
          .setEmoji("🚀")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
      await existingMsg.edit({
        content: `${lockTag} **AVISO:** Somente o dono (<@${session.ownerUserId}>) pode iniciar a partida!`,
        embeds: [pendingEmbed],
        components: [disabledRow],
      }).catch(() => {});
    }
  }
}

async function ensureLobbyGameChannel(
  guild: Guild,
  session: CallGameSession,
  extraMemberIds: string[] = []
): Promise<TextChannel> {
  const client = getBotClient();
  const botId = client?.user?.id;

  const allowedIds = new Set<string>([session.ownerUserId, ...extraMemberIds]);

  if (session.privateChannelId) {
    const existing =
      (guild.channels.cache.get(session.privateChannelId) as TextChannel | undefined) ||
      ((await guild.channels.fetch(session.privateChannelId).catch(() => null)) as TextChannel | null);

    if (existing) {
      for (const uid of allowedIds) {
        if (!uid) continue;
        await existing.permissionOverwrites
          .edit(uid, {
            ViewChannel: true,
            SendMessages: false,
            SendMessagesInThreads: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false,
            ReadMessageHistory: true,
          })
          .catch(() => {});
      }
      return existing;
    }
  }

  const voiceChannel =
    guild.channels.cache.get(session.voiceChannelId) ||
    (await guild.channels.fetch(session.voiceChannelId).catch(() => null));

  if (voiceChannel && voiceChannel.isVoiceBased()) {
    for (const [id, m] of voiceChannel.members) {
      if (!m.user.bot) allowedIds.add(id);
    }
  }

  const overwrites: OverwriteResolvable[] = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
      ],
    },
  ];

  if (botId) {
    overwrites.push({
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  for (const uid of allowedIds) {
    if (!uid) continue;
    overwrites.push({
      id: uid,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
      ],
    });
  }

  const created = await guild.channels.create({
    name: "🔒・jogo-da-call",
    type: ChannelType.GuildText,
    parent: voiceChannel?.parentId || undefined,
    topic: `Canal do Jogo da Call (${session.voiceChannelName}) — Apenas o bot pode enviar mensagens`,
    permissionOverwrites: overwrites,
  });

  session.privateChannelId = created.id;
  session.privateChannelName = created.name;

  const sent = await created.send({
    content: `🎮 <@${session.ownerUserId}> — Canal do jogo criado! Todos os participantes (incluindo o dono) devem clicar em **Pronto** para se registrar.`,
    embeds: [buildLobbyEmbed(session)],
    components: [buildLobbyComponents(session)],
  });
  session.panelMessageId = sent.id;
  syncPersistedGameState(session);

  addGameEvent(session, `Canal do jogo #${created.name} criado (sem permissão de envio para membros).`);
  return created;
}

async function updateLobbyPanelMessage(guild: Guild, session: CallGameSession): Promise<void> {
  if (!session.privateChannelId || !session.panelMessageId) return;
  try {
    const chan = (guild.channels.cache.get(session.privateChannelId) ||
      (await guild.channels.fetch(session.privateChannelId).catch(() => null))) as TextChannel | null;
    if (!chan) return;
    const msg = await chan.messages.fetch(session.panelMessageId).catch(() => null);
    if (!msg) return;
    await msg
      .edit({
        embeds: [buildLobbyEmbed(session)],
        components: [buildLobbyComponents(session)],
      })
      .catch(() => {});
  } catch {}
}

async function purgeAllMessagesInChannel(channel: TextChannel): Promise<void> {
  try {
    const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!fetched || fetched.size === 0) return;

    // Try bulk delete first (messages < 14 days)
    const deleted = await channel.bulkDelete(fetched, true).catch(() => null);
    // Delete any remaining messages individually
    const remaining = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (remaining && remaining.size > 0) {
      for (const [, m] of remaining) {
        await m.delete().catch(() => {});
      }
    } else if (!deleted) {
      for (const [, m] of fetched) {
        await m.delete().catch(() => {});
      }
    }
  } catch (err) {
    console.warn(`[CallGame] Falha ao limpar mensagens de #${channel.name}:`, (err as Error).message);
  }
}

function scheduleLobbyWelcomeSpeech(session: CallGameSession, triggerLabel: string) {
  setTimeout(async () => {
    const runtime = activeRuntimes.get(session.guildId);
    if (!runtime || runtime.aborted || !runtime.session.active || runtime.session.phase !== "lobby") {
      return;
    }
    try {
      const msg =
        "Bem-vindo! Siga as regras no canal privado criado. Para começar, aperte no botão pronto!";
      await speakInVoiceCall(
        runtime.session.guildId,
        msg,
        runtime.session.voiceChannelId,
        "narrator",
        undefined,
        runtime.session.expression
      );
      addGameEvent(runtime.session, `Boas-vindas falada na call (${triggerLabel}).`);
    } catch (err) {
      addGameEvent(runtime.session, `Erro ao falar boas-vindas: ${(err as Error).message}`);
    }
  }, 3000);
}

/**
 * Uses Groq AI to evaluate which criminal/paneleiro answer was the smartest / closest to working
 */
async function evaluateAnswersWithAI(
  question: string,
  players: CallGameMatchPlayer[],
  rawAnswers: Map<string, { userId: string; username: string; answer: string; answeredAt: number }>
): Promise<{
  winnerUserId: string | null;
  winnerUsername: string | null;
  winnerAnswer: string | null;
  explanation: string;
  scoredAnswers: CallGameRoundAnswer[];
}> {
  const answeredList = players
    .map((p) => {
      const a = rawAnswers.get(p.userId);
      return a
        ? { userId: p.userId, username: p.username, answer: a.answer, answeredAt: a.answeredAt }
        : null;
    })
    .filter(Boolean) as Array<{ userId: string; username: string; answer: string; answeredAt: number }>;

  if (answeredList.length === 0) {
    return {
      winnerUserId: null,
      winnerUsername: null,
      winnerAnswer: null,
      explanation: "Ninguém respondeu essa pergunta a tempo!",
      scoredAnswers: players.map((p) => ({
        userId: p.userId,
        username: p.username,
        answer: "(Sem resposta)",
        points: 0,
        aiComment: "Não respondeu dentro do tempo.",
        answeredAt: 0,
      })),
    };
  }

  hydrateAiVoiceFromDisk();
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (apiKey) {
    const promptPayload = {
      pergunta: question,
      respostas: answeredList.map((a) => ({
        userId: a.userId,
        nome: a.username,
        resposta: a.answer,
      })),
    };

    const systemPrompt = [
      "Você é o juiz divertido e justo de um jogo de perguntas e respostas em call no Discord ('Jogo da Call').",
      "Analise a pergunta e todas as respostas dos jogadores.",
      "Avalie qual resposta foi a MAIS INTELIGENTE, prática, criativa ou que MAIS CHEGOU PERTO de algo que realmente funcionaria bem naquela situação.",
      "Responda EXCLUSIVAMENTE em JSON válido (sem markdown, sem crases) no seguinte formato exato:",
      '{"winnerUserId":"ID_DO_VENCEDOR","explanation":"Explicação curta e direta em português do Brasil (máximo 200 caracteres, sem emojis ou markdown) dizendo por que a resposta do vencedor chegou mais perto ou funcionaria melhor","scores":[{"userId":"ID","points":0_a_100,"comment":"comentário curto"}]}',
      "Garanta que o vencedor receba a maior pontuação (ex: 85 a 100) e os demais recebam notas proporcionais de 10 a 80 conforme a criatividade, lógica e eficiência da resposta.",
    ].join(" ");

    const candidateModels = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

    for (const model of candidateModels) {
      try {
        const isGptOss = model.toLowerCase().includes("gpt-oss");
        const body: Record<string, any> = {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(promptPayload) },
          ],
          temperature: 0.4,
          max_completion_tokens: isGptOss ? 700 : 450,
        };
        if (isGptOss) body.reasoning_effort = "low";

        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) continue;
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data?.choices?.[0]?.message?.content?.trim() || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const parsed = JSON.parse(jsonMatch[0]) as {
          winnerUserId?: string;
          explanation?: string;
          scores?: Array<{ userId: string; points: number; comment?: string }>;
        };

        const validWinner =
          answeredList.find((a) => a.userId === parsed.winnerUserId) || answeredList[0];

        const scoredAnswers: CallGameRoundAnswer[] = players.map((p) => {
          const foundAns = rawAnswers.get(p.userId);
          if (!foundAns) {
            return {
              userId: p.userId,
              username: p.username,
              answer: "(Sem resposta)",
              points: 0,
              aiComment: "Não respondeu a tempo.",
              answeredAt: 0,
            };
          }
          const scoreItem = parsed.scores?.find((s) => s.userId === p.userId);
          let pts = typeof scoreItem?.points === "number" ? Math.round(scoreItem.points) : 50;
          pts = Math.max(5, Math.min(100, pts));
          if (p.userId === validWinner.userId && pts < 80) pts = 95;

          return {
            userId: p.userId,
            username: p.username,
            answer: foundAns.answer,
            points: pts,
            aiComment: sanitizeForSpeech(scoreItem?.comment || "Plano analisado pela IA.", 120),
            answeredAt: foundAns.answeredAt,
          };
        });

        const explanation = sanitizeForSpeech(
          parsed.explanation ||
            "Esse plano foi o mais estratégico e convincente para escapar da situação sem deixar rastros.",
          220
        );

        return {
          winnerUserId: validWinner.userId,
          winnerUsername: validWinner.username,
          winnerAnswer: validWinner.answer,
          explanation,
          scoredAnswers,
        };
      } catch (err) {
        console.warn(`[CallGame AI Judge ${model}]:`, (err as Error).message);
      }
    }
  }

  // Fallback heuristic if Groq key missing/unavailable
  const sorted = [...answeredList].sort((a, b) => b.answer.length - a.answer.length);
  const winner = sorted[0];
  const scoredAnswers: CallGameRoundAnswer[] = players.map((p) => {
    const foundAns = rawAnswers.get(p.userId);
    if (!foundAns) {
      return {
        userId: p.userId,
        username: p.username,
        answer: "(Sem resposta)",
        points: 0,
        aiComment: "Sem resposta.",
        answeredAt: 0,
      };
    }
    const isWin = foundAns.userId === winner.userId;
    return {
      userId: p.userId,
      username: p.username,
      answer: foundAns.answer,
      points: isWin ? 90 : Math.max(25, Math.min(75, Math.round(foundAns.answer.length * 1.2))),
      aiComment: isWin ? "Resposta mais completa e detalhada." : "Boa tentativa.",
      answeredAt: foundAns.answeredAt,
    };
  });

  return {
    winnerUserId: winner.userId,
    winnerUsername: winner.username,
    winnerAnswer: winner.answer,
    explanation:
      "Essa foi a estratégia mais detalhada e realista apresentada nesta rodada.",
    scoredAnswers,
  };
}

function buildSharedRoundEmbed(
  session: CallGameSession,
  runtime: InternalRuntimeState,
  roundIndex: number,
  closed = false
): EmbedBuilder {
  const question = session.questions[roundIndex] || session.currentQuestion || "Pergunta";
  const replyTag = getStickerTag("reply");
  const waitTag = getStickerTag("wait");

  const statusLines = session.matchPlayers
    .map((mp) => {
      const fig = getCachedUserAvatarSticker(mp.userId, mp.userId === session.ownerUserId);
      const answered = runtime.currentAnswers.has(mp.userId);
      const badge = answered
        ? `${replyTag} Respondido`
        : closed
        ? "✖️ Sem resposta"
        : `${waitTag} Aguardando resposta`;
      return formatFichaRecord(fig, mp.username, badge);
    })
    .join("\n");

  return new EmbedBuilder()
    .setTitle(`⚖️ Pergunta ${roundIndex + 1} de ${session.questions.length}`)
    .setColor(SOLID_GREY_EMBED)
    .setDescription(
      `**${question}**\n\n` +
        (closed
          ? `🔒 **Tempo encerrado!** Ouvindo as respostas na call...\n\n`
          : `✍️ Clique em **Responder** abaixo para abrir a caixa de texto e enviar sua resposta diretamente!\n⏱️ Tempo limite: **${session.roundSeconds} segundos**\n\n`) +
        `**Fichas da Rodada (${runtime.currentAnswers.size}/${session.matchPlayers.length}):**\n${statusLines}`
    )
    .setTimestamp();
}

function buildRoundAnswerButtonRow(guildId: string, roundIndex: number, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`callgame_open_answer_modal:${guildId}:${roundIndex}`)
      .setLabel(disabled ? "Respostas Encerradas" : "✍️ Responder")
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

async function refreshSharedRoundMessage(guild: Guild, runtime: InternalRuntimeState, roundIndex: number, closed = false): Promise<void> {
  const { session } = runtime;
  if (!session.privateChannelId || !session.currentRoundMessageId) return;
  const mainTextChan = (guild.channels.cache.get(session.privateChannelId) ||
    (await guild.channels.fetch(session.privateChannelId).catch(() => null))) as TextChannel | null;
  if (!mainTextChan) return;
  const msg = await mainTextChan.messages.fetch(session.currentRoundMessageId).catch(() => null);
  if (!msg) return;
  await msg.edit({
    embeds: [buildSharedRoundEmbed(session, runtime, roundIndex, closed)],
    components: [buildRoundAnswerButtonRow(session.guildId, roundIndex, closed)],
  }).catch(() => {});
}

async function runMatchLoop(guild: Guild, runtime: InternalRuntimeState): Promise<void> {
  const { session } = runtime;
  const targetVoiceId = session.tempVoiceChannelId || session.voiceChannelId;

  const speakAndLog = async (text: string, voice = "narrator") => {
    if (runtime.aborted) return;
    await speakInVoiceCall(
      session.guildId,
      text,
      targetVoiceId,
      voice,
      undefined,
      session.expression
    );
  };

  try {
    // 1. Wait 3 seconds after moving everyone to the temporary private voice channel (only startup delay)
    await new Promise((r) => setTimeout(r, 3000));
    if (runtime.aborted) return;

    const participantNames = session.matchPlayers.length > 0
      ? session.matchPlayers.map((p) => sanitizeForSpeech(p.username, 40)).join(", ")
      : "todos vocês";

    await speakAndLog(
      `Olá a todos, o jogo foi iniciado! Regras: quando aparecer uma pergunta no canal compartilhado, cliquem em responder e escrevam direto na caixa de texto. Os participantes de hoje são: ${participantNames}. Boa sorte a todos!`,
      "narrator"
    );
    addGameEvent(session, "Narrador iniciou o jogo na call privada anunciando os participantes.");
    await waitForVoiceQueueIdle(session.guildId, 45_000);
    if (runtime.aborted) return;

    const mainTextChan = session.privateChannelId
      ? ((guild.channels.cache.get(session.privateChannelId) ||
          (await guild.channels.fetch(session.privateChannelId).catch(() => null))) as TextChannel | null)
      : null;

    // 2. Execute each question round sequentially in the shared channel
    for (let rIdx = 0; rIdx < session.questions.length; rIdx++) {
      if (runtime.aborted) return;

      const question = session.questions[rIdx];
      session.currentRoundIndex = rIdx;
      session.currentQuestion = question;
      session.roundDeadlineAt = Date.now() + session.roundSeconds * 1000;
      session.currentRoundMessageId = null;
      runtime.currentAnswers.clear();
      runtime.roundActive = true;

      addGameEvent(session, `Pergunta ${rIdx + 1}/${session.questions.length}: "${question}"`);
      await updateLobbyPanelMessage(guild, session);

      // Post shared round card with ONE single button that opens the direct text box (Modal)
      if (mainTextChan) {
        const sentRound = await mainTextChan
          .send({
            content: session.matchPlayers.map((mp) => `<@${mp.userId}>`).join(" "),
            embeds: [buildSharedRoundEmbed(session, runtime, rIdx, false)],
            components: [buildRoundAnswerButtonRow(session.guildId, rIdx, false)],
          })
          .catch(() => null);
        if (sentRound) {
          session.currentRoundMessageId = sentRound.id;
        }
      }

      // Speak question in voice call immediately with narrator voice
      await speakAndLog(
        `Pergunta número ${rIdx + 1}: ${sanitizeForSpeech(question, 220)}. Cliquem em responder e escrevam na caixa de texto!`,
        "narrator"
      );

      // Wait until all match players answer OR round timer expires
      await new Promise<void>((resolve) => {
        runtime.roundDoneResolver = resolve;
        runtime.roundTimeoutHandle = setTimeout(() => {
          resolve();
        }, session.roundSeconds * 1000);
      });

      if (runtime.roundTimeoutHandle) {
        clearTimeout(runtime.roundTimeoutHandle);
        runtime.roundTimeoutHandle = null;
      }
      runtime.roundDoneResolver = null;
      runtime.roundActive = false;
      session.roundDeadlineAt = null;

      await refreshSharedRoundMessage(guild, runtime, rIdx, true);

      if (runtime.aborted) return;

      addGameEvent(
        session,
        `Rodada ${rIdx + 1} encerrada (${runtime.currentAnswers.size}/${session.matchPlayers.length} respostas). Pré-carregando vozes e apurando com IA...`
      );

      // Wait any quick "OK" audio still playing before reading all answers
      await waitForVoiceQueueIdle(session.guildId, 25_000);
      if (runtime.aborted) return;

      // 3. AI judges which answer came closest / smartest
      const judged = await evaluateAnswersWithAI(question, session.matchPlayers, runtime.currentAnswers);
      if (runtime.aborted) return;

      for (const sc of judged.scoredAnswers) {
        const mp = session.matchPlayers.find((m) => m.userId === sc.userId);
        if (mp) {
          mp.totalPoints += sc.points;
        }
      }

      session.roundResults.push({
        roundIndex: rIdx,
        question,
        winnerUserId: judged.winnerUserId,
        winnerUsername: judged.winnerUsername,
        winnerAnswer: judged.winnerAnswer,
        explanation: judged.explanation,
        answers: judged.scoredAnswers,
      });

      // 4. Pre-load ALL voice clips into memory buffers before playback begins
      // 100% TikTok uncommon voices (no Google TTS!): Narrator (br_005) + distinct uncommon voices per player
      interface SpeechJob {
        text: string;
        voice: string;
      }
      const jobs: SpeechJob[] = [];

      jobs.push({
        text: `Tempo encerrado! Vamos ouvir as respostas da pergunta ${rIdx + 1}.`,
        voice: "narrator",
      });

      for (let pIdx = 0; pIdx < session.matchPlayers.length; pIdx++) {
        const mp = session.matchPlayers[pIdx];
        const spokenName = sanitizeForSpeech(mp.username, 50);
        const ans = runtime.currentAnswers.get(mp.userId);
        if (ans) {
          const isFemale = mp.gender === "f";
          const introSpeech = isFemale ? "A resposta dela é:" : "A resposta dele é:";
          const quoteVoice = resolvePortugueseVoiceId(
            mp.voiceId,
            isFemale ? "f" : "m",
            pIdx,
            mp.userId === session.ownerUserId
          );
          const quoteSpeech = sanitizeForSpeech(ans.answer, 210);

          jobs.push({ text: introSpeech, voice: "narrator" });
          jobs.push({ text: quoteSpeech, voice: quoteVoice });
        } else {
          jobs.push({
            text: `${spokenName} não enviou resposta a tempo.`,
            voice: "narrator",
          });
        }
      }

      if (judged.winnerUsername && judged.winnerAnswer) {
        const wName = sanitizeForSpeech(judged.winnerUsername, 50);
        const wAns = sanitizeForSpeech(judged.winnerAnswer, 180);
        jobs.push({
          text: `Ai que legal! A pessoa que mais chegou perto foi ${wName}, com a resposta: ${wAns}. E o porquê é: ${judged.explanation}`,
          voice: "narrator",
        });
        addGameEvent(session, `🏆 Rodada ${rIdx + 1}: ${judged.winnerUsername} venceu — ${judged.explanation}`);
      } else {
        jobs.push({
          text: "Ninguém respondeu essa rodada, então ninguém pontuou!",
          voice: "narrator",
        });
      }

      // Synthesize all audio buffers in throttled batches of 2 so TikTok TTS never throttles or times out
      const preloadedBuffers: Buffer[] = [];
      for (let j = 0; j < jobs.length; j += 2) {
        const batch = jobs.slice(j, j + 2);
        const batchRes = await Promise.all(
          batch.map(async (job) => {
            try {
              const res = await synthesizeSpeechAudio(job.text, job.voice);
              return res.mp3Buffer;
            } catch (err) {
              console.warn(`[CallGame Preload Error (${job.voice})]:`, (err as Error).message);
              const fallback = await synthesizeSpeechAudio(job.text, "narrator");
              return fallback.mp3Buffer;
            }
          })
        );
        preloadedBuffers.push(...batchRes);
      }

      // Queue all pre-synthesized buffers into the voice call
      await queuePreloadedAudioBuffersInVoiceCall(session.guildId, preloadedBuffers, targetVoiceId);

      // STRICT USER REQUIREMENT: Await until voice playback has COMPLETELY finished before sending embed!
      await waitForVoiceQueueIdle(session.guildId, 140_000);
      if (runtime.aborted) return;

      // Post round summary embed in solid grey ONLY AFTER speech is finished
      if (session.privateChannelId) {
        const mainTextChan = (guild.channels.cache.get(session.privateChannelId) ||
          (await guild.channels.fetch(session.privateChannelId).catch(() => null))) as TextChannel | null;
        if (mainTextChan) {
          const trophyTag = getStickerTag("trophy");
          const lines = judged.scoredAnswers
            .map((a) => {
              const fig = getCachedUserAvatarSticker(a.userId, a.userId === session.ownerUserId);
              return formatFichaRecord(fig, a.username, `**${a.points} pts** — _"${a.answer}"_`);
            })
            .join("\n");
          const roundEmbed = new EmbedBuilder()
            .setTitle(`📊 Resultado da Pergunta ${rIdx + 1}`)
            .setColor(SOLID_GREY_EMBED)
            .setDescription(
              `**Pergunta:** ${question}\n\n` +
                `**Respostas:**\n${lines}\n\n` +
                (judged.winnerUsername
                  ? `${trophyTag} **Mais próximo:** ${formatFichaRecord(
                      getCachedUserAvatarSticker(judged.winnerUserId || "", judged.winnerUserId === session.ownerUserId),
                      judged.winnerUsername,
                      judged.explanation
                    )}`
                  : "⚠️ Ninguém respondeu esta rodada.")
            )
            .setTimestamp();
          await mainTextChan.send({ embeds: [roundEmbed] }).catch(() => {});
        }
      }

      if (rIdx < session.questions.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    // 5. Final Podium & Total Points Sum
    session.phase = "finished";
    session.currentQuestion = null;
    session.roundDeadlineAt = null;
    session.active = false;

    const ranking = [...session.matchPlayers].sort((a, b) => b.totalPoints - a.totalPoints);
    const champion = ranking[0];

    if (champion && champion.totalPoints > 0) {
      const champSpoken = sanitizeForSpeech(champion.username, 60);
      await speakAndLog(
        `Fim de jogo! Somando os pontos de todas as perguntas, quem ganhou foi ${champSpoken} com ${champion.totalPoints} pontos! Parabéns!`,
        "narrator"
      );
      addGameEvent(session, `👑 CAMPEÃO FINAL: ${champion.username} com ${champion.totalPoints} pontos!`);
    } else {
      await speakAndLog("Fim de jogo! Ninguém acumulou pontos nesta partida.", "narrator");
      addGameEvent(session, "Partida finalizada sem pontuação.");
    }

    // STRICT USER REQUIREMENT: Await until winner announcement speech finishes before sending podium embed!
    await waitForVoiceQueueIdle(session.guildId, 60_000);
    if (runtime.aborted) return;

    if (session.privateChannelId) {
      const mainTextChan = (guild.channels.cache.get(session.privateChannelId) ||
        (await guild.channels.fetch(session.privateChannelId).catch(() => null))) as TextChannel | null;
      if (mainTextChan) {
        const crownTag = getStickerTag("crown");
        const trophyTag = getStickerTag("trophy");
        const podiumLines =
          ranking.length > 0
            ? ranking
                .map((p, i) => {
                  const placePrefix = i === 0 ? crownTag : i === 1 ? "🥈" : i === 2 ? "🥉" : "▪️";
                  const fig = getCachedUserAvatarSticker(p.userId, p.userId === session.ownerUserId);
                  return `${placePrefix} ${i + 1}º · ${formatFichaRecord(fig, p.username, `**${p.totalPoints} pontos**`)}`;
                })
                .join("\n")
            : "_Sem jogadores._";

        const finalEmbed = new EmbedBuilder()
          .setTitle(`${trophyTag} Jogo da Call — Resultado Final!`)
          .setColor(SOLID_GREY_EMBED)
          .setDescription(
            `${podiumLines}\n\n` +
              `🤖 _O bot vai sair da call privada automaticamente agora. A call privada será excluída automaticamente assim que todo mundo sair dela!_`
          )
          .setTimestamp();
        await mainTextChan.send({ embeds: [finalEmbed] }).catch(() => {});
      }
    }

    await updateLobbyPanelMessage(guild, session);
    await waitForVoiceQueueIdle(session.guildId, 90_000);
    if (runtime.aborted) return;

    // 7. Bot leaves the temporary voice channel automatically (does NOT force-delete while humans remain; auto-deletes when empty)
    const tempVoiceId = session.tempVoiceChannelId;
    leaveVoiceCall(session.guildId);
    addGameEvent(session, "Bot saiu da call privada automaticamente. Aguardando todos saírem para excluir a call.");

    if (tempVoiceId) {
      const vc = (guild.channels.cache.get(tempVoiceId) ||
        (await guild.channels.fetch(tempVoiceId).catch(() => null))) as VoiceBasedChannel | null;
      if (vc) {
        const humanCount = vc.members.filter((m) => !m.user.bot).size;
        if (humanCount === 0) {
          await vc.delete("Jogo da Call encerrado e todos saíram da call.").catch(() => {});
          addGameEvent(session, `Call privada "${vc.name}" excluída automaticamente (vazia).`);
          session.tempVoiceChannelId = null;
        } else {
          pendingAutoDeleteVoiceChannels.set(vc.id, guild.id);
        }
      }
    }
    syncPersistedGameState(session);
  } catch (err) {
    console.error("[CallGame Match Loop Error]:", err);
    addGameEvent(session, `Erro durante a partida: ${(err as Error).message}`);
  }
}

export function getCallGameStatus(guildId: string): CallGameSession {
  const existing = activeRuntimes.get(guildId);
  if (existing) return existing.session;
  return {
    active: false,
    phase: "idle",
    guildId,
    ownerUserId: DEFAULT_GAME_OWNER_ID,
    voiceChannelId: "",
    voiceChannelName: "",
    tempVoiceChannelId: null,
    tempVoiceChannelName: null,
    privateChannelId: null,
    privateChannelName: null,
    smsChannelId: null,
    panelMessageId: null,
    voice: "narrator",
    expression: "shy",
    rulesText: DEFAULT_RULES,
    questionPool: [...DEFAULT_CRIMINAL_QUESTIONS],
    questionsPerMatch: DEFAULT_QUESTIONS_PER_MATCH,
    questions: DEFAULT_CRIMINAL_QUESTIONS.slice(0, DEFAULT_QUESTIONS_PER_MATCH),
    roundSeconds: 60,
    currentRoundIndex: 0,
    currentQuestion: null,
    roundDeadlineAt: null,
    startedAt: 0,
    readyPlayers: [],
    matchPlayers: [],
    roundResults: [],
    events: [],
  };
}

export async function startCallGame(params: {
  guildId: string;
  voiceChannelId: string;
  voice?: string;
  expression?: string;
  rulesText?: string;
  ownerUserId?: string;
  smsChannelId?: string | null;
  questions?: string[];
  questionsPerMatch?: number;
  roundSeconds?: number;
  connectedAccount?: any;
  autoScreenBroadcast?: boolean;
}): Promise<CallGameSession> {
  const client = getBotClient();
  if (!client || !client.isReady()) {
    throw new Error("Bot Discord não está conectado ao Gateway.");
  }

  const guild =
    client.guilds.cache.get(params.guildId) ||
    (await client.guilds.fetch(params.guildId).catch(() => null));
  if (!guild) {
    throw new Error("Servidor não encontrado no bot.");
  }

  // Abort any prior runtime cleanly
  const prev = activeRuntimes.get(params.guildId);
  if (prev) {
    prev.aborted = true;
    if (prev.roundTimeoutHandle) clearTimeout(prev.roundTimeoutHandle);
    if (prev.roundDoneResolver) prev.roundDoneResolver();
  }

  const joinRes = await joinVoiceCall(params.guildId, params.voiceChannelId);
  await ensureGameStickersReady(guild).catch(() => {});

  const rawPool = (params.questions && params.questions.length > 0
    ? params.questions
    : DEFAULT_CRIMINAL_QUESTIONS
  )
    .map((q) => q.trim())
    .filter(Boolean);
  const questionPool = rawPool.length > 0 ? Array.from(new Set(rawPool)) : [...DEFAULT_CRIMINAL_QUESTIONS];
  const questionsPerMatch = Math.min(
    questionPool.length,
    Math.max(1, Math.round(Number(params.questionsPerMatch) || DEFAULT_QUESTIONS_PER_MATCH))
  );
  const pickedQuestions = pickRandomMatchQuestions(params.guildId, questionPool, questionsPerMatch);

  const session: CallGameSession = {
    active: true,
    phase: "lobby",
    guildId: params.guildId,
    ownerUserId: params.ownerUserId?.trim() || DEFAULT_GAME_OWNER_ID,
    voiceChannelId: params.voiceChannelId,
    voiceChannelName: joinRes.channelName,
    tempVoiceChannelId: null,
    tempVoiceChannelName: null,
    privateChannelId: prev?.session.privateChannelId || null,
    privateChannelName: prev?.session.privateChannelName || null,
    smsChannelId: params.smsChannelId?.trim() || prev?.session.smsChannelId || null,
    panelMessageId: prev?.session.panelMessageId || null,
    allReadyMessageId: null,
    currentRoundMessageId: null,
    voice: params.voice || "narrator",
    expression: params.expression || "shy",
    rulesText: params.rulesText?.trim() || DEFAULT_RULES,
    questionPool,
    questionsPerMatch,
    questions: pickedQuestions,
    roundSeconds: Math.min(180, Math.max(15, Number(params.roundSeconds) || 60)),
    currentRoundIndex: 0,
    currentQuestion: null,
    roundDeadlineAt: null,
    startedAt: Date.now(),
    readyPlayers: [],
    matchPlayers: [],
    roundResults: [],
    events: [],
  };

  const runtime: InternalRuntimeState = {
    session,
    aborted: false,
    roundActive: false,
    currentAnswers: new Map(),
    playerChannelToUserId: new Map(),
    roundDoneResolver: null,
    roundTimeoutHandle: null,
  };

  activeRuntimes.set(params.guildId, runtime);
  syncPersistedGameState(session);
  addGameEvent(
    session,
    `Bot entrou na call normal "${joinRes.channelName}". Aguardando todos e o dono (${session.ownerUserId}) registrarem Pronto.`
  );

  await ensureLobbyGameChannel(guild, session);
  await updateLobbyPanelMessage(guild, session);

  // Wait 3s and speak welcome
  scheduleLobbyWelcomeSpeech(session, "entrada do bot na call normal");

  return session;
}

/**
 * Owner clicks "Começar":
 * Enforces that ALL participants AND the owner have registered & marked Pronto,
 * moves everyone into the private voice call, and runs rounds in the shared channel with direct text-box modals!
 */
export async function beginCallGameMatch(guildId: string, requesterUserId?: string): Promise<CallGameSession> {
  const runtime = activeRuntimes.get(guildId);
  if (!runtime || !runtime.session.active) {
    throw new Error("Inicie primeiro o Jogo da Call na call normal!");
  }

  const { session } = runtime;
  if (requesterUserId && requesterUserId !== session.ownerUserId) {
    throw new Error(`Somente o dono (<@${session.ownerUserId}>) pode iniciar a partida!`);
  }

  if (session.phase === "starting" || session.phase === "playing") {
    return session;
  }

  const client = getBotClient();
  const botId = client?.user?.id;
  if (!client || !client.isReady() || !botId) {
    throw new Error("Bot Discord não está conectado.");
  }

  const guild =
    client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    throw new Error("Servidor não encontrado.");
  }

  // STRICT REQUIREMENT: ALL participants in the call AND the owner must be registered & ready
  const { allReady, ownerReady, humansInVoice, missingMembers } = await getLobbyReadinessStatus(guild, session);
  if (!ownerReady) {
    throw new Error(
      `O dono (<@${session.ownerUserId}>) também precisa clicar em **Pronto**, concluir o registro e confirmar antes de começar!`
    );
  }
  if (humansInVoice.length === 0) {
    throw new Error("Nenhum participante encontrado na call normal para iniciar a partida.");
  }
  if (!allReady) {
    const missingMentions = missingMembers.map((m) => `<@${m.id}>`).join(", ");
    throw new Error(
      `A partida só pode começar quando todos estiverem registrados e prontos! Faltam: ${missingMentions}`
    );
  }

  session.phase = "starting";
  session.questions = pickRandomMatchQuestions(
    guildId,
    session.questionPool,
    session.questionsPerMatch
  );
  addGameEvent(
    session,
    `Dono clicou em Começar! Todos prontos (${humansInVoice.length}). Sorteadas ${session.questions.length} perguntas.`
  );
  await updateLobbyPanelMessage(guild, session);

  // Disable the Começar button on the all-ready message once starting
  if (session.privateChannelId && session.allReadyMessageId) {
    const privChan = (guild.channels.cache.get(session.privateChannelId) ||
      (await guild.channels.fetch(session.privateChannelId).catch(() => null))) as TextChannel | null;
    const readyMsg = privChan ? await privChan.messages.fetch(session.allReadyMessageId).catch(() => null) : null;
    if (readyMsg) {
      const startedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`callgame_owner_start:${session.guildId}`)
          .setLabel("Partida Iniciada!")
          .setEmoji("🚀")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
      await readyMsg.edit({ components: [startedRow] }).catch(() => {});
    }
  }

  const lobbyVoice = (guild.channels.cache.get(session.voiceChannelId) ||
    (await guild.channels.fetch(session.voiceChannelId).catch(() => null))) as VoiceBasedChannel | null;

  const participantMap = new Map<string, GuildMember>();
  for (const m of humansInVoice) {
    participantMap.set(m.id, m);
  }
  for (const rp of session.readyPlayers) {
    if (!participantMap.has(rp.userId)) {
      const fetched = await guild.members.fetch(rp.userId).catch(() => null);
      if (fetched && !fetched.user.bot) {
        participantMap.set(rp.userId, fetched);
      }
    }
  }

  // Ensure transparent game stickers + every player's circular transparent avatar sticker
  await ensureGameStickersReady(guild).catch(() => {});
  await Promise.all(
    Array.from(participantMap.values()).map((m) =>
      ensureUserAvatarSticker(m.user, guild, m.id === session.ownerUserId).catch(() => "")
    )
  );

  const voiceOverwrites: OverwriteResolvable[] = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    },
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];

  for (const [uid] of participantMap) {
    voiceOverwrites.push({
      id: uid,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    });
  }

  // Create temporary private voice channel
  const tempVoice = await guild.channels.create({
    name: "🎙️・jogo-principal",
    type: ChannelType.GuildVoice,
    parent: lobbyVoice?.parentId || undefined,
    permissionOverwrites: voiceOverwrites,
  });

  session.tempVoiceChannelId = tempVoice.id;
  session.tempVoiceChannelName = tempVoice.name;

  // Move all participants into the temporary private call
  for (const [, member] of participantMap) {
    if (member.voice?.channelId) {
      await member.voice.setChannel(tempVoice).catch((e) => {
        console.warn(`[CallGame] Não foi possível mover ${member.user.tag}:`, e?.message);
      });
    }
  }

  // Move bot into the temporary private call
  await joinVoiceCall(guildId, tempVoice.id);

  // Register match players (all share #🔒・jogo-da-call and answer via direct Modal text box!)
  session.matchPlayers = [];
  runtime.playerChannelToUserId.clear();

  let playerIdx = 0;
  for (const [uid, member] of participantMap) {
    const readyInfo = session.readyPlayers.find((rp) => rp.userId === uid);
    const chosenName = readyInfo?.username || member.displayName || member.user.globalName || member.user.username;
    const chosenGender: "m" | "f" = readyInfo?.gender || "m";
    const chosenVoiceId = resolvePortugueseVoiceId(
      readyInfo?.voiceId,
      chosenGender,
      playerIdx,
      uid === session.ownerUserId
    );
    playerIdx++;

    session.matchPlayers.push({
      userId: uid,
      username: chosenName,
      gender: chosenGender,
      voiceId: chosenVoiceId,
      privateTextChannelId: null,
      questionMessageId: null,
      totalPoints: 0,
    });
  }

  session.phase = "playing";
  session.roundResults = [];
  syncPersistedGameState(session);
  addGameEvent(
    session,
    `Partida iniciada em "${tempVoice.name}" com ${session.matchPlayers.length} jogador(es) no canal compartilhado.`
  );
  await updateLobbyPanelMessage(guild, session);

  // Start async round loop
  void runMatchLoop(guild, runtime);

  return session;
}

export async function stopCallGame(
  guildId: string,
  deletePrivateChannel = true,
  disconnectCall = false
): Promise<CallGameSession> {
  const runtime = activeRuntimes.get(guildId);
  if (!runtime) {
    if (disconnectCall) leaveVoiceCall(guildId);
    return getCallGameStatus(guildId);
  }

  runtime.aborted = true;
  runtime.roundActive = false;
  if (runtime.roundTimeoutHandle) {
    clearTimeout(runtime.roundTimeoutHandle);
    runtime.roundTimeoutHandle = null;
  }
  if (runtime.roundDoneResolver) {
    runtime.roundDoneResolver();
    runtime.roundDoneResolver = null;
  }

  const { session } = runtime;
  session.active = false;
  session.phase = "finished";

  const client = getBotClient();
  const guild = client?.guilds.cache.get(guildId);

  if (guild) {
    for (const mp of session.matchPlayers) {
      if (!mp.privateTextChannelId) continue;
      const pc =
        guild.channels.cache.get(mp.privateTextChannelId) ||
        (await guild.channels.fetch(mp.privateTextChannelId).catch(() => null));
      if (pc) await pc.delete("Jogo da Call encerrado.").catch(() => {});
    }

    if (deletePrivateChannel && session.privateChannelId) {
      const chan =
        guild.channels.cache.get(session.privateChannelId) ||
        (await guild.channels.fetch(session.privateChannelId).catch(() => null));
      if (chan) await chan.delete("Jogo da Call encerrado pelo painel.").catch(() => {});
    }

    if (session.tempVoiceChannelId) {
      const vc = (guild.channels.cache.get(session.tempVoiceChannelId) ||
        (await guild.channels.fetch(session.tempVoiceChannelId).catch(() => null))) as VoiceBasedChannel | null;
      if (vc) {
        const humanCount = vc.members.filter((m) => !m.user.bot).size;
        if (humanCount === 0) {
          await vc.delete("Jogo da Call encerrado (call vazia).").catch(() => {});
        } else {
          pendingAutoDeleteVoiceChannels.set(vc.id, guild.id);
        }
      }
    }
  }

  if (disconnectCall) {
    leaveVoiceCall(guildId);
  }

  activeRuntimes.delete(guildId);
  clearPersistedGameState(guildId);
  return getCallGameStatus(guildId);
}

let shutdownCleanupStarted = false;

/**
 * Called on graceful shutdown, server error, or site code edit/reload:
 * Closes ALL game channels (text + temp voice) and sends a notice in the SMS main channel.
 */
export async function cleanupAllCallGamesOnShutdown(
  reason = "O site / sistema do bot foi reiniciado ou editado."
): Promise<void> {
  if (shutdownCleanupStarted) return;
  shutdownCleanupStarted = true;

  const client = getBotClient();
  const persisted = readPersistedGameStates();
  const guildIds = new Set<string>([
    ...Array.from(activeRuntimes.keys()),
    ...Object.keys(persisted),
  ]);

  if (guildIds.size === 0 || !client || !client.isReady()) {
    return;
  }

  for (const guildId of guildIds) {
    const runtime = activeRuntimes.get(guildId);
    const saved = persisted[guildId];

    if (runtime) {
      runtime.aborted = true;
      runtime.roundActive = false;
      if (runtime.roundTimeoutHandle) {
        clearTimeout(runtime.roundTimeoutHandle);
        runtime.roundTimeoutHandle = null;
      }
      if (runtime.roundDoneResolver) {
        runtime.roundDoneResolver();
        runtime.roundDoneResolver = null;
      }
      runtime.session.active = false;
    }

    leaveVoiceCall(guildId);

    const guild =
      client.guilds.cache.get(guildId) ||
      (await client.guilds.fetch(guildId).catch(() => null));

    if (guild) {
      const trackedIds: string[] = [];
      if (runtime) {
        if (runtime.session.privateChannelId) trackedIds.push(runtime.session.privateChannelId);
        if (runtime.session.tempVoiceChannelId) trackedIds.push(runtime.session.tempVoiceChannelId);
        for (const mp of runtime.session.matchPlayers) {
          if (mp.privateTextChannelId) trackedIds.push(mp.privateTextChannelId);
        }
      }
      if (saved) {
        if (saved.privateChannelId) trackedIds.push(saved.privateChannelId);
        if (saved.tempVoiceChannelId) trackedIds.push(saved.tempVoiceChannelId);
        trackedIds.push(...(saved.playerChannelIds || []));
      }

      const preferredSms =
        runtime?.session.smsChannelId || saved?.smsChannelId || null;

      await closeChannelsAndNotifySms(
        guild,
        trackedIds,
        preferredSms,
        `${reason} Todos os canais do **Jogo da Call** foram fechados automaticamente.`,
        Boolean(runtime?.session.active || saved?.active)
      );
    }

    activeRuntimes.delete(guildId);
    clearPersistedGameState(guildId);
  }
}

/**
 * Called on Events.ClientReady after a site restart, crash, or SSR reload:
 * Cleans up any leftover/orphaned Jogo da Call channels and notifies the SMS channel.
 */
export async function recoverOrphanedCallGameChannelsOnStartup(): Promise<void> {
  const client = getBotClient();
  if (!client || !client.isReady()) return;

  const persisted = readPersistedGameStates();

  for (const [, guild] of client.guilds.cache) {
    const saved = persisted[guild.id];
    await guild.channels.fetch().catch(() => null);

    const orphanedNamedChannels = Array.from(guild.channels.cache.values()).filter((c) =>
      isCallGameChannelName(c.name)
    );

    const hasPersisted = Boolean(saved);
    const hasOrphans = orphanedNamedChannels.length > 0;

    if (!hasPersisted && !hasOrphans) {
      continue;
    }

    const trackedIds: string[] = orphanedNamedChannels.map((c) => c.id);
    if (saved) {
      if (saved.privateChannelId) trackedIds.push(saved.privateChannelId);
      if (saved.tempVoiceChannelId) trackedIds.push(saved.tempVoiceChannelId);
      trackedIds.push(...(saved.playerChannelIds || []));
    }

    await closeChannelsAndNotifySms(
      guild,
      trackedIds,
      saved?.smsChannelId || null,
      "O site/sistema reiniciou após uma edição ou problema técnico. Todos os canais anteriores do **Jogo da Call** foram fechados automaticamente!",
      Boolean(saved?.active || hasOrphans)
    );

    clearPersistedGameState(guild.id);
  }

  // Ensure any leftover entries for guilds no longer cached are wiped
  writePersistedGameStates({});
}

// Register real process shutdown hooks only (never wipe active games on Vite SSR reload!)
const gAny = globalThis as any;
if (!gAny.__callGameProcessHooksRegistered) {
  gAny.__callGameProcessHooksRegistered = true;

  const handleFatalOrSignal = async (signalLabel: string, shouldExit: boolean, exitCode = 0) => {
    try {
      await Promise.race([
        cleanupAllCallGamesOnShutdown(
          `Reinicialização ou erro no site (${signalLabel}).`
        ),
        new Promise((r) => setTimeout(r, 4500)),
      ]);
    } catch {}
    if (shouldExit) {
      process.exit(exitCode);
    }
  };

  process.once("SIGINT", () => void handleFatalOrSignal("SIGINT", true, 0));
  process.once("SIGTERM", () => void handleFatalOrSignal("SIGTERM", true, 0));
  process.on("uncaughtException", (err) => {
    console.error("[CallGame UncaughtException]:", err);
  });
}

/**
 * VoiceStateUpdate handler:
 * 1) Plays 3s welcome when users join lobby call & re-evaluates all-ready gate
 * 2) Auto-deletes finished temporary private voice channel once everyone leaves
 */
export async function handleCallGameVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState
): Promise<void> {
  const guild = newState.guild || oldState.guild;

  // Auto-delete finished temporary private voice channel as soon as everyone leaves
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    if (pendingAutoDeleteVoiceChannels.has(oldState.channelId)) {
      const vc = (guild.channels.cache.get(oldState.channelId) ||
        (await guild.channels.fetch(oldState.channelId).catch(() => null))) as VoiceBasedChannel | null;
      if (!vc) {
        pendingAutoDeleteVoiceChannels.delete(oldState.channelId);
      } else {
        const humansLeft = vc.members.filter((m) => !m.user.bot).size;
        if (humansLeft === 0) {
          pendingAutoDeleteVoiceChannels.delete(oldState.channelId);
          await vc.delete("Todos os participantes saíram da call do Jogo da Call.").catch(() => {});
        }
      }
    }
  }

  const guildId = newState.guild.id;
  const runtime = activeRuntimes.get(guildId);
  if (!runtime || !runtime.session.active || runtime.session.phase !== "lobby") return;

  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  // Re-evaluate all-ready check if someone left the lobby call
  if (
    oldState.channelId === runtime.session.voiceChannelId &&
    newState.channelId !== runtime.session.voiceChannelId
  ) {
    await updateLobbyPanelMessage(guild, runtime.session);
    await checkAndNotifyAllPlayersReady(guild, runtime.session);
    return;
  }

  // Trigger only when user enters the normal lobby call
  if (
    newState.channelId !== runtime.session.voiceChannelId ||
    oldState.channelId === runtime.session.voiceChannelId
  ) {
    return;
  }

  const debounceKey = `${guildId}:${member.id}`;
  const lastJoined = recentJoinDebounce.get(debounceKey) || 0;
  if (Date.now() - lastJoined < 8000) return;
  recentJoinDebounce.set(debounceKey, Date.now());

  try {
    const privChan = await ensureLobbyGameChannel(newState.guild, runtime.session, [member.id]);
    addGameEvent(runtime.session, `${member.displayName || member.user.username} entrou na call normal.`);
    await privChan
      .send({
        content: `👋 <@${member.id}> entrou na call! Leia as regras acima e clique em **Pronto** para se registrar.`,
      })
      .catch(() => {});

    await updateLobbyPanelMessage(newState.guild, runtime.session);
    await checkAndNotifyAllPlayersReady(newState.guild, runtime.session);
    scheduleLobbyWelcomeSpeech(runtime.session, `entrada de ${member.displayName || member.user.username}`);
  } catch (err) {
    console.error("[CallGame VoiceStateUpdate Error]:", err);
  }
}

/**
 * Handles player typing an answer inside their individual private channel (#🔒・resp-...)
 */
export async function handleCallGamePrivateMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guild) return false;

  const runtime = activeRuntimes.get(message.guild.id);
  if (!runtime || !runtime.session.active || runtime.session.phase !== "playing" || !runtime.roundActive) {
    return false;
  }

  const expectedUserId = runtime.playerChannelToUserId.get(message.channelId);
  if (!expectedUserId) return false;
  if (message.author.id !== expectedUserId) return true;

  const answerText = message.content.trim();
  if (!answerText) return true;

  const player = runtime.session.matchPlayers.find((p) => p.userId === expectedUserId);
  const displayName = player?.username || message.member?.displayName || message.author.username;

  if (!runtime.currentAnswers.has(expectedUserId)) {
    runtime.currentAnswers.set(expectedUserId, {
      userId: expectedUserId,
      username: displayName,
      answer: answerText,
      answeredAt: Date.now(),
    });

    addGameEvent(runtime.session, `📩 ${displayName} respondeu no canal privado (${runtime.currentAnswers.size}/${runtime.session.matchPlayers.length}).`);

    const textChan = message.channel as TextChannel;

    // Delete player's text message immediately so the channel remains pristine
    await message.delete().catch(() => {});

    // Edit the existing question embed in this player's channel to confirm the answer is locked in
    if (player?.questionMessageId) {
      try {
        const qMsg = await textChan.messages.fetch(player.questionMessageId).catch(() => null);
        if (qMsg) {
          const editedEmbed = new EmbedBuilder()
            .setTitle(`⚖️ Pergunta ${(runtime.session.currentRoundIndex + 1)} de ${runtime.session.questions.length}`)
            .setColor(SOLID_GREY_EMBED)
            .setDescription(
              `**${runtime.session.currentQuestion || "Pergunta"}**\n\n` +
                `✅ **OK, sua resposta foi guardada!**\n` +
                `Sua resposta: _"${sanitizeForSpeech(answerText, 250)}"_\n\n` +
                `⏳ Aguarde todos responderem e acompanhe a próxima rodada na call!`
            )
            .setTimestamp();
          await qMsg.edit({ embeds: [editedEmbed] }).catch(() => {});
        }
      } catch (err) {
        console.warn("[CallGame Edit Question Embed Error]:", (err as Error).message);
      }
    }

    // Immediate voice announcement in call with narrator voice
    const targetVoice = runtime.session.tempVoiceChannelId || runtime.session.voiceChannelId;
    void speakInVoiceCall(
      runtime.session.guildId,
      `OK! Resposta de ${sanitizeForSpeech(displayName, 40)} guardada.`,
      targetVoice,
      "narrator"
    ).catch(() => {});

    // If every player in the match has answered, finish the round early!
    if (runtime.currentAnswers.size >= runtime.session.matchPlayers.length && runtime.roundDoneResolver) {
      runtime.roundDoneResolver();
    }
  } else {
    // Already answered this round: delete message to keep channel clean
    await message.delete().catch(() => {});
  }

  return true;
}

/**
 * Triggered when a user clicks the "Pronto" button in #🔒・jogo-da-call.
 * Opens an ephemeral message visible only to that user to set custom name and gender.
 */
export async function handleCallGameReadyClick(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction
      .reply({ content: "Este botão só funciona dentro de um servidor.", ephemeral: true })
      .catch(() => {});
    return;
  }

  const runtime = activeRuntimes.get(guild.id);
  if (!runtime || !runtime.session.active) {
    await interaction
      .reply({ content: "⚠️ Este Jogo da Call já foi encerrado.", ephemeral: true })
      .catch(() => {});
    return;
  }

  const draftKey = `${guild.id}:${interaction.user.id}`;
  const isOwner = isGameOwner(runtime.session, interaction.user.id);
  const existingReady = runtime.session.readyPlayers.find((p) => p.userId === interaction.user.id);
  const initialGender = existingReady?.gender || ("m" as const);
  const autoVoiceIdx = runtime.session.readyPlayers.length;
  const currentDraft: PlayerDraftSetup = playerDrafts.get(draftKey) || {
    customName:
      existingReady?.username ||
      (interaction.member as GuildMember)?.displayName ||
      interaction.user.globalName ||
      interaction.user.username,
    gender: initialGender,
    voiceId: resolvePortugueseVoiceId(existingReady?.voiceId, initialGender, autoVoiceIdx, isOwner),
  };
  currentDraft.voiceId = resolvePortugueseVoiceId(currentDraft.voiceId, currentDraft.gender, autoVoiceIdx, isOwner);
  playerDrafts.set(draftKey, currentDraft);

  const embed = buildPlayerSetupEmbed(currentDraft, isOwner);
  const components = buildPlayerSetupComponents(guild.id, currentDraft);

  await interaction.reply({
    embeds: [embed],
    components,
    ephemeral: true,
  }).catch(() => {});
}

/**
 * Triggered when the user clicks "✏️ Alterar Nome" inside their ephemeral setup message.
 * Displays a Discord modal with a short text input for their custom identifier.
 */
export async function handleCallGameOpenNameModal(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "⚠️ Esta ação só pode ser realizada dentro de um servidor.", ephemeral: true }).catch(() => {});
    return;
  }

  const draftKey = `${guild.id}:${interaction.user.id}`;
  const current = playerDrafts.get(draftKey);
  const currentName =
    current?.customName ||
    (interaction.member as GuildMember)?.displayName ||
    interaction.user.globalName ||
    interaction.user.username;

  const modal = new ModalBuilder()
    .setCustomId(`callgame_modal_name:${guild.id}`)
    .setTitle("Identificador no Jogo");

  const nameInput = new TextInputBuilder()
    .setCustomId("player_custom_name")
    .setLabel("Seu Nome / Identificador no Jogo:")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(32)
    .setMinLength(2)
    .setPlaceholder("Ex: Carlos, Ana, Detetive...")
    .setRequired(true);

  if (currentName && currentName.trim().length > 0) {
    nameInput.setValue(currentName.trim().slice(0, 32));
  }

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
  modal.addComponents(row);

  try {
    await interaction.showModal(modal);
  } catch (err: any) {
    console.error("[CallGame ShowNameModal Error]:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `⚠️ Não foi possível abrir o formulário: ${err?.message || "erro interno"}. Tente novamente.`,
        ephemeral: true,
      }).catch(() => {});
    }
  }
}

/**
 * Triggered when the user submits the custom name modal.
 */
export async function handleCallGameNameModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const runtime = activeRuntimes.get(guild.id);
  const isOwner = isGameOwner(runtime?.session, interaction.user.id);
  const draftKey = `${guild.id}:${interaction.user.id}`;
  const customName =
    interaction.fields.getTextInputValue("player_custom_name").trim() || interaction.user.username;
  const current: PlayerDraftSetup = playerDrafts.get(draftKey) || {
    customName,
    gender: "m" as const,
    voiceId: getVoicePoolForGender("m", isOwner)[0].id,
  };
  current.customName = customName;
  current.voiceId = resolvePortugueseVoiceId(current.voiceId, current.gender, 0, isOwner);
  playerDrafts.set(draftKey, current);

  const embed = buildPlayerSetupEmbed(current, isOwner);
  const components = buildPlayerSetupComponents(guild.id, current);

  await interaction.reply({
    content: `✅ Identificador salvo como: **${customName}**! Agora escolha o sexo/voz e clique em **Confirmar Pronto**.`,
    embeds: [embed],
    components,
    ephemeral: true,
  }).catch(() => {});
}

/**
 * Triggered when the user clicks "🎭 Trocar Voz TikTok" to cycle through Portuguese TikTok voices.
 * Exclusive funny Portuguese voices are unlocked ONLY for the game owner / starter.
 */
export async function handleCallGameCycleVoice(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const runtime = activeRuntimes.get(guild.id);
  const isOwner = isGameOwner(runtime?.session, interaction.user.id);
  const draftKey = `${guild.id}:${interaction.user.id}`;
  const current: PlayerDraftSetup = playerDrafts.get(draftKey) || {
    customName:
      (interaction.member as GuildMember)?.displayName ||
      interaction.user.globalName ||
      interaction.user.username,
    gender: "m" as const,
    voiceId: getVoicePoolForGender("m", isOwner)[0].id,
  };

  const pool = getVoicePoolForGender(current.gender, isOwner);
  const idx = pool.findIndex((v) => v.id === current.voiceId);
  const nextIdx = (idx + 1) % pool.length;
  current.voiceId = pool[nextIdx].id;
  playerDrafts.set(draftKey, current);

  const embed = buildPlayerSetupEmbed(current, isOwner);
  const components = buildPlayerSetupComponents(guild.id, current);

  await interaction.update({
    embeds: [embed],
    components,
  }).catch(() => {});
}

/**
 * Triggered when the user clicks "👨 Masculino" or "👩 Feminino".
 */
export async function handleCallGameSetGender(
  interaction: ButtonInteraction,
  gender: "m" | "f"
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const runtime = activeRuntimes.get(guild.id);
  const isOwner = isGameOwner(runtime?.session, interaction.user.id);
  const draftKey = `${guild.id}:${interaction.user.id}`;
  const pool = getVoicePoolForGender(gender, isOwner);
  const current: PlayerDraftSetup = playerDrafts.get(draftKey) || {
    customName:
      (interaction.member as GuildMember)?.displayName ||
      interaction.user.globalName ||
      interaction.user.username,
    gender,
    voiceId: pool[0].id,
  };
  current.gender = gender;
  // Auto-switch to a matching Portuguese voice (exclusive funny voices included only if isOwner)
  if (!pool.some((v) => v.id === current.voiceId)) {
    const sameGenderCount = runtime
      ? runtime.session.readyPlayers.filter((p) => p.gender === gender && p.userId !== interaction.user.id).length
      : 0;
    current.voiceId = pool[sameGenderCount % pool.length].id;
  }
  playerDrafts.set(draftKey, current);

  const embed = buildPlayerSetupEmbed(current, isOwner);
  const components = buildPlayerSetupComponents(guild.id, current);

  await interaction.update({
    embeds: [embed],
    components,
  }).catch(() => {});
}

/**
 * Triggered when the user clicks "✅ Confirmar Pronto".
 * Registers the player in the match, updates the lobby embed, and announces immediately on voice call with narrator voice.
 */
export async function handleCallGameConfirmReady(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const runtime = activeRuntimes.get(guild.id);
  if (!runtime || !runtime.session.active) {
    await interaction.reply({ content: "⚠️ Jogo da Call não está ativo.", ephemeral: true }).catch(() => {});
    return;
  }

  const { session } = runtime;
  const isOwner = isGameOwner(session, interaction.user.id);
  const draftKey = `${guild.id}:${interaction.user.id}`;
  const draft: PlayerDraftSetup = playerDrafts.get(draftKey) || {
    customName:
      (interaction.member as GuildMember)?.displayName ||
      interaction.user.globalName ||
      interaction.user.username,
    gender: "m" as const,
    voiceId: getVoicePoolForGender("m", isOwner)[0].id,
  };

  const finalName = sanitizeForSpeech(draft.customName, 40);
  const gender = draft.gender;
  const voiceId = resolvePortugueseVoiceId(draft.voiceId, gender, session.readyPlayers.length, isOwner);
  const voiceLabel = getVoiceLabel(voiceId, gender);

  const existingIdx = session.readyPlayers.findIndex((p) => p.userId === interaction.user.id);
  if (existingIdx >= 0) {
    session.readyPlayers[existingIdx].username = finalName;
    session.readyPlayers[existingIdx].gender = gender;
    session.readyPlayers[existingIdx].voiceId = voiceId;
  } else {
    session.readyPlayers.push({
      userId: interaction.user.id,
      username: finalName,
      gender,
      voiceId,
      readyAt: Date.now(),
    });
  }

  addGameEvent(session, `✅ ${finalName} (${gender === "f" ? "Feminino" : "Masculino"} · ${voiceLabel}) está pronto!`);
  await updateLobbyPanelMessage(guild, session);
  await checkAndNotifyAllPlayersReady(guild, session);

  await interaction.update({
    content: `✅ **Você está pronto!**\n• Identificador: **${finalName}**\n• Sexo: **${gender === "f" ? "Feminino" : "Masculino"}**\n• Voz TikTok: **${voiceLabel}**\n\n${
      interaction.user.id === session.ownerUserId
        ? "👑 **Você é o dono!** Assim que todos os participantes estiverem prontos, a mensagem com o botão **Começar** será liberada no canal compartilhado."
        : "⏳ Aguardando todos os participantes e o dono confirmarem para liberar o botão de início."
    }`,
    embeds: [],
    components: [],
  }).catch(() => {});

  // Immediate voice speech with narrator voice (TikTok br_005)
  const voiceAnnouncement =
    gender === "f"
      ? `A jogadora ${finalName} está pronta!`
      : `O jogador ${finalName} está pronto!`;

  try {
    await speakInVoiceCall(
      guild.id,
      voiceAnnouncement,
      session.voiceChannelId,
      "narrator"
    );
  } catch (err) {
    console.warn("[CallGame Ready Announce Warning]:", (err as Error).message);
  }
}

/**
 * Triggered when a participant clicks "✍️ Responder" in the shared channel during an active round.
 * Opens a direct Discord Modal text box for the user to type and submit their answer directly.
 */
export async function handleCallGameOpenAnswerModal(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "⚠️ Esta ação só pode ser realizada dentro de um servidor.",
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  const runtime = activeRuntimes.get(guild.id);
  if (!runtime || !runtime.session.active || runtime.session.phase !== "playing" || !runtime.roundActive) {
    await interaction.reply({
      content: "⚠️ Não há nenhuma rodada ativa no momento ou o tempo limite já encerrou.",
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  const parts = interaction.customId.split(":");
  const parsedRound = Number(parts[2]);
  const roundIdx = Number.isFinite(parsedRound) ? parsedRound : runtime.session.currentRoundIndex;

  // Auto-enroll participant if they were ready or are in the game voice channel / owner
  let isMatchPlayer = runtime.session.matchPlayers.some((p) => p.userId === interaction.user.id);
  if (!isMatchPlayer) {
    const isReady = runtime.session.readyPlayers.some((p) => p.userId === interaction.user.id);
    const member = (interaction.member as GuildMember) || (await guild.members.fetch(interaction.user.id).catch(() => null));
    const targetVoiceId = runtime.session.tempVoiceChannelId || runtime.session.voiceChannelId;
    const inVoice = Boolean(member?.voice?.channelId && member.voice.channelId === targetVoiceId);
    const isOwner = interaction.user.id === runtime.session.ownerUserId;

    if (isReady || inVoice || isOwner) {
      const readyInfo = runtime.session.readyPlayers.find((rp) => rp.userId === interaction.user.id);
      const chosenName = readyInfo?.username || member?.displayName || interaction.user.globalName || interaction.user.username;
      const chosenGender: "m" | "f" = readyInfo?.gender || "m";
      const chosenVoiceId = resolvePortugueseVoiceId(
        readyInfo?.voiceId,
        chosenGender,
        runtime.session.matchPlayers.length,
        isOwner
      );

      runtime.session.matchPlayers.push({
        userId: interaction.user.id,
        username: sanitizeForSpeech(chosenName, 40),
        gender: chosenGender,
        voiceId: chosenVoiceId,
        privateTextChannelId: null,
        questionMessageId: null,
        totalPoints: 0,
      });
      isMatchPlayer = true;
    }
  }

  if (!isMatchPlayer) {
    await interaction.reply({
      content: "⚠️ Você não está registrado como participante desta partida.",
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  const currentAnswer = runtime.currentAnswers.get(interaction.user.id)?.answer;

  const modal = new ModalBuilder()
    .setCustomId(`callgame_modal_answer:${guild.id}:${roundIdx}`)
    .setTitle(`Resposta - Pergunta ${roundIdx + 1}`.slice(0, 45));

  const answerInput = new TextInputBuilder()
    .setCustomId("round_answer")
    .setLabel("Sua Resposta:")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(300)
    .setMinLength(2)
    .setPlaceholder("Digite sua resposta aqui para a pergunta...")
    .setRequired(true);

  // CRITICAL: Discord API throws 400 Bad Request if value is an empty string ("")
  // Only call .setValue() when there is an existing non-empty answer previously recorded!
  if (currentAnswer && currentAnswer.trim().length > 0) {
    answerInput.setValue(currentAnswer.trim().slice(0, 300));
  }

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(answerInput);
  modal.addComponents(row);

  try {
    await interaction.showModal(modal);
  } catch (err: any) {
    console.error("[CallGame ShowAnswerModal Error]:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `⚠️ Não foi possível abrir o campo de texto: ${err?.message || "erro de comunicação"}. Tente clicar novamente!`,
        ephemeral: true,
      }).catch(() => {});
    }
  }
}

/**
 * Triggered when the user submits their direct text box answer via Modal.
 */
export async function handleCallGameAnswerModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "⚠️ Esta ação só pode ser realizada dentro de um servidor.",
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  try {
    const runtime = activeRuntimes.get(guild.id);
    if (!runtime || !runtime.session.active || runtime.session.phase !== "playing" || !runtime.roundActive) {
      await interaction.reply({
        content: "⚠️ O tempo para responder esta pergunta já encerrou.",
        ephemeral: true,
      }).catch(() => {});
      return;
    }

    const parts = interaction.customId.split(":");
    const roundIdx = Number(parts[2]);
    if (roundIdx !== runtime.session.currentRoundIndex) {
      await interaction.reply({
        content: "⚠️ Esta rodada já avançou para outra pergunta.",
        ephemeral: true,
      }).catch(() => {});
      return;
    }

    const rawAnswer = interaction.fields.getTextInputValue("round_answer")?.trim();
    if (!rawAnswer) {
      await interaction.reply({
        content: "⚠️ A resposta não pode estar vazia.",
        ephemeral: true,
      }).catch(() => {});
      return;
    }

    const player = runtime.session.matchPlayers.find((p) => p.userId === interaction.user.id);
    const displayName = player?.username || (interaction.member as GuildMember)?.displayName || interaction.user.username;

    const isFirstAnswer = !runtime.currentAnswers.has(interaction.user.id);
    runtime.currentAnswers.set(interaction.user.id, {
      userId: interaction.user.id,
      username: displayName,
      answer: rawAnswer,
      answeredAt: Date.now(),
    });

    await interaction.reply({
      content: `✅ **Sua resposta foi registrada com sucesso!**\n> _"${sanitizeForSpeech(rawAnswer, 250)}"_\n\n⏳ Acompanhe a call para a revelação das respostas e vencedor!`,
      ephemeral: true,
    }).catch(() => {});

    addGameEvent(
      runtime.session,
      `📩 ${displayName} respondeu na caixa de texto (${runtime.currentAnswers.size}/${runtime.session.matchPlayers.length}).`
    );

    await refreshSharedRoundMessage(guild, runtime, runtime.session.currentRoundIndex, false);

    if (isFirstAnswer) {
      const targetVoice = runtime.session.tempVoiceChannelId || runtime.session.voiceChannelId;
      void speakInVoiceCall(
        runtime.session.guildId,
        `OK! Resposta de ${sanitizeForSpeech(displayName, 40)} guardada.`,
        targetVoice,
        "narrator"
      ).catch(() => {});
    }

    if (runtime.currentAnswers.size >= runtime.session.matchPlayers.length && runtime.roundDoneResolver) {
      runtime.roundDoneResolver();
    }
  } catch (err: any) {
    console.error("[CallGame AnswerModalSubmit Error]:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `⚠️ Erro ao salvar sua resposta: ${err?.message || "erro interno"}`,
        ephemeral: true,
      }).catch(() => {});
    }
  }
}

/**
 * Triggered ONLY by the owner clicking "Começar" on the readiness card.
 */
export async function handleCallGameOwnerStartClick(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction
      .reply({ content: "Este botão só funciona dentro de um servidor.", ephemeral: true })
      .catch(() => {});
    return;
  }

  const runtime = activeRuntimes.get(guild.id);
  if (!runtime || !runtime.session.active) {
    await interaction
      .reply({ content: "⚠️ Nenhum Jogo da Call ativo no momento.", ephemeral: true })
      .catch(() => {});
    return;
  }

  if (interaction.user.id !== runtime.session.ownerUserId) {
    await interaction
      .reply({
        content: `🚫 **Aviso:** Somente o dono (<@${runtime.session.ownerUserId}>) pode iniciar a partida!`,
        ephemeral: true,
      })
      .catch(() => {});
    return;
  }

  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  try {
    const updated = await beginCallGameMatch(guild.id, interaction.user.id);
    await interaction
      .editReply({
        content: `🚀 **Partida iniciada com sucesso!** Todos foram movidos para <#${updated.tempVoiceChannelId}> e as perguntas serão enviadas neste canal compartilhado.`,
      })
      .catch(() => {});
  } catch (err) {
    await interaction
      .editReply({
        content: `❌ Não foi possível iniciar a partida: ${(err as Error).message}`,
      })
      .catch(() => {});
  }
}
