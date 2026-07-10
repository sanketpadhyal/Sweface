const express = require("express");
const { getFirestore } = require("../firebase/admin");
const { getCompanySettings, saveCompanySettings } = require("../companies/companySettings");

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

function getAdminCompany(req) {
  const companyName = cleanCompanyFolderName(req.admin?.companyName);
  const companyDocumentId = cleanDocumentId(req.admin?.companyId || getCompanyStorageId(companyName), "company");
  const attendanceDocumentId = cleanDocumentId(companyName, "Company");

  return {
    companyName,
    companyDocumentId,
    attendanceDocumentId
  };
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
    timestamp: `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}+05:30`
  };
}

function getIndianTimestamp(value = null) {
  return getIndianDateParts(value).timestamp;
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})/);

  if (!match) {
    return null;
  }

  return (Number(match[1]) * 60) + Number(match[2]);
}

function getTimeFromTimestamp(value) {
  const match = String(value || "").match(/T(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

function getTimingAnalysis(timestamp, settings) {
  if (!timestamp) {
    return {
      timingStatus: "absent",
      lateMinutes: 0,
      earlyMinutes: 0,
      accuracyMinutes: null
    };
  }

  const attendedMinutes = timeToMinutes(getTimeFromTimestamp(timestamp));
  const expectedMinutes = timeToMinutes(settings?.attendance?.expectedTime);
  const graceMinutes = Number(settings?.attendance?.graceMinutes) || 0;

  if (attendedMinutes === null || expectedMinutes === null) {
    return {
      timingStatus: "present",
      lateMinutes: 0,
      earlyMinutes: 0,
      accuracyMinutes: null
    };
  }

  const difference = attendedMinutes - expectedMinutes;
  const lateMinutes = Math.max(0, difference - graceMinutes);
  const earlyMinutes = Math.max(0, -difference);

  return {
    timingStatus: lateMinutes > 0 ? "late" : "on-time",
    lateMinutes,
    earlyMinutes,
    accuracyMinutes: Math.abs(difference)
  };
}

function normalizeCompareValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getEmployeeIdentity(employee) {
  return normalizeCompareValue(employee.employeeId || employee.employeeDocumentId || employee.name);
}

function getEmployeeIdentifiers(employee) {
  return [employee?.employeeId, employee?.employeeDocumentId, employee?.name]
    .map(normalizeCompareValue)
    .filter(Boolean);
}

function recordsMatch(left, right) {
  const leftIdentifiers = new Set(getEmployeeIdentifiers(left));
  return getEmployeeIdentifiers(right).some((identifier) => leftIdentifiers.has(identifier));
}

function getEmployeeDocumentId(employee) {
  return cleanDocumentId(employee.employeeDocumentId || employee.name || employee.employeeId, "employee");
}

function getDateOneYearAgo() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return getIndianDateParts(date).date;
}

function normalizeDate(value) {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function getEffectiveRange(query, settings) {
  const today = getIndianDateParts().date;
  const queryStartDate = normalizeDate(query?.startDate);
  const queryEndDate = normalizeDate(query?.endDate);
  const settingsStartDate = normalizeDate(settings?.subscription?.startDate);
  const settingsEndDate = normalizeDate(settings?.subscription?.endDate);
  const startDate = queryStartDate || settingsStartDate || getDateOneYearAgo();
  const endDate = queryEndDate || settingsEndDate || today;

  if (startDate > endDate) {
    return {
      startDate: endDate,
      endDate: startDate
    };
  }

  return {
    startDate,
    endDate
  };
}

function addDays(date, days) {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function isSunday(date) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0;
}

function isDateInSubscription(date, settings) {
  const startDate = normalizeDate(settings?.subscription?.startDate);
  const endDate = normalizeDate(settings?.subscription?.endDate);

  if (startDate && date < startDate) {
    return false;
  }

  if (endDate && date > endDate) {
    return false;
  }

  return true;
}

function isExpectedWorkingDate(date, settings) {
  return Boolean(normalizeDate(date) && isDateInSubscription(date, settings) && !isSunday(date));
}

function getExpectedWorkingDates(range, settings) {
  const dates = [];
  let cursor = range.startDate;

  while (cursor <= range.endDate) {
    if (isExpectedWorkingDate(cursor, settings)) {
      dates.push(cursor);
    }

    cursor = addDays(cursor, 1);
  }

  return dates;
}

function toFirestoreValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
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

function normalizeEmployee(docSnap) {
  const data = docSnap.data() || {};

  return {
    ...data,
    employeeDocumentId: data.employeeDocumentId || docSnap.id,
    employeeId: data.employeeId || null,
    name: data.name || docSnap.id,
    department: data.department || data.designation || data.role || "General",
    role: data.role || data.designation || "Employee",
    updatedAt: data.updatedAt || data.registeredAt || null,
    registeredAt: data.registeredAt || null
  };
}

async function getCompanyEmployees(db, company) {
  const snapshot = await db.collection("companies")
    .doc(company.companyDocumentId)
    .collection("users")
    .get();

  return snapshot.docs.map(normalizeEmployee)
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
}

async function getRecentAttendanceSheets(db, company, startDate = getDateOneYearAgo(), endDate = getIndianDateParts().date) {
  const snapshot = await db.collection("attendance")
    .doc(company.attendanceDocumentId)
    .collection("attendance")
    .get();

  return snapshot.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() || {})
    }))
    .filter((sheet) => {
      const date = String(sheet.date || sheet.id || "");
      return date >= startDate && date <= endDate;
    })
    .sort((left, right) => String(right.date || right.id).localeCompare(String(left.date || left.id)));
}

