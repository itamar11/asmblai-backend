require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── ENSURE DIRECTORIES EXIST ───────────────────────────
['uploads', 'public/qr'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── RATE LIMITING ──────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Stricter limit for auth endpoints
  message: { error: 'Too many login attempts, please try again later' },
});

// ─── MIDDLEWARE ──────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5500',
  credentials: true,
}));

// Stripe webhook needs raw body — must come BEFORE express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

// Serve static files (QR codes, uploads)
app.use('/public', express.static(path.join(__dirname, 'public')));

// ─── ROUTES ─────────────────────────────────────────────
app.use('/api/auth',      authLimiter, require('./routes/auth'));
app.use('/api/skus',      require('./routes/skus'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/billing',   require('./routes/billing'));
app.use('/api/settings',  require('./routes/settings'));

// ─── HEALTH CHECK ───────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── CONSUMER QR PAGE ───────────────────────────────────
// When a customer scans a QR code, they land here
// This serves the assembly video experience
app.get('/s/:skuCode', async (req, res) => {
  const { skuCode } = req.params;
  const supabase = require('./lib/supabase');

  const { data: sku } = await supabase
    .from('skus')
    .select('product_name, video_url, step_count, video_duration')
    .eq('sku_code', skuCode)
    .eq('status', 'live')
    .single();

  if (!sku) {
    return res.status(404).send(`
      <html>
        <body style="font-family:sans-serif;background:#080808;color:#f0f0f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center">
            <div style="font-size:2rem;margin-bottom:12px">⚠️</div>
            <div style="font-weight:bold;margin-bottom:8px">Instructions not found</div>
            <div style="color:#555;font-size:0.9rem">This QR code may be invalid or the product has been removed.</div>
          </div>
        </body>
      </html>
    `);
  }

  // Return a simple consumer-facing page
  // In production this would be a proper React page with the video player
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${sku.product_name} — Assembly Guide</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', Arial, sans-serif; background: #080808; color: #f0f0f0; min-height: 100vh; }
        .header { padding: 20px 24px; border-bottom: 1px solid #1c1c1c; display: flex; align-items: center; justify-content: space-between; }
        .logo { font-weight: 800; font-size: 1rem; }
        .logo span { color: #d4ff4f; }
        .product { padding: 24px; }
        .product-name { font-size: 1.4rem; font-weight: 800; margin-bottom: 6px; }
        .product-meta { font-size: 0.78rem; color: #555; margin-bottom: 24px; font-family: monospace; }
        .video-placeholder { background: #111; border: 1px solid #1c1c1c; border-radius: 12px; aspect-ratio: 16/9; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; margin-bottom: 20px; }
        .play-btn { width: 64px; height: 64px; background: #d4ff4f; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; cursor: pointer; }
        .video-label { font-size: 0.85rem; color: #555; }
        .steps-label { font-family: monospace; font-size: 0.65rem; letter-spacing: 2px; text-transform: uppercase; color: #d4ff4f; margin-bottom: 12px; }
        .rating-section { margin-top: 24px; padding-top: 20px; border-top: 1px solid #1c1c1c; text-align: center; }
        .rating-q { font-size: 0.9rem; margin-bottom: 12px; color: #888; }
        .stars { font-size: 2rem; letter-spacing: 4px; cursor: pointer; }
        .star { transition: color 0.15s; color: #333; }
        .star:hover, .star.active { color: #d4ff4f; }
        .question-box { margin-top: 20px; padding-top: 20px; border-top: 1px solid #1c1c1c; }
        .q-input { width: 100%; background: #111; border: 1px solid #1c1c1c; border-radius: 8px; padding: 10px 14px; color: #f0f0f0; font-size: 0.88rem; outline: none; margin-bottom: 8px; }
        .q-btn { background: #d4ff4f; color: #000; border: none; border-radius: 7px; padding: 9px 18px; font-weight: 700; cursor: pointer; font-size: 0.85rem; }
        .powered { text-align: center; padding: 24px; font-size: 0.7rem; color: #333; }
        .powered span { color: #d4ff4f; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">Assembly<span>.AI</span></div>
        <div style="font-size:0.72rem;color:#555;font-family:monospace">${skuCode}</div>
      </div>
      <div class="product">
        <div class="product-name">${sku.product_name}</div>
        <div class="product-meta">${sku.step_count} steps · ${Math.floor(sku.video_duration / 60)}m ${sku.video_duration % 60}s</div>
        <div class="video-placeholder">
          <div class="play-btn">▶</div>
          <div class="video-label">Tap to start your assembly guide</div>
        </div>
        <div class="steps-label">Assembly Steps</div>
        <div style="color:#555;font-size:0.85rem;text-align:center;padding:20px">
          Video player — full interactive experience coming soon
        </div>
        <div class="rating-section">
          <div class="rating-q">How was your assembly experience?</div>
          <div class="stars">
            <span class="star" onclick="rate(1)">★</span>
            <span class="star" onclick="rate(2)">★</span>
            <span class="star" onclick="rate(3)">★</span>
            <span class="star" onclick="rate(4)">★</span>
            <span class="star" onclick="rate(5)">★</span>
          </div>
        </div>
        <div class="question-box">
          <input class="q-input" placeholder="Have a question about a step? Ask here…" id="q-input"/>
          <button class="q-btn" onclick="askQuestion()">Ask →</button>
        </div>
      </div>
      <div class="powered">Powered by <span>Assembly.AI</span></div>
      <script>
        const SESSION = Math.random().toString(36).slice(2);
        const SKU = '${skuCode}';
        const API = '';

        // Record the scan
        fetch(API + '/api/analytics/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skuCode: SKU, sessionId: SESSION, userAgent: navigator.userAgent })
        }).catch(() => {});

        function rate(n) {
          document.querySelectorAll('.star').forEach((s, i) => {
            s.classList.toggle('active', i < n);
          });
          fetch(API + '/api/analytics/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skuCode: SKU, sessionId: SESSION, completed: true, rating: n })
          }).catch(() => {});
        }

        function askQuestion() {
          const text = document.getElementById('q-input').value.trim();
          if (!text) return;
          fetch(API + '/api/analytics/question', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skuCode: SKU, sessionId: SESSION, questionText: text })
          }).then(() => {
            document.getElementById('q-input').value = '';
            alert('Question submitted! We\'ll use this to improve the guide.');
          }).catch(() => {});
        }
      </script>
    </body>
    </html>
  `);
});

// ─── ERROR HANDLER ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large — maximum 50MB' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ─── START ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────┐
  │  Assembly.AI Backend                │
  │  Running on http://localhost:${PORT}  │
  │  Environment: ${process.env.NODE_ENV || 'development'}         │
  └─────────────────────────────────────┘
  `);
});
