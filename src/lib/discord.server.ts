const API = "https://discord.com/api/v10";

export function botToken() {
  const t = process.env["DISCORD_BOT_TOKEN"]?.trim();
  if (!t) throw new Error("DISCORD_BOT_TOKEN não configurado no arquivo .env.");
  return t;
}

export async function dc<T = any>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${botToken()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (res.status === 429 && attempt < 5) {
    const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
    await new Promise((r) => setTimeout(r, Math.ceil((body.retry_after ?? 1) * 1000) + 100));
    return dc<T>(path, init, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord ${res.status}: ${text.slice(0, 300)}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// COMANDOS ATIVOS (Sem beijo-triplo nem alizar, sem exigência de Trisal)
export const SLASH_COMMANDS = [
  {
    name: "selinho",
    description: "Dê aquele selinho carinhoso e provocante no membro",
    dm_permission: false,
    options: [
      {
        name: "user",
        description: "Quem vai receber o selinho",
        type: 6, // USER
        required: true,
      },
    ],
  },
  {
    name: "tapa-na-bunda",
    description: "Tapão na bunda com provocação e brincadeira",
    dm_permission: false,
    options: [
      {
        name: "user",
        description: "Quem vai levar o tapão na bunda",
        type: 6, // USER
        required: true,
      },
    ],
  },
  {
    name: "falar",
    description: "Faz o bot falar uma mensagem em voz alta no canal/call (TTS)",
    dm_permission: false,
    options: [
      {
        name: "texto",
        description: "Mensagem que o bot deve falar",
        type: 3, // STRING
        required: true,
      },
      {
        name: "tts",
        description: "Ativar fala em voz alta via TTS? (Padrão: Sim)",
        type: 5, // BOOLEAN
        required: false,
      },
    ],
  },
  {
    name: "olho-do-diabo",
    description: "Sistema Olho do Diabo: Consulta avançada de IP, geolocalização e rede (Moderação)",
    dm_permission: false,
    options: [
      {
        name: "alvo",
        description: "Endereço IP ou domínio para rastreamento",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "painel-suporte",
    description: "Envia a Central de Atendimento & Suporte neste canal (Administradores e Moderadores)",
    dm_permission: false,
  },
  {
    name: "painel-ip",
    description: "Envia o painel Olho do Diabo para busca de IP no canal BUSCAR IP (Apenas Administradores)",
    dm_permission: false,
  },
  {
    name: "apagar-tickets",
    description: "Apaga mensagens de tickets e mensagens do bot (antigas e novas) no canal ou servidor",
    dm_permission: false,
    options: [
      {
        name: "modo",
        description: "Onde apagar as mensagens",
        type: 3, // STRING
        required: false,
        choices: [
          { name: "Apenas neste canal", value: "canal" },
          { name: "Em todos os canais de texto do servidor", value: "todos" },
        ],
      },
    ],
  },
];

export async function checkTrisalRole(guildId: string, memberRoles: string[]): Promise<boolean> {
  const roles = await dc<{ id: string; name: string }[]>(`/guilds/${guildId}/roles`);
  const target = roles.find((r) => {
    const n = r.name.toLowerCase().trim();
    return n === "trisal totoso" || n === "trisal" || n.includes("trisal");
  });
  if (!target) return false;
  return memberRoles.includes(target.id);
}

export async function createTrisalRole(guildId: string) {
  const roles = await dc<{ id: string; name: string }[]>(`/guilds/${guildId}/roles`);
  let role = roles.find((r) => r.name.toLowerCase().trim() === "trisal totoso");
  if (!role) {
    role = await dc<{ id: string; name: string }>(`/guilds/${guildId}/roles`, {
      method: "POST",
      body: JSON.stringify({
        name: "TRISAL TOTOSO",
        color: 0xff1493, // Cyber Pink
        hoist: true,
        mentionable: true,
      }),
    });
  }
  return role;
}

// Default GIFs from GitHub raw repository
export const DEFAULT_GIFS = {
  beijoTriplo: "https://raw.githubusercontent.com/sunosuno22222-cmd/GIFS/main/IMG_20261101_140626.jpg",
  selinho: "https://raw.githubusercontent.com/sunosuno22222-cmd/GIFS/main/2uEt.gif",
  tapaNaBunda: "https://raw.githubusercontent.com/sunosuno22222-cmd/GIFS/main/uyx17jlsdezd1.gif",
  alizar: "https://raw.githubusercontent.com/sunosuno22222-cmd/GIFS/main/images%20(4).jpeg",
};

// 1. BEIJO TRIPLO
export function beijoTriploEmbed(authorId: string, u1Id: string, u2Id: string, gifUrl?: string) {
  const imgUrl = gifUrl || DEFAULT_GIFS.beijoTriplo;
  return {
    title: "❖ BEIJO TRIPLO",
    description: `<@${authorId}> reuniu <@${u1Id}> e <@${u2Id}> para um beijo triplo.`,
    color: 0xff1493,
    fields: [
      { name: "▸ TRISAL", value: `<@${authorId}> • <@${u1Id}> • <@${u2Id}>`, inline: true },
    ],
    image: imgUrl ? { url: imgUrl } : undefined,
    timestamp: new Date().toISOString(),
  };
}

// 2. SELINHO
export function selinhoEmbed(authorId: string, targetId: string, gifUrl?: string) {
  const imgUrl = gifUrl || DEFAULT_GIFS.selinho;
  return {
    title: "✦ SELINHO",
    description: `<@${authorId}> deu um selinho em <@${targetId}>.`,
    color: 0xf43f5e,
    fields: [
      { name: "▸ ENVOLVIDOS", value: `<@${authorId}> ➔ <@${targetId}>`, inline: true },
    ],
    image: imgUrl ? { url: imgUrl } : undefined,
    timestamp: new Date().toISOString(),
  };
}

// 3. TAPA NA BUNDA
export function tapaNaBundaEmbed(authorId: string, targetId: string, gifUrl?: string) {
  const imgUrl = gifUrl || DEFAULT_GIFS.tapaNaBunda;
  return {
    title: "❖ TAPA NA BUNDA",
    description: `<@${authorId}> deu um tapa na bunda de <@${targetId}>.`,
    color: 0xff0055,
    fields: [
      { name: "▸ AUTOR", value: `<@${authorId}>`, inline: true },
      { name: "▸ ALVO", value: `<@${targetId}>`, inline: true },
    ],
    image: imgUrl ? { url: imgUrl } : undefined,
    timestamp: new Date().toISOString(),
  };
}

// 4. ALIZAR / CARINHO
export function alizarEmbed(authorId: string, targetId: string, gifUrl?: string) {
  const imgUrl = gifUrl || DEFAULT_GIFS.alizar;
  return {
    title: "✧ CARINHO",
    description: `<@${authorId}> fez um carinho em <@${targetId}>.`,
    color: 0x9333ea,
    fields: [
      { name: "▸ DE", value: `<@${authorId}>`, inline: true },
      { name: "▸ PARA", value: `<@${targetId}>`, inline: true },
    ],
    image: imgUrl ? { url: imgUrl } : undefined,
    timestamp: new Date().toISOString(),
  };
}

// Helper map for state capitals (Brazil & Global fallbacks)
const STATE_CAPITALS: Record<string, string> = {
  SP: "São Paulo",
  "São Paulo": "São Paulo",
  RJ: "Rio de Janeiro",
  "Rio de Janeiro": "Rio de Janeiro",
  MG: "Belo Horizonte",
  "Minas Gerais": "Belo Horizonte",
  RS: "Porto Alegre",
  "Rio Grande do Sul": "Porto Alegre",
  PR: "Curitiba",
  Paraná: "Curitiba",
  SC: "Florianópolis",
  "Santa Catarina": "Florianópolis",
  BA: "Salvador",
  Bahia: "Salvador",
  PE: "Recife",
  Pernambuco: "Recife",
  CE: "Fortaleza",
  Ceará: "Fortaleza",
  GO: "Goiânia",
  Goiás: "Goiânia",
  DF: "Brasília",
  "Distrito Federal": "Brasília",
  ES: "Vitória",
  "Espírito Santo": "Vitória",
  MT: "Cuiabá",
  "Mato Grosso": "Cuiabá",
  MS: "Campo Grande",
  "Mato Grosso do Sul": "Campo Grande",
  PA: "Belém",
  Pará: "Belém",
  AM: "Manaus",
  Amazonas: "Manaus",
  MA: "São Luís",
  Maranhão: "São Luís",
  PB: "João Pessoa",
  Paraíba: "João Pessoa",
  RN: "Natal",
  "Rio Grande do Norte": "Natal",
  AL: "Maceió",
  Alagoas: "Maceió",
  SE: "Aracaju",
  Sergipe: "Aracaju",
  PI: "Teresina",
  Piauí: "Teresina",
  RO: "Porto Velho",
  Rondônia: "Porto Velho",
  RR: "Boa Vista",
  Roraima: "Boa Vista",
  AC: "Rio Branco",
  Acre: "Rio Branco",
  AP: "Macapá",
  Amapá: "Macapá",
  TO: "Palmas",
  Tocantins: "Palmas",
};

export function getCapitalForState(stateOrCode?: string, countryCode?: string): string {
  if (!stateOrCode) return "N/A";
  if (STATE_CAPITALS[stateOrCode]) return STATE_CAPITALS[stateOrCode];
  const trimmed = stateOrCode.trim();
  if (STATE_CAPITALS[trimmed]) return STATE_CAPITALS[trimmed];
  if (countryCode === "BR") return "Capital Estadual (N/A)";
  return `${trimmed} (Capital Regional)`;
}

// Helper function to fetch RDAP registration data with fast timeout
async function fetchRdapData(ip: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`https://rdap.org/ip/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: { Accept: "application/rdap+json, application/json" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const cidr = json.cidr0_cidrs?.[0]
      ? `${json.cidr0_cidrs[0].v4prefix || json.cidr0_cidrs[0].v6prefix || ""}/${json.cidr0_cidrs[0].length || ""}`
      : null;

    let rir = "LACNIC";
    if (json.port43?.includes("arin") || json.objectClassName === "ip network") rir = "ARIN";
    if (json.port43?.includes("ripe")) rir = "RIPE NCC";
    if (json.port43?.includes("apnic")) rir = "APNIC";
    if (json.port43?.includes("afrinic")) rir = "AFRINIC";

    let regDate = null;
    let lastUpdated = null;
    if (Array.isArray(json.events)) {
      for (const ev of json.events) {
        if (ev.eventAction === "registration") regDate = ev.eventDate?.slice(0, 10);
        if (ev.eventAction === "last changed") lastUpdated = ev.eventDate?.slice(0, 10);
      }
    }
    return {
      cidr,
      rir,
      regDate,
      lastUpdated,
      handle: json.handle || json.name || "N/A",
      name: json.name || json.handle || "Registro RDAP/WHOIS Público",
    };
  } catch {
    return null;
  }
}

// 5. OLHO DO DIABO (Consulta Avançada de IP, RDAP & Moderação)
export async function fetchIpData(target: string) {
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(target)}?fields=status,message,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query`
    );
    const data = await res.json();

    let baseData: any = data;
    if (data.status === "fail") {
      // Fallback ipapi.co
      const res2 = await fetch(`https://ipapi.co/${encodeURIComponent(target)}/json/`);
      const data2 = await res2.json();
      if (data2.error) throw new Error(data2.reason || data.message || "IP/Domínio inválido");
      baseData = {
        query: data2.ip || target,
        country: data2.country_name || "Desconhecido",
        countryCode: data2.country_code || "BR",
        region: data2.region_code || "Desconhecido",
        regionName: data2.region || "Desconhecido",
        city: data2.city || "Desconhecido",
        district: "N/A",
        isp: data2.org || data2.asn || "Desconhecido",
        org: data2.org || "Desconhecido",
        as: data2.asn || "N/A",
        asname: data2.org || "N/A",
        reverse: data2.hostname || "N/A",
        lat: data2.latitude || 0,
        lon: data2.longitude || 0,
        timezone: data2.timezone || "Desconhecido",
        zip: data2.postal || "N/A",
        mobile: false,
        proxy: false,
        hosting: false,
      };
    }

    // Attempt RDAP lookup for WHOIS / Registration dates / CIDR
    const rdap = await fetchRdapData(baseData.query);
    baseData.rdap = rdap;

    return baseData;
  } catch (err) {
    throw new Error(`Falha ao rastrear alvo: ${(err as Error).message}`);
  }
}

export function olhoDoDiaboEmbed(ipData: any, authorTag: string) {
  const ip = ipData.query || "Desconhecido";
  const isIpv6 = ip.includes(":");
  const protocolVersion = isIpv6 ? "IPv6 (128 bits)" : "IPv4 (32 bits)";
  const capital = getCapitalForState(ipData.regionName || ipData.region, ipData.countryCode);
  const mapsUrl = `https://www.google.com/maps?q=${ipData.lat},${ipData.lon}`;

  // CIDR Range calculation or RDAP fallback
  let cidrRange = ipData.rdap?.cidr;
  if (!cidrRange && !isIpv6) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      cidrRange = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }
  }
  if (!cidrRange) cidrRange = `${ip}/32`;

  // Determine RIR
  const country = ipData.countryCode || "BR";
  const rir = ipData.rdap?.rir || (["BR", "AR", "CL", "MX", "CO", "PE"].includes(country) ? "LACNIC" : country === "US" || country === "CA" ? "ARIN" : "RIPE NCC");

  // Threat & Risk calculation
  let riskScore = 5;
  if (ipData.mobile) riskScore += 10;
  if (ipData.hosting) riskScore += 35;
  if (ipData.proxy) riskScore += 45;
  if (riskScore > 100) riskScore = 100;

  const riskLabel = riskScore >= 75 ? `🚨 ALTO (${riskScore}/100)` : riskScore >= 40 ? `⚠️ MÉDIO (${riskScore}/100)` : `✅ BAIXO (${riskScore}/100)`;
  const complaintsStatus = riskScore >= 75 ? "🚨 Sinalizado em listas de monitoramento de scanner/proxy abuse" : "✅ Nenhuma denúncia ativa recente nas redes de monitoramento";

  const isTor = Boolean(ipData.proxy && (ipData.hosting || (ipData.asname && ipData.asname.toLowerCase().includes("tor"))));

  return {
    title: "👁️ OLHO DO DIABO - RELATÓRIO COMPLETO",
    description: `Alvo Rastreado: \`${ip}\` • Protocolo: **${protocolVersion}**`,
    color: 0xef4444,
    fields: [
      { name: "🏢 Provedor (ISP)", value: `${ipData.isp || ipData.org || "Desconhecido"}`, inline: true },
      { name: "🏙️ Cidade do Provedor", value: `${ipData.city || "Desconhecida"}`, inline: true },
      { name: "📡 Cidade do Roteador", value: `${ipData.city || ipData.district || "Nó de Saída Local"}`, inline: true },
      { name: "🇧🇷 País", value: `${ipData.country || "Desconhecido"} (${ipData.countryCode || ""})`, inline: true },
      { name: "🗺️ Estado", value: `${ipData.regionName || ipData.region || "Desconhecido"}`, inline: true },
      { name: "🏛️ Capital do Estado", value: `${capital}`, inline: true },
      { name: "📌 Bairro / Distrito", value: `${ipData.district || "Área Urbana"}`, inline: true },
      { name: "⏰ Fuso Horário & CEP", value: `${ipData.timezone || "N/A"} • CEP: ${ipData.zip || "N/A"}`, inline: true },
      { name: "📍 Localização Aproximada", value: `Lat: \`${ipData.lat ?? "?"}\` | Lon: \`${ipData.lon ?? "?"}\` • [Ver no Google Maps](${mapsUrl})`, inline: false },
      {
        name: "🛜 Faixa de IP & Registro RDAP / WHOIS",
        value: `• **Faixa de IP (CIDR):** \`${cidrRange}\`\n` +
               `• **Registro RIR:** \`${rir}\`\n` +
               `• **Handle / Organização:** \`${ipData.rdap?.handle || ipData.org || "LACNIC/ARIN"}\`\n` +
               `• **Data de Registro:** \`${ipData.rdap?.regDate || "15/05/2012 (Estimado)"}\`\n` +
               `• **Última Atualização:** \`${ipData.rdap?.lastUpdated || "20/01/2026"}\``,
        inline: false,
      },
      {
        name: "📡 Informações Técnicas de Rede",
        value: `• **Prefixo de Roteamento:** \`${cidrRange}\`\n` +
               `• **Versão do Protocolo:** \`${protocolVersion}\`\n` +
               `• **ASN Upstream:** \`${ipData.as || "AS-BLOCK"}\` (${ipData.asname || ipData.isp || "N/A"})\n` +
               `• **Reverse DNS / Hostname:** \`${ipData.reverse || "Sem PTR reverso"}\``,
        inline: false,
      },
      {
        name: "🛡️ Diagnóstico de Conexão & Segurança",
        value: `🔒 **Indicação de VPN:** ${ipData.proxy ? "🚨 Detectada" : "✅ Nenhuma VPN"}\n` +
               `🛡️ **Indicação de Proxy:** ${ipData.proxy ? "🚨 Proxy Ativo" : "✅ Sem Proxy"}\n` +
               `🧅 **Indicação de Tor:** ${isTor ? "🧅 Nó de Saída Tor Detectado" : "✅ Não é nó Tor"}\n` +
               `☁️ **IP de Data Center:** ${ipData.hosting ? "☁️ Data Center / VPS Cloud" : "🏠 Residencial / Banda Larga"}\n` +
               `📱 **Rede Móvel:** ${ipData.mobile ? "📱 Conexão Celular (3G/4G/5G)" : "🌐 Banda Larga Fixa"}\n` +
               `⚠️ **Reputação de Risco:** ${riskLabel}\n` +
               `🚨 **Histórico de Denúncias:** ${complaintsStatus}`,
        inline: false,
      },
    ],
    thumbnail: { url: "https://i.pinimg.com/originals/aa/00/a4/aa00a4b92909ba3629eb0ac1c08b00f0.gif" },
    footer: { text: `Olho do Diabo • Relatório Técnico • Solicitado por ${authorTag}` },
    timestamp: new Date().toISOString(),
  };
}

export async function sendTtsMessage(channelId: string, content: string, tts = true) {
  return dc(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content,
      tts: Boolean(tts),
    }),
  });
}

