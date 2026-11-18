import crypto from 'node:crypto';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type GuildBasedChannel,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type TextChannel,
  type NewsChannel,
} from 'discord.js';
import {
  createMuralAppeal,
  createMuralRequest,
  deleteMuralAppeal,
  deleteMuralRequest,
  getMuralAppeal,
  getMuralRequest,
  getPublishedMuralsForGuild,
  updateMuralAppeal,
  updateMuralRequest,
} from './muralStore.ts';
import { renderMuralCard } from './muralRenderer.ts';
import {
  findChorarChannelInGuild,
  findMuralChannelInGuild,
  findPedirMuralChannelInGuild,
  normalizeDiscordName,
} from './channelUtils.ts';

const activeChannelOperations = new Set<string>();
const UNIFIED_EMBED_COLOR = 0x1e2025;

const FALLBACK_KISS_GIFS = [
  'https://cdn.otakugifs.xyz/gifs/kiss/99c6d80ba787d40a.gif',
  'https://cdn.otakugifs.xyz/gifs/kiss/NGLVWgfzrI.gif',
  'https://cdn.otakugifs.xyz/gifs/kiss/0e41d66ee4966bea.gif',
];

function normalizeChannelName(name: string): string {
  return normalizeDiscordName(name);
}

function isGuildAdmin(
  guild: Guild,
  userId: string,
  memberPermissions: Readonly<PermissionsBitField> | null | undefined,
): boolean {
  if (guild.ownerId === userId) return true;
  return memberPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
}

function isGuildTextOrAnnouncement(
  channel: GuildBasedChannel | null | undefined,
): channel is TextChannel | NewsChannel {
  return Boolean(
    channel &&
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement),
  );
}

async function fetchAnimeKissGif(): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch('https://api.otakugifs.xyz/gif?reaction=kiss', {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (resp.ok) {
      const data = (await resp.json()) as { url?: string };
      if (typeof data.url === 'string' && data.url.startsWith('https://')) {
        return data.url;
      }
    }
  } catch {
    // Fallback to verified CDN kiss GIFs
  }

  return FALLBACK_KISS_GIFS[Math.floor(Math.random() * FALLBACK_KISS_GIFS.length)];
}

export function buildAdditionalSlashCommands() {
  return [];
}

