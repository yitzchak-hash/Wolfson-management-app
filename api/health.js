// Diagnostic endpoint — reports ONLY whether each env var is present (booleans).
// Never returns any secret values. Safe to call without auth.

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');

  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  let serviceAccountValid = false;
  let clientEmail = null;
  if (saJson) {
    try {
      const parsed = JSON.parse(saJson);
      serviceAccountValid = !!parsed.private_key && !!parsed.client_email;
      // Expose only the email (already shared with the Drive folder, not secret)
      clientEmail = parsed.client_email ?? null;
    } catch {
      serviceAccountValid = false;
    }
  }

  res.status(200).json({
    ok: true,
    hasServiceAccount: !!saJson,
    serviceAccountValid,
    clientEmail,
    hasApiKey: !!process.env.API_KEY,
    allowedOrigin: process.env.ALLOWED_ORIGIN || '(not set — defaults to *)',
    // Vercel built-in vars — always present if functions are running correctly
    vercelEnv: process.env.VERCEL_ENV || '(not set)',
    nodeEnv: process.env.NODE_ENV || '(not set)',
    vercelRegion: process.env.VERCEL_REGION || '(not set)',
  });
}
