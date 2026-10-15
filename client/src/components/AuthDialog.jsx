import { useState } from 'react';
import { deleteUser, reload, sendEmailVerification } from 'firebase/auth';
import { isFirebaseConfigured } from '../services/firebase';
import { auth } from '../services/firebase';
import { readRecord } from '../services/databaseService';
import { checkFirstAdminRegistration, checkRegistrationInvite, completeFirstAdminRegistration, completeInviteRegistration, hasAdminClaim, loginWithEmail, logout, normalizeRegistrationInvite, registerWithEmail } from '../services/authService';

const friendlyAuthErrors = {
  'auth/email-already-in-use': 'An account already exists with this email. Try signing in instead.',
  'auth/invalid-credential': 'That email and password combination was not recognized.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/invalid-api-key': 'Firebase rejected the Web API key. Copy the API key from Firebase Console > Project settings > Your apps.',
  'auth/operation-not-allowed': 'Email/Password sign-in is disabled. Enable it in Firebase Console > Authentication > Sign-in method.',
  'auth/too-many-requests': 'There have been too many attempts. Wait a little and try again.',
  'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
  'auth/network-request-failed': 'Connection problem. Check your internet and try again.',
};

function AuthDialog({ initialMode, accountType = 'customer', inviteCode = '', allowRegistration = true, onClose, onAuthenticated }) {
  const [mode, setMode] = useState(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registrationCode, setRegistrationCode] = useState(inviteCode);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [resendNeedsPassword, setResendNeedsPassword] = useState(false);
  const [deleteAccountOnInviteFailure, setDeleteAccountOnInviteFailure] = useState(true);
  const normalizedInviteCode = normalizeRegistrationInvite(registrationCode);
  const isFirstAdminRegistration = mode === 'register' && accountType === 'admin' && !normalizedInviteCode;
  const requiresAdminEmailVerification = mode === 'register' && accountType === 'admin';

  const getVerificationActionCodeSettings = (userEmail) => {
    if (!normalizedInviteCode) return undefined;
    const continueUrl = new URL(window.location.origin);
    continueUrl.searchParams.set('completeAdminInvite', '1');
    continueUrl.searchParams.set('invite', normalizedInviteCode);
    continueUrl.searchParams.set('role', 'admin');
    continueUrl.searchParams.set('email', userEmail);
    continueUrl.searchParams.set('username', fullName.trim());
    return { url: continueUrl.toString() };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (fullName.trim().length < 2) {
          throw new Error('Enter a username with at least 2 characters.');
        }
        if (password !== confirmPassword) {
          throw new Error('Your passwords do not match.');
        }
        if (isFirstAdminRegistration) {
          await checkFirstAdminRegistration(email.trim());
        } else if (!normalizedInviteCode) {
          throw new Error('Enter the invite code from your administrator.');
        } else {
          await checkRegistrationInvite(normalizedInviteCode, accountType);
        }
        let credential;
        let isNewAccount = false;
        try {
          credential = await registerWithEmail(email.trim(), password);
          isNewAccount = true;
        } catch (registrationError) {
          if (accountType !== 'admin' || registrationError.code !== 'auth/email-already-in-use') {
            throw registrationError;
          }
          credential = await loginWithEmail(email.trim(), password);
        }
        setDeleteAccountOnInviteFailure(isNewAccount);
        if (requiresAdminEmailVerification) {
          await reload(credential.user);
          if (credential.user.emailVerified) {
            if (isFirstAdminRegistration) {
              await completeFirstAdminRegistration(credential.user, fullName);
            } else {
              await completeInviteRegistration(credential.user, {
                code: normalizedInviteCode,
                role: accountType,
                username: fullName,
                cleanupOnFailure: isNewAccount,
              });
            }
            await credential.user.getIdToken(true);
            onAuthenticated('admin');
            return;
          }
          try {
            await sendEmailVerification(
              credential.user,
              getVerificationActionCodeSettings(credential.user.email || email.trim()),
            );
          } catch (verificationError) {
            if (isNewAccount) {
              try {
                await deleteUser(credential.user);
              } catch {
                throw new Error(`${verificationError.message} The unverified Firebase account could not be removed; contact the project owner.`);
              }
            }
            throw verificationError;
          }
          setVerificationMessage(normalizedInviteCode
            ? `A Firebase verification link was sent to ${email}. Open it on your phone or computer; the admin invite will be completed automatically.`
            : `A Firebase verification link was sent to ${email}. Open it, return here, then confirm to activate this first admin account.`);
          setVerificationPending(true);
          return;
        }
        await completeInviteRegistration(credential.user, {
          code: normalizedInviteCode,
          role: accountType,
          username: fullName,
        });
      } else {
        const credential = await loginWithEmail(email.trim(), password);
        try {
          let isAdmin = await hasAdminClaim(credential.user, true);
          if (accountType === 'admin' && !isAdmin && credential.user.emailVerified) {
            const fallbackName = credential.user.displayName || credential.user.email?.split('@')[0] || 'Admin';
            await completeFirstAdminRegistration(credential.user, fallbackName);
            await credential.user.getIdToken(true);
            isAdmin = await hasAdminClaim(credential.user, true);
          }
          if (accountType === 'admin' && !isAdmin) {
            throw new Error('This account is not registered as an administrator. Use Customer Login or ask an existing admin for an invite.');
          }
          if (accountType === 'customer' && isAdmin) {
            throw new Error('This is an administrator account. Please choose Admin Login.');
          }
          if (accountType === 'customer') {
            const profile = await readRecord(`users/${credential.user.uid}`);
            if (!profile || profile.role !== 'user') {
              throw new Error('This customer account has been deleted or is not registered. Ask your administrator for a new customer invite.');
            }
          }
        } catch (roleError) {
          await logout();
          throw roleError;
        }
      }
      onAuthenticated(accountType);
    } catch (authError) {
      setError(friendlyAuthErrors[authError.code] || authError.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const confirmFirstAdminEmail = async () => {
    setError('');
    setLoading(true);
    try {
      const user = auth?.currentUser;
      if (!user) throw new Error('Sign in again with the first-admin email to complete setup.');
      await reload(user);
      if (!user.emailVerified) {
        throw new Error('Email verification is not confirmed yet. Open the Firebase verification email link, then try again.');
      }
      await user.getIdToken(true);
      if (isFirstAdminRegistration) {
        await completeFirstAdminRegistration(user, fullName);
      } else {
        await completeInviteRegistration(user, {
          code: normalizedInviteCode,
          role: accountType,
          username: fullName,
          cleanupOnFailure: deleteAccountOnInviteFailure,
        });
      }
      await user.getIdToken(true);
      onAuthenticated(accountType);
    } catch (bootstrapError) {
      setError(bootstrapError.message || 'Could not complete first-admin setup.');
    } finally {
      setLoading(false);
    }
  };

  const resendVerificationEmail = async () => {
    setError('');
    setVerificationMessage('');
    setLoading(true);
    try {
      let user = auth?.currentUser;
      if (user && user.email?.toLowerCase() !== email.trim().toLowerCase()) {
        throw new Error('A different account is signed in. Sign out, then retry with the email used for this admin registration.');
      }
      if (!user) {
        if (!password) {
          setResendNeedsPassword(true);
          throw new Error('Enter the same password you used during admin registration to resend the verification link.');
        }
        user = (await loginWithEmail(email.trim(), password)).user;
      }
      await reload(user);
      if (user.emailVerified) {
        setVerificationMessage('Email verified. Select “I verified my email” to finish admin setup.');
        return;
      }
      await sendEmailVerification(user, getVerificationActionCodeSettings(user.email || email.trim()));
      setVerificationMessage(`A new verification link was sent to ${email}. Check your inbox and spam folder.`);
    } catch (verificationError) {
      if (verificationError.code === 'auth/invalid-credential') {
        setResendNeedsPassword(true);
      }
      setError(friendlyAuthErrors[verificationError.code] || verificationError.message || 'Could not resend the verification email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" type="button" aria-label="Close sign-in dialog" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <p className="eyebrow"><span className="eyebrow-dot" />{accountType === 'admin' ? 'GreenLoop administration' : 'GreenLoop account'}</p>
        <h2 id="auth-title">{mode === 'register' ? `${accountType === 'admin' ? 'Admin' : 'Customer'} registration` : accountType === 'admin' ? 'Admin sign in' : 'Welcome back'}</h2>
        <p className="auth-description">{mode === 'register' ? accountType === 'admin' ? 'The first admin uses the project owner’s configured email. Additional admins need an invite code and email verification.' : 'Register as a customer using an invite from an existing admin.' : accountType === 'admin' ? 'Sign in with your authorized administrator account.' : 'Sign in to continue to your account.'}</p>

        {!isFirebaseConfigured && <p className="auth-config-note" role="status">Firebase setup is incomplete. Add the missing VITE_FIREBASE values to client/.env.local to enable accounts.</p>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && <div className="form-field"><label htmlFor="auth-name">Username</label><input id="auth-name" type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} minLength="2" maxLength="80" required disabled={!isFirebaseConfigured || loading || verificationPending} /></div>}
          {mode === 'register' && (accountType === 'admin' || !isFirstAdminRegistration) && <div className="form-field"><label htmlFor="auth-invite-code">{accountType === 'admin' ? 'Admin invite code or link (leave blank for first admin)' : 'Administrator invite code or link'}</label><input id="auth-invite-code" type="text" autoComplete="off" value={registrationCode} onChange={(event) => setRegistrationCode(event.target.value)} minLength={normalizedInviteCode ? '20' : undefined} maxLength="1000" required={!isFirstAdminRegistration} disabled={!isFirebaseConfigured || loading || verificationPending} /><small className="invite-field-hint">Paste the code or the full invite link from your administrator.</small></div>}
          <div className="form-field"><label htmlFor="auth-email">{mode === 'register' ? 'Email address' : 'Login email'}</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={!isFirebaseConfigured || loading || verificationPending} /></div>
          {!verificationPending && <div className="form-field"><label htmlFor="auth-password">Password</label><input id="auth-password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength="6" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!isFirebaseConfigured || loading} /></div>}
          {verificationPending && resendNeedsPassword && <div className="form-field"><label htmlFor="auth-resend-password">Password used for registration</label><input id="auth-resend-password" type="password" autoComplete="current-password" minLength="6" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!isFirebaseConfigured || loading} /></div>}
          {mode === 'register' && !verificationPending && <div className="form-field"><label htmlFor="auth-confirm-password">Confirm password</label><input id="auth-confirm-password" type="password" autoComplete="new-password" minLength="6" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={!isFirebaseConfigured || loading} /></div>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {verificationPending && <p className="auth-config-note" role="status">{verificationMessage}</p>}
          {!verificationPending && <button className="button button-primary auth-submit" type="submit" disabled={!isFirebaseConfigured || loading}>
            {loading ? <><span className="loading-spinner" aria-hidden="true" />{mode === 'register' ? 'Creating account...' : 'Signing in...'}</> : mode === 'register' ? 'Create account' : 'Sign in'}
          </button>}
        </form>
        {verificationPending && <><button className="button button-primary auth-submit" type="button" disabled={loading} onClick={confirmFirstAdminEmail}>{loading ? 'Verifying email...' : 'I verified my email'}</button><button className="auth-resend-link" type="button" disabled={loading} onClick={resendVerificationEmail}>{loading ? 'Please wait...' : 'Resend verification email'}</button></>}

        {accountType === 'customer' && allowRegistration && <p className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'New to GreenLoop?'}{' '}
          <button type="button" disabled={loading} onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}>
            {mode === 'register' ? 'Sign in' : 'Create an account'}
          </button>
        </p>}
      </section>
    </div>
  );
}

export default AuthDialog;