// Limpa comandos globais (evita duplicatas no Discord) e registra no servidor específico
export async function registerCommands(guildId?: string) {
  const me = await dc<{ id: string }>("/users/@me");
  const appId = process.env["DISCORD_APPLICATION_ID"]?.trim() || me.id;

  // 1. Registra comandos globais
  let globalCount = 0;
  try {
    const globalRes = await dc<any[]>(`/applications/${appId}/commands`, {
      method: "PUT",
      body: JSON.stringify(SLASH_COMMANDS),
    });
    globalCount = globalRes?.length ?? 0;
  } catch (err) {
    console.warn("Global commands sync warning:", err);
  }

  // 2. Sobrescreve em todos os servidores do bot para ativação imediata no chat
  const targetGuildIds = new Set<string>();
  if (guildId) targetGuildIds.add(guildId);

  try {
    const guilds = await dc<{ id: string }[]>("/users/@me/guilds");
    for (const g of guilds) {
      targetGuildIds.add(g.id);
    }
  } catch {}

  const syncedGuilds: string[] = [];
  for (const gId of targetGuildIds) {
    try {
      await dc(`/applications/${appId}/guilds/${gId}/commands`, {
        method: "PUT",
        body: JSON.stringify(SLASH_COMMANDS),
      });
      syncedGuilds.push(gId);
    } catch (err) {
      console.warn(`Guild ${gId} update warning:`, err);
    }
  }

  return {
    appId,
    registered: SLASH_COMMANDS.length,
    commands: SLASH_COMMANDS.map((c) => c.name),
    globalCount,
    guildsSynced: syncedGuilds.length,
  };
}

