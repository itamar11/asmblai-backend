const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/analytics/overview?period=7d|30d|3m|6m|1y|all
 * Top-level stats for the analytics dashboard
 */
router.get('/overview', requireAuth, async (req, res) => {
  try {
    const period = req.query.period || '7d';
    const startDate = getStartDate(period);

    // Total scans
    let scansQuery = supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', req.companyId);
    if (startDate) scansQuery = scansQuery.gte('scanned_at', startDate);
    const { count: totalScans } = await scansQuery;

    // Completed scans
    let completedQuery = supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', req.companyId)
      .eq('completed', true);
    if (startDate) completedQuery = completedQuery.gte('scanned_at', startDate);
    const { count: completedScans } = await completedQuery;

    // Avg satisfaction
    let ratingsQuery = supabase
      .from('scans')
      .select('rating')
      .eq('company_id', req.companyId)
      .not('rating', 'is', null);
    if (startDate) ratingsQuery = ratingsQuery.gte('scanned_at', startDate);
    const { data: ratings } = await ratingsQuery;
    const avgRating = ratings?.length
      ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1)
      : null;

    // Repeat scans (sessions with more than 1 scan)
    let allScansQuery = supabase
      .from('scans')
      .select('session_id')
      .eq('company_id', req.companyId);
    if (startDate) allScansQuery = allScansQuery.gte('scanned_at', startDate);
    const { data: allScans } = await allScansQuery;
    const sessionCounts = {};
    allScans?.forEach(s => { sessionCounts[s.session_id] = (sessionCounts[s.session_id] || 0) + 1; });
    const repeatSessions = Object.values(sessionCounts).filter(c => c > 1).length;
    const totalSessions = Object.keys(sessionCounts).length;
    const repeatRate = totalSessions
      ? ((repeatSessions / totalSessions) * 100).toFixed(1)
      : 0;

    // Active SKUs
    const { count: activeSKUs } = await supabase
      .from('skus')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', req.companyId)
      .eq('status', 'live');

    res.json({
      period,
      totalScans,
      completedScans,
      completionRate: totalScans ? ((completedScans / totalScans) * 100).toFixed(1) : 0,
      avgRating,
      repeatRate,
      activeSKUs,
    });
  } catch (err) {
    console.error('Overview analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
});

/**
 * GET /api/analytics/scans?period=7d
 * Scans over time for the line chart
 */
router.get('/scans', requireAuth, async (req, res) => {
  try {
    const period = req.query.period || '7d';
    const startDate = getStartDate(period);
    const groupBy = getGroupBy(period);

    let query = supabase
      .from('scans')
      .select('scanned_at')
      .eq('company_id', req.companyId);
    if (startDate) query = query.gte('scanned_at', startDate);

    const { data: scans } = await query;

    // Group by day/week/month
    const grouped = groupScans(scans || [], groupBy);

    res.json({ data: grouped });
  } catch (err) {
    console.error('Scans over time error:', err);
    res.status(500).json({ error: 'Failed to fetch scan data' });
  }
});

/**
 * GET /api/analytics/tod?period=7d
 * Scans by time of day (0-23 hours)
 */
router.get('/tod', requireAuth, async (req, res) => {
  try {
    const period = req.query.period || '7d';
    const startDate = getStartDate(period);

    let query = supabase
      .from('scans')
      .select('hour_of_day')
      .eq('company_id', req.companyId);
    if (startDate) query = query.gte('scanned_at', startDate);

    const { data: scans } = await query;

    // Group into time buckets
    const buckets = { '6-9': 0, '9-12': 0, '12-15': 0, '15-18': 0, '18-21': 0, '21+': 0 };
    scans?.forEach(s => {
      const h = s.hour_of_day;
      if (h >= 6 && h < 9) buckets['6-9']++;
      else if (h >= 9 && h < 12) buckets['9-12']++;
      else if (h >= 12 && h < 15) buckets['12-15']++;
      else if (h >= 15 && h < 18) buckets['15-18']++;
      else if (h >= 18 && h < 21) buckets['18-21']++;
      else buckets['21+']++;
    });

    const total = Object.values(buckets).reduce((a, b) => a + b, 0);
    const result = Object.entries(buckets).map(([label, count]) => ({
      label,
      count,
      percentage: total ? ((count / total) * 100).toFixed(1) : 0,
    }));

    res.json({ data: result });
  } catch (err) {
    console.error('TOD analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch time-of-day data' });
  }
});

/**
 * GET /api/analytics/satisfaction
 * Star rating breakdown 1-5
 */
router.get('/satisfaction', requireAuth, async (req, res) => {
  try {
    const period = req.query.period || '7d';
    const startDate = getStartDate(period);

    let query = supabase
      .from('scans')
      .select('rating')
      .eq('company_id', req.companyId)
      .not('rating', 'is', null);
    if (startDate) query = query.gte('scanned_at', startDate);

    const { data: ratings } = await query;

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratings?.forEach(r => { breakdown[r.rating]++; });

    const total = ratings?.length || 0;
    const avg = total
      ? (ratings.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1)
      : null;

    const result = [5, 4, 3, 2, 1].map(stars => ({
      stars,
      count: breakdown[stars],
      percentage: total ? ((breakdown[stars] / total) * 100).toFixed(1) : 0,
    }));

    res.json({ avg, total, breakdown: result });
  } catch (err) {
    console.error('Satisfaction analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch satisfaction data' });
  }
});

