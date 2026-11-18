import {
  ChannelType,
  Guild,
  PermissionsBitField,
  TextChannel,
} from 'discord.js';
import { getBotClient } from './bot.ts';
import { ensureRegistrationLoginSystem } from './guildSync.ts';
import { ensureExpPanelForGuild } from './expCommands.ts';
import { ensureMuralPanelsForGuild } from './commands.ts';
import { getOrCreateSpamQuarantineChannel } from './moderation.ts';
import { buildIpPanelMessage, buildSupportPanelMessage } from './tickets.ts';
import { normalizeDiscordName } from './channelUtils.ts';

export interface ResendOutcome {
  success: boolean;
  guildId: string;
  guildName: string;
  botNicknameUpdated: boolean;
  messagesSent: { channelId: string; channelName: string; type: string }[];
  errors: string[];
}

export async function resendAllChannelMessages(targetGuildId?: string): Promise<ResendOutcome> {
  const client = getBotClient();
  if (!client || !client.isReady()) {
    throw new Error('Bot Discord não está conectado no Gateway.');
  }

  let guild: Guild | undefined;
  if (targetGuildId) {
    guild = client.guilds.cache.get(targetGuildId) || (await client.guilds.fetch(targetGuildId).catch(() => undefined));
  } else {
    guild = client.guilds.cache.first();
  }

  if (!guild) {
    throw new Error('Servidor Discord não encontrado no bot.');
  }

  const messagesSent: { channelId: string; channelName: string; type: string }[] = [];
  const errors: string[] = [];

  // 1. Update Bot Nickname to 5573 Satan in the server
  let botNicknameUpdated = false;
  try {
    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (me && me.permissions.has(PermissionsBitField.Flags.ChangeNickname)) {
      await me.setNickname('5573 Satan', 'Atualização oficial de identidade do bot');
      botNicknameUpdated = true;
    }
  } catch (err) {
    console.warn('[Resender] Falha ao atualizar apelido do bot:', err);
  }

  await guild.channels.fetch().catch(() => {});

  // 2. Reenviar Registro de Acesso (Ele / Ela)
  try {
    await ensureRegistrationLoginSystem(guild, true);
    messagesSent.push({ channelId: 'registro', channelName: 'Registro / Acesso', type: 'Painel Ele/Ela (5573 Satan)' });
  } catch (err) {
    errors.push(`Registro: ${(err as Error).message}`);
  }

  // 3. Reenviar Painel de Suporte (Ticket)
  try {
    let supportChannel: TextChannel | undefined;
    for (const ch of guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildText) continue;
      const norm = normalizeDiscordName(ch.name);
      if (norm.includes('suporte') || norm.includes('sprt') || norm.includes('ajuda') || norm.includes('ticket')) {
        supportChannel = ch as TextChannel;
        break;
      }
    }

    if (supportChannel) {
      const panel = buildSupportPanelMessage();
      await supportChannel.send(panel);
      messagesSent.push({ channelId: supportChannel.id, channelName: supportChannel.name, type: 'Painel de Suporte (5573 Satan)' });
    }
  } catch (err) {
    errors.push(`Suporte: ${(err as Error).message}`);
  }

  // 4. Reenviar Painel Olho do Diabo / Consulta de IP
  try {
    let ipChannel: TextChannel | undefined;
    for (const ch of guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildText) continue;
      const norm = normalizeDiscordName(ch.name);
      if (norm.includes('olho') || norm.includes('diabo') || norm.includes('bscr-ip') || norm.includes('buscar-ip')) {
        ipChannel = ch as TextChannel;
        break;
      }
    }
    if (!ipChannel) {
      for (const ch of guild.channels.cache.values()) {
        if (ch.type !== ChannelType.GuildText) continue;
        const norm = normalizeDiscordName(ch.name);
        if (/(?:^|[^a-z])ip(?:[^a-z]|$)/.test(norm) || norm.includes('consulta')) {
          ipChannel = ch as TextChannel;
          break;
        }
      }
    }

    if (ipChannel) {
      const panel = buildIpPanelMessage();
      await ipChannel.send(panel);
      messagesSent.push({ channelId: ipChannel.id, channelName: ipChannel.name, type: 'Painel Olho do Diabo (5573 Satan)' });
    }
  } catch (err) {
    errors.push(`Olho do Diabo / IP: ${(err as Error).message}`);
  }

  // 5. Reenviar Painel EXP (#exp)
  try {
    await ensureExpPanelForGuild(guild);
    messagesSent.push({ channelId: 'exp', channelName: '#exp', type: 'Painel Exponha uma Ocorrência (5573 Satan)' });
  } catch (err) {
    errors.push(`EXP: ${(err as Error).message}`);
  }

  // 6. Reenviar Murais & Recurso
  try {
    await ensureMuralPanelsForGuild(guild);
    messagesSent.push({ channelId: 'mural', channelName: '#pedir-mural / #chorar', type: 'Painéis de Mural & Recurso' });
  } catch (err) {
    errors.push(`Murais: ${(err as Error).message}`);
  }

  // 7. Canal de Quarentena Anti-Spam (spam? Não!)
  try {
    const qChan = await getOrCreateSpamQuarantineChannel(guild);
    if (qChan) {
      messagesSent.push({ channelId: qChan.id, channelName: qChan.name, type: 'Canal de Quarentena Anti-Spam' });
    }
  } catch (err) {
    errors.push(`Quarentena: ${(err as Error).message}`);
  }

  return {
    success: messagesSent.length > 0,
    guildId: guild.id,
    guildName: guild.name,
    botNicknameUpdated,
    messagesSent,
    errors,
  };
}
