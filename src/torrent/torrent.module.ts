import { Module } from '@nestjs/common';
import { TorrentController } from './torrent.controller';
import { TorrentService } from './torrent.service';

@Module({
  controllers: [TorrentController],
  providers: [TorrentService],
  exports: [TorrentService],
})
export class TorrentModule {} 