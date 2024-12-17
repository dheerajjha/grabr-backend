import WebTorrent from 'webtorrent';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class TorrentService {
  constructor() {
    this.client = null;
    this.downloadPath = path.join(process.cwd(), process.env.DOWNLOAD_PATH || 'downloads');
    this.initialized = false;
    this.initializing = false;
    this.activeDownloads = new Map();
    this.torrentTimeout = parseInt(process.env.TORRENT_TIMEOUT) || 3000000;
    
    logger.info('Initializing TorrentService', {
      downloadPath: this.downloadPath,
      torrentTimeout: this.torrentTimeout
    });
    
    this.init().catch(err => {
      logger.error('Failed to initialize TorrentService', { error: err.message });
    });
  }

  async init() {
    if (this.initializing) {
      logger.debug('TorrentService initialization already in progress');
      return;
    }

    this.initializing = true;
    try {
      await this.initializeClient();
      if (!fs.existsSync(this.downloadPath)) {
        logger.info('Creating download directory', { path: this.downloadPath });
        fs.mkdirSync(this.downloadPath, { recursive: true });
      }
      this.initialized = true;
      logger.info('TorrentService initialized successfully');
    } catch (error) {
      logger.error('Initialization failed', { error: error.message });
      throw new Error('Failed to initialize torrent service');
    } finally {
      this.initializing = false;
    }
  }

  async initializeClient() {
    try {
      logger.info('Initializing WebTorrent client');
      
      // Add public trackers to improve peer discovery
      const announceList = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://open.stealth.si:80/announce',
        'udp://exodus.desync.com:6969/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://explodie.org:6969/announce',
        'udp://tracker.moeking.me:6969/announce',
        'udp://tracker.tiny-vps.com:6969/announce',
        'udp://tracker.theoks.net:6969/announce',
        'udp://tracker.skyts.net:6969/announce'
      ];

      this.client = new WebTorrent({
        maxConns: 100,        // Maximum number of connections per torrent
        nodeId: 'grabr',      // Node ID for DHT
        tracker: true,        // Enable trackers
        dht: true,           // Enable DHT
        webSeeds: true,      // Enable WebSeeds
        announce: announceList,
        destroyStoreOnDestroy: false
      });
      
      // Log DHT events
      this.client.on('error', (err) => {
        logger.error('WebTorrent client error', { error: err.message });
      });

      // Log DHT events
      if (this.client.dht) {
        this.client.dht.on('listening', () => {
          logger.info('DHT listening', {
            address: this.client.dht.address()
          });
        });

        this.client.dht.on('peer', (peer, infoHash, from) => {
          logger.debug('DHT found peer', {
            peer: peer.host + ':' + peer.port,
            infoHash,
            from: from.address + ':' + from.port
          });
        });

        this.client.dht.on('error', (err) => {
          logger.error('DHT error', { error: err.message });
        });
      }

      logger.info('WebTorrent client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize WebTorrent', { error: error.message });
      throw new Error('Failed to initialize torrent client');
    }
  }

  validateMagnetLink(magnetLink) {
    logger.debug('Validating magnet link', { magnetLink });

    if (!magnetLink.startsWith('magnet:?')) {
      logger.error('Invalid magnet link format', { error: 'Must start with "magnet:?"' });
      throw new Error('Invalid magnet link format: must start with "magnet:?"');
    }

    if (!magnetLink.includes('xt=urn:btih:')) {
      logger.error('Invalid magnet link format', { error: 'Missing hash identifier' });
      throw new Error('Invalid magnet link format: missing hash identifier');
    }

    const magnetPrefixCount = (magnetLink.match(/magnet:\?/g) || []).length;
    if (magnetPrefixCount > 1) {
      logger.error('Invalid magnet link format', { error: 'Contains duplicate magnet prefix' });
      throw new Error('Invalid magnet link format: contains duplicate magnet prefix');
    }

    logger.debug('Magnet link validation successful');
  }

  async getProgress(infoHash) {
    logger.debug('Getting download progress', { infoHash });
    const download = this.activeDownloads.get(infoHash);
    if (!download) {
      logger.error('Download not found', { infoHash });
      throw new Error('Download not found');
    }
    logger.debug('Progress retrieved', { infoHash, progress: download.progress });
    return download.progress;
  }

  async downloadTorrent(magnetLink, username) {
    if (!this.initialized) {
      logger.error('Service not ready', { initialized: this.initialized });
      throw new Error('Service not ready');
    }

    logger.info('Starting torrent download', { username });
    this.validateMagnetLink(magnetLink);

    return new Promise((resolve, reject) => {
      const userPath = path.join(this.downloadPath, username);
      
      try {
        if (!fs.existsSync(userPath)) {
          logger.info('Creating user directory', { path: userPath });
          fs.mkdirSync(userPath, { recursive: true });
        }

        logger.debug('Setting up download timeout', { timeout: this.torrentTimeout });
        const timeout = setTimeout(() => {
          logger.error('Download request timed out', { timeout: this.torrentTimeout });
          reject(new Error('Download request timed out'));
        }, this.torrentTimeout);

        logger.info('Adding torrent to client', { magnetLink });
        
        // Log current client state
        logger.debug('Current client state', {
          torrents: this.client.torrents.length,
          downloadSpeed: this.client.downloadSpeed,
          uploadSpeed: this.client.uploadSpeed,
          progress: this.client.progress,
          ratio: this.client.ratio
        });

        const torrentOptions = {
          path: userPath,
          announce: this.client.announce,  // Use the same trackers
          maxWebConns: 100,               // Maximum number of web seed connections
          private: false,                 // Not a private torrent
          strategy: 'sequential'          // Download sequentially
        };

        this.client.add(magnetLink, torrentOptions, (torrent) => {
          clearTimeout(timeout);
          logger.info('Torrent added successfully', { 
            infoHash: torrent.infoHash,
            name: torrent.name,
            size: torrent.length,
            trackers: torrent.announce,
            magnetURI: torrent.magnetURI
          });

          // Log initial torrent state
          logger.info('Initial torrent state', {
            infoHash: torrent.infoHash,
            connected: torrent.connected,
            paused: torrent.paused,
            received: torrent.received,
            downloaded: torrent.downloaded,
            uploaded: torrent.uploaded,
            progress: torrent.progress,
            ratio: torrent.ratio,
            downloadSpeed: torrent.downloadSpeed,
            uploadSpeed: torrent.uploadSpeed,
            numPeers: torrent.numPeers,
            maxWebConns: torrent.maxWebConns,
            path: torrent.path,
            ready: torrent.ready,
            destroyed: torrent.destroyed
          });

          // Log discovery events
          torrent.on('infoHash', () => {
            logger.debug('Got infohash', { infoHash: torrent.infoHash });
          });

          // Initialize progress tracking
          this.activeDownloads.set(torrent.infoHash, {
            progress: 0,
            files: torrent.files.map(file => ({
              name: file.name,
              path: path.join(userPath, file.path),
              size: file.length,
            }))
          });

          // Track metadata
          torrent.on('metadata', () => {
            logger.info('Received torrent metadata', {
              infoHash: torrent.infoHash,
              name: torrent.name,
              size: torrent.length,
              files: torrent.files.length
            });
          });

          // Track download progress
          let lastLogged = 0;
          torrent.on('download', (bytes) => {
            const progress = Math.min(100, torrent.progress * 100);
            const currentProgress = Math.floor(progress);
            
            // Log every 5% progress or if speed changes significantly
            if (currentProgress >= lastLogged + 5) {
              logger.info('Download progress', {
                infoHash: torrent.infoHash,
                progress: `${currentProgress}%`,
                downloadSpeed: `${(torrent.downloadSpeed / 1024 / 1024).toFixed(2)} MB/s`,
                timeRemaining: `${Math.floor(torrent.timeRemaining / 1000)}s`,
                downloaded: `${(torrent.downloaded / 1024 / 1024).toFixed(2)} MB`,
                total: `${(torrent.length / 1024 / 1024).toFixed(2)} MB`,
                numPeers: torrent.numPeers,
                connections: torrent.connections.length
              });
              lastLogged = currentProgress;
            }

            const download = this.activeDownloads.get(torrent.infoHash);
            if (download) {
              download.progress = progress;
            }
          });

          // Track individual peer connections
          torrent.on('peer', (peer) => {
            logger.debug('New peer found', {
              infoHash: torrent.infoHash,
              peerAddress: peer.addr,
              peerPort: peer.port,
              type: peer.type,
              totalPeers: torrent.numPeers
            });
          });

          // Track when pieces are verified
          torrent.on('piece', (piece) => {
            logger.debug('Piece verified', {
              infoHash: torrent.infoHash,
              pieceIndex: piece,
              totalPieces: torrent.pieces.length,
              verifiedPieces: torrent.pieces.filter(p => p).length
            });
          });

          torrent.on('done', () => {
            try {
              logger.info('Torrent download completed', { 
                infoHash: torrent.infoHash,
                name: torrent.name,
                totalSize: `${(torrent.length / 1024 / 1024).toFixed(2)} MB`,
                totalPeers: torrent.numPeers,
                timeElapsed: `${Math.floor((Date.now() - torrent.startTime) / 1000)}s`
              });

              const files = torrent.files.map(file => ({
                name: file.name,
                path: path.join(userPath, file.path),
                size: file.length,
              }));

              logger.debug('Processed files', { fileCount: files.length });

              const download = this.activeDownloads.get(torrent.infoHash);
              if (download) {
                download.progress = 100;
              }

              resolve({
                infoHash: torrent.infoHash,
                files,
                downloadPath: userPath,
              });

              logger.debug('Removing torrent from client', { infoHash: torrent.infoHash });
              this.client.remove(torrent, { destroyStore: false }, (err) => {
                if (err) {
                  logger.error('Error removing torrent', { error: err.message });
                } else {
                  logger.debug('Torrent removed successfully');
                }
                setTimeout(() => {
                  this.activeDownloads.delete(torrent.infoHash);
                  logger.debug('Removed from active downloads', { infoHash: torrent.infoHash });
                }, 5000);
              });
            } catch (error) {
              logger.error('Error processing completed torrent', { error: error.message });
              reject(new Error('Error processing completed torrent'));
            }
          });

          torrent.on('error', (err) => {
            clearTimeout(timeout);
            const errorMessage = typeof err === 'string' ? err : err.message;
            logger.error('Torrent error', { 
              infoHash: torrent.infoHash,
              error: errorMessage,
              numPeers: torrent.numPeers,
              connected: torrent.connected,
              received: torrent.received
            });
            this.activeDownloads.delete(torrent.infoHash);
            reject(new Error(`Torrent error: ${errorMessage}`));
          });

          torrent.on('warning', (warn) => {
            logger.warn('Torrent warning', { 
              infoHash: torrent.infoHash,
              warning: warn,
              numPeers: torrent.numPeers,
              connected: torrent.connected
            });
          });

          // Track peer connections
          torrent.on('wire', (wire, addr) => {
            logger.debug('Peer connected', { 
              infoHash: torrent.infoHash,
              peerAddress: addr,
              totalPeers: torrent.numPeers,
              totalConnections: torrent.connections.length
            });
          });

          // Track peer disconnections
          torrent.on('peerclose', (addr) => {
            logger.debug('Peer disconnected', {
              infoHash: torrent.infoHash,
              peerAddress: addr,
              remainingPeers: torrent.numPeers,
              remainingConnections: torrent.connections.length
            });
          });

          torrent.on('upload', (bytes) => {
            logger.debug('Upload progress', {
              infoHash: torrent.infoHash,
              uploadSpeed: `${(torrent.uploadSpeed / 1024 / 1024).toFixed(2)} MB/s`,
              uploaded: `${(torrent.uploaded / 1024 / 1024).toFixed(2)} MB`,
              ratio: torrent.ratio
            });
          });

          torrent.on('noPeers', (announceType) => {
            logger.warn('No peers available', { 
              infoHash: torrent.infoHash,
              announceType,
              trackers: torrent.announce,
              numPeers: torrent.numPeers,
              connected: torrent.connected
            });
          });

          // Add tracker events
          torrent.on('trackerAnnounce', () => {
            logger.debug('Tracker announce', {
              infoHash: torrent.infoHash,
              trackers: torrent.announce
            });
          });

          torrent.on('trackerError', (err) => {
            logger.warn('Tracker error', {
              infoHash: torrent.infoHash,
              error: err.message
            });
          });

          torrent.on('trackerWarning', (err) => {
            logger.warn('Tracker warning', {
              infoHash: torrent.infoHash,
              warning: err.message
            });
          });

        }).on('error', (err) => {
          clearTimeout(timeout);
          const errorMessage = typeof err === 'string' ? err : err.message;
          logger.error('Error adding torrent', { 
            error: errorMessage,
            clientTorrents: this.client.torrents.length,
            clientState: {
              downloadSpeed: this.client.downloadSpeed,
              uploadSpeed: this.client.uploadSpeed,
              progress: this.client.progress,
              ratio: this.client.ratio
            }
          });
          reject(new Error(`Error adding torrent: ${errorMessage}`));
        });

      } catch (error) {
        logger.error('Failed to process torrent request', { error: error.message });
        reject(new Error('Failed to process torrent request'));
      }
    });
  }
}

export const torrentService = new TorrentService(); 