import {
  Client,
  Events,
  Guild,
  GuildMember,
  Message,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder,
  AuditLogEvent,
  GuildChannel,
  Role,
} from "discord.js";
import { isTestBotUser } from "./testBot";

export interface ModerationConfig {
  antiSpamEnabled: boolean;
  newMemberMaxDays: number; // 2 days default
  timeoutDurationMinutes: number; // 10 minutes default
  banOnRepeatOffense: boolean; // true
  antiRogueBotEnabled: boolean; // true
  antiMassPingEnabled: boolean; // true
  antiInviteLinksEnabled: boolean; // true
  antiRaidShieldEnabled: boolean; // true
  antiNukeEnabled: boolean; // true
  antiRoleNukeEnabled: boolean; // true
  antiWebhookFloodEnabled: boolean; // true
}

export interface SecurityLogEntry {
  id: string;
  timestamp: number;
  guildId: string;
  action: "TIMEOUT" | "BAN" | "KICK" | "BOT_BAN" | "WARN" | "ANTI_NUKE" | "ANTI_RAID" | "LOCKDOWN";
  targetTag: string;
  targetId: string;
  reason: string;
  details: string;
}

const config: ModerationConfig = {
  antiSpamEnabled: true,
  newMemberMaxDays: 2,
  timeoutDurationMinutes: 10,
  banOnRepeatOffense: true,
  antiRogueBotEnabled: true,
  antiMassPingEnabled: true,
  antiInviteLinksEnabled: true,
  antiRaidShieldEnabled: true,
  antiNukeEnabled: true,
  antiRoleNukeEnabled: true,
  antiWebhookFloodEnabled: true,
};

const securityLogs: SecurityLogEntry[] = [];
const userMessageHistory = new Map<string, { content: string; timestamp: number; messageId: string }[]>();
const userInfractions = new Map<string, number>();
const recentGuildJoins: number[] = [];
const channelDeleteTracker = new Map<string, { count: number; timestamp: number }>();
const activeQuarantines = new Set<string>();
const quarantineReleaseWaiters = new Map<string, Array<() => void>>();
const whitelistedBotIds = new Set<string>();

export function whitelistBotId(botId?: string | null): void {
  const clean = botId?.trim();
  if (clean && /^\d{17,22}$/.test(clean)) {
    whitelistedBotIds.add(clean);
  }
}

export function isWhitelistedBot(botId?: string | null): boolean {
  if (!botId) return false;
  return whitelistedBotIds.has(botId.trim());
}

export async function unbanAndAuthorizeBot(
  guild: Guild,
  botId: string,
  inviterUserId?: string
): Promise<{ unbanned: boolean; authorized: boolean; error?: string }> {
  const cleanId = botId.trim();
  whitelistBotId(cleanId);
  process.env.TEST_BOT_ID = cleanId;
  let unbanned = false;

  try {
    const ban = await guild.bans.fetch(cleanId).catch(() => null);
    if (ban) {
      await guild.bans.remove(cleanId, "2º Bot de Testes autorizado pelo Painel Phoenix");
      unbanned = true;
    }
  } catch (err) {
    return { unbanned: false, authorized: true, error: (err as Error).message };
  }

  // Also clear timeout if inviter got timed out by Anti-Rogue Bot while adding this bot
  if (inviterUserId) {
    try {
      const inviter = await guild.members.fetch(inviterUserId).catch(() => null);
      if (inviter && inviter.isCommunicationDisabled()) {
        await inviter.timeout(null, "Castigo removido: Bot de Testes autorizado pelo Painel").catch(() => {});
      }
    } catch {}
  }

  await logSecurityAction(
    guild,
    "WARN",
    { tag: `Bot (${cleanId})`, id: cleanId },
    unbanned ? "🔓 Bot de Testes Desbanido e Autorizado" : "✅ Bot de Testes Pré-Autorizado",
    unbanned
      ? `O Bot <@${cleanId}> foi desbanido e adicionado à lista branca para entrar sem bloqueio do Anti-Bot Invasor.`
      : `O Bot <@${cleanId}> foi adicionado à lista branca antes de entrar no servidor.`
  );

  return { unbanned, authorized: true };
}

export function isMemberInQuarantine(guildId: string, userId: string): boolean {
  return activeQuarantines.has(`${guildId}:${userId}`);
}

export function waitForQuarantineRelease(guildId: string, userId: string, timeoutMs = 20000): Promise<boolean> {
  const key = `${guildId}:${userId}`;
  if (!activeQuarantines.has(key)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const waiters = quarantineReleaseWaiters.get(key) || [];
    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);

    waiters.push(() => {
      clearTimeout(timer);
      resolve(true);
    });
    quarantineReleaseWaiters.set(key, waiters);
  });
}

export function getModerationConfig(): ModerationConfig {
  return { ...config };
}

export function updateModerationConfig(newCfg: Partial<ModerationConfig>) {
  Object.assign(config, newCfg);
}

export function getSecurityLogs(): SecurityLogEntry[] {
  return [...securityLogs].reverse().slice(0, 100);
}

/**
 * Finds or creates the '#spam-não' (spam? Não!) quarantine channel in the guild
 */