function buildVirtualAbsentSheet(date, company, employees) {
  return {
    id: date,
    date,
    companyName: company.companyName,
    companyFolderName: company.companyName,
    companyDocumentId: company.companyDocumentId,
    totalEmployees: employees.length,
    attendedCount: 0,
    notAttendedCount: employees.length,
    attendedUsers: [],
    notAttendedUsers: employees.map((employee) => ({
      employeeId: employee.employeeId || null,
      name: employee.name || null,
      employeeDocumentId: employee.employeeDocumentId
    })),
    expectedWorkingDate: true,
    virtualAbsentSheet: true,
    updatedAt: null
  };
}

function applyExpectedWorkingDates(attendanceSheets, employees, company, range, settings) {
  const sheetsByDate = new Map();

  for (const sheet of attendanceSheets) {
    const date = String(sheet.date || sheet.id || "");

    if (isExpectedWorkingDate(date, settings)) {
      sheetsByDate.set(date, {
        ...sheet,
        date,
        expectedWorkingDate: true,
        virtualAbsentSheet: false
      });
    }
  }

  for (const date of getExpectedWorkingDates(range, settings)) {
    if (!sheetsByDate.has(date)) {
      sheetsByDate.set(date, buildVirtualAbsentSheet(date, company, employees));
    }
  }

  return Array.from(sheetsByDate.values())
    .sort((left, right) => String(right.date || right.id).localeCompare(String(left.date || left.id)));
}

function getAttendanceRecordForEmployee(sheet, employee) {
  const attendedUsers = Array.isArray(sheet.attendedUsers) ? sheet.attendedUsers : [];
  const notAttendedUsers = Array.isArray(sheet.notAttendedUsers) ? sheet.notAttendedUsers : [];
  const attended = attendedUsers.find((record) => recordsMatch(record, employee));
  const notAttended = notAttendedUsers.find((record) => recordsMatch(record, employee));

  if (attended) {
    return {
      date: sheet.date || sheet.id,
      status: "present",
      timestamp: attended.attendedAt || attended.timestamp || attended.lastVerifiedAt || null,
      firstVerifiedAt: attended.firstVerifiedAt || null,
      lastVerifiedAt: attended.lastVerifiedAt || null,
      confidence: attended.confidence || null
    };
  }

  if (notAttended) {
    return {
      date: sheet.date || sheet.id,
      status: "absent",
      timestamp: null,
      firstVerifiedAt: null,
      lastVerifiedAt: null,
      confidence: null
    };
  }

  return null;
}