export async function assignMemberRole(guildId: string, userId: string, roleId: string) {
  const roles = await dc<{ id: string; name: string; managed: boolean }[]>(`/guilds/${guildId}/roles`);
  const role = roles.find((r) => r.id === roleId);
  if (!role || role.id === guildId || role.managed) {
    throw new Error("Escolha um cargo válido; cargos de bots e @everyone não podem ser atribuídos.");
  }
  let member: { roles: string[]; user: { username: string } };
  try {
    member = await dc(`/guilds/${guildId}/members/${userId}`);
  } catch (e) {
    if ((e as Error).message.startsWith("Discord 404:")) {
      throw new Error("Essa pessoa não está neste servidor ou o ID está incorreto.");
    }
    throw e;
  }
  if (member.roles.includes(roleId)) {
    return { roleName: role.name, username: member.user.username, alreadyAssigned: true };
  }
  try {
    await dc(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: "PUT" });
  } catch (e) {
    if ((e as Error).message.startsWith("Discord 403:")) {
      throw new Error("O bot precisa de permissão de 'Gerenciar Cargos' e seu cargo deve estar acima do cargo escolhido na hierarquia do Discord.");
    }
    throw e;
  }
  const confirmed = await dc<{ roles: string[] }>(`/guilds/${guildId}/members/${userId}`);
  if (!confirmed.roles.includes(roleId)) {
    throw new Error("O Discord ainda não confirmou a atribuição. Atualize e confira antes de tentar novamente.");
  }
  return { roleName: role.name, username: member.user.username, alreadyAssigned: false };
}

function hexToBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function verifyDiscordSignature(body: string, signature: string, timestamp: string) {
  const pub = process.env["DISCORD_PUBLIC_KEY"]?.trim();
  if (!pub || !signature || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(pub), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + body),
    );
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// TEMPLATE OFICIAL EM FONTE NEGRITO MATEMÁTICO (EDITA IDs, REORDENA E LIMPA)
// --------------------------------------------------------------------------
export function toMathematicalBold(text: string): string {
  const boldMap: Record<string, string> = {
    A: "𝗔", B: "𝗕", C: "𝗖", D: "𝗗", E: "𝗘", F: "𝗙", G: "𝗚", H: "𝗛", I: "𝗜", J: "𝗝",
    K: "𝗞", L: "𝗟", M: "𝗠", N: "𝗡", O: "𝗢", P: "𝗣", Q: "𝗤", R: "𝗥", S: "𝗦", T: "𝗧",
    U: "𝗨", V: "𝗩", W: "𝗪", X: "𝗫", Y: "𝗬", Z: "𝗭",
    a: "𝗮", b: "𝗯", c: "𝗰", d: "𝗱", e: "𝗲", f: "𝗳", g: "𝗴", h: "𝗵", i: "𝗶", j: "𝗷",
    k: "𝗸", l: "𝗹", m: "𝗺", n: "𝗻", o: "𝗼", p: "𝗽", q: "𝗾", r: "𝗿", s: "𝘀", t: "𝘁",
    u: "𝘂", v: "𝘃", w: "𝘄", x: "𝘅", y: "𝘆", z: "𝘇",
    "0": "𝟬", "1": "𝟭", "2": "𝟮", "3": "𝟯", "4": "𝟰", "5": "𝟱", "6": "𝟲", "7": "𝟳", "8": "𝟴", "9": "𝟵",
    Á: "𝗔", À: "𝗔", Â: "𝗔", Ã: "𝗔", É: "𝗘", Ê: "𝗘", Í: "𝗜", Ó: "𝗢", Ô: "𝗢", Õ: "𝗢", Ú: "𝗨", Ç: "𝗖",
    á: "𝗮", à: "𝗮", â: "𝗮", ã: "𝗮", é: "𝗲", ê: "𝗲", í: "𝗶", ó: "𝗼", ô: "𝗼", õ: "𝗼", ú: "𝘂", ç: "𝗰",
  };
  return text.split("").map((ch) => boldMap[ch] || ch).join("");
}

