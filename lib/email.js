const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Send QR ready notification email
 */
async function sendQRReadyEmail({ to, productName, skuCode, qrCodeUrl, qrTargetUrl }) {
  await transporter.sendMail({
    from: `"Assembly.AI" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `✓ Your QR code is ready — ${productName}`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #080808; color: #f0f0f0; border-radius: 12px; overflow: hidden;">
        <div style="background: #111; border-bottom: 1px solid #1c1c1c; padding: 24px 32px;">
          <span style="font-family: Arial, sans-serif; font-weight: 800; font-size: 1.1rem; letter-spacing: -0.3px;">
            Assembly<span style="color: #d4ff4f;">.AI</span>
          </span>
        </div>
        <div style="padding: 36px 32px;">
          <div style="font-size: 0.7rem; letter-spacing: 3px; text-transform: uppercase; color: #d4ff4f; margin-bottom: 10px;">QR Code Ready</div>
          <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 8px; color: #f0f0f0;">${productName}</h2>
          <p style="color: #555; font-size: 0.9rem; margin-bottom: 28px;">Your QR code has been generated and is ready to download and add to your packaging.</p>

          <div style="background: #141414; border: 1px solid #1c1c1c; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
            <div style="font-size: 0.7rem; color: #555; margin-bottom: 4px; letter-spacing: 1px;">SKU</div>
            <div style="font-family: monospace; font-size: 0.9rem; color: #d4ff4f;">${skuCode}</div>
            <div style="font-size: 0.7rem; color: #555; margin-top: 12px; margin-bottom: 4px; letter-spacing: 1px;">Consumer URL</div>
            <div style="font-family: monospace; font-size: 0.78rem; color: #888;">${qrTargetUrl}</div>
          </div>

          <a href="${process.env.FRONTEND_URL}/portal" style="display: inline-block; background: #d4ff4f; color: #000; padding: 12px 28px; border-radius: 8px; font-weight: 800; font-size: 0.9rem; text-decoration: none;">Download QR Code →</a>
        </div>
        <div style="padding: 20px 32px; border-top: 1px solid #1c1c1c; font-size: 0.72rem; color: #333;">
          Assembly.AI · hello@assemblyai.app · Unsubscribe
        </div>
      </div>
    `,
  });
}

/**
 * Send welcome email on signup
 */
async function sendWelcomeEmail({ to, firstName, companyName }) {
  await transporter.sendMail({
    from: `"Assembly.AI" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `Welcome to Assembly.AI, ${firstName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #080808; color: #f0f0f0; border-radius: 12px; overflow: hidden;">
        <div style="background: #111; border-bottom: 1px solid #1c1c1c; padding: 24px 32px;">
          <span style="font-weight: 800; font-size: 1.1rem;">Assembly<span style="color: #d4ff4f;">.AI</span></span>
        </div>
        <div style="padding: 36px 32px;">
          <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 8px;">Welcome, ${firstName} 👋</h2>
          <p style="color: #555; font-size: 0.9rem; line-height: 1.6; margin-bottom: 20px;">
            ${companyName} is now on Assembly.AI. Your first 2 SKUs are free — no credit card required.
          </p>
          <p style="color: #555; font-size: 0.9rem; line-height: 1.6; margin-bottom: 28px;">
            Upload your first instruction manual and we'll have a QR code ready in under 60 seconds.
          </p>
          <a href="${process.env.FRONTEND_URL}/portal" style="display: inline-block; background: #d4ff4f; color: #000; padding: 12px 28px; border-radius: 8px; font-weight: 800; font-size: 0.9rem; text-decoration: none;">Go to Portal →</a>
        </div>
      </div>
    `,
  });
}

module.exports = { sendQRReadyEmail, sendWelcomeEmail };