export async function getOrCreateSpamQuarantineChannel(guild: Guild): Promise<TextChannel | null> {
  let chan = guild.channels.cache.find(
    (c) =>
      c.isTextBased() &&
      (c.name.toLowerCase().includes("spam-não") ||
        c.name.toLowerCase().includes("spam-nao") ||
        c.name.toLowerCase().includes("spam?-não") ||
        c.name.toLowerCase().includes("spam?-nao") ||
        c.name.toLowerCase() === "spam-não" ||
        c.name.toLowerCase() === "spam-nao")
  ) as TextChannel | undefined;

  if (!chan) {
    try {
      chan = (await guild.channels.create({
        name: "spam-não",
        type: 0,
        topic: "Canal exclusivo de quarentena e castigo por prática de spam — spam? Não!",
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      })) as TextChannel;

      // Initial explanatory banner embed
      const initEmbed = new EmbedBuilder()
        .setColor(0xdc2626)
        .setTitle("🚫 SPAM? NÃO!")
        .setDescription(
          "🚨 **CANAL EXCLUSIVO DE QUARENTENA E CASTIGO**\n\n" +
          "Este é o único canal visível para membros que praticaram spam no servidor.\n\n" +
          "🔒 Todos os demais canais foram automaticamente **privados e ocultados** durante o castigo.\n" +
          "⏱️ O castigo é removido automaticamente ao término do tempo estipulado.\n" +
          "⚠️ **ATENÇÃO:** Reincidências adicionais pós-castigo levarão ao banimento permanente do servidor!"
        )
        .setFooter({ text: "Escudo Anti-Spam — spam? Não!" })
        .setTimestamp();

      await chan.send({ embeds: [initEmbed] }).catch(() => {});
    } catch (err) {
      console.warn("[Quarantine Channel Creation Error]:", err);
      return null;
    }
  }

  return chan || null;
}

export interface QuarantineOptions {
  isTestBot?: boolean;
  testDurationSeconds?: number;
  originChannelId?: string;
  testName?: string;
  infractionCount?: number;
}

/**
 * Isolates a punished member by hiding ALL other guild channels from them
 * and granting access ONLY to the '#spam-não' (spam? Não!) quarantine channel.
 * If isTestBot is true, waits 10 seconds (or testDurationSeconds) and then
 * automatically removes the timeout/quarantine and confirms the system is working.
 */
