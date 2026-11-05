import {
  Guild,
  User,
  TextChannel,
  CategoryChannel,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Message,
} from "discord.js";
import fs from "node:fs/promises";
import path from "node:path";

import { fetchIpData, olhoDoDiaboEmbed } from "../lib/discord.server";

export interface TicketData {
  channelId: string;
  guildId: string;
  ownerId: string;
  ownerTag: string;
  createdAt: number;
  lastAlertAt: number;
  alertCount: number;
  channelName: string;
  initialContent?: string;
  subject?: string;
  ticketCategory?: "support" | "ip";
}

const TICKETS_FILE = path.join(process.cwd(), "tickets_data.json");
const ticketsMap = new Map<string, TicketData>();

// Load tickets from disk if present
async function loadTicketsFromDisk() {
  try {
    const raw = await fs.readFile(TICKETS_FILE, "utf8");
    const arr: TicketData[] = JSON.parse(raw);
    for (const t of arr) {
      ticketsMap.set(t.channelId, t);
    }
  } catch {}
}
loadTicketsFromDisk().catch(() => {});

async function saveTicketsToDisk() {
  try {
    const arr = Array.from(ticketsMap.values());
    await fs.writeFile(TICKETS_FILE, JSON.stringify(arr, null, 2));
  } catch {}
}

export function getAllTickets(): TicketData[] {
  return Array.from(ticketsMap.values());
}

export function getTicket(channelId: string): TicketData | undefined {
  return ticketsMap.get(channelId);
}

// Hacker meme GIF (fast typing hackerman meme)
export const HACKER_MEME_GIF = "https://media.giphy.com/media/eCqFYAVjjDksg/giphy.gif";

// Red Demon Eye GIF (Pinterest direct animated GIF from pin 6BqF2kFPs)
export const RED_DEMON_EYE_GIF = "https://i.pinimg.com/originals/aa/00/a4/aa00a4b92909ba3629eb0ac1c08b00f0.gif";

/**
 * Builds the compact Support Panel Embed and button sent by /painel-suporte
 */
