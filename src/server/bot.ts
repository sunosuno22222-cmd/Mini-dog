import {
  Client,
  GatewayIntentBits,
  Events,
  ChatInputCommandInteraction,
  GuildMember,
  TextChannel,
} from "discord.js";
import {
  selinhoEmbed,
  tapaNaBundaEmbed,
  fetchIpData,
  olhoDoDiaboEmbed,
  registerCommands,
  dc,
} from "../lib/discord.server";
import {
  buildSupportPanelMessage,
  buildSupportChoiceComponents,
  buildTicketModal,
  createTicketChannel,
  alertAdministrators,
  closeTicketChannel,
  deleteAllBotMessagesInGuild,
  buildIpPanelMessage,
  createIpTicketChannel,
  handleIpTicketMessage,
} from "./tickets";
import { registerModerationListeners } from "./moderation";

let botClient: Client | null = null;
let isStarting = false;

export function getBotClient(): Client | null {
  return botClient;
}

export function isBotOnline(): boolean {
  return Boolean(botClient && botClient.isReady());
}

/**
 * Checks if a member in a guild has the 'TRISAL TOTOSO' role
 */
export function hasTrisalRole(member: GuildMember | any): boolean {
  if (!member || !member.roles) return false;
  
  // If discord.js GuildMember role cache
  if (member.roles.cache) {
    return member.roles.cache.some((role: any) => {
      const n = (role.name || "").toLowerCase().trim();
      return n === "trisal totoso" || n.includes("trisal totoso");
    });
  }

  // If array of role IDs
  if (Array.isArray(member.roles)) {
    return member.roles.length > 0;
  }

  return false;
}

