import fs from 'node:fs';
import path from 'node:path';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  FileUploadBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
  type Attachment,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildBasedChannel,
  type ModalSubmitInteraction,
  type NewsChannel,
  type TextChannel,
} from 'discord.js';
import {
  generateExpCarousel,
  generateExpDraftPreview,
  generateExpVideo,
} from './expMediaGenerator.ts';
import {
  allocateUniqueExpNumber,
  clearExpDraftMediaDir,
  createExpRecord,
  deleteExpDraft,
  formatExpCaption,
  formatExpCode,
  getExpDraft,
  getExpDraftMediaDir,
  getExpDraftMediaFilePath,
  getExpMediaFilePath,
  getExpRecord,
  getGuildTikTokOwner,
  getNextPreviewExpNumber,
  parseEvidenceLinks,
  promoteDraftMediaToExp,
  saveExpDraft,
  updateExpRecord,
  validateExpNoPrivateData,
  type ExpDraftRecord,
  type ExpFormat,
  type ExpRecord,
} from './expStore.ts';
import {
  getAnyConnectedTikTok,
  getTikTokConnection,
  publishExpToTikTok,
} from './tiktokService.ts';
import { selectRussianTrackForPost } from './tiktokMusic.ts';
import {
  findExpChannelInGuild,
  normalizeDiscordName,
  toTinyFont,
} from './channelUtils.ts';

function normalizeChannelName(name: string): string {
  return normalizeDiscordName(name);
}

function isGuildTextOrAnnouncement(
  channel: GuildBasedChannel | null | undefined,
): channel is TextChannel | NewsChannel {
  return Boolean(
    channel &&
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement),
  );
}

function isGuildAdmin(
  guild: Guild,
  userId: string,
  memberPermissions?: Readonly<PermissionsBitField> | null,
): boolean {
  if (guild.ownerId === userId) return true;
  return memberPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
}

export function findExpChannel(guild: Guild): TextChannel | NewsChannel | null {
  return findExpChannelInGuild(guild);
}

async function enforceReadOnlyPermissions(
  channel: TextChannel | NewsChannel,
  guild: Guild,
): Promise<void> {
  const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!botMember) return;

  const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
  const alreadyDeniesMessages =
    Boolean(everyoneOverwrite?.deny.has(PermissionsBitField.Flags.SendMessages)) &&
    Boolean(everyoneOverwrite?.deny.has(PermissionsBitField.Flags.SendMessagesInThreads));

  const botOverwrite = channel.permissionOverwrites.cache.get(botMember.id);
  const botAlreadyAllowed =
    Boolean(botOverwrite?.allow.has(PermissionsBitField.Flags.ViewChannel)) &&
    Boolean(botOverwrite?.allow.has(PermissionsBitField.Flags.SendMessages)) &&
    Boolean(botOverwrite?.allow.has(PermissionsBitField.Flags.EmbedLinks)) &&
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

const UNIFIED_EMBED_COLOR = 0x1e2025;

async function findBotButtonMessage(
  channel: TextChannel | NewsChannel,
  botUserId: string,
  customId: string,
) {
  try {
    const messages = await channel.messages.fetch({ limit: 25 });
    for (const msg of messages.values()) {
      if (msg.author.id !== botUserId) continue;
      for (const row of msg.components) {
        if (!('components' in row)) continue;
        for (const comp of row.components) {
          if ('customId' in comp && comp.customId === customId) {
            return msg;
          }
        }
      }
    }
  } catch {
    // Ignore transient fetch issues
  }
  return null;
}

/**
 * Restores the #exp channel if it does not exist on the guild, configures read-only permissions,
 * and posts the permanent interactive panel with button "EXPONHA UMA OCORRÊNCIA".
 */
