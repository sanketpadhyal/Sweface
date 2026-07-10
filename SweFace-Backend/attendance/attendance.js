const express = require("express");
const { getFirestore } = require("../firebase/admin");
const { getCompanySettings } = require("../companies/companySettings");

const router = express.Router();
const MUMBAI_TIME_ZONE = "Asia/Kolkata";

function cleanCompanyFolderName(value) {
  return String(value || "Company")
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ") || "Company";
}

function cleanDocumentId(value, fallback = "document") {
  return String(value || fallback)
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ") || fallback;
}

function getCompanyStorageId(companyName) {
  return cleanCompanyFolderName(companyName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "company";
}

function getIndianDateParts(value = null) {
  const parsedDate = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: MUMBAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(safeDate).reduce((result, part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
    return result;
  }, {});
  const hour = parts.hour === "24" ? "00" : parts.hour;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    timestamp: `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}+05:30`,
    minutes: Number(hour) * 60 + Number(parts.minute)
  };
}

function getIndianTimestamp(value = null) {
  return getIndianDateParts(value).timestamp;
}

function getAttendanceDate(timestamp) {
  return getIndianDateParts(timestamp).date;
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return 0;

  return Number(match[1]) * 60 + Number(match[2]);
}

function isAttendanceRecordAllowed(record, settings) {
  const attendanceSettings = settings?.attendance || {};
  const expectedMinutes = timeToMinutes(attendanceSettings.expectedTime);
  const graceMinutes = Number(attendanceSettings.graceMinutes) || 0;
  const punch = getIndianDateParts(record.timestamp || record.attendedAt);

  return punch.minutes <= expectedMinutes + graceMinutes;
}

function normalizeCompareValue(value) {
  return String(value || "").trim().toLowerCase();
}

function toFirestoreValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (Array.isArray(item)) {
        return {
          values: item.map((nestedItem) => {
            const nextNested = toFirestoreValue(nestedItem);
            return nextNested === undefined ? null : nextNested;
          })
        };
      }

      const next = toFirestoreValue(item);
      return next === undefined ? null : next;
    });
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce((result, [key, item]) => {
      const next = toFirestoreValue(item);
      if (next !== undefined) {
        result[key] = next;
      }
      return result;
    }, {});
  }

  return value;
}

function getCompanyDocumentId(user) {
  const fallback = getCompanyStorageId(user.companyName);
  return cleanDocumentId(user.companyId || fallback, fallback);
}

function getEmployeeDocumentId(record) {
  return cleanDocumentId(record.employeeDocumentId || record.name || record.employeeId, "employee");
}

function getAttendanceIdentity(record) {
  return normalizeCompareValue(record.employeeId || record.employeeDocumentId || record.name);
}

function normalizeAttendanceRecord(record, company) {
  const timestamp = record.timestamp || record.attendedAt || getIndianTimestamp();
  const date = getAttendanceDate(timestamp);
  const employeeDocumentId = getEmployeeDocumentId(record);

  return {
    id: cleanDocumentId(record.id || `${date}-${employeeDocumentId}`, "attendance"),
    employeeId: record.employeeId || null,
    name: record.name || null,
    employeeDocumentId,
    companyName: company.companyName,
    companyFolderName: company.companyName,
    companyDocumentId: company.companyDocumentId,
    date,
    timestamp,
    attendedAt: record.attendedAt || timestamp,
    firstVerifiedAt: record.firstVerifiedAt || record.attendedAt || timestamp,
    lastVerifiedAt: record.lastVerifiedAt || timestamp,
    confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : null,
    similarity: Number.isFinite(Number(record.similarity)) ? Number(record.similarity) : null,
    embeddingProvider: record.embeddingProvider || null,
    syncedFromQueueId: record.id || null,
    syncedAt: getIndianTimestamp(),
    status: "synced"
  };
}

