import {
  createUserWithEmailAndPassword,
  deleteUser,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, firebaseConfigError } from './firebase';
import API_BASE_URL from './api';

function requireAuth() {
  if (!auth) {
    throw firebaseConfigError;
  }

  return auth;
}

export function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(requireAuth(), email, password);
}

export function normalizeRegistrationInvite(value) {
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

async function postRegistrationRequest(path, body, user = null) {
  const token = user ? await user.getIdToken(path === 'bootstrap/first-admin') : '';
  const response = await fetch(`${API_BASE_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Registration could not be completed.');
  return result;
}

export function checkFirstAdminRegistration(email) {
  return postRegistrationRequest('bootstrap/first-admin/check', { email });
}

export function checkRegistrationInvite(code, role) {
  return postRegistrationRequest('registrations/check-invite', { code: normalizeRegistrationInvite(code), role });
}

export function completeFirstAdminRegistration(user, username) {
  return postRegistrationRequest('bootstrap/first-admin', { username }, user);
}

export function completeVerifiedAdminInvite({ code, email, username }) {
  return postRegistrationRequest('registrations/complete-verified-admin-invite', {
    code: normalizeRegistrationInvite(code),
    email,
    username,
  });
}

export async function completeInviteRegistration(user, { code, role, username, cleanupOnFailure = true }) {
  try {
    return await postRegistrationRequest('registrations/complete', { code: normalizeRegistrationInvite(code), role, username }, user);
  } catch (error) {
    if (cleanupOnFailure) {
      try {
        await deleteUser(user);
      } catch {
        throw new Error(`${error.message} The temporary Firebase Auth account could not be removed; contact an administrator to clean it up.`);
      }
    }
    throw error;
  }
}

export function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(requireAuth(), email, password);
}

export function logout() {
  return signOut(requireAuth());
}

export async function hasAdminClaim(user, forceRefresh = false) {
  if (!user) return false;

  const tokenResult = await getIdTokenResult(user, forceRefresh);
  return tokenResult.claims.admin === true;
}

export function observeAuthState(onUserChanged, onError = () => {}) {
  if (!auth) {
    onUserChanged(null);
    onError(firebaseConfigError);
    return () => {};
  }

  return onAuthStateChanged(auth, onUserChanged, onError);
}