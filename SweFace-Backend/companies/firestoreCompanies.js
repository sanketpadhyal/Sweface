const { getFirebaseAdmin, getFirestore } = require("../firebase/admin");
const { getCompanies, getFirestoreCompany } = require("./companies");

function cleanCompanyFolderName(value) {
  return String(value || "Company")
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ") || "Company";
}

function getCollectionName() {
  return process.env.FIRESTORE_COMPANIES_COLLECTION || "companies";
}

function getServerTimestamp() {
  return getFirebaseAdmin().firestore.FieldValue.serverTimestamp();
}

async function ensureCompanyInFirestore(company) {
  if (!company?.id) {
    throw new Error("Company id is required.");
  }

  const db = getFirestore();
  const now = getServerTimestamp();
  const companyFolderName = cleanCompanyFolderName(company.companyName);
  const companiesCollection = getCollectionName();
  const companyRef = db.collection(companiesCollection).doc(company.id);
  const faceEmbeddingsRef = db.collection("faceEmbeddings").doc(companyFolderName);
  const attendanceRef = db.collection("attendance").doc(companyFolderName);
  const [companySnapshot, faceEmbeddingsSnapshot, attendanceSnapshot] = await Promise.all([
    companyRef.get(),
    faceEmbeddingsRef.get(),
    attendanceRef.get()
  ]);
  const batch = db.batch();

  batch.set(companyRef, {
    ...getFirestoreCompany(company),
    companyFolderName,
    createdAt: companySnapshot.exists ? (companySnapshot.data()?.createdAt || now) : now,
    updatedAt: now
  }, { merge: true });

  batch.set(faceEmbeddingsRef, {
    companyDocumentId: company.id,
    companyName: company.companyName,
    companyFolderName,
    createdAt: faceEmbeddingsSnapshot.exists ? (faceEmbeddingsSnapshot.data()?.createdAt || now) : now,
    updatedAt: now
  }, { merge: true });

  batch.set(attendanceRef, {
    companyDocumentId: company.id,
    companyName: company.companyName,
    companyFolderName,
    createdAt: attendanceSnapshot.exists ? (attendanceSnapshot.data()?.createdAt || now) : now,
    updatedAt: now
  }, { merge: true });

  await batch.commit();

  return {
    id: company.id,
    companyName: company.companyName,
    username: company.username,
    companyFolderName
  };
}

async function syncEnvCompaniesToFirestore() {
  const companies = getCompanies();

  if (!companies.length) {
    return [];
  }

  const syncedCompanies = [];

  for (const company of companies) {
    syncedCompanies.push(await ensureCompanyInFirestore(company));
  }

  return syncedCompanies;
}

module.exports = {
  ensureCompanyInFirestore,
  syncEnvCompaniesToFirestore
};
