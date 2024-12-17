import { Injectable, StreamableFile } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';
import { createReadStream } from 'fs';

interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  mimeType?: string;
  size: number;
  path: string;
  children?: FileInfo[];
}

@Injectable()
export class FileService {
  async listFiles(username: string): Promise<{ files: FileInfo[] }> {
    const userDir = path.join(process.cwd(), 'downloads', username);
    
    if (!fs.existsSync(userDir)) {
      return { files: [] };
    }

    const files = this.scanDirectory(userDir);
    return { files };
  }

  async getFileStream(filePath: string, start?: number, end?: number) {
    const fullPath = path.join(process.cwd(), filePath);
    const options: any = {};
    
    if (typeof start === 'number' && typeof end === 'number') {
      options.start = start;
      options.end = end;
    }
    
    return createReadStream(fullPath, options);
  }

  async getFileInfo(filePath: string): Promise<{ type: string; size: number }> {
    const fullPath = path.join(process.cwd(), filePath);
    const stats = fs.statSync(fullPath);
    const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
    return { type: mimeType, size: stats.size };
  }

  private scanDirectory(dirPath: string): FileInfo[] {
    const items = fs.readdirSync(dirPath);
    const result: FileInfo[] = [];

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stats = fs.statSync(fullPath);
      const relativePath = fullPath.replace(process.cwd(), '');
      
      const fileInfo: FileInfo = {
        name: item,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        path: relativePath,
      };

      if (!stats.isDirectory()) {
        fileInfo.mimeType = mime.lookup(fullPath) || 'application/octet-stream';
      }

      if (stats.isDirectory()) {
        fileInfo.children = this.scanDirectory(fullPath);
      }

      result.push(fileInfo);
    }

    return result;
  }
} 