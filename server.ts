import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';
import { apiRouter, handleDiscordInteractions } from './src/server/api';
import { initDiscordGatewayBot } from './src/server/bot';
import { initTestDiscordBot } from './src/server/testBot';
import { cleanupAllCallGamesOnShutdown } from './src/server/callGame';
import { attachBroadcastWebSocketServer } from './src/server/broadcastHub';
import { handleDiscordOAuthCallbackReq } from './src/server/discordOAuth';

dotenv.config();

// Start Gateway bots (Main Bot + 2nd Security Test Bot)
initDiscordGatewayBot().catch((e) => console.error('[Bot Gateway init error]:', e));
initTestDiscordBot().catch((e) => console.error('[Test Bot Gateway init error]:', e));

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// Raw body parser for Discord signature verification and large audio/video file uploads
app.use(express.json({
  limit: '60mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ limit: '60mb', extended: true }));

// Serve static assets directly
app.use('/assets', express.static(path.join(process.cwd(), 'public/assets')));

// Discord Interactions Webhook
app.post('/api/public/discord/interactions', handleDiscordInteractions);
app.post('/public/discord/interactions', handleDiscordInteractions);

// API router & direct OAuth callback alias
app.get(['/auth/callback', '/auth/callback/'], handleDiscordOAuthCallbackReq);
app.use('/api', apiRouter);

// Serve frontend build in production
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));

// Fallback to index.html for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});

attachBroadcastWebSocketServer(httpServer);

httpServer.once('close', () => {
  cleanupAllCallGamesOnShutdown('Servidor encerrado ou reiniciado.').catch(() => {});
});