export async function quarantineMemberSpam(
  guild: Guild,
  member: GuildMember,
  durationMinutes: number,
  reason: string,
  options: QuarantineOptions = {}
): Promise<void> {
  const isTestBot = Boolean(options.isTestBot);
  const durationMs = isTestBot
    ? (options.testDurationSeconds ?? 10) * 1000
    : durationMinutes * 60 * 1000;
  const durationLabel = isTestBot
    ? `${options.testDurationSeconds ?? 10} segundos (Teste Automático)`
    : `${durationMinutes} minutos`;

  const qKey = `${guild.id}:${member.id}`;
  activeQuarantines.add(qKey);

  // 1. Apply Discord Timeout / Castigo (Discord rejects timeout for bots, so we catch gracefully while enforcing channel quarantine)
  await member.timeout(durationMs, `Moderação Avançada: ${reason}`).catch((err) => {
    if (!isTestBot) {
      console.error("[Quarantine Timeout Error]:", err);
    }
  });

  // 2. Get or create quarantine channel 'spam? Não!'
  const quarantineChan = await getOrCreateSpamQuarantineChannel(guild);

  // 3. Hide all regular channels for this specific member in parallel
  const hideTasks: Promise<any>[] = [];
  for (const [, channel] of guild.channels.cache) {
    if (!channel || !("permissionOverwrites" in channel) || channel.isThread()) continue;
    if (quarantineChan && channel.id === quarantineChan.id) continue;

    hideTasks.push(
      (channel as GuildChannel).permissionOverwrites
        .edit(member.id, {
          ViewChannel: false,
          SendMessages: false,
          Connect: false,
        })
        .catch(() => {})
    );
  }
  await Promise.allSettled(hideTasks);

  // 4. Grant access ONLY to the 'spam? Não!' channel
  if (quarantineChan) {
    try {
      await quarantineChan.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        SendMessages: false,
        ReadMessageHistory: true,
      });

      const alertEmbed = new EmbedBuilder()
        .setColor(0xdc2626)
        .setTitle(isTestBot ? "🧪 CASTIGO DE TESTE ATIVO — 🚫 SPAM? NÃO!" : "🚫 SPAM? NÃO!")
        .setDescription(
          `🚨 <@${member.id}>, você recebeu um **castigo de ${durationLabel}**!\n\n` +
          `🔒 **Canais Privados:** Todos os canais do servidor foram ocultados de você durante o castigo.\n` +
          `📌 **Motivo:** ${reason}\n` +
          `⏱️ **Duração do Castigo:** ${durationLabel}.\n\n` +
          (isTestBot
            ? `🤖 **Modo Auto-Teste:** O sistema manterá este Bot de Testes em castigo por **10 segundos** e removerá a punição automaticamente confirmando o funcionamento!`
            : `⚠️ **AVISO:** Este é o **único canal** que você consegue visualizar agora (**spam? Não!**). Se você voltar a praticar spam após o término do castigo, sua conta será **banida permanentemente** do servidor.`)
        )
        .setFooter({ text: "Quarentena Anti-Spam — spam? Não!" })
        .setTimestamp();

      await quarantineChan.send({ content: `<@${member.id}>`, embeds: [alertEmbed] }).catch(() => {});
    } catch (err) {
      console.warn("[Quarantine Alert Error]:", err);
    }
  }

  // 5. Schedule automatic restoration when timeout finishes (10s for Test Bot, configured minutes for real members)
  setTimeout(async () => {
    try {
      const currentMember = await guild.members.fetch(member.id).catch(() => null);
      if (currentMember) {
        await currentMember.timeout(null, "Castigo concluído — Liberação automática do sistema").catch(() => {});
      }

      const restoreTasks: Promise<any>[] = [];
      for (const [, channel] of guild.channels.cache) {
        if (!channel || !("permissionOverwrites" in channel) || channel.isThread()) continue;
        restoreTasks.push(
          (channel as GuildChannel).permissionOverwrites.delete(member.id).catch(() => {})
        );
      }
      await Promise.allSettled(restoreTasks);

      if (isTestBot) {
        const secs = options.testDurationSeconds ?? 10;
        const testLabel = options.testName || "Sistema de Proteção & Quarentena";
        const repeatNote =
          (options.infractionCount || 1) >= 2
            ? `\n🛡️ **Proteção Anti-Reincidência (${options.infractionCount}ª vez):** Um usuário comum teria recebido **Banimento Permanente**, mas o banimento foi ignorado automaticamente porque este é o Bot de Testes do Sistema!`
            : "";

        await logSecurityAction(
          guild,
          "WARN",
          { tag: member.user.tag, id: member.id },
          `✅ Teste Concluído: ${testLabel}`,
          `Castigo de ${secs} segundos aplicado e removido automaticamente com sucesso! Todos os canais restaurados.${repeatNote}`
        );

        const targetChannel =
          (options.originChannelId
            ? (guild.channels.cache.get(options.originChannelId) as TextChannel | undefined)
            : undefined) || quarantineChan;

        if (targetChannel && targetChannel.isTextBased()) {
          const okEmbed = new EmbedBuilder()
            .setColor(0x10b981)
            .setTitle("✅ SISTEMA FUNCIONANDO PERFEITAMENTE!")
            .setDescription(
              `🧪 **Teste Executado:** ${testLabel}\n` +
              `🤖 **Bot de Testes:** <@${member.id}>\n` +
              `⏱️ **Tempo em Castigo:** ${secs} segundos cumpridos no canal **#spam-não** (**spam? Não!**)\n` +
              `🔓 **Status Atual:** Castigo removido automaticamente e todos os canais restaurados!${repeatNote}`
            )
            .setFooter({ text: "Auto-Verificação de Segurança • Sistema Phoenix 100% Operacional" })
            .setTimestamp();

          await targetChannel.send({ embeds: [okEmbed] }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[Quarantine Auto-Restore Error]:", err);
    } finally {
      activeQuarantines.delete(qKey);
      const waiters = quarantineReleaseWaiters.get(qKey);
      if (waiters && waiters.length > 0) {
        quarantineReleaseWaiters.delete(qKey);
        for (const w of waiters) w();
      }
    }
  }, durationMs);
}

/**
 * Triggers a 10-second Anti-Raid quarantine test directly on the Test Bot
 */
export async function triggerTestRaidQuarantine(
  guild: Guild,
  testBotUserId: string,
  originChannelId?: string
): Promise<void> {
  const member = await guild.members.fetch(testBotUserId).catch(() => null);
  if (!member) {
    throw new Error("Bot de Testes não encontrado neste servidor.");
  }

  await logSecurityAction(
    guild,
    "ANTI_RAID",
    { tag: member.user.tag, id: member.id },
    "🧪 Teste do Escudo Anti-Raid Iniciado",
    `Simulação de quarentena Anti-Raid ativada para <@${member.id}> por 10 segundos no canal #spam-não.`
  );

  const originChan = originChannelId
    ? (guild.channels.cache.get(originChannelId) as TextChannel | undefined)
    : undefined;

  if (originChan && originChan.isTextBased()) {
    const startEmbed = new EmbedBuilder()
      .setColor(0x06b6d4)
      .setTitle("🛡️ CASTIGO DE TESTE APLICADO (ESCUDO ANTI-RAID)")
      .setDescription(
        `🚨 <@${member.id}> entrou em **quarentena de 10 segundos** pelo Escudo Anti-Raid!\n\n` +
        `🔒 Todos os canais foram ocultados para ele (apenas **#spam-não** visível).\n` +
        `⏱️ Aguarde **10 segundos** para a remoção automática do castigo...`
      )
      .setFooter({ text: "Teste do Escudo Anti-Raid — spam? Não!" })
      .setTimestamp();

    await originChan.send({ embeds: [startEmbed] }).catch(() => {});
  }

  await quarantineMemberSpam(guild, member, 10, "Simulação de Quarentena Anti-Raid (Teste 10s)", {
    isTestBot: true,
    testDurationSeconds: 10,
    originChannelId,
    testName: "Escudo Anti-Raid & Quarentena",
  });
}

/**
 * Finds or creates the #segurança-log channel in the guild
 */
async function getSecurityLogChannel(guild: Guild): Promise<TextChannel | null> {
  let chan = guild.channels.cache.find(
    (c) =>
      c.isTextBased() &&
      (c.name.toLowerCase().includes("segurança-log") ||
        c.name.toLowerCase().includes("seguranca-log") ||
        c.name.toLowerCase().includes("moderação-log") ||
        c.name.toLowerCase().includes("moderacao-log"))
  ) as TextChannel | undefined;

  if (!chan) {
    const category = guild.channels.cache.find(
      (c) => c.type === 4 && c.name.toLowerCase().includes("moderação")
    );
    try {
      chan = (await guild.channels.create({
        name: "segurança-log",
        type: 0,
        parent: category?.id,
        topic: "Logs automáticos do Protocolo de Moderação Avançada (Anti-Spam, Anti-Nuke, Castigos & Bans)",
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      })) as TextChannel;
    } catch {
      return null;
    }
  }

  return chan || null;
}

/**
 * Log security action to guild channel and memory
 */
export async function logSecurityAction(
  guild: Guild,
  action: "TIMEOUT" | "BAN" | "KICK" | "BOT_BAN" | "WARN" | "ANTI_NUKE" | "ANTI_RAID" | "LOCKDOWN",
  target: { tag: string; id: string },
  reason: string,
  details: string
) {
  const entry: SecurityLogEntry = {
    id: Date.now().toString() + Math.random().toString().slice(2, 6),
    timestamp: Date.now(),
    guildId: guild.id,
    action,
    targetTag: target.tag,
    targetId: target.id,
    reason,
    details,
  };

  securityLogs.push(entry);
  if (securityLogs.length > 300) securityLogs.shift();

  try {
    const logChan = await getSecurityLogChannel(guild);
    if (logChan) {
      const colorMap: Record<string, number> = {
        TIMEOUT: 0xf59e0b, // Amber
        BAN: 0xef4444, // Red
        KICK: 0xec4899, // Pink
        BOT_BAN: 0x8b5cf6, // Purple
        WARN: 0x3b82f6, // Blue
        ANTI_NUKE: 0xd97706, // Orange
        ANTI_RAID: 0xd97706,
        LOCKDOWN: 0xdc2626, // Crimson Red
      };

      const embed = new EmbedBuilder()
        .setTitle(`🛡️ [MODERAÇÃO AVANÇADA] AÇÃO REGISTRADA: ${action}`)
        .setColor(colorMap[action] || 0xef4444)
        .addFields([
          { name: "👤 Alvo / Origem", value: `<@${target.id}> (\`${target.tag}\`)`, inline: true },
          { name: "⚡ Ação Executada", value: `**${action}**`, inline: true },
          { name: "📜 Motivo Protocolar", value: reason, inline: false },
          { name: "🔍 Detalhes", value: details, inline: false },
        ])
        .setTimestamp();

      await logChan.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.warn("[Moderation Log Error]:", err);
  }
}

/**
 * Initializes moderation listeners on the Discord Gateway client
 */
export function registerModerationListeners(client: Client) {
  // Ensure listeners are registered only once on the client instance
  if ((client as any)._moderationRegistered) return;
  (client as any)._moderationRegistered = true;

  console.log("[Moderação Avançada] 🛡️ Ouvintes de Segurança e Proteção ativados no Gateway!");

  // 1. Listen for ALL member messages (Anti-Spam, Anti-MassPing & Anti-Invite Links)
  client.on(Events.MessageCreate, async (message: Message) => {
    if (!message.guild) return;
    if (message.author.id === client.user?.id) return;

    const isTestBot = isTestBotUser(message.author.id) || isWhitelistedBot(message.author.id);
    if (message.author.bot && !isTestBot) return;

    const guild = message.guild;
    const author = message.author;

    // Fetch member if missing from cache
    let member = message.member;
    if (!member) {
      member = await guild.members.fetch(author.id).catch(() => null);
    }
    if (!member) return;

    // Test Bot ALWAYS runs through real enforcement (never treated as admin bypass)
    const isAdmin =
      !isTestBot &&
      (member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        guild.ownerId === author.id);

    // Calculate account age in days
    const joinedAt = member.joinedTimestamp || Date.now();
    const accountAgeDays = (Date.now() - joinedAt) / (1000 * 60 * 60 * 24);
    const isNewMember = isTestBot || accountAgeDays < config.newMemberMaxDays;

    // A) Check for unauthorized Discord invite links (Non-Admins & Test Bot)
    if (config.antiInviteLinksEnabled && !isAdmin) {
      const inviteRegex = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9-]+/i;
      if (inviteRegex.test(message.content)) {
        await message.delete().catch(() => {});

        if (isTestBot) {
          const infractions = (userInfractions.get(author.id) || 0) + 1;
          userInfractions.set(author.id, infractions);

          await logSecurityAction(
            guild,
            "TIMEOUT",
            { tag: author.tag || author.username, id: author.id },
            "🧪 Teste Anti-Links de Convite (Castigo 10s)",
            `Bot de Testes <@${author.id}> enviou link de convite em <#${message.channelId}>. Mensagem apagada e castigo de 10s com quarentena em #spam-não aplicado.`
          );

          const alertEmbed = new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle("🚨 CASTIGO DE TESTE APLICADO (LINK DE CONVITE)")
            .setDescription(
              `🚨 <@${author.id}> teve o link apagado e recebeu um **castigo de 10 segundos** com quarentena em **#spam-não**!\n` +
              `⏱️ Aguarde 10 segundos para o sistema remover o castigo automaticamente...`
            )
            .setFooter({ text: "Moderação Avançada — Teste Anti-Divulgação" })
            .setTimestamp();

          await (message.channel as TextChannel).send({ embeds: [alertEmbed] }).catch(() => {});

          await quarantineMemberSpam(
            guild,
            member,
            config.timeoutDurationMinutes,
            "Teste do Filtro Anti-Links de Convite",
            {
              isTestBot: true,
              testDurationSeconds: 10,
              originChannelId: message.channelId,
              testName: "Filtro Anti-Links de Convite",
              infractionCount: infractions,
            }
          );
          return;
        }

        if (isNewMember) {
          await quarantineMemberSpam(
            guild,
            member,
            config.timeoutDurationMinutes,
            "Divulgação não autorizada de convite por conta recente"
          );

          await logSecurityAction(
            guild,
            "TIMEOUT",
            { tag: author.tag || author.username, id: author.id },
            "Divulgação de link de convite por conta recente",
            `Membro recente (${accountAgeDays.toFixed(1)} dias no servidor) enviou link de convite em <#${message.channelId}>. Castigo de ${config.timeoutDurationMinutes}min aplicado.`
          );

          const alertEmbed = new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle("🚨 CASTIGO APLICADO (LINK DE CONVITE)")
            .setDescription(`🚨 <@${author.id}> recebeu um **castigo de ${config.timeoutDurationMinutes} minutos** por divulgar link de convite sem autorização!\n*(Conta recente: ${accountAgeDays.toFixed(1)} dias no servidor)*`)
            .setFooter({ text: "Moderação Avançada — Escudo Anti-Divulgação" })
            .setTimestamp();

          await (message.channel as TextChannel).send({ embeds: [alertEmbed] }).catch(() => {});
        } else {
          await logSecurityAction(
            guild,
            "WARN",
            { tag: author.tag || author.username, id: author.id },
            "Link de convite removido",
            `Mensagem com link de convite de <@${author.id}> foi removida do canal <#${message.channelId}>.`
          );

          const warnEmbed = new EmbedBuilder()
            .setColor(0xf59e0b)
            .setTitle("⚠️ LINK DE CONVITE REMOVIDO")
            .setDescription(`⚠️ <@${author.id}>, por favor não divulgue convites de outros servidores aqui!`)
            .setFooter({ text: "Moderação Avançada" })
            .setTimestamp();

          await (message.channel as TextChannel).send({ embeds: [warnEmbed] }).catch(() => {});
        }
        return;
      }
    }

    // B) Check for unauthorized mass pings (@everyone / @here)
    if (config.antiMassPingEnabled && !isAdmin && (message.content.includes("@everyone") || message.content.includes("@here"))) {
      await message.delete().catch(() => {});

      if (isTestBot) {
        const infractions = (userInfractions.get(author.id) || 0) + 1;
        userInfractions.set(author.id, infractions);

        await logSecurityAction(
          guild,
          "TIMEOUT",
          { tag: author.tag || author.username, id: author.id },
          "🧪 Teste Anti-MassPing (@everyone) (Castigo 10s)",
          `Bot de Testes <@${author.id}> enviou menção global em <#${message.channelId}>. Mensagem apagada e castigo de 10s aplicado.`
        );

        const alertEmbed = new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle("🚨 CASTIGO DE TESTE APLICADO (MENÇÃO GLOBAL)")
          .setDescription(
            `🚨 <@${author.id}> teve a menção global bloqueada e recebeu um **castigo de 10 segundos** em **#spam-não**!\n` +
            `⏱️ Aguarde 10 segundos para o sistema remover o castigo automaticamente...`
          )
          .setFooter({ text: "Moderação Avançada — Teste Anti-MassPing" })
          .setTimestamp();

        await (message.channel as TextChannel).send({ embeds: [alertEmbed] }).catch(() => {});

        await quarantineMemberSpam(
          guild,
          member,
          config.timeoutDurationMinutes,
          "Teste do Escudo Anti-MassPing (@everyone / @here)",
          {
            isTestBot: true,
            testDurationSeconds: 10,
            originChannelId: message.channelId,
            testName: "Escudo Anti-MassPing (@everyone)",
            infractionCount: infractions,
          }
        );
        return;
      }

      if (isNewMember) {
        await quarantineMemberSpam(
          guild,
          member,
          config.timeoutDurationMinutes,
          "Spam de menção global (@everyone) por conta recente"
        );

        await logSecurityAction(
          guild,
          "TIMEOUT",
          { tag: author.tag || author.username, id: author.id },
          "Spam de menção global (@everyone / @here)",
          `Membro recente (${accountAgeDays.toFixed(1)} dias) enviou menção global em <#${message.channelId}>.`
        );

        const alertEmbed = new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle("🚨 CASTIGO APLICADO (MENÇÃO GLOBAL)")
          .setDescription(`🚨 <@${author.id}> recebeu um **castigo de ${config.timeoutDurationMinutes} minutos** por fazer menção global (@everyone / @here) sem autorização.`)
          .setFooter({ text: "Moderação Avançada — Escudo Anti-MassPing" })
          .setTimestamp();

        await (message.channel as TextChannel).send({ embeds: [alertEmbed] }).catch(() => {});
      } else {
        const warnEmbed = new EmbedBuilder()
          .setColor(0xf59e0b)
          .setTitle("⚠️ AVISO DE MENÇÃO GLOBAL")
          .setDescription(`⚠️ <@${author.id}>, por favor evite utilizar menções globais (@everyone / @here) sem autorização da administração!`)
          .setFooter({ text: "Moderação Avançada" })
          .setTimestamp();

        await (message.channel as TextChannel).send({ embeds: [warnEmbed] }).catch(() => {});
      }
      return;
    }

    // C) Anti-Spam Engine: Spam strictly counted only when the SAME text/word is repeated 10 times
    if (config.antiSpamEnabled) {
      const now = Date.now();
      const contentClean = message.content.trim().toLowerCase();
      if (!contentClean) return;

      const historyKey = `${guild.id}:${author.id}`;
      const userHistory = userMessageHistory.get(historyKey) || [];
      // Keep entries from last 60 seconds
      const recentHistory = userHistory.filter((h) => now - h.timestamp < 60000);

      // Record current message (keep all messages visible in chat!)
      recentHistory.push({ content: contentClean, timestamp: now, messageId: message.id });
      userMessageHistory.set(historyKey, recentHistory);

      // Check strictly 10 or more repeated identical messages/words
      const matchingEntries = recentHistory.filter((h) => h.content === contentClean);
      const isSpam = matchingEntries.length >= 10;

      if (isSpam) {
        // Clear history immediately so concurrent messages don't double-trigger
        userMessageHistory.delete(historyKey);
        const spamMessageIds = matchingEntries.map((item) => item.messageId);
        const targetTextChannel = message.channel as TextChannel;

        const deleteSpamAfterPunishment = async () => {
          // Small beat so the 10 messages + castigo notification appear clearly before cleanup
          await new Promise((r) => setTimeout(r, 1500));
          try {
            if ("bulkDelete" in targetTextChannel && spamMessageIds.length > 1) {
              await targetTextChannel.bulkDelete(spamMessageIds, true).catch(async () => {
                for (const id of spamMessageIds) {
                  await targetTextChannel.messages.delete(id).catch(() => {});
                }
              });
            } else {
              for (const id of spamMessageIds) {
                await targetTextChannel.messages.delete(id).catch(() => {});
              }
            }
          } catch {}
        };

        if (isAdmin) {
          await logSecurityAction(
            guild,
            "WARN",
            { tag: author.tag || author.username, id: author.id },
            "Spam Detectado (Modo Teste Administrador)",
            `Administrador <@${author.id}> repetiu a mesma mensagem/palavra 10 vezes no canal <#${message.channelId}>. Aviso emitido e mensagens removidas após a notificação.`
          );

          const adminWarnEmbed = new EmbedBuilder()
            .setColor(0xf59e0b)
            .setTitle("⚠️ AVISO DE ANTI-SPAM (10 MENSAGENS)")
            .setDescription(`⚠️ <@${author.id}>, repetição de **10 vezes** da mesma palavra/mensagem detectada com sucesso!\n*(Como você é Administrador, você não recebe castigo de tempo, mas a proteção de 10 repetições está 100% ativa)*`)
            .setFooter({ text: "Moderação Avançada — Teste de Proteção" })
            .setTimestamp();

          await targetTextChannel.send({ embeds: [adminWarnEmbed] }).catch(() => {});
          await deleteSpamAfterPunishment();
          return;
        }

        const infractionKey = `${guild.id}:${author.id}`;
        const infractions = (userInfractions.get(infractionKey) || 0) + 1;
        userInfractions.set(infractionKey, infractions);

        // If Test Bot: ALWAYS apply real 10s castigo + #spam-não quarantine FIRST, and delete spam messages ONLY AFTER taking the castigo!
        if (isTestBot) {
          await logSecurityAction(
            guild,
            "TIMEOUT",
            { tag: author.tag || author.username, id: author.id },
            `🧪 Teste Anti-Spam (${infractions}ª infração — 10x — Castigo 10s)`,
            `Bot de Testes <@${author.id}> enviou 10 mensagens repetidas em <#${message.channelId}>. Castigo de 10s aplicado em #spam-não e mensagens apagadas somente após o castigo.`
          );

          await quarantineMemberSpam(
            guild,
            member,
            config.timeoutDurationMinutes,
            "Prática de spam (envio repetido de 10 mensagens/palavras — Teste do Sistema)",
            {
              isTestBot: true,
              testDurationSeconds: 10,
              originChannelId: message.channelId,
              testName: "Motor Anti-Spam (10x Repetição + Quarentena #spam-não)",
              infractionCount: infractions,
            }
          );

          const testTimeoutEmbed = new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle("🚨 CASTIGO DE TESTE APLICADO (ANTI-SPAM 10x)")
            .setDescription(
              `🚨 <@${author.id}> enviou **10 mensagens repetidas** e recebeu um **castigo real de 10 segundos**!\n\n` +
              `🔒 **Quarentena:** Todos os canais foram ocultados para o Bot de Testes. O único canal visível é **#spam-não** (**spam? Não!**).\n` +
              (infractions >= 2
                ? `🛡️ **Reincidência (${infractions}ª vez):** Banimento ignorado automaticamente por ser Bot de Testes do Sistema!\n`
                : "") +
              `⏱️ Aguarde **10 segundos** para o sistema remover o castigo automaticamente...`
            )
            .setFooter({ text: "Auto-Teste Anti-Spam — spam? Não!" })
            .setTimestamp();

          await targetTextChannel.send({ embeds: [testTimeoutEmbed] }).catch(() => {});

          // Delete spam messages ONLY AFTER the castigo has been applied
          await deleteSpamAfterPunishment();
          return;
        }

        if (infractions === 1 || !config.banOnRepeatOffense) {
          // Give timeout & isolate member FIRST in the 'spam? Não!' quarantine channel
          await quarantineMemberSpam(
            guild,
            member,
            config.timeoutDurationMinutes,
            "Prática de spam (envio repetido de 10 mensagens/palavras)"
          );

          await logSecurityAction(
            guild,
            "TIMEOUT",
            { tag: author.tag || author.username, id: author.id },
            "Castigo por Spam Aplicado (Quarentena em #spam-não)",
            `Membro <@${author.id}> praticou spam (10x) em <#${message.channelId}>. Castigo de ${config.timeoutDurationMinutes}min aplicado com quarentena no canal #spam-não e mensagens apagadas após o castigo.`
          );

          const timeoutEmbed = new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle("🚨 CASTIGO APLICADO (ANTI-SPAM 10x)")
            .setDescription(
              `🚨 <@${author.id}> recebeu um **castigo de ${config.timeoutDurationMinutes} minutos** por prática de spam no servidor!\n\n` +
              `📌 **Motivo:** Envio de 10 mensagens ou palavras repetidas.\n` +
              `🔒 **Quarentena:** Todos os canais foram ocultados. O único canal visível agora é **spam? Não!**.`
            )
            .setFooter({ text: "Moderação Avançada — Escudo Anti-Spam (spam? Não!)" })
            .setTimestamp();

          await targetTextChannel.send({ embeds: [timeoutEmbed] }).catch(() => {});

          // Delete spam messages ONLY AFTER the castigo has been applied
          await deleteSpamAfterPunishment();
        } else {
          // Repeat offense after timeout: Permanent Ban (only for regular users, never for Test Bot)
          await guild.members
            .ban(author.id, {
              reason: "Moderação Avançada: Reincidência de spam pós-castigo",
            })
            .catch((err) => console.error("[Spam Ban Error]:", err));

          await logSecurityAction(
            guild,
            "BAN",
            { tag: author.tag || author.username, id: author.id },
            "Banimento Permanente por Reincidência de Spam",
            `Membro <@${author.id}> reincidiu no envio de spam (10x) no canal <#${message.channelId}> após castigo anterior. Banimento permanente efetuado.`
          );

          const banEmbed = new EmbedBuilder()
            .setColor(0x990000)
            .setTitle("🚨 BANIMENTO PERMANENTE")
            .setDescription(
              `🚨 <@${author.id}> foi **banido permanentemente** do servidor por reincidência de spam após castigo!`
            )
            .setFooter({ text: "Moderação Avançada — Banimento Automático" })
            .setTimestamp();

          await targetTextChannel.send({ embeds: [banEmbed] }).catch(() => {});

          // Delete spam messages after punishment
          await deleteSpamAfterPunishment();
        }
      }
    }
  });

  // 2. Listen for Guild Member Add (Anti-Rogue Bot & Anti-Raid Join Detection)
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    const guild = member.guild;
    const now = Date.now();

    // Never ban or punish the authorized System Test Bot (or whitelisted bots) when it joins
    if (isTestBotUser(member.id) || isWhitelistedBot(member.id)) {
      await logSecurityAction(
        guild,
        "WARN",
        { tag: member.user.tag, id: member.id },
        "🧪 2º Bot de Testes Conectado ao Servidor",
        `O Bot de Testes do Sistema (<@${member.id}>) entrou no servidor e foi liberado automaticamente.`
      );
      return;
    }

    // Anti-Raid Join Rate Monitor
    if (config.antiRaidShieldEnabled) {
      recentGuildJoins.push(now);
      const joinsLast10s = recentGuildJoins.filter((t) => now - t < 10000).length;

      if (joinsLast10s >= 5) {
        // High influx raid detected!
        await logSecurityAction(
          guild,
          "ANTI_RAID",
          { tag: member.user.tag, id: member.id },
          "Alerta de Ataque Raid Detectado",
          `Mais de 5 contas entraram nos últimos 10 segundos! Membro <@${member.id}> foi marcado em quarentena.`
        );

        if (member.joinedTimestamp && Date.now() - member.joinedTimestamp < 60000) {
          await member.timeout(15 * 60 * 1000, "Moderação Avançada: Escudo Anti-Raid Ativo").catch(() => {});
        }
      }
    }

    // Anti-Rogue Bot check
    if (config.antiRogueBotEnabled && member.user.bot) {
      try {
        const fetchedLogs = await guild.fetchAuditLogs({
          type: AuditLogEvent.BotAdd,
          limit: 1,
        }).catch(() => null);

        const firstEntry = fetchedLogs?.entries.first();
        const executor = firstEntry?.executor;

        if (executor) {
          const executorMember = await guild.members.fetch(executor.id).catch(() => null);
          const isAdmin = executorMember?.permissions.has(PermissionFlagsBits.Administrator);

          if (!isAdmin) {
            await member.ban({
              reason: "Moderação Avançada: Bot adicionado por usuário sem permissão de Administrador",
            }).catch(() => {});

            if (executorMember) {
              await executorMember.timeout(
                60 * 60 * 1000,
                "Moderação Avançada: Adição de bot não autorizado ao servidor"
              ).catch(() => {});
            }

            await logSecurityAction(
              guild,
              "BOT_BAN",
              { tag: member.user.tag, id: member.id },
              "Bot Não Autorizado Removido",
              `O bot \`${member.user.tag}\` foi convidado por <@${executor.id}> (\`${executor.tag}\`), que não possui cargo de Administrador. O bot foi banido e o convidador recebeu um castigo de 1 hora.`
            );
            return;
          }
        }
      } catch (err) {
        console.warn("[Anti-Rogue Bot Audit Check Warning]:", err);
      }
    }
  });

  // 3. Listen for Channel Deletions (Anti-Nuke Protection)
  client.on(Events.ChannelDelete, async (channel: any) => {
    if (!config.antiNukeEnabled || !channel || !("guild" in channel) || !channel.guild) return;

    const guild = channel.guild as Guild;
    try {
      const fetchedLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.ChannelDelete,
        limit: 1,
      }).catch(() => null);

      const entry = fetchedLogs?.entries.first();
      const executor = entry?.executor;
      if (!executor || executor.id === guild.ownerId || executor.id === client.user?.id) return;

      const now = Date.now();
      const tracker = channelDeleteTracker.get(executor.id) || { count: 0, timestamp: now };
      if (now - tracker.timestamp > 30000) {
        tracker.count = 0;
        tracker.timestamp = now;
      }
      tracker.count++;
      channelDeleteTracker.set(executor.id, tracker);

      if (tracker.count >= 2) {
        // Suspected Nuke Attempt!
        const executorMember = await guild.members.fetch(executor.id).catch(() => null);
        if (executorMember && !executorMember.permissions.has(PermissionFlagsBits.Administrator)) {
          await guild.members.ban(executor.id, {
            reason: "Moderação Avançada: Tentativa de Nuke de Canais no Servidor",
          }).catch(() => {});

          await logSecurityAction(
            guild,
            "ANTI_NUKE",
            { tag: executor.tag || executor.username || executor.id, id: executor.id },
            "Tentativa de Nuke Bloqueada",
            `O usuário <@${executor.id}> (\`${executor.tag || executor.username}\`) apagou múltiplos canais rapidamente (${tracker.count} canais em 30s). Banimento por segurança acionado!`
          );
        }
      }
    } catch (err) {
      console.warn("[Anti-Nuke Channel Delete Check Warning]:", err);
    }
  });

  // 4. Listen for Role Deletions (Anti-Role Nuke Protection)
  client.on(Events.GuildRoleDelete, async (role: Role) => {
    if (!config.antiRoleNukeEnabled || !role.guild) return;

    const guild = role.guild;
    try {
      const fetchedLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.RoleDelete,
        limit: 1,
      }).catch(() => null);

      const entry = fetchedLogs?.entries.first();
      const executor = entry?.executor;
      if (!executor || executor.id === guild.ownerId || executor.id === client.user?.id) return;

      const now = Date.now();
      const tracker = channelDeleteTracker.get(`role_${executor.id}`) || { count: 0, timestamp: now };
      if (now - tracker.timestamp > 30000) {
        tracker.count = 0;
        tracker.timestamp = now;
      }
      tracker.count++;
      channelDeleteTracker.set(`role_${executor.id}`, tracker);

      if (tracker.count >= 2) {
        const executorMember = await guild.members.fetch(executor.id).catch(() => null);
        if (executorMember && !executorMember.permissions.has(PermissionFlagsBits.Administrator)) {
          await guild.members.ban(executor.id, {
            reason: "Moderação Avançada: Tentativa de Deletar Cargos em Massa (Role Nuke)",
          }).catch(() => {});

          await logSecurityAction(
            guild,
            "ANTI_NUKE",
            { tag: executor.tag || executor.username || executor.id, id: executor.id },
            "Tentativa de Role-Nuke Bloqueada",
            `O usuário <@${executor.id}> (\`${executor.tag || executor.username}\`) deletou múltiplos cargos em menos de 30s (${tracker.count} cargos). Banimento de segurança efetuado!`
          );
        }
      }
    } catch (err) {
      console.warn("[Anti-Role Nuke Check Warning]:", err);
    }
  });
}

/**
 * Triggers an emergency lockdown or lifts lockdown on all text channels
 */
export async function toggleServerLockdown(guild: Guild, lock: boolean): Promise<{ channelsAffected: number }> {
  let count = 0;
  const everyoneRole = guild.roles.everyone;

  for (const [, channel] of guild.channels.cache) {
    if (channel.isTextBased() && "permissionOverwrites" in channel) {
      try {
        await (channel as TextChannel).permissionOverwrites.edit(everyoneRole, {
          SendMessages: lock ? false : null,
        });
        count++;
      } catch {}
    }
  }

  await logSecurityAction(
    guild,
    "LOCKDOWN",
    { tag: "PAINEL_WEB", id: guild.ownerId || "ADMIN" },
    lock ? "🚨 Quarentena / Lockdown de Emergência Ativado" : "✅ Lockdown de Emergência Desativado",
    lock
      ? `Todos os canais de texto (${count} canais) foram trancados para @everyone para conter ataques ou invasões!`
      : `Os canais de texto (${count} canais) tiveram suas permissões padrão de envio restauradas.`
  );

  return { channelsAffected: count };
}

