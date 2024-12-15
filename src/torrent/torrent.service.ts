import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class TorrentService {
  private client: any;
  private readonly logger = new Logger(TorrentService.name);
  private readonly downloadPath = path.join(process.cwd(), 'downloads');
  private initialized = false;

  constructor() {
    this.init();
  }

  private async init() {
    await this.initializeClient();
    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true });
    }
    this.initialized = true;
  }

  private async initializeClient() {
    try {
      const WebTorrent = (await import('webtorrent')).default;
      this.client = new WebTorrent();
    } catch (error) {
      this.logger.error('Failed to initialize WebTorrent:', error);
      throw error;
    }
  }

  async downloadTorrent(magnetLink: string, username: string): Promise<any> {
    if (!this.initialized) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const userPath = path.join(this.downloadPath, username);
      
      // Create user directory if it doesn't exist
      if (!fs.existsSync(userPath)) {
        fs.mkdirSync(userPath, { recursive: true });
      }

      this.client.add(magnetLink, { path: userPath }, (torrent) => {
        this.logger.log(`Client is downloading: ${torrent.infoHash}`);

        // Track download progress
        torrent.on('download', (bytes) => {
          this.logger.debug(`Progress: ${(torrent.progress * 100).toFixed(1)}%`);
        });

        // When the torrent is done, resolve with file information
        torrent.on('done', () => {
          const files = torrent.files.map(file => ({
            name: file.name,
            path: path.join(userPath, file.path),
            size: file.length,
          }));

          resolve({
            infoHash: torrent.infoHash,
            files,
            downloadPath: userPath,
          });

          // Optional: Remove the torrent from the client
          this.client.remove(torrent.infoHash);
        });

        // Handle errors
        torrent.on('error', (err) => {
          this.logger.error(`Torrent error: ${(err as Error).message}`);
          reject(err);
        });
      });
    });
  }
}