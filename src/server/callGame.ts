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
  OverwriteResolvable,
  PermissionFlagsBits,
  TextChannel,
  VoiceBasedChannel,
  VoiceState,
} from "discord.js";
import { getBotClient } from "./bot";
import { hydrateAiVoiceFromDisk } from "./aiVoice";
import { joinVoiceCall, leaveVoiceCall, speakInVoiceCall, waitForVoiceQueueIdle, VoiceSpeechMeta } from "./voice";
import { emitCallGameBroadcastEvent } from "./broadcastHub";
import {
  startInternalStageBroadcast,
  retargetServerScreenBroadcast,
  stopServerScreenBroadcast,
  isServerStageBroadcastActive,
} from "./serverScreen";

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
  "1. Entre na call normal e aguarde o dono iniciar tudo.\n2. Ao começar, todos serão movidos para a call principal privada.\n3. Responda cada pergunta apenas no seu canal privado!";

export type CallGamePhase = "idle" | "lobby" | "starting" | "playing" | "finished";

export interface CallGameReadyPlayer {
  userId: string;
  username: string;
  avatar?: string | null;
  readyAt: number;
}

export interface CallGameMatchPlayer {
  userId: string;
  username: string;
  avatar?: string | null;
  privateTextChannelId: string | null;
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
  connectedAccount?: { userId: string; username: string; avatar?: string | null } | null;
  autoScreenBroadcast?: boolean;
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
const activeRuntimes = new Map<string, InternalRuntimeState>();
const recentJoinDebounce = new Map<string, number>();
// Temporary voice channels waiting for all humans to leave before auto-deletion
const pendingAutoDeleteVoiceChannels = new Map<string, string>(); // channelId -> guildId
// Tracks recently used questions per guild so consecutive games don't repeat until the pool is exhausted
const recentQuestionsByGuild = new Map<string, Set<string>>();

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

function buildLobbyEmbed(session: CallGameSession): EmbedBuilder {
  const readyLines =
    session.readyPlayers.length > 0
      ? session.readyPlayers
          .map((p, idx) => `✅ **${idx + 1}.** <@${p.userId}> (${p.username})`)
          .join("\n")
      : "_Nenhum jogador clicou em Pronto ainda._";

  const statusLine =
    session.phase === "playing"
      ? `🎙️ **Partida em andamento** na call privada <#${session.tempVoiceChannelId}> (Pergunta ${session.currentRoundIndex + 1}/${session.questions.length})`
      : session.phase === "starting"
      ? "🚀 **Movendo todos para a call principal privada...**"
      : session.phase === "finished"
      ? "🏆 **Partida encerrada!** Veja o placar abaixo."
      : `⏳ **Aguardando na call normal** (${session.voiceChannelName}) — quando quiser começar, <@${session.ownerUserId}> clica em **Começar Tudo**.`;

  return new EmbedBuilder()
    .setTitle("🎮 Jogo da Call — Central & Regras")
    .setColor(session.phase === "playing" ? 0x10b981 : 0xec4899)
    .setDescription(
      `${statusLine}\n\n` +
        `📜 **Regras:**\n${session.rulesText}\n\n` +
        `👥 **Jogadores Prontos (${session.readyPlayers.length}):**\n${readyLines}\n\n` +
        `👑 **Botão exclusivo do dono:** Apenas <@${session.ownerUserId}> pode clicar em **Começar Tudo** para puxar todos para a call principal privada.`
    )
    .setFooter({ text: `Perguntas configuradas: ${session.questions.length} • Tempo/rodada: ${session.roundSeconds}s` })
    .setTimestamp();
}

function buildLobbyComponents(session: CallGameSession): ActionRowBuilder<ButtonBuilder> {
  const isPlaying = session.phase === "playing" || session.phase === "starting";
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`callgame_ready:${session.guildId}`)
      .setLabel("Estou Pronto")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isPlaying),
    new ButtonBuilder()
      .setCustomId(`callgame_owner_start:${session.guildId}`)
      .setLabel("Começar Tudo (Só Dono)")
      .setEmoji("👑")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isPlaying)
  );
}

