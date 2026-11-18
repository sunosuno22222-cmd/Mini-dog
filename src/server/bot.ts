import fs from 'node:fs';
import {
  AttachmentBuilder,
  ChannelType,
  Client,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  PermissionsBitField,
  REST,
  Routes,
  type Guild,
  type GuildMember,
  type PartialGuildMember,
} from 'discord.js';
import {
  getGuildConfig,
  hasSavedGuildConfig,
  saveGuildConfig,
  type BannerEventType,
} from './configStore.ts';
import {
  ensureMuralPanelsForGuild,
  handleMuralButtonInteraction,
  handleMuralModalInteraction,
  handleMuralSelectInteraction,
} from './commands.ts';
import {
  ensureExpPanelForGuild,
  handleExpButtonInteraction,
  handleExpModalInteraction,
} from './expCommands.ts';
import { renderWelcomeBanner } from './welcomeRenderer.ts';
import { isGuildTextOrAnnouncement, normalizeDiscordName } from './channelUtils.ts';
import {
  assignMemberRoleOnJoin,
  handleRegistrationButtonInteraction,
  runFullGuildSync,
} from './guildSync.ts';

export interface BotStatus {
  configured: boolean;
  connected: boolean;
  botTag: string | null;
  botId: string | null;
  guildCount: number;
  error: string | null;
}

let discordClient: Client | null = null;
let botConnectionError: string | null = null;
let botReady = false;
let reconnectPromise: Promise<BotStatus> | null = null;

export async function clearAllSlashCommands(
  applicationId: string,
  token: string,
  extraGuildIds: string[] = [],
): Promise<{ clearedGlobal: boolean; clearedGuilds: number }> {
  if (!applicationId || !token) {
    return { clearedGlobal: false, clearedGuilds: 0 };
  }

  const rest = new REST({ version: '10' }).setToken(token);
  let clearedGlobal = false;
  let clearedGuilds = 0;

  try {
    await rest.put(Routes.applicationCommands(applicationId), { body: [] });
    clearedGlobal = true;
  } catch (err) {
    console.warn('[Discord Bot] Aviso ao limpar comandos globais:', (err as Error).message);
  }

  const guildIds = new Set<string>(extraGuildIds.filter(Boolean));
  try {
    const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?limit=200', {
      headers: { Authorization: `Bot ${token}` },
    });
    if (resp.ok) {
      const guilds = (await resp.json()) as Array<{ id: string }>;
      for (const g of guilds) {
        if (g?.id) guildIds.add(g.id);
      }
    }
  } catch {
    // Ignore transient REST failure
  }

  for (const guildId of guildIds) {
    try {
      await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: [] });
      clearedGuilds += 1;
    } catch {
      // Ignore guild command clearing failure
    }
  }

  console.log(
    `[Discord Bot] Comandos slash (/) removidos: global=${clearedGlobal}, servidores=${clearedGuilds}.`,
  );
  return { clearedGlobal, clearedGuilds };
}