function getEmployeeAttendanceSummary(employee, attendanceSheets, settings) {
  const records = attendanceSheets
    .map((sheet) => getAttendanceRecordForEmployee(sheet, employee))
    .filter(Boolean);
  const presentCount = records.filter((record) => record.status === "present").length;
  const absentCount = records.filter((record) => record.status === "absent").length;
  const presentRecords = records.filter((record) => record.status === "present");
  const timingRecords = presentRecords.map((record) => getTimingAnalysis(record.timestamp, settings));
  const onTimeCount = timingRecords.filter((record) => record.timingStatus === "on-time").length;
  const lateCount = timingRecords.filter((record) => record.timingStatus === "late").length;
  const totalLateMinutes = timingRecords.reduce((total, record) => total + record.lateMinutes, 0);
  const accuracyRecords = timingRecords.filter((record) => Number.isFinite(record.accuracyMinutes));
  const totalAccuracyMinutes = accuracyRecords.reduce((total, record) => total + record.accuracyMinutes, 0);
  const lastRecord = records.find((record) => record.status === "present") || records[0] || null;

  return {
    presentCount,
    absentCount,
    totalTrackedDates: records.length,
    attendanceRate: records.length ? Math.round((presentCount / records.length) * 100) : 0,
    attendanceScore: records.length ? Math.round((presentCount / records.length) * 100) : 0,
    punctualityRate: presentRecords.length ? Math.round((onTimeCount / presentRecords.length) * 100) : 0,
    onTimeCount,
    lateCount,
    averageLateMinutes: lateCount ? Math.round(totalLateMinutes / lateCount) : 0,
    averageAccuracyMinutes: accuracyRecords.length ? Math.round(totalAccuracyMinutes / accuracyRecords.length) : 0,
    lastAttendanceAt: lastRecord?.timestamp || null,
    latestStatus: lastRecord?.status || "no-data"
  };
}

function getMonthlyChart(attendanceSheets, settings) {
  const months = new Map();

  for (const sheet of attendanceSheets) {
    const date = String(sheet.date || sheet.id || "");
    const month = date.slice(0, 7);
    const attendedUsers = Array.isArray(sheet.attendedUsers) ? sheet.attendedUsers : [];
    const timingRecords = attendedUsers.map((record) => getTimingAnalysis(record.attendedAt || record.timestamp || record.lastVerifiedAt || null, settings));
    const onTimeCount = timingRecords.filter((record) => record.timingStatus === "on-time").length;
    const lateCount = timingRecords.filter((record) => record.timingStatus === "late").length;

    if (!month) {
      continue;
    }

    const current = months.get(month) || {
      month,
      attendedCount: 0,
      notAttendedCount: 0,
      onTimeCount: 0,
      lateCount: 0,
      totalEmployees: 0
    };

    current.attendedCount += Number(sheet.attendedCount) || 0;
    current.notAttendedCount += Number(sheet.notAttendedCount) || 0;
    current.onTimeCount += onTimeCount;
    current.lateCount += lateCount;
    current.totalEmployees = Math.max(current.totalEmployees, Number(sheet.totalEmployees) || 0);
    months.set(month, current);
  }

  return Array.from(months.values()).sort((left, right) => left.month.localeCompare(right.month));
}

function getEmployeeChart(employees, attendanceSheets, settings) {
  return employees.map((employee) => ({
    employeeDocumentId: employee.employeeDocumentId,
    employeeId: employee.employeeId,
    name: employee.name,
    ...getEmployeeAttendanceSummary(employee, attendanceSheets, settings)
  })).sort((left, right) => right.presentCount - left.presentCount);
}