async function handleLockCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild || !interaction.channel) {
    await interaction.reply({
      content: 'Este comando só pode ser utilizado dentro de um servidor Discord.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;
  if (!isGuildAdmin(guild, interaction.user.id, interaction.memberPermissions)) {
    await interaction.reply({
      content: 'Permissão negada. Apenas administradores podem trancar canais com `/lock`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const botMember = guild.members.me ?? (await guild.members.fetchMe());
  const channel = interaction.channel;

  if (channel.isThread()) {
    if (!botMember.permissionsIn(channel).has(PermissionsBitField.Flags.ManageThreads)) {
      await interaction.reply({
        content: 'O bot precisa da permissão **Gerenciar Tópicos** para trancar este tópico.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await channel.setLocked(true, `Canal trancado por ${interaction.user.tag} via /lock`);
    await interaction.reply({
      content: `🔒 **Tópico trancado** por <@${interaction.user.id}>. Apenas administradores/moderadores podem enviar mensagens agora.`,
    });
    return;
  }

  if (!isGuildTextOrAnnouncement(channel as GuildBasedChannel)) {
    await interaction.reply({
      content: 'Este comando só funciona em canais de texto ou tópicos do servidor.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const textChannel = channel as TextChannel | NewsChannel;
  const botPerms = textChannel.permissionsFor(botMember);
  if (
    !botPerms?.has(PermissionsBitField.Flags.ManageChannels) &&
    !botPerms?.has(PermissionsBitField.Flags.ManageRoles)
  ) {
    await interaction.reply({
      content:
        'O bot não possui permissão de **Gerenciar Canais** / **Gerenciar Permissões** para trancar este canal.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await textChannel.permissionOverwrites.edit(
    guild.roles.everyone,
    {
      SendMessages: false,
      SendMessagesInThreads: false,
    },
    {
      reason: `Canal trancado por ${interaction.user.tag} via /lock`,
    },
  );

  const embed = new EmbedBuilder()
    .setColor(UNIFIED_EMBED_COLOR)
    .setTitle('🔒 Canal Trancado')
    .setDescription(
      `Este canal foi trancado por <@${interaction.user.id}>.\nApenas **administradores** conseguem enviar mensagens aqui agora.`,
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleUnlockCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild || !interaction.channel) {
    await interaction.reply({
      content: 'Este comando só pode ser utilizado dentro de um servidor Discord.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;
  if (!isGuildAdmin(guild, interaction.user.id, interaction.memberPermissions)) {
    await interaction.reply({
      content: 'Permissão negada. Apenas administradores podem desbloquear canais com `/unlock`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const botMember = guild.members.me ?? (await guild.members.fetchMe());
  const channel = interaction.channel;

  if (channel.isThread()) {
    if (!botMember.permissionsIn(channel).has(PermissionsBitField.Flags.ManageThreads)) {
      await interaction.reply({
        content: 'O bot precisa da permissão **Gerenciar Tópicos** para desbloquear este tópico.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await channel.setLocked(false, `Tópico desbloqueado por ${interaction.user.tag} via /unlock`);
    await interaction.reply({
      content: `🔓 **Tópico desbloqueado** por <@${interaction.user.id}>. Os membros podem enviar mensagens novamente.`,
    });
    return;
  }

  if (!isGuildTextOrAnnouncement(channel as GuildBasedChannel)) {
    await interaction.reply({
      content: 'Este comando só funciona em canais de texto ou tópicos do servidor.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const textChannel = channel as TextChannel | NewsChannel;
  const botPerms = textChannel.permissionsFor(botMember);
  if (
    !botPerms?.has(PermissionsBitField.Flags.ManageChannels) &&
    !botPerms?.has(PermissionsBitField.Flags.ManageRoles)
  ) {
    await interaction.reply({
      content:
        'O bot não possui permissão de **Gerenciar Canais** / **Gerenciar Permissões** para desbloquear este canal.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await textChannel.permissionOverwrites.edit(
    guild.roles.everyone,
    {
      SendMessages: null,
      SendMessagesInThreads: null,
    },
    {
      reason: `Canal desbloqueado por ${interaction.user.tag} via /unlock`,
    },
  );

  const embed = new EmbedBuilder()
    .setColor(UNIFIED_EMBED_COLOR)
    .setTitle('🔓 Canal Desbloqueado')
    .setDescription(
      `Este canal foi desbloqueado por <@${interaction.user.id}>.\nOs membros podem voltar a enviar mensagens normalmente.`,
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleNukeCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild || !interaction.channel) {
    await interaction.reply({
      content: 'Este comando só pode ser utilizado dentro de um servidor Discord.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;
  if (!isGuildAdmin(guild, interaction.user.id, interaction.memberPermissions)) {
    await interaction.reply({
      content: 'Permissão negada. Apenas administradores do servidor podem executar `/nuke`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!isGuildTextOrAnnouncement(interaction.channel as GuildBasedChannel)) {
    await interaction.reply({
      content: 'O comando `/nuke` só pode ser usado em canais de texto do servidor (não em tópicos).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.channel as TextChannel | NewsChannel;
  const botMember = guild.members.me ?? (await guild.members.fetchMe());
  const botPerms = channel.permissionsFor(botMember);

  if (
    !botPerms?.has(PermissionsBitField.Flags.ManageChannels) ||
    !botPerms?.has(PermissionsBitField.Flags.ViewChannel)
  ) {
    await interaction.reply({
      content:
        'O bot precisa das permissões **Ver Canal** e **Gerenciar Canais** para executar `/nuke`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (activeChannelOperations.has(channel.id)) {
    await interaction.reply({
      content: 'Já existe uma operação em andamento neste canal. Aguarde a conclusão.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const confirmId = `nuke_confirm_${interaction.id}`;
  const cancelId = `nuke_cancel_${interaction.id}`;

  const warningEmbed = new EmbedBuilder()
    .setColor(UNIFIED_EMBED_COLOR)
    .setTitle('⚠️ CONFIRMAÇÃO NECESSÁRIA — NUKE DE CANAL')
    .setDescription(
      [
        `Você solicitou a execução do comando **/nuke** no canal <#${channel.id}> (**#${channel.name}**).`,
        '',
        '**Leia com atenção antes de confirmar:**',
        '• Este canal será **apagado permanentemente** junto com todo o histórico de mensagens, anexos e mensagens fixadas.',
        '• Em seguida, um **novo canal idêntico** será criado com o **mesmo nome**, dentro da **mesma categoria**, na **mesma posição** e mantendo as **mesmas permissões**.',
        '• **Esta ação não pode ser desfeita** e as mensagens antigas não poderão ser recuperadas.',
        '',
        `🔒 **Restrição:** somente um **Administrador** pode confirmar ou cancelar esta operação (iniciado por <@${interaction.user.id}>).`,
        '',
        '**Você tem certeza absoluta de que deseja apagar e recriar este canal?**',
      ].join('\n'),
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel('Sim, apagar e recriar canal')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary),
  );

  const response = await interaction.reply({
    embeds: [warningEmbed],
    components: [row],
    withResponse: true,
  });

  const message = response.resource?.message;
  if (!message) return;

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
  });

  collector.on('collect', async (btn) => {
    const callerIsAdmin = isGuildAdmin(guild, btn.user.id, btn.memberPermissions);
    if (!callerIsAdmin) {
      await btn.reply({
        content:
          'Permissão negada. Apenas administradores do servidor podem clicar nos botões de `/nuke`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (btn.user.id !== interaction.user.id) {
      await btn.reply({
        content: `Apenas o administrador que executou o comando (<@${interaction.user.id}>) pode confirmar esta ação.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (btn.customId === cancelId) {
      collector.stop('cancelled');
      await btn.update({
        content: 'Operação `/nuke` cancelada. O canal foi mantido intacto.',
        embeds: [],
        components: [],
      });
      return;
    }

    if (btn.customId === confirmId) {
      if (activeChannelOperations.has(channel.id)) {
        await btn.reply({
          content: 'Esta operação já está sendo executada.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      collector.stop('confirmed');
      activeChannelOperations.add(channel.id);

      try {
        await btn.update({
          content: '💥 Apagando e recriando canal... aguarde um instante.',
          embeds: [],
          components: [],
        });

        const originalName = channel.name;
        const originalParentId = channel.parentId;
        const originalPosition = channel.rawPosition;

        const cloned = await channel.clone({
          parent: originalParentId ?? undefined,
          position: originalPosition,
          reason: `Nuke confirmado por ${btn.user.tag}`,
        });

        await channel.delete(`Nuke confirmado por ${btn.user.tag}`);

        if (cloned.rawPosition !== originalPosition) {
          await cloned.setPosition(originalPosition).catch(() => {});
        }

        const doneEmbed = new EmbedBuilder()
          .setColor(UNIFIED_EMBED_COLOR)
          .setTitle('💥 Canal recriado com sucesso')
          .setDescription(
            `O canal **#${originalName}** foi apagado e recriado na mesma categoria e posição por <@${btn.user.id}>.`,
          )
          .setTimestamp();

        await cloned.send({ embeds: [doneEmbed] });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido na API do Discord.';
        await channel
          .send(`Não foi possível concluir o \`/nuke\`: ${msg}`)
          .catch(() => {});
      } finally {
        activeChannelOperations.delete(channel.id);
      }
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      await interaction
        .editReply({
          content: 'Tempo de confirmação expirado (60s). O canal não foi alterado.',
          embeds: [],
          components: [],
        })
        .catch(() => {});
    }
  });
}

async function handleClearMessagesCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild || !interaction.channel) {
    await interaction.reply({
      content: 'Este comando só pode ser utilizado dentro de um servidor Discord.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;
  const hasPerms =
    isGuildAdmin(guild, interaction.user.id, interaction.memberPermissions) ||
    (interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages) ?? false);

  if (!hasPerms) {
    await interaction.reply({
      content:
        'Permissão negada. Você precisa de **Gerenciar Mensagens** ou **Administrador** para excluir mensagens.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel.isTextBased() || channel.isDMBased()) {
    await interaction.reply({
      content: 'Este comando só funciona em canais de texto do servidor.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const botMember = guild.members.me ?? (await guild.members.fetchMe());
  const botPerms = botMember.permissionsIn(channel.id);
  if (
    !botPerms.has(PermissionsBitField.Flags.ViewChannel) ||
    !botPerms.has(PermissionsBitField.Flags.ReadMessageHistory) ||
    !botPerms.has(PermissionsBitField.Flags.ManageMessages)
  ) {
    await interaction.reply({
      content:
        'O bot precisa das permissões **Ver Canal**, **Ler Histórico de Mensagens** e **Gerenciar Mensagens** neste canal.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (activeChannelOperations.has(channel.id)) {
    await interaction.reply({
      content: 'Já existe uma limpeza ou operação em andamento neste canal.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  activeChannelOperations.add(channel.id);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000 - 60_000;
    const failedIds = new Set<string>();
    let beforeId: string | undefined;
    let totalDeleted = 0;

    while (true) {
      const fetched = await channel.messages.fetch(
        beforeId ? { limit: 100, before: beforeId } : { limit: 100 },
      );
      if (fetched.size === 0) break;

      const candidates = fetched.filter((msg) => !failedIds.has(msg.id));
      if (candidates.size === 0) {
        if (fetched.size < 100) break;
        beforeId = fetched.last()?.id;
        if (!beforeId) break;
        continue;
      }

      const now = Date.now();
      const recent = candidates.filter((msg) => now - msg.createdTimestamp < fourteenDaysMs);
      const older = candidates.filter((msg) => now - msg.createdTimestamp >= fourteenDaysMs);

      let deletedInRound = 0;

      if (recent.size >= 2) {
        try {
          const deleted = await channel.bulkDelete(recent, true);
          deletedInRound += deleted.size;
          totalDeleted += deleted.size;
          if (deleted.size === 0) {
            for (const id of recent.keys()) failedIds.add(id);
          }
        } catch {
          for (const id of recent.keys()) failedIds.add(id);
        }
      } else if (recent.size === 1) {
        const single = recent.first();
        if (single) {
          try {
            await single.delete();
            deletedInRound += 1;
            totalDeleted += 1;
          } catch {
            failedIds.add(single.id);
          }
        }
      }

      if (older.size > 0) {
        for (const msg of older.values()) {
          try {
            await msg.delete();
            deletedInRound += 1;
            totalDeleted += 1;
          } catch {
            failedIds.add(msg.id);
          }
        }
      }

      if (deletedInRound === 0) {
        break;
      }
    }

    if (totalDeleted === 0) {
      await interaction.editReply('Nenhuma mensagem elegível foi encontrada para exclusão neste canal.');
    } else {
      await interaction.editReply(
        `🧹 Limpeza concluída! Total de **${totalDeleted}** mensagem(ns) excluída(s) do canal.`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao excluir mensagens.';
    await interaction.editReply(`Não foi possível concluir a exclusão de mensagens: ${msg}`);
  } finally {
    activeChannelOperations.delete(channel.id);
  }
}

async function handleKissCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser('usuario', true);

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({
      content: 'Você não pode beijar a si mesmo(a)! Escolha outro usuário para beijar.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  const gifUrl = await fetchAnimeKissGif();

  const embed = new EmbedBuilder()
    .setColor(UNIFIED_EMBED_COLOR)
    .setDescription(`💋 <@${interaction.user.id}> beijou <@${targetUser.id}>!`)
    .setImage(gifUrl)
    .setTimestamp();

  await interaction.editReply({
    content: `<@${interaction.user.id}> <@${targetUser.id}>`,
    embeds: [embed],
  });
}

function findMuralChannel(guild: Guild): TextChannel | NewsChannel | null {
  return findMuralChannelInGuild(guild);
}

function findPedirMuralChannel(guild: Guild): TextChannel | NewsChannel | null {
  return findPedirMuralChannelInGuild(guild);
}

function findChorarChannel(guild: Guild): TextChannel | NewsChannel | null {
  return findChorarChannelInGuild(guild);
}

async function enforceReadOnlyChannelPermissions(
  channel: TextChannel | NewsChannel,
  guild: Guild,
): Promise<void> {
  const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return;
  }

  const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
  const alreadyDeniesMessages =
    Boolean(everyoneOverwrite?.deny.has(PermissionsBitField.Flags.SendMessages)) &&
    Boolean(everyoneOverwrite?.deny.has(PermissionsBitField.Flags.SendMessagesInThreads));

  const botOverwrite = channel.permissionOverwrites.cache.get(botMember.id);
  const botAlreadyAllowed =
    Boolean(botOverwrite?.allow.has(PermissionsBitField.Flags.ViewChannel)) &&
    Boolean(botOverwrite?.allow.has(PermissionsBitField.Flags.SendMessages)) &&
    Boolean(botOverwrite?.allow.has(PermissionsBitField.Flags.AttachFiles));

  if (!alreadyDeniesMessages) {
    await channel.permissionOverwrites
      .edit(guild.roles.everyone.id, {
        SendMessages: false,
        SendMessagesInThreads: false,
      })
      .catch(() => {});
  }

  if (!botAlreadyAllowed) {
    await channel.permissionOverwrites
      .edit(botMember.id, {
        ViewChannel: true,
        SendMessages: true,
        EmbedLinks: true,
        AttachFiles: true,
        ManageMessages: true,
      })
      .catch(() => {});
  }
}

async function channelHasBotButton(
  channel: TextChannel | NewsChannel,
  botUserId: string,
  customId: string,
): Promise<boolean> {
  try {
    const messages = await channel.messages.fetch({ limit: 25 });
    for (const msg of messages.values()) {
      if (msg.author.id !== botUserId) continue;
      for (const row of msg.components) {
        if (!('components' in row)) continue;
        for (const comp of row.components) {
          if ('customId' in comp && comp.customId === customId) {
            return true;
          }
        }
      }
    }
  } catch {
    // Ignore fetch error
  }
  return false;
}

export async function ensureMuralPanelsForGuild(guild: Guild): Promise<void> {
  const botUserId = guild.client.user?.id;
  if (!botUserId) return;

  await guild.channels.fetch().catch(() => {});

  const pedirChannel = findPedirMuralChannel(guild);
  const muralChannel = findMuralChannel(guild);
  const chorarChannel = findChorarChannel(guild);

  if (muralChannel) {
    await enforceReadOnlyChannelPermissions(muralChannel, guild);
  }

  if (pedirChannel) {
    await enforceReadOnlyChannelPermissions(pedirChannel, guild);
    const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    const perms = botMember ? pedirChannel.permissionsFor(botMember) : null;
    if (
      perms?.has(PermissionsBitField.Flags.ViewChannel) &&
      perms?.has(PermissionsBitField.Flags.SendMessages)
    ) {
      const hasPanel = await channelHasBotButton(pedirChannel, botUserId, 'mural_open_modal_btn');
      if (!hasPanel) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('mural_open_modal_btn')
            .setLabel('Pedir Mural')
            .setStyle(ButtonStyle.Secondary),
        );
        await pedirChannel
          .send({
            content: [
              '## Pedir Mural',
              'Clique no botão abaixo para enviar o **título** e a **observação** do mural para análise da administração.',
              'Assim que um administrador aceitar, o mural será publicado automaticamente.',
            ].join('\n'),
            components: [row],
          })
          .catch(() => {});
      }
    }
  }

  if (chorarChannel) {
    await enforceReadOnlyChannelPermissions(chorarChannel, guild);
    const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    const perms = botMember ? chorarChannel.permissionsFor(botMember) : null;
    if (
      perms?.has(PermissionsBitField.Flags.ViewChannel) &&
      perms?.has(PermissionsBitField.Flags.SendMessages)
    ) {
      const hasPanel = await channelHasBotButton(
        chorarChannel,
        botUserId,
        'mural_appeal_start_btn',
      );
      if (!hasPanel) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('mural_appeal_start_btn')
            .setLabel('Pedir Recurso')
            .setStyle(ButtonStyle.Secondary),
        );
        await chorarChannel
          .send({
            content: [
              '## Pedir Recurso do Mural',
              'Quer remover um mural publicado? Clique no botão abaixo, selecione o mural pelo **título** e explique por que não quer mais ele no servidor.',
              'Se um administrador aceitar o recurso, o mural será excluído automaticamente.',
            ].join('\n'),
            components: [row],
          })
          .catch(() => {});
      }
    }
  }
}

function buildMuralRequestModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId('mural_request_modal')
    .setTitle('Pedir Mural');

  const titleInput = new TextInputBuilder()
    .setCustomId('mural_title')
    .setLabel('Título do mural')
    .setPlaceholder('Ex.: O rei das desculpas')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(80);

  const observationInput = new TextInputBuilder()
    .setCustomId('mural_observation')
    .setLabel('Observação')
    .setPlaceholder('Escreva a observação que aparecerá no mural...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(500);

  const targetInput = new TextInputBuilder()
    .setCustomId('mural_target')
    .setLabel('Usuário (opcional: @nome, usuário ou ID)')
    .setPlaceholder('Deixe em branco para usar você mesmo')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(observationInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(targetInput),
  );
  return modal;
}

async function resolveMuralTargetMember(
  guild: Guild,
  rawTarget: string,
  fallbackUserId: string,
): Promise<{
  id: string;
  tag: string;
  displayName: string;
  avatarUrl: string;
} | null> {
  const trimmed = rawTarget.trim();
  if (!trimmed) {
    const fallbackMember = await guild.members.fetch(fallbackUserId).catch(() => null);
    const fallbackUser =
      fallbackMember?.user ?? (await guild.client.users.fetch(fallbackUserId).catch(() => null));
    if (!fallbackUser) return null;
    return {
      id: fallbackUser.id,
      tag: fallbackUser.tag,
      displayName: fallbackMember?.displayName || fallbackUser.globalName || fallbackUser.username,
      avatarUrl: fallbackUser.displayAvatarURL({
        extension: 'png',
        size: 512,
        forceStatic: true,
      }),
    };
  }

  const mentionMatch = trimmed.match(/^<@!?(\d{15,25})>$/) ?? trimmed.match(/^(\d{15,25})$/);
  if (mentionMatch) {
    const id = mentionMatch[1];
    const member = await guild.members.fetch(id).catch(() => null);
    const user = member?.user ?? (await guild.client.users.fetch(id).catch(() => null));
    if (!user) return null;
    return {
      id: user.id,
      tag: user.tag,
      displayName: member?.displayName || user.globalName || user.username,
      avatarUrl: user.displayAvatarURL({
        extension: 'png',
        size: 512,
        forceStatic: true,
      }),
    };
  }

  const normalizedQuery = trimmed.replace(/^@/, '').toLowerCase();
  const members = await guild.members.fetch().catch(() => guild.members.cache);
  const found =
    members.find(
      (m) =>
        m.user.username.toLowerCase() === normalizedQuery ||
        m.displayName.toLowerCase() === normalizedQuery ||
        (m.user.globalName?.toLowerCase() ?? '') === normalizedQuery,
    ) ??
    members.find(
      (m) =>
        m.user.username.toLowerCase().includes(normalizedQuery) ||
        m.displayName.toLowerCase().includes(normalizedQuery),
    );

  if (!found) return null;

  return {
    id: found.user.id,
    tag: found.user.tag,
    displayName: found.displayName || found.user.globalName || found.user.username,
    avatarUrl: found.user.displayAvatarURL({
      extension: 'png',
      size: 512,
      forceStatic: true,
    }),
  };
}

async function submitMuralRequestToAdmins(options: {
  guild: Guild;
  requesterId: string;
  requesterTag: string;
  target: {
    id: string;
    tag: string;
    displayName: string;
    avatarUrl: string;
  };
  title: string;
  observation: string;
}): Promise<{ ok: boolean; message: string }> {
  const { guild, requesterId, requesterTag, target, title, observation } = options;

  await guild.channels.fetch().catch(() => {});
  const muralChannel = findMuralChannel(guild);

  if (!muralChannel) {
    return {
      ok: false,
      message:
        'Nenhum canal de mural foi encontrado neste servidor (ex.: `#mural-vergonha`).',
    };
  }

  const members = await guild.members.fetch().catch(() => guild.members.cache);
  const adminMembers = members.filter(
    (m) =>
      !m.user.bot &&
      (m.id === guild.ownerId || m.permissions.has(PermissionsBitField.Flags.Administrator)),
  );

  if (adminMembers.size === 0) {
    return {
      ok: false,
      message: 'Nenhum administrador humano foi encontrado neste servidor.',
    };
  }

  const requestId = crypto.randomBytes(8).toString('hex');

  createMuralRequest({
    id: requestId,
    guildId: guild.id,
    guildName: guild.name,
    muralChannelId: muralChannel.id,
    requesterId,
    requesterTag,
    targetUserId: target.id,
    targetUserTag: target.tag,
    targetDisplayName: target.displayName,
    targetAvatarUrl: target.avatarUrl,
    title,
    observation,
    reason: observation,
    status: 'pending',
    handledById: null,
    handledByTag: null,
    reportText: observation,
    publishedChannelId: null,
    publishedMessageId: null,
    createdAt: new Date().toISOString(),
    handledAt: null,
  });

  const dmEmbed = new EmbedBuilder()
    .setColor(UNIFIED_EMBED_COLOR)
    .setTitle(`Pedido de Mural — ${guild.name}`)
    .setDescription(
      [
        `**Título:** ${title}`,
        `**Observação:**\n${observation}`,
        '',
        `**Solicitante:** <@${requesterId}> (${requesterTag})`,
        `**Usuário no mural:** <@${target.id}> (${target.tag})`,
        `**Canal de destino:** <#${muralChannel.id}>`,
        '',
        'Clique em **Aceitar** para publicar o mural exatamente como foi enviado.',
      ].join('\n'),
    )
    .setThumbnail(target.avatarUrl)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mural_accept:${requestId}`)
      .setLabel('Aceitar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`mural_reject:${requestId}`)
      .setLabel('Recusar')
      .setStyle(ButtonStyle.Secondary),
  );

  let sentCount = 0;
  for (const admin of adminMembers.values()) {
    try {
      await admin.send({ embeds: [dmEmbed], components: [row] });
      sentCount += 1;
    } catch {
      // Admin may have DMs disabled
    }
  }

  if (sentCount === 0) {
    deleteMuralRequest(requestId);
    return {
      ok: false,
      message:
        'Não foi possível enviar o pedido na DM de nenhum administrador (as DMs podem estar fechadas).',
    };
  }

  return {
    ok: true,
    message: `Pedido de mural **"${title}"** enviado na DM de **${sentCount}** administrador(es). Assim que alguém aceitar, será publicado em <#${muralChannel.id}>.`,
  };
}

async function handleRequestMuralCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: 'Este comando só pode ser utilizado dentro de um servidor Discord.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const title = interaction.options.getString('titulo')?.trim() ?? '';
  const observation = interaction.options.getString('observacao')?.trim() ?? '';
  const optionUser = interaction.options.getUser('usuario');

  if (!title || !observation) {
    await interaction.showModal(buildMuralRequestModal());
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const targetUser = optionUser ?? interaction.user;
  const member = await guild.members.fetch(targetUser.id).catch(() => null);

  const result = await submitMuralRequestToAdmins({
    guild,
    requesterId: interaction.user.id,
    requesterTag: interaction.user.tag,
    target: {
      id: targetUser.id,
      tag: targetUser.tag,
      displayName: member?.displayName || targetUser.globalName || targetUser.username,
      avatarUrl: targetUser.displayAvatarURL({
        extension: 'png',
        size: 512,
        forceStatic: true,
      }),
    },
    title,
    observation,
  });

  await interaction.editReply(result.message);
}

async function verifyAdminForGuild(
  client: Client,
  guildId: string,
  userId: string,
): Promise<{ ok: boolean; guild?: Guild; error?: string }> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    return { ok: false, error: 'O bot não está mais presente neste servidor.' };
  }
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return { ok: false, error: 'Você não é mais membro deste servidor.' };
  }
  if (!isGuildAdmin(guild, userId, member.permissions)) {
    return {
      ok: false,
      error: 'Apenas administradores do servidor podem aprovar ou recusar pedidos de mural.',
    };
  }
  return { ok: true, guild };
}

export async function handleMuralButtonInteraction(
  interaction: ButtonInteraction,
  client: Client,
): Promise<boolean> {
  const { customId } = interaction;

  // 1. Open "Pedir Mural" modal from channel panel button
  if (customId === 'mural_open_modal_btn') {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Use este botão dentro do servidor.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.showModal(buildMuralRequestModal());
    return true;
  }

  // 2. Open "Pedir Recurso" mural selector from #chorar panel button
  if (customId === 'mural_appeal_start_btn') {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'Use este botão dentro do servidor.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const publishedMurals = getPublishedMuralsForGuild(interaction.guild.id);
    if (publishedMurals.length === 0) {
      await interaction.reply({
        content: 'Não há nenhum mural ativo publicado no momento para pedir recurso.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const limitedMurals = publishedMurals.slice(0, 25);
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('mural_appeal_select')
      .setPlaceholder('Selecione o mural pelo título...')
      .addOptions(
        limitedMurals.map((m) => ({
          label: (m.title?.trim() || 'Mural sem título').slice(0, 100),
          description: `Pessoa: ${(m.targetDisplayName || m.targetUserTag).slice(0, 88)}`,
          value: m.id,
        })),
      );

    await interaction.reply({
      content: 'Selecione abaixo o mural para o qual você deseja **pedir recurso**:',
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  // 3. Open appeal reason modal after selecting mural in #chorar
  if (customId.startsWith('mural_appeal_open_modal:')) {
    const muralId = customId.split(':')[1] ?? '';
    const mural = getMuralRequest(muralId);

    if (!mural || mural.status !== 'accepted') {
      await interaction.reply({
        content: 'Este mural não está mais ativo ou já foi excluído.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`mural_appeal_modal:${mural.id}`)
      .setTitle('Pedir Recurso do Mural');

    const reasonInput = new TextInputBuilder()
      .setCustomId('mural_appeal_reason')
      .setLabel('Por que você não quer mais este mural?')
      .setPlaceholder('Explique o motivo pelo qual este mural deve ser excluído...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(600);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
    await interaction.showModal(modal);
    return true;
  }

  // 4. Admin DM decision on a Mural Appeal ("Aceitar e excluir mural" / "Recusar")
  if (
    customId.startsWith('mural_appeal_accept:') ||
    customId.startsWith('mural_appeal_reject:')
  ) {
    const isAccept = customId.startsWith('mural_appeal_accept:');
    const appealId = customId.split(':')[1] ?? '';
    const appeal = getMuralAppeal(appealId);

    if (!appeal) {
      await interaction.reply({
        content: 'Este pedido de recurso não foi encontrado ou já expirou.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (appeal.status !== 'pending') {
      const statusLabel =
        appeal.status === 'accepted'
          ? `Este recurso já foi aceito por ${appeal.handledByTag ?? 'outro administrador'}.`
          : `Este recurso já foi recusado por ${appeal.handledByTag ?? 'outro administrador'}.`;
      await interaction.update({ components: [] }).catch(async () => {
        await interaction.reply({ content: statusLabel, flags: MessageFlags.Ephemeral });
      });
      return true;
    }

    const adminCheck = await verifyAdminForGuild(client, appeal.guildId, interaction.user.id);
    if (!adminCheck.ok || !adminCheck.guild) {
      await interaction.reply({
        content: adminCheck.error || 'Permissão negada.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const mural = getMuralRequest(appeal.muralId);

    if (!isAccept) {
      updateMuralAppeal(appealId, {
        status: 'rejected',
        handledById: interaction.user.id,
        handledByTag: interaction.user.tag,
        handledAt: new Date().toISOString(),
      });

      await interaction.update({
        content: `Recurso recusado por **${interaction.user.tag}**. O mural foi mantido.`,
        components: [],
      });

      const appellant = await client.users.fetch(appeal.appellantId).catch(() => null);
      if (appellant) {
        await appellant
          .send(
            `Seu pedido de recurso do mural **${mural?.title ?? 'Mural'}** em **${appeal.guildName}** foi recusado por um administrador.`,
          )
          .catch(() => {});
      }
      return true;
    }

    await interaction.deferUpdate();

    let deletedFromDiscord = false;
    if (mural && mural.publishedChannelId && mural.publishedMessageId) {
      const ch = await adminCheck.guild.channels
        .fetch(mural.publishedChannelId)
        .catch(() => null);
      if (isGuildTextOrAnnouncement(ch)) {
        const targetMsg = await ch.messages.fetch(mural.publishedMessageId).catch(() => null);
        if (targetMsg) {
          await targetMsg.delete().catch(() => {});
          deletedFromDiscord = true;
        }
      }
    }

    if (mural) {
      updateMuralRequest(mural.id, { status: 'deleted' });
    }

    updateMuralAppeal(appealId, {
      status: 'accepted',
      handledById: interaction.user.id,
      handledByTag: interaction.user.tag,
      handledAt: new Date().toISOString(),
    });

    await interaction
      .editReply({
        content: deletedFromDiscord
          ? `Recurso aceito por **${interaction.user.tag}**. O mural **"${mural?.title ?? 'Mural'}"** foi excluído automaticamente do canal.`
          : `Recurso aceito por **${interaction.user.tag}**. O mural **"${mural?.title ?? 'Mural'}"** foi marcado como excluído.`,
        components: [],
      })
      .catch(() => {});

    const appellant = await client.users.fetch(appeal.appellantId).catch(() => null);
    if (appellant) {
      await appellant
        .send(
          `Seu pedido de recurso em **${appeal.guildName}** foi aceito! O mural **${mural?.title ?? 'Mural'}** foi excluído.`,
        )
        .catch(() => {});
    }

    return true;
  }

  // 5. Admin DM decision on a Mural Request (1-click Accept or Reject, no admin modal)
  if (!customId.startsWith('mural_accept:') && !customId.startsWith('mural_reject:')) {
    return false;
  }

  const isAccept = customId.startsWith('mural_accept:');
  const requestId = customId.split(':')[1] ?? '';
  const request = getMuralRequest(requestId);

  if (!request) {
    await interaction.reply({
      content: 'Este pedido de mural não foi encontrado ou já expirou.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (request.status !== 'pending') {
    const statusLabel =
      request.status === 'accepted'
        ? `Este pedido já foi aceito por ${request.handledByTag ?? 'outro administrador'}.`
        : `Este pedido já foi recusado por ${request.handledByTag ?? 'outro administrador'}.`;
    await interaction.update({ components: [] }).catch(async () => {
      await interaction.reply({ content: statusLabel, flags: MessageFlags.Ephemeral });
    });
    return true;
  }

  const adminCheck = await verifyAdminForGuild(client, request.guildId, interaction.user.id);
  if (!adminCheck.ok || !adminCheck.guild) {
    await interaction.reply({
      content: adminCheck.error || 'Permissão negada.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (!isAccept) {
    updateMuralRequest(requestId, {
      status: 'rejected',
      handledById: interaction.user.id,
      handledByTag: interaction.user.tag,
      handledAt: new Date().toISOString(),
    });

    await interaction.update({
      content: `Pedido de mural recusado por **${interaction.user.tag}**.`,
      components: [],
    });

    const requester = await client.users.fetch(request.requesterId).catch(() => null);
    if (requester) {
      await requester
        .send(
          `Seu pedido de mural **"${request.title ?? 'Mural'}"** em **${request.guildName}** foi recusado por um administrador.`,
        )
        .catch(() => {});
    }
    return true;
  }

  await interaction.deferUpdate();

  const guild = adminCheck.guild;
  const rawChannel = await guild.channels.fetch(request.muralChannelId).catch(() => null);
  const muralChannel = isGuildTextOrAnnouncement(rawChannel)
    ? rawChannel
    : findMuralChannel(guild);

  if (!muralChannel) {
    await interaction.followUp({
      content: 'O canal de mural do servidor não foi encontrado ou foi removido.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const title = request.title?.trim() || 'Mural';
  const observation =
    request.observation?.trim() || request.reportText?.trim() || request.reason?.trim() || '';
  const targetDisplayName =
    request.targetDisplayName?.trim() || request.targetUserTag.split('#')[0] || request.targetUserTag;
  const targetUsername = request.targetUserTag.replace(/#0$/, '');

  const pngBuffer = await renderMuralCard({
    title,
    observation,
    targetDisplayName,
    targetUsername,
    avatarUrl: request.targetAvatarUrl || null,
  });

  // Send borderless matte-gray PNG mural card with NO Discord Embed
  const publishedMsg = await muralChannel.send({
    content: `<@${request.targetUserId}>`,
    files: [new AttachmentBuilder(pngBuffer, { name: 'mural.png' })],
    allowedMentions: { users: [request.targetUserId] },
  });

  updateMuralRequest(requestId, {
    status: 'accepted',
    handledById: interaction.user.id,
    handledByTag: interaction.user.tag,
    publishedChannelId: muralChannel.id,
    publishedMessageId: publishedMsg.id,
    handledAt: new Date().toISOString(),
  });

  await interaction
    .editReply({
      content: `Mural **"${title}"** aprovado e publicado em <#${muralChannel.id}> por **${interaction.user.tag}**.`,
      components: [],
    })
    .catch(() => {});

  const requester = await client.users.fetch(request.requesterId).catch(() => null);
  if (requester) {
    await requester
      .send(
        `Seu pedido de mural **"${title}"** em **${request.guildName}** foi aceito e publicado em <#${muralChannel.id}>!`,
      )
      .catch(() => {});
  }

  return true;
}

export async function handleMuralSelectInteraction(
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  if (interaction.customId !== 'mural_appeal_select') {
    return false;
  }

  const muralId = interaction.values[0] ?? '';
  const mural = getMuralRequest(muralId);

  if (!mural || mural.status !== 'accepted') {
    await interaction.update({
      content: 'Este mural não está mais ativo ou já foi excluído.',
      components: [],
    });
    return true;
  }

  const title = mural.title?.trim() || 'Mural sem título';
  const obs = mural.observation?.trim() || mural.reportText?.trim() || 'Sem observação';

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mural_appeal_open_modal:${mural.id}`)
      .setLabel('Pedir recurso')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({
    content: [
      `**Mural selecionado:** ${title}`,
      `**Usuário:** <@${mural.targetUserId}>`,
      `**Observação:** ${obs.slice(0, 300)}`,
      '',
      'Clique em **Pedir recurso** abaixo para informar o motivo.',
    ].join('\n'),
    components: [row],
  });

  return true;
}

export async function handleMuralModalInteraction(
  interaction: ModalSubmitInteraction,
): Promise<boolean> {
  // 1. User submitted the "Pedir Mural" modal
  if (interaction.customId === 'mural_request_modal') {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'Este formulário só pode ser enviado dentro de um servidor.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const title = interaction.fields.getTextInputValue('mural_title').trim();
    const observation = interaction.fields.getTextInputValue('mural_observation').trim();
    const rawTarget = interaction.fields.getTextInputValue('mural_target').trim();

    const resolvedTarget = await resolveMuralTargetMember(
      interaction.guild,
      rawTarget,
      interaction.user.id,
    );

    if (!resolvedTarget) {
      await interaction.editReply(
        `Não encontrei o usuário **"${rawTarget}"** neste servidor. Tente enviar novamente usando o \`@usuário\`, ID ou deixe em branco para usar você mesmo.`,
      );
      return true;
    }

    const result = await submitMuralRequestToAdmins({
      guild: interaction.guild,
      requesterId: interaction.user.id,
      requesterTag: interaction.user.tag,
      target: resolvedTarget,
      title,
      observation,
    });

    await interaction.editReply(result.message);
    return true;
  }

  // 2. User submitted the "Pedir Recurso" modal (#chorar)
  if (interaction.customId.startsWith('mural_appeal_modal:')) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'Este formulário só pode ser enviado dentro de um servidor.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const muralId = interaction.customId.split(':')[1] ?? '';
    const mural = getMuralRequest(muralId);

    if (!mural || mural.status !== 'accepted') {
      await interaction.editReply('Este mural não está mais ativo ou já foi excluído.');
      return true;
    }

    const reason = interaction.fields.getTextInputValue('mural_appeal_reason').trim();
    const guild = interaction.guild;

    const members = await guild.members.fetch().catch(() => guild.members.cache);
    const adminMembers = members.filter(
      (m) =>
        !m.user.bot &&
        (m.id === guild.ownerId || m.permissions.has(PermissionsBitField.Flags.Administrator)),
    );

    if (adminMembers.size === 0) {
      await interaction.editReply('Nenhum administrador humano foi encontrado neste servidor.');
      return true;
    }

    const appealId = crypto.randomBytes(8).toString('hex');
    createMuralAppeal({
      id: appealId,
      muralId: mural.id,
      guildId: guild.id,
      guildName: guild.name,
      appellantId: interaction.user.id,
      appellantTag: interaction.user.tag,
      reason,
      status: 'pending',
      handledById: null,
      handledByTag: null,
      createdAt: new Date().toISOString(),
      handledAt: null,
    });

    const muralTitle = mural.title?.trim() || 'Mural sem título';
    const muralObs = mural.observation?.trim() || mural.reportText?.trim() || 'Sem observação';

    const dmEmbed = new EmbedBuilder()
      .setColor(UNIFIED_EMBED_COLOR)
      .setTitle(`Pedido de Recurso (#chorar) — ${guild.name}`)
      .setDescription(
        [
          `**Mural:** ${muralTitle}`,
          `**Observação original:** ${muralObs.slice(0, 300)}`,
          `**Usuário no mural:** <@${mural.targetUserId}> (${mural.targetUserTag})`,
          '',
          `**Solicitante do recurso:** <@${interaction.user.id}> (${interaction.user.tag})`,
          `**Por que não quer mais este mural:**\n${reason}`,
          '',
          'Se aceitar, o mural será **excluído automaticamente** do canal.',
        ].join('\n'),
      )
      .setThumbnail(mural.targetAvatarUrl)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`mural_appeal_accept:${appealId}`)
        .setLabel('Aceitar e excluir mural')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`mural_appeal_reject:${appealId}`)
        .setLabel('Recusar')
        .setStyle(ButtonStyle.Secondary),
    );

    let sentCount = 0;
    for (const admin of adminMembers.values()) {
      try {
        await admin.send({ embeds: [dmEmbed], components: [row] });
        sentCount += 1;
      } catch {
        // Admin may have DMs disabled
      }
    }

    if (sentCount === 0) {
      deleteMuralAppeal(appealId);
      await interaction.editReply(
        'Não foi possível enviar o pedido de recurso na DM de nenhum administrador.',
      );
      return true;
    }

    await interaction.editReply(
      `Seu pedido de recurso para o mural **"${muralTitle}"** foi enviado na DM de **${sentCount}** administrador(es).`,
    );
    return true;
  }

  return false;
}

async function handleKitarCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: 'Este comando só pode ser utilizado dentro de um servidor Discord.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;

  if (guild.ownerId === interaction.user.id) {
    await interaction.reply({
      content: 'Você é o dono do servidor e não pode ser banido pelo bot.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const botMember = guild.members.me ?? (await guild.members.fetchMe());
  if (!botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    await interaction.reply({
      content: 'O bot não possui a permissão **Banir Membros (Ban Members)** neste servidor.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetMember = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!targetMember || !targetMember.bannable) {
    await interaction.reply({
      content:
        'Não é possível aplicar o banimento porque seu cargo é igual ou superior ao cargo do bot.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const confirmId = `kitar_confirm_${interaction.id}`;
  const cancelId = `kitar_cancel_${interaction.id}`;

  const embed = new EmbedBuilder()
    .setColor(UNIFIED_EMBED_COLOR)
    .setTitle('🔨 Confirmação de Banimento (/kitar)')
    .setDescription(
      [
        `<@${interaction.user.id}>, você executou o comando **/kitar**.`,
        '',
        'Se você confirmar, o bot aplicará um **banimento** na sua conta neste servidor.',
        '',
        `🔒 **Quem pode clicar:** somente <@${interaction.user.id}> ou um **Administrador** do servidor.`,
      ].join('\n'),
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel('Confirmar banimento')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary),
  );

  const response = await interaction.reply({
    embeds: [embed],
    components: [row],
    withResponse: true,
  });

  const message = response.resource?.message;
  if (!message) return;

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
  });

  collector.on('collect', async (btn) => {
    const isAuthor = btn.user.id === interaction.user.id;
    const callerIsAdmin = isGuildAdmin(guild, btn.user.id, btn.memberPermissions);

    if (!isAuthor && !callerIsAdmin) {
      await btn.reply({
        content:
          'Permissão negada. Apenas quem enviou o comando ou um administrador pode clicar nestes botões.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (btn.customId === cancelId) {
      collector.stop('cancelled');
      await btn.update({
        content: `Banimento cancelado por <@${btn.user.id}>.`,
        embeds: [],
        components: [],
      });
      return;
    }

    if (btn.customId === confirmId) {
      collector.stop('confirmed');

      try {
        const freshTarget = await guild.members.fetch(interaction.user.id).catch(() => null);
        if (!freshTarget || !freshTarget.bannable) {
          await btn.update({
            content:
              'Não foi possível aplicar o banimento porque o cargo do usuário é igual ou superior ao do bot.',
            embeds: [],
            components: [],
          });
          return;
        }

        await btn.update({
          content: 'Aplicando banimento...',
          embeds: [],
          components: [],
        });

        await guild.members.ban(interaction.user.id, {
          reason: `Auto-banimento confirmado via /kitar (confirmado por ${btn.user.tag})`,
        });

        await interaction
          .editReply({
            content: `🔨 **${interaction.user.tag}** (<@${interaction.user.id}>) foi banido do servidor via \`/kitar\`.`,
            embeds: [],
            components: [],
          })
          .catch(() => {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido ao banir membro.';
        await interaction
          .editReply({
            content: `Não foi possível aplicar o banimento: ${msg}`,
            embeds: [],
            components: [],
          })
          .catch(() => {});
      }
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      await interaction
        .editReply({
          content: 'Tempo de confirmação expirado (60s). Nenhum banimento foi aplicado.',
          embeds: [],
          components: [],
        })
        .catch(() => {});
    }
  });
}

export async function dispatchAdditionalSlashCommand(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  switch (interaction.commandName) {
    case 'lock':
      await handleLockCommand(interaction);
      return true;
    case 'unlock':
      await handleUnlockCommand(interaction);
      return true;
    case 'nuke':
      await handleNukeCommand(interaction);
      return true;
    case 'excluir-mensagens':
      await handleClearMessagesCommand(interaction);
      return true;
    case 'beijar':
      await handleKissCommand(interaction);
      return true;
    case 'pedir-mural':
      await handleRequestMuralCommand(interaction);
      return true;
    case 'kitar':
      await handleKitarCommand(interaction);
      return true;
    default:
      return false;
  }
}
