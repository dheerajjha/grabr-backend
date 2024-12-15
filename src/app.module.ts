import { Module } from '@nestjs/common';
import { TorrentModule } from './torrent/torrent.module.js';
import { FileModule } from './file/file.module.js';

@Module({
  imports: [TorrentModule, FileModule],
})
export class AppModule {}