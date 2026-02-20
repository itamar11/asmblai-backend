const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');

/**
 * Middleware to verify JWT and attach user + company to request
 * Use on any route that requires authentication
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Fetch user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*, companies(*)')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Attach to request for use in route handlers
    req.user = user;
    req.company = user.companies;
    req.companyId = user.company_id;

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Check if company is within their SKU limit
 */
async function checkSkuLimit(req, res, next) {
  try {
    const company = req.company;

    // Unlimited plan
    if (company.sku_limit === -1) return next();

    const { count } = await supabase
      .from('skus')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', req.companyId)
      .eq('status', 'live');

    if (count >= company.sku_limit) {
      return res.status(403).json({
        error: 'SKU limit reached',
        message: `Your ${company.plan} plan allows ${company.sku_limit} active SKUs. Upgrade to add more.`,
        currentCount: count,
        limit: company.sku_limit,
      });
    }

    next();
  } catch (err) {
    console.error('SKU limit check error:', err);
    res.status(500).json({ error: 'Could not verify SKU limit' });
  }
}

module.exports = { requireAuth, checkSkuLimit };
