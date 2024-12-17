import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from 'dotenv';
import { TorrentRouter } from './torrent/torrent.router.js';
import { FileRouter } from './file/file.router.js';
import { logger } from './utils/logger.js';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || 'localhost';

logger.info('Starting Grabr Backend Service', {
  port,
  host,
  nodeEnv: process.env.NODE_ENV || 'development'
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  const origin = process.env.CORS_ORIGIN || '*';
  const methods = process.env.CORS_METHODS || 'GET, POST, OPTIONS';
  
  logger.debug('CORS request', {
    origin: req.headers.origin,
    method: req.method,
    path: req.path
  });

  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', methods);
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  if (req.method === 'OPTIONS') {
    logger.debug('Responding to CORS preflight request');
    return res.sendStatus(200);
  }
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip
  });

  // Log response after completion
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
});

// Routes
app.use('/api/torrents', TorrentRouter);
app.use('/api/files', FileRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason.message || reason,
    stack: reason.stack
  });
});

app.listen(port, host, () => {
  logger.info('Server started successfully', {
    url: `http://${host}:${port}`,
    env: process.env.NODE_ENV || 'development'
  });
}); 