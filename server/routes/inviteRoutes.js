const crypto = require('crypto');
const express = require('express');
const { getFirebaseServices } = require('../services/firebaseAdmin');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();
const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function normalizeInviteCode(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return '';

  try {
    const inviteCode = new URL(candidate).searchParams.get('invite');
    if (inviteCode) return inviteCode.trim();
  } catch {
    return candidate;
  }

  return candidate;
}

function inviteUnavailableMessage(invite, role, uid) {
  if (!invite) return 'Invite code not found. Create a fresh invite from Admin Dashboard → Invites.';
  if (invite.role !== role) {
    return `This link is for ${invite.role === 'admin' ? 'Admin' : 'Customer'} registration. Create a ${role === 'admin' ? 'Admin' : 'Customer'} invite instead.`;
  }
  const expiresAt = Number(invite.expiresAt);
  if (!Number.isFinite(expiresAt)) return 'This invite has no valid expiry date. Create a fresh invite from Admin Dashboard → Invites.';
  if (expiresAt <= Date.now()) return 'This invite has expired. Create a fresh invite from Admin Dashboard → Invites.';
  if (invite.usedAt && (!uid || invite.usedBy !== uid)) return 'This invite has already been used. Create a fresh invite from Admin Dashboard → Invites.';
  return null;
}

async function hasExistingAdmin(auth) {
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    if (page.users.some((user) => user.customClaims?.admin === true)) return true;
    pageToken = page.pageToken;
  } while (pageToken);
  return false;
}

async function completeInviteForUser(auth, database, user, { code, role, username }) {
  if (role === 'admin' && !user.emailVerified) {
    const error = new Error('Verify this admin account email using the Firebase link before completing registration.');
    error.statusCode = 403;
    throw error;
  }

  const inviteRef = database.ref(`registrationInvites/${hashCode(code)}`);
  const checkedAt = Date.now();
  const result = await inviteRef.transaction((invite) => {
    // Preserve an initial empty local snapshot so RTDB can retry with the server value.
    if (invite == null) return null;
    if (invite.role !== role || Number(invite.expiresAt) <= checkedAt) return;
    if (invite.usedAt && invite.usedBy !== user.uid) return;
    return { ...invite, usedAt: invite.usedAt || checkedAt, usedBy: user.uid };
  });
  let invite = result.committed && result.snapshot.exists() ? result.snapshot.val() : null;
  if (!invite) {
    const currentInvite = (await inviteRef.once('value')).val();
    if (
      currentInvite
      && currentInvite.role === role
      && Number(currentInvite.expiresAt) > checkedAt
      && currentInvite.usedAt
      && currentInvite.usedBy === user.uid
    ) {
      invite = currentInvite;
    } else {
      const error = new Error(inviteUnavailableMessage(currentInvite, role, user.uid) || 'The invite could not be claimed because its status changed during registration. Create a fresh invite and try again.');
      error.statusCode = 400;
      throw error;
    }
  }

  const roleName = role === 'admin' ? 'admin' : 'user';
  const profile = {
    uid: user.uid,
    name: username.trim(),
    username: username.trim(),
    email: user.email || '',
    role: roleName,
    adminUid: invite.createdBy,
    createdAt: invite.createdAt,
  };
  const profileUpdates = {};
  profileUpdates[`users/${user.uid}`] = profile;
  profileUpdates[`adminUsers/${invite.createdBy}/${user.uid}`] = profile;
  await database.ref().update(profileUpdates);

  if (role === 'admin') {
    const account = await auth.getUser(user.uid);
    await auth.setCustomUserClaims(user.uid, { ...account.customClaims, admin: true });
  }

  return { role: roleName, adminUid: invite.createdBy };
}