function buildOwnerPrivateControlRow(guildId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`callgame_owner_start:${guildId}`)
      .setLabel("Começar Tudo (Botão Privado do Dono)")
      .setEmoji("🚀")
      .setStyle(ButtonStyle.Danger)
  );
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
            SendMessages: true,
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
      deny: [PermissionFlagsBits.ViewChannel],
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
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  const created = await guild.channels.create({
    name: "🔒・jogo-da-call",
    type: ChannelType.GuildText,
    parent: voiceChannel?.parentId || undefined,
    topic: `Canal do Jogo da Call (${session.voiceChannelName})`,
    permissionOverwrites: overwrites,
  });

  session.privateChannelId = created.id;
  session.privateChannelName = created.name;

  const sent = await created.send({
    content: `👑 <@${session.ownerUserId}> — Este é o canal do jogo. Use o botão privado de dono abaixo quando quiser **Começar Tudo**!`,
    embeds: [buildLobbyEmbed(session)],
    components: [buildLobbyComponents(session)],
  });
  session.panelMessageId = sent.id;
  syncPersistedGameState(session);

  addGameEvent(session, `Canal do jogo #${created.name} criado com o botão exclusivo do dono.`);
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
        runtime.session.voice,
        undefined,
        runtime.session.expression,
        {
          kind: "lobby_speech",
          displayText: "Bem-vindo!\nSiga as regras no canal privado criado.\nPara começar, aperte no botão Pronto!",
        }
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