function getDateAttendancePayload(sheet, employees, settings) {
  const attendedUsers = Array.isArray(sheet?.attendedUsers) ? sheet.attendedUsers : [];
  const notAttendedUsers = Array.isArray(sheet?.notAttendedUsers) ? sheet.notAttendedUsers : [];
  const present = attendedUsers.map((record) => ({
    employeeId: record.employeeId || null,
    employeeDocumentId: record.employeeDocumentId || getEmployeeDocumentId(record),
    name: record.name || null,
    status: "present",
    timestamp: record.attendedAt || record.timestamp || record.lastVerifiedAt || null,
    confidence: record.confidence || null,
    ...getTimingAnalysis(record.attendedAt || record.timestamp || record.lastVerifiedAt || null, settings)
  }));
  const absent = employees
    .filter((employee) => {
      const attended = attendedUsers.some((record) => recordsMatch(record, employee));
      const explicitlyAbsent = notAttendedUsers.some((record) => recordsMatch(record, employee));
      return !attended || explicitlyAbsent;
    })
    .filter((employee) => !attendedUsers.some((record) => recordsMatch(record, employee)))
    .map((employee) => ({
      employeeId: employee.employeeId || null,
      employeeDocumentId: employee.employeeDocumentId,
      name: employee.name || null,
      status: "absent",
      timestamp: null,
      confidence: null,
      ...getTimingAnalysis(null, settings)
    }));
  const onTimeCount = present.filter((record) => record.timingStatus === "on-time").length;
  const lateCount = present.filter((record) => record.timingStatus === "late").length;
  const totalLateMinutes = present.reduce((total, record) => total + record.lateMinutes, 0);

  return {
    date: sheet?.date || null,
    totalEmployees: employees.length,
    attendedCount: present.length,
    notAttendedCount: absent.length,
    onTimeCount,
    lateCount,
    averageLateMinutes: lateCount ? Math.round(totalLateMinutes / lateCount) : 0,
    punctualityRate: present.length ? Math.round((onTimeCount / present.length) * 100) : 0,
    present,
    absent,
    updatedAt: sheet?.updatedAt || null
  };
}

