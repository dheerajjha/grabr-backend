import { Controller, Post, Body, BadRequestException, InternalServerErrorException, HttpException } from '@nestjs/common';
import { TorrentService } from './torrent.service.js';

interface DownloadTorrentDto {
  magnetLink: string;
  username: string;
}

interface TorrentFile {
  name: string;
  path: string;
  size: number;
}

interface DownloadResponse {
  infoHash: string;
  files: TorrentFile[];
  downloadPath: string;
}

@Controller('api/torrents')
export class TorrentController {
  constructor(private readonly torrentService: TorrentService) {}

  @Post('download')
  async downloadTorrent(@Body() downloadDto: DownloadTorrentDto): Promise<DownloadResponse> {
    try {
      if (!downloadDto.magnetLink || !downloadDto.magnetLink.startsWith('magnet:?')) {
        throw new BadRequestException('Invalid magnet link format');
      }

      if (!downloadDto.username || downloadDto.username.trim().length === 0) {
        throw new BadRequestException('Username is required');
      }

      return await this.torrentService.downloadTorrent(downloadDto.magnetLink, downloadDto.username);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to process download request');
    }
  }
}