import API_BASE_URL from './api';
import { auth } from './firebase';

export async function createRegistrationInvite(role) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in as an administrator before creating an invite.');

  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/invites`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Could not create the registration invite.');
  return result.invite;
}