export function buildSupportPanelMessage() {
  const embed = new EmbedBuilder()
    .setTitle("🎫 SUPORTE")
    .setDescription("Clique abaixo para abrir suporte.")
    .setColor(0x3b82f6)
    .setImage(HACKER_MEME_GIF)
    .setFooter({ text: "Atendimento Rápido & Privado" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open_modal")
      .setLabel("Abrir Suporte")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📩")
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Builds the IP Lookup Support Panel Embed and button sent by /painel-ip
 */
export function buildIpPanelMessage() {
  const embed = new EmbedBuilder()
    .setTitle("👁️ OLHO DO DIABO")
    .setDescription("Clique abaixo para abrir o ticket de busca de IP.")
    .setColor(0xef4444)
    .setImage(RED_DEMON_EYE_GIF)
    .setFooter({ text: "Olho do Diabo" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ip_ticket_open")
      .setLabel("Abrir Ticket de IP")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("👁️")
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Builds the interactive Discord Modal screen where the user writes their ticket subject and content
 */
export function buildTicketModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId("ticket_modal_submit")
    .setTitle("Abertura de Ticket");

  const subjectInput = new TextInputBuilder()
    .setCustomId("ticket_subject")
    .setLabel("Assunto (opcional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: Dúvida sobre cargos, ajuda, denúncia...")
    .setRequired(false)
    .setMaxLength(100);

  const contentInput = new TextInputBuilder()
    .setCustomId("ticket_content")
    .setLabel("Conteúdo do Chamado")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Descreva detalhadamente o que você precisa...")
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(1000);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput);

  modal.addComponents(row1, row2);
  return modal;
}

/**
 * Legacy compatibility fallback for choice buttons
 */
export function buildSupportChoiceComponents() {
  return buildSupportPanelMessage();
}

/**
 * Creates a private ticket channel in the Discord guild
 */
export async function createTicketChannel(
  guild: Guild,
  user: User,
  initialContent?: string,
  subject?: string
): Promise<{ channel: TextChannel; existing: boolean }> {
  // Check if user already has an active ticket
  for (const t of ticketsMap.values()) {
    if (t.guildId === guild.id && t.ownerId === user.id) {
      const existingChan = guild.channels.cache.get(t.channelId) as TextChannel;
      if (existingChan) {
        return { channel: existingChan, existing: true };
      }
    }
  }

  // Find or create category for tickets (always positioned at the very bottom)
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes("ticket")
  );

  if (!category) {
    category = await guild.channels.create({
      name: "━━━ TICKETS PRIVADOS ━━━",
      type: ChannelType.GuildCategory,
      position: 99,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
      ],
    });
  } else if (category.type === ChannelType.GuildCategory) {
    (category as CategoryChannel).setPosition(99).catch(() => {});
  }

  const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) || "membro";
  const channelName = `ticket-${cleanUsername}`;

  // Find admin roles to grant access
  const adminRoles = guild.roles.cache.filter(
    (r) => r.permissions.has(PermissionFlagsBits.Administrator) || r.permissions.has(PermissionFlagsBits.ManageChannels)
  );

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    ...adminRoles.map((r) => ({
      id: r.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    })),
  ];

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
    topic: `Ticket de ${user.tag} (${user.id}) • Atendimento com a Administração`,
  });

  const ticketObj: TicketData = {
    channelId: channel.id,
    guildId: guild.id,
    ownerId: user.id,
    ownerTag: user.tag,
    createdAt: Date.now(),
    lastAlertAt: Date.now(), // 1 minute cooldown starts from creation
    alertCount: 0,
    channelName: channel.name,
    initialContent: initialContent || undefined,
    subject: subject || undefined,
  };

  ticketsMap.set(channel.id, ticketObj);
  await saveTicketsToDisk();

  // Send compact initial message inside the ticket channel
  const welcomeEmbed = new EmbedBuilder()
    .setTitle("🎫 Atendimento Iniciado")
    .setDescription(
      `Olá <@${user.id}>! Seu chamado com a administração foi aberto.\n` +
      `Os administradores foram notificados e virão até este canal para atendê-lo em breve.`
    )
    .setColor(0x3b82f6)
    .addFields([
      { name: "👤 Titular", value: `<@${user.id}>`, inline: true },
      { name: "🏷️ Assunto", value: subject || "Geral", inline: true },
      { name: "⏱️ Alerta", value: "1 min cooldown (máx 3x)", inline: true },
    ]);

  if (initialContent) {
    welcomeEmbed.addFields([
      {
        name: "📝 Conteúdo do Chamado",
        value: initialContent.length > 900 ? `>>> ${initialContent.slice(0, 900)}...` : `>>> ${initialContent}`,
        inline: false,
      },
    ]);
  }

  welcomeEmbed
    .setFooter({ text: "Use os botões abaixo para gerenciar seu chamado." })
    .setTimestamp();

  const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close_${channel.id}`)
      .setLabel("Fechar Ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒"),
    new ButtonBuilder()
      .setCustomId(`ticket_alert_${channel.id}`)
      .setLabel("Alertar Administrador")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🚨")
  );

  await channel.send({
    content: `<@${user.id}> seu atendimento foi iniciado!`,
    embeds: [welcomeEmbed],
    components: [controlRow],
  });

  // Notify Administrators via Direct Message (DM) immediately while channel is ready
  notifyAdmins(guild, user, channel, initialContent, subject).catch((err) =>
    console.error("[Notify Admins Error]:", err)
  );

  return { channel, existing: false };
}

/**
 * Creates a private IP ticket channel in the Discord guild for Olho do Diabo
 */
export async function createIpTicketChannel(
  guild: Guild,
  user: User
): Promise<{ channel: TextChannel; existing: boolean }> {
  // Check if user already has an active IP ticket
  for (const t of ticketsMap.values()) {
    if (t.guildId === guild.id && t.ownerId === user.id && t.ticketCategory === "ip") {
      const existingChan = guild.channels.cache.get(t.channelId) as TextChannel;
      if (existingChan) {
        return { channel: existingChan, existing: true };
      }
    }
  }

  // Find or create category for tickets (always positioned at the very bottom)
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes("ticket")
  );

  if (!category) {
    category = await guild.channels.create({
      name: "━━━ TICKETS PRIVADOS ━━━",
      type: ChannelType.GuildCategory,
      position: 99,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
      ],
    });
  } else if (category.type === ChannelType.GuildCategory) {
    (category as CategoryChannel).setPosition(99).catch(() => {});
  }

  const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) || "membro";
  const channelName = `ticket-ip-${cleanUsername}`;

  // Find admin roles to grant access
  const adminRoles = guild.roles.cache.filter(
    (r) => r.permissions.has(PermissionFlagsBits.Administrator) || r.permissions.has(PermissionFlagsBits.ManageChannels)
  );

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    ...adminRoles.map((r) => ({
      id: r.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    })),
  ];

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
    topic: `Ticket Olho do Diabo de ${user.tag} (${user.id}) • Rastreamento de IP`,
  });

  const ticketObj: TicketData = {
    channelId: channel.id,
    guildId: guild.id,
    ownerId: user.id,
    ownerTag: user.tag,
    createdAt: Date.now(),
    lastAlertAt: Date.now(),
    alertCount: 0,
    channelName: channel.name,
    ticketCategory: "ip",
  };

  ticketsMap.set(channel.id, ticketObj);
  await saveTicketsToDisk();

  // Send initial message inside the IP ticket channel
  const welcomeEmbed = new EmbedBuilder()
    .setTitle("👁️ OLHO DO DIABO")
    .setDescription(`Olá <@${user.id}>! Digite abaixo no chat o IP ou Domínio que deseja consultar.`)
    .setColor(0xef4444)
    .setImage(RED_DEMON_EYE_GIF)
    .setFooter({ text: "Olho do Diabo" });

  const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close_${channel.id}`)
      .setLabel("Fechar Ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒")
  );

  await channel.send({
    content: `<@${user.id}> canal de busca de IP criado!`,
    embeds: [welcomeEmbed],
    components: [controlRow],
  });

  return { channel, existing: false };
}

