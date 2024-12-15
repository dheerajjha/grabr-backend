import { Module } from '@nestjs/common';
import { TorrentModule } from './torrent/torrent.module';

@Module({
  imports: [TorrentModule],
})
export class AppModule {} 