const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const QR_DIR = path.join(__dirname, '../public/qr');

// Make sure the QR output directory exists
if (!fs.existsSync(QR_DIR)) {
  fs.mkdirSync(QR_DIR, { recursive: true });
}

/**
 * Generate a QR code image for a SKU
 * @param {string} skuId - The SKU's database ID
 * @param {string} skuCode - Human readable SKU code e.g. KALLAX-4X2-BLK
 * @returns {object} { qrCodeUrl, qrTargetUrl }
 */
async function generateQRCode(skuId, skuCode) {
  const targetUrl = `${process.env.QR_BASE_URL}/${skuCode}`;
  const filename = `${skuId}.png`;
  const filepath = path.join(QR_DIR, filename);

  await QRCode.toFile(filepath, targetUrl, {
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'H',
  });

  // In production this would be a CDN URL
  // For now return the local server path
  const qrCodeUrl = `/public/qr/${filename}`;

  return { qrCodeUrl, qrTargetUrl: targetUrl };
}

/**
 * Generate a QR code as a base64 data URL (for email attachments)
 */
async function generateQRCodeDataURL(skuCode) {
  const targetUrl = `${process.env.QR_BASE_URL}/${skuCode}`;
  const dataUrl = await QRCode.toDataURL(targetUrl, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'H',
  });
  return { dataUrl, targetUrl };
}

module.exports = { generateQRCode, generateQRCodeDataURL };
