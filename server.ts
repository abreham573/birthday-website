import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const MEMORIES_FILE = path.resolve(DATA_DIR, 'memories.json');
const UPLOADS_DIR = path.resolve(__dirname, 'public', 'uploads');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage for saving user uploaded photos & videos permanently to disk
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `tsi_${Date.now()}_${cleanName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max per video/photo
});

export interface ServerMemoryItem {
  id: string;
  type: 'photo' | 'video';
  url: string;
  thumbnailUrl?: string;
  title: string;
  caption: string;
  date: string;
  tag: string;
  aspectRatio?: '4:3' | '16:9' | '1:1' | '9:16';
  isCustom?: boolean;
}

function getSavedMemories(): ServerMemoryItem[] {
  try {
    if (fs.existsSync(MEMORIES_FILE)) {
      const data = fs.readFileSync(MEMORIES_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Error reading memories.json:', err);
  }
  return [];
}

function saveMemories(memories: ServerMemoryItem[]) {
  try {
    fs.writeFileSync(MEMORIES_FILE, JSON.stringify(memories, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing memories.json:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Serve uploaded files statically so anyone opening the site (Tsi on her phone) can view them!
  app.use('/uploads', express.static(UPLOADS_DIR));

  // GET /api/memories: returns all server-saved photos & videos
  app.get('/api/memories', (req, res) => {
    const memories = getSavedMemories();
    res.json({ success: true, memories });
  });

  // POST /api/upload: multipart form-data upload for photos and videos from device
  app.post('/api/upload', upload.array('files', 25), (req, res) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const title = (req.body.title as string) || '';
      const caption = (req.body.caption as string) || '';
      const date = (req.body.date as string) || 'Special Moment';
      const tag = (req.body.tag as string) || 'Birthday Special';
      const mediaType = (req.body.mediaType as 'photo' | 'video') || 'photo';

      const newItems: ServerMemoryItem[] = files.map((file, idx) => {
        const isVideo = file.mimetype.startsWith('video/') || mediaType === 'video';
        const fileUrl = `/uploads/${file.filename}`;
        const itemTitle = files.length === 1 
          ? (title.trim() || 'My Beautiful Tsi ❤️')
          : (title.trim() ? `${title.trim()} (${idx + 1})` : `Tsi Memory #${idx + 1}`);

        return {
          id: `tsi-memory-${Date.now()}-${idx}`,
          type: isVideo ? 'video' : 'photo',
          url: fileUrl,
          title: itemTitle,
          caption: caption.trim() || 'A cherished memory of my love, Tsi.',
          date: date.trim() || 'Special Memory',
          tag: tag.trim() || 'Birthday Special',
          aspectRatio: isVideo ? '16:9' : '4:3',
          isCustom: true,
        };
      });

      const existing = getSavedMemories();
      const updated = [...newItems, ...existing];
      saveMemories(updated);

      res.json({ success: true, newItems, total: updated.length });
    } catch (err) {
      console.error('Failed to process upload:', err);
      res.status(500).json({ success: false, error: 'Upload failed' });
    }
  });

  // POST /api/memories: directly add a memory item (e.g. from URL)
  app.post('/api/memories', (req, res) => {
    try {
      const existing = getSavedMemories();
      const body = req.body;

      if (Array.isArray(body)) {
        const updated = [...body, ...existing];
        saveMemories(updated);
        return res.json({ success: true, count: updated.length });
      } else if (body && typeof body === 'object') {
        const updated = [body, ...existing];
        saveMemories(updated);
        return res.json({ success: true, count: updated.length });
      }

      res.status(400).json({ success: false, error: 'Invalid memory payload' });
    } catch (err) {
      console.error('Failed to save memory:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // DELETE /api/memories/:id: remove a memory item
  app.delete('/api/memories/:id', (req, res) => {
    try {
      const { id } = req.params;
      const existing = getSavedMemories();
      const itemToDelete = existing.find((item) => item.id === id);

      // If it's a local uploaded file, delete from disk
      if (itemToDelete && itemToDelete.url.startsWith('/uploads/')) {
        const filePath = path.resolve(__dirname, 'public', itemToDelete.url.slice(1));
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch {}
        }
      }

      const filtered = existing.filter((item) => item.id !== id);
      saveMemories(filtered);
      res.json({ success: true, count: filtered.length });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // In development, hook up Vite middleware
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from dist
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