export async function ensureExpPanelForGuild(guild: Guild): Promise<void> {
  const botUserId = guild.client.user?.id;
  if (!botUserId) return;

  await guild.channels.fetch().catch(() => {});
  let expChannel = findExpChannel(guild);

  if (!expChannel) {
    const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return;
    }

    let targetParentId: string | undefined;
    for (const ch of guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildCategory) continue;
      const norm = normalizeChannelName(ch.name);
      if (norm.includes('mural') || norm.includes('servic')) {
        targetParentId = ch.id;
        break;
      }
    }

    try {
      const created = await guild.channels.create({
        name: toTinyFont('exp'),
        type: ChannelType.GuildText,
        parent: targetParentId,
        topic:
          'Clique em EXPONHA UMA OCORRÊNCIA para preencher informações, anexar foto/provas e visualizar a prévia privada.',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.SendMessagesInThreads,
            ],
          },
          {
            id: botMember.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ManageMessages,
            ],
          },
        ],
        reason: 'Restauração automática do canal EXP',
      });
      if (isGuildTextOrAnnouncement(created)) {
        expChannel = created;
      }
    } catch {
      return;
    }
  }

  if (!expChannel) return;

  await enforceReadOnlyPermissions(expChannel, guild);
  const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const perms = botMember ? expChannel.permissionsFor(botMember) : null;
  if (
    !perms?.has(PermissionsBitField.Flags.ViewChannel) ||
    !perms?.has(PermissionsBitField.Flags.SendMessages)
  ) {
    return;
  }

  const panelDescription = [
    'Utilize este canal para registrar ocorrências com informações, fotos, provas e comentários adicionais.',
    '',
    '**Como funciona:**',
    '1. Clique em **EXPONHA UMA OCORRÊNCIA** abaixo e preencha o formulário único (informações, foto opcional, provas, mais informações e insultos adicionais opcionais).',
    '2. Ao enviar, você receberá **neste mesmo canal** uma mensagem privada (visível só para você) com uma **imagem de exemplo** de como ficará o post.',
    '3. Clique em **Confirmar** para encaminhar aos administradores. Se aprovado, o conteúdo será publicado automaticamente no TikTok.',
  ].join('\n');

  const panelEmbed = new EmbedBuilder()
    .setColor(UNIFIED_EMBED_COLOR)
    .setTitle('Sistema de Exposição · EXP (5573 Satan)')
    .setDescription(panelDescription)
    .setFooter({ text: '5573 Satan • Prévia privada antes do envio · Publicação automática após aprovação' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('exp_open_modal_btn')
      .setLabel('EXPONHA UMA OCORRÊNCIA')
      .setStyle(ButtonStyle.Secondary),
  );

  const existingPanelMsg = await findBotButtonMessage(
    expChannel,
    botUserId,
    'exp_open_modal_btn',
  );
  if (existingPanelMsg) {
    const currentEmbed = existingPanelMsg.embeds[0];
    const needsUpdate =
      !currentEmbed ||
      currentEmbed.description !== panelDescription ||
      currentEmbed.color !== UNIFIED_EMBED_COLOR;
    if (needsUpdate) {
      await existingPanelMsg
        .edit({
          embeds: [panelEmbed],
          components: [row],
        })
        .catch(() => {});
    }
    return;
  }

  await expChannel
    .send({
      embeds: [panelEmbed],
      components: [row],
    })
    .catch(() => {});
}

/**
 * Single-screen Discord Modal (strictly <= 45 chars per Label and <= 100 chars per Description).
 * Shows:
 * 1. Informações
 * 2. Foto da pessoa ou outra foto (opcional)
 * 3. Prova (imagens, prints ou vídeos)
 * 4. Mais informações
 * 5. Insultos adicionais (opcional)
 */
export function buildExpCreateModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('exp_create_modal')
    .setTitle('Exponha uma Ocorrência (Ficha)')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Upload da imagem da pessoa')
        .setDescription('Anexe a foto da pessoa para gerar a ficha.')
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId('exp_person_photo')
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(1),
        ),
      new LabelBuilder()
        .setLabel('Escreva os dados')
        .setDescription('Digite os dados e informações do ocorrido.')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('exp_info')
            .setPlaceholder('Ex.: @usuario — dados pessoais e resumo...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(1200),
        ),
    );
}

function isAllowedDiscordAttachmentUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'cdn.discordapp.com' ||
      host === 'media.discordapp.net' ||
      host.endsWith('.discordapp.com') ||
      host.endsWith('.discordapp.net')
    );
  } catch {
    return false;
  }
}

