import {
  getAttendanceQueue,
  purgeAttendance,
  getCompanySession,
  setLastSync,
  saveCompanySession
} from "./storage";
import { buildApiUrl } from "./apiConfig";

const ATTENDANCE_SYNC_TIMEOUT_MS = 12000;
const MUMBAI_TIME_ZONE = "Asia/Kolkata";
const INTERNET_CONNECTION_ERROR = "Internet connection error. Attendance remains queued locally.";

function getIndianTimestamp(value = null) {
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

  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}+05:30`;
}

function getCompanyStorageId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getSessionCompanyKeys(session) {
  return new Set([
    session?.companyId,
    session?.company?.id,
    session?.companyName,
    session?.company?.companyName,
    session?.username,
    getCompanyStorageId(session?.companyName || session?.company?.companyName),
    getCompanyStorageId(session?.companyId || session?.company?.id)
  ].filter(Boolean).map((value) => String(value).trim().toLowerCase()));
}

function attendanceRecordMatchesSession(record, sessionKeys) {
  const recordKeys = [
    record?.companyId,
    record?.companyDocumentId,
    record?.companyName,
    record?.companyFolderName,
    record?.companyStorageId,
    record?.companyUsername,
    getCompanyStorageId(record?.companyName || record?.companyFolderName),
    getCompanyStorageId(record?.companyDocumentId || record?.companyId)
  ].filter(Boolean).map((value) => String(value).trim().toLowerCase());

  return recordKeys.some((key) => sessionKeys.has(key));
}

export async function syncPendingAttendance() {
  const queue = await getAttendanceQueue();

  if (!queue.length) {
    return {
      uploaded: 0,
      remaining: 0,
      mode: "idle"
    };
  }

  const session = await getCompanySession().catch(() => null);

  if (!session?.token) {
    throw new Error("Company login is required to sync attendance.");
  }

  const sessionCompanyKeys = getSessionCompanyKeys(session);
  const uploadQueue = queue.filter((record) => attendanceRecordMatchesSession(record, sessionCompanyKeys));

  if (!uploadQueue.length) {
    return {
      uploaded: 0,
      remaining: queue.length,
      mode: "waiting_for_matching_company_login"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ATTENDANCE_SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(buildApiUrl("/attendance/sync"), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `${session.tokenType || "Bearer"} ${session.token}`
      },
      body: JSON.stringify({
        records: uploadQueue
      })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message && !/server|backend|internal|failed/i.test(payload.message)
        ? payload.message
        : INTERNET_CONNECTION_ERROR);
    }

    if (payload.settings) {
      await saveCompanySession({
        ...session,
        settings: payload.settings,
        company: {
          ...(session.company || {}),
          settings: payload.settings
        }
      });
    }

    const syncedIds = Array.isArray(payload.syncedIds) ? payload.syncedIds : [];
    const rejectedIds = Array.isArray(payload.rejectedIds) ? payload.rejectedIds : [];
    const purgeIds = [...new Set([...syncedIds, ...rejectedIds])];
    const nextQueue = await purgeAttendance(purgeIds.length ? purgeIds : uploadQueue.map((record) => record.id));
    const syncedAt = await setLastSync(getIndianTimestamp());

    return {
      uploaded: syncedIds.length,
      rejected: rejectedIds.length,
      remaining: nextQueue.length,
      syncedAt,
      mode: "backend",
      dates: payload.dates || []
    };
  } catch (error) {
    if (
      error?.name === "AbortError" ||
      /network|failed to fetch|server|backend|internal|sync failed/i.test(String(error?.message || ""))
    ) {
      throw new Error(INTERNET_CONNECTION_ERROR);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
