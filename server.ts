import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import pg from 'pg';
import type { Pool as PoolType, PoolClient } from 'pg';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OWNER_EMAIL = 'abrehamreigns@gmail.com';
const UPLOADS_DIR = path.resolve(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ============================================================
// PostgreSQL Database Helpers
// ============================================================

let pool: PoolType | null = null;
let schemaReadyPromise: Promise<void> | null = null;

function getDatabaseUrl(): string {
  return (process.env.DATABASE_URL || '').trim();
}

function isDbConfigured(): boolean {
  const url = getDatabaseUrl();
  return /^postgres(ql)?:\/\//i.test(url);
}

function getPool(): PoolType {
  if (!isDbConfigured()) {
    throw new Error('DATABASE_URL is not configured.');
  }
  if (!pool) {
    const connectionString = getDatabaseUrl();
    const isLocal =
      /localhost|127\.0\.0\.1/i.test(connectionString) &&
      !/sslmode=require/i.test(connectionString);

    pool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err.message);
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!isDbConfigured()) return;
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS gate_config (
        id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        hint TEXT NOT NULL,
        welcome_title TEXT NOT NULL,
        welcome_subtitle TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS love_letter (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        notice TEXT NOT NULL DEFAULT '',
        salutation TEXT NOT NULL,
        paragraphs JSONB NOT NULL,
        closing TEXT NOT NULL,
        signature TEXT NOT NULL,
        anniversary_date TEXT NOT NULL DEFAULT 'On Your Special Birthday',
        bottom_photo_url TEXT NOT NULL DEFAULT '',
        bottom_photo_caption TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS song_config (
        id TEXT PRIMARY KEY,
        song_title TEXT NOT NULL,
        artist_name TEXT NOT NULL,
        youtube_url TEXT NOT NULL,
        dedication_heading TEXT NOT NULL,
        dedication_body TEXT NOT NULL,
        lyrics_text TEXT NOT NULL,
        meaning TEXT NOT NULL DEFAULT '',
        cover_photo_url TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        url TEXT NOT NULL DEFAULT '',
        has_blob BOOLEAN NOT NULL DEFAULT FALSE,
        mime_type TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT 'Tsi',
        caption TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL DEFAULT '',
        tag TEXT NOT NULL DEFAULT '',
        aspect_ratio TEXT NOT NULL DEFAULT '4:3',
        sort_order BIGINT NOT NULL,
        ready BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE memories
        ADD COLUMN IF NOT EXISTS ready BOOLEAN NOT NULL DEFAULT TRUE;

      CREATE TABLE IF NOT EXISTS media_blobs (
        memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
        mime_type TEXT NOT NULL,
        data BYTEA NOT NULL,
        byte_size INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS media_chunks (
        memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        data BYTEA NOT NULL,
        byte_size INTEGER NOT NULL,
        PRIMARY KEY (memory_id, chunk_index)
      );

      CREATE INDEX IF NOT EXISTS idx_memories_sort_order
        ON memories (sort_order DESC, created_at DESC);
    `);
  })().catch((err) => {
    schemaReadyPromise = null;
    throw err;
  });

  return schemaReadyPromise;
}

async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function checkDbHealth(): Promise<{
  configured: boolean;
  connected: boolean;
  error?: string;
  counts: {
    memories: number;
    hasGate: boolean;
    hasLetter: boolean;
    hasSong: boolean;
  };
}> {
  if (!isDbConfigured()) {
    return {
      configured: false,
      connected: false,
      counts: { memories: 0, hasGate: false, hasLetter: false, hasSong: false },
    };
  }

  try {
    await ensureSchema();
    const p = getPool();
    const [memRes, gateRes, letterRes, songRes] = await Promise.all([
      p.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM memories WHERE ready = TRUE'
      ),
      p.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM gate_config'),
      p.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM love_letter'),
      p.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM song_config'),
    ]);

    return {
      configured: true,
      connected: true,
      counts: {
        memories: Number(memRes.rows[0]?.count || 0),
        hasGate: Number(gateRes.rows[0]?.count || 0) > 0,
        hasLetter: Number(letterRes.rows[0]?.count || 0) > 0,
        hasSong: Number(songRes.rows[0]?.count || 0) > 0,
      },
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      error: err instanceof Error ? err.message : 'Database connection failed',
      counts: { memories: 0, hasGate: false, hasLetter: false, hasSong: false },
    };
  }
}

// ============================================================
// Owner Authentication Middleware (Firebase ID Token Verification)
// ============================================================

function readProjectId(): string {
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    if (parsed.projectId && parsed.projectId !== 'remixed-project-id') {
      return parsed.projectId;
    }
  } catch (err) {
    console.error('Failed to read firebase-applet-config.json:', err);
  }
  return '';
}

function getFirebaseAdminAuth() {
  const projectId = readProjectId();
  if (!projectId) {
    throw new Error('Firebase projectId is not configured.');
  }
  const app = getApps().length ? getApp() : initializeApp({ projectId });
  return getAuth(app);
}

async function requireOwnerAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({
        success: false,
        error:
          'Authentication required. Please sign in with your creator Google account.',
      });
      return;
    }

    const idToken = match[1].trim();
    if (!idToken) {
      res.status(401).json({
        success: false,
        error: 'Invalid authentication token.',
      });
      return;
    }

    const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const email = (decoded.email || '').toLowerCase();
    if (!decoded.email_verified || email !== OWNER_EMAIL.toLowerCase()) {
      res.status(403).json({
        success: false,
        error: 'Only the gift creator account is authorized to make changes.',
      });
      return;
    }

    next();
  } catch (err) {
    console.warn(
      'Owner token verification failed:',
      err instanceof Error ? err.message : String(err)
    );
    res.status(401).json({
      success: false,
      error: 'Session expired or invalid. Please sign in again with Google.',
    });
  }
}

// ============================================================
// Upload & Validation Helpers
// ============================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max per photo/video
    files: 12,
  },
});

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,120}$/;

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  return cleaned || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isSafeMediaUrl(url: string): boolean {
  return /^(https?:\/\/|\/|data:(image|video)\/[a-zA-Z0-9.+-]+;base64,)/i.test(
    url.trim()
  );
}

function isSafeImageOrEmptyUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  return /^(https?:\/\/|\/|data:image\/[a-zA-Z0-9.+-]+;base64,)/i.test(trimmed);
}

function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\/.+/i.test(url.trim());
}

function parseDataUrlToBuffer(
  dataUrl: string
): { mimeType: string; buffer: Buffer } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  const mimeType = match[1].trim().slice(0, 100);
  if (!/^(image|video)\//i.test(mimeType)) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) return null;
  return { mimeType, buffer };
}

interface MemoryRow {
  id: string;
  type: string;
  url: string;
  has_blob: boolean;
  mime_type: string;
  title: string;
  caption: string;
  date: string;
  tag: string;
  aspect_ratio: string;
  sort_order: string;
}

function mapMemoryRow(row: MemoryRow) {
  const mediaType = row.type === 'video' ? 'video' : 'photo';
  const aspectRatio =
    row.aspect_ratio === '16:9' ||
    row.aspect_ratio === '4:3' ||
    row.aspect_ratio === '1:1' ||
    row.aspect_ratio === '9:16'
      ? row.aspect_ratio
      : mediaType === 'video'
        ? '16:9'
        : '4:3';

  return {
    id: row.id,
    type: mediaType,
    url: row.has_blob ? `/api/media/${encodeURIComponent(row.id)}` : row.url,
    title: row.title || 'Tsi',
    caption: row.caption || '',
    date: row.date || '',
    tag: row.tag || '',
    aspectRatio,
    isCustom: true,
    isChunked: false,
  };
}

function requireConfiguredDb(res: Response): boolean {
  if (!isDbConfigured()) {
    res.status(503).json({
      success: false,
      code: 'DB_NOT_CONFIGURED',
      error:
        'PostgreSQL DATABASE_URL is not configured yet. Add DATABASE_URL in AI Studio Settings -> Secrets.',
    });
    return false;
  }
  return true;
}

// ============================================================
// Express Server Setup
// ============================================================

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      maxAge: '7d',
      etag: true,
    })
  );

  if (isDbConfigured()) {
    ensureSchema().catch((err) => {
      console.error('Initial PostgreSQL schema check failed:', err);
    });
  }

  app.get('/api/db/status', async (_req: Request, res: Response) => {
    const status = await checkDbHealth();
    res.json({ success: true, ...status });
  });

  app.get('/api/gate', async (_req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      await ensureSchema();
      const result = await getPool().query<{
        password_hash: string;
        hint: string;
        welcome_title: string;
        welcome_subtitle: string;
      }>(
        'SELECT password_hash, hint, welcome_title, welcome_subtitle FROM gate_config WHERE id = $1',
        ['config']
      );

      if (result.rows.length === 0) {
        return res.json({ success: true, config: null });
      }
      const row = result.rows[0];
      res.json({
        success: true,
        config: {
          passwordHash: row.password_hash,
          hint: row.hint,
          welcomeTitle: row.welcome_title,
          welcomeSubtitle: row.welcome_subtitle,
        },
      });
    } catch (err) {
      console.error('GET /api/gate failed:', err);
      res.status(500).json({ success: false, error: 'Could not load gate config.' });
    }
  });

  app.put('/api/gate', requireOwnerAuth, async (req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      const body = req.body as Record<string, unknown>;
      const passwordHash =
        typeof body.passwordHash === 'string' && /^[a-f0-9]{64}$/i.test(body.passwordHash)
          ? body.passwordHash.toLowerCase()
          : '';
      if (!passwordHash) {
        return res.status(400).json({
          success: false,
          error: 'A valid SHA-256 password hash is required.',
        });
      }

      const hint =
        typeof body.hint === 'string' ? body.hint.trim().slice(0, 300) : '';
      const welcomeTitle =
        typeof body.welcomeTitle === 'string'
          ? body.welcomeTitle.trim().slice(0, 160)
          : '';
      const welcomeSubtitle =
        typeof body.welcomeSubtitle === 'string'
          ? body.welcomeSubtitle.trim().slice(0, 400)
          : '';

      if (!hint || !welcomeTitle) {
        return res.status(400).json({
          success: false,
          error: 'Hint and welcome headline are required.',
        });
      }

      await ensureSchema();
      await getPool().query(
        `INSERT INTO gate_config (id, password_hash, hint, welcome_title, welcome_subtitle, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           hint = EXCLUDED.hint,
           welcome_title = EXCLUDED.welcome_title,
           welcome_subtitle = EXCLUDED.welcome_subtitle,
           updated_at = NOW()`,
        ['config', passwordHash, hint, welcomeTitle, welcomeSubtitle]
      );

      res.json({
        success: true,
        config: { passwordHash, hint, welcomeTitle, welcomeSubtitle },
      });
    } catch (err) {
      console.error('PUT /api/gate failed:', err);
      res.status(500).json({ success: false, error: 'Failed to save gate config.' });
    }
  });

  app.get('/api/letter', async (_req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      await ensureSchema();
      const result = await getPool().query<{
        recipient: string;
        notice: string;
        salutation: string;
        paragraphs: unknown;
        closing: string;
        signature: string;
        anniversary_date: string;
        bottom_photo_url: string;
        bottom_photo_caption: string;
      }>(
        `SELECT recipient, notice, salutation, paragraphs, closing, signature,
                anniversary_date, bottom_photo_url, bottom_photo_caption
         FROM love_letter WHERE id = $1`,
        ['birthday']
      );

      if (result.rows.length === 0) {
        return res.json({ success: true, letter: null });
      }
      const row = result.rows[0];
      res.json({
        success: true,
        letter: {
          recipient: row.recipient,
          notice: row.notice,
          salutation: row.salutation,
          paragraphs: Array.isArray(row.paragraphs) ? row.paragraphs : [],
          closing: row.closing,
          signature: row.signature,
          anniversaryDate: row.anniversary_date,
          bottomPhotoUrl: row.bottom_photo_url,
          bottomPhotoCaption: row.bottom_photo_caption,
        },
      });
    } catch (err) {
      console.error('GET /api/letter failed:', err);
      res.status(500).json({ success: false, error: 'Could not load love letter.' });
    }
  });

  app.put('/api/letter', requireOwnerAuth, async (req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      const body = req.body as Record<string, unknown>;
      const rawParagraphs = Array.isArray(body.paragraphs) ? body.paragraphs : [];
      const paragraphs = rawParagraphs
        .map((p) => (typeof p === 'string' ? p.trim().slice(0, 4000) : ''))
        .filter((p) => p.length > 0)
        .slice(0, 30);

      if (paragraphs.length === 0) {
        paragraphs.push('Happy Birthday, Tsi ❤️');
      }

      const recipient =
        (typeof body.recipient === 'string' ? body.recipient.trim().slice(0, 80) : '') ||
        'Tsi';
      const notice =
        typeof body.notice === 'string' ? body.notice.trim().slice(0, 400) : '';
      const salutation =
        (typeof body.salutation === 'string'
          ? body.salutation.trim().slice(0, 160)
          : '') || 'Happy Birthday';
      const closing =
        (typeof body.closing === 'string' ? body.closing.trim().slice(0, 120) : '') ||
        'With all my love,';
      const signature =
        (typeof body.signature === 'string' ? body.signature.trim().slice(0, 120) : '') ||
        'Yours ❤️';
      const anniversaryDate =
        (typeof body.anniversaryDate === 'string'
          ? body.anniversaryDate.trim().slice(0, 80)
          : '') || 'On Your Special Birthday';
      const bottomPhotoUrl =
        typeof body.bottomPhotoUrl === 'string'
          ? body.bottomPhotoUrl.trim().slice(0, 2000000)
          : '';
      if (!isSafeImageOrEmptyUrl(bottomPhotoUrl)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid bottom photo URL.',
        });
      }
      const bottomPhotoCaption =
        typeof body.bottomPhotoCaption === 'string'
          ? body.bottomPhotoCaption.trim().slice(0, 300)
          : '';

      await ensureSchema();
      await getPool().query(
        `INSERT INTO love_letter (
           id, recipient, notice, salutation, paragraphs, closing, signature,
           anniversary_date, bottom_photo_url, bottom_photo_caption, updated_at
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (id) DO UPDATE SET
           recipient = EXCLUDED.recipient,
           notice = EXCLUDED.notice,
           salutation = EXCLUDED.salutation,
           paragraphs = EXCLUDED.paragraphs,
           closing = EXCLUDED.closing,
           signature = EXCLUDED.signature,
           anniversary_date = EXCLUDED.anniversary_date,
           bottom_photo_url = EXCLUDED.bottom_photo_url,
           bottom_photo_caption = EXCLUDED.bottom_photo_caption,
           updated_at = NOW()`,
        [
          'birthday',
          recipient,
          notice,
          salutation,
          JSON.stringify(paragraphs),
          closing,
          signature,
          anniversaryDate,
          bottomPhotoUrl,
          bottomPhotoCaption,
        ]
      );

      res.json({
        success: true,
        letter: {
          recipient,
          notice,
          salutation,
          paragraphs,
          closing,
          signature,
          anniversaryDate,
          bottomPhotoUrl,
          bottomPhotoCaption,
        },
      });
    } catch (err) {
      console.error('PUT /api/letter failed:', err);
      res.status(500).json({ success: false, error: 'Failed to save love letter.' });
    }
  });

  app.get('/api/song', async (_req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      await ensureSchema();
      const result = await getPool().query<{
        song_title: string;
        artist_name: string;
        youtube_url: string;
        dedication_heading: string;
        dedication_body: string;
        lyrics_text: string;
        meaning: string;
        cover_photo_url: string;
      }>(
        `SELECT song_title, artist_name, youtube_url, dedication_heading,
                dedication_body, lyrics_text, meaning, cover_photo_url
         FROM song_config WHERE id = $1`,
        ['config']
      );

      if (result.rows.length === 0) {
        return res.json({ success: true, song: null });
      }
      const row = result.rows[0];
      res.json({
        success: true,
        song: {
          songTitle: row.song_title,
          artistName: row.artist_name,
          youtubeUrl: row.youtube_url,
          dedicationHeading: row.dedication_heading,
          dedicationBody: row.dedication_body,
          lyricsText: row.lyrics_text,
          meaning: row.meaning,
          coverPhotoUrl: row.cover_photo_url,
        },
      });
    } catch (err) {
      console.error('GET /api/song failed:', err);
      res.status(500).json({ success: false, error: 'Could not load song config.' });
    }
  });

  app.put('/api/song', requireOwnerAuth, async (req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      const body = req.body as Record<string, unknown>;
      const youtubeUrl =
        typeof body.youtubeUrl === 'string' ? body.youtubeUrl.trim().slice(0, 500) : '';
      if (!isSafeHttpUrl(youtubeUrl)) {
        return res.status(400).json({
          success: false,
          error: 'Please enter a valid http:// or https:// YouTube link.',
        });
      }

      const songTitle =
        (typeof body.songTitle === 'string' ? body.songTitle.trim().slice(0, 120) : '') ||
        'All I Ever Need';
      const artistName =
        (typeof body.artistName === 'string'
          ? body.artistName.trim().slice(0, 120)
          : '') || 'Austin Mahone';
      const dedicationHeading =
        (typeof body.dedicationHeading === 'string'
          ? body.dedicationHeading.trim().slice(0, 160)
          : '') || 'A Song That Speaks What Words Cannot';
      const dedicationBody =
        typeof body.dedicationBody === 'string'
          ? body.dedicationBody.trim().slice(0, 2000)
          : '';
      const lyricsText =
        typeof body.lyricsText === 'string' ? body.lyricsText.trim().slice(0, 4000) : '';
      const meaning =
        typeof body.meaning === 'string' ? body.meaning.trim().slice(0, 2000) : '';
      const coverPhotoUrl =
        typeof body.coverPhotoUrl === 'string'
          ? body.coverPhotoUrl.trim().slice(0, 2000000)
          : '';

      if (!isSafeImageOrEmptyUrl(coverPhotoUrl)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid cover photo URL.',
        });
      }

      await ensureSchema();
      await getPool().query(
        `INSERT INTO song_config (
           id, song_title, artist_name, youtube_url, dedication_heading,
           dedication_body, lyrics_text, meaning, cover_photo_url, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (id) DO UPDATE SET
           song_title = EXCLUDED.song_title,
           artist_name = EXCLUDED.artist_name,
           youtube_url = EXCLUDED.youtube_url,
           dedication_heading = EXCLUDED.dedication_heading,
           dedication_body = EXCLUDED.dedication_body,
           lyrics_text = EXCLUDED.lyrics_text,
           meaning = EXCLUDED.meaning,
           cover_photo_url = EXCLUDED.cover_photo_url,
           updated_at = NOW()`,
        [
          'config',
          songTitle,
          artistName,
          youtubeUrl,
          dedicationHeading,
          dedicationBody,
          lyricsText,
          meaning,
          coverPhotoUrl,
        ]
      );

      res.json({
        success: true,
        song: {
          songTitle,
          artistName,
          youtubeUrl,
          dedicationHeading,
          dedicationBody,
          lyricsText,
          meaning,
          coverPhotoUrl,
        },
      });
    } catch (err) {
      console.error('PUT /api/song failed:', err);
      res.status(500).json({ success: false, error: 'Failed to save song config.' });
    }
  });

  app.get('/api/memories', async (_req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      await ensureSchema();
      const result = await getPool().query<MemoryRow>(
        `SELECT id, type, url, has_blob, mime_type, title, caption, date, tag, aspect_ratio, sort_order
         FROM memories
         WHERE ready = TRUE
         ORDER BY sort_order DESC, created_at DESC`
      );
      res.json({
        success: true,
        memories: result.rows.map(mapMemoryRow),
      });
    } catch (err) {
      console.error('GET /api/memories failed:', err);
      res.status(500).json({ success: false, error: 'Could not load memories.' });
    }
  });

  app.get('/api/media/:id', async (req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      const id = String(req.params.id || '');
      if (!SAFE_ID_REGEX.test(id)) {
        return res.status(400).json({ success: false, error: 'Invalid media ID.' });
      }

      await ensureSchema();
      const p = getPool();
      const MAX_RANGE_WINDOW = 4 * 1024 * 1024; // 4 MB cap per Range slice

      const blobMeta = await p.query<{
        mime_type: string;
        byte_size: number;
      }>('SELECT mime_type, byte_size FROM media_blobs WHERE memory_id = $1', [id]);

      if (blobMeta.rows.length > 0) {
        const meta = blobMeta.rows[0];
        const total = Number(meta.byte_size) || 0;
        const mimeType = meta.mime_type || 'application/octet-stream';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        const rangeHeader = req.headers.range;
        if (rangeHeader) {
          const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
          if (match) {
            const start = match[1] ? Number.parseInt(match[1], 10) : 0;
            const requestedEnd = match[2]
              ? Math.min(Number.parseInt(match[2], 10), total - 1)
              : Math.min(start + MAX_RANGE_WINDOW - 1, total - 1);
            const end = Math.min(requestedEnd, start + MAX_RANGE_WINDOW - 1, total - 1);

            if (
              Number.isNaN(start) ||
              Number.isNaN(end) ||
              start < 0 ||
              start >= total ||
              end < start
            ) {
              res.setHeader('Content-Range', `bytes */${total}`);
              return res.status(416).end();
            }

            const length = end - start + 1;
            const sliceRes = await p.query<{ chunk: Buffer }>(
              'SELECT substring(data from $2 for $3) AS chunk FROM media_blobs WHERE memory_id = $1',
              [id, start + 1, length]
            );
            const chunk = sliceRes.rows[0]?.chunk ?? Buffer.alloc(0);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
            res.setHeader('Content-Length', String(chunk.length));
            return res.send(chunk);
          }
        }

        if (total <= 8 * 1024 * 1024) {
          const fullRes = await p.query<{ data: Buffer }>(
            'SELECT data FROM media_blobs WHERE memory_id = $1',
            [id]
          );
          const buffer = fullRes.rows[0]?.data ?? Buffer.alloc(0);
          res.setHeader('Content-Length', String(buffer.length));
          return res.status(200).send(buffer);
        }

        // Stream large legacy media_blobs in 4 MB slices
        res.status(200);
        res.setHeader('Content-Length', String(total));
        let clientClosed = false;
        req.on('close', () => {
          clientClosed = true;
        });
        for (let offset = 0; offset < total && !clientClosed; offset += MAX_RANGE_WINDOW) {
          const len = Math.min(MAX_RANGE_WINDOW, total - offset);
          const sliceRes = await p.query<{ chunk: Buffer }>(
            'SELECT substring(data from $2 for $3) AS chunk FROM media_blobs WHERE memory_id = $1',
            [id, offset + 1, len]
          );
          const chunk = sliceRes.rows[0]?.chunk;
          if (!chunk || chunk.length === 0) break;
          res.write(chunk);
        }
        return res.end();
      }

      // Check chunked storage (used for large videos)
      const chunkMetaRes = await p.query<{ chunk_index: number; byte_size: number }>(
        `SELECT chunk_index, byte_size
         FROM media_chunks
         WHERE memory_id = $1
         ORDER BY chunk_index ASC`,
        [id]
      );

      if (chunkMetaRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Media not found.' });
      }

      const memMetaRes = await p.query<{ mime_type: string }>(
        'SELECT mime_type FROM memories WHERE id = $1',
        [id]
      );
      const mimeType = memMetaRes.rows[0]?.mime_type || 'video/mp4';

      const chunkRanges: Array<{ index: number; start: number; end: number }> = [];
      let total = 0;
      for (const row of chunkMetaRes.rows) {
        const size = Number(row.byte_size) || 0;
        chunkRanges.push({
          index: Number(row.chunk_index),
          start: total,
          end: total + size - 1,
        });
        total += size;
      }

      if (total <= 0) {
        return res.status(404).json({ success: false, error: 'Media is empty.' });
      }

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      const rangeHeader = req.headers.range;
      if (rangeHeader) {
        const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
        if (match) {
          const start = match[1] ? Number.parseInt(match[1], 10) : 0;
          const requestedEnd = match[2]
            ? Math.min(Number.parseInt(match[2], 10), total - 1)
            : Math.min(start + MAX_RANGE_WINDOW - 1, total - 1);
          const end = Math.min(requestedEnd, start + MAX_RANGE_WINDOW - 1, total - 1);

          if (
            Number.isNaN(start) ||
            Number.isNaN(end) ||
            start < 0 ||
            start >= total ||
            end < start
          ) {
            res.setHeader('Content-Range', `bytes */${total}`);
            return res.status(416).end();
          }

          const needed = chunkRanges.filter((c) => c.end >= start && c.start <= end);
          const minIdx = needed[0].index;
          const maxIdx = needed[needed.length - 1].index;

          const dataRes = await p.query<{ chunk_index: number; data: Buffer }>(
            `SELECT chunk_index, data
             FROM media_chunks
             WHERE memory_id = $1 AND chunk_index >= $2 AND chunk_index <= $3
             ORDER BY chunk_index ASC`,
            [id, minIdx, maxIdx]
          );

          const parts: Buffer[] = [];
          for (const row of dataRes.rows) {
            const meta = needed.find((c) => c.index === Number(row.chunk_index));
            if (!meta) continue;
            const sliceStart = Math.max(0, start - meta.start);
            const sliceEnd = Math.min(row.data.length, end - meta.start + 1);
            if (sliceEnd > sliceStart) {
              parts.push(row.data.subarray(sliceStart, sliceEnd));
            }
          }

          const responseBuf = Buffer.concat(parts);
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
          res.setHeader('Content-Length', String(responseBuf.length));
          return res.send(responseBuf);
        }
      }

      // Stream all chunks sequentially if no Range header
      res.status(200);
      res.setHeader('Content-Length', String(total));
      let clientClosed = false;
      req.on('close', () => {
        clientClosed = true;
      });
      for (const meta of chunkRanges) {
        if (clientClosed || res.writableEnded) break;
        const dataRes = await p.query<{ data: Buffer }>(
          'SELECT data FROM media_chunks WHERE memory_id = $1 AND chunk_index = $2',
          [id, meta.index]
        );
        const buf = dataRes.rows[0]?.data;
        if (buf && buf.length > 0) {
          res.write(buf);
        }
      }
      return res.end();
    } catch (err) {
      console.error('GET /api/media/:id failed:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Could not load media.' });
      } else {
        res.end();
      }
    }
  });

  app.post('/api/memories/upload/init', requireOwnerAuth, async (req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      const body = req.body as Record<string, unknown>;
      const mediaType: 'photo' | 'video' =
        body.mediaType === 'video' ? 'video' : 'photo';
      const rawMime = typeof body.mimeType === 'string' ? body.mimeType.trim() : '';
      const mimeType = (
        /^(image|video)\//i.test(rawMime)
          ? rawMime
          : mediaType === 'video'
            ? 'video/mp4'
            : 'image/jpeg'
      ).slice(0, 100);
      const totalSize = Number(body.totalSize) || 0;
      const totalChunks = Number(body.totalChunks) || 0;

      if (totalSize <= 0 || totalSize > 105 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: 'File size must be between 1 byte and 100 MB.',
        });
      }
      if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 200) {
        return res.status(400).json({
          success: false,
          error: 'Invalid upload chunk count.',
        });
      }

      const safeTitle =
        (typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '') || 'Tsi';
      const safeCaption =
        typeof body.caption === 'string' ? body.caption.trim().slice(0, 1000) : '';
      const safeDate =
        typeof body.date === 'string' ? body.date.trim().slice(0, 80) : '';
      const safeTag = typeof body.tag === 'string' ? body.tag.trim().slice(0, 60) : '';
      const aspectRatio = mediaType === 'video' ? '16:9' : '4:3';
      const memoryId = sanitizeId(
        `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      );
      const mediaUrl = `/api/media/${encodeURIComponent(memoryId)}`;
      const sortOrder = Date.now();

      await ensureSchema();
      await getPool().query(
        `INSERT INTO memories (
           id, type, url, has_blob, mime_type, title, caption, date, tag, aspect_ratio, sort_order, ready
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE)`,
        [
          memoryId,
          mediaType,
          mediaUrl,
          true,
          mimeType,
          safeTitle,
          safeCaption,
          safeDate,
          safeTag,
          aspectRatio,
          sortOrder,
        ]
      );

      res.json({ success: true, memoryId });
    } catch (err) {
      console.error('POST /api/memories/upload/init failed:', err);
      res.status(500).json({
        success: false,
        error: 'Could not start cloud upload.',
      });
    }
  });

  app.post('/api/memories/upload/chunk', requireOwnerAuth, (req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    upload.single('chunk')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: err instanceof Error ? err.message : 'Chunk upload failed.',
        });
      }

      try {
        const file = req.file;
        const memoryId =
          typeof req.body?.memoryId === 'string' ? req.body.memoryId.trim() : '';
        const chunkIndex = Number(req.body?.chunkIndex);

        if (!SAFE_ID_REGEX.test(memoryId)) {
          return res.status(400).json({ success: false, error: 'Invalid memory ID.' });
        }
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= 200) {
          return res.status(400).json({ success: false, error: 'Invalid chunk index.' });
        }
        if (!file || file.buffer.length === 0) {
          return res.status(400).json({ success: false, error: 'Empty upload chunk.' });
        }

        await ensureSchema();
        const existsRes = await getPool().query(
          'SELECT 1 FROM memories WHERE id = $1',
          [memoryId]
        );
        if (existsRes.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Upload session not found or cancelled.',
          });
        }

        await getPool().query(
          `INSERT INTO media_chunks (memory_id, chunk_index, data, byte_size)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (memory_id, chunk_index) DO UPDATE SET
             data = EXCLUDED.data,
             byte_size = EXCLUDED.byte_size`,
          [memoryId, chunkIndex, file.buffer, file.buffer.length]
        );

        res.json({ success: true, chunkIndex });
      } catch (innerErr) {
        console.error('POST /api/memories/upload/chunk failed:', innerErr);
        res.status(500).json({
          success: false,
          error: 'Could not save file part to database.',
        });
      }
    });
  });

  app.post(
    '/api/memories/upload/complete',
    requireOwnerAuth,
    async (req: Request, res: Response) => {
      if (!requireConfiguredDb(res)) return;
      try {
        const body = req.body as Record<string, unknown>;
        const memoryId = typeof body.memoryId === 'string' ? body.memoryId.trim() : '';
        const totalChunks = Number(body.totalChunks) || 0;

        if (!SAFE_ID_REGEX.test(memoryId)) {
          return res.status(400).json({ success: false, error: 'Invalid memory ID.' });
        }
        if (!Number.isInteger(totalChunks) || totalChunks < 1) {
          return res.status(400).json({ success: false, error: 'Invalid chunk count.' });
        }

        const completedRow = await withTransaction(async (client) => {
          const countRes = await client.query<{ cnt: number }>(
            'SELECT COUNT(*)::int AS cnt FROM media_chunks WHERE memory_id = $1',
            [memoryId]
          );
          const count = countRes.rows[0]?.cnt || 0;
          if (count < totalChunks) {
            throw new Error(
              `Upload incomplete (${count} of ${totalChunks} parts saved). Please try again.`
            );
          }

          const upd = await client.query<MemoryRow>(
            `UPDATE memories
             SET ready = TRUE, updated_at = NOW()
             WHERE id = $1
             RETURNING id, type, url, has_blob, mime_type, title, caption, date, tag, aspect_ratio, sort_order`,
            [memoryId]
          );
          return upd.rows[0] || null;
        });

        if (!completedRow) {
          return res.status(404).json({ success: false, error: 'Memory not found.' });
        }

        res.json({
          success: true,
          item: mapMemoryRow(completedRow),
        });
      } catch (err) {
        console.error('POST /api/memories/upload/complete failed:', err);
        res.status(500).json({
          success: false,
          error: err instanceof Error ? err.message : 'Failed to finalize upload.',
        });
      }
    }
  );

  app.post('/api/memories/upload', requireOwnerAuth, (req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    upload.any()(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: err instanceof Error ? err.message : 'File upload failed',
        });
      }

      try {
        const files = req.files as Express.Multer.File[] | undefined;
        if (!files || files.length === 0) {
          return res
            .status(400)
            .json({ success: false, error: 'No files were uploaded.' });
        }

        const safeTitle =
          (typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 160) : '') ||
          'Tsi';
        const safeCaption =
          typeof req.body.caption === 'string'
            ? req.body.caption.trim().slice(0, 1000)
            : '';
        const safeDate =
          typeof req.body.date === 'string' ? req.body.date.trim().slice(0, 80) : '';
        const safeTag =
          typeof req.body.tag === 'string' ? req.body.tag.trim().slice(0, 60) : '';
        const requestedType = req.body.mediaType === 'video' ? 'video' : 'photo';

        const createdItems = await withTransaction(async (client) => {
          const items = [];
          const baseSort = Date.now();

          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const isVideo =
              file.mimetype.startsWith('video/') || requestedType === 'video';
            const mediaType: 'photo' | 'video' = isVideo ? 'video' : 'photo';
            const mimeType = (
              file.mimetype || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')
            ).slice(0, 100);
            const aspectRatio = mediaType === 'video' ? '16:9' : '4:3';
            const memoryId = sanitizeId(
              `mem_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`
            );
            const sortOrder = baseSort + (files.length - i);
            const mediaUrl = `/api/media/${encodeURIComponent(memoryId)}`;

            await client.query(
              `INSERT INTO memories (
                 id, type, url, has_blob, mime_type, title, caption, date, tag, aspect_ratio, sort_order
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                memoryId,
                mediaType,
                mediaUrl,
                true,
                mimeType,
                safeTitle,
                safeCaption,
                safeDate,
                safeTag,
                aspectRatio,
                sortOrder,
              ]
            );

            await client.query(
              `INSERT INTO media_blobs (memory_id, mime_type, data, byte_size)
               VALUES ($1, $2, $3, $4)`,
              [memoryId, mimeType, file.buffer, file.buffer.length]
            );

            items.push({
              id: memoryId,
              type: mediaType,
              url: mediaUrl,
              title: safeTitle,
              caption: safeCaption,
              date: safeDate,
              tag: safeTag,
              aspectRatio,
              isCustom: true,
              isChunked: false,
            });
          }

          return items;
        });

        res.json({
          success: true,
          newItems: createdItems,
        });
      } catch (innerErr) {
        console.error('POST /api/memories/upload failed:', innerErr);
        res.status(500).json({
          success: false,
          error: 'Could not save uploaded memory to database.',
        });
      }
    });
  });

  app.post('/api/memories', requireOwnerAuth, async (req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      const body = req.body as Record<string, unknown>;
      const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
      if (!isSafeMediaUrl(rawUrl)) {
        return res.status(400).json({
          success: false,
          error: 'Please enter a valid http:// or https:// media link.',
        });
      }

      const mediaType: 'photo' | 'video' =
        body.mediaType === 'video' || body.type === 'video' ? 'video' : 'photo';
      const memoryId = sanitizeId(
        `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      );
      const safeTitle =
        (typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '') || 'Tsi';
      const safeCaption =
        typeof body.caption === 'string' ? body.caption.trim().slice(0, 1000) : '';
      const safeDate =
        typeof body.date === 'string' ? body.date.trim().slice(0, 80) : '';
      const safeTag = typeof body.tag === 'string' ? body.tag.trim().slice(0, 60) : '';
      const aspectRatio = mediaType === 'video' ? '16:9' : '4:3';
      const sortOrder = Date.now();

      await withTransaction(async (client) => {
        const parsedData = parseDataUrlToBuffer(rawUrl);
        if (parsedData) {
          const mediaUrl = `/api/media/${encodeURIComponent(memoryId)}`;
          await client.query(
            `INSERT INTO memories (
               id, type, url, has_blob, mime_type, title, caption, date, tag, aspect_ratio, sort_order
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              memoryId,
              mediaType,
              mediaUrl,
              true,
              parsedData.mimeType,
              safeTitle,
              safeCaption,
              safeDate,
              safeTag,
              aspectRatio,
              sortOrder,
            ]
          );
          await client.query(
            `INSERT INTO media_blobs (memory_id, mime_type, data, byte_size)
             VALUES ($1, $2, $3, $4)`,
            [memoryId, parsedData.mimeType, parsedData.buffer, parsedData.buffer.length]
          );
        } else {
          await client.query(
            `INSERT INTO memories (
               id, type, url, has_blob, mime_type, title, caption, date, tag, aspect_ratio, sort_order
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              memoryId,
              mediaType,
              rawUrl.slice(0, 2000),
              false,
              mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
              safeTitle,
              safeCaption,
              safeDate,
              safeTag,
              aspectRatio,
              sortOrder,
            ]
          );
        }
      });

      const created = await getPool().query<MemoryRow>(
        `SELECT id, type, url, has_blob, mime_type, title, caption, date, tag, aspect_ratio, sort_order
         FROM memories WHERE id = $1`,
        [memoryId]
      );

      res.json({
        success: true,
        item: created.rows[0] ? mapMemoryRow(created.rows[0]) : null,
      });
    } catch (err) {
      console.error('POST /api/memories failed:', err);
      res.status(500).json({ success: false, error: 'Failed to save memory.' });
    }
  });

  app.patch('/api/memories/:id', requireOwnerAuth, async (req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      const id = String(req.params.id || '');
      if (!SAFE_ID_REGEX.test(id)) {
        return res.status(400).json({ success: false, error: 'Invalid memory ID.' });
      }

      const body = req.body as Record<string, unknown>;
      const safeTitle =
        (typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '') || 'Tsi';
      const safeCaption =
        typeof body.caption === 'string' ? body.caption.trim().slice(0, 1000) : '';
      const safeDate =
        typeof body.date === 'string' ? body.date.trim().slice(0, 80) : '';
      const safeTag = typeof body.tag === 'string' ? body.tag.trim().slice(0, 60) : '';

      await ensureSchema();
      const result = await getPool().query(
        `UPDATE memories
         SET title = $2, caption = $3, date = $4, tag = $5, updated_at = NOW()
         WHERE id = $1`,
        [id, safeTitle, safeCaption, safeDate, safeTag]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Memory not found.' });
      }

      res.json({
        success: true,
        updated: { title: safeTitle, caption: safeCaption, date: safeDate, tag: safeTag },
      });
    } catch (err) {
      console.error('PATCH /api/memories/:id failed:', err);
      res.status(500).json({ success: false, error: 'Failed to update caption.' });
    }
  });

  app.delete('/api/memories/:id', requireOwnerAuth, async (req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    try {
      const id = String(req.params.id || '');
      if (!SAFE_ID_REGEX.test(id)) {
        return res.status(400).json({ success: false, error: 'Invalid memory ID.' });
      }
      await ensureSchema();
      await getPool().query('DELETE FROM memories WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /api/memories/:id failed:', err);
      res.status(500).json({ success: false, error: 'Failed to delete memory.' });
    }
  });

  app.post('/api/migrate/memory', requireOwnerAuth, (req: Request, res: Response) => {
    if (!requireConfiguredDb(res)) return;
    upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: err instanceof Error ? err.message : 'Migration file upload failed',
        });
      }

      try {
        const rawId = typeof req.body.id === 'string' ? req.body.id : '';
        const memoryId = SAFE_ID_REGEX.test(rawId) ? rawId : sanitizeId(rawId);
        const mediaType: 'photo' | 'video' =
          req.body.type === 'video' ? 'video' : 'photo';
        const safeTitle =
          (typeof req.body.title === 'string'
            ? req.body.title.trim().slice(0, 160)
            : '') || 'Tsi';
        const safeCaption =
          typeof req.body.caption === 'string'
            ? req.body.caption.trim().slice(0, 1000)
            : '';
        const safeDate =
          typeof req.body.date === 'string' ? req.body.date.trim().slice(0, 80) : '';
        const safeTag =
          typeof req.body.tag === 'string' ? req.body.tag.trim().slice(0, 60) : '';
        const aspectRatio =
          typeof req.body.aspectRatio === 'string' &&
          ['4:3', '16:9', '1:1', '9:16'].includes(req.body.aspectRatio)
            ? req.body.aspectRatio
            : mediaType === 'video'
              ? '16:9'
              : '4:3';
        const parsedSortOrder = Number(req.body.sortOrder);
        const sortOrder =
          Number.isFinite(parsedSortOrder) && parsedSortOrder > 0
            ? Math.trunc(parsedSortOrder)
            : Date.now();

        const uploadedFile = req.file;
        const rawUrl = typeof req.body.url === 'string' ? req.body.url.trim() : '';

        await withTransaction(async (client) => {
          if (uploadedFile && uploadedFile.buffer.length > 0) {
            const mimeType = (
              uploadedFile.mimetype ||
              (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')
            ).slice(0, 100);
            const mediaUrl = `/api/media/${encodeURIComponent(memoryId)}`;

            await client.query(
              `INSERT INTO memories (
                 id, type, url, has_blob, mime_type, title, caption, date, tag, aspect_ratio, sort_order
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (id) DO UPDATE SET
                 url = EXCLUDED.url,
                 has_blob = TRUE,
                 mime_type = EXCLUDED.mime_type`,
              [
                memoryId,
                mediaType,
                mediaUrl,
                true,
                mimeType,
                safeTitle,
                safeCaption,
                safeDate,
                safeTag,
                aspectRatio,
                sortOrder,
              ]
            );

            await client.query(
              `INSERT INTO media_blobs (memory_id, mime_type, data, byte_size)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (memory_id) DO NOTHING`,
              [memoryId, mimeType, uploadedFile.buffer, uploadedFile.buffer.length]
            );
            return;
          }

          if (rawUrl) {
            const parsedData = parseDataUrlToBuffer(rawUrl);
            if (parsedData) {
              const mediaUrl = `/api/media/${encodeURIComponent(memoryId)}`;
              await client.query(
                `INSERT INTO memories (
                   id, type, url, has_blob, mime_type, title, caption, date, tag, aspect_ratio, sort_order
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 ON CONFLICT (id) DO UPDATE SET
                   url = EXCLUDED.url,
                   has_blob = TRUE,
                   mime_type = EXCLUDED.mime_type`,
                [
                  memoryId,
                  mediaType,
                  mediaUrl,
                  true,
                  parsedData.mimeType,
                  safeTitle,
                  safeCaption,
                  safeDate,
                  safeTag,
                  aspectRatio,
                  sortOrder,
                ]
              );
              await client.query(
                `INSERT INTO media_blobs (memory_id, mime_type, data, byte_size)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (memory_id) DO NOTHING`,
                [
                  memoryId,
                  parsedData.mimeType,
                  parsedData.buffer,
                  parsedData.buffer.length,
                ]
              );
              return;
            }

            if (isSafeMediaUrl(rawUrl)) {
              await client.query(
                `INSERT INTO memories (
                   id, type, url, has_blob, mime_type, title, caption, date, tag, aspect_ratio, sort_order
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 ON CONFLICT (id) DO NOTHING`,
                [
                  memoryId,
                  mediaType,
                  rawUrl.slice(0, 2000),
                  false,
                  mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
                  safeTitle,
                  safeCaption,
                  safeDate,
                  safeTag,
                  aspectRatio,
                  sortOrder,
                ]
              );
              return;
            }
          }

          throw new Error('No media file or valid URL provided for migration.');
        });

        const saved = await getPool().query<MemoryRow>(
          `SELECT id, type, url, has_blob, mime_type, title, caption, date, tag, aspect_ratio, sort_order
           FROM memories WHERE id = $1`,
          [memoryId]
        );

        res.json({
          success: true,
          item: saved.rows[0] ? mapMemoryRow(saved.rows[0]) : null,
        });
      } catch (innerErr) {
        console.error('POST /api/migrate/memory failed:', innerErr);
        res.status(500).json({
          success: false,
          error:
            innerErr instanceof Error
              ? innerErr.message
              : 'Failed to migrate memory item.',
        });
      }
    });
  });

  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'API route not found.' });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      '/assets',
      express.static(path.resolve(distPath, 'assets'), {
        maxAge: '30d',
        immutable: true,
      })
    );
    app.use(
      express.static(distPath, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
