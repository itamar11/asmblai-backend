const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/settings/company
 * Get company details
 */
router.get('/company', requireAuth, async (req, res) => {
  const company = req.company;
  res.json({
    id: company.id,
    name: company.name,
    industry: company.industry,
    size: company.size,
    website: company.website,
    billingAddress: company.billing_address,
  });
});

/**
 * PUT /api/settings/company
 * Update company details
 */
router.put('/company', requireAuth, async (req, res) => {
  try {
    const { name, industry, size, website, billingAddress } = req.body;

    const { data, error } = await supabase
      .from('companies')
      .update({
        name,
        industry,
        size,
        website,
        billing_address: billingAddress,
      })
      .eq('id', req.companyId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, company: data });
  } catch (err) {
    console.error('Update company error:', err);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

/**
 * GET /api/settings/notifications
 */
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error) throw error;
    res.json({ preferences: data });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

/**
 * PUT /api/settings/notifications
 */
router.put('/notifications', requireAuth, async (req, res) => {
  try {
    const { qrReady, weeklyDigest, dropoffAlerts, questionSpikes, billing, productUpdates } = req.body;

    const { data, error } = await supabase
      .from('notification_preferences')
      .update({
        qr_ready: qrReady,
        weekly_digest: weeklyDigest,
        dropoff_alerts: dropoffAlerts,
        question_spikes: questionSpikes,
        billing,
        product_updates: productUpdates,
      })
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, preferences: data });
  } catch (err) {
    console.error('Update notifications error:', err);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

module.exports = router;
