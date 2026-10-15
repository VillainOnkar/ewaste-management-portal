import { get, onValue, push, ref, remove, serverTimestamp, set, update } from 'firebase/database';
import { auth, database, firebaseConfigError } from './firebase';
import API_BASE_URL from './api';

function requireDatabase() {
  if (!database) {
    throw firebaseConfigError;
  }

  return database;
}

export async function createRecord(path, data) {
  const recordRef = push(ref(requireDatabase(), path));
  await set(recordRef, { ...data, createdAt: serverTimestamp() });
  return recordRef.key;
}

export async function readRecord(path) {
  const snapshot = await get(ref(requireDatabase(), path));
  return snapshot.exists() ? snapshot.val() : null;
}

async function authenticatedApiRequest(path, method, body) {
  const authenticatedUser = auth?.currentUser;
  if (!authenticatedUser) {
    throw new Error('Sign in again before deleting this record.');
  }

  const token = await authenticatedUser.getIdToken();
  const response = await fetch(`${API_BASE_URL}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseText = await response.text();
  let result;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(response.status === 404
      ? 'The delivery service is not updated yet. Restart the server and refresh the page.'
      : `The server returned an unexpected response (HTTP ${response.status}). Restart the server and try again.`);
  }
  if (!response.ok) {
    throw new Error(result.message || 'The record could not be deleted.');
  }
  return result;
}

export async function deleteCustomerAccount(uid) {
  return authenticatedApiRequest(`admin/users/${encodeURIComponent(uid)}`, 'DELETE');
}

export async function deleteCustomerPickupRequest(requestId) {
  return authenticatedApiRequest(`customer/pickup-requests/${encodeURIComponent(requestId)}`, 'DELETE');
}

export function subscribeToPickupData(uid, onData, onError) {
  const db = requireDatabase();
  let requests;
  let preferences;
  const publishIfReady = () => {
    if (requests !== undefined && preferences !== undefined) {
      onData({ requests, preferences });
    }
  };
  const unsubscribeRequests = onValue(
    ref(db, `pickupRequests/${uid}`),
    (snapshot) => {
      requests = snapshot.exists() ? snapshot.val() : null;
      publishIfReady();
    },
    onError,
  );
  const unsubscribePreferences = onValue(
    ref(db, `pickupPreferences/${uid}`),
    (snapshot) => {
      preferences = snapshot.exists() ? snapshot.val() : {};
      publishIfReady();
    },
    onError,
  );

  return () => {
    unsubscribeRequests();
    unsubscribePreferences();
  };
}

export function subscribeToAssignedData(adminUid, onData, onError) {
  const db = requireDatabase();
  const requestUnsubscribers = new Map();
  const requests = {};
  let profiles = {};

  const unsubscribeProfiles = onValue(
    ref(db, `adminUsers/${adminUid}`),
    (snapshot) => {
      profiles = snapshot.exists() ? snapshot.val() : {};
      const profileUids = new Set(Object.keys(profiles));

      for (const [uid, unsubscribe] of requestUnsubscribers) {
        if (!profileUids.has(uid)) {
          unsubscribe();
          requestUnsubscribers.delete(uid);
          delete requests[uid];
        }
      }

      onData({ profiles, requests: { ...requests } });

      for (const uid of profileUids) {
        if (requestUnsubscribers.has(uid)) continue;
        const unsubscribe = onValue(
          ref(db, `pickupRequests/${uid}`),
          (requestSnapshot) => {
            if (!Object.prototype.hasOwnProperty.call(profiles, uid)) return;
            if (requestSnapshot.exists()) requests[uid] = requestSnapshot.val();
            else delete requests[uid];
            onData({ profiles, requests: { ...requests } });
          },
          onError,
        );
        requestUnsubscribers.set(uid, unsubscribe);
      }
    },
    onError,
  );

  const authenticatedAdmin = auth?.currentUser;
  if (!authenticatedAdmin || authenticatedAdmin.uid !== adminUid) {
    onError(new Error('Sign in with the administrator account to sync assigned customers.'));
  } else {
    authenticatedAdmin.getIdToken()
      .then((token) => fetch(`${API_BASE_URL}/admin/sync-assigned-users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }))
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || 'Could not sync assigned customer records.');
        }
      })
      .catch(onError);
  }

  return () => {
    unsubscribeProfiles();
    for (const unsubscribe of requestUnsubscribers.values()) unsubscribe();
    requestUnsubscribers.clear();
  };
}

export async function updateRecord(path, updates) {
  await update(ref(requireDatabase(), path), updates);
}

export async function updatePickupRequest(uid, requestId, updates) {
  await update(ref(requireDatabase(), `pickupRequests/${uid}/${requestId}`), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function submitPickupOffer(request, price) {
  const authenticatedUser = auth?.currentUser;
  if (!authenticatedUser) {
    throw new Error('Sign in before submitting your price.');
  }
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(price * 100)) {
    throw new Error('Enter a valid price with no more than two decimal places.');
  }

  const token = await authenticatedUser.getIdToken();
  const response = await fetch(`${API_BASE_URL}/customer/resubmit-offer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId: request.requestId,
      price,
      itemDetails: request.itemDetails,
      pickupDetails: request.pickupDetails,
      createdAt: request.createdAt,
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Your price could not be submitted.');
  }
  return result;
}

export async function savePickupPreference(uid, requestId, preference) {
  const authenticatedUser = auth?.currentUser;
  if (!authenticatedUser || authenticatedUser.uid !== uid) {
    throw new Error('Sign in to choose a delivery option for your pickup.');
  }

  const preferenceRef = ref(requireDatabase(), `pickupPreferences/${uid}/${requestId}`);
  if (preference === '') {
    await remove(preferenceRef);
    return;
  }
  if (preference !== 'self_dropoff' && preference !== 'arranged_pickup') {
    throw new Error('Choose a valid delivery option.');
  }
  await set(preferenceRef, preference);
}

export async function submitDeliveryOption(requestId, deliveryOption) {
  return authenticatedApiRequest('customer/delivery-option', 'POST', { requestId, deliveryOption });
}

export async function createPickupRequest(booking) {
  const authenticatedUser = auth?.currentUser;
  if (!authenticatedUser) {
    throw new Error('Sign in before submitting a pickup request.');
  }

  if (!Number.isFinite(booking.offerPrice) || booking.offerPrice < 0 || !Number.isSafeInteger(booking.offerPrice * 100)) {
    throw new Error('Enter a valid price with no more than two decimal places.');
  }

  const token = await authenticatedUser.getIdToken();
  const response = await fetch(`${API_BASE_URL}/customer/create-pickup-request`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(booking),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Your pickup request could not be saved.');
  }
  if (!result.requestId) {
    throw new Error('The server saved the request but did not return its ID. Check your pickup history before retrying.');
  }
  return result.requestId;
}