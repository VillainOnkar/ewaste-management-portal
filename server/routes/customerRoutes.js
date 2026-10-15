const express = require('express');
const { getFirebaseServices } = require('../services/firebaseAdmin');

const router = express.Router();

async function getUsedCustomerInvite(database, uid) {
  const snapshot = await database.ref('registrationInvites').once('value');
  const invites = snapshot.val() || {};
  return Object.values(invites).find((invite) =>
    invite
    && invite.role === 'customer'
    && invite.usedBy === uid
    && typeof invite.createdBy === 'string'
    && invite.createdBy,
  ) || null;
}

async function resolveCustomerProfile(auth, database, uid) {
  const profileSnapshot = await database.ref(`users/${uid}`).once('value');
  const currentProfile = profileSnapshot.val() || {};
  const roleIsCustomer = currentProfile.role === 'user' || currentProfile.role === 'customer';
  let adminUid = roleIsCustomer && typeof currentProfile.adminUid === 'string' ? currentProfile.adminUid : '';

  if (!adminUid || !roleIsCustomer) {
    const invite = await getUsedCustomerInvite(database, uid);
    if (invite) adminUid = invite.createdBy;
    if (!adminUid) return null;
  }

  const authUser = await auth.getUser(uid);
  const username = currentProfile.username
    || currentProfile.name
    || authUser.displayName
    || authUser.email?.split('@')[0]
    || 'Customer';
  return {
    ...currentProfile,
    uid,
    name: username,
    username,
    email: currentProfile.email || authUser.email || '',
    role: 'user',
    adminUid,
    createdAt: currentProfile.createdAt || Date.now(),
  };
}

function addCustomerProfileUpdates(updates, profile) {
  updates[`users/${profile.uid}`] = profile;
  updates[`adminUsers/${profile.adminUid}/${profile.uid}`] = profile;
}

async function createReplacementOffer(database, uid, profile, { requestId, price, itemDetails, pickupDetails, createdAt }) {
  if (!isValidPickupBooking({ itemDetails, pickupDetails, offerPrice: price })) {
    return null;
  }

  const replacementRef = database.ref(`pickupRequests/${uid}`).push();
  const replacementRequestId = replacementRef.key;
  if (!replacementRequestId) {
    throw new Error('Could not generate a new pickup request ID.');
  }
  const timestamp = Date.now();
  const replacementRequest = {
    uid,
    requestId: replacementRequestId,
    itemDetails,
    pickupDetails,
    offerPrice: price,
    status: 'Pending',
    createdAt: Number.isFinite(Number(createdAt)) ? Number(createdAt) : timestamp,
    updatedAt: timestamp,
    resubmittedFromRequestId: requestId,
  };
  const updates = {};
  updates[`pickupRequests/${uid}/${replacementRequestId}`] = replacementRequest;
  addCustomerProfileUpdates(updates, profile);
  await database.ref().update(updates);
  return replacementRequestId;
}

function isValidPickupBooking(booking) {
  const item = booking?.itemDetails;
  const pickup = booking?.pickupDetails;
  const price = booking?.offerPrice;
  return Boolean(
    item
    && typeof item.category === 'string'
    && typeof item.name === 'string'
    && item.name.trim().length >= 2
    && Number.isInteger(item.quantity)
    && item.quantity >= 1
    && Number.isFinite(item.approxWeightKg)
    && item.approxWeightKg > 0
    && typeof item.condition === 'string'
    && pickup
    && typeof pickup.address === 'string'
    && pickup.address.trim().length >= 5
    && typeof pickup.city === 'string'
    && pickup.city.trim().length >= 2
    && typeof pickup.pinCode === 'string'
    && /^\d{4,10}$/.test(pickup.pinCode)
    && typeof pickup.contactMobile === 'string'
    && /^\d{7,15}$/.test(pickup.contactMobile.replace(/\D/g, ''))
    && typeof pickup.preferredDate === 'string'
    && Number.isFinite(price)
    && price >= 0
    && Number.isSafeInteger(price * 100),
  );
}

