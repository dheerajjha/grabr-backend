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
      
      // Use more reliable trackers
      const announceList = [
        // UDP trackers
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://open.stealth.si:80/announce',
        'udp://exodus.desync.com:6969/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        
        // HTTP trackers
        'http://tracker.opentrackr.org:1337/announce',
        'http://tracker.openbittorrent.com:80/announce',
        'http://tracker.publicbt.com:80/announce',
        'http://tracker.gbitt.info:80/announce',
        'http://tracker.tfile.co:80/announce',
        'http://tracker.trackerfix.com:80/announce',
        'http://tracker.noobsubs.net:80/announce',
        'http://tracker.files.fm:6969/announce',
        'http://tracker.bt4g.com:2095/announce',
        'http://t.nyaatracker.com:80/announce',
        'http://open.acgnxtracker.com:80/announce'
      ];

      this.client = new WebTorrent({
        maxConns: 100,
        nodeId: 'grabr',
        tracker: {
          getAnnounceOpts: () => {
            return {
              numwant: 80,
              uploaded: 0,
              downloaded: 0,
              left: Number.MAX_SAFE_INTEGER,
              compact: 1
            };
          }
        },
        announce: announceList,
        dht: {
          bootstrap: [
            'router.bittorrent.com:6881',
            'dht.transmissionbt.com:6881',
            'router.utorrent.com:6881',
            'dht.aelitis.com:6881'
          ]
        },
        webSeeds: true,
        destroyStoreOnDestroy: false
      });
      
      // Log client events
      this.client.on('error', (err) => {
        logger.error('WebTorrent client error', { error: err.message, stack: err.stack });
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
          logger.error('DHT error', { error: err.message, stack: err.stack });
        });

        this.client.dht.on('node', (node) => {
          logger.debug('DHT node found', {
            node: node.host + ':' + node.port
          });
        });
      }

      logger.info('WebTorrent client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize WebTorrent', { error: error.message, stack: error.stack });
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
          ratio: this.client.ratio,
          dhtReady: this.client.dht ? this.client.dht.ready : false
        });

        const torrentOptions = {
          path: userPath,
          announce: this.client.announce,
          maxWebConns: 100,
          private: false,
          strategy: 'sequential',
          announceList: this.client.announce
        };

        let torrentAdded = false;
        let metadataReceived = false;
        const addTimeout = setTimeout(() => {
          if (!metadataReceived) {
            logger.error('Metadata fetch timed out', { magnetLink });
            reject(new Error('Failed to fetch torrent metadata - no peers available'));
          }
        }, 30000); // 30 second timeout for metadata

        const torrentAddCallback = (err, torrent) => {
          torrentAdded = true;

          if (err) {
            clearTimeout(addTimeout);
            logger.error('Error in torrent add callback', { error: err.message, stack: err.stack });
            reject(new Error(`Error adding torrent: ${err.message}`));
            return;
          }

          if (!torrent) {
            clearTimeout(addTimeout);
            logger.error('No torrent object in callback');
            reject(new Error('No torrent object returned'));
            return;
          }

          logger.info('Torrent added successfully', { 
            infoHash: torrent.infoHash,
            name: torrent.name,
            size: torrent.length,
            trackers: torrent.announce,
            magnetURI: torrent.magnetURI
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
            metadataReceived = true;
            clearTimeout(addTimeout);
            logger.info('Received torrent metadata', {
              infoHash: torrent.infoHash,
              name: torrent.name,
              size: torrent.length,
              files: torrent.files.length,
              pieceLength: torrent.pieceLength,
              lastPieceLength: torrent.lastPieceLength,
              pieces: torrent.pieces.length
            });
          });

          // Track download progress
          let lastLogged = 0;
          torrent.on('download', (bytes) => {
            const progress = Math.min(100, torrent.progress * 100);
            const currentProgress = Math.floor(progress);
            
            if (currentProgress >= lastLogged + 5) {
              logger.info('Download progress', {
                infoHash: torrent.infoHash,
                progress: `${currentProgress}%`,
                downloadSpeed: `${(torrent.downloadSpeed / 1024 / 1024).toFixed(2)} MB/s`,
                timeRemaining: `${Math.floor(torrent.timeRemaining / 1000)}s`,
                downloaded: `${(torrent.downloaded / 1024 / 1024).toFixed(2)} MB`,
                total: `${(torrent.length / 1024 / 1024).toFixed(2)} MB`,
                numPeers: torrent.numPeers,
                connections: torrent.connections.length,
                interested: torrent._amInterested,
                ready: torrent.ready,
                paused: torrent.paused
              });
              lastLogged = currentProgress;
            }

            const download = this.activeDownloads.get(torrent.infoHash);
            if (download) {
              download.progress = progress;
            }
          });

          // Track peer discovery
          torrent.on('peer', (peer) => {
            logger.debug('Peer discovered', {
              infoHash: torrent.infoHash,
              peerAddress: peer.host + ':' + peer.port,
              peerType: peer.type,
              totalPeers: torrent.numPeers
            });
          });

          // Track tracker events
          torrent.on('trackerAnnounce', () => {
            logger.debug('Tracker announce', {
              infoHash: torrent.infoHash,
              trackers: torrent.announce,
              numPeers: torrent.numPeers
            });
          });

          torrent.on('trackerError', (err) => {
            logger.warn('Tracker error', {
              infoHash: torrent.infoHash,
              error: err.message,
              trackers: torrent.announce
            });
          });

          // Rest of your event handlers...
          // ... (keep existing event handlers)
        };

        // Add the torrent with explicit error handling
        try {
          const torrentHandle = this.client.add(magnetLink, torrentOptions, torrentAddCallback);
          
          // Additional error handler for the add operation
          torrentHandle.on('error', (err) => {
            logger.error('Error during torrent add', { 
              error: err.message, 
              stack: err.stack 
            });
          });

          torrentHandle.on('warning', (warn) => {
            logger.warn('Warning during torrent add', { 
              warning: warn,
              magnetLink
            });
          });

          torrentHandle.on('noPeers', (announceType) => {
            logger.warn('No peers found', {
              announceType,
              magnetLink
            });
          });

        } catch (err) {
          clearTimeout(addTimeout);
          logger.error('Exception during torrent add', { 
            error: err.message, 
            stack: err.stack 
          });
          reject(new Error(`Exception adding torrent: ${err.message}`));
        }

      } catch (error) {
        logger.error('Failed to process torrent request', { 
          error: error.message, 
          stack: error.stack 
        });
        reject(new Error('Failed to process torrent request'));
      }
    });
  }
}

export const torrentService = new TorrentService(); 