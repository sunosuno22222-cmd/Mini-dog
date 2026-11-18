import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  type ButtonInteraction,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type NewsChannel,
  type PartialGuildMember,
  type Role,
  type TextChannel,
} from 'discord.js';
import sharp from 'sharp';
import {
  findRegistroChannelInGuild,
  isGuildTextOrAnnouncement,
  normalizeDiscordName,
  toTinyFont,
} from './channelUtils.ts';

const execFileAsync = promisify(execFile);

const UNIFIED_EMBED_COLOR = 0x1e2025;
const EMOJI_PACK_DIR = path.resolve(process.cwd(), 'server', 'assets', 'emojis-gulosos');
const MAX_DISCORD_EMOJI_BYTES = 256 * 1024;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeDiscordEmojiName(filename: string): string {
  let base = filename.replace(/\.(png|gif|jpg|jpeg|webp)$/i, '').replace(/\.gif$/i, '');
  base = base
    .replace(/^\d+[-_]/, '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  if (base.length < 2) {
    base = `emoji_${base || 'pack'}`;
  }
  return base;
}

function detectImageMime(buf: Buffer): 'image/gif' | 'image/png' | 'image/jpeg' | 'image/webp' {
  if (buf.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (buf.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

async function ensureUnderDiscordEmojiLimit(
  buf: Buffer,
  mime: 'image/gif' | 'image/png' | 'image/jpeg' | 'image/webp',
): Promise<{ buffer: Buffer; mime: string }> {
  if (buf.byteLength <= MAX_DISCORD_EMOJI_BYTES) {
    return { buffer: buf, mime };
  }

  if (mime === 'image/gif') {
    const tmpIn = path.resolve('/tmp', `emoji_in_${Date.now()}.gif`);
    const tmpOut = path.resolve('/tmp', `emoji_out_${Date.now()}.gif`);
    try {
      fs.writeFileSync(tmpIn, buf);
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-i',
          tmpIn,
          '-vf',
          'scale=112:112:force_original_aspect_ratio=decrease,split[s0][s1];[s0]palettegen=max_colors=96:reserve_transparent=1[p];[s1][p]paletteuse=dither=bayer',
          '-loop',
          '0',
          tmpOut,
        ],
        { timeout: 15_000 },
      );
      if (fs.existsSync(tmpOut)) {
        const compressed = fs.readFileSync(tmpOut);
        if (compressed.byteLength > 0 && compressed.byteLength <= MAX_DISCORD_EMOJI_BYTES) {
          return { buffer: compressed, mime: 'image/gif' };
        }
      }
    } catch {
      // Fall through if ffmpeg optimization failed
    } finally {
      fs.unlink(tmpIn, () => {});
      fs.unlink(tmpOut, () => {});
    }
    return { buffer: buf, mime };
  }

  const compressedPng = await sharp(buf)
    .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();

  return { buffer: compressedPng, mime: 'image/png' };
}

/**
 * Uploads all static & animated emojis from server/assets/emojis-gulosos/
 * directly as Discord Guild Emojis (never stickers), skipping already uploaded names.
 */
export async function syncGuildEmojisFromPack(guild: Guild): Promise<{
  totalFiles: number;
  uploaded: number;
  skippedExisting: number;
  failed: number;
}> {
  if (!fs.existsSync(EMOJI_PACK_DIR)) {
    return { totalFiles: 0, uploaded: 0, skippedExisting: 0, failed: 0 };
  }

  const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (
    !botMember ||
    (!botMember.permissions.has(PermissionsBitField.Flags.ManageGuildExpressions) &&
      !botMember.permissions.has(PermissionsBitField.Flags.Administrator))
  ) {
    return { totalFiles: 0, uploaded: 0, skippedExisting: 0, failed: 0 };
  }

  const existing = await guild.emojis.fetch().catch(() => guild.emojis.cache);
  const existingNames = new Set(Array.from(existing.values()).map((e) => (e.name || '').toLowerCase()));

  const files = fs
    .readdirSync(EMOJI_PACK_DIR)
    .filter((f) => /\.(png|gif|jpg|jpeg|webp)$/i.test(f))
    .sort();

  let uploaded = 0;
  let skippedExisting = 0;
  let failed = 0;
  const usedNames = new Set(existingNames);

  for (const filename of files) {
    let emojiName = sanitizeDiscordEmojiName(filename);
    if (existingNames.has(emojiName.toLowerCase())) {
      skippedExisting += 1;
      continue;
    }

    if (usedNames.has(emojiName.toLowerCase())) {
      let suffix = 2;
      while (usedNames.has(`${emojiName.slice(0, 29)}_${suffix}`.toLowerCase())) {
        suffix += 1;
      }
      emojiName = `${emojiName.slice(0, 29)}_${suffix}`;
    }
    usedNames.add(emojiName.toLowerCase());

    try {
      const rawBuf = fs.readFileSync(path.join(EMOJI_PACK_DIR, filename));
      const detectedMime = detectImageMime(rawBuf);
      const prepared = await ensureUnderDiscordEmojiLimit(rawBuf, detectedMime);
      const dataUri = `data:${prepared.mime};base64,${prepared.buffer.toString('base64')}`;

      await guild.emojis.create({
        attachment: dataUri,
        name: emojiName,
        reason: 'Integração automática do pacote de emojis gulosos',
      });
      uploaded += 1;
      await sleep(380);
    } catch (err) {
      failed += 1;
      console.warn(
        `[Discord Emojis] Falha ao enviar ${filename} (${emojiName}) em ${guild.name}:`,
        err instanceof Error ? err.message : err,
      );
      await sleep(500);
    }
  }

  if (uploaded > 0 || failed > 0) {
    console.log(
      `[Discord Emojis] ${guild.name}: ${uploaded} enviado(s), ${skippedExisting} já existente(s), ${failed} falha(s) de ${files.length} arquivos.`,
    );
  }

  return { totalFiles: files.length, uploaded, skippedExisting, failed };
}

function abbreviateFallbackName(rawNorm: string, isCategory: boolean): string {
  const words = rawNorm
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);

  if (words.length === 0) return isCategory ? 'cat' : 'canal';

  const shortened = words.map((w) => {
    if (w.length <= 4) return w;
    // Keep first letter + consonants up to 5 chars for clean readable abbreviation
    const rest = w.slice(1).replace(/[aeiou]/g, '');
    return (w[0] + rest).slice(0, 5);
  });

  return shortened.join(isCategory ? ' ' : '-').slice(0, 24);
}

