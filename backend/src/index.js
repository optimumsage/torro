require('dotenv').config({ path: '/run/config/.env' });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');
const torrentRoutes = require('./routes/torrents');
const fileRoutes = require('./routes/files');
const streamRoutes = require('./routes/stream');
const downloadRoutes = require('./routes/downloads');
const { verifyToken } = require('./middleware/auth');

const app = express();
app.use(express.json());
app.use(cookieParser());

const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors({
  origin: allowedOrigin
    ? (origin, cb) => {
        if (!origin || origin === allowedOrigin) cb(null, true);
        else cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    : false,
  credentials: true,
}));

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.get('/api/auth/me', verifyToken, (req, res) => res.json({ username: req.user.username }));
app.use('/api/torrents', verifyToken, torrentRoutes);
app.use('/api/files', verifyToken, fileRoutes);
app.use('/api/downloads', verifyToken, downloadRoutes);
app.use('/api/stream', verifyToken, streamRoutes);

app.listen(3000, () => console.log('Backend running on :3000'));
