import express from 'express';
import { torrentService } from './torrent.service.js';

const router = express.Router();

router.get('/:infoHash/progress', async (req, res) => {
  try {
    const progress = await torrentService.getProgress(req.params.infoHash);
    res.json({ progress });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500)
      .json({ message: error.message });
  }
});

router.post('/download', async (req, res) => {
  try {
    const { magnetLink, username } = req.body;

    if (!magnetLink || !magnetLink.startsWith('magnet:?')) {
      return res.status(400).json({ message: 'Invalid magnet link format' });
    }

    if (!username || username.trim().length === 0) {
      return res.status(400).json({ message: 'Username is required' });
    }

    const result = await torrentService.downloadTorrent(magnetLink, username);
    res.json(result);
  } catch (error) {
    res.status(error.message.includes('Invalid') ? 400 : 500)
      .json({ message: error.message });
  }
});

export const TorrentRouter = router; 