/**
 * Handles incoming chat messages in IP ticket channels
 */
export async function handleIpTicketMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guild) return false;

  const ticket = ticketsMap.get(message.channelId);
  const isIpChannel = ticket?.ticketCategory === "ip" || (message.channel as TextChannel).name.startsWith("ticket-ip-");
  if (!isIpChannel) return false;

  const targetInput = message.content.trim();
  if (!targetInput || targetInput.startsWith("/")) return false;

  try {
    await (message.channel as TextChannel).sendTyping().catch(() => {});

    // 1. Fetch IP Data
    const ipData = await fetchIpData(targetInput);
    const embedCard = olhoDoDiaboEmbed(ipData, message.author.tag);

    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_close_${message.channelId}`)
        .setLabel("Fechar Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒")
    );

    await message.reply({ embeds: [embedCard], components: [closeRow] });

    // 2. Send second message with offer note & link button to user 1554257592015003674
    const promoEmbed = new EmbedBuilder()
      .setTitle("🔍 Adquira o Sistema de Puxar IP")
      .setDescription(
        "Caso você queira adquirir o IP de alguma pessoa compre o sistema de puxar IP (o sistema não funciona 100% pois a pessoa precisa entrar dentro do site e escrever algum nome, após isso você poderá entrar no painel e verificar o IP da pessoa)."
      )
      .setColor(0xef4444);

    const promoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("💬 Falar com o Vendedor")
        .setStyle(ButtonStyle.Link)
        .setURL("https://discord.com/users/1554257592015003674")
    );

    await (message.channel as TextChannel).send({
      embeds: [promoEmbed],
      components: [promoRow],
    });

    return true;
  } catch (err) {
    await message.reply({
      content: `⚠️ **Erro na busca de IP:** ${(err as Error).message}\nPor favor, verifique se digitou um IP ou domínio válido (Ex: \`8.8.8.8\` ou \`google.com\`).`,
    }).catch(() => {});
    return true;
  }
}

/**
 * Sends DM notifications to all administrators of the server immediately with ticket content
 */
