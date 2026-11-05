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

      const app = express();
      
      // Raw body capture for Discord Ed25519 webhook signature validation
      app.use(express.json({
        verify: (req, _res, buf) => {
          (req as any).rawBody = buf.toString('utf8');
        }
      }));
      app.use(express.urlencoded({ extended: true }));

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

      // Mount Express on Connect middleware under /api
      server.middlewares.use('/api', app);
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
