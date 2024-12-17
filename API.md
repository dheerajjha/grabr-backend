# Grabr API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication
Currently, the API does not require authentication tokens, but users are identified by their username in relevant endpoints.

## Endpoints

### Torrent Operations

#### 1. Download Torrent
- **Endpoint**: `POST /torrents/download`
- **Description**: Initiates a torrent download using a magnet link
- **Request Body**:
  ```typescript
  {
    magnetLink: string;  // Must start with "magnet:?" and include "xt=urn:btih:"
    username: string;    // Non-empty string, used for organizing downloads
  }
  ```
- **Response**:
  ```typescript
  {
    infoHash: string;    // Unique identifier for the torrent
    files: {
      name: string;      // File name
      path: string;      // File path relative to download directory
      size: number;      // File size in bytes
    }[];
    downloadPath: string; // Base path where files are downloaded
  }
  ```
- **Error Responses**:
  - `400 Bad Request`:
    - Invalid magnet link format
    - Missing hash identifier
    - Duplicate magnet prefix
    - Missing username
  - `500 Internal Server Error`:
    - Service not ready
    - Failed to process torrent request
- **Timeout**: 30 seconds for initial torrent addition

#### 2. Get Torrent Progress
- **Endpoint**: `GET /torrents/:infoHash/progress`
- **Description**: Gets the download progress of a specific torrent
- **Parameters**:
  - `infoHash`: Unique identifier for the torrent
- **Response**:
  ```typescript
  {
    progress: number;  // Download progress percentage (0-100)
  }
  ```
- **Error Responses**:
  - `404 Not Found`: Download not found
  - `500 Internal Server Error`: Failed to get progress

### File Operations

#### 1. List Files
- **Endpoint**: `GET /files/list/:username`
- **Description**: Lists all files and directories for a specific user
- **Parameters**:
  - `username`: User's identifier
- **Response**:
  ```typescript
  {
    files: {
      name: string;           // File or directory name
      type: 'file' | 'directory';
      mimeType?: string;      // MIME type for files
      size: number;           // Size in bytes
      path: string;           // Relative path
      children?: FileInfo[];  // Subdirectories and files (for directories)
    }[];
  }
  ```
- **Notes**:
  - Returns empty array if user directory doesn't exist
  - Recursively lists all files and directories
  - MIME types are automatically detected

#### 2. Stream File
- **Endpoint**: `GET /files/stream/*`
- **Description**: Streams a file with support for range requests (useful for media files)
- **Headers**:
  - `Range`: Optional, for partial content requests (e.g., `bytes=0-1024`)
- **Response Headers**:
  - `Content-Type`: File's MIME type
  - `Content-Length`: File size in bytes
  - `Accept-Ranges`: bytes
  - `Content-Range`: For partial content responses
- **Response Codes**:
  - `200`: Full content
  - `206`: Partial content
- **Notes**:
  - Supports video/audio streaming
  - Handles range requests efficiently
  - Falls back to 'application/octet-stream' if MIME type unknown

#### 3. View File
- **Endpoint**: `GET /files/view/*`
- **Description**: Direct file viewing/download
- **Response Headers**:
  - `Content-Type`: File's MIME type
  - `Content-Length`: File size in bytes
- **Notes**:
  - Streams entire file
  - Suitable for direct downloads
  - No range support

## File Storage Structure
- Base directory: `<project_root>/downloads`
- User files: `<project_root>/downloads/<username>/`
- Downloaded torrent files are organized by username

## Error Handling
- All endpoints return appropriate HTTP status codes
- Error responses include descriptive messages
- Torrent operations include detailed error tracking and logging

## Technical Notes
1. CORS is enabled for cross-origin requests
2. File operations support proper MIME type detection
3. Streaming supports range requests for media files
4. Downloads are organized by username for isolation
5. Torrent downloads have a 30-second timeout for initial connection
6. Completed torrents are automatically removed from the client (files are preserved) 