import { Controller, Get, Param } from '@nestjs/common';
import { FileService } from './file.service.js';

interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  size: number;
  path: string;
  children?: FileInfo[];
}

@Controller('api/files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Get('list/:username')
  async listFiles(@Param('username') username: string): Promise<{ files: FileInfo[] }> {
    return this.fileService.listFiles(username);
  }
}