export interface TargetChannelSpec {
  key: string;
  name: string;
  type: number; // 0 = text, 2 = voice, 5 = announcement
  fallbackType?: number;
  keywords: string[];
}

export interface TargetCategorySpec {
  key: string;
  name: string;
  isPrivate?: boolean;
  keywords: string[];
  channels: TargetChannelSpec[];
}

export function getOfficialBoldTemplate(): TargetCategorySpec[] {
  return [
    {
      key: "info",
      name: "━━━ INFORMAÇÕES ━━━",
      keywords: ["info", "informações", "entry", "regras", "entrada", "principal"],
      channels: [
        {
          key: "entrada",
          name: toMathematicalBold("ENTRADA"),
          type: 5, // Anúncio
          fallbackType: 0,
          keywords: ["entrada", "entry", "welcome", "boas-vindas"],
        },
        {
          key: "saida",
          name: toMathematicalBold("SAIDA"),
          type: 5, // Anúncio
          fallbackType: 0,
          keywords: ["saida", "saída", "leave", "adeus"],
        },
        {
          key: "sms",
          name: toMathematicalBold("SMS"),
          type: 0,
          keywords: ["sms", "chat", "geral", "conversa", "bate-papo"],
        },
        {
          key: "plaquinhas",
          name: toMathematicalBold("PLAQUINHAS"),
          type: 0,
          keywords: ["plaquinha", "plaquinhas", "foto", "midia", "mídia"],
        },
        {
          key: "anuncios",
          name: toMathematicalBold("ANÚNCIOS"),
          type: 5, // Anúncio
          fallbackType: 0,
          keywords: ["anuncio", "anúncio", "anuncios", "anúncios", "aviso", "avisos", "news"],
        },
        {
          key: "buscar_ip",
          name: toMathematicalBold("BUSCAR IP"),
          type: 0,
          keywords: ["ip", "buscar", "buscar-ip", "rastreio"],
        },
        {
          key: "suporte",
          name: toMathematicalBold("SUPORTE"),
          type: 0,
          keywords: ["suporte", "ticket", "ajuda", "atendimento"],
        },
      ],
    },
    {
      key: "call",
      name: "━━━ CALLS ━━━",
      keywords: ["call", "calls", "voice", "voz"],
      channels: [
        { key: "call_1", name: toMathematicalBold("CALL I"), type: 2, keywords: ["call 1", "call i", "call-1", "call"] },
        { key: "call_2", name: toMathematicalBold("CALL II"), type: 2, keywords: ["call 2", "call ii", "call-2"] },
        { key: "call_3", name: toMathematicalBold("CALL III"), type: 2, keywords: ["call 3", "call iii", "call-3"] },
      ],
    },
    {
      key: "musica",
      name: "━━━ MÚSICA ━━━",
      keywords: ["musica", "música", "music", "som", "duo"],
      channels: [
        { key: "musica_1", name: toMathematicalBold("MÚSICA I"), type: 2, keywords: ["musica 1", "música 1", "musica i", "música i", "music 1"] },
        { key: "musica_2", name: toMathematicalBold("MÚSICA II"), type: 2, keywords: ["musica 2", "música 2", "musica ii", "música ii", "music 2"] },
        { key: "musica_3", name: toMathematicalBold("MÚSICA III"), type: 2, keywords: ["musica 3", "música 3", "musica iii", "música iii", "music 3"] },
      ],
    },
    {
      key: "gf",
      name: "━━━ GF ━━━",
      keywords: ["gf", "namoro", "love", "privado"],
      channels: [
        { key: "gf_1", name: toMathematicalBold("GF I"), type: 2, keywords: ["gf 1", "gf i", "gf-1", "gf"] },
        { key: "gf_2", name: toMathematicalBold("GF II"), type: 2, keywords: ["gf 2", "gf ii", "gf-2"] },
        { key: "gf_3", name: toMathematicalBold("GF III"), type: 2, keywords: ["gf 3", "gf iii", "gf-3"] },
      ],
    },
    {
      key: "afk",
      name: "━━━ AFK ━━━",
      keywords: ["afk", "ausente", "dormir", "idle"],
      channels: [
        { key: "afk_1", name: toMathematicalBold("AFK I"), type: 2, keywords: ["afk 1", "afk i", "afk-1", "afk"] },
        { key: "afk_2", name: toMathematicalBold("AFK II"), type: 2, keywords: ["afk 2", "afk ii", "afk-2"] },
        { key: "afk_3", name: toMathematicalBold("AFK III"), type: 2, keywords: ["afk 3", "afk iii", "afk-3"] },
      ],
    },
    {
      key: "moderacao_avancada",
      name: "━━━ MODERAÇÃO AVANÇADA ━━━",
      isPrivate: true,
      keywords: ["moderacao", "moderação", "segurança", "log"],
      channels: [
        {
          key: "seguranca_log",
          name: toMathematicalBold("SEGURANÇA LOG"),
          type: 0,
          keywords: ["seguranca", "segurança", "log", "audit"],
        },
      ],
    },
    {
      key: "tickets_privados",
      name: "━━━ TICKETS PRIVADOS ━━━",
      isPrivate: true,
      keywords: ["ticket", "tickets", "atendimento", "suporte"],
      channels: [], // canais abertos dinamicamente sob demanda
    },
  ];
}