function mergeAttendedRecords(existingAttendedUsers, incomingRecords) {
  const merged = new Map();

  for (const record of Array.isArray(existingAttendedUsers) ? existingAttendedUsers : []) {
    const identity = getAttendanceIdentity(record);
    if (identity) {
      merged.set(identity, record);
    }
  }

  for (const record of incomingRecords) {
    const identity = getAttendanceIdentity(record);
    if (identity) {
      merged.set(identity, {
        ...(merged.get(identity) || {}),
        ...record,
        attendedAt: merged.get(identity)?.attendedAt || record.attendedAt,
        firstVerifiedAt: merged.get(identity)?.firstVerifiedAt || record.firstVerifiedAt || record.attendedAt
      });
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => String(left.attendedAt || "").localeCompare(String(right.attendedAt || "")));
}

function buildAttendanceSheet(date, company, users, attendedUsers) {
  const attendedIds = new Set(attendedUsers.map(getAttendanceIdentity).filter(Boolean));
  const notAttendedUsers = users
    .filter((user) => !attendedIds.has(getAttendanceIdentity(user)))
    .map((user) => ({
      employeeId: user.employeeId || null,
      name: user.name || null,
      employeeDocumentId: user.employeeDocumentId || getEmployeeDocumentId(user)
    }));

  return {
    date,
    companyName: company.companyName,
    companyFolderName: company.companyName,
    companyDocumentId: company.companyDocumentId,
    totalEmployees: users.length,
    attendedCount: attendedUsers.length,
    notAttendedCount: notAttendedUsers.length,
    attendedUsers,
    notAttendedUsers,
    updatedAt: getIndianTimestamp()
  };
}

async function getCompanyUsers(db, companyDocumentId) {
  const snapshot = await db.collection("companies")
    .doc(companyDocumentId)
    .collection("users")
    .get();

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    employeeDocumentId: doc.id
  }));
}

router.post("/sync", async (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : [];

  if (!records.length) {
    return res.json({
      message: "No attendance records to sync.",
      synced: 0,
      syncedIds: [],
      dates: []
    });
  }

  const db = getFirestore();
  const companyName = cleanCompanyFolderName(req.user?.companyName);
  const company = {
    companyName,
    companyDocumentId: getCompanyDocumentId(req.user || {})
  };
  const attendanceCompanyDocumentId = cleanDocumentId(companyName, "Company");
  const settings = await getCompanySettings(company.companyDocumentId);
  const normalizedRecords = records.map((record) => normalizeAttendanceRecord(record || {}, company));
  const acceptedRecords = [];
  const rejectedRecords = [];

  for (const record of normalizedRecords) {
    if (isAttendanceRecordAllowed(record, settings)) {
      acceptedRecords.push(record);
    } else {
      rejectedRecords.push(record);
    }
  }

  if (!acceptedRecords.length) {
    return res.json({
      message: "Attendance time is over. You are late.",
      synced: 0,
      syncedIds: [],
      rejected: rejectedRecords.length,
      rejectedIds: rejectedRecords.map((record) => record.syncedFromQueueId || record.id).filter(Boolean),
      dates: [],
      settings
    });
  }

  const recordsByDate = acceptedRecords.reduce((groups, record) => {
    if (!groups.has(record.date)) {
      groups.set(record.date, []);
    }
    groups.get(record.date).push(record);
    return groups;
  }, new Map());
  const users = await getCompanyUsers(db, company.companyDocumentId);
  const batch = db.batch();
  const syncedDates = [];

  batch.set(db.collection("attendance").doc(attendanceCompanyDocumentId), {
    companyName: company.companyName,
    companyFolderName: company.companyName,
    companyDocumentId: company.companyDocumentId,
    updatedAt: getIndianTimestamp()
  }, { merge: true });

  for (const [date, dateRecords] of recordsByDate.entries()) {
    const dateRef = db.collection("attendance")
      .doc(attendanceCompanyDocumentId)
      .collection("attendance")
      .doc(date);
    const existingSnapshot = await dateRef.get();
    const existingAttendedUsers = existingSnapshot.exists
      ? existingSnapshot.data()?.attendedUsers
      : [];
    const attendedUsers = mergeAttendedRecords(existingAttendedUsers, dateRecords)
      .map((record) => toFirestoreValue(record));
    const sheet = buildAttendanceSheet(date, company, users, attendedUsers);

    batch.set(dateRef, toFirestoreValue(sheet), { merge: true });
    syncedDates.push({
      date,
      attendedCount: sheet.attendedCount,
      notAttendedCount: sheet.notAttendedCount
    });
  }

  await batch.commit();

  return res.json({
    message: rejectedRecords.length ? "Attendance synced. Late records were skipped." : "Attendance synced.",
    synced: acceptedRecords.length,
    syncedIds: acceptedRecords.map((record) => record.syncedFromQueueId || record.id).filter(Boolean),
    rejected: rejectedRecords.length,
    rejectedIds: rejectedRecords.map((record) => record.syncedFromQueueId || record.id).filter(Boolean),
    dates: syncedDates,
    settings
  });
});

router.get("/today", async (req, res) => {
  const db = getFirestore();
  const companyName = cleanCompanyFolderName(req.user?.companyName);
  const companyDocumentId = cleanDocumentId(companyName, "Company");
  const date = getAttendanceDate(req.query?.date);
  const snapshot = await db.collection("attendance")
    .doc(companyDocumentId)
    .collection("attendance")
    .doc(date)
    .get();

  return res.json({
    date,
    companyName,
    attendance: snapshot.exists ? snapshot.data() : null
  });
});

module.exports = {
  attendanceRouter: router
};