export async function notifyAdmins(
  guild: Guild,
  user: User,
  channel: TextChannel,
  initialContent?: string,
  subject?: string
) {
  try {
    await guild.members.fetch().catch(() => {});
    const admins = guild.members.cache.filter(
      (m) =>
        !m.user.bot &&
        (m.permissions.has(PermissionFlagsBits.Administrator) ||
          m.permissions.has(PermissionFlagsBits.ManageGuild) ||
          m.roles.cache.some((r) => {
            const n = r.name.toLowerCase();
            return n.includes("admin") || n.includes("staff") || n.includes("mod") || n.includes("gerente");
          }))
    );

    const safeContent = (initialContent || "Nenhum detalhe adicional informado.").slice(0, 950);
    const safeSubject = subject || "Geral";

    const adminEmbed = new EmbedBuilder()
      .setTitle("🚨 [NOVO TICKET] SUPORTE COM A ADMINISTRAÇÃO")
      .setDescription(
        `Um membro do servidor **${guild.name}** abriu um chamado de suporte!\n\n` +
        `**• Usuário:** <@${user.id}> (\`${user.tag}\`)\n` +
        `**• Assunto:** \`${safeSubject}\`\n` +
        `**• Canal:** <#${channel.id}> (\`${channel.name}\`)\n\n` +
        `📝 **Conteúdo do Chamado:**\n` +
        `\`\`\`\n${safeContent}\n\`\`\`\n` +
        `⚠️ **Ação Solicitada:** Por favor, compareça ao canal de atendimento para responder ao membro.`
      )
      .setColor(0xef4444)
      .setTimestamp();

    for (const [, admin] of admins) {
      admin.send({ embeds: [adminEmbed] }).catch(() => {});
    }
  } catch (err) {
    console.warn("[Ticket Notify Admins warning]:", (err as Error).message);
  }
}

/**
 * Handles "Alertar Administrador" button click
 */
export async function alertAdministrators(
  guild: Guild,
  channelId: string,
  user: User
): Promise<{ allowed: boolean; message: string }> {
  const ticket = ticketsMap.get(channelId);
  if (!ticket) {
    return { allowed: false, message: "Este canal não é um ticket ativo." };
  }

  const now = Date.now();
  const cooldownMs = 60 * 1000; // 1 minute
  const timeSinceLast = now - ticket.lastAlertAt;

  if (timeSinceLast < cooldownMs) {
    const secondsLeft = Math.ceil((cooldownMs - timeSinceLast) / 1000);
    return {
      allowed: false,
      message: `⏳ Aguarde mais **${secondsLeft} segundos** antes de enviar outro alerta para os administradores.`,
    };
  }

  if (ticket.alertCount >= 3) {
    return {
      allowed: false,
      message: "❌ **Limite de alertas atingido (3/3).** Você já enviou 3 notificações aos administradores. Por favor, aguarde uma resposta no canal.",
    };
  }

  ticket.alertCount += 1;
  ticket.lastAlertAt = now;
  await saveTicketsToDisk();

  // Send reforço DM
  try {
    await guild.members.fetch().catch(() => {});
    const admins = guild.members.cache.filter(
      (m) =>
        !m.user.bot &&
        (m.permissions.has(PermissionFlagsBits.Administrator) ||
          m.permissions.has(PermissionFlagsBits.ManageGuild) ||
          m.roles.cache.some((r) => {
            const n = r.name.toLowerCase();
            return n.includes("admin") || n.includes("staff") || n.includes("mod") || n.includes("gerente");
          }))
    );

    const alertEmbed = new EmbedBuilder()
      .setTitle(`🔔 [REFORÇO DE ALERTA (${ticket.alertCount}/3)] Ticket Aberto`)
      .setDescription(
        `O membro <@${user.id}> (${user.tag}) acionou o alerta para a administração no servidor **${guild.name}**!\n\n` +
        `**• Canal:** <#${channelId}>\n` +
        `**• Alertas enviados:** ${ticket.alertCount} de 3 permitidos.\n\n` +
        `Por favor, acesse o canal para responder ao membro.`
      )
      .setColor(0xf59e0b)
      .setTimestamp();

    for (const [, admin] of admins) {
      admin.send({ embeds: [alertEmbed] }).catch(() => {});
    }
  } catch {}

  return {
    allowed: true,
    message: `🔔 **Administradores alertados na DM com sucesso!** (Alerta **${ticket.alertCount}/3** enviado)`,
  };
}

/**
 * Closes and deletes a ticket channel
 */
export async function closeTicketChannel(
  channel: TextChannel,
  closedByUser: User
): Promise<void> {
  ticketsMap.delete(channel.id);
  await saveTicketsToDisk();

  const closeEmbed = new EmbedBuilder()
    .setTitle("🔒 Atendimento Encerrado")
    .setDescription(
      `Este ticket foi encerrado por <@${closedByUser.id}>.\nO canal será excluído automaticamente em **5 segundos**.`
    )
    .setColor(0x6b7280)
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed] });

  setTimeout(() => {
    channel.delete().catch(() => {});
  }, 5000);
}

