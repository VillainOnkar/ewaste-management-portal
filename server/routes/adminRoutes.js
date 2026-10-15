const express = require('express');
const { getFirebaseServices } = require('../services/firebaseAdmin');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

router.post('/admin/sync-assigned-users', requireAdmin, async (req, res, next) => {
  try {
    const { database } = getFirebaseServices();
    const snapshot = await database.ref('users').once('value');
    const profiles = snapshot.val() || {};
    const updates = {};

    for (const [uid, profile] of Object.entries(profiles)) {
      if (profile?.role === 'user' && profile.adminUid === req.adminUser.uid) {
        updates[`adminUsers/${req.adminUser.uid}/${uid}`] = profile;
      }
    }

    if (Object.keys(updates).length > 0) {
      await database.ref().update(updates);
    }

    return res.json({ success: true, syncedUsers: Object.keys(updates).length });
  } catch (error) {
    return next(error);
  }
});

router.delete('/admin/users/:uid', requireAdmin, async (req, res, next) => {
  const { uid } = req.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || uid === req.adminUser.uid) {
    return res.status(400).json({ success: false, message: 'This customer account cannot be deleted.' });
  }

  try {
    const { auth, database } = getFirebaseServices();
    const profileSnapshot = await database.ref(`users/${uid}`).once('value');
    const profile = profileSnapshot.val();
    if (!profile || profile.role !== 'user' || profile.adminUid !== req.adminUser.uid) {
      return res.status(404).json({ success: false, message: 'This customer account is not assigned to your administrator account.' });
    }

    let authAccountAlreadyDeleted = false;
    try {
      await auth.getUser(uid);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      authAccountAlreadyDeleted = true;
    }

    if (!authAccountAlreadyDeleted) {
      await auth.revokeRefreshTokens(uid);
      await auth.deleteUser(uid);
      try {
        await auth.getUser(uid);
        throw new Error('Firebase Auth still reports this account after deletion. Database records were not removed.');
      } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
      }
    }

    const updates = {};
    updates[`users/${uid}`] = null;
    updates[`adminUsers/${req.adminUser.uid}/${uid}`] = null;
    updates[`pickupRequests/${uid}`] = null;
    updates[`pickupPreferences/${uid}`] = null;
    try {
      await database.ref().update(updates);
    } catch (error) {
      error.message = `The Firebase Auth account was deleted, but its database records could not be removed. Retry this delete to finish cleanup. ${error.message}`;
      throw error;
    }

    return res.json({ success: true, uid, authAccountAlreadyDeleted });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
