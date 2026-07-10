import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules } from "react-native";
import { NativeModulesProxy } from "expo-modules-core";
import { buildApiUrl } from "./apiConfig";

const KEYS = {
  employee: "sweface.employee",
  secureEmployee: "sweface.secureEmployee",
  companySession: "sweface.companySession",
  companyProfile: "sweface.companyProfile",
  companyFolderIndex: "sweface.companyFolderIndex",
  attendanceQueue: "sweface.attendanceQueue",
  networkOnline: "sweface.networkOnline",
  lastSync: "sweface.lastSync"
};

const LEGACY_EMPLOYEES_LIST_KEY = "sweface.employeesList";
const COMPANY_EMPLOYEES_KEY_PREFIX = "sweface.companyEmployees";
const COMPANY_ATTENDANCE_KEY_PREFIX = "sweface.companyAttendance";
const DEFAULT_COMPANY_FOLDER = "Company";
const EMPLOYEE_UPLOAD_TIMEOUT_MS = 12000;
const EMPLOYEE_FETCH_TIMEOUT_MS = 12000;
const MUMBAI_TIME_ZONE = "Asia/Kolkata";
const INTERNET_CONNECTION_ERROR = "Internet connection error. Please check your connection and try again.";

let companyProfileMemoryCache = null;

let secureStoreModule;
let secureStoreResolved = false;

function hasNativeSecureStore() {
  return Boolean(
    NativeModules?.ExpoSecureStore ||
    NativeModulesProxy?.ExpoSecureStore ||
    global.expo?.modules?.NativeModulesProxy?.ExpoSecureStore
  );
}

function getSecureStore() {
  if (secureStoreResolved) {
    return secureStoreModule;
  }

  secureStoreResolved = true;
  if (!hasNativeSecureStore()) {
    secureStoreModule = null;
    return secureStoreModule;
  }

  try {
    secureStoreModule = require("expo-secure-store");
  } catch (error) {
    secureStoreModule = null;
  }

  return secureStoreModule;
}

function getSecureStoreOptions() {
  const SecureStore = getSecureStore();
  return {
    keychainService: "sweface.private",
    keychainAccessible: SecureStore?.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
  };
}

async function setPrivateItem(key, value) {
  const serialized = JSON.stringify(value);
  const SecureStore = getSecureStore();

  try {
    if (SecureStore && (await SecureStore.isAvailableAsync())) {
      await SecureStore.setItemAsync(key, serialized, getSecureStoreOptions());
      await AsyncStorage.removeItem(key);
      return;
    }
  } catch (error) {
    console.warn("Secure storage unavailable, using app storage fallback.", error);
  }
  await AsyncStorage.setItem(key, serialized);
}

async function getPrivateItem(key) {
  const SecureStore = getSecureStore();

  try {
    if (SecureStore && (await SecureStore.isAvailableAsync())) {
      const secureRaw = await SecureStore.getItemAsync(key, getSecureStoreOptions());
      if (secureRaw) {
        return JSON.parse(secureRaw);
      }
    }
  } catch (error) {
    console.warn("Secure storage read failed, using app storage fallback.", error);
  }

  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return null;
  }

  const employee = JSON.parse(raw);
  await setPrivateItem(key, employee);
  return employee;
}

async function deletePrivateItem(key) {
  const SecureStore = getSecureStore();

  try {
    if (SecureStore && (await SecureStore.isAvailableAsync())) {
      await SecureStore.deleteItemAsync(key, getSecureStoreOptions());
    }
  } catch (error) {
    console.warn("Secure storage delete failed.", error);
  }
  await AsyncStorage.removeItem(key);
}

function cleanCompanyFolderName(value) {
  return String(value || DEFAULT_COMPANY_FOLDER).
  trim().
  replace(/[\\/]+/g, "-").
  replace(/\s+/g, " ") || DEFAULT_COMPANY_FOLDER;
}

function getCompanyStorageId(companyFolderName) {
  const normalized = cleanCompanyFolderName(companyFolderName).
  toLowerCase().
  replace(/[^a-z0-9]+/g, "-").
  replace(/^-+|-+$/g, "");

  return normalized || "company";
}