function formatDemonName(emoji: string, label: string): string {
  return `${emoji}│${toTinyFont(label)}`;
}

function resolveTargetTinyName(channel: GuildBasedChannel): string {
  if (channel.name.includes('│')) {
    return channel.name;
  }
  const norm = normalizeDiscordName(channel.name);
  const compact = norm.replace(/[^a-z0-9]/g, '');
  const isCategory = channel.type === ChannelType.GuildCategory;

  if (isCategory) {
    if (norm.includes('recep')) return formatDemonName('𖤐', 'Recepcao');
    if (norm.includes('comun')) return formatDemonName('⛧', 'Comunidade');
    if (norm.includes('mural')) return formatDemonName('⸸', 'Mural');
    if (norm.includes('suporte') || compact === 'sprt') return formatDemonName('卐', 'Suporte');
    if (norm.includes('call')) return formatDemonName('🜏', 'Calls');
    if (/(?:^|[^a-z])gf(?:[^a-z]|$)/.test(norm)) return formatDemonName('🐉', 'GF');
    if (norm.includes('musica') || compact === 'msc') return formatDemonName('🐲', 'Musica');
    if (norm.includes('afk')) return formatDemonName('🦂', 'AFK');
    if (norm.includes('admin') || compact === 'adm') return formatDemonName('🐍', 'Admin');
    if (norm.includes('servic') || compact === 'srvc') return formatDemonName('🐍', 'Servicos');
    if (norm.includes('consult') || compact === 'cnslt') return formatDemonName('🜏', 'Consultas');
    return formatDemonName('𖤐', norm.replace(/[^a-zA-Z0-9\s-]/g, ' ').trim() || 'Categoria');
  }

  // Important / core channels: keep full name (NOT abbreviated) in Bold Serif + demonic emoji & divider
  if (norm.includes('registro') || compact === 'reg') return formatDemonName('𖤐', 'registro');
  if (norm.includes('entrada') || compact === 'entrd') return formatDemonName('𖤐', 'entrada');
  if (norm.includes('saida')) return formatDemonName('🦂', 'saida');
  if (norm.includes('regras') || compact === 'rgrs') return formatDemonName('⛧', 'regras');
  if (norm.includes('avisos') || compact === 'avss') return formatDemonName('卐', 'avisos');
  if (norm.includes('chat-geral') || norm.includes('chat geral') || compact === 'chat') {
    return formatDemonName('𖤐', 'chat');
  }
  if (/(?:^|[^a-z])sms(?:[^a-z]|$)/.test(norm)) return formatDemonName('卐', 'sms');
  if (norm.includes('midia')) return formatDemonName('⸸', 'midia');
  if (
    (norm.includes('pedir') && norm.includes('mural')) ||
    (norm.includes('pdr') && norm.includes('mrl'))
  ) {
    return formatDemonName('⸸', 'pedir-mural');
  }
  if (
    (norm.includes('mural') && norm.includes('vergonha')) ||
    (norm.includes('mrl') && (norm.includes('vrg') || norm.includes('dvrgn')))
  ) {
    return formatDemonName('⸸', 'mural-da-vergonha');
  }
  if (norm.includes('chorar') || compact === 'chrr') return formatDemonName('🦂', 'chorar');
  if (/(?:^|[^a-z])exp(?:[^a-z]|$)/.test(norm)) return formatDemonName('🐍', 'exp');
  if (
    (norm.includes('suporte') && norm.includes('infernal')) ||
    (norm.includes('sprt') && norm.includes('inf'))
  ) {
    return formatDemonName('卐', 'suporte-infernal');
  }

  // Secondary / less important channels: keep abbreviated in Bold Serif + demonic emoji & divider
  if (norm.includes('plaquinha') || compact === 'plqns') return formatDemonName('🐉', 'plqns');
  if ((norm.includes('comandos') || norm.includes('cmds')) && norm.includes('adm')) {
    return formatDemonName('🐍', 'cmds-adm');
  }
  if (norm.includes('comandos') || compact === 'cmds') return formatDemonName('🐍', 'cmds');
  if (
    (norm.includes('staff') && norm.includes('chat')) ||
    (norm.includes('stf') && norm.includes('cht'))
  ) {
    return formatDemonName('🐍', 'stf-cht');
  }
  if (
    (norm.includes('call') && norm.includes('staff')) ||
    (norm.includes('call') && norm.includes('stf'))
  ) {
    return formatDemonName('🐍', 'call-stf');
  }

  // Numbered voice channels
  if (/(?:^|[^a-z])call(?:[^a-z0-9]|$)/.test(norm)) {
    if (norm.includes('iii') || norm.includes('3')) return formatDemonName('🜏', 'Call 3');
    if (norm.includes('ii') || norm.includes('2')) return formatDemonName('🜏', 'Call 2');
    return formatDemonName('🜏', 'Call 1');
  }
  if (/(?:^|[^a-z])gf(?:[^a-z0-9]|$)/.test(norm)) {
    if (norm.includes('iii') || norm.includes('3')) return formatDemonName('🐉', 'GF 3');
    if (norm.includes('ii') || norm.includes('2')) return formatDemonName('🐉', 'GF 2');
    return formatDemonName('🐉', 'GF 1');
  }
  if (norm.includes('musica') || /(?:^|[^a-z])msc(?:[^a-z0-9]|$)/.test(norm)) {
    if (norm.includes('iii') || norm.includes('3')) return formatDemonName('🐲', 'Msc 3');
    if (norm.includes('ii') || norm.includes('2')) return formatDemonName('🐲', 'Msc 2');
    return formatDemonName('🐲', 'Msc 1');
  }
  if (/(?:^|[^a-z])afk(?:[^a-z0-9]|$)/.test(norm)) {
    if (norm.includes('iii') || norm.includes('3')) return formatDemonName('🦂', 'AFK 3');
    if (norm.includes('ii') || norm.includes('2')) return formatDemonName('🦂', 'AFK 2');
    return formatDemonName('🦂', 'AFK 1');
  }

  return formatDemonName('🐍', abbreviateFallbackName(norm, channel.type === ChannelType.GuildVoice));
}

