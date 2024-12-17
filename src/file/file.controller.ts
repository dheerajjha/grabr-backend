import { Controller, Get, Param, Res, Header, Headers, StreamableFile } from '@nestjs/common';
import express from 'express';
import { FileService } from './file.service.js';

interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  mimeType?: string;
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

  @Get('stream/*')
  @Header('Accept-Ranges', 'bytes')
  async streamFile(
    @Param('0') filePath: string,
    @Headers('range') range: string,
    @Res() res: express.Response,
  ) {
    const fileInfo = await this.fileService.getFileInfo(filePath);
    
    // Set content type and accept ranges
    res.set({
      'Content-Type': fileInfo.type,
      'Accept-Ranges': 'bytes',
    });

    // Handle range request
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileInfo.size - 1;
      const chunksize = end - start + 1;

      res.set({
        'Content-Range': `bytes ${start}-${end}/${fileInfo.size}`,
        'Content-Length': chunksize,
        'Content-Type': fileInfo.type,
      });
      res.status(206);

      const stream = await this.fileService.getFileStream(filePath, start, end);
      stream.pipe(res);
    } else {
      // No range requested, send entire file
      res.set({
        'Content-Length': fileInfo.size,
        'Content-Type': fileInfo.type,
      });
      
      const stream = await this.fileService.getFileStream(filePath);
      stream.pipe(res);
    }
  }

  @Get('view/*')
  async viewFile(
    @Param('0') filePath: string,
    @Res() res: express.Response,
  ) {
    const fileInfo = await this.fileService.getFileInfo(filePath);
    res.set({
      'Content-Type': fileInfo.type,
      'Content-Length': fileInfo.size,
    });
    
    const stream = await this.fileService.getFileStream(filePath);
    stream.pipe(res);
  }
}