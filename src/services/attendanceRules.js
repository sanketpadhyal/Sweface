const MUMBAI_TIME_ZONE = "Asia/Kolkata";
const DEFAULT_ATTENDANCE_SETTINGS = {
  expectedTime: "09:30",
  graceMinutes: 10
};

export function normalizeAttendanceSettings(settings = {}) {
  const expectedTime = /^\d{2}:\d{2}$/.test(String(settings?.expectedTime || ""))
    ? settings.expectedTime
    : DEFAULT_ATTENDANCE_SETTINGS.expectedTime;
  const graceMinutes = Number(settings?.graceMinutes);

  return {
    expectedTime,
    graceMinutes: Number.isFinite(graceMinutes) ? Math.max(0, Math.min(240, Math.round(graceMinutes))) : DEFAULT_ATTENDANCE_SETTINGS.graceMinutes
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
    hourCycle: "h23"
  }).formatToParts(safeDate).reduce((result, part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
    return result;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return 0;

  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(value) {
  const normalized = ((Number(value) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTime12(value) {
  const match = String(value || DEFAULT_ATTENDANCE_SETTINGS.expectedTime).match(/^(\d{2}):(\d{2})$/);
  const hour24 = match ? Number(match[1]) : 9;
  const minute = match ? match[2] : "30";
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return `${hour12}:${minute} ${period}`;
}

export function getAttendanceWindowStatus(timestamp, settings = {}) {
  const normalized = normalizeAttendanceSettings(settings);
  const punch = getIndianDateParts(timestamp);
  const today = getIndianDateParts();
  const cutoffMinutes = timeToMinutes(normalized.expectedTime) + normalized.graceMinutes;
  const cutoffLabel = formatTime12(minutesToTime(cutoffMinutes));
  const isPastDate = punch.date < today.date;
  const isFutureDate = punch.date > today.date;
  const isClosed = isPastDate ? false : !isFutureDate && punch.minutes > cutoffMinutes;

  return {
    allowed: !isClosed,
    cutoffLabel,
    message: isClosed ? `Attendance time is over. You are late. Cutoff was ${cutoffLabel}.` : null
  };
}
