import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';
import { apiRouter, handleDiscordInteractions } from './src/server/api';
import { initDiscordGatewayBot } from './src/server/bot';

dotenv.config();

// Start Gateway bot
initDiscordGatewayBot().catch((e) => console.error('[Bot Gateway init error]:', e));

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// Raw body parser for Discord signature verification and large audio/video file uploads
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static assets directly
app.use('/assets', express.static(path.join(process.cwd(), 'public/assets')));

// Discord Interactions Webhook
app.post('/api/public/discord/interactions', handleDiscordInteractions);
app.post('/public/discord/interactions', handleDiscordInteractions);

// API router
app.use('/api', apiRouter);

// Serve frontend build in production
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));

// Fallback to index.html for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