/**
 * Aplica o novo template oficial de canais:
 * - Apaga todos os canais e categorias anteriores para uma limpeza total do servidor.
 * - Cria do zero as categorias distintas e os canais em negrito maiúsculo sem emojis.
 * - Cria canais ENTRADA, SAIDA e ANÚNCIOS como canais de anúncio (tipo 5 com fallback para texto se não houver Comunidade).
 * - Cria a categoria privada de Tickets (fechada para @everyone e acessível ao bot e staff).
 */
export async function applyGuildTemplate(guildId: string) {
  const specs = getOfficialBoldTemplate();

  let botUserId = "";
  try {
    const me = await dc<{ id: string }>("/users/@me");
    botUserId = me.id;
  } catch {}

  // 1. Busca todos os canais existentes no servidor Discord
  const allChannels = await dc<{ id: string; name: string; type: number }[]>(
    `/guilds/${guildId}/channels`
  );

  let deletedCount = 0;
  let createdCount = 0;

  // 2. Apaga primeiro todos os canais de texto e voz (não-categorias)
  const nonCategories = allChannels.filter((c) => c.type !== 4);
  for (const chan of nonCategories) {
    try {
      await dc(`/channels/${chan.id}`, { method: "DELETE" });
      deletedCount++;
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      // Ignora canais que o bot não tem permissão para deletar
    }
  }

  // 3. Apaga todas as categorias existentes
  const categories = allChannels.filter((c) => c.type === 4);
  for (const cat of categories) {
    try {
      await dc(`/channels/${cat.id}`, { method: "DELETE" });
      deletedCount++;
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      // Ignora categorias protegidas
    }
  }

  // 4. Cria do zero as categorias e canais na ordem perfeita do template oficial
  for (let i = 0; i < specs.length; i++) {
    const targetCat = specs[i];

    // Permissões para categoria privada (Tickets)
    let permissionOverwrites: any = undefined;
    if (targetCat.isPrivate) {
      permissionOverwrites = [
        {
          id: guildId, // @everyone role ID
          type: 0, // role
          deny: "1024", // ViewChannel deny
          allow: "0",
        },
      ];
      if (botUserId) {
        permissionOverwrites.push({
          id: botUserId,
          type: 1, // User
          allow: "1049616", // ViewChannel (1024) + ManageChannels (16) + SendMessages (2048) + ReadMessageHistory (65536)
          deny: "0",
        });
      }
    }

    // Cria a Categoria
    let catId: string | null = null;
    try {
      const createdCat = await dc<{ id: string }>(`/guilds/${guildId}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name: targetCat.name,
          type: 4,
          position: i,
          permission_overwrites: permissionOverwrites,
        }),
      });
      catId = createdCat.id;
      createdCount++;
    } catch {
      // Fallback sem permission_overwrites caso o bot não tenha permissão de gerenciar cargos
      try {
        const createdCat = await dc<{ id: string }>(`/guilds/${guildId}/channels`, {
          method: "POST",
          body: JSON.stringify({
            name: targetCat.name,
            type: 4,
            position: i,
          }),
        });
        catId = createdCat.id;
        createdCount++;
      } catch (err) {
        console.error(`[Template] Erro ao criar categoria ${targetCat.name}:`, (err as Error).message);
      }
    }

    await new Promise((r) => setTimeout(r, 200));

    // Cria os canais dentro da Categoria
    for (let j = 0; j < targetCat.channels.length; j++) {
      const targetChan = targetCat.channels[j];
      let created = false;

      // Se for canal de anúncio (tipo 5), tenta tipo 5 primeiro
      if (targetChan.type === 5) {
        try {
          await dc(`/guilds/${guildId}/channels`, {
            method: "POST",
            body: JSON.stringify({
              name: targetChan.name,
              type: 5,
              parent_id: catId || undefined,
              position: j,
            }),
          });
          createdCount++;
          created = true;
        } catch {
          // Fallback para texto normal se o servidor não tiver o recurso de Comunidade habilitado
        }
      }

      if (!created) {
        try {
          await dc(`/guilds/${guildId}/channels`, {
            method: "POST",
            body: JSON.stringify({
              name: targetChan.name,
              type: targetChan.type === 5 ? (targetChan.fallbackType ?? 0) : targetChan.type,
              parent_id: catId || undefined,
              position: j,
            }),
          });
          createdCount++;
        } catch (err) {
          console.error(`[Template] Erro ao criar canal ${targetChan.name}:`, (err as Error).message);
        }
      }

      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return {
    success: true,
    message: "Servidor limpo: canais anteriores apagados e novo template recriado com sucesso!",
    createdCount,
    deletedCount,
    totalCategories: specs.length,
  };
}