export async function ensureOlhoDoDiaboPanelForGuild(
  guild: Guild,
  forceSend = false,
): Promise<{ sent: boolean; channelId?: string; messageId?: string; reason?: string }> {
  try {
    if (guild.channels.cache.size === 0) {
      await guild.channels.fetch().catch(() => null);
    }

    const textChannels = Array.from(guild.channels.cache.values()).filter(isGuildTextOrAnnouncement);

    const targetChannel =
      textChannels.find((ch) => ch.id === '1572539485382774814') ||
      textChannels.find((ch) => {
        const norm = normalizeDiscordName(ch.name);
        return norm.includes('olho') || norm.includes('diabo');
      }) ||
      textChannels.find((ch) => {
        const norm = normalizeDiscordName(ch.name);
        return (
          norm.includes('buscar-ip') ||
          norm.includes('bscr-ip') ||
          norm.includes('puxar-ip')
        );
      }) ||
      textChannels.find((ch) => {
        const norm = normalizeDiscordName(ch.name);
        return /(?:^|[^a-z])ip(?:[^a-z]|$)/.test(norm) || norm.includes('consulta');
      });

    if (!targetChannel) {
      return { sent: false, reason: 'Canal Olho do Diabo não encontrado.' };
    }

    const botUserId = guild.client.user?.id;
    if (!forceSend && botUserId) {
      const recent = await targetChannel.messages.fetch({ limit: 25 }).catch(() => null);
      const hasCurrentPanel = recent?.some((msg) => {
        if (msg.author?.id !== botUserId) return false;
        const hasIpButton = msg.components?.some((row: any) =>
          row.components?.some((comp: any) => comp.customId === 'ip_ticket_open'),
        );
        const title = msg.embeds?.[0]?.title || '';
        return Boolean(hasIpButton && title.includes('5573 Satan'));
      });
      if (hasCurrentPanel) {
        return { sent: false, channelId: targetChannel.id, reason: 'Painel já ativo.' };
      }
    }

    const { buildIpPanelMessage } = await import('./tickets.ts');
    const sent = await targetChannel.send(buildIpPanelMessage());
    console.log(
      `[Discord Bot] 👁️ Painel Olho do Diabo enviado em #${targetChannel.name} (${targetChannel.id}) no servidor ${guild.name}.`,
    );
    return { sent: true, channelId: targetChannel.id, messageId: sent.id };
  } catch (err) {
    return {
      sent: false,
      reason: err instanceof Error ? err.message : 'Erro ao enviar painel Olho do Diabo.',
    };
  }
}

function formatApiError(err: unknown): string {
  if (err && typeof err === 'object') {
    const maybeErr = err as { code?: number | string; message?: string };
    if (maybeErr.code === 50013) {
      return 'Permissões insuficientes na API do Discord (Missing Permissions). Verifique se o cargo do bot está acima dos canais/restrições ou possui permissão de Administrador.';
    }
    if (maybeErr.code === 50074) {
      return 'O Discord bloqueou a exclusão de um canal obrigatório de Servidor da Comunidade (ex.: canal de regras ou atualizações).';
    }
    if (maybeErr.message) {
      return maybeErr.message;
    }
  }
  return 'Erro inesperado ao comunicar com a API do Discord.';
}

