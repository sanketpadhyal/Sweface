const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

function getServiceAccountPath() {
  return path.join(__dirname, "serviceaccount.json");
}

function parseServiceAccount(value, source) {
  try {
    const serviceAccount = JSON.parse(value);

    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    return serviceAccount;
  } catch (error) {
    throw new Error(`Invalid Firebase service account JSON in ${source}.`);
  }
}

function getServiceAccountFromEnvironment() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, "FIREBASE_SERVICE_ACCOUNT_JSON");
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return parseServiceAccount(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"),
      "FIREBASE_SERVICE_ACCOUNT_BASE64"
    );
  }

  return null;
}

function getServiceAccountFromFile() {
  const serviceAccountPath = getServiceAccountPath();

  if (!fs.existsSync(serviceAccountPath)) {
    return null;
  }

  return parseServiceAccount(fs.readFileSync(serviceAccountPath, "utf8"), serviceAccountPath);
}

function getFirebaseOptions() {
  const serviceAccount = getServiceAccountFromEnvironment() || getServiceAccountFromFile();

  if (!serviceAccount) {
    return undefined;
  }

  return {
    credential: admin.credential.cert(serviceAccount)
  };
}

function getFirebaseAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp(getFirebaseOptions());
  }

  return admin;
}

function getFirestore() {
  return getFirebaseAdmin().firestore();
}

module.exports = {
  getFirebaseAdmin,
  getFirestore
};