router.get("/settings", async (req, res, next) => {
  try {
    const company = getAdminCompany(req);
    const settings = await getCompanySettings(company.companyDocumentId);

    return res.json({
      company,
      settings
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/settings", async (req, res, next) => {
  try {
    const company = getAdminCompany(req);
    const { subscription, attendance } = req.body || {};
    const settings = await saveCompanySettings(company.companyDocumentId, {
      subscription,
      attendance
    });

    return res.json({
      message: "Company settings saved.",
      company,
      settings
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/dashboard", async (req, res, next) => {
  try {
    const db = getFirestore();
    const company = getAdminCompany(req);
    const settings = await getCompanySettings(company.companyDocumentId);
    const range = getEffectiveRange(req.query, settings);
    const [employees, rawAttendanceSheets] = await Promise.all([
      getCompanyEmployees(db, company),
      getRecentAttendanceSheets(db, company, range.startDate, range.endDate)
    ]);
    const attendanceSheets = applyExpectedWorkingDates(rawAttendanceSheets, employees, company, range, settings);
    const employeesWithAttendance = employees.map((employee) => ({
      ...employee,
      attendance: getEmployeeAttendanceSummary(employee, attendanceSheets, settings)
    }));

    return res.json({
      company,
      settings,
      range,
      employees: employeesWithAttendance,
      attendanceDates: attendanceSheets.map((sheet) => ({
        date: sheet.date || sheet.id,
        attendedCount: Number(sheet.attendedCount) || 0,
        notAttendedCount: Number(sheet.notAttendedCount) || 0,
        totalEmployees: Number(sheet.totalEmployees) || employees.length,
        expectedWorkingDate: Boolean(sheet.expectedWorkingDate),
        virtualAbsentSheet: Boolean(sheet.virtualAbsentSheet),
        updatedAt: sheet.updatedAt || null
      })),
      charts: {
        monthly: getMonthlyChart(attendanceSheets, settings),
        employees: getEmployeeChart(employees, attendanceSheets, settings)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/employees/:employeeDocumentId/attendance", async (req, res, next) => {
  try {
    const db = getFirestore();
    const company = getAdminCompany(req);
    const employeeDocumentId = cleanDocumentId(req.params.employeeDocumentId, "employee");
    const settings = await getCompanySettings(company.companyDocumentId);
    const range = getEffectiveRange(req.query, settings);
    const [employeeSnapshot, rawAttendanceSheets] = await Promise.all([
      db.collection("companies").doc(company.companyDocumentId).collection("users").doc(employeeDocumentId).get(),
      getRecentAttendanceSheets(db, company, range.startDate, range.endDate)
    ]);

    if (!employeeSnapshot.exists) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const employee = normalizeEmployee(employeeSnapshot);
    const employees = [employee];
    const attendanceSheets = applyExpectedWorkingDates(rawAttendanceSheets, employees, company, range, settings);
    const records = attendanceSheets
      .map((sheet) => getAttendanceRecordForEmployee(sheet, employee))
      .filter(Boolean)
      .map((record) => ({
        ...record,
        ...getTimingAnalysis(record.timestamp, settings)
      }));

    return res.json({
      employee,
      settings,
      range,
      summary: getEmployeeAttendanceSummary(employee, attendanceSheets, settings),
      records
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/attendance/:date", async (req, res, next) => {
  try {
    const date = String(req.params.date || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "Valid attendance date is required." });
    }

    const db = getFirestore();
    const company = getAdminCompany(req);
    const [employees, dateSnapshot, settings] = await Promise.all([
      getCompanyEmployees(db, company),
      db.collection("attendance").doc(company.attendanceDocumentId).collection("attendance").doc(date).get(),
      getCompanySettings(company.companyDocumentId)
    ]);
    const range = {
      date,
      startDate: date,
      endDate: date
    };
    const rawSheet = dateSnapshot.exists ? [{ id: dateSnapshot.id, ...(dateSnapshot.data() || {}) }] : [];
    const [sheet] = applyExpectedWorkingDates(rawSheet, employees, company, range, settings);
    const safeSheet = sheet || {
      id: date,
      date,
      attendedUsers: [],
      notAttendedUsers: [],
      expectedWorkingDate: false,
      virtualAbsentSheet: false
    };

    return res.json({
      company,
      settings,
      attendance: {
        ...getDateAttendancePayload({ ...safeSheet, date }, safeSheet.expectedWorkingDate ? employees : [], settings),
        expectedWorkingDate: Boolean(safeSheet.expectedWorkingDate),
        virtualAbsentSheet: Boolean(safeSheet.virtualAbsentSheet),
        excludedReason: isSunday(date) ? "Sunday is excluded from attendance counting." : (!isDateInSubscription(date, settings) ? "Date is outside the subscription duration." : null)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/employees/:employeeDocumentId/attendance", async (req, res, next) => {
  try {
    const { date, time, status } = req.body || {};

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      return res.status(400).json({ message: "Valid attendance date is required." });
    }

    if (!["present", "absent"].includes(status)) {
      return res.status(400).json({ message: "Status must be present or absent." });
    }

    if (status === "present" && !/^\d{2}:\d{2}$/.test(String(time || ""))) {
      return res.status(400).json({ message: "Valid attendance time is required." });
    }

    const db = getFirestore();
    const company = getAdminCompany(req);
    const employeeDocumentId = cleanDocumentId(req.params.employeeDocumentId, "employee");
    const employeeRef = db.collection("companies").doc(company.companyDocumentId).collection("users").doc(employeeDocumentId);
    const dateRef = db.collection("attendance").doc(company.attendanceDocumentId).collection("attendance").doc(date);
    const [employeeSnapshot, dateSnapshot, usersSnapshot] = await Promise.all([
      employeeRef.get(),
      dateRef.get(),
      db.collection("companies").doc(company.companyDocumentId).collection("users").get()
    ]);

    if (!employeeSnapshot.exists) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const employee = normalizeEmployee(employeeSnapshot);
    const existingSheet = dateSnapshot.exists ? dateSnapshot.data() || {} : {};
    const existingAttendedUsers = Array.isArray(existingSheet.attendedUsers) ? existingSheet.attendedUsers : [];
    const existingNotAttendedUsers = Array.isArray(existingSheet.notAttendedUsers) ? existingSheet.notAttendedUsers : [];
    const attendedUsers = existingAttendedUsers.filter((record) => !recordsMatch(record, employee));
    const notAttendedUsers = existingNotAttendedUsers.filter((record) => !recordsMatch(record, employee));

    if (status === "present") {
      const timestamp = `${date}T${time}:00+05:30`;

      attendedUsers.push({
        employeeId: employee.employeeId || null,
        name: employee.name || null,
        employeeDocumentId,
        date,
        timestamp,
        attendedAt: timestamp,
        firstVerifiedAt: timestamp,
        lastVerifiedAt: timestamp,
        status: "manual"
      });
    } else {
      notAttendedUsers.push({
        employeeId: employee.employeeId || null,
        name: employee.name || null,
        employeeDocumentId
      });
    }

    attendedUsers.sort((left, right) => String(left.attendedAt || "").localeCompare(String(right.attendedAt || "")));
    notAttendedUsers.sort((left, right) => String(left.name || left.employeeId || "").localeCompare(String(right.name || right.employeeId || "")));

    const sheet = {
      date,
      companyName: company.companyName,
      companyFolderName: company.companyName,
      companyDocumentId: company.companyDocumentId,
      totalEmployees: usersSnapshot.size,
      attendedCount: attendedUsers.length,
      notAttendedCount: notAttendedUsers.length,
      attendedUsers,
      notAttendedUsers,
      updatedAt: getIndianTimestamp()
    };

    await db.collection("attendance").doc(company.attendanceDocumentId).set({
      companyName: company.companyName,
      companyFolderName: company.companyName,
      companyDocumentId: company.companyDocumentId,
      updatedAt: getIndianTimestamp()
    }, { merge: true });
    await dateRef.set(toFirestoreValue(sheet), { merge: true });

    return res.json({
      message: "Attendance updated.",
      record: getAttendanceRecordForEmployee(sheet, employee),
      sheet: {
        date,
        attendedCount: sheet.attendedCount,
        notAttendedCount: sheet.notAttendedCount,
        totalEmployees: sheet.totalEmployees
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/employees/:employeeDocumentId", async (req, res, next) => {
  try {
    const db = getFirestore();
    const company = getAdminCompany(req);
    const employeeDocumentId = cleanDocumentId(req.params.employeeDocumentId, "employee");
    const employeeRef = db.collection("companies").doc(company.companyDocumentId).collection("users").doc(employeeDocumentId);
    const employeeSnapshot = await employeeRef.get();

    if (!employeeSnapshot.exists) {
      return res.status(404).json({ message: "Employee not found." });
    }

    const batch = db.batch();

    batch.delete(employeeRef);
    batch.delete(db.collection("faceEmbeddings").doc(company.companyName).collection("users").doc(employeeDocumentId));
    batch.delete(db.collection("faceEmbeddings").doc(company.companyDocumentId).collection("users").doc(employeeDocumentId));
    await batch.commit();

    return res.json({
      message: "Employee removed.",
      employeeDocumentId
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = {
  adminPanelRouter: router
};
