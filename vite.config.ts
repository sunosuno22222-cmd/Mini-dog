import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import express from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

function apiPlugin(): Plugin {
  return {
    name: 'api-server-middleware',
    configureServer(server) {
      // Start the Discord Gateway Bot in background for instant slash commands handling
      server.ssrLoadModule('/src/server/bot.ts')
        .then(({ initDiscordGatewayBot }) => {
          initDiscordGatewayBot().catch((err: any) => console.error('[Bot Gateway init error]:', err));
        })
        .catch((err) => console.error('[Bot module load error]:', err));

      // Attach WebSocket /ws/broadcast to Vite HTTP server
      if (server.httpServer) {
        server.ssrLoadModule('/src/server/broadcastHub.ts')
          .then(({ attachBroadcastWebSocketServer }) => {
            attachBroadcastWebSocketServer(server.httpServer);
          })
          .catch((err) => console.error('[BroadcastHub attach error]:', err));
      }

      // Cleanup Jogo da Call channels & notify SMS if Vite server restarts/closes
      server.httpServer?.once('close', () => {
        server.ssrLoadModule('/src/server/callGame.ts')
          .then(({ cleanupAllCallGamesOnShutdown }) =>
            cleanupAllCallGamesOnShutdown('Servidor do site encerrado ou reiniciado.')
          )
          .catch(() => {});
      });

      const app = express();
      
      // Raw body capture for Discord Ed25519 webhook signature validation and large audio/video uploads
      app.use(express.json({
        limit: '60mb',
        verify: (req, _res, buf) => {
          (req as any).rawBody = buf.toString('utf8');
        }
      }));
      app.use(express.urlencoded({ limit: '60mb', extended: true }));

      // Handle Discord HTTP Interactions
      app.post(['/public/discord/interactions', '/api/public/discord/interactions'], async (req, res) => {
        try {
          const { handleDiscordInteractions } = await server.ssrLoadModule('/src/server/api.ts');
          return handleDiscordInteractions(req, res);
        } catch (err) {
          console.error('[Discord Webhook Error]:', err);
          res.status(500).json({ error: (err as Error).message });
        }
      });

      // API router
      app.use(async (req, res, next) => {
        try {
          const { apiRouter } = await server.ssrLoadModule('/src/server/api.ts');
          return apiRouter(req, res, next);
        } catch (err) {
          next(err);
        }
      });

      // Express error handler (prevents PayloadTooLargeError from bubbling to Vite's Connect handler)
      app.use((err: any, _req: any, res: any, _next: any) => {
        const status = err?.status || err?.statusCode || 500;
        const message =
          err?.type === 'entity.too.large'
            ? 'Arquivo muito grande para envio (limite máximo de 60MB no payload).'
            : err?.message || 'Erro interno no servidor.';
        if (!res.headersSent) {
          res.status(status).json({ error: message });
        }
      });

      // Mount Express on Connect middleware under /api
      server.middlewares.use('/api', app);

      // Also support /auth/callback directly for Discord OAuth2 Redirect URIs
      const authCallbackApp = express();
      authCallbackApp.get(['/', '/*'], async (req, res) => {
        try {
          const { handleDiscordOAuthCallbackReq } = await server.ssrLoadModule('/src/server/discordOAuth.ts');
          return await handleDiscordOAuthCallbackReq(req, res);
        } catch (err) {
          res.status(500).send((err as Error).message);
        }
      });
      server.middlewares.use('/auth/callback', authCallbackApp);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
