const { getFirebaseServices } = require('../services/firebaseAdmin');

async function requireAdmin(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Sign in with an administrator account.' });
  }

  try {
    const { auth } = getFirebaseServices();
    const decodedToken = await auth.verifyIdToken(match[1]);
    if (decodedToken.admin !== true) {
      return res.status(403).json({ success: false, message: 'Administrator access is required.' });
    }
    req.adminUser = decodedToken;
    return next();
  } catch (error) {
    if (error.statusCode === 503) {
      return res.status(503).json({ success: false, message: error.message });
    }
    return res.status(401).json({ success: false, message: 'Your sign-in could not be verified. Sign in again and retry.' });
  }
}

module.exports = { requireAdmin };