async function runMatchLoop(guild: Guild, runtime: InternalRuntimeState): Promise<void> {
  const { session } = runtime;
  const targetVoiceId = session.tempVoiceChannelId || session.voiceChannelId;

  const speakAndLog = async (text: string, meta?: VoiceSpeechMeta) => {
    if (runtime.aborted) return;
    await speakInVoiceCall(
      session.guildId,
      text,
      targetVoiceId,
      session.voice,
      undefined,
      session.expression,
      meta
    );
  };

  try {
    // 1. Wait 3 seconds after moving everyone to the temporary private voice channel
    await new Promise((r) => setTimeout(r, 3000));
    if (runtime.aborted) return;

    await speakAndLog(
      "Olá a todos, o jogo foi iniciado! Regras: quando o bot fazer alguma pergunta, responda ela no seu canal criado privado.",
      {
        kind: "announcement",
        displayText:
          "Olá a todos, o jogo foi iniciado!\nQuando o bot fizer alguma pergunta, responda ela no seu canal privado.",
      }
    );
    addGameEvent(session, "Bot falou a introdução do jogo após 3 segundos na call privada.");
    await waitForVoiceQueueIdle(session.guildId, 45_000);
    if (runtime.aborted) return;

    // 2. Execute each question round sequentially
    for (let rIdx = 0; rIdx < session.questions.length; rIdx++) {
      if (runtime.aborted) return;

      const question = session.questions[rIdx];
      session.currentRoundIndex = rIdx;
      session.currentQuestion = question;
      session.roundDeadlineAt = Date.now() + session.roundSeconds * 1000;
      runtime.currentAnswers.clear();
      runtime.roundActive = true;

      emitCallGameBroadcastEvent({
        type: "round_question",
        guildId: session.guildId,
        questionNumber: rIdx + 1,
        totalQuestions: session.questions.length,
        question,
        deadlineAt: session.roundDeadlineAt,
      });

      addGameEvent(session, `Pergunta ${rIdx + 1}/${session.questions.length}: "${question}"`);
      await updateLobbyPanelMessage(guild, session);

      // Post question inside every player's private text channel
      for (const mp of session.matchPlayers) {
        if (!mp.privateTextChannelId) continue;
        const pChan = (guild.channels.cache.get(mp.privateTextChannelId) ||
          (await guild.channels.fetch(mp.privateTextChannelId).catch(() => null))) as TextChannel | null;
        if (!pChan) continue;

        await purgeAllMessagesInChannel(pChan);
        const qEmbed = new EmbedBuilder()
          .setTitle(`⚖️ Pergunta ${rIdx + 1} de ${session.questions.length}`)
          .setColor(0xf43f5e)
          .setDescription(
            `**${question}**\n\n` +
              `📩 **Envie UMA mensagem neste canal respondendo!**\n` +
              `⏱️ Tempo limite: **${session.roundSeconds} segundos**.\n` +
              `_Assim que você responder, o bot dirá OK, guardará sua resposta e apagará as mensagens aqui._`
          )
          .setTimestamp();

        await pChan.send({ content: `<@${mp.userId}>`, embeds: [qEmbed] }).catch(() => {});
      }

      // Speak question in voice call
      await speakAndLog(
        `Pergunta número ${rIdx + 1}: ${sanitizeForSpeech(question, 220)}. Respondam no canal privado de vocês!`,
        {
          kind: "question",
          roundIndex: rIdx,
          questionNumber: rIdx + 1,
          totalQuestions: session.questions.length,
          question,
          displayText: question,
        }
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

      if (runtime.aborted) return;

      addGameEvent(
        session,
        `Rodada ${rIdx + 1} encerrada (${runtime.currentAnswers.size}/${session.matchPlayers.length} respostas). Lendo respostas e analisando com IA...`
      );

      // Wait any quick "OK" audio still playing before reading all answers
      await waitForVoiceQueueIdle(session.guildId, 25_000);
      if (runtime.aborted) return;

      // Clean all players' private channels in case someone didn't answer before timeout
      for (const mp of session.matchPlayers) {
        if (!mp.privateTextChannelId) continue;
        const pChan = (guild.channels.cache.get(mp.privateTextChannelId) ||
          (await guild.channels.fetch(mp.privateTextChannelId).catch(() => null))) as TextChannel | null;
        if (pChan) await purgeAllMessagesInChannel(pChan);
      }

      // 3. Read EVERY player's answer out loud when the round finishes
      await speakAndLog(`Tempo encerrado! Vamos ouvir as respostas da pergunta ${rIdx + 1}.`, {
        kind: "announcement",
        displayText: `Tempo encerrado!\nVamos ouvir as respostas da Pergunta ${String(rIdx + 1).padStart(2, "0")}.`,
      });
      for (const mp of session.matchPlayers) {
        if (runtime.aborted) return;
        const spokenName = sanitizeForSpeech(mp.username, 60);
        const ans = runtime.currentAnswers.get(mp.userId);
        if (ans) {
          await speakAndLog(`A resposta de ${spokenName} foi: ${sanitizeForSpeech(ans.answer, 210)}.`, {
            kind: "answer_reveal",
            roundIndex: rIdx,
            questionNumber: rIdx + 1,
            userId: mp.userId,
            username: mp.username,
            avatar: mp.avatar || null,
            answer: ans.answer,
            didAnswer: true,
          });
        } else {
          await speakAndLog(`${spokenName} não enviou resposta a tempo.`, {
            kind: "answer_reveal",
            roundIndex: rIdx,
            questionNumber: rIdx + 1,
            userId: mp.userId,
            username: mp.username,
            avatar: mp.avatar || null,
            answer: "(Não enviou resposta dentro do tempo limite)",
            didAnswer: false,
          });
        }
      }

      // 4. AI judges which answer came closest / smartest
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

      const roundWinnerPlayer = session.matchPlayers.find((m) => m.userId === judged.winnerUserId);
      emitCallGameBroadcastEvent({
        type: "round_scored",
        guildId: session.guildId,
        roundNumber: rIdx + 1,
        scores: session.matchPlayers.map((mp) => {
          const rSc = judged.scoredAnswers.find((s) => s.userId === mp.userId);
          return {
            userId: mp.userId,
            username: mp.username,
            avatar: mp.avatar || null,
            totalPoints: mp.totalPoints,
            roundPoints: rSc?.points || 0,
          };
        }),
        winner: judged.winnerUserId
          ? {
              userId: judged.winnerUserId,
              username: judged.winnerUsername,
              avatar: roundWinnerPlayer?.avatar || null,
              totalPoints: roundWinnerPlayer?.totalPoints || 0,
              winningAnswer: judged.winnerAnswer,
              explanation: judged.explanation,
            }
          : null,
      });

      // 5. Speak AI winner + answer + why ("ai que legal...")
      if (judged.winnerUsername && judged.winnerAnswer) {
        const wName = sanitizeForSpeech(judged.winnerUsername, 60);
        const wAns = sanitizeForSpeech(judged.winnerAnswer, 180);
        await speakAndLog(
          `Ai que legal! A pessoa que mais chegou perto foi ${wName}, com a resposta: ${wAns}. E o porquê é: ${judged.explanation}`,
          {
            kind: "round_winner",
            questionNumber: rIdx + 1,
            userId: judged.winnerUserId || undefined,
            username: judged.winnerUsername,
            avatar: roundWinnerPlayer?.avatar || null,
            totalPoints: roundWinnerPlayer?.totalPoints || 0,
            winningAnswer: judged.winnerAnswer,
            explanation: judged.explanation,
          }
        );
        addGameEvent(session, `🏆 Rodada ${rIdx + 1}: ${judged.winnerUsername} venceu — ${judged.explanation}`);
      } else {
        await speakAndLog("Ninguém respondeu essa rodada, então ninguém pontuou!", {
          kind: "announcement",
          displayText: "Ninguém respondeu esta rodada.",
        });
      }

      // Post round summary in #🔒・jogo-da-call
      if (session.privateChannelId) {
        const mainTextChan = (guild.channels.cache.get(session.privateChannelId) ||
          (await guild.channels.fetch(session.privateChannelId).catch(() => null))) as TextChannel | null;
        if (mainTextChan) {
          const lines = judged.scoredAnswers
            .map((a) => `• **${a.username}** (${a.points} pts): _"${a.answer}"_`)
            .join("\n");
          const roundEmbed = new EmbedBuilder()
            .setTitle(`📊 Resultado da Pergunta ${rIdx + 1}`)
            .setColor(0x10b981)
            .setDescription(
              `**Pergunta:** ${question}\n\n` +
                `**Respostas:**\n${lines}\n\n` +
                (judged.winnerUsername
                  ? `🏆 **Quem mais chegou perto:** <@${judged.winnerUserId}> (${judged.winnerUsername})\n💬 **Por quê:** ${judged.explanation}`
                  : "⚠️ Ninguém respondeu esta rodada.")
            )
            .setTimestamp();
          await mainTextChan.send({ embeds: [roundEmbed] }).catch(() => {});
        }
      }

      await waitForVoiceQueueIdle(session.guildId, 90_000);
      if (runtime.aborted) return;

      if (rIdx < session.questions.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // 6. Final Podium & Total Points Sum
    session.phase = "finished";
    session.currentQuestion = null;
    session.roundDeadlineAt = null;
    session.active = false;

    const ranking = [...session.matchPlayers].sort((a, b) => b.totalPoints - a.totalPoints);
    const champion = ranking[0];

    const broadcastLeaderboard = ranking.map((p, idx) => ({
      rank: idx + 1,
      userId: p.userId,
      username: p.username,
      avatar: p.avatar || null,
      totalPoints: p.totalPoints,
      lastRoundPoints: 0,
    }));

    emitCallGameBroadcastEvent({
      type: "match_ranking",
      guildId: session.guildId,
      leaderboard: broadcastLeaderboard,
    });

    await speakAndLog("Confira agora a classificação final da partida!", {
      kind: "leaderboard",
      displayText: "Classificação Final da Partida",
    });
    await waitForVoiceQueueIdle(session.guildId, 25_000);
    if (runtime.aborted) return;

    if (champion && champion.totalPoints > 0) {
      // Find champion's best scored answer across rounds for the winner spotlight
      let bestAns: { points: number; answer: string; explanation: string } | null = null;
      for (const rr of session.roundResults) {
        const entry = rr.answers.find((a) => a.userId === champion.userId);
        if (entry && (!bestAns || entry.points > bestAns.points)) {
          bestAns = {
            points: entry.points,
            answer: entry.answer,
            explanation:
              rr.winnerUserId === champion.userId ? rr.explanation : entry.aiComment,
          };
        }
      }

      const champSpoken = sanitizeForSpeech(champion.username, 60);
      await speakAndLog(
        `Fim de jogo! Somando os pontos de todas as perguntas, quem ganhou foi ${champSpoken} com ${champion.totalPoints} pontos! Parabéns!`,
        {
          kind: "final_winner",
          userId: champion.userId,
          username: champion.username,
          avatar: champion.avatar || null,
          totalPoints: champion.totalPoints,
          winningAnswer: bestAns?.answer || null,
          explanation:
            bestAns?.explanation ||
            `Maior pontuação acumulada nas ${session.questions.length} rodadas da partida.`,
        }
      );
      emitCallGameBroadcastEvent({
        type: "match_finished",
        guildId: session.guildId,
        leaderboard: broadcastLeaderboard,
        champion: {
          userId: champion.userId,
          username: champion.username,
          avatar: champion.avatar || null,
          totalPoints: champion.totalPoints,
          winningAnswer: bestAns?.answer || null,
          explanation:
            bestAns?.explanation ||
            `Maior pontuação acumulada nas ${session.questions.length} rodadas da partida.`,
        },
      });
      addGameEvent(session, `👑 CAMPEÃO FINAL: ${champion.username} com ${champion.totalPoints} pontos!`);
    } else {
      await speakAndLog("Fim de jogo! Ninguém acumulou pontos nesta partida.", {
        kind: "announcement",
        displayText: "Fim de jogo!\nNinguém acumulou pontos nesta partida.",
      });
      emitCallGameBroadcastEvent({
        type: "match_finished",
        guildId: session.guildId,
        leaderboard: broadcastLeaderboard,
        champion: null,
      });
      addGameEvent(session, "Partida finalizada sem pontuação.");
    }

    if (session.privateChannelId) {
      const mainTextChan = (guild.channels.cache.get(session.privateChannelId) ||
        (await guild.channels.fetch(session.privateChannelId).catch(() => null))) as TextChannel | null;
      if (mainTextChan) {
        const podiumLines =
          ranking.length > 0
            ? ranking
                .map((p, i) => `${i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : "▪️"} **${i + 1}º ${p.username}** — **${p.totalPoints} pontos**`)
                .join("\n")
            : "_Sem jogadores._";

        const finalEmbed = new EmbedBuilder()
          .setTitle("🏆 Jogo da Call — Resultado Final!")
          .setColor(0xf59e0b)
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

    // 7. Delete every player's private text channel
    for (const mp of session.matchPlayers) {
      if (!mp.privateTextChannelId) continue;
      const pChan =
        guild.channels.cache.get(mp.privateTextChannelId) ||
        (await guild.channels.fetch(mp.privateTextChannelId).catch(() => null));
      if (pChan) {
        await pChan.delete("Fim do Jogo da Call — limpeza de canal privado individual.").catch(() => {});
      }
      runtime.playerChannelToUserId.delete(mp.privateTextChannelId);
      mp.privateTextChannelId = null;
    }

    // 8. Bot leaves the temporary voice channel automatically (does NOT force-delete while humans remain; auto-deletes when empty)
    const tempVoiceId = session.tempVoiceChannelId;
    leaveVoiceCall(session.guildId);
    if (isServerStageBroadcastActive()) {
      void stopServerScreenBroadcast().catch(() => {});
    }
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
    voice: "lhays_anime",
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
    connectedAccount: null,
    autoScreenBroadcast: true,
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
  connectedAccount?: { userId: string; username: string; avatar?: string | null } | null;
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
    voice: params.voice || "lhays_anime",
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
    connectedAccount: params.connectedAccount || null,
    autoScreenBroadcast: params.autoScreenBroadcast !== false,
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
  emitCallGameBroadcastEvent({
    type: "lobby_open",
    guildId: params.guildId,
    guildName: guild.name,
    voiceChannelId: params.voiceChannelId,
    voiceChannelName: joinRes.channelName,
  });
  addGameEvent(
    session,
    `Bot entrou na call normal "${joinRes.channelName}". Aguardando o dono (${session.ownerUserId}) clicar em Começar Tudo.`
  );

  await ensureLobbyGameChannel(guild, session);
  await updateLobbyPanelMessage(guild, session);

  if (session.autoScreenBroadcast) {
    addGameEvent(
      session,
      "🖥️ Navegador no Servidor (EUA us-east5) aberto em 'AGUARDANDO INÍCIO DA PARTIDA' — continua ativo mesmo se você sair do aplicativo!"
    );
    void startInternalStageBroadcast({
      guildId: params.guildId,
      voiceChannelId: params.voiceChannelId,
      fallbackTextChannelId: session.privateChannelId || undefined,
      intervalSeconds: 4,
    }).catch((err) => {
      console.warn("[CallGame] Erro ao iniciar navegador interno EUA:", (err as Error).message);
    });
  }

  // Wait 3s and speak welcome
  scheduleLobbyWelcomeSpeech(session, "entrada do bot na call normal");

  return session;
}

/**
 * Owner (or Panel) triggers "Começar Tudo":
 * Creates temporary private voice call, moves everyone + bot into it, creates 1 private text channel per player, and starts the rounds!
 */
export async function beginCallGameMatch(guildId: string, requesterUserId?: string): Promise<CallGameSession> {
  const runtime = activeRuntimes.get(guildId);
  if (!runtime || !runtime.session.active) {
    throw new Error("Inicie primeiro o Jogo da Call na call normal!");
  }

  const { session } = runtime;
  if (requesterUserId && requesterUserId !== session.ownerUserId) {
    throw new Error(`Apenas o dono (${session.ownerUserId}) pode iniciar tudo!`);
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

  session.phase = "starting";
  // Pick a fresh random batch of questions (default 4) from the 60+ pool for this match
  session.questions = pickRandomMatchQuestions(
    guildId,
    session.questionPool,
    session.questionsPerMatch
  );
  addGameEvent(
    session,
    `Dono clicou em Começar Tudo! Sorteadas ${session.questions.length} perguntas aleatórias do banco de ${session.questionPool.length}.`
  );
  await updateLobbyPanelMessage(guild, session);

  // Gather all human members currently in the lobby call + any ready players currently in voice
  const lobbyVoice = (guild.channels.cache.get(session.voiceChannelId) ||
    (await guild.channels.fetch(session.voiceChannelId).catch(() => null))) as VoiceBasedChannel | null;

  const participantMap = new Map<string, GuildMember>();
  if (lobbyVoice && lobbyVoice.isVoiceBased()) {
    for (const [id, m] of lobbyVoice.members) {
      if (!m.user.bot) participantMap.set(id, m);
    }
  }
  for (const rp of session.readyPlayers) {
    if (!participantMap.has(rp.userId)) {
      const fetched = await guild.members.fetch(rp.userId).catch(() => null);
      if (fetched && !fetched.user.bot) {
        participantMap.set(rp.userId, fetched);
      }
    }
  }

  if (participantMap.size === 0) {
    // Include owner if they triggered from outside call so match still works cleanly
    const ownerMember = await guild.members.fetch(session.ownerUserId).catch(() => null);
    if (ownerMember && !ownerMember.user.bot) {
      participantMap.set(ownerMember.id, ownerMember);
    }
  }

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

  // Move all participants who are in voice into the temporary private call
  for (const [, member] of participantMap) {
    if (member.voice?.channelId) {
      await member.voice.setChannel(tempVoice).catch((e) => {
        console.warn(`[CallGame] Não foi possível mover ${member.user.tag}:`, e?.message);
      });
    }
  }

  // Move bot into the temporary private call
  await joinVoiceCall(guildId, tempVoice.id);

  if (session.autoScreenBroadcast || isServerStageBroadcastActive()) {
    void retargetServerScreenBroadcast(
      guildId,
      tempVoice.id,
      session.privateChannelId || undefined
    ).catch(() => {});
  }

  // Create 1 private text channel per participant
  session.matchPlayers = [];
  runtime.playerChannelToUserId.clear();

  for (const [uid, member] of participantMap) {
    const displayName = member.displayName || member.user.globalName || member.user.username;
    const slug = sanitizeChannelSlug(displayName);

    const textChan = await guild.channels.create({
      name: `🔒・resp-${slug}`,
      type: ChannelType.GuildText,
      parent: lobbyVoice?.parentId || undefined,
      topic: `Canal privado de respostas de ${displayName} no Jogo da Call`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: botId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        {
          id: uid,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    runtime.playerChannelToUserId.set(textChan.id, uid);
    session.matchPlayers.push({
      userId: uid,
      username: displayName,
      avatar: member.user.displayAvatarURL({ size: 256, extension: "png" }),
      privateTextChannelId: textChan.id,
      totalPoints: 0,
    });
  }

  session.phase = "playing";
  session.roundResults = [];
  syncPersistedGameState(session);
  emitCallGameBroadcastEvent({
    type: "match_opening",
    guildId,
    guildName: guild.name,
    voiceChannelId: tempVoice.id,
    voiceChannelName: tempVoice.name,
    players: session.matchPlayers.map((mp) => ({
      userId: mp.userId,
      username: mp.username,
      avatar: mp.avatar || null,
    })),
  });
  addGameEvent(
    session,
    `Todos movidos para "${tempVoice.name}"! ${session.matchPlayers.length} canal(is) privado(s) individual(is) criados.`
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
  if (isServerStageBroadcastActive()) {
    void stopServerScreenBroadcast().catch(() => {});
  }

  activeRuntimes.delete(guildId);
  clearPersistedGameState(guildId);
  emitCallGameBroadcastEvent({ type: "match_stopped", guildId });
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
    await stopServerScreenBroadcast().catch(() => {});

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
    emitCallGameBroadcastEvent({ type: "match_stopped", guildId });
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

// Register process + Vite SSR module-reload hooks once safely via globalThis
const gAny = globalThis as any;
if (typeof gAny.__callGameOnModuleReload === "function") {
  // Previous instance existed inside the same Vite SSR Node process (code edit reload!)
  Promise.resolve(
    gAny.__callGameOnModuleReload("Edição ou problema detectado dentro do site.")
  ).catch(() => {});
}
gAny.__callGameOnModuleReload = (reason: string) =>
  cleanupAllCallGamesOnShutdown(reason);

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
    void handleFatalOrSignal("Erro interno no site", false, 1);
  });
}

/**
 * VoiceStateUpdate handler:
 * 1) Plays 3s welcome when users join lobby call
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

  const member = newState.member;
  if (!member || member.user.bot) return;

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
        content: `👋 <@${member.id}> entrou na call! Leia as regras acima e clique em **Estou Pronto**.`,
      })
      .catch(() => {});

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
    const answeredAt = Date.now();
    runtime.currentAnswers.set(expectedUserId, {
      userId: expectedUserId,
      username: displayName,
      answer: answerText,
      answeredAt,
    });

    emitCallGameBroadcastEvent({
      type: "player_answered",
      guildId: message.guild.id,
      userId: expectedUserId,
      username: displayName,
      answeredAt,
    });

    addGameEvent(runtime.session, `📩 ${displayName} respondeu no canal privado (${runtime.currentAnswers.size}/${runtime.session.matchPlayers.length}).`);

    // Bot says OK, wipes all messages in this private channel leaving it completely empty, and saves the answer
    const textChan = message.channel as TextChannel;
    await textChan.send({ content: "OK" }).catch(() => {});

    // Short voice acknowledgment "OK"
    const targetVoice = runtime.session.tempVoiceChannelId || runtime.session.voiceChannelId;
    void speakInVoiceCall(
      runtime.session.guildId,
      `OK! Resposta de ${sanitizeForSpeech(displayName, 40)} guardada.`,
      targetVoice,
      runtime.session.voice,
      undefined,
      runtime.session.expression,
      { kind: "ack" }
    ).catch(() => {});

    setTimeout(() => {
      void purgeAllMessagesInChannel(textChan);
    }, 850);

    // If every player in the match has answered, finish the round early!
    if (runtime.currentAnswers.size >= runtime.session.matchPlayers.length && runtime.roundDoneResolver) {
      runtime.roundDoneResolver();
    }
  } else {
    // Already answered this round: keep channel clean
    await message.delete().catch(() => {});
  }

  return true;
}

/**
 * Triggered when a user clicks "✅ Estou Pronto"
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

  const { session } = runtime;
  const member = interaction.member as GuildMember | null;
  const displayName = member?.displayName || interaction.user.globalName || interaction.user.username;
  const spokenName = sanitizeForSpeech(displayName, 60);
  const avatarUrl = interaction.user.displayAvatarURL({ size: 256, extension: "png" });

  const alreadyReady = session.readyPlayers.some((p) => p.userId === interaction.user.id);
  if (!alreadyReady) {
    session.readyPlayers.push({
      userId: interaction.user.id,
      username: displayName,
      avatar: avatarUrl,
      readyAt: Date.now(),
    });
    emitCallGameBroadcastEvent({
      type: "lobby_ready_update",
      guildId: guild.id,
      players: session.readyPlayers.map((rp) => ({
        userId: rp.userId,
        username: rp.username,
        avatar: rp.avatar || null,
      })),
    });
  }

  addGameEvent(session, `✅ ${displayName} está pronto.`);

  const isOwner = interaction.user.id === session.ownerUserId;

  try {
    await interaction.update({
      embeds: [buildLobbyEmbed(session)],
      components: [buildLobbyComponents(session)],
    });
    await interaction
      .followUp({
        content: isOwner
          ? "👑 Você é o dono! Quando todos estiverem prontos na call, clique no seu botão privado abaixo para **Começar Tudo** e puxar todos para a call principal:"
          : alreadyReady
          ? "✅ Você já estava pronto! Anunciando novamente na call."
          : "✅ Você confirmou que está pronto! O bot está anunciando na call.",
        components: isOwner ? [buildOwnerPrivateControlRow(guild.id)] : [],
        ephemeral: true,
      })
      .catch(() => {});
  } catch {
    await interaction
      .reply({
        content: "✅ Você confirmou que está pronto! O bot está anunciando na call.",
        ephemeral: true,
      })
      .catch(() => {});
  }

  try {
    await speakInVoiceCall(
      guild.id,
      `O usuário ${spokenName} está pronto!`,
      session.voiceChannelId,
      session.voice,
      undefined,
      session.expression,
      {
        kind: "lobby_speech",
        displayText: `${displayName} está pronto!`,
      }
    );
  } catch (err) {
    addGameEvent(session, `Erro ao anunciar jogador pronto: ${(err as Error).message}`);
  }
}

/**
 * Triggered ONLY by the owner (1554257592015003674) clicking "👑 Começar Tudo"
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
        content: `🚫 **Botão privado!** Apenas o dono (<@${runtime.session.ownerUserId}>) pode clicar em **Começar Tudo**.`,
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
        content: `🚀 **Tudo iniciado!** Todos foram movidos para <#${updated.tempVoiceChannelId}> e cada jogador recebeu seu canal privado de respostas!`,
      })
      .catch(() => {});
  } catch (err) {
    await interaction
      .editReply({
        content: `❌ Erro ao iniciar partida: ${(err as Error).message}`,
      })
      .catch(() => {});
  }
}
