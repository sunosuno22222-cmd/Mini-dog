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
const userMessageHistory = new Map<string, { content: string; timestamp: number }[]>();
const userInfractions = new Map<string, number>();
const recentGuildJoins: number[] = [];
const channelDeleteTracker = new Map<string, { count: number; timestamp: number }>();

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
  // 1. Listen for new member messages (Anti-Spam, Anti-MassPing & Anti-Invite Links)
  client.on(Events.MessageCreate, async (message: Message) => {
    if (!message.guild || message.author.bot || !config.antiSpamEnabled) return;

    const guild = message.guild;
    const author = message.author;
    const member = message.member;
    if (!member) return;

    // Check member join age
    const joinedAt = member.joinedTimestamp || Date.now();
    const accountAgeDays = (Date.now() - joinedAt) / (1000 * 60 * 60 * 24);
    const isNewMember = accountAgeDays < config.newMemberMaxDays;

    // Check for Discord invite links sent by new members
    if (config.antiInviteLinksEnabled && isNewMember) {
      const inviteRegex = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9]+/i;
      if (inviteRegex.test(message.content)) {
        await message.delete().catch(() => {});
        const timeoutMs = config.timeoutDurationMinutes * 60 * 1000;
        await member.timeout(timeoutMs, "Moderação Avançada: Divulgação não autorizada de link de convite por conta recente").catch(() => {});

        await logSecurityAction(
          guild,
          "TIMEOUT",
          { tag: author.tag, id: author.id },
          "Divulgação de link de convite por conta recente",
          `Membro recente (${accountAgeDays.toFixed(1)} dias no servidor) tentou enviar link de convite no canal <#${message.channelId}>. Aplicado castigo de ${config.timeoutDurationMinutes} minutos.`
        );

        await (message.channel as TextChannel)
          .send({
            content: `🚨 <@${author.id}> recebeu um **castigo de ${config.timeoutDurationMinutes} minutos** por divulgação de link não autorizada.`,
          })
          .catch(() => {});
        return;
      }
    }

    // Check for mass ping spam by non-admins
    if (config.antiMassPingEnabled && (message.content.includes("@everyone") || message.content.includes("@here"))) {
      const isAdmin =
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.MentionEveryone);

      if (!isAdmin && isNewMember) {
        await message.delete().catch(() => {});
        const timeoutMs = config.timeoutDurationMinutes * 60 * 1000;
        await member.timeout(timeoutMs, "Moderação Avançada: Spam de menção global (@everyone) por membro recente").catch(() => {});

        await logSecurityAction(
          guild,
          "TIMEOUT",
          { tag: author.tag, id: author.id },
          "Spam de menção global (@everyone / @here)",
          `Membro recente (${accountAgeDays.toFixed(1)} dias no servidor) tentou enviar menção global no canal <#${message.channelId}>.`
        );

        await (message.channel as TextChannel)
          .send({
            content: `🚨 <@${author.id}> recebeu um **castigo de ${config.timeoutDurationMinutes} minutos** por menção desautorizada no servidor.`,
          })
          .catch(() => {});
        return;
      }
    }

    // Anti-Spam check for new members (< 2 days)
    if (isNewMember) {
      const now = Date.now();
      const contentClean = message.content.trim().toLowerCase();
      if (!contentClean || contentClean.length < 3) return;

      const userHistory = userMessageHistory.get(author.id) || [];
      const recentHistory = userHistory.filter((h) => now - h.timestamp < 35000);

      // Check duplicate messages
      const duplicateCount = recentHistory.filter((h) => h.content === contentClean).length;

      // Check rapid spam (> 4 messages in 4 seconds)
      const rapidSpamCount = recentHistory.filter((h) => now - h.timestamp < 4000).length;

      recentHistory.push({ content: contentClean, timestamp: now });
      userMessageHistory.set(author.id, recentHistory);

      if (duplicateCount >= 2 || rapidSpamCount >= 4) {
        await message.delete().catch(() => {});

        const infractions = (userInfractions.get(author.id) || 0) + 1;
        userInfractions.set(author.id, infractions);

        if (infractions === 1 || !config.banOnRepeatOffense) {
          const timeoutMs = config.timeoutDurationMinutes * 60 * 1000;
          await member.timeout(timeoutMs, "Moderação Avançada: Spam por membro novo (< 2 dias)").catch(() => {});

          await logSecurityAction(
            guild,
            "TIMEOUT",
            { tag: author.tag, id: author.id },
            "Spam de mensagens por membro recente",
            `Membro (${accountAgeDays.toFixed(1)} dias no servidor) enviou mensagens repetidas no canal <#${message.channelId}>. Aplicado castigo de ${config.timeoutDurationMinutes} minutos.`
          );

          await (message.channel as TextChannel)
            .send({
              content: `⚠️ <@${author.id}> recebeu um **castigo de 10 minutos** por prática de spam. (Conta com menos de 2 dias no servidor)`,
            })
            .catch(() => {});
        } else {
          await guild.members.ban(author.id, {
            reason: "Moderação Avançada: Reincidência de Spam por membro novo pós-castigo",
          }).catch(() => {});

          await logSecurityAction(
            guild,
            "BAN",
            { tag: author.tag, id: author.id },
            "Banimento Permanente por Reincidência de Spam",
            `Membro reincidiu no envio de spam no canal <#${message.channelId}> após ter recebido castigo anterior. Banimento permanente efetuado.`
          );

          await (message.channel as TextChannel)
            .send({
              content: `🚨 <@${author.id}> foi **banido permanentemente** por reincidência de spam no servidor.`,
            })
            .catch(() => {});
        }
      }
    }
  });

  // 2. Listen for Guild Member Add (Anti-Rogue Bot & Anti-Raid Join Detection)
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    const guild = member.guild;
    const now = Date.now();

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