function attachBotListeners(client: Client): void {
  void import('./moderation.ts')
    .then(({ registerModerationListeners }) => {
      registerModerationListeners(client);
    })
    .catch((err) => {
      console.error('[Discord Bot] Falha ao ativar moderação avançada:', err);
    });

  client.once('clientReady', async () => {
    botReady = true;
    console.log(`[Discord Bot] Conectado como ${client.user?.tag ?? 'Bot'}`);

    const appId = client.user?.id || process.env.DISCORD_APPLICATION_ID?.trim() || '';
    const token = process.env.DISCORD_BOT_TOKEN?.trim() || '';
    const guildIds = Array.from(client.guilds.cache.keys());
    if (appId && token) {
      void clearAllSlashCommands(appId, token, guildIds).catch(() => {});
    }

    for (const guild of client.guilds.cache.values()) {
      const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
      if (me && me.nickname !== '5573 Satan') {
        await me.setNickname('5573 Satan').catch(() => {});
      }
      await runFullGuildSync(guild).catch((err) => {
        console.error('[Discord Bot] Falha no sync inicial da guild:', err);
      });
      void ensureMuralPanelsForGuild(guild).catch(() => {});
      void ensureExpPanelForGuild(guild).catch(() => {});
      void ensureOlhoDoDiaboPanelForGuild(guild).catch(() => {});
    }

    void import('./callGame.ts')
      .then(({ recoverOrphanedCallGameChannelsOnStartup }) =>
        recoverOrphanedCallGameChannelsOnStartup(),
      )
      .catch(() => {});
    const snapshot: unknown[] = [];
    for (const guild of client.guilds.cache.values()) {
      try {
        const channels = await guild.channels.fetch();
        const roles = await guild.roles.fetch();
        const emojis = await guild.emojis.fetch();
        const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
        snapshot.push({
          id: guild.id,
          name: guild.name,
          ownerId: guild.ownerId,
          premiumTier: guild.premiumTier,
          botId: client.user?.id ?? null,
          botHighestRolePos: botMember?.roles.highest.position ?? null,
          botIsAdmin: botMember?.permissions.has(PermissionsBitField.Flags.Administrator) ?? false,
          roles: Array.from(roles.values())
            .sort((a, b) => b.position - a.position)
            .map((r) => ({
              id: r.id,
              name: r.name,
              position: r.position,
              managed: r.managed,
              permissions: r.permissions.bitfield.toString(),
            })),
          channels: Array.from(channels.values())
            .filter((c): c is NonNullable<typeof c> => Boolean(c))
            .sort((a, b) => ('rawPosition' in a ? a.rawPosition : 0) - ('rawPosition' in b ? b.rawPosition : 0))
            .map((c) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              parentId: c.parentId,
              position: 'rawPosition' in c ? c.rawPosition : 0,
              overwrites:
                'permissionOverwrites' in c
                  ? Array.from(c.permissionOverwrites.cache.values()).map((o) => ({
                      id: o.id,
                      type: o.type,
                      allow: o.allow.bitfield.toString(),
                      deny: o.deny.bitfield.toString(),
                    }))
                  : [],
            })),
          emojis: Array.from(emojis.values()).map((e) => ({
            id: e.id,
            name: e.name,
            animated: Boolean(e.animated),
          })),
        });
      } catch (snapErr) {
        console.error('[Discord Bot] Snapshot error:', snapErr);
      }
    }
    try {
      fs.writeFileSync('/tmp/discord_guild_snapshot.json', JSON.stringify(snapshot, null, 2));
    } catch {
      // Ignore temp snapshot error
    }
  });

  client.on('error', (err) => {
    console.error('[Discord Bot] Client error:', err);
    botConnectionError = err.message;
  });

  client.on('guildMemberAdd', async (member) => {
    await assignMemberRoleOnJoin(member);
    await handleMemberBannerEvent(member, 'welcome');
  });

  client.on('guildMemberRemove', async (member) => {
    await handleMemberBannerEvent(member, 'leave');
  });

  client.on('voiceStateUpdate', (oldState, newState) => {
    void import('./callGame.ts')
      .then(({ handleCallGameVoiceStateUpdate }) => handleCallGameVoiceStateUpdate(oldState, newState))
      .catch(() => {});
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    try {
      const { handleIpTicketMessage } = await import('./tickets.ts');
      if (await handleIpTicketMessage(message)) return;

      const { handleCallGamePrivateMessage } = await import('./callGame.ts');
      if (await handleCallGamePrivateMessage(message)) return;

      const { handleAiVoicePrefixMessage } = await import('./aiVoice.ts');
      await handleAiVoicePrefixMessage(message);
    } catch (err) {
      console.error('[Discord Bot] Erro ao processar mensagem:', err);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
      try {
        const customId = interaction.customId;

        if (customId.startsWith('exp_')) {
          await handleExpButtonInteraction(interaction, client);
          return;
        }

        const handledByReg = await handleRegistrationButtonInteraction(interaction);
        if (handledByReg) return;

        // Tickets & Olho do Diabo
        if (customId === 'ticket_open_modal') {
          const { buildTicketModal } = await import('./tickets.ts');
          await interaction.showModal(buildTicketModal());
          return;
        }
        if (customId === 'ip_ticket_open') {
          if (!interaction.guild) {
            await interaction.reply({
              content: 'Esta ação só funciona dentro de um servidor.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const { createIpTicketChannel } = await import('./tickets.ts');
          const { channel, existing } = await createIpTicketChannel(
            interaction.guild,
            interaction.user,
          );
          await interaction.editReply({
            content: existing
              ? `👁️ Você já possui um ticket do Olho do Diabo aberto em <#${channel.id}>!`
              : `👁️ Canal privado do **Olho do Diabo** criado em <#${channel.id}>!`,
          });
          return;
        }
        if (customId.startsWith('ticket_close_')) {
          if (!interaction.channel || !interaction.channel.isTextBased() || interaction.channel.isDMBased()) {
            await interaction.reply({
              content: 'Este botão só funciona em um canal de ticket.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const { closeTicketChannel } = await import('./tickets.ts');
          await closeTicketChannel(interaction.channel as any, interaction.user);
          await interaction.editReply({
            content: '🔒 Ticket encerrado com sucesso. Este canal será excluído em 5 segundos.',
          });
          return;
        }
        if (customId.startsWith('ticket_alert_')) {
          if (!interaction.guild) return;
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const { alertAdministrators } = await import('./tickets.ts');
          const result = await alertAdministrators(
            interaction.guild,
            interaction.channelId,
            interaction.user,
          );
          await interaction.editReply({ content: result.message });
          return;
        }

        // Jogo da Call (CallGame)
        if (customId.startsWith('callgame_')) {
          const callGame = await import('./callGame.ts');
          if (customId.startsWith('callgame_ready:')) {
            await callGame.handleCallGameReadyClick(interaction);
            return;
          }
          if (customId.startsWith('callgame_open_name_modal:')) {
            await callGame.handleCallGameOpenNameModal(interaction);
            return;
          }
          if (customId.startsWith('callgame_cycle_voice:')) {
            await callGame.handleCallGameCycleVoice(interaction);
            return;
          }
          if (customId.startsWith('callgame_set_gender:m:')) {
            await callGame.handleCallGameSetGender(interaction, 'm');
            return;
          }
          if (customId.startsWith('callgame_set_gender:f:')) {
            await callGame.handleCallGameSetGender(interaction, 'f');
            return;
          }
          if (customId.startsWith('callgame_confirm_ready:')) {
            await callGame.handleCallGameConfirmReady(interaction);
            return;
          }
          if (customId.startsWith('callgame_owner_start:')) {
            await callGame.handleCallGameOwnerStartClick(interaction);
            return;
          }
          if (customId.startsWith('callgame_open_answer_modal:')) {
            await callGame.handleCallGameOpenAnswerModal(interaction);
            return;
          }
        }

        // Enquetes (Polls)
        if (customId.startsWith('poll_')) {
          const polls = await import('./polls.ts');
          if (customId.startsWith('poll_vote_')) {
            const withoutPrefix = customId.slice('poll_vote_'.length);
            const lastIdx = withoutPrefix.lastIndexOf('_');
            const pollId = lastIdx > 0 ? withoutPrefix.slice(0, lastIdx) : withoutPrefix;
            const optionIndex = lastIdx > 0 ? Number(withoutPrefix.slice(lastIdx + 1)) : -1;
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const res = await polls.handlePollVote(
              pollId,
              optionIndex,
              interaction.user,
              interaction.message,
            );
            await interaction.editReply({ content: res.message });
            return;
          }
          if (customId.startsWith('poll_view_')) {
            const pollId = customId.slice('poll_view_'.length);
            const poll = polls.getPoll(pollId);
            if (!poll) {
              await interaction.reply({
                content: '⚠️ Enquete não encontrada.',
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            await interaction.reply({
              embeds: [polls.buildVotersEphemeralEmbed(poll)],
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          if (customId.startsWith('poll_unvote_')) {
            const pollId = customId.slice('poll_unvote_'.length);
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const res = await polls.handlePollUnvote(pollId, interaction.user, interaction.message);
            await interaction.editReply({ content: res.message });
            return;
          }
          if (customId.startsWith('poll_close_')) {
            const pollId = customId.slice('poll_close_'.length);
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const res = await polls.closePoll(
              pollId,
              interaction.user,
              interaction.member as GuildMember | null,
              interaction.message,
            );
            await interaction.editReply({ content: res.message });
            return;
          }
        }

        await handleMuralButtonInteraction(interaction, client);
      } catch (err) {
        console.error('[Discord Bot] Erro no botão:', err);
        const errPayload = {
          content: 'Não foi possível processar esta ação no momento. Tente novamente.',
          flags: MessageFlags.Ephemeral,
        } as const;
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(errPayload).catch(() => {});
        } else {
          await interaction.reply(errPayload).catch(() => {});
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      try {
        await handleMuralSelectInteraction(interaction);
      } catch (err) {
        console.error('[Discord Bot] Erro na seleção de mural:', err);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      try {
        const customId = interaction.customId;
        if (customId === 'ticket_modal_submit') {
          if (!interaction.guild) {
            await interaction.reply({
              content: 'Esta ação só funciona dentro de um servidor.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const subject = interaction.fields.getTextInputValue('ticket_subject')?.trim();
          const content = interaction.fields.getTextInputValue('ticket_content')?.trim();
          const { createTicketChannel } = await import('./tickets.ts');
          const { channel, existing } = await createTicketChannel(
            interaction.guild,
            interaction.user,
            content,
            subject,
          );
          await interaction.editReply({
            content: existing
              ? `🎫 Você já possui um ticket aberto em <#${channel.id}>!`
              : `🎫 Ticket criado com sucesso em <#${channel.id}>!`,
          });
          return;
        }
        if (customId.startsWith('callgame_modal_name:')) {
          const { handleCallGameNameModalSubmit } = await import('./callGame.ts');
          await handleCallGameNameModalSubmit(interaction);
          return;
        }
        if (customId.startsWith('callgame_modal_answer:')) {
          const { handleCallGameAnswerModalSubmit } = await import('./callGame.ts');
          await handleCallGameAnswerModalSubmit(interaction);
          return;
        }

        const handledByExp = await handleExpModalInteraction(interaction);
        if (!handledByExp) {
          await handleMuralModalInteraction(interaction);
        }
      } catch (err) {
        console.error('[Discord Bot] Erro no modal:', err);
        const errPayload = {
          content: 'Ocorreu um erro ao processar o formulário enviado. Tente novamente.',
          flags: MessageFlags.Ephemeral,
        } as const;
        if (interaction.deferred) {
          await interaction.editReply({ content: errPayload.content }).catch(() => {});
        } else if (interaction.replied) {
          await interaction.followUp(errPayload).catch(() => {});
        } else {
          await interaction.reply(errPayload).catch(() => {});
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    await interaction
      .reply({
        content: 'Todos os comandos de barra (/) deste bot foram removidos.',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  });
}

export async function initializeDiscordBot(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();

  if (!token || !applicationId) {
    botConnectionError = 'DISCORD_BOT_TOKEN ou DISCORD_APPLICATION_ID não configurados.';
    botReady = false;
    return;
  }

  try {
    await clearAllSlashCommands(applicationId, token);
  } catch (err) {
    console.warn('[Discord Bot] Falha ao limpar comandos slash:', err);
  }

  const primaryClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Channel, Partials.Message],
  });
  attachBotListeners(primaryClient);
  discordClient = primaryClient;

  try {
    await primaryClient.login(token);
    botConnectionError = null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao autenticar o bot no Discord.';
    if (message.toLowerCase().includes('disallowed intents')) {
      console.warn(
        '[Discord Bot] Intents privilegiadas desativadas no Portal do Discord. Conectando com intents padrão.',
      );
      await primaryClient.destroy().catch(() => {});

      const secondaryClient = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.GuildVoiceStates,
        ],
        partials: [Partials.GuildMember, Partials.User, Partials.Channel, Partials.Message],
      });
      attachBotListeners(secondaryClient);
      discordClient = secondaryClient;

      try {
        await secondaryClient.login(token);
        botConnectionError = null;
      } catch (secondaryErr) {
        const secMsg =
          secondaryErr instanceof Error
            ? secondaryErr.message
            : 'Falha ao autenticar o bot no Discord.';
        if (secMsg.toLowerCase().includes('disallowed intents')) {
          await secondaryClient.destroy().catch(() => {});
          const fallbackClient = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
            partials: [Partials.GuildMember, Partials.User, Partials.Channel, Partials.Message],
          });
          attachBotListeners(fallbackClient);
          discordClient = fallbackClient;
          try {
            await fallbackClient.login(token);
            botConnectionError = null;
          } catch (fallbackErr) {
            botReady = false;
            botConnectionError =
              fallbackErr instanceof Error
                ? fallbackErr.message
                : 'Falha ao autenticar o bot no Discord.';
            console.error('[Discord Bot] Falha no login fallback:', botConnectionError);
          }
        } else {
          botReady = false;
          botConnectionError = secMsg;
          console.error('[Discord Bot] Falha no login secundário:', botConnectionError);
        }
      }
    } else {
      botReady = false;
      botConnectionError = message;
      console.error('[Discord Bot] Falha no login:', botConnectionError);
    }
  }
}

export function getBotStatus(): BotStatus {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const configured = Boolean(token && applicationId);

  return {
    configured,
    connected: botReady && Boolean(discordClient?.isReady()),
    botTag: discordClient?.user?.tag ?? null,
    botId: discordClient?.user?.id ?? null,
    guildCount: discordClient?.guilds.cache.size ?? 0,
    error: botConnectionError,
  };
}

export async function reconnectDiscordBot(): Promise<BotStatus> {
  if (reconnectPromise) {
    return reconnectPromise;
  }

  reconnectPromise = (async () => {
    try {
      if (discordClient) {
        await discordClient.destroy().catch(() => {});
        discordClient = null;
      }
      botReady = false;
      botConnectionError = null;
      await initializeDiscordBot();
      return getBotStatus();
    } finally {
      reconnectPromise = null;
    }
  })();

  return reconnectPromise;
}

export async function fetchBotGuildIds(): Promise<Set<string>> {
  const ids = new Set<string>();

  if (discordClient?.isReady()) {
    for (const guildId of discordClient.guilds.cache.keys()) {
      ids.add(guildId);
    }
    return ids;
  }

  // Fallback via Discord REST API if bot token is set but WebSocket is still connecting
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return ids;

  try {
    const response = await fetch('https://discord.com/api/v10/users/@me/guilds?limit=200', {
      headers: {
        Authorization: `Bot ${token}`,
      },
    });
    if (response.ok) {
      const guilds = (await response.json()) as Array<{ id: string }>;
      for (const g of guilds) {
        ids.add(g.id);
      }
    }
  } catch {
    // Ignore transient REST error
  }

  return ids;
}

export interface BotGuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  owner: boolean;
}

export async function fetchBotGuildsSummary(): Promise<BotGuildSummary[]> {
  if (discordClient?.isReady()) {
    const list: BotGuildSummary[] = [];
    for (const guild of discordClient.guilds.cache.values()) {
      list.push({
        id: guild.id,
        name: guild.name,
        iconUrl: guild.iconURL({ extension: 'png', size: 128 }),
        owner: guild.ownerId === discordClient.user?.id,
      });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return [];

  try {
    const response = await fetch('https://discord.com/api/v10/users/@me/guilds?limit=200', {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!response.ok) return [];
    const rawGuilds = (await response.json()) as Array<{
      id: string;
      name: string;
      icon: string | null;
      owner?: boolean;
    }>;
    return rawGuilds
      .map((g) => ({
        id: g.id,
        name: g.name,
        iconUrl: g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith('a_') ? 'gif' : 'png'}?size=128`
          : null,
        owner: Boolean(g.owner),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  } catch {
    return [];
  }
}

export interface GuildTextChannelItem {
  id: string;
  name: string;
  categoryName: string | null;
}

export async function fetchGuildTextChannels(guildId: string): Promise<GuildTextChannelItem[]> {
  if (discordClient?.isReady()) {
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      const channels = await guild.channels.fetch();
      const categories = new Map<string, string>();
      for (const ch of channels.values()) {
        if (ch && ch.type === ChannelType.GuildCategory) {
          categories.set(ch.id, ch.name);
        }
      }

      const textChannels: Array<GuildTextChannelItem & { position: number }> = [];
      for (const ch of channels.values()) {
        if (
          ch &&
          (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement)
        ) {
          textChannels.push({
            id: ch.id,
            name: ch.name,
            categoryName: ch.parentId ? (categories.get(ch.parentId) ?? null) : null,
            position: 'rawPosition' in ch ? ch.rawPosition : 0,
          });
        }
      }

      textChannels.sort((a, b) => a.position - b.position);
      return textChannels.map(({ id, name, categoryName }) => ({ id, name, categoryName }));
    }
  }

  // Fallback to Bot REST API if WebSocket is not ready yet
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return [];

  const resp = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!resp.ok) return [];

  const rawChannels = (await resp.json()) as Array<{
    id: string;
    name: string;
    type: number;
    parent_id: string | null;
    position: number;
  }>;

  const categories = new Map<string, string>();
  for (const ch of rawChannels) {
    if (ch.type === ChannelType.GuildCategory) {
      categories.set(ch.id, ch.name);
    }
  }

  return rawChannels
    .filter((ch) => ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement)
    .sort((a, b) => a.position - b.position)
    .map((ch) => ({
      id: ch.id,
      name: ch.name,
      categoryName: ch.parent_id ? (categories.get(ch.parent_id) ?? null) : null,
    }));
}

export interface GuildChannelFullItem {
  id: string;
  name: string;
  type: number;
  categoryName: string | null;
  memberCount: number;
}

export async function fetchGuildAllChannels(guildId: string): Promise<GuildChannelFullItem[]> {
  if (discordClient?.isReady()) {
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      const channels = await guild.channels.fetch();
      const categories = new Map<string, string>();
      for (const ch of channels.values()) {
        if (ch && ch.type === ChannelType.GuildCategory) {
          categories.set(ch.id, ch.name);
        }
      }

      const items: Array<GuildChannelFullItem & { position: number }> = [];
      for (const ch of channels.values()) {
        if (!ch || ch.type === ChannelType.GuildCategory) continue;
        items.push({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          categoryName: ch.parentId ? (categories.get(ch.parentId) ?? null) : null,
          memberCount: ch.isVoiceBased() ? ch.members.size : 0,
          position: 'rawPosition' in ch ? ch.rawPosition : 0,
        });
      }

      items.sort((a, b) => a.position - b.position);
      return items.map(({ id, name, type, categoryName, memberCount }) => ({
        id,
        name,
        type,
        categoryName,
        memberCount,
      }));
    }
  }

  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return [];

  const resp = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!resp.ok) return [];

  const rawChannels = (await resp.json()) as Array<{
    id: string;
    name: string;
    type: number;
    parent_id: string | null;
    position: number;
  }>;

  const categories = new Map<string, string>();
  for (const ch of rawChannels) {
    if (ch.type === ChannelType.GuildCategory) {
      categories.set(ch.id, ch.name);
    }
  }

  return rawChannels
    .filter((ch) => ch.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position)
    .map((ch) => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      categoryName: ch.parent_id ? (categories.get(ch.parent_id) ?? null) : null,
      memberCount: 0,
    }));
}

async function handleMemberBannerEvent(
  member: GuildMember | PartialGuildMember,
  eventType: BannerEventType,
): Promise<void> {
  try {
    const guild = member.guild;
    const config = getGuildConfig(guild.id);
    const rule = eventType === 'welcome' ? config.welcome : config.leave;

    if (!rule.enabled || !rule.channelId) return;

    const channel = await guild.channels.fetch(rule.channelId).catch(() => null);
    if (
      !channel ||
      (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
    ) {
      return;
    }

    const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (botMember) {
      const perms = channel.permissionsFor(botMember);
      if (
        !perms?.has(PermissionsBitField.Flags.ViewChannel) ||
        !perms?.has(PermissionsBitField.Flags.SendMessages) ||
        !perms?.has(PermissionsBitField.Flags.AttachFiles)
      ) {
        return;
      }
    }

    const resolvedUser =
      member.user && !member.user.partial && member.user.username
        ? member.user
        : await member.client.users.fetch(member.id).catch(() => member.user ?? null);

    const displayName =
      member.displayName || resolvedUser?.globalName || resolvedUser?.username || 'Membro';
    const username = resolvedUser?.username || displayName;
    const avatarUrl =
      resolvedUser?.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }) ?? null;

    console.log(
      `[Discord Bot] Evento ${eventType === 'welcome' ? 'guildMemberAdd -> Entrada' : 'guildMemberRemove -> Saída'} | servidor "${guild.name}" (${guild.id}) | canal #${channel.name} (${channel.id}) | título "${rule.title}" | membro ${displayName} (${member.id})`,
    );

    const pngBuffer = await renderWelcomeBanner({
      title: rule.title,
      message: rule.message,
      memberDisplayName: displayName,
      memberUsername: username,
      guildName: guild.name,
      memberCount: guild.memberCount,
      avatarUrl,
      imageFilename: rule.imageFilename,
    });

    const filename = eventType === 'welcome' ? 'boas-vindas.png' : 'despedida.png';
    await channel.send({
      content: `<@${member.id}>`,
      files: [new AttachmentBuilder(pngBuffer, { name: filename })],
      allowedMentions:
        eventType === 'welcome' ? { users: [member.id] } : { parse: [] },
    });
  } catch (err) {
    console.error(`[Discord Bot] Falha ao enviar imagem de ${eventType}:`, err);
  }
}

export async function sendTestWelcomeBanner(options: {
  guildId: string;
  eventType: BannerEventType;
  channelId: string;
  title: string;
  message: string;
  memberUserId: string;
  memberDisplayName: string;
  memberUsername: string;
  avatarUrl: string | null;
  imageFilename: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    let guildName = 'Servidor';
    let memberCount = 1;

    if (discordClient?.isReady()) {
      const guild = await discordClient.guilds.fetch(options.guildId).catch(() => null);
      if (!guild) {
        return { ok: false, error: 'Servidor não encontrado pelo bot.' };
      }

      guildName = guild.name;
      memberCount = guild.memberCount;

      const channel = await guild.channels.fetch(options.channelId).catch(() => null);
      if (
        !channel ||
        (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
      ) {
        return { ok: false, error: 'Canal de texto inválido ou não encontrado.' };
      }

      const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
      if (botMember) {
        const perms = channel.permissionsFor(botMember);
        if (
          !perms?.has(PermissionsBitField.Flags.ViewChannel) ||
          !perms?.has(PermissionsBitField.Flags.SendMessages) ||
          !perms?.has(PermissionsBitField.Flags.AttachFiles)
        ) {
          return {
            ok: false,
            error:
              'O bot precisa das permissões Ver Canal, Enviar Mensagens e Anexar Arquivos neste canal.',
          };
        }
      }

      const pngBuffer = await renderWelcomeBanner({
        title: options.title,
        message: options.message,
        memberDisplayName: options.memberDisplayName,
        memberUsername: options.memberUsername,
        guildName,
        memberCount,
        avatarUrl: options.avatarUrl,
        imageFilename: options.imageFilename,
      });

      const filename =
        options.eventType === 'welcome' ? 'demonstracao-entrada.png' : 'demonstracao-saida.png';
      await channel.send({
        content: `<@${options.memberUserId}>`,
        files: [new AttachmentBuilder(pngBuffer, { name: filename })],
        allowedMentions: { users: [options.memberUserId] },
      });

      return { ok: true };
    }

    // Fallback via Discord REST API if gateway is still connecting
    const token = process.env.DISCORD_BOT_TOKEN?.trim();
    if (!token) {
      return { ok: false, error: 'Token do bot não configurado no servidor.' };
    }

    const guildResp = await fetch(`https://discord.com/api/v10/guilds/${options.guildId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (guildResp.ok) {
      const g = (await guildResp.json()) as { name?: string };
      if (g.name) guildName = g.name;
    }

    const pngBuffer = await renderWelcomeBanner({
      title: options.title,
      message: options.message,
      memberDisplayName: options.memberDisplayName,
      memberUsername: options.memberUsername,
      guildName,
      memberCount,
      avatarUrl: options.avatarUrl,
      imageFilename: options.imageFilename,
    });

    const filename =
      options.eventType === 'welcome' ? 'demonstracao-entrada.png' : 'demonstracao-saida.png';

    const form = new FormData();
    form.append(
      'payload_json',
      JSON.stringify({
        content: `<@${options.memberUserId}>`,
        allowed_mentions: { users: [options.memberUserId] },
      }),
    );
    form.append('files[0]', new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }), filename);

    const sendResp = await fetch(
      `https://discord.com/api/v10/channels/${options.channelId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bot ${token}` },
        body: form,
      },
    );

    if (!sendResp.ok) {
      const errDetail = await sendResp.text().catch(() => '');
      return {
        ok: false,
        error: `O Discord recusou o envio no canal (HTTP ${sendResp.status}). Verifique as permissões do bot no canal selecionado. ${errDetail}`.trim(),
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: formatApiError(err),
    };
  }
}

export function getBotClient(): Client | null {
  return discordClient;
}

export function isBotOnline(): boolean {
  return botReady && Boolean(discordClient?.isReady());
}

export async function initDiscordGatewayBot(): Promise<Client | null> {
  if (!discordClient || !discordClient.isReady()) {
    await initializeDiscordBot().catch(() => {});
  }
  return discordClient;
}