function inferAttachmentExt(attachment: Attachment): string {
  const ct = (attachment.contentType || '').toLowerCase();
  if (ct.includes('png')) return '.png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('mp4')) return '.mp4';
  if (ct.includes('quicktime') || ct.includes('mov')) return '.mov';

  const nameExt = path.extname(attachment.name || '').toLowerCase();
  if (/^\.(png|jpg|jpeg|webp|gif|mp4|mov)$/.test(nameExt)) {
    return nameExt === '.jpeg' ? '.jpg' : nameExt;
  }
  return '.jpg';
}

async function downloadModalAttachment(
  attachment: Attachment,
  destDir: string,
  filenamePrefix: string,
): Promise<string | null> {
  if (!attachment?.url || !isAllowedDiscordAttachmentUrl(attachment.url)) return null;
  if (typeof attachment.size === 'number' && attachment.size > 18 * 1024 * 1024) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(attachment.url, { signal: controller.signal });
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 18 * 1024 * 1024) return null;

    const ext = inferAttachmentExt(attachment);
    const filename = `${filenamePrefix}${ext}`;
    const fullPath = path.resolve(destDir, filename);
    fs.writeFileSync(fullPath, buf);
    return filename;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function splitInfoIntoSubjectAndDescription(rawInfo: string): {
  involvedName: string;
  description: string;
} {
  const cleaned = rawInfo.trim();
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let involvedName = '';
  let description = cleaned;

  if (lines.length >= 2 && lines[0].length <= 65 && !/[.!?]$/.test(lines[0])) {
    involvedName = lines[0].replace(/^(?:pessoa|nome|alvo)\s*:\s*/i, '').trim();
    description = lines.slice(1).join(' ').trim() || cleaned;
  } else {
    const handleMatch = cleaned.match(/@[a-zA-Z0-9._-]{2,32}/);
    if (handleMatch) {
      involvedName = handleMatch[0];
    }
  }

  return {
    involvedName: involvedName.slice(0, 80),
    description: description.slice(0, 480),
  };
}

function getDraftLocalMediaPaths(draft: ExpDraftRecord): {
  personPhotoPath: string | null;
  localProofPaths: string[];
} {
  const personPhotoPath = draft.personPhotoFile
    ? getExpDraftMediaFilePath(draft.guildId, draft.userId, draft.personPhotoFile)
    : null;
  const localProofPaths = (draft.proofFiles ?? [])
    .map((f) => getExpDraftMediaFilePath(draft.guildId, draft.userId, f))
    .filter((p): p is string => Boolean(p && fs.existsSync(p)));

  return {
    personPhotoPath: personPhotoPath && fs.existsSync(personPhotoPath) ? personPhotoPath : null,
    localProofPaths,
  };
}

