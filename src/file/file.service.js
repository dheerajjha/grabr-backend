import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class FileService {
  constructor() {
    this.downloadPath = path.join(process.cwd(), process.env.DOWNLOAD_PATH || 'downloads');
    logger.info('Initializing FileService', { downloadPath: this.downloadPath });
    
    // Ensure download directory exists
    if (!fs.existsSync(this.downloadPath)) {
      logger.info('Creating download directory', { path: this.downloadPath });
      fs.mkdirSync(this.downloadPath, { recursive: true });
    }
  }

  async listFiles(username) {
    logger.debug('Listing files for user', { username });
    const userDir = path.join(this.downloadPath, username);
    
    if (!fs.existsSync(userDir)) {
      logger.debug('User directory does not exist', { username, path: userDir });
      return { files: [] };
    }

    const files = this.scanDirectory(userDir);
    logger.debug('Files listed successfully', { 
      username, 
      fileCount: files.length 
    });
    return { files };
  }

  async getFileStream(filePath, start, end) {
    const fullPath = path.join(process.cwd(), filePath);
    const options = {};
    
    if (typeof start === 'number' && typeof end === 'number') {
      options.start = start;
      options.end = end;
      logger.debug('Creating range stream', { 
        path: filePath, 
        start, 
        end 
      });
    } else {
      logger.debug('Creating full file stream', { path: filePath });
    }
    
    try {
      const stream = createReadStream(fullPath, options);
      return stream;
    } catch (error) {
      logger.error('Error creating file stream', { 
        path: filePath, 
        error: error.message 
      });
      throw error;
    }
  }

  async getFileInfo(filePath) {
    logger.debug('Getting file info', { path: filePath });
    const fullPath = path.join(process.cwd(), filePath);
    
    try {
      const stats = fs.statSync(fullPath);
      const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
      
      logger.debug('File info retrieved', { 
        path: filePath,
        size: stats.size,
        mimeType
      });
      
      return { type: mimeType, size: stats.size };
    } catch (error) {
      logger.error('Error getting file info', { 
        path: filePath, 
        error: error.message 
      });
      throw error;
    }
  }

  scanDirectory(dirPath) {
    logger.debug('Scanning directory', { path: dirPath });
    const items = fs.readdirSync(dirPath);
    const result = [];

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stats = fs.statSync(fullPath);
      const relativePath = fullPath.replace(process.cwd(), '');
      
      const fileInfo = {
        name: item,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        path: relativePath,
      };

      if (!stats.isDirectory()) {
        fileInfo.mimeType = mime.lookup(fullPath) || 'application/octet-stream';
        logger.debug('Found file', { 
          name: item, 
          size: stats.size, 
          mimeType: fileInfo.mimeType 
        });
      } else {
        logger.debug('Found directory', { name: item });
      }

      if (stats.isDirectory()) {
        fileInfo.children = this.scanDirectory(fullPath);
        logger.debug('Scanned subdirectory', { 
          name: item, 
          childCount: fileInfo.children.length 
        });
      }

      result.push(fileInfo);
    }

    logger.debug('Directory scan complete', { 
      path: dirPath, 
      itemCount: result.length 
    });
    return result;
  }
}

export const fileService = new FileService(); 