router.post('/bootstrap/first-admin/check', async (req, res, next) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const configuredEmail = process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) {
    return res.status(503).json({ success: false, message: 'First-admin setup is not configured. Set FIRST_ADMIN_EMAIL in server/.env and restart the server.' });
  }
  if (!email || email !== configuredEmail) {
    return res.status(403).json({ success: false, message: 'First-admin registration is limited to the email configured by the project owner.' });
  }

  try {
    const { auth, database } = getFirebaseServices();
    const bootstrap = await database.ref('system/firstAdminUid').once('value');
    if (bootstrap.exists() || await hasExistingAdmin(auth)) {
      return res.status(409).json({ success: false, message: 'First-admin setup is already complete. Use an admin invite to register another administrator.' });
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/bootstrap/first-admin', async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const { username } = req.body || {};
  if (!match) return res.status(401).json({ success: false, message: 'Sign in and verify your email before continuing.' });
  if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 80) {
    return res.status(400).json({ success: false, message: 'Enter a valid username.' });
  }

  try {
    const { auth, database } = getFirebaseServices();
    let user;
    try {
      user = await auth.verifyIdToken(match[1], true);
    } catch {
      return res.status(401).json({ success: false, message: 'Your sign-in could not be verified. Sign in again and retry.' });
    }
    const configuredEmail = process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();
    if (!configuredEmail) {
      return res.status(503).json({ success: false, message: 'First-admin setup is not configured. Set FIRST_ADMIN_EMAIL in server/.env and restart the server.' });
    }
    if (!user.email_verified || user.email?.trim().toLowerCase() !== configuredEmail) {
      return res.status(403).json({ success: false, message: 'Verify the configured first-admin email address before continuing.' });
    }
    if (await hasExistingAdmin(auth) && user.admin !== true) {
      return res.status(409).json({ success: false, message: 'An administrator already exists. Use an admin invite to register another administrator.' });
    }

    const bootstrapRef = database.ref('system/firstAdminUid');
    const reservation = await bootstrapRef.transaction((currentUid) => {
      if (currentUid === user.uid) return currentUid;
      if (currentUid) return;
      return user.uid;
    });
    if (!reservation.committed || reservation.snapshot.val() !== user.uid) {
      return res.status(409).json({ success: false, message: 'First-admin setup has already been claimed. Ask the project owner for an admin invite.' });
    }

    const profile = {
      uid: user.uid,
      name: username.trim(),
      username: username.trim(),
      email: user.email,
      role: 'admin',
      adminUid: user.uid,
      createdAt: Date.now(),
    };
    const updates = {};
    updates[`users/${user.uid}`] = profile;
    updates[`adminUsers/${user.uid}/${user.uid}`] = profile;
    await database.ref().update(updates);

    const account = await auth.getUser(user.uid);
    await auth.setCustomUserClaims(user.uid, { ...account.customClaims, admin: true });
    return res.status(201).json({ success: true, role: 'admin' });
  } catch (error) {
    return next(error);
  }
});

router.post('/invites', requireAdmin, async (req, res, next) => {
  const { role } = req.body || {};
  if (!['customer', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Choose a customer or admin invite.' });
  }

  try {
    const { database } = getFirebaseServices();
    const code = crypto.randomBytes(32).toString('base64url');
    const createdAt = Date.now();
    const expiresAt = createdAt + inviteLifetimeMs;
    const inviteRef = database.ref(`registrationInvites/${hashCode(code)}`);
    await inviteRef.set({
      role,
      createdBy: req.adminUser.uid,
      createdAt,
      expiresAt,
      usedAt: null,
    });
    return res.status(201).json({
      success: true,
      invite: {
        code,
        role,
        createdAt,
        expiresAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/registrations/check-invite', async (req, res, next) => {
  const { role } = req.body || {};
  const code = normalizeInviteCode(req.body?.code);
  if (code.length < 20 || code.length > 100 || !['customer', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Enter a valid administrator invite code for this account type.' });
  }

  try {
    const { database } = getFirebaseServices();
    const snapshot = await database.ref(`registrationInvites/${hashCode(code)}`).once('value');
    const invite = snapshot.val();
    const unavailableMessage = inviteUnavailableMessage(invite, role);
    if (unavailableMessage) {
      return res.status(400).json({ success: false, message: unavailableMessage });
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/registrations/complete-verified-admin-invite', async (req, res, next) => {
  const { email, username } = req.body || {};
  const code = normalizeInviteCode(req.body?.code);
  if (code.length < 20 || code.length > 100) {
    return res.status(400).json({ success: false, message: 'The admin invite link is missing or invalid. Ask the admin for a new invite.' });
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ success: false, message: 'The verified email address in the invite link is invalid.' });
  }
  if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 80) {
    return res.status(400).json({ success: false, message: 'The admin username in the invite link is invalid.' });
  }

  try {
    const { auth, database } = getFirebaseServices();
    let user;
    try {
      user = await auth.getUserByEmail(email.trim());
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({ success: false, message: 'The Firebase account for this admin invite was not found. Start admin registration again.' });
      }
      throw error;
    }
    if (!user.emailVerified) {
      return res.status(403).json({ success: false, message: 'Firebase has not verified this email yet. Open the verification link again, then retry.' });
    }

    const completed = await completeInviteForUser(auth, database, user, { code, role: 'admin', username });
    return res.status(201).json({ success: true, ...completed });
  } catch (error) {
    return next(error);
  }
});

router.post('/registrations/complete', async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const { role, username } = req.body || {};
  const code = normalizeInviteCode(req.body?.code);
  if (!match) return res.status(401).json({ success: false, message: 'Sign in again to finish registration.' });
  if (typeof code !== 'string' || code.length < 20 || code.length > 100) {
    return res.status(400).json({ success: false, message: 'A valid administrator invite code is required.' });
  }
  if (!['customer', 'admin'].includes(role) || typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 80) {
    return res.status(400).json({ success: false, message: 'Enter a valid username and registration type.' });
  }

  try {
    const { auth, database } = getFirebaseServices();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(match[1]);
    } catch {
      return res.status(401).json({ success: false, message: 'Your sign-in could not be verified. Sign in again and retry.' });
    }
    const user = await auth.getUser(decodedToken.uid);
    const completed = await completeInviteForUser(auth, database, user, { code, role, username });
    return res.status(201).json({ success: true, ...completed });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