/**
 * Edits ONLY the names of existing channels and categories in-place to abbreviated,
 * icon-free tiny superscript names. Strictly NEVER deletes or duplicates channels.
 */
export async function syncGuildChannelTinyNames(guild: Guild): Promise<{
  renamed: number;
  unchanged: number;
  failed: number;
}> {
  const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (
    !botMember ||
    (!botMember.permissions.has(PermissionsBitField.Flags.ManageChannels) &&
      !botMember.permissions.has(PermissionsBitField.Flags.Administrator))
  ) {
    return { renamed: 0, unchanged: 0, failed: 0 };
  }

  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
  let renamed = 0;
  let unchanged = 0;
  let failed = 0;

  for (const ch of channels.values()) {
    if (!ch) continue;
    const targetName = resolveTargetTinyName(ch);
    if (!targetName || ch.name === targetName) {
      unchanged += 1;
      continue;
    }

    try {
      await ch.setName(targetName, 'Padronização com emoji demoníaco, divisória e fonte estilizada');
      renamed += 1;
      await sleep(350);
    } catch (err) {
      const retryAfterMs =
        err && typeof err === 'object' && 'retryAfter' in err && typeof (err as { retryAfter?: unknown }).retryAfter === 'number'
          ? Math.min(10_000, Math.max(500, ((err as { retryAfter: number }).retryAfter || 1) * 1000))
          : 0;
      if (retryAfterMs > 0) {
        await sleep(retryAfterMs);
        try {
          await ch.setName(targetName, 'Padronização com emoji demoníaco, divisória e fonte estilizada');
          renamed += 1;
          await sleep(350);
          continue;
        } catch {
          // Fall through to warning
        }
      }
      failed += 1;
      console.warn(
        `[Discord Canais] Falha ao renomear "${ch.name}" -> "${targetName}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (renamed > 0 || failed > 0) {
    console.log(
      `[Discord Canais] ${guild.name}: ${renamed} renomeado(s), ${unchanged} já padronizado(s), ${failed} falha(s).`,
    );
  }

  return { renamed, unchanged, failed };
}

function findServerRoleByKeyword(guild: Guild, keyword: 'ela' | 'ele' | 'membro'): Role | null {
  const regex = new RegExp(`(?:^|[^a-z])${keyword}(?:[^a-z]|$)`);
  for (const role of guild.roles.cache.values()) {
    if (role.managed || role.id === guild.roles.everyone.id) continue;
    const norm = normalizeDiscordName(role.name);
    if (regex.test(norm)) {
      return role;
    }
  }
  return null;
}

async function ensureRoleViewChannelFlag(role: Role, allowView: boolean, reason: string): Promise<void> {
  const hasView = role.permissions.has(PermissionsBitField.Flags.ViewChannel);
  if (hasView === allowView) return;
  const updated = allowView
    ? role.permissions.add(PermissionsBitField.Flags.ViewChannel)
    : role.permissions.remove(PermissionsBitField.Flags.ViewChannel);
  await role.setPermissions(updated, reason).catch((err) => {
    console.warn(`[Discord Registro] Falha ao ajustar ViewChannel no cargo ${role.name}:`, err);
  });
}

async function channelHasRegistrationPanel(
  channel: TextChannel | NewsChannel,
  botUserId: string,
): Promise<boolean> {
  try {
    const messages = await channel.messages.fetch({ limit: 25 });
    for (const msg of messages.values()) {
      if (msg.author.id !== botUserId) continue;
      for (const row of msg.components) {
        if (!('components' in row)) continue;
        for (const comp of row.components) {
          if (
            'customId' in comp &&
            (comp.customId === 'reg_select_ele' || comp.customId === 'reg_select_ela')
          ) {
            return true;
          }
        }
      }
    }
  } catch {
    // Ignore transient fetch issues
  }
  return false;
}

/**
 * Sets up the simple Login / Registration visibility gate using existing roles
 * (ela, ele, membro) and the registration channel (`ʳᵉᵍ`), without deleting any channels.
 */
export async function ensureRegistrationLoginSystem(
  guild: Guild,
  forceResend = false,
): Promise<void> {
  const botUserId = guild.client.user?.id;
  if (!botUserId) return;

  await guild.roles.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});

  const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (
    !botMember ||
    (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles) &&
      !botMember.permissions.has(PermissionsBitField.Flags.Administrator))
  ) {
    return;
  }

  const elaRole = findServerRoleByKeyword(guild, 'ela');
  const eleRole = findServerRoleByKeyword(guild, 'ele');
  const membroRole = findServerRoleByKeyword(guild, 'membro');

  if (!elaRole || !eleRole) {
    console.warn(`[Discord Registro] Cargos "ela" ou "ele" não encontrados em ${guild.name}.`);
    return;
  }

  // Only members with "ela" or "ele" see regular server channels; new members (@everyone + membro)
  // see ONLY the registration channel until they choose Ele or Ela.
  await ensureRoleViewChannelFlag(
    guild.roles.everyone,
    false,
    'Ocultar canais para não-registrados (sistema de registro)',
  );
  if (membroRole) {
    await ensureRoleViewChannelFlag(
      membroRole,
      false,
      'Cargo membro não libera canais antes de selecionar Ele/Ela',
    );
  }
  await ensureRoleViewChannelFlag(elaRole, true, 'Liberar canais ao selecionar Ela');
  await ensureRoleViewChannelFlag(eleRole, true, 'Liberar canais ao selecionar Ele');

  let regChannel = findRegistroChannelInGuild(guild);

  if (!regChannel && botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    let recepParentId: string | undefined;
    for (const ch of guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildCategory) continue;
      const norm = normalizeDiscordName(ch.name);
      if (norm.includes('recep')) {
        recepParentId = ch.id;
        break;
      }
    }

    try {
      const created = await guild.channels.create({
        name: formatDemonName('𖤐', 'registro'),
        type: ChannelType.GuildText,
        parent: recepParentId,
        position: 0,
        topic: 'Selecione Ele ou Ela abaixo para liberar o acesso ao servidor.',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
            deny: [
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.SendMessagesInThreads,
              PermissionsBitField.Flags.AddReactions,
              PermissionsBitField.Flags.CreatePublicThreads,
              PermissionsBitField.Flags.CreatePrivateThreads,
            ],
          },
          {
            id: elaRole.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: eleRole.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: botMember.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
        ],
        reason: 'Criação do canal único de registro (Ele / Ela)',
      });
      if (isGuildTextOrAnnouncement(created)) {
        regChannel = created;
      }
    } catch (err) {
      console.warn('[Discord Registro] Não foi possível criar canal de registro:', err);
    }
  }

  if (!regChannel) return;

  // Ensure exact permission overwrites on the registration channel
  const desiredOverwrites = [
    {
      id: guild.roles.everyone.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
      deny: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.SendMessagesInThreads,
        PermissionsBitField.Flags.AddReactions,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
      ],
    },
    {
      id: elaRole.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: eleRole.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: botMember.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];

  // Apply overwrites idempotently without clearing unrelated admin overwrites
  for (const ow of desiredOverwrites) {
    await regChannel.permissionOverwrites
      .edit(ow.id, {
        ...(ow.allow?.includes(PermissionsBitField.Flags.ViewChannel)
          ? { ViewChannel: true }
          : ow.deny?.includes(PermissionsBitField.Flags.ViewChannel)
            ? { ViewChannel: false }
            : {}),
        ...(ow.allow?.includes(PermissionsBitField.Flags.ReadMessageHistory)
          ? { ReadMessageHistory: true }
          : {}),
        ...(ow.allow?.includes(PermissionsBitField.Flags.SendMessages)
          ? { SendMessages: true }
          : ow.deny?.includes(PermissionsBitField.Flags.SendMessages)
            ? { SendMessages: false }
            : {}),
        ...(ow.deny?.includes(PermissionsBitField.Flags.SendMessagesInThreads)
          ? { SendMessagesInThreads: false }
          : {}),
        ...(ow.deny?.includes(PermissionsBitField.Flags.AddReactions)
          ? { AddReactions: false }
          : {}),
        ...(ow.allow?.includes(PermissionsBitField.Flags.EmbedLinks)
          ? { EmbedLinks: true }
          : {}),
        ...(ow.allow?.includes(PermissionsBitField.Flags.AttachFiles)
          ? { AttachFiles: true }
          : {}),
        ...(ow.allow?.includes(PermissionsBitField.Flags.ManageMessages)
          ? { ManageMessages: true }
          : {}),
      })
      .catch(() => {});
  }

  const hasPanel = forceResend ? false : await channelHasRegistrationPanel(regChannel, botUserId);
  if (!hasPanel) {
    if (forceResend) {
      try {
        const oldMessages = await regChannel.messages.fetch({ limit: 10 }).catch(() => null);
        if (oldMessages) {
          for (const msg of oldMessages.values()) {
            if (msg.author.id === botUserId) {
              await msg.delete().catch(() => {});
            }
          }
        }
      } catch {}
    }

    const embed = new EmbedBuilder()
      .setColor(UNIFIED_EMBED_COLOR)
      .setTitle('Registro de Acesso · 5573 Satan')
      .setDescription(
        [
          'Bem-vindo(a)! Para visualizar os canais do servidor, selecione abaixo uma das opções:',
          '',
          '• **Ele** (Pronome Masculino)',
          '• **Ela** (Pronome Feminino)',
          '',
          'Após selecionar, todos os canais do servidor serão liberados automaticamente e este canal será ocultado.',
        ].join('\n'),
      )
      .setFooter({ text: '5573 Satan • Sistema de Registro e Segurança Oficial' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('reg_select_ele')
        .setLabel('Ele')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('reg_select_ela')
        .setLabel('Ela')
        .setStyle(ButtonStyle.Secondary),
    );

    await regChannel
      .send({
        embeds: [embed],
        components: [row],
      })
      .catch(() => {});
  }
}

/**
 * Automatically assigns the existing "membro" role when a user joins the server.
 */
export async function assignMemberRoleOnJoin(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  if (member.user?.bot) return;
  try {
    const guild = member.guild;
    await guild.roles.fetch().catch(() => {});
    const membroRole = findServerRoleByKeyword(guild, 'membro');
    if (!membroRole) return;

    const fullMember = member.partial ? await guild.members.fetch(member.id).catch(() => null) : member;
    if (!fullMember) return;

    if (!fullMember.roles.cache.has(membroRole.id)) {
      await fullMember.roles.add(membroRole, 'Atribuição automática do cargo membro ao entrar');
    }
  } catch (err) {
    console.warn('[Discord Registro] Falha ao atribuir cargo membro na entrada:', err);
  }
}

/**
 * Handles clicks on "Ele" / "Ela" buttons in the registration channel.
 */
export async function handleRegistrationButtonInteraction(
  interaction: ButtonInteraction,
): Promise<boolean> {
  if (interaction.customId !== 'reg_select_ele' && interaction.customId !== 'reg_select_ela') {
    return false;
  }

  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: 'Este registro só funciona dentro de um servidor.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const guild = interaction.guild;
  await guild.roles.fetch().catch(() => {});

  const isEle = interaction.customId === 'reg_select_ele';
  const targetRole = findServerRoleByKeyword(guild, isEle ? 'ele' : 'ela');
  const otherRole = findServerRoleByKeyword(guild, isEle ? 'ela' : 'ele');
  const membroRole = findServerRoleByKeyword(guild, 'membro');

  if (!targetRole) {
    await interaction.reply({
      content: `Cargo **${isEle ? 'Ele' : 'Ela'}** não encontrado neste servidor.`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({
      content: 'Não foi possível localizar seu usuário neste servidor.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  try {
    if (otherRole && member.roles.cache.has(otherRole.id)) {
      await member.roles.remove(otherRole, 'Atualização de registro Ele/Ela').catch(() => {});
    }
    if (!member.roles.cache.has(targetRole.id)) {
      await member.roles.add(targetRole, 'Seleção de registro no canal de login');
    }
    if (membroRole && !member.roles.cache.has(membroRole.id)) {
      await member.roles.add(membroRole, 'Garantia do cargo membro no registro').catch(() => {});
    }

    await interaction.reply({
      content: `Registro concluído! Você recebeu o cargo **${isEle ? 'Ele' : 'Ela'}** e agora todos os canais do servidor foram liberados.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    await interaction.reply({
      content:
        err instanceof Error
          ? `Não foi possível atribuir o cargo: ${err.message}`
          : 'Erro ao aplicar o cargo de registro.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return true;
}

export async function runFullGuildSync(guild: Guild): Promise<void> {
  await syncGuildChannelTinyNames(guild).catch((err) => {
    console.error('[Discord GuildSync] Erro ao renomear canais:', err);
  });
  await ensureRegistrationLoginSystem(guild).catch((err) => {
    console.error('[Discord GuildSync] Erro ao configurar registro:', err);
  });
  await syncGuildEmojisFromPack(guild).catch((err) => {
    console.error('[Discord GuildSync] Erro ao enviar emojis:', err);
  });
}
