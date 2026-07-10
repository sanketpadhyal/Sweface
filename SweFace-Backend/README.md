# SweFace Backend

Express API for SweFace authentication, employee registration, face metadata, attendance sync, and admin reporting.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Set `JWT_SECRET` to a strong random value before running outside local development.

## Firebase Credentials

Use one of these options:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
FIREBASE_SERVICE_ACCOUNT_BASE64=base64-encoded-service-account-json
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

For local development, `firebase/serviceaccount.json` is also supported and ignored by Git.

## Scripts

```bash
npm start
npm run dev
npm run seed:companies
```
