const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../lib/supabase');
const { requireAuth, checkSkuLimit } = require('../middleware/auth');
const { generateQRCode } = require('../lib/qr');
const { generateVideo, parseSteps } = require('../lib/video');
const { sendQRReadyEmail } = require('../lib/email');

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.heic'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'));
    }
  },
});

/**
 * GET /api/skus
 * List all SKUs for the company with performance data
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sku_performance')
      .select('*')
      .eq('company_id', req.companyId)
      .order('total_scans', { ascending: false });

    if (error) throw error;

    res.json({ skus: data });
  } catch (err) {
    console.error('List SKUs error:', err);
    res.status(500).json({ error: 'Failed to fetch SKUs' });
  }
});

/**
 * GET /api/skus/:id
 * Get a single SKU with full detail
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { data: sku, error } = await supabase
      .from('sku_performance')
      .select('*')
      .eq('id', req.params.id)
      .eq('company_id', req.companyId)
      .single();

    if (error || !sku) {
      return res.status(404).json({ error: 'SKU not found' });
    }

    // Get top questions for this SKU
    const { data: questions } = await supabase
      .from('top_questions')
      .select('*')
      .eq('sku_id', req.params.id)
      .limit(10);

    // Get drop-off by step
    const { data: dropoff } = await supabase
      .from('scans')
      .select('completion_step')
      .eq('sku_id', req.params.id)
      .not('completion_step', 'is', null);

    res.json({ sku, questions: questions || [], dropoff: dropoff || [] });
  } catch (err) {
    console.error('Get SKU error:', err);
    res.status(500).json({ error: 'Failed to fetch SKU' });
  }
});

/**
 * POST /api/skus
 * Upload a new SKU and trigger generation
 * This is the main action — upload file → generate video → generate QR
 */
router.post('/', requireAuth, checkSkuLimit, upload.single('file'), async (req, res) => {
  try {
    const { skuCode, productName, category } = req.body;

    if (!skuCode || !productName) {
      return res.status(400).json({ error: 'SKU code and product name are required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Instruction file is required' });
    }

    // Check for duplicate SKU code within company
    const { data: existing } = await supabase
      .from('skus')
      .select('id')
      .eq('company_id', req.companyId)
      .eq('sku_code', skuCode)
      .single();

    if (existing) {
      return res.status(409).json({ error: `SKU code "${skuCode}" already exists` });
    }

    // Create the SKU record in "processing" state
    const { data: sku, error: skuError } = await supabase
      .from('skus')
      .insert({
        company_id: req.companyId,
        sku_code: skuCode,
        product_name: productName,
        category: category || 'Other',
        status: 'processing',
        file_url: `/uploads/${req.file.filename}`,
      })
      .select()
      .single();

    if (skuError) throw skuError;

    // Respond immediately — processing happens in background
    res.status(202).json({
      message: 'SKU created — generating video and QR code',
      sku: {
        id: sku.id,
        skuCode: sku.sku_code,
        productName: sku.product_name,
        status: sku.status,
      },
    });

    // ─── BACKGROUND PROCESSING ───────────────────────────
    // Run generation after response is sent
    processSkuGeneration(sku, req.user, req.file).catch(err => {
      console.error(`SKU generation failed for ${sku.id}:`, err);
      // Mark as error
      supabase
        .from('skus')
        .update({ status: 'error' })
        .eq('id', sku.id)
        .then(() => {});
    });

  } catch (err) {
    console.error('Create SKU error:', err);
    res.status(500).json({ error: 'Failed to create SKU' });
  }
});

/**
 * Background processing — video generation + QR creation + email
 */
async function processSkuGeneration(sku, user, file) {
  // 1. Parse steps from the uploaded file
  // In production: read file content and send to Claude API
  const steps = parseSteps(file.path);

  // 2. Generate video (placeholder or HeyGen)
  const { videoUrl, videoDuration, stepCount } = await generateVideo(
    sku.id,
    sku.sku_code,
    sku.product_name,
    steps
  );

  // 3. Generate QR code
  const { qrCodeUrl, qrTargetUrl } = await generateQRCode(sku.id, sku.sku_code);

  // 4. Update SKU to live
  await supabase
    .from('skus')
    .update({
      status: 'live',
      video_url: videoUrl,
      video_duration: videoDuration,
      step_count: stepCount,
      qr_code_url: qrCodeUrl,
      qr_target_url: qrTargetUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sku.id);

  // 5. Send notification email
  const prefs = await supabase
    .from('notification_preferences')
    .select('qr_ready')
    .eq('user_id', user.id)
    .single();

  if (!prefs.data || prefs.data.qr_ready) {
    await sendQRReadyEmail({
      to: user.email,
      productName: sku.product_name,
      skuCode: sku.sku_code,
      qrCodeUrl,
      qrTargetUrl,
    });
  }

  console.log(`✓ SKU ${sku.sku_code} processed successfully`);
}

/**
 * GET /api/skus/:id/status
 * Poll for SKU processing status (frontend polls this after upload)
 */
router.get('/:id/status', requireAuth, async (req, res) => {
  try {
    const { data: sku, error } = await supabase
      .from('skus')
      .select('id, status, qr_code_url, qr_target_url, video_url, step_count')
      .eq('id', req.params.id)
      .eq('company_id', req.companyId)
      .single();

    if (error || !sku) {
      return res.status(404).json({ error: 'SKU not found' });
    }

    res.json({ status: sku.status, sku });
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

/**
 * DELETE /api/skus/:id
 * Delete a SKU
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('skus')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', req.companyId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Delete SKU error:', err);
    res.status(500).json({ error: 'Failed to delete SKU' });
  }
});

module.exports = router;
