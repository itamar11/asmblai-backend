const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

// Lazy-load Stripe so server starts without STRIPE_SECRET_KEY in dev
function getStripe() {
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

const PLANS = {
  starter: { name: 'Starter', price: 150, skuLimit: 10,  priceId: process.env.STRIPE_PRICE_STARTER },
  growth:  { name: 'Growth',  price: 250, skuLimit: 25,  priceId: process.env.STRIPE_PRICE_GROWTH  },
  scale:   { name: 'Scale',   price: 500, skuLimit: -1,  priceId: process.env.STRIPE_PRICE_SCALE   },
};

/**
 * GET /api/billing/plans
 * Return available plans (public — no auth needed)
 */
router.get('/plans', (req, res) => {
  res.json({ plans: PLANS });
});

/**
 * GET /api/billing/current
 * Get the company's current plan and usage
 */
router.get('/current', requireAuth, async (req, res) => {
  try {
    const company = req.company;

    // Count active SKUs
    const { count: skuCount } = await supabase
      .from('skus')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', req.companyId)
      .eq('status', 'live');

    res.json({
      plan: company.plan,
      planStatus: company.plan_status,
      skuLimit: company.sku_limit,
      skuCount,
      stripeCustomerId: company.stripe_customer_id,
    });
  } catch (err) {
    console.error('Get billing error:', err);
    res.status(500).json({ error: 'Failed to fetch billing info' });
  }
});

/**
 * POST /api/billing/subscribe
 * Create or upgrade a Stripe subscription
 */
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { plan, paymentMethodId } = req.body;
    const stripe = getStripe();
    const company = req.company;

    if (!PLANS[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    let customerId = company.stripe_customer_id;

    // Create Stripe customer if not exists
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: company.name,
        metadata: { companyId: company.id },
      });
      customerId = customer.id;

      await supabase
        .from('companies')
        .update({ stripe_customer_id: customerId })
        .eq('id', req.companyId);
    }

    // Attach payment method
    if (paymentMethodId) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: PLANS[plan].priceId }],
      expand: ['latest_invoice.payment_intent'],
    });

    // Update company plan
    await supabase
      .from('companies')
      .update({
        plan,
        sku_limit: PLANS[plan].skuLimit,
        plan_status: 'active',
        stripe_subscription_id: subscription.id,
      })
      .eq('id', req.companyId);

    res.json({
      success: true,
      subscriptionId: subscription.id,
      plan,
    });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

/**
 * POST /api/billing/cancel
 * Cancel subscription at period end
 */
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    const company = req.company;

    if (!company.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    // Cancel at period end (not immediately)
    await stripe.subscriptions.update(company.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    await supabase
      .from('companies')
      .update({ plan_status: 'cancelling' })
      .eq('id', req.companyId);

    res.json({ success: true, message: 'Subscription will cancel at end of billing period' });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * GET /api/billing/invoices
 * List past invoices from Stripe
 */
router.get('/invoices', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    const company = req.company;

    if (!company.stripe_customer_id) {
      return res.json({ invoices: [] });
    }

    const invoices = await stripe.invoices.list({
      customer: company.stripe_customer_id,
      limit: 12,
    });

    const formatted = invoices.data.map(inv => ({
      id: inv.id,
      date: new Date(inv.created * 1000).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      }),
      amount: `$${(inv.amount_paid / 100).toFixed(2)}`,
      status: inv.status,
      pdfUrl: inv.invoice_pdf,
      description: inv.lines.data[0]?.description || 'Assembly.AI Subscription',
    }));

    res.json({ invoices: formatted });
  } catch (err) {
    console.error('Invoices error:', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

/**
 * POST /api/billing/webhook
 * Stripe webhook — handles subscription events
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'customer.subscription.deleted':
      // Subscription cancelled — downgrade to trial
      await supabase
        .from('companies')
        .update({ plan: 'trial', sku_limit: 2, plan_status: 'cancelled' })
        .eq('stripe_subscription_id', event.data.object.id);
      break;

    case 'invoice.payment_failed':
      // Payment failed — mark as past due
      await supabase
        .from('companies')
        .update({ plan_status: 'past_due' })
        .eq('stripe_customer_id', event.data.object.customer);
      break;

    case 'invoice.payment_succeeded':
      // Payment succeeded — ensure active
      await supabase
        .from('companies')
        .update({ plan_status: 'active' })
        .eq('stripe_customer_id', event.data.object.customer);
      break;
  }

  res.json({ received: true });
});

module.exports = router;