router.post('/customer/create-pickup-request', async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Sign in before submitting a pickup request.' });
  }
  if (!isValidPickupBooking(req.body)) {
    return res.status(400).json({ success: false, message: 'Check your pickup details and price offer, then try again.' });
  }

  try {
    const { auth, database } = getFirebaseServices();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(match[1]);
    } catch {
      return res.status(401).json({ success: false, message: 'Your sign-in could not be verified. Sign in again and retry.' });
    }
    if (decodedToken.admin === true) {
      return res.status(403).json({ success: false, message: 'Sign in with your customer account to book a pickup.' });
    }

    const profile = await resolveCustomerProfile(auth, database, decodedToken.uid);
    if (!profile) {
      return res.status(409).json({ success: false, message: 'This customer account is not linked to an administrator. Register with a valid customer invite from your administrator before booking.' });
    }

    const requestRef = database.ref(`pickupRequests/${decodedToken.uid}`).push();
    const requestId = requestRef.key;
    if (!requestId) {
      throw new Error('Could not generate a pickup request ID.');
    }
    const createdAt = Date.now();
    const request = {
      uid: decodedToken.uid,
      requestId,
      itemDetails: req.body.itemDetails,
      pickupDetails: req.body.pickupDetails,
      offerPrice: req.body.offerPrice,
      status: 'Pending',
      createdAt,
    };
    const updates = {};
    updates[`pickupRequests/${decodedToken.uid}/${requestId}`] = request;
    addCustomerProfileUpdates(updates, profile);
    await database.ref().update(updates);

    return res.status(201).json({ success: true, requestId, status: request.status });
  } catch (error) {
    return next(error);
  }
});

