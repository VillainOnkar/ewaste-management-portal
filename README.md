# E-Waste Management Portal

This project is a college final-year E-Waste Management Portal built with React, Vite, Express, and Firebase.

## Project structure

- `client/` – React + Vite frontend
- `server/` – Express backend API

## Tech stack

- Frontend: React + Vite + JavaScript
- Styling: CSS with a sustainability-themed green and white design
- Backend: Node.js + Express
- Database: Firebase Realtime Database
- Authentication: Firebase Authentication
- AI integration: Groq API (planned later)

## Local setup

### 1) Install dependencies

```bash
cd ewaste-management-portal/client
npm install

cd ../server
npm install
```

### 2) Start the backend

```bash
cd ewaste-management-portal/server
npm run dev
```

### 3) Start the frontend

```bash
cd ewaste-management-portal/client
npm run dev
```

### 4) Open the app

- Frontend: http://localhost:5173
- Backend health check: http://localhost:5000/api/health

## Environment variables

Vite reads the Firebase client configuration from `client/.env.local`. In PowerShell, create the file only if it does not already exist:

```powershell
if (!(Test-Path client/.env.local)) { Copy-Item client/.env.example client/.env.local }
```

Fill in the Firebase Web App values in `client/.env.local` from Firebase Console → Project settings → Your apps. The example already contains the supplied project ID and Realtime Database URL; do not commit `.env.local`.

`VITE_API_URL` should be the backend origin, such as `http://localhost:5000` (without `/api`). The client service appends `/api`, and Vite proxies `/api` to the Express server during development.

The Express API exposes a health-check endpoint plus protected Firebase Admin registration-invite endpoints. Server-only Firebase service-account credentials are required for invite operations.

## Free-tier online deployment

The project is configured for Firebase Hosting (frontend) and a Render free web service (API). Free-tier services have usage limits; Render may sleep when idle, so its first request after inactivity can take about a minute. You need accounts for Firebase, Render, and a Git provider. Render deploys from a Git repository; keep it private if you do not want the source code public.

### 1) Deploy the API to Render

1. Push this project to a private GitHub repository, without `.env` files or Firebase service-account key files. They are excluded by `.gitignore`.
2. In Render, create a **Blueprint** from that repository. The root `render.yaml` configures the API service, health check, and Node start command. Choose the Free plan.
3. When prompted, set `FIREBASE_DATABASE_URL` to the Realtime Database URL shown in Firebase Console, and set `FIREBASE_SERVICE_ACCOUNT_JSON` to the complete contents of the private service-account JSON key. Enter the JSON in Render's environment-variable editor; never commit the key, paste it into source code, or put it in Firebase Hosting settings.
4. After the first successful deploy, open `https://<your-render-service>.onrender.com/api/health`. It should return a JSON success response. Keep the Render service URL for the frontend build.

The API supports `FIREBASE_SERVICE_ACCOUNT_JSON` on hosted platforms and retains `FIREBASE_SERVICE_ACCOUNT_PATH` for local development. Render supplies `PORT` automatically.

### 2) Deploy the frontend and database rules to Firebase

1. In Firebase Console → Authentication → Settings → Authorized domains, add the Firebase Hosting domain that will be shown after deployment (typically `<project-id>.web.app`).
2. In PowerShell, from the project root, build the frontend with the Render API URL. Replace the example URL with the URL from your Render service:

   ```powershell
   Set-Location client
   $env:VITE_API_URL = "https://<your-render-service>.onrender.com"
   npm run build
   Remove-Item Env:VITE_API_URL
   Set-Location ..
   ```

3. Install the Firebase CLI if needed (`npm install -g firebase-tools`), then sign in and deploy the Hosting site and Realtime Database rules:

   ```powershell
   firebase login
   firebase deploy --only hosting,database
   ```

   The `.firebaserc` file selects the Firebase project already configured for this app. Confirm that it is the intended project before deploying. The Hosting rewrite supports app routes such as `/dashboard` and `/track-request`.
4. Open the Hosting URL printed by Firebase and test customer/admin sign-in, a pickup request, and the backend health URL. The first API request after an idle period may be slow while the Render service wakes up.

Deploy the API before building the frontend, because `VITE_API_URL` is embedded in the built frontend. If the Render URL changes, rebuild and redeploy Hosting. Monitor Firebase and Render usage in their dashboards; free tier does not mean unlimited usage.

## Customer registration

Choose **Create account** on the login page and select Customer or Admin. The first admin uses the configured `FIRST_ADMIN_EMAIL`; customers and additional admins enter a single-use invite code generated by an existing admin. The server checks the code against Realtime Database before creating the Firebase Authentication account, then redeems it during registration. Each generated invite has a random, single-use code, is specific to Customer or Admin, and expires after seven days. The Admin Dashboard has separate buttons to create fresh Customer and Admin links; generating a new link does not change the role on any older link. Admin invitees must verify the email address they register with using the Firebase verification link before the server grants admin access. Firebase Authentication manages passwords; they are never written to the Realtime Database. The invited user's profile is saved at `users/{uid}` and under `adminUsers/{invitingAdminUid}/{uid}`. Admins can view the users and pickup requests associated with their own invites.

### Enable admin invites

1. Enable Email/Password sign-in in Firebase Authentication and deploy `database.rules.json`.
2. Create a service account in Firebase Console → Project settings → Service accounts. Store its JSON key outside the repository and never commit or share it.
3. Create `server/.env` from the example in PowerShell, then set `FIREBASE_SERVICE_ACCOUNT_PATH` to the private JSON file path and `FIREBASE_DATABASE_URL` to the Realtime Database URL:

   ```powershell
   if (!(Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
   ```

4. Set `FIRST_ADMIN_EMAIL` in `server/.env` to the email you want to use for the first admin. Start the app and choose **Create account → Register as Admin**. Register with that exact email, open the Firebase verification email, click its link, then return to the app and select **I verified my email**. The server grants the one-time first-admin claim only after checking that verified email. Once signed in, the first admin opens **Invites** in the Admin Dashboard and generates customer or later-admin links. For a later admin, use an admin invite and verify the registered email through the Firebase link; opening the link now completes the admin invite automatically, including when opened on another device. Add the app's deployed domain to Firebase Authentication → Settings → Authorized domains so Firebase can return to it after verification. Public visitors cannot grant themselves admin access.

If you already created the first admin in Firebase Authentication manually, grant its claim instead from the `server` directory:

```powershell
node scripts/grantAdmin.js admin@example.com
``` Share generated links only with the intended person; each link is single-use, expires after seven days, and its code is stored hashed in Realtime Database.

   The server Firebase Admin SDK is required for invite generation, one-time invite redemption, profile assignment, and admin custom claims. Existing user profiles created before invite registration do not have an inviting-admin association; to migrate one, set `users/{uid}/adminUid` to the admin UID and copy its profile to `adminUsers/{adminUid}/{uid}` in Realtime Database before relying on the new admin-scoped views.

## Scripts

- Client: `npm run dev`, `npm run build`, `npm run preview`
- Server: `npm run dev`, `npm start`

## Notes

- Secrets and API keys should never be committed to the repository.
- This is the initial setup only; full features will be built in later stages.
