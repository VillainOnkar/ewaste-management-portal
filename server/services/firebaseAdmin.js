const fs = require('fs');
const path = require('path');
const { getApp, getApps, initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

let firebaseServices;

function getFirebaseServices() {
  if (firebaseServices) return firebaseServices;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if ((!serviceAccountJson && !serviceAccountPath) || !databaseURL) {
    const error = new Error('Server Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT_PATH) and FIREBASE_DATABASE_URL.');
    error.statusCode = 503;
    throw error;
  }

  let serviceAccount;
  if (serviceAccountJson) {
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
      const error = new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain the full, valid Firebase service-account JSON.');
      error.statusCode = 503;
      throw error;
    }
  } else {
    const resolvedPath = path.resolve(serviceAccountPath);
    if (!fs.existsSync(resolvedPath)) {
      const error = new Error('The Firebase service account file configured by FIREBASE_SERVICE_ACCOUNT_PATH was not found.');
      error.statusCode = 503;
      throw error;
    }
    serviceAccount = require(resolvedPath);
  }

  const app = getApps().length
    ? getApp()
    : initializeApp({
      credential: cert(serviceAccount),
      databaseURL,
    });

  firebaseServices = {
    auth: getAuth(app),
    database: getDatabase(app),
  };
  return firebaseServices;
}

module.exports = { getFirebaseServices };
