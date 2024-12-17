import express from 'express';
import { fileService } from './file.service.js';

const router = express.Router();

router.get('/list/:username', async (req, res) => {
  try {
    const files = await fileService.listFiles(req.params.username);
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/stream/*', async (req, res) => {
  try {
    const filePath = req.params[0];
    const range = req.headers.range;
    const fileInfo = await fileService.getFileInfo(filePath);

    res.set({
      'Content-Type': fileInfo.type,
      'Accept-Ranges': 'bytes',
    });

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileInfo.size - 1;
      const chunksize = end - start + 1;

      res.set({
        'Content-Range': `bytes ${start}-${end}/${fileInfo.size}`,
        'Content-Length': chunksize,
      });
      res.status(206);

      const stream = await fileService.getFileStream(filePath, start, end);
      stream.pipe(res);
    } else {
      res.set({
        'Content-Length': fileInfo.size,
      });
      
      const stream = await fileService.getFileStream(filePath);
      stream.pipe(res);
    }
  } catch (error) {
    res.status(error.code === 'ENOENT' ? 404 : 500)
      .json({ message: error.message });
  }
});

router.get('/view/*', async (req, res) => {
  try {
    const filePath = req.params[0];
    const fileInfo = await fileService.getFileInfo(filePath);
    
    res.set({
      'Content-Type': fileInfo.type,
      'Content-Length': fileInfo.size,
    });
    
    const stream = await fileService.getFileStream(filePath);
    stream.pipe(res);
  } catch (error) {
    res.status(error.code === 'ENOENT' ? 404 : 500)
      .json({ message: error.message });
  }
});

export const FileRouter = router; 