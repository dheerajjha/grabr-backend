import { Controller, Get, Param } from '@nestjs/common';
import { FileService } from './file.service.js';

@Controller('api/files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Get('list/:username')
  async listFiles(@Param('username') username: string) {
    return this.fileService.listFiles(username);
  }
}