/**
 * GET /api/analytics/questions?period=7d&limit=10
 * Most frequently asked questions
 */
router.get('/questions', requireAuth, async (req, res) => {
  try {
    const period = req.query.period || '7d';
    const limit = parseInt(req.query.limit) || 10;
    const startDate = getStartDate(period);

    let query = supabase
      .from('questions')
      .select('question_text, step_number, sku_id, skus(product_name, sku_code)')
      .eq('company_id', req.companyId);
    if (startDate) query = query.gte('asked_at', startDate);

    const { data: questions } = await query;

    // Group and count
    const grouped = {};
    questions?.forEach(q => {
      const key = q.question_text.toLowerCase().trim();
      if (!grouped[key]) {
        grouped[key] = {
          question: q.question_text,
          step: q.step_number,
          skuName: q.skus?.product_name,
          count: 0,
        };
      }
      grouped[key].count++;
    });

    const sorted = Object.values(grouped)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    res.json({ questions: sorted });
  } catch (err) {
    console.error('Questions analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch questions data' });
  }
});

/**
 * POST /api/analytics/scan
 * Record a new scan event (called from the consumer-facing QR page)
 * Public route — no auth required
 */
router.post('/scan', async (req, res) => {
  try {
    const { skuCode, sessionId, userAgent } = req.body;

    if (!skuCode) {
      return res.status(400).json({ error: 'SKU code is required' });
    }

    // Look up the SKU
    const { data: sku } = await supabase
      .from('skus')
      .select('id, company_id')
      .eq('sku_code', skuCode)
      .eq('status', 'live')
      .single();

    if (!sku) {
      return res.status(404).json({ error: 'SKU not found' });
    }

    const hourOfDay = new Date().getHours();

    await supabase.from('scans').insert({
      sku_id: sku.id,
      company_id: sku.company_id,
      session_id: sessionId || 'anonymous',
      user_agent: userAgent,
      hour_of_day: hourOfDay,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Record scan error:', err);
    res.status(500).json({ error: 'Failed to record scan' });
  }
});

/**
 * POST /api/analytics/complete
 * Record scan completion + rating
 * Public route — no auth required
 */
router.post('/complete', async (req, res) => {
  try {
    const { skuCode, sessionId, completionStep, rating } = req.body;

    const { data: sku } = await supabase
      .from('skus')
      .select('id, company_id')
      .eq('sku_code', skuCode)
      .single();

    if (!sku) return res.status(404).json({ error: 'SKU not found' });

    // Update the scan record for this session
    await supabase
      .from('scans')
      .update({
        completed: true,
        completion_step: completionStep,
        rating: rating || null,
      })
      .eq('sku_id', sku.id)
      .eq('session_id', sessionId)
      .order('scanned_at', { ascending: false })
      .limit(1);

    res.json({ success: true });
  } catch (err) {
    console.error('Record completion error:', err);
    res.status(500).json({ error: 'Failed to record completion' });
  }
});

/**
 * POST /api/analytics/question
 * Record a question asked during assembly
 * Public route — no auth required
 */
router.post('/question', async (req, res) => {
  try {
    const { skuCode, sessionId, questionText, stepNumber } = req.body;

    if (!skuCode || !questionText) {
      return res.status(400).json({ error: 'SKU code and question text are required' });
    }

    const { data: sku } = await supabase
      .from('skus')
      .select('id, company_id')
      .eq('sku_code', skuCode)
      .single();

    if (!sku) return res.status(404).json({ error: 'SKU not found' });

    await supabase.from('questions').insert({
      sku_id: sku.id,
      company_id: sku.company_id,
      session_id: sessionId || 'anonymous',
      question_text: questionText,
      step_number: stepNumber,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Record question error:', err);
    res.status(500).json({ error: 'Failed to record question' });
  }
});

// ─── HELPERS ──────────────────────────────────────────
function getStartDate(period) {
  const now = new Date();
  const map = {
    '7d': 7, '30d': 30, '3m': 90, '6m': 180, '1y': 365
  };
  if (!map[period]) return null; // 'all' = no filter
  const d = new Date(now);
  d.setDate(d.getDate() - map[period]);
  return d.toISOString();
}

function getGroupBy(period) {
  if (period === '7d') return 'day';
  if (period === '30d') return 'day';
  if (period === '3m' || period === '6m') return 'week';
  return 'month';
}

function groupScans(scans, groupBy) {
  const groups = {};
  scans.forEach(scan => {
    const d = new Date(scan.scanned_at);
    let key;
    if (groupBy === 'day') {
      key = d.toISOString().split('T')[0];
    } else if (groupBy === 'week') {
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay());
      key = start.toISOString().split('T')[0];
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    groups[key] = (groups[key] || 0) + 1;
  });

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

module.exports = router;
