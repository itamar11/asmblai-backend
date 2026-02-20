const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../lib/email');

/**
 * POST /api/auth/signup
 * Create a new company + user account
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, companyName, jobTitle } = req.body;

    if (!email || !password || !companyName) {
      return res.status(400).json({ error: 'Email, password, and company name are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create company (trial plan — 2 free SKUs)
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: companyName,
        plan: 'trial',
        sku_limit: 2,
      })
      .select()
      .single();

    if (companyError) throw companyError;

    // Create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        company_id: company.id,
        email: email.toLowerCase(),
        password_hash: passwordHash,
        first_name: firstName || '',
        last_name: lastName || '',
        job_title: jobTitle || '',
        role: 'admin',
      })
      .select()
      .single();

    if (userError) throw userError;

    // Create default notification preferences
    await supabase
      .from('notification_preferences')
      .insert({ user_id: user.id });

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, companyId: company.id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Send welcome email (don't await — don't block the response)
    sendWelcomeEmail({
      to: email,
      firstName: firstName || 'there',
      companyName,
    }).catch(err => console.error('Welcome email failed:', err));

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        jobTitle: user.job_title,
      },
      company: {
        id: company.id,
        name: company.name,
        plan: company.plan,
        skuLimit: company.sku_limit,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

/**
 * POST /api/auth/signin
 * Sign in with email + password
 */
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const { data: user, error } = await supabase
      .from('users')
      .select('*, companies(*)')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, companyId: user.company_id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        jobTitle: user.job_title,
      },
      company: {
        id: user.companies.id,
        name: user.companies.name,
        plan: user.companies.plan,
        skuLimit: user.companies.sku_limit,
      },
    });
  } catch (err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'Sign in failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', requireAuth, async (req, res) => {
  const { user, company } = req;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      jobTitle: user.job_title,
    },
    company: {
      id: company.id,
      name: company.name,
      plan: company.plan,
      skuLimit: company.sku_limit,
      planStatus: company.plan_status,
    },
  });
});

/**
 * PUT /api/auth/me
 * Update account info
 */
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName, jobTitle } = req.body;

    const { data, error } = await supabase
      .from('users')
      .update({
        first_name: firstName,
        last_name: lastName,
        job_title: jobTitle,
      })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, user: data });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

/**
 * PUT /api/auth/password
 * Change password
 */
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, req.user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', req.user.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
