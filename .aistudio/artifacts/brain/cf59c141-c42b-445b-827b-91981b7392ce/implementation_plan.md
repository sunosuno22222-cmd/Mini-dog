# Plano de Implementação: Reativação do Sistema "Olho do Diabo" (Consulta de IP & Moderação)

O usuário solicitou a reativação do sistema **Olho do Diabo**, que realiza consultas detalhadas de IP e informações de geolocalização/rede para moderação.

---

## 1. Escopo & Funcionalidades

- **Novo Comando Slash Oficial:** `/olho-do-diabo` (aliases: `/buscar-ip`, `/ip-embed`)
  - **Parâmetro:** `ip_ou_dominio` (STRING, obrigatório)
  - **Permissão:** Restrito aos Administradores do Servidor / membros autorizados.
- **Consulta em Tempo Real:** Integração via API de Geolocalização de IP segura (`ip-api.com` com fallback para `ipapi.co`) retornando:
  - 🌐 País, Região e Cidade
  - 🏢 Provedor de Internet (ISP) / Organização
  - 🧭 Coordenadas e Fuso Horário
  - 🔒 Status de VPN / Proxy / Celular
- **Embed Estético Olho do Diabo:** Resposta rápida com estilo Cyber-Gothic e símbolos unicodes sem poluição de emojis.
- **Sincronização Automática:** Atualização da lista de comandos no Discord API e integração no painel web.

---

## 2. Alterações nos Arquivos

1. `src/lib/discord.server.ts`:
   - Adicionar `/olho-do-diabo` à lista `SLASH_COMMANDS`.
   - Adicionar função `olhoDoDiaboEmbed(ipData)` para formatar a resposta da consulta.
2. `src/server/bot.ts`:
   - Tratar a interação do comando `/olho-do-diabo`.
   - Realizar fetch na API de IP com `deferReply()` para evitar timeout de 3s.
3. `src/App.tsx`:
   - Exibir o novo comando no painel e na aba de sincronização.

---

## 3. Plano de Verificação

- **Verificação no TypeScript:** Rodar `lint_applet` (`tsc --noEmit`).
- **Verificação da API Discord:** Testar e registrar o comando `/olho-do-diabo` diretamente na API do Discord.
- **Build da Aplicação:** Executar `compile_applet`.
