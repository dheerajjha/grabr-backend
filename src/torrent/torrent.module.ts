import { Module } from '@nestjs/common';
import { TorrentController } from './torrent.controller.js';
import { TorrentService } from './torrent.service.js';

@Module({
  controllers: [TorrentController],
  providers: [TorrentService],
  exports: [TorrentService],
})
export class TorrentModule {}