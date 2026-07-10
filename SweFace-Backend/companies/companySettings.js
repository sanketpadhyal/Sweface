const { getFirebaseAdmin, getFirestore } = require("../firebase/admin");

const DEFAULT_SETTINGS = {
  subscription: {
    startDate: null,
    endDate: null
  },
  attendance: {
    expectedTime: "09:30",
    graceMinutes: 10
  }
};

function normalizeDate(value) {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeTime(value) {
  const time = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(time) ? time : DEFAULT_SETTINGS.attendance.expectedTime;
}

function normalizeGraceMinutes(value) {
  const minutes = Number(value);

  if (!Number.isFinite(minutes)) {
    return DEFAULT_SETTINGS.attendance.graceMinutes;
  }

  return Math.max(0, Math.min(240, Math.round(minutes)));
}

function normalizeCompanySettings(settings = {}) {
  return {
    subscription: {
      startDate: normalizeDate(settings.subscription?.startDate),
      endDate: normalizeDate(settings.subscription?.endDate)
    },
    attendance: {
      expectedTime: normalizeTime(settings.attendance?.expectedTime),
      graceMinutes: normalizeGraceMinutes(settings.attendance?.graceMinutes)
    }
  };
}

async function getCompanySettings(companyId) {
  if (!companyId) {
    return normalizeCompanySettings();
  }

  const snapshot = await getFirestore().collection("companies").doc(companyId).get();
  const data = snapshot.exists ? snapshot.data() || {} : {};

  return normalizeCompanySettings(data.adminSettings || data.settings || {});
}

async function saveCompanySettings(companyId, settings) {
  if (!companyId) {
    throw new Error("Company id is required.");
  }

  const normalized = normalizeCompanySettings(settings);

  await getFirestore().collection("companies").doc(companyId).set({
    adminSettings: normalized,
    updatedAt: getFirebaseAdmin().firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return normalized;
}

function isCompanyDurationFinished(settings, todayDate) {
  const endDate = normalizeDate(settings?.subscription?.endDate);

  return Boolean(endDate && todayDate > endDate);
}

module.exports = {
  DEFAULT_SETTINGS,
  getCompanySettings,
  isCompanyDurationFinished,
  normalizeCompanySettings,
  saveCompanySettings
};
