require('../config/env');

const { getFirebaseServices } = require('../services/firebaseAdmin');

async function grantAdmin(email) {
  if (!email || !email.includes('@')) {
    throw new Error('Usage: node scripts/grantAdmin.js admin@example.com');
  }

  const { auth } = getFirebaseServices();
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
  console.log(`Admin access granted to ${user.email} (${user.uid}). Sign out and sign back in to refresh the account token.`);
}

grantAdmin(process.argv[2]).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
