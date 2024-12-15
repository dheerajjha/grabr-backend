import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface FileInfo {
  name: string;
  type: 'file' | 'directory';
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

  private scanDirectory(dirPath: string): FileInfo[] {
    const items = fs.readdirSync(dirPath);
    const result: FileInfo[] = [];

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stats = fs.statSync(fullPath);
      
      const fileInfo: FileInfo = {
        name: item,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        path: fullPath.replace(process.cwd(), ''),
      };

      if (stats.isDirectory()) {
        fileInfo.children = this.scanDirectory(fullPath);
      }

      result.push(fileInfo);
    }

    return result;
  }
} 