async function renderEphemeralPreviewPayload(draft: ExpDraftRecord) {
  const format: ExpFormat = draft.selectedFormat === 'video' ? 'video' : 'carousel';
  const previewNumber = getNextPreviewExpNumber();
  const previewCaption = formatExpCaption(previewNumber);
  const { personPhotoPath, localProofPaths } = getDraftLocalMediaPaths(draft);

  const previewBuffer = await generateExpDraftPreview({
    nextExpNumber: previewNumber,
    involvedName: draft.involvedName,
    description: draft.description,
    whatHappened: draft.whatHappened,
    whyWrong: draft.whyWrong,
    additionalInsults: draft.additionalInsults,
    mediaLinks: draft.mediaLinks,
    mediaLinksCount: draft.mediaLinks.length,
    otherLinksCount: draft.otherLinks.length,
    personPhotoPath,
    localProofPaths,
    format,
  });

  const formatLabel = format === 'carousel' ? 'Carrossel de imagens' : 'Vídeo';
  const altFormat: ExpFormat = format === 'carousel' ? 'video' : 'carousel';
  const altLabel = altFormat === 'carousel' ? 'Trocar para Carrossel' : 'Trocar para Vídeo';
  const proofCount = localProofPaths.length + draft.mediaLinks.length + draft.otherLinks.length;

  const previewEmbed = new EmbedBuilder()
    .setColor(UNIFIED_EMBED_COLOR)
    .setTitle(`Exemplo da Publicação (${formatLabel})`)
    .setDescription(
      [
        'Esta mensagem e imagem de exemplo são **visíveis apenas para você** neste canal.',
        '',
        `**Identificação prevista:** \`${previewCaption}\``,
        draft.involvedName
          ? `**Pessoa:** ${draft.involvedName}`
          : '**Pessoa:** Informada na descrição',
        `**Informações:** ${draft.description.slice(0, 260)}`,
        `**Mais informações:** ${draft.whatHappened.slice(0, 260)}`,
        draft.additionalInsults?.trim()
          ? `**Insultos adicionais:** ${draft.additionalInsults.trim().slice(0, 200)}`
          : '',
        `**Foto anexada:** ${personPhotoPath ? 'Sim' : 'Não enviada'} · **Provas:** ${proofCount} item(ns)`,
        '',
        'Se estiver tudo certo, clique em **Confirmar** para enviar aos administradores. Se eles aprovarem, o sistema publicará automaticamente no TikTok.',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .setImage('attachment://previa-exp.jpg');

  const previewActions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('exp_submit_to_admin_btn')
      .setLabel('Confirmar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`exp_choose_format:${altFormat}`)
      .setLabel(altLabel)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('exp_cancel_draft_btn')
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    content: '',
    embeds: [previewEmbed],
    files: [new AttachmentBuilder(previewBuffer, { name: 'previa-exp.jpg' })],
    components: [previewActions],
  };
}

function resolveTikTokUserForGuild(guildId: string, adminUserId: string): string | null {
  const owner = getGuildTikTokOwner(guildId);
  if (owner && getTikTokConnection(owner)) return owner;
  if (getTikTokConnection(adminUserId)) return adminUserId;
  const fallback = getAnyConnectedTikTok([owner || '', adminUserId]);
  return fallback?.discordUserId ?? null;
}

async function deliverTikTokOutcomeToAdmin(
  interaction: ButtonInteraction,
  client: Client,
  record: ExpRecord,
  outcome: Awaited<ReturnType<typeof publishExpToTikTok>>,
  attachments: AttachmentBuilder[],
): Promise<void> {
  const expCode = record.expCode || formatExpCode(record.expNumber || 1);
  const caption = record.caption || formatExpCaption(record.expNumber || 1);

  if (outcome.outcome === 'published') {
    updateExpRecord(record.id, {
      status: 'published_tiktok',
      tiktokPublishId: outcome.publishId ?? null,
      tiktokPublishMode: outcome.publishMode ?? null,
      tiktokStatusText: outcome.statusText,
      tiktokPostUrl: outcome.platformPostUrl ?? null,
      tiktokError: null,
    });
    await interaction
      .editReply({
        content: [
          `✅ **${expCode}** aprovado, gerado e publicado automaticamente no TikTok via Zernio!`,
          `**Padrão:** \`${caption}\``,
          `**Formato:** ${record.format === 'carousel' ? 'Carrossel de imagens' : 'Vídeo'}`,
          `**Resultado:** ${outcome.statusText}`,
          outcome.publishId ? `**Post ID (Zernio):** \`${outcome.publishId}\`` : '',
          outcome.platformPostUrl ? `**Link:** ${outcome.platformPostUrl}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        embeds: [],
        components: [],
        files: attachments.slice(0, 4),
      })
      .catch(() => {});
  } else if (outcome.outcome === 'inbox_draft') {
    updateExpRecord(record.id, {
      status: 'tiktok_inbox',
      tiktokPublishId: outcome.publishId ?? null,
      tiktokPublishMode: outcome.publishMode ?? 'inbox_draft',
      tiktokStatusText: outcome.statusText,
      tiktokPostUrl: outcome.platformPostUrl ?? null,
      tiktokError: null,
    });
    await interaction
      .editReply({
        content: [
          `📲 **${expCode}** enviado como rascunho no TikTok via Zernio!`,
          `**Padrão:** \`${caption}\``,
          `**Status:** ${outcome.statusText}`,
          outcome.publishId ? `**Post ID (Zernio):** \`${outcome.publishId}\`` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        embeds: [],
        components: [],
        files: attachments.slice(0, 4),
      })
      .catch(() => {});
  } else {
    updateExpRecord(record.id, {
      status: 'tiktok_error',
      tiktokStatusText: outcome.statusText,
      tiktokError: outcome.error ?? outcome.statusText,
    });
    await interaction
      .editReply({
        content: [
          `✅ **${expCode}** aprovado e conteúdo gerado com sucesso!`,
          `**Padrão:** \`${caption}\``,
          `⚠️ **Status TikTok:** ${outcome.statusText}`,
          outcome.error ? `**Detalhe:** ${outcome.error}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        embeds: [],
        components: [],
        files: attachments.slice(0, 4),
      })
      .catch(() => {});
  }

  const requester = await client.users.fetch(record.requesterId).catch(() => null);
  if (requester) {
    await requester
      .send(
        `Sua exposição **${expCode}** (\`${record.id}\`) em **${record.guildName}** foi **ACEITA** pela administração e encaminhada automaticamente para publicação!`,
      )
      .catch(() => {});
  }
}

export async function handleExpButtonInteraction(
  interaction: ButtonInteraction,
  client: Client,
): Promise<boolean> {
  const customId = interaction.customId;

  // 1. Open single-screen creation modal IMMEDIATELY (zero awaits before showModal!)
  if (customId === 'exp_open_modal_btn') {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'Use este botão dentro de um servidor Discord.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.showModal(buildExpCreateModal());
    return true;
  }

  // 2. Cancel draft
  if (customId === 'exp_cancel_draft_btn') {
    if (interaction.guildId) {
      clearExpDraftMediaDir(interaction.guildId, interaction.user.id);
      deleteExpDraft(interaction.guildId, interaction.user.id);
    }
    await interaction.update({
      content: 'Envio cancelado. Nenhuma ocorrência foi registrada.',
      embeds: [],
      files: [],
      components: [],
    });
    return true;
  }

  // 3. Switch preview format (Carrossel / Vídeo) and update ephemeral preview in same channel
  if (customId === 'exp_choose_format:carousel' || customId === 'exp_choose_format:video') {
    if (!interaction.guildId) return true;
    const draft = getExpDraft(interaction.guildId, interaction.user.id);
    if (!draft) {
      await interaction.update({
        content: 'Seu rascunho expirou. Clique em EXPONHA UMA OCORRÊNCIA novamente.',
        embeds: [],
        files: [],
        components: [],
      });
      return true;
    }

    const format: ExpFormat = customId.endsWith(':video') ? 'video' : 'carousel';
    await interaction.deferUpdate();

    const updatedDraft = saveExpDraft({
      ...draft,
      selectedFormat: format,
      updatedAt: new Date().toISOString(),
    });

    const payload = await renderEphemeralPreviewPayload(updatedDraft);
    await interaction.editReply(payload);
    return true;
  }

  // 4. Confirmar -> promote uploaded media, save ExpRecord and deliver to Administrator DMs
  if (customId === 'exp_submit_to_admin_btn') {
    if (!interaction.inGuild() || !interaction.guild) return true;
    const draft = getExpDraft(interaction.guild.id, interaction.user.id);
    if (!draft) {
      await interaction.update({
        content: 'Rascunho inválido ou expirado. Clique em EXPONHA UMA OCORRÊNCIA novamente.',
        embeds: [],
        files: [],
        components: [],
      });
      return true;
    }

    await interaction.deferUpdate();

    const guild = interaction.guild;
    const members = await guild.members.fetch().catch(() => guild.members.cache);
    const adminMembers = members.filter(
      (m) =>
        !m.user.bot &&
        (m.id === guild.ownerId || m.permissions.has(PermissionsBitField.Flags.Administrator)),
    );

    if (adminMembers.size === 0) {
      await interaction.editReply({
        content: 'Nenhum administrador humano com DM disponível foi encontrado neste servidor.',
        embeds: [],
        files: [],
        components: [],
      });
      return true;
    }

    const initialRecord = createExpRecord({
      guildId: guild.id,
      guildName: guild.name,
      requesterId: interaction.user.id,
      requesterTag: interaction.user.tag,
      involvedName: draft.involvedName,
      description: draft.description,
      whatHappened: draft.whatHappened,
      whyWrong: draft.whyWrong,
      additionalInsults: draft.additionalInsults,
      mediaLinks: draft.mediaLinks,
      otherLinks: draft.otherLinks,
      format: draft.selectedFormat || 'carousel',
      status: 'pending',
      expNumber: null,
      expCode: null,
      caption: null,
      generatedFiles: [],
      handledById: null,
      handledByTag: null,
      handledAt: null,
      tiktokPublishId: null,
      tiktokPublishMode: null,
      tiktokStatusText: null,
      tiktokError: null,
    });

    const promoted = promoteDraftMediaToExp(
      guild.id,
      interaction.user.id,
      initialRecord.id,
      draft.personPhotoFile,
      draft.proofFiles,
    );

    const record =
      updateExpRecord(initialRecord.id, {
        personPhotoFile: promoted.personPhotoFile,
        proofFiles: promoted.proofFiles,
      }) ?? initialRecord;

    deleteExpDraft(guild.id, interaction.user.id);

    const formatLabel = record.format === 'carousel' ? 'Carrossel de imagens' : 'Vídeo';
    const dmAttachmentPaths: string[] = [];
    if (promoted.personPhotoFile) {
      const p = getExpMediaFilePath(record.id, promoted.personPhotoFile);
      if (p && fs.existsSync(p)) dmAttachmentPaths.push(p);
    }
    for (const pf of promoted.proofFiles.slice(0, 3)) {
      const p = getExpMediaFilePath(record.id, pf);
      if (p && fs.existsSync(p)) dmAttachmentPaths.push(p);
    }

    const evidenceSummary = [
      promoted.personPhotoFile
        ? '• **Foto da pessoa / extra:** Anexada abaixo'
        : '• **Foto da pessoa / extra:** Não enviada',
      promoted.proofFiles.length > 0
        ? `• **Provas anexadas:** ${promoted.proofFiles.length} arquivo(s) abaixo`
        : '',
      record.mediaLinks.length > 0
        ? `• **Links de mídia:**\n${record.mediaLinks.map((u) => `  - ${u}`).join('\n')}`
        : '',
      record.otherLinks.length > 0
        ? `• **Outros links:**\n${record.otherLinks.map((u) => `  - ${u}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const dmEmbed = new EmbedBuilder()
      .setColor(UNIFIED_EMBED_COLOR)
      .setTitle(`Novo Recurso EXP · ${record.id}`)
      .setDescription(
        [
          `**Identificação:** \`${record.id}\``,
          `**Servidor:** ${guild.name}`,
          `**Enviado por:** <@${record.requesterId}> (${record.requesterTag})`,
          `**Formato:** ${formatLabel}`,
          record.involvedName ? `**Pessoa:** ${record.involvedName}` : '',
          '',
          `**Informações:**\n${record.description}`,
          '',
          `**Mais informações:**\n${record.whatHappened}`,
          record.additionalInsults?.trim()
            ? `\n**Insultos adicionais:**\n${record.additionalInsults.trim()}`
            : '',
          '',
          evidenceSummary || '**Provas:** Nenhuma anexada',
          '',
          'Clique em **ACEITAR** para gerar e publicar automaticamente no TikTok, ou **RECUSAR** para descartar.',
        ]
          .filter((line) => line !== undefined)
          .join('\n')
          .slice(0, 4000),
      )
      .setTimestamp();

    const adminRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`exp_admin_accept:${record.id}`)
        .setLabel('ACEITAR')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`exp_admin_reject:${record.id}`)
        .setLabel('RECUSAR')
        .setStyle(ButtonStyle.Danger),
    );

    let sentCount = 0;
    for (const admin of adminMembers.values()) {
      try {
        const filesForAdmin = dmAttachmentPaths.map((p) => new AttachmentBuilder(p));
        await admin.send({
          embeds: [dmEmbed],
          components: [adminRow],
          files: filesForAdmin,
        });
        sentCount += 1;
      } catch {
        // Admin DM closed
      }
    }

    if (sentCount === 0) {
      updateExpRecord(record.id, { status: 'rejected', handledAt: new Date().toISOString() });
      await interaction.editReply({
        content:
          'Não foi possível entregar o recurso na DM de nenhum administrador (DMs bloqueadas).',
        embeds: [],
        files: [],
        components: [],
      });
      return true;
    }

    await interaction.editReply({
      content: `✅ Recurso \`${record.id}\` confirmado e enviado para **${sentCount}** administrador(es)! Se aprovado, ele será publicado automaticamente no TikTok.`,
      embeds: [],
      files: [],
      components: [],
    });
    return true;
  }

  // 5. Admin Accept / Reject EXP on DM
  if (customId.startsWith('exp_admin_accept:') || customId.startsWith('exp_admin_reject:')) {
    const isAccept = customId.startsWith('exp_admin_accept:');
    const expId = customId.split(':')[1] ?? '';
    const record = getExpRecord(expId);

    if (!record) {
      await interaction.reply({
        content: 'Este recurso EXP não foi encontrado ou já expirou.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (record.status !== 'pending') {
      await interaction
        .update({
          content: `Este recurso (\`${record.id}\`) já foi processado por ${record.handledByTag ?? 'outro administrador'}.`,
          components: [],
        })
        .catch(async () => {
          await interaction.reply({
            content: `Recurso já processado por ${record.handledByTag ?? 'outro administrador'}.`,
            flags: MessageFlags.Ephemeral,
          });
        });
      return true;
    }

    const guild = await client.guilds.fetch(record.guildId).catch(() => null);
    if (!guild) {
      await interaction.reply({
        content: 'O servidor deste recurso não está mais acessível pelo bot.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member || !isGuildAdmin(guild, interaction.user.id, member.permissions)) {
      await interaction.reply({
        content: 'Permissão negada. Apenas administradores do servidor podem decidir este recurso.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!isAccept) {
      updateExpRecord(expId, {
        status: 'rejected',
        handledById: interaction.user.id,
        handledByTag: interaction.user.tag,
        handledAt: new Date().toISOString(),
      });

      await interaction.update({
        content: `❌ Recurso \`${record.id}\` recusado por **${interaction.user.tag}**.`,
        embeds: [],
        components: [],
      });

      const requester = await client.users.fetch(record.requesterId).catch(() => null);
      if (requester) {
        await requester
          .send(
            `Seu recurso de exposição \`${record.id}\` em **${record.guildName}** foi recusado por um administrador.`,
          )
          .catch(() => {});
      }
      return true;
    }

    await interaction.deferUpdate();

    const allocation = allocateUniqueExpNumber(record.id);
    updateExpRecord(record.id, {
      status: 'accepted',
      expNumber: allocation.expNumber,
      expCode: allocation.expCode,
      caption: allocation.caption,
      handledById: interaction.user.id,
      handledByTag: interaction.user.tag,
      handledAt: new Date().toISOString(),
    });

    await interaction
      .editReply({
        content: `⏳ **${allocation.expCode}** aprovado por **${interaction.user.tag}**. Gerando ${record.format === 'carousel' ? 'carrossel de imagens' : 'vídeo com legendas'} e publicando automaticamente no TikTok...`,
        components: [],
      })
      .catch(() => {});

    const personPhotoPath = record.personPhotoFile
      ? getExpMediaFilePath(record.id, record.personPhotoFile)
      : null;
    const localProofPaths = (record.proofFiles ?? [])
      .map((f) => getExpMediaFilePath(record.id, f))
      .filter((p): p is string => Boolean(p && fs.existsSync(p)));

    const mediaInput = {
      expId: record.id,
      expNumber: allocation.expNumber,
      involvedName: record.involvedName,
      description: record.description,
      whatHappened: record.whatHappened,
      whyWrong: record.whyWrong,
      additionalInsults: record.additionalInsults,
      mediaLinks: record.mediaLinks,
      otherLinks: record.otherLinks,
      personPhotoPath: personPhotoPath && fs.existsSync(personPhotoPath) ? personPhotoPath : null,
      localProofPaths,
    };

    const attachments: AttachmentBuilder[] = [];
    let generatedFiles: string[] = [];
    const russianTrack = await selectRussianTrackForPost(record.audioTrack ?? null).catch(() => null);
    const trackMeta = russianTrack
      ? {
          id: russianTrack.id,
          artist: russianTrack.artist,
          title: russianTrack.title,
          previewUrl: russianTrack.previewUrl,
        }
      : record.audioTrack ?? null;

    if (record.format === 'carousel') {
      const car = await generateExpCarousel(mediaInput);
      generatedFiles = car.files;
      for (const filePath of car.filePaths.slice(0, 4)) {
        attachments.push(new AttachmentBuilder(filePath));
      }
    } else {
      const vid = await generateExpVideo(mediaInput, russianTrack?.localPath ?? null);
      generatedFiles = vid.files;
      attachments.push(
        new AttachmentBuilder(vid.videoPath, { name: 'video.mp4' }),
      );
    }

    const updatedRecord =
      updateExpRecord(record.id, { generatedFiles, audioTrack: trackMeta }) ??
      ({ ...record, ...allocation, generatedFiles, audioTrack: trackMeta, status: 'accepted' } as ExpRecord);

    const tiktokDiscordOwner = resolveTikTokUserForGuild(record.guildId, interaction.user.id);
    const outcome = await publishExpToTikTok(updatedRecord, tiktokDiscordOwner, 'auto');

    await deliverTikTokOutcomeToAdmin(interaction, client, updatedRecord, outcome, attachments);
    return true;
  }

  // 6. Final TikTok API manual retry/confirm buttons if ever present in older DMs
  if (
    customId.startsWith('exp_tiktok_confirm_inbox:') ||
    customId.startsWith('exp_tiktok_confirm_private:') ||
    customId.startsWith('exp_tiktok_skip:')
  ) {
    const expId = customId.split(':')[1] ?? '';
    const record = getExpRecord(expId);
    if (!record) {
      await interaction.reply({
        content: 'Registro EXP não encontrado.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (customId.startsWith('exp_tiktok_skip:')) {
      await interaction.update({
        content: `✅ **${record.expCode ?? record.id}** mantido no histórico apenas como conteúdo gerado (não enviado ao TikTok).`,
        components: [],
      });
      return true;
    }

    await interaction.deferUpdate();
    const mode = customId.startsWith('exp_tiktok_confirm_inbox:')
      ? 'inbox_draft'
      : 'direct_private';

    const tiktokDiscordOwner = resolveTikTokUserForGuild(record.guildId, interaction.user.id);
    const outcome = await publishExpToTikTok(record, tiktokDiscordOwner, mode);

    const attachments: AttachmentBuilder[] = [];
    for (const file of record.generatedFiles.slice(0, 1)) {
      const p = getExpMediaFilePath(record.id, file);
      if (p) attachments.push(new AttachmentBuilder(p));
    }

    await deliverTikTokOutcomeToAdmin(interaction, client, record, outcome, attachments);
    return true;
  }

  return false;
}

export async function handleExpModalInteraction(
  interaction: ModalSubmitInteraction,
): Promise<boolean> {
  if (interaction.customId === 'exp_create_modal') {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'Este formulário só pode ser enviado dentro de um servidor.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    // Acknowledge immediately with an ephemeral reply in the same channel
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const rawInfo = interaction.fields.getTextInputValue('exp_info').trim();
    const privacyCheck = validateExpNoPrivateData({
      description: rawInfo,
      whatHappened: rawInfo,
    });

    if (!privacyCheck.ok) {
      await interaction.editReply({
        content: privacyCheck.reason || 'Preencha os dados obrigatórios do relato.',
      });
      return true;
    }

    const { involvedName, description } = splitInfoIntoSubjectAndDescription(rawInfo);
    const extractedLinks = parseEvidenceLinks(rawInfo);
    const mediaLinks = extractedLinks.filter((u) =>
      /\.(png|jpe?g|webp|gif|mp4|mov)(\?|$)/i.test(u) || u.includes('cdn.discordapp.com'),
    );
    const otherLinks = extractedLinks.filter((u) => !mediaLinks.includes(u));

    clearExpDraftMediaDir(interaction.guild.id, interaction.user.id);
    const draftDir = getExpDraftMediaDir(interaction.guild.id, interaction.user.id);

    let personPhotoFile: string | null = null;
    try {
      const uploadedPerson = interaction.fields.getUploadedFiles('exp_person_photo', false);
      const firstPerson = uploadedPerson?.first();
      if (firstPerson) {
        personPhotoFile = await downloadModalAttachment(firstPerson, draftDir, 'person');
      }
    } catch {
      personPhotoFile = null;
    }

    const draft = saveExpDraft({
      key: `${interaction.guild.id}:${interaction.user.id}`,
      guildId: interaction.guild.id,
      guildName: interaction.guild.name,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      involvedName,
      description,
      whatHappened: rawInfo,
      whyWrong: '',
      additionalInsults: '',
      mediaLinks,
      otherLinks,
      personPhotoFile,
      proofFiles: [],
      selectedFormat: 'carousel',
      previewImagePath: null,
      updatedAt: new Date().toISOString(),
    });

    const payload = await renderEphemeralPreviewPayload(draft);
    await interaction.editReply(payload);
    return true;
  }

  return false;
}
