# Grabr Backend API Documentation

This is the backend service for Grabr, built with NestJS. It provides APIs for managing torrent downloads and file listings.

## API Endpoints

### File Management

#### List Files
- **Endpoint**: `GET /api/files/list/:username`
- **Description**: Lists all files and directories for a specific user
- **Parameters**:
  - `username` (path parameter): The username whose files to list
- **Response**: 
  ```json
  {
    "files": [
      {
        "name": "string",
        "type": "file" | "directory",
        "size": number,
        "path": "string",
        "children": [] // Only for directories
      }
    ]
  }
  ```

### Torrent Management

#### Download Torrent
- **Endpoint**: `POST /api/torrents/download`
- **Description**: Initiates a torrent download for a specific user
- **Request Body**:
  ```json
  {
    "magnetLink": "string", // Must start with "magnet:?"
    "username": "string"
  }
  ```
- **Response**:
  ```json
  {
    "infoHash": "string",
    "files": [
      {
        "name": "string",
        "path": "string",
        "size": number
      }
    ],
    "downloadPath": "string"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid magnet link format or missing username
  - `500 Internal Server Error`: Download processing failed

## Server Configuration

The server runs on port 3000 and has CORS enabled for cross-origin requests.

## File Storage

Downloaded files are stored in the `downloads` directory, organized by username. 