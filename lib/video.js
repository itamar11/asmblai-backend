/**
 * Video Generation — Placeholder
 * ─────────────────────────────────────────────────────────
 * Currently returns a placeholder video URL.
 * To swap in HeyGen:
 *   1. npm install @heygen/heygen-sdk
 *   2. Add HEYGEN_API_KEY to your .env
 *   3. Replace the generateVideo function below with the HeyGen version
 *
 * HeyGen docs: https://docs.heygen.com
 */

/**
 * Parse instruction steps from uploaded file content
 * In production this would use Claude or GPT to extract steps
 * @param {string} fileContent - Raw text content of the instruction file
 * @returns {Array} Array of step objects { stepNumber, description }
 */
function parseSteps(fileContent) {
  // Placeholder — returns mock steps
  // In production: send fileContent to Claude API to extract structured steps
  return [
    { stepNumber: 1, description: 'Lay out all parts on a flat surface and identify each component using the parts list.' },
    { stepNumber: 2, description: 'Attach the side panels to the base using the provided cam locks. Do not fully tighten yet.' },
    { stepNumber: 3, description: 'Insert the shelf pins into the pre-drilled holes at your desired height.' },
    { stepNumber: 4, description: 'Slide the shelves into position on the shelf pins.' },
    { stepNumber: 5, description: 'Attach the back panel by pressing it into the frame grooves.' },
    { stepNumber: 6, description: 'Fully tighten all cam locks and check that the unit is stable.' },
  ];
}

/**
 * Generate an assembly video for a SKU
 * Currently a placeholder — simulates processing time and returns a demo video
 *
 * @param {string} skuId - Database ID of the SKU
 * @param {string} skuCode - Human readable SKU code
 * @param {string} productName - Product name for the video title
 * @param {Array} steps - Parsed assembly steps
 * @returns {object} { videoUrl, videoDuration, stepCount }
 */
async function generateVideo(skuId, skuCode, productName, steps) {
  // Simulate AI processing time (2-4 seconds in placeholder mode)
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

  // Placeholder video URL — in production this is the HeyGen CDN URL
  const videoUrl = `https://storage.assemblyai.app/videos/${skuId}/assembly.mp4`;
  const videoDuration = steps.length * 38; // ~38 seconds per step

  return {
    videoUrl,
    videoDuration,
    stepCount: steps.length,
  };
}

/**
 * ─── HOW TO SWAP IN HEYGEN ──────────────────────────────
 *
 * async function generateVideo(skuId, skuCode, productName, steps) {
 *   const { HeyGenSDK } = require('@heygen/heygen-sdk');
 *   const client = new HeyGenSDK({ apiKey: process.env.HEYGEN_API_KEY });
 *
 *   const script = steps.map((s, i) =>
 *     `Step ${i + 1}: ${s.description}`
 *   ).join('\n\n');
 *
 *   const video = await client.videos.create({
 *     title: `${productName} Assembly Guide`,
 *     script,
 *     avatar: 'your-avatar-id',
 *     voice: 'your-voice-id',
 *   });
 *
 *   // Poll for completion
 *   let result;
 *   do {
 *     await new Promise(r => setTimeout(r, 3000));
 *     result = await client.videos.get(video.id);
 *   } while (result.status !== 'completed');
 *
 *   return {
 *     videoUrl: result.video_url,
 *     videoDuration: result.duration,
 *     stepCount: steps.length,
 *   };
 * }
 */

module.exports = { generateVideo, parseSteps };