function cleanFirestoreDocumentId(value, fallback = "document") {
  return String(value || fallback).
  trim().
  replace(/[\\/]+/g, "-").
  replace(/\s+/g, " ") || fallback;
}

function getCompanyEmployeesKey(companyStorageId) {
  return `${COMPANY_EMPLOYEES_KEY_PREFIX}.${companyStorageId}.employeesList`;
}

function getCompanyAttendanceKey(companyStorageId) {
  return `${COMPANY_ATTENDANCE_KEY_PREFIX}.${companyStorageId}.attendance`;
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

function getAttendanceDate(timestamp) {
  return getIndianDateParts(timestamp).date;
}

function getAttendanceQueueId(record, companyContext, date) {
  return cleanFirestoreDocumentId(
    record.id ||
    `${companyContext.companyStorageId}-${date}-${record.employeeId || record.name || "employee"}`,
    "attendance"
  );
}

function buildDailyAttendanceSheet(date, records, employees) {
  const dayRecords = records.filter((item) => item.date === date);
  const attendedIds = new Set(dayRecords.map((item) => normalizeCompareValue(item.employeeId || item.name)));
  const employeesById = new Map(
    employees.map((employee) => [normalizeCompareValue(employee.employeeId || employee.name), employee])
  );

  const attendedUsers = dayRecords.map((record) => ({
    employeeId: record.employeeId || null,
    name: record.name || employeesById.get(normalizeCompareValue(record.employeeId))?.name || null,
    employeeDocumentId: record.employeeDocumentId || getEmployeeFirestoreDocumentId(record),
    attendedAt: record.attendedAt || record.timestamp,
    lastVerifiedAt: record.lastVerifiedAt || record.timestamp,
    confidence: record.confidence || null,
    similarity: record.similarity || null
  }));

  const notAttendedUsers = employees.
  filter((employee) => !attendedIds.has(normalizeCompareValue(employee.employeeId || employee.name))).
  map((employee) => ({
    employeeId: employee.employeeId || null,
    name: employee.name || null,
    employeeDocumentId: employee.employeeDocumentId || getEmployeeFirestoreDocumentId(employee)
  }));

  return {
    date,
    attendedCount: attendedUsers.length,
    notAttendedCount: notAttendedUsers.length,
    totalUsers: employees.length,
    attendedUsers,
    notAttendedUsers,
    updatedAt: getIndianTimestamp()
  };
}

async function getCompanyFolderIndex() {
  const index = await getPrivateItem(KEYS.companyFolderIndex);
  return Array.isArray(index) ? index : [];
}

async function rememberCompanyFolder(context) {
  if (!context?.companyStorageId) return;

  const index = await getCompanyFolderIndex();
  const nextEntry = {
    companyName: context.companyName,
    companyFolderName: context.companyFolderName,
    companyStorageId: context.companyStorageId,
    updatedAt: new Date().toISOString()
  };
  const existingIndex = index.findIndex((item) => item.companyStorageId === context.companyStorageId);

  if (existingIndex >= 0) {
    index[existingIndex] = {
      ...index[existingIndex],
      ...nextEntry
    };
  } else {
    index.push(nextEntry);
  }

  await setPrivateItem(KEYS.companyFolderIndex, index);
}

async function resolveCompanyContext(source = null) {
  const [session, profile] = await Promise.all([
  getCompanySession().catch(() => null),
  getCompanyProfile().catch(() => null)]
  );
  const companyName = cleanCompanyFolderName(
    source?.companyName ||
    source?.company?.companyName ||
    profile?.companyName ||
    session?.companyName ||
    session?.company?.companyName ||
    source?.companyUsername ||
    profile?.username ||
    session?.username ||
    DEFAULT_COMPANY_FOLDER
  );
  const companyFolderName = cleanCompanyFolderName(source?.companyFolderName || companyName);
  const companyStorageId = source?.companyStorageId || getCompanyStorageId(companyFolderName);

  return {
    companyName,
    companyFolderName,
    companyStorageId,
    companyId: source?.companyId || session?.companyId || session?.company?.id || null,
    companyUsername: source?.companyUsername || session?.username || profile?.username || null
  };
}

function employeeBelongsToCompany(employee, context) {
  if (!employee || !context) return false;

  if (employee.companyStorageId && employee.companyStorageId === context.companyStorageId) {
    return true;
  }

  const employeeFolder = employee.companyFolderName || employee.companyName;
  return Boolean(employeeFolder) && getCompanyStorageId(employeeFolder) === context.companyStorageId;
}

export function getCompanyFirestoreFolderName(employeeOrContext = null) {
  return cleanCompanyFolderName(
    employeeOrContext?.companyFolderName ||
    employeeOrContext?.companyName ||
    DEFAULT_COMPANY_FOLDER
  );
}

export function getCompanyFirestoreDocumentId(employeeOrContext = null) {
  return cleanFirestoreDocumentId(
    employeeOrContext?.companyId ||
    employeeOrContext?.companyStorageId ||
    getCompanyStorageId(employeeOrContext?.companyFolderName || employeeOrContext?.companyName)
  );
}

export function getEmployeeFirestoreDocumentId(employee = null) {
  return cleanFirestoreDocumentId(employee?.name || employee?.employeeId, "employee");
}

function getNetworkErrorMessage(error = null) {
  const message = String(error?.message || "");
  if (
  !message ||
  error?.name === "AbortError" ||
  /network|failed to fetch|internet|server|backend|internal|upload failed|fetch failed/i.test(message))
  {
    return INTERNET_CONNECTION_ERROR;
  }
  return message;
}

async function uploadEmployeeToCompanyFolder(employee, options = {}) {
  const session = await getCompanySession().catch(() => null);

  if (!session?.token) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMPLOYEE_UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(buildApiUrl("/employees/register"), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `${session.tokenType || "Bearer"} ${session.token}`
      },
      body: JSON.stringify({
        employee,
        allowOverwrite: options.allowOverwrite === true
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(getNetworkErrorMessage(payload.message ? { message: payload.message } : null));
    }

    return payload;
  } catch (error) {
    throw new Error(getNetworkErrorMessage(error));
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCompareValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getEmployeeIdentity(employee) {
  return {
    employeeId: normalizeCompareValue(employee?.employeeId),
    name: normalizeCompareValue(employee?.name),
    documentId: normalizeCompareValue(employee?.employeeDocumentId)
  };
}

function addEmployeeIdentityToSets(employee, sets) {
  const identity = getEmployeeIdentity(employee);
  if (identity.employeeId) sets.employeeIds.add(identity.employeeId);
  if (identity.name) sets.names.add(identity.name);
  if (identity.documentId) sets.documentIds.add(identity.documentId);
}

function employeeExistsInSets(employee, sets) {
  const identity = getEmployeeIdentity(employee);

  return Boolean(
    identity.employeeId && sets.employeeIds.has(identity.employeeId) ||
    identity.name && sets.names.has(identity.name) ||
    identity.documentId && sets.documentIds.has(identity.documentId)
  );
}

async function fetchCompanyEmployeesFromCloud() {
  const session = await getCompanySession().catch(() => null);

  if (!session?.token) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMPLOYEE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(buildApiUrl("/employees/users"), {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `${session.tokenType || "Bearer"} ${session.token}`
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(getNetworkErrorMessage(payload.message ? { message: payload.message } : null));
    }

    return Array.isArray(payload.users) ? payload.users : [];
  } catch (error) {
    throw new Error(getNetworkErrorMessage(error));
  } finally {
    clearTimeout(timeout);
  }
}

export async function bootstrapAppState() {
  const [employee, attendanceQueue, networkOnline, lastSync] = await Promise.all([
  getEmployee(),
  getAttendanceQueue(),
  getNetworkOnline(),
  getLastSync()]
  );

  return {
    employee,
    attendanceQueue,
    networkOnline,
    lastSync
  };
}

export async function saveEmployee(employee, options = {}) {
  const companyContext = await resolveCompanyContext(employee);
  const normalizedEmployee = {
    ...employee,
    companyId: employee.companyId || companyContext.companyId,
    companyName: companyContext.companyName,
    companyFolderName: companyContext.companyFolderName,
    companyStorageId: companyContext.companyStorageId,
    companyUsername: employee.companyUsername || companyContext.companyUsername
  };
  const companyEmployeesKey = getCompanyEmployeesKey(companyContext.companyStorageId);
  const previousActiveEmployee = options.requireCloud ?
  await getPrivateItem(KEYS.secureEmployee) :
  null;
  const previousCompanyList = options.requireCloud ?
  await getPrivateItem(companyEmployeesKey) :
  null;

  try {

    await setPrivateItem(KEYS.secureEmployee, normalizedEmployee);


    const list = await getAllEmployees(companyContext);
    const index = list.findIndex((emp) => emp.employeeId === normalizedEmployee.employeeId);
    if (index >= 0) {
      list[index] = normalizedEmployee;
    } else {
      list.push(normalizedEmployee);
    }
    await Promise.all([
    setPrivateItem(companyEmployeesKey, list),
    rememberCompanyFolder(companyContext)]
    );

    if (options.requireCloud) {
      await uploadEmployeeToCompanyFolder(normalizedEmployee, { allowOverwrite: false });
    } else {
      uploadEmployeeToCompanyFolder(normalizedEmployee, { allowOverwrite: true }).catch((error) => {
        console.warn("Employee company-folder upload skipped:", error?.message || error);
      });
    }
  } catch (error) {
    if (options.requireCloud) {
      await Promise.all([
      previousActiveEmployee ?
      setPrivateItem(KEYS.secureEmployee, previousActiveEmployee) :
      deletePrivateItem(KEYS.secureEmployee),
      Array.isArray(previousCompanyList) ?
      setPrivateItem(companyEmployeesKey, previousCompanyList) :
      deletePrivateItem(companyEmployeesKey)]
      ).catch((rollbackError) => {
        console.warn("Employee local rollback failed:", rollbackError?.message || rollbackError);
      });
    }
    throw error;
  }

  return normalizedEmployee;
}

export async function getEmployee() {
  return getPrivateItem(KEYS.secureEmployee);
}

export async function getAllEmployees(companySource = null) {
  const companyContext = await resolveCompanyContext(companySource);
  const companyEmployeesKey = getCompanyEmployeesKey(companyContext.companyStorageId);
  const companyList = await getPrivateItem(companyEmployeesKey);

  if (Array.isArray(companyList)) {
    return companyList;
  }

  const legacyList = await getPrivateItem(LEGACY_EMPLOYEES_LIST_KEY);
  if (!Array.isArray(legacyList)) {
    return [];
  }

  const scopedLegacyList = legacyList.filter((employee) => employeeBelongsToCompany(employee, companyContext));
  if (scopedLegacyList.length > 0) {
    await Promise.all([
    setPrivateItem(companyEmployeesKey, scopedLegacyList),
    rememberCompanyFolder(companyContext)]
    );
  }

  return scopedLegacyList;
}

export async function mergeMissingEmployeesFromCloud(cloudEmployees = [], companySource = null) {
  const companyContext = await resolveCompanyContext(companySource);
  const companyEmployeesKey = getCompanyEmployeesKey(companyContext.companyStorageId);
  const localList = await getAllEmployees(companyContext);
  const cloudIdentitySets = {
    employeeIds: new Set(),
    names: new Set(),
    documentIds: new Set()
  };
  const nextIdentitySets = {
    employeeIds: new Set(),
    names: new Set(),
    documentIds: new Set()
  };
  const normalizedCloudEmployees = [];

  for (const cloudEmployee of cloudEmployees) {
    if (!cloudEmployee || typeof cloudEmployee !== "object") {
      continue;
    }

    const normalizedEmployee = {
      ...cloudEmployee,
      companyId: cloudEmployee.companyId || companyContext.companyId,
      companyName: cloudEmployee.companyName || companyContext.companyName,
      companyFolderName: cloudEmployee.companyFolderName || companyContext.companyFolderName,
      companyStorageId: cloudEmployee.companyStorageId || companyContext.companyStorageId,
      companyUsername: cloudEmployee.companyUsername || companyContext.companyUsername,
      importedFromCloudAt: new Date().toISOString()
    };

    normalizedCloudEmployees.push(normalizedEmployee);
    addEmployeeIdentityToSets(normalizedEmployee, cloudIdentitySets);
  }

  const keptLocalEmployees = localList.filter((employee) => employeeExistsInSets(employee, cloudIdentitySets));
  const cloudEmployeesById = new Map();
  const cloudEmployeesByName = new Map();
  const cloudEmployeesByDocumentId = new Map();

  for (const normalizedEmployee of normalizedCloudEmployees) {
    const identity = getEmployeeIdentity(normalizedEmployee);
    if (identity.employeeId) cloudEmployeesById.set(identity.employeeId, normalizedEmployee);
    if (identity.name) cloudEmployeesByName.set(identity.name, normalizedEmployee);
    if (identity.documentId) cloudEmployeesByDocumentId.set(identity.documentId, normalizedEmployee);
  }

  const updatedLocalEmployees = keptLocalEmployees.map((employee) => {
    const identity = getEmployeeIdentity(employee);
    const cloudEmployee =
    identity.documentId && cloudEmployeesByDocumentId.get(identity.documentId) ||
    identity.employeeId && cloudEmployeesById.get(identity.employeeId) ||
    identity.name && cloudEmployeesByName.get(identity.name);

    if (!cloudEmployee) {
      return employee;
    }

    return {
      ...employee,
      ...cloudEmployee,
      localUpdatedFromCloudAt: new Date().toISOString()
    };
  });

  for (const employee of updatedLocalEmployees) {
    addEmployeeIdentityToSets(employee, nextIdentitySets);
  }

  const missingEmployees = normalizedCloudEmployees.filter((employee) => {
    if (employeeExistsInSets(employee, nextIdentitySets)) {
      return false;
    }
    addEmployeeIdentityToSets(employee, nextIdentitySets);
    return true;
  });

  const nextList = [...updatedLocalEmployees, ...missingEmployees];
  const changedLocalCount = updatedLocalEmployees.filter((employee, index) =>
  JSON.stringify(employee) !== JSON.stringify(keptLocalEmployees[index])
  ).length;
  const added = missingEmployees.length;
  const updated = changedLocalCount;
  const removed = localList.length - keptLocalEmployees.length;

  if (added === 0 && updated === 0 && removed === 0) {
    return {
      added: 0,
      updated: 0,
      removed: 0,
      employees: localList
    };
  }

  await Promise.all([
  setPrivateItem(companyEmployeesKey, nextList),
  rememberCompanyFolder(companyContext)]
  );

  const activeEmployee = await getPrivateItem(KEYS.secureEmployee);
  if (
  activeEmployee &&
  employeeBelongsToCompany(activeEmployee, companyContext) &&
  !employeeExistsInSets(activeEmployee, nextIdentitySets))
  {
    await deletePrivateItem(KEYS.secureEmployee);
  }

  return {
    added,
    updated,
    removed,
    employees: nextList
  };
}

export async function refreshMissingEmployeesFromCloud(companySource = null) {
  const cloudEmployees = await fetchCompanyEmployeesFromCloud();
  return mergeMissingEmployeesFromCloud(cloudEmployees, companySource);
}

export async function deleteEmployee(employeeId, companySource = null) {
  const activeEmployee = await getEmployee();
  const companyContext = await resolveCompanyContext(companySource || activeEmployee);
  const companyEmployeesKey = getCompanyEmployeesKey(companyContext.companyStorageId);
  const list = await getAllEmployees(companyContext);
  const updatedList = list.filter((emp) => emp.employeeId !== employeeId);
  const legacyList = await getPrivateItem(LEGACY_EMPLOYEES_LIST_KEY);
  const updatedLegacyList = Array.isArray(legacyList) ?
  legacyList.filter((emp) => emp.employeeId !== employeeId) :
  null;

  await Promise.all([
  setPrivateItem(companyEmployeesKey, updatedList),
  updatedLegacyList ? setPrivateItem(LEGACY_EMPLOYEES_LIST_KEY, updatedLegacyList) : Promise.resolve()]
  );

  if (activeEmployee && activeEmployee.employeeId === employeeId) {
    await clearEmployee();
  }
}

export async function clearEmployee() {
  await deletePrivateItem(KEYS.secureEmployee);
}

export async function saveCompanySession(session) {
  await setPrivateItem(KEYS.companySession, session);
  return session;
}

export async function getCompanySession() {
  return getPrivateItem(KEYS.companySession);
}

export async function saveCompanyProfile(profile) {
  const next = {
    companyName: profile?.companyName || "Company",
    username: profile?.username || null,
    settings: profile?.settings || null,
    updatedAt: profile?.updatedAt || new Date().toISOString()
  };
  companyProfileMemoryCache = next;
  await setPrivateItem(KEYS.companyProfile, next);
  return next;
}

export async function getCompanyProfile() {
  if (companyProfileMemoryCache) {
    return companyProfileMemoryCache;
  }

  const stored = await getPrivateItem(KEYS.companyProfile);
  if (stored) {
    companyProfileMemoryCache = stored;
  }
  return stored;
}

export async function clearCompanyProfile() {
  companyProfileMemoryCache = null;
  await deletePrivateItem(KEYS.companyProfile);
}

export async function clearCompanySession() {
  await deletePrivateItem(KEYS.companySession);
  await clearCompanyProfile();
}

export async function addAttendanceRecord(record) {
  const activeEmployee = await getEmployee();
  const companyContext = await resolveCompanyContext(record || activeEmployee);
  const timestamp = record.timestamp || getIndianTimestamp();
  const date = getAttendanceDate(timestamp);
  const employees = await getAllEmployees(companyContext);
  const employeeDocumentId = record.employeeDocumentId || getEmployeeFirestoreDocumentId(record);
  const normalizedRecord = {
    id: getAttendanceQueueId(record, companyContext, date),
    ...record,
    employeeId: record.employeeId || null,
    name: record.name || null,
    employeeDocumentId,
    companyId: record.companyId || companyContext.companyId,
    companyName: record.companyName || companyContext.companyName,
    companyFolderName: record.companyFolderName || companyContext.companyFolderName,
    companyStorageId: record.companyStorageId || companyContext.companyStorageId,
    companyDocumentId: record.companyDocumentId || getCompanyFirestoreDocumentId(companyContext),
    date,
    timestamp,
    attendedAt: record.attendedAt || timestamp,
    lastVerifiedAt: timestamp,
    status: "pending_sync"
  };
  const attendanceKey = getCompanyAttendanceKey(companyContext.companyStorageId);
  const storedAttendance = await getPrivateItem(attendanceKey);
  const currentRecords = Array.isArray(storedAttendance?.records) ? storedAttendance.records : [];
  const previousRecord = currentRecords.find((item) =>
  item.date === date &&
  normalizeCompareValue(item.employeeId || item.name) === normalizeCompareValue(normalizedRecord.employeeId || normalizedRecord.name)
  );

  if (previousRecord) {
    return {
      record: previousRecord,
      attendance: storedAttendance,
      queue: await getAttendanceQueue(),
      alreadyMarked: true
    };
  }

  const recordsWithoutCurrent = currentRecords.filter((item) =>
  item.date !== date ||
  normalizeCompareValue(item.employeeId || item.name) !== normalizeCompareValue(normalizedRecord.employeeId || normalizedRecord.name)
  );
  const localRecord = {
    ...normalizedRecord,
    firstVerifiedAt: normalizedRecord.attendedAt,
    verificationCount: 1
  };
  const nextRecords = [...recordsWithoutCurrent, localRecord].sort((left, right) =>
  String(right.timestamp || "").localeCompare(String(left.timestamp || ""))
  );
  const dateSheets = {
    ...(storedAttendance?.dateSheets || {}),
    [date]: buildDailyAttendanceSheet(date, nextRecords, employees)
  };
  const nextAttendance = {
    companyName: companyContext.companyName,
    companyFolderName: companyContext.companyFolderName,
    companyStorageId: companyContext.companyStorageId,
    records: nextRecords,
    dateSheets,
    updatedAt: getIndianTimestamp()
  };

  const queue = await getAttendanceQueue();
  const queueWithoutCurrent = queue.filter((item) => item.id !== localRecord.id);
  const nextQueue = [
  ...queueWithoutCurrent,
  localRecord];


  await Promise.all([
  setPrivateItem(attendanceKey, nextAttendance),
  AsyncStorage.setItem(KEYS.attendanceQueue, JSON.stringify(nextQueue))]
  );

  return {
    record: localRecord,
    attendance: nextAttendance,
    queue: nextQueue
  };
}

export async function getAttendanceQueue() {
  const raw = await AsyncStorage.getItem(KEYS.attendanceQueue);
  return raw ? JSON.parse(raw) : [];
}

export async function getCompanyAttendance(companySource = null) {
  const companyContext = await resolveCompanyContext(companySource);
  const storedAttendance = await getPrivateItem(getCompanyAttendanceKey(companyContext.companyStorageId));

  return storedAttendance || {
    companyName: companyContext.companyName,
    companyFolderName: companyContext.companyFolderName,
    companyStorageId: companyContext.companyStorageId,
    records: [],
    dateSheets: {},
    updatedAt: null
  };
}

export async function getAttendanceRecordForEmployee(employeeOrRecord, date = null) {
  const timestampDate = date || getAttendanceDate(getIndianTimestamp());
  const companyContext = await resolveCompanyContext(employeeOrRecord);
  const storedAttendance = await getCompanyAttendance(companyContext);
  const targetIdentity = normalizeCompareValue(
    employeeOrRecord?.employeeId ||
    employeeOrRecord?.employeeDocumentId ||
    employeeOrRecord?.name
  );

  if (!targetIdentity) {
    return null;
  }

  return (storedAttendance.records || []).find((record) =>
  record.date === timestampDate &&
  normalizeCompareValue(record.employeeId || record.employeeDocumentId || record.name) === targetIdentity
  ) || null;
}

export async function purgeAttendance(ids) {
  const queue = await getAttendanceQueue();
  const next = queue.filter((item) => !ids.includes(item.id));
  await AsyncStorage.setItem(KEYS.attendanceQueue, JSON.stringify(next));
  return next;
}

export async function setNetworkOnline(isOnline) {
  await AsyncStorage.setItem(KEYS.networkOnline, JSON.stringify(Boolean(isOnline)));
  return Boolean(isOnline);
}

export async function getNetworkOnline() {
  const raw = await AsyncStorage.getItem(KEYS.networkOnline);
  return raw === null ? false : JSON.parse(raw);
}

export async function setLastSync(value) {
  await AsyncStorage.setItem(KEYS.lastSync, value);
  return value;
}

export async function getLastSync() {
  return AsyncStorage.getItem(KEYS.lastSync);
}

export async function resetAppState() {
  companyProfileMemoryCache = null;
  const companyFolderIndex = await getCompanyFolderIndex();
  await deletePrivateItem(KEYS.secureEmployee);
  await deletePrivateItem(KEYS.companySession);
  await deletePrivateItem(KEYS.companyProfile);
  await deletePrivateItem(KEYS.companyFolderIndex);
  await deletePrivateItem(LEGACY_EMPLOYEES_LIST_KEY);
  await Promise.all(
    companyFolderIndex.flatMap((item) => [
    deletePrivateItem(getCompanyEmployeesKey(item.companyStorageId)),
    deletePrivateItem(getCompanyAttendanceKey(item.companyStorageId))]
    )
  );
  await AsyncStorage.multiRemove(Object.values(KEYS));
}