/**
 * Deletes all bot messages and ticket panel messages in a specific channel.
 * Handles both young messages (<14 days) via bulkDelete and older messages (>14 days) via individual delete.
 */
export async function deleteBotMessagesInChannel(
  channel: TextChannel,
  botUserId: string,
  onlyTickets: boolean = false,
  maxFetch: number = 300
): Promise<{ deleted: number; errors: number }> {
  let deletedCount = 0;
  let errorCount = 0;
  let lastMessageId: string | undefined = undefined;
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  while (deletedCount < maxFetch) {
    const fetchLimit = Math.min(100, maxFetch - deletedCount);
    const options: any = { limit: fetchLimit };
    if (lastMessageId) options.before = lastMessageId;

    const fetched = await channel.messages.fetch(options).catch(() => null);
    if (!fetched || !("size" in fetched) || fetched.size === 0) break;
    const messages = fetched as any;

    const targetMessages = messages.filter((m: any) => {
      if (m.author?.id === botUserId) return true;
      if (onlyTickets) {
        return m.embeds?.some((e: any) => {
          const t = (e.title || "").toLowerCase();
          const d = (e.description || "").toLowerCase();
          return (
            t.includes("ticket") ||
            t.includes("suporte") ||
            t.includes("atendimento") ||
            d.includes("ticket") ||
            d.includes("chamado")
          );
        });
      }
      return false;
    });

    if (targetMessages.size === 0) {
      lastMessageId = messages.last()?.id;
      if (messages.size < fetchLimit) break;
      continue;
    }

    const youngMessages: any[] = [];
    const oldMessages: any[] = [];

    for (const [, msg] of targetMessages) {
      if (msg.createdTimestamp > fourteenDaysAgo) {
        youngMessages.push(msg);
      } else {
        oldMessages.push(msg);
      }
    }

    if (youngMessages.length > 0) {
      if (youngMessages.length === 1) {
        await youngMessages[0]
          .delete()
          .then(() => deletedCount++)
          .catch(() => {
            errorCount++;
          });
      } else {
        const deletedRes = await channel.bulkDelete(youngMessages, true).catch(() => null);
        if (deletedRes) {
          deletedCount += deletedRes.size;
        } else {
          for (const m of youngMessages) {
            await m
              .delete()
              .then(() => deletedCount++)
              .catch(() => {
                errorCount++;
              });
          }
        }
      }
    }

    for (const oldMsg of oldMessages) {
      await oldMsg
        .delete()
        .then(() => deletedCount++)
        .catch(() => {
          errorCount++;
        });
      await new Promise((r) => setTimeout(r, 150));
    }

    lastMessageId = messages.last()?.id;
    if (messages.size < fetchLimit) break;
  }

  return { deleted: deletedCount, errors: errorCount };
}

/**
 * Deletes all bot messages and ticket messages across the guild or in a target channel
 */
export async function deleteAllBotMessagesInGuild(
  guild: Guild,
  botUserId: string,
  targetChannelId?: string,
  onlyTickets: boolean = false
): Promise<{ totalDeleted: number; channelsProcessed: number }> {
  let totalDeleted = 0;
  let channelsProcessed = 0;

  const channelsToClean: TextChannel[] = [];
  if (targetChannelId) {
    const c = guild.channels.cache.get(targetChannelId) as TextChannel;
    if (c && c.isTextBased()) channelsToClean.push(c);
  } else {
    guild.channels.cache.forEach((c) => {
      if (
        (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
        c.isTextBased()
      ) {
        channelsToClean.push(c as TextChannel);
      }
    });
  }

  for (const chan of channelsToClean) {
    try {
      const res = await deleteBotMessagesInChannel(chan, botUserId, onlyTickets, 300);
      totalDeleted += res.deleted;
      channelsProcessed++;
    } catch (err) {
      console.warn(`[Apagar Tickets] Erro ao limpar canal ${chan.name}:`, (err as Error).message);
    }
  }

  return { totalDeleted, channelsProcessed };
}
