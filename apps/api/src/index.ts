import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';

import { initDatabase } from './db';
import { setupRoutes } from './routes';
import { setupSocketHandlers } from './services/socket';
import { ActivityService } from './activity';
import { SchedulerService } from './scheduler';
import { ChatterService } from './services/chatter';
import { llmService } from './services/llm';

const PORT = process.env.PORT || 3201;
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new SocketServer(httpServer, {
  cors: {
    origin: NODE_ENV === 'development'
      ? ['http://localhost:3200', 'http://127.0.0.1:3200']
      : process.env.CORS_ORIGIN?.split(',') || [],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: NODE_ENV === 'development'
    ? ['http://localhost:3200', 'http://127.0.0.1:3200']
    : process.env.CORS_ORIGIN?.split(',') || [],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// Initialize services
async function bootstrap() {
  try {
    // Initialize database
    console.info('Initializing database...');
    const db = initDatabase();

    // Make db available to routes
    app.locals.db = db;
    app.locals.io = io;

    // Setup routes
    setupRoutes(app);

    // Setup Socket.IO handlers
    setupSocketHandlers(io, db);

    // Initialize activity service
    const activityService = new ActivityService(db, io);
    app.locals.activityService = activityService;

    // Initialize chatter service for agent idle messages
    const chatterService = new ChatterService(db, io);
    app.locals.chatterService = chatterService;

    // Initialize scheduler (commented out until fully implemented)
    // const schedulerService = new SchedulerService(db, io, activityService);
    // app.locals.schedulerService = schedulerService;

    // Start heartbeat
    activityService.startHeartbeat();

    // Start chatter service (generates agent idle messages)
    chatterService.start();

    // Log LLM availability
    console.info(`[LLM] Tier 1 (Ollama): ${llmService.isTier1Available() ? 'Available' : 'Not Available'}`);
    console.info(`[LLM] Tier 2 configured: ${llmService.getConfig().tier2.anthropic ? 'Anthropic' : ''} ${llmService.getConfig().tier2.openai ? 'OpenAI' : ''} ${llmService.getConfig().tier2.gemini ? 'Gemini' : ''}`.trim());

    // Start server
    httpServer.listen(PORT, () => {
      console.info(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     █████╗ ██╗      ██████╗  ██████╗ ██████╗  █████╗        ║
║    ██╔══██╗██║     ██╔════╝ ██╔═══██╗██╔══██╗██╔══██╗       ║
║    ███████║██║     ██║  ███╗██║   ██║██████╔╝███████║       ║
║    ██╔══██║██║     ██║   ██║██║   ██║██╔══██╗██╔══██║       ║
║    ██║  ██║███████╗╚██████╔╝╚██████╔╝██║  ██║██║  ██║       ║
║    ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝       ║
║                                                              ║
║    24/7 Live Agentic Governance Platform                     ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║    API Server running on: http://localhost:${PORT}             ║
║    Environment: ${NODE_ENV.padEnd(43)}║
║    Database: SQLite with WAL mode                            ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
function gracefulShutdown(signal: string) {
  console.info(`${signal} received, shutting down...`);

  // Stop services
  if (app.locals.chatterService) {
    app.locals.chatterService.stop();
  }
  if (app.locals.activityService) {
    app.locals.activityService.stopHeartbeat();
  }

  httpServer.close(() => {
    console.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

bootstrap();

export { app, io };