router.post('/customer/resubmit-offer', async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const { requestId, price, itemDetails, pickupDetails, createdAt } = req.body || {};

  if (!match) {
    return res.status(401).json({ success: false, message: 'Sign in to submit your price.' });
  }
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) {
    return res.status(400).json({ success: false, message: 'This pickup request ID is invalid.' });
  }
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(price * 100)) {
    return res.status(400).json({ success: false, message: 'Enter a valid price with no more than two decimal places.' });
  }

  try {
    const { auth, database } = getFirebaseServices();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(match[1]);
    } catch {
      return res.status(401).json({ success: false, message: 'Your sign-in could not be verified. Sign in again and retry.' });
    }
    if (decodedToken.admin === true) {
      return res.status(403).json({ success: false, message: 'Only the customer who created this request can submit a price.' });
    }

    const profile = await resolveCustomerProfile(auth, database, decodedToken.uid);
    if (!profile) {
      return res.status(409).json({ success: false, message: 'This customer account is not linked to an administrator. Contact your administrator to restore the customer invite link.' });
    }

    const customerRequestsRef = database.ref(`pickupRequests/${decodedToken.uid}`);
    const directRequestRef = customerRequestsRef.child(requestId);
    let requestRef = directRequestRef;
    let requestSnapshot = await directRequestRef.once('value');
    if (!requestSnapshot.exists()) {
      const customerRequestsSnapshot = await customerRequestsRef.once('value');
      const existingRequests = customerRequestsSnapshot.val() || {};
      const matchingRequest = Object.entries(existingRequests).find(([key, request]) =>
        request
        && typeof request === 'object'
        && (key === requestId || request.requestId === requestId),
      );
      if (matchingRequest) {
        requestRef = customerRequestsRef.child(matchingRequest[0]);
        requestSnapshot = await requestRef.once('value');
      }
    }

    if (!requestSnapshot.exists()) {
      const replacementRequestId = await createReplacementOffer(database, decodedToken.uid, profile, {
        requestId,
        price,
        itemDetails,
        pickupDetails,
        createdAt,
      });
      if (!replacementRequestId) {
        return res.status(409).json({
          success: false,
          message: 'This older request is missing from the database and cannot be restored because its item or pickup details are incomplete. Delete this history entry and book the pickup again.',
        });
      }

      return res.json({
        success: true,
        status: 'Pending',
        offerPrice: price,
        requestId: replacementRequestId,
        replacedRequestId: requestId,
      });
    }

    const result = await requestRef.transaction((request) => {
      const currentStatus = String(request?.status || '').trim().toLowerCase();
      if (!request || !['pending', 'rejected'].includes(currentStatus)) return;
      return {
        ...request,
        offerPrice: price,
        status: 'Pending',
        rejectionNote: null,
        updatedAt: Date.now(),
      };
    });

    if (!result.committed) {
      const currentRequest = result.snapshot.val();
      const currentStatus = String(currentRequest?.status || 'missing').trim();
      if (currentStatus.toLowerCase() === 'missing') {
        const replacementRequestId = await createReplacementOffer(database, decodedToken.uid, profile, {
        requestId,
        price,
        itemDetails: itemDetails || currentRequest?.itemDetails || requestSnapshot.val()?.itemDetails,
        pickupDetails: pickupDetails || currentRequest?.pickupDetails || requestSnapshot.val()?.pickupDetails,
        createdAt: createdAt || currentRequest?.createdAt || requestSnapshot.val()?.createdAt,
        });
        if (replacementRequestId) {
        return res.json({
          success: true,
          status: 'Pending',
          offerPrice: price,
          requestId: replacementRequestId,
          replacedRequestId: requestId,
        });
        }
      }
      return res.status(409).json({
        success: false,
        status: currentStatus,
        message: `This request is currently ${currentStatus} and could not be resubmitted. Refresh your pickup history to see its latest status.`,
      });
    }

    const updates = {};
    addCustomerProfileUpdates(updates, profile);
    await database.ref().update(updates);
    return res.json({
      success: true,
      status: 'Pending',
      offerPrice: price,
      requestId: requestRef.key,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/customer/delivery-option', async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const { requestId, deliveryOption } = req.body || {};

  if (!match) {
    return res.status(401).json({ success: false, message: 'Sign in to choose a delivery option.' });
  }
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) {
    return res.status(400).json({ success: false, message: 'This pickup request ID is invalid.' });
  }
  if (!['self_dropoff', 'arranged_pickup'].includes(deliveryOption)) {
    return res.status(400).json({ success: false, message: 'Choose whether you will deliver the item or need an arranged pickup.' });
  }

  try {
    const { auth, database } = getFirebaseServices();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(match[1]);
    } catch {
      return res.status(401).json({ success: false, message: 'Your sign-in could not be verified. Sign in again and retry.' });
    }
    if (decodedToken.admin === true) {
      return res.status(403).json({ success: false, message: 'Sign in with your customer account to choose a delivery option.' });
    }

    const customerRequestsRef = database.ref(`pickupRequests/${decodedToken.uid}`);
    let requestRef = customerRequestsRef.child(requestId);
    let existingRequestSnapshot = await requestRef.once('value');
    if (!existingRequestSnapshot.exists()) {
      const requestsSnapshot = await customerRequestsRef.once('value');
      const matchingRequest = Object.entries(requestsSnapshot.val() || {}).find(([key, request]) =>
        request
        && typeof request === 'object'
        && (key === requestId || request.requestId === requestId),
      );
      if (matchingRequest) {
        requestRef = customerRequestsRef.child(matchingRequest[0]);
        existingRequestSnapshot = await requestRef.once('value');
      }
    }
    if (!existingRequestSnapshot.exists()) {
      return res.status(404).json({
        success: false,
        message: 'This pickup request is no longer in your account. Refresh your pickup history and submit a new pickup request.',
      });
    }

    const result = await requestRef.transaction((request) => {
      if (!request || String(request.status || '').trim().toLowerCase() !== 'approved') return;
      return {
        ...request,
        deliveryOption,
        deliveryStatus: 'awaiting_admin',
        collectionDate: null,
        updatedAt: Date.now(),
      };
    });

    if (!result.committed) {
      const latestRequestSnapshot = await requestRef.once('value');
      const latestRequest = latestRequestSnapshot.val();
      if (!latestRequestSnapshot.exists()) {
        return res.status(404).json({
          success: false,
          message: 'This pickup request is no longer in your account. Refresh your pickup history and submit a new pickup request.',
        });
      }
      const currentStatus = String(latestRequest?.status || 'unknown').trim();
      if (currentStatus.toLowerCase() !== 'approved') {
        return res.status(409).json({
          success: false,
          status: currentStatus,
          message: `Your delivery choice can only be sent after admin acceptance. The latest request status is ${currentStatus}. Refresh your pickup history and try again.`,
        });
      }

      await requestRef.update({
        deliveryOption,
        deliveryStatus: 'awaiting_admin',
        collectionDate: null,
        updatedAt: Date.now(),
      });
    }
    return res.json({ success: true, deliveryOption, deliveryStatus: 'awaiting_admin' });
  } catch (error) {
    return next(error);
  }
});

router.delete('/customer/pickup-requests/:requestId', async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const { requestId } = req.params;
  if (!match) {
    return res.status(401).json({ success: false, message: 'Sign in to delete your pickup request.' });
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) {
    return res.status(400).json({ success: false, message: 'This pickup request ID is invalid.' });
  }

  try {
    const { auth, database } = getFirebaseServices();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(match[1]);
    } catch {
      return res.status(401).json({ success: false, message: 'Your sign-in could not be verified. Sign in again and retry.' });
    }
    if (decodedToken.admin === true) {
      return res.status(403).json({ success: false, message: 'Sign in with your customer account to delete a pickup request.' });
    }

    const requestRef = database.ref(`pickupRequests/${decodedToken.uid}/${requestId}`);
    const requestSnapshot = await requestRef.once('value');
    if (!requestSnapshot.exists()) {
      return res.status(404).json({ success: false, message: 'This pickup request was not found or has already been deleted.' });
    }

    const updates = {};
    updates[`pickupRequests/${decodedToken.uid}/${requestId}`] = null;
    updates[`pickupPreferences/${decodedToken.uid}/${requestId}`] = null;
    await database.ref().update(updates);
    return res.json({ success: true, requestId });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
