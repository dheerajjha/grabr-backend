import { Injectable, Logger, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import type WebTorrent from 'webtorrent';

interface TorrentProgress {
  progress: number;
  files: Array<{ name: string; path: string; size: number; }>;
}

@Injectable()
export class TorrentService {
  private client: WebTorrent.Instance | null = null;
  private readonly logger = new Logger(TorrentService.name);
  private readonly downloadPath = path.join(process.cwd(), 'downloads');
  private initialized = false;
  private initializing = false;
  private activeDownloads = new Map<string, TorrentProgress>();

  constructor() {
    this.init().catch(err => {
      this.logger.error('Failed to initialize TorrentService:', err);
    });
  }

  async getProgress(infoHash: string): Promise<number> {
    const download = this.activeDownloads.get(infoHash);
    if (!download) {
      throw new NotFoundException('Download not found');
    }
    return download.progress;
  }

  private validateMagnetLink(magnetLink: string): void {
    if (!magnetLink.startsWith('magnet:?')) {
      throw new BadRequestException('Invalid magnet link format: must start with "magnet:?"');
    }

    if (!magnetLink.includes('xt=urn:btih:')) {
      throw new BadRequestException('Invalid magnet link format: missing hash identifier');
    }

    // Check for duplicate magnet prefix
    const magnetPrefixCount = (magnetLink.match(/magnet:\?/g) || []).length;
    if (magnetPrefixCount > 1) {
      throw new BadRequestException('Invalid magnet link format: contains duplicate magnet prefix');
    }
  }

  private async init() {
    if (this.initializing) {
      return;
    }

    this.initializing = true;
    try {
      await this.initializeClient();
      if (!fs.existsSync(this.downloadPath)) {
        fs.mkdirSync(this.downloadPath, { recursive: true });
      }
      this.initialized = true;
    } catch (error) {
      this.logger.error('Initialization failed:', error);
      throw new InternalServerErrorException('Failed to initialize torrent service');
    } finally {
      this.initializing = false;
    }
  }

  private async initializeClient() {
    try {
      const WebTorrent = (await import('webtorrent')).default;
      this.client = new WebTorrent();

      // Add global error handler for the client
      this.client.on('error', (err) => {
        this.logger.error('WebTorrent client error:', err);
      });
    } catch (error) {
      this.logger.error('Failed to initialize WebTorrent:', error);
      throw new InternalServerErrorException('Failed to initialize torrent client');
    }
  }

  async downloadTorrent(magnetLink: string, username: string): Promise<any> {
    if (!this.initialized || !this.client) {
      try {
        await this.init();
      } catch (error) {
        throw new InternalServerErrorException('Service not ready');
      }
    }

    // Validate magnet link before proceeding
    this.validateMagnetLink(magnetLink);

    return new Promise((resolve, reject) => {
      const userPath = path.join(this.downloadPath, username);
      
      try {
        if (!fs.existsSync(userPath)) {
          fs.mkdirSync(userPath, { recursive: true });
        }

        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          reject(new InternalServerErrorException('Download request timed out'));
        }, 30000); // 30 seconds timeout

        this.client!.add(magnetLink, { path: userPath }, (torrent) => {
          clearTimeout(timeout);
          this.logger.log(`Client is downloading: ${torrent.infoHash}`);

          // Initialize progress tracking
          this.activeDownloads.set(torrent.infoHash, {
            progress: 0,
            files: torrent.files.map(file => ({
              name: file.name,
              path: path.join(userPath, file.path),
              size: file.length,
            }))
          });

          // Track download progress
          torrent.on('download', (bytes) => {
            const progress = Math.min(100, torrent.progress * 100);
            this.logger.debug(`Progress: ${progress.toFixed(1)}%`);
            const download = this.activeDownloads.get(torrent.infoHash);
            if (download) {
              download.progress = progress;
            }
          });

          torrent.on('done', () => {
            try {
              const files = torrent.files.map(file => ({
                name: file.name,
                path: path.join(userPath, file.path),
                size: file.length,
              }));

              // Update progress to 100%
              const download = this.activeDownloads.get(torrent.infoHash);
              if (download) {
                download.progress = 100;
              }

              resolve({
                infoHash: torrent.infoHash,
                files,
                downloadPath: userPath,
              });

              // Remove the torrent after completion
              this.client!.remove(torrent, { destroyStore: false }, (err: Error | null) => {
                if (err) {
                  this.logger.error('Error removing torrent:', err);
                }
                // Remove from active downloads after a delay
                setTimeout(() => {
                  this.activeDownloads.delete(torrent.infoHash);
                }, 5000);
              });
            } catch (error) {
              reject(new InternalServerErrorException('Error processing completed torrent'));
            }
          });

          torrent.on('error', (err: Error | string) => {
            clearTimeout(timeout);
            const errorMessage = typeof err === 'string' ? err : err.message;
            this.logger.error(`Torrent error: ${errorMessage}`);
            this.activeDownloads.delete(torrent.infoHash);
            reject(new BadRequestException(`Torrent error: ${errorMessage}`));
          });

          torrent.on('warning', (warn) => {
            this.logger.warn(`Torrent warning: ${warn}`);
          });
        }).on('error', (err: Error | string) => {
          clearTimeout(timeout);
          const errorMessage = typeof err === 'string' ? err : err.message;
          this.logger.error('Error adding torrent:', errorMessage);
          reject(new BadRequestException(`Error adding torrent: ${errorMessage}`));
        });

      } catch (error) {
        reject(new InternalServerErrorException('Failed to process torrent request'));
      }
    });
  }
}