export async function initDiscordGatewayBot(): Promise<Client | null> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    console.log("[Discord Gateway] DISCORD_BOT_TOKEN não configurado. Bot gateway desativado.");
    return null;
  }

  if (isStarting || (botClient && botClient.isReady())) {
    return botClient;
  }

  isStarting = true;

  try {
    if (botClient) {
      try {
        await botClient.destroy();
      } catch {}
      botClient = null;
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
      ],
    });

    client.once(Events.ClientReady, async (c) => {
      console.log(`[Discord Gateway] ✅ BOT CONECTADO COM SUCESSO: ${c.user.tag}`);
      c.user.setActivity("💖 /selinho & /tapa-na-bunda | /painel-suporte", { type: 0 }); // Playing
      
      // Garante que o Interactions Endpoint URL esteja nulo para que o Discord envie 100% dos eventos para o Gateway
      try {
        await dc("/applications/@me", {
          method: "PATCH",
          body: JSON.stringify({ interactions_endpoint_url: null }),
        });
        console.log("[Discord Gateway] ✅ interactions_endpoint_url limpo (Gateway ativo)");
      } catch (e) {
        console.warn("[Discord Gateway] Aviso ao limpar interactions_endpoint_url:", e);
      }

      // Auto synchronize commands for all guilds the bot is currently in
      try {
        const guildIds = c.guilds.cache.map((g) => g.id);
        console.log(`[Discord Gateway] Sincronizando comandos em ${guildIds.length} servidores...`);
        for (const gId of guildIds) {
          await registerCommands(gId).catch((e) => console.warn(`Falha ao registrar comandos na guild ${gId}:`, e));
        }
        console.log("[Discord Gateway] ✅ Comandos oficiais sincronizados nos servidores!");
      } catch (err) {
        console.warn("[Discord Gateway] Erro na sincronização inicial:", err);
      }
    });

    // Register Moderação Avançada listeners (Anti-Spam, Timeout & Anti-Rogue Bot)
    registerModerationListeners(client);

    // Handle messages inside IP lookup ticket channels
    client.on(Events.MessageCreate, async (message) => {
      try {
        await handleIpTicketMessage(message);
      } catch (err) {
        console.error("[MessageCreate IP ticket error]:", err);
      }
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      // 1. Handle Button interactions for Tickets -> Opens Modal Form screen
      if (interaction.isButton()) {
        const customId = interaction.customId;
        const guild = interaction.guild;
        const user = interaction.user;

        if (!guild) {
          await interaction.reply({ content: "Esta ação só pode ser feita em um servidor.", ephemeral: true }).catch(() => {});
          return;
        }

        // IP Ticket Button Trigger
        if (customId === "ip_ticket_open" || customId.startsWith("ip_ticket_")) {
          await interaction.deferReply({ ephemeral: true }).catch(() => {});
          try {
            const { channel, existing } = await createIpTicketChannel(guild, user);
            if (existing) {
              await interaction.editReply({
                content: `⚠️ Você já possui um atendimento de busca de IP aberto: <#${channel.id}>!`,
              });
            } else {
              await interaction.editReply({
                content: `✅ Seu canal de busca de IP foi criado com sucesso: <#${channel.id}>! Digite o IP lá no chat.`,
              });
            }
          } catch (err) {
            await interaction.editReply({
              content: `❌ Erro ao criar canal de busca de IP: ${(err as Error).message}`,
            }).catch(() => {});
          }
          return;
        }

        // Open Support Ticket Modal trigger for any ticket open button
        if (
          customId.startsWith("ticket_open") ||
          customId.startsWith("ticket_create")
        ) {
          try {
            const modal = buildTicketModal();
            await interaction.showModal(modal);
          } catch (err) {
            console.error("[Ticket Modal Error]:", err);
          }
          return;
        }

        if (customId.startsWith("ticket_close_")) {
          const chanId = customId.replace("ticket_close_", "");
          const chan = guild.channels.cache.get(chanId) as TextChannel;
          if (!chan) {
            await interaction.reply({ content: "Canal de ticket não encontrado.", ephemeral: true }).catch(() => {});
            return;
          }
          await interaction.reply({ content: "🔒 Fechando este ticket...", ephemeral: true }).catch(() => {});
          await closeTicketChannel(chan, user);
          return;
        }

        if (customId.startsWith("ticket_alert_")) {
          const chanId = customId.replace("ticket_alert_", "");
          const result = await alertAdministrators(guild, chanId, user);
          await interaction.reply({ content: result.message, ephemeral: true }).catch(() => {});
          return;
        }

        return;
      }

      // 2. Handle Modal Submissions for Tickets (Form Screen)
      if (interaction.isModalSubmit()) {
        const customId = interaction.customId;
        const guild = interaction.guild;
        const user = interaction.user;

        if (!guild) {
          await interaction.reply({ content: "Esta ação só pode ser feita em um servidor.", ephemeral: true }).catch(() => {});
          return;
        }

        if (customId === "ticket_modal_submit" || customId.startsWith("ticket_modal_")) {
          const subject = interaction.fields.getTextInputValue("ticket_subject")?.trim() || "Geral";
          const content = interaction.fields.getTextInputValue("ticket_content")?.trim() || "";

          // Immediate acknowledgement so Discord doesn't timeout the modal submission
          await interaction.deferReply({ ephemeral: true }).catch(() => {});

          try {
            const { channel, existing } = await createTicketChannel(
              guild,
              user,
              content,
              subject
            );

            if (existing) {
              await interaction.editReply({
                content: `⚠️ Você já possui um atendimento em andamento: <#${channel.id}>! Acesse o canal para continuar.`,
              });
              return;
            }

            await interaction.editReply({
              content: `✅ **Seu chamado foi criado com sucesso:** <#${channel.id}>\n📩 O conteúdo do seu chamado foi enviado para os administradores!`,
            });
          } catch (err) {
            console.error("[Ticket Modal Submission Error]:", err);
            await interaction.editReply({
              content: `❌ Falha ao criar seu atendimento: ${(err as Error).message}`,
            });
          }
          return;
        }

        return;
      }

      if (!interaction.isChatInputCommand()) return;

      const cmd = interaction.commandName.toLowerCase().replace(/_/g, "-");
      const user = interaction.user;
      const member = interaction.member;

      console.log(`[Discord Gateway] Slash Command recebido: /${cmd} de ${user.tag} (${user.id})`);

      // 1. Resposta imediata em <50ms para EVITAR "O bot não respondeu" no Discord
      try {
        await interaction.deferReply().catch((e) => console.error("[Discord] Erro ao dar deferReply:", e));
      } catch (err) {
        console.error("[Discord] Defer falhou:", err);
      }

      try {
        // Helper para verificar se o usuário é Administrador ou Moderador
        const isStaffOrAdmin = (g: any, m: any, uId: string): boolean => {
          if (!g) return false;
          if (g.ownerId === uId) return true;
          if (!m) return false;
          const gm = m as GuildMember;
          if (gm.permissions && typeof (gm.permissions as any).has === "function") {
            if (
              (gm.permissions as any).has("Administrator") ||
              (gm.permissions as any).has("ManageGuild") ||
              (gm.permissions as any).has("ManageChannels") ||
              (gm.permissions as any).has("ModerateMembers")
            ) {
              return true;
            }
          }
          if (gm.roles?.cache) {
            const hasStaffRole = gm.roles.cache.some((r) => {
              const n = (r.name || "").toLowerCase();
              return (
                n.includes("admin") ||
                n.includes("mod") ||
                n.includes("staff") ||
                n.includes("gerente") ||
                n.includes("dono") ||
                n.includes("coord")
              );
            });
            if (hasStaffRole) return true;
          }
          return false;
        };

        const isPainelSuporte = cmd === "painel-suporte" || cmd === "suporte";
        const isPainelIp = cmd === "painel-ip" || cmd === "ip-painel" || cmd === "buscar-ip-painel";
        const isApagarTickets = cmd === "apagar-tickets" || cmd === "limpar-tickets" || cmd === "apagar_tickets" || cmd === "limpar_tickets" || cmd === "apagar-ticket";
        const isSelinho = cmd === "selinho";
        const isTapa = cmd === "tapa-na-bunda" || cmd === "tapanabunda";
        const isFalar = cmd === "falar";
        const isOlhoDoDiabo = cmd === "olho-do-diabo" || cmd === "buscar-ip" || cmd === "ip-embed" || cmd === "ip_embed" || cmd === "ip";

        // Avisa sobre comandos desativados
        if (["beijo-triplo", "beijotriplo", "alizar", "alisar", "load", "regras", "enviar-embed", "embed"].includes(cmd)) {
          await interaction.editReply({
            content: "⚠️ **Este comando foi desativado!**\nUse os comandos oficiais disponíveis: `/selinho`, `/tapa-na-bunda`, `/falar`, `/olho-do-diabo`, `/painel-suporte`, `/painel-ip` ou `/apagar-tickets`.",
          });
          return;
        }

        if (isPainelIp) {
          const hasPerm = isStaffOrAdmin(interaction.guild, member, user.id);
          if (!hasPerm) {
            await interaction.editReply({
              content: "🚫 **ACESSO NEGADO!**\nO comando `/painel-ip` é restrito a **Administradores e Moderadores** do servidor.",
            });
            return;
          }

          const channel = interaction.channel as TextChannel;
          if (!channel) {
            await interaction.editReply({ content: "Canal inválido para enviar o painel Olho do Diabo." });
            return;
          }

          const panel = buildIpPanelMessage();
          await channel.send(panel);
          await interaction.editReply({ content: "✅ **Painel Olho do Diabo de Busca de IP enviado com sucesso neste canal!**" });
          return;
        }

        if (isPainelSuporte) {
          const hasPerm = isStaffOrAdmin(interaction.guild, member, user.id);
          if (!hasPerm) {
            await interaction.editReply({
              content: "🚫 **ACESSO NEGADO!**\nO comando `/painel-suporte` é restrito a **Administradores e Moderadores** do servidor.",
            });
            return;
          }

          const channel = interaction.channel as TextChannel;
          if (!channel) {
            await interaction.editReply({ content: "Canal inválido para enviar o painel." });
            return;
          }

          const panel = buildSupportPanelMessage();
          await channel.send(panel);
          await interaction.editReply({ content: "✅ **Painel de Suporte enviado com sucesso neste canal!**" });
          return;
        }

        if (isApagarTickets) {
          const hasPerm = isStaffOrAdmin(interaction.guild, member, user.id);
          if (!hasPerm) {
            await interaction.editReply({
              content: "🚫 **ACESSO NEGADO!**\nO comando `/apagar-tickets` é restrito a **Administradores e Moderadores** do servidor.",
            });
            return;
          }

          const modo = interaction.options.getString("modo", false) || "canal";
          const guild = interaction.guild;
          if (!guild || !botClient?.user) {
            await interaction.editReply({ content: "⚠️ Servidor ou bot não acessível." });
            return;
          }

          const isAll = modo === "todos";
          await interaction.editReply({
            content: isAll
              ? "🧹 **Iniciando limpeza geral...** Apagando todas as mensagens do bot e painéis de tickets (antigos e novos) em todos os canais de texto do servidor..."
              : "🧹 **Iniciando limpeza...** Apagando todas as mensagens do bot e painéis de tickets (antigos e novos) neste canal...",
          });

          try {
            const res = await deleteAllBotMessagesInGuild(
              guild,
              botClient.user.id,
              isAll ? undefined : interaction.channelId,
              false
            );

            await interaction.editReply({
              content: `✅ **Limpeza de Tickets e Mensagens Concluída com Sucesso!**\n🗑️ Foram apagadas **${res.totalDeleted} mensagem(ns)** do bot em **${res.channelsProcessed} canal(is)**.`,
            });
          } catch (err) {
            await interaction.editReply({
              content: `⚠️ Erro ao apagar mensagens: ${(err as Error).message}`,
            });
          }
          return;
        }

        // SELINHO (Aberto para todos os membros)
        if (isSelinho) {
          if (!interaction.guildId || !member) {
            await interaction.editReply({
              content: "Este comando só pode ser utilizado dentro de um servidor Discord!",
            });
            return;
          }
          const target = interaction.options.getUser("user", true);
          const embed = selinhoEmbed(user.id, target.id);
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        // TAPA NA BUNDA (Aberto para todos os membros)
        if (isTapa) {
          if (!interaction.guildId || !member) {
            await interaction.editReply({
              content: "Este comando só pode ser utilizado dentro de um servidor Discord!",
            });
            return;
          }
          const target = interaction.options.getUser("user", true);
          const embed = tapaNaBundaEmbed(user.id, target.id);
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        if (isFalar) {
          const texto = interaction.options.getString("texto", true);
          const memberVoice = (interaction.member as GuildMember)?.voice;
          const voiceChannelId = memberVoice?.channelId;

          let voiceResult: string | null = null;
          let voiceName: string = "Dubladora Anime (Lhays)";
          if (interaction.guildId) {
            try {
              const { speakInVoiceCall } = await import("./voice");
              const res = await speakInVoiceCall(interaction.guildId, texto, voiceChannelId || undefined, "lhays_anime");
              voiceResult = res.channelName;
              voiceName = res.voiceUsed;
            } catch (err) {
              console.log("[Voice Speak Notice]:", (err as Error).message);
            }
          }

          await interaction.editReply({
            content: voiceResult
              ? `🧚 **Voz CapCut: ${voiceName} transmitindo na call "${voiceResult}"!** (escuta desligada 🎧🔇)\n> *"${texto}"*`
              : `🔊 Fala transmitida: *"${texto}"*`,
          });
          return;
        }

        if (isOlhoDoDiabo) {
          const ipParam = interaction.options.getString("alvo", false) || interaction.options.getString("ip", false) || interaction.options.getString("ip_ou_dominio", false) || interaction.options.getString("texto", false) || "8.8.8.8";
          const data = await fetchIpData(ipParam);
          const embed = olhoDoDiaboEmbed(data, user.tag);
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        await interaction.editReply({
          content: `Comando não reconhecido. Comandos disponíveis: \`/selinho\`, \`/tapa-na-bunda\`, \`/falar\`, \`/olho-do-diabo\`, \`/painel-suporte\`, \`/enviar-embed\`.`,
        });
      } catch (err) {
        console.error("[Interaction execution error]:", err);
        await interaction.editReply({
          content: `⚠️ Erro ao processar o comando: ${(err as Error).message}`,
        }).catch(() => {});
      }
    });

    client.on("error", (err) => {
      console.error("[Discord Gateway Error]:", err);
    });

    await client.login(token);
    botClient = client;
    return client;
  } catch (err) {
    console.error("[Discord Gateway] Falha ao iniciar bot client:", err);
    botClient = null;
    return null;
  } finally {
    isStarting = false;
  }
}
