import React, { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Lenis from "lenis";
import "./adminpanel.css";
import logoImg from "../assets/logo.png";
import nameImg from "../assets/name.png";

const ADMIN_SESSION_KEY = "swefaceAdminSession";
const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/+$/, "");
const ADMIN_DASHBOARD_CACHE_PREFIX = "swefaceAdminDashboardCache:v5:";
const ADMIN_EMPLOYEE_CACHE_PREFIX = "swefaceAdminEmployeeAttendance:v5:";
const ADMIN_DATE_CACHE_PREFIX = "swefaceAdminDateAttendance:v5:";
const ADMIN_DB_NAME = "sweface-admin-cache";
const ADMIN_DB_STORE = "records";
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_COMPANY_SETTINGS = {
  subscription: {
    startDate: "",
    endDate: ""
  },
  attendance: {
    expectedTime: "09:30",
    graceMinutes: 10
  }
};
const HOURS_12 = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

function openAdminCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ADMIN_DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(ADMIN_DB_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCache(key) {
  try {
    const db = await openAdminCache();
    const cached = await new Promise((resolve, reject) => {
      const request = db.transaction(ADMIN_DB_STORE, "readonly").objectStore(ADMIN_DB_STORE).get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    if (!cached || Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      await deleteCache(key);
      return null;
    }

    return cached.value;
  } catch (error) {
    return null;
  }
}

async function writeCache(key, value) {
  try {
    const db = await openAdminCache();
    await new Promise((resolve, reject) => {
      const request = db.transaction(ADMIN_DB_STORE, "readwrite").objectStore(ADMIN_DB_STORE).put({
        key,
        cachedAt: Date.now(),
        value
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return undefined;
  }
}

async function deleteCache(key) {
  try {
    const db = await openAdminCache();
    await new Promise((resolve, reject) => {
      const request = db.transaction(ADMIN_DB_STORE, "readwrite").objectStore(ADMIN_DB_STORE).delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return undefined;
  }
}

async function clearAdminCache() {
  try {
    const db = await openAdminCache();
    await new Promise((resolve, reject) => {
      const request = db.transaction(ADMIN_DB_STORE, "readwrite").objectStore(ADMIN_DB_STORE).clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return undefined;
  }
}

function getStoredSession() {
  try {
    const rawSession = localStorage.getItem(ADMIN_SESSION_KEY);
    const session = rawSession ? JSON.parse(rawSession) : null;

    if (!session?.authenticated || !session?.expiresAt || Date.now() >= new Date(session.expiresAt).getTime()) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }

    return session;
  } catch (error) {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
}

function formatSessionDate(value) {
  if (!value) return "1 day";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getIndiaDateParts(value = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value).reduce((result, part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
    return result;
  }, {});
}

function getTodayDate(value = new Date()) {
  const parts = getIndiaDateParts(value);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getTimeFromTimestamp(value) {
  if (!value) return "";
  const match = String(value).match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function getTimeParts12(value) {
  const match = String(value || DEFAULT_COMPANY_SETTINGS.attendance.expectedTime).match(/^(\d{2}):(\d{2})$/);
  const hour24 = match ? Number(match[1]) : 9;
  const minute = match ? match[2] : "30";
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return {
    hour: String(hour12).padStart(2, "0"),
    minute,
    period
  };
}

function getTimeFromParts12(parts) {
  let hour = Number(parts.hour);

  if (parts.period === "AM" && hour === 12) {
    hour = 0;
  } else if (parts.period === "PM" && hour !== 12) {
    hour += 12;
  }

  return `${String(hour).padStart(2, "0")}:${parts.minute}`;
}

function formatTime12(value) {
  const parts = getTimeParts12(value);

  return `${Number(parts.hour)}:${parts.minute} ${parts.period}`;
}

function getTimeMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return 0;

  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutesDuration(value) {
  const minutes = Math.max(0, Number(value) || 0);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours && remainingMinutes) return `${hours}h ${remainingMinutes}m left`;
  if (hours) return `${hours}h left`;
  return `${remainingMinutes}m left`;
}

function getTimeFromMinutes(value) {
  const normalized = ((Number(value) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getAttendanceTimeStatus(selectedDate, attendance, now = new Date()) {
  const today = getTodayDate(now);
  const expectedMinutes = getTimeMinutes(attendance?.expectedTime || DEFAULT_COMPANY_SETTINGS.attendance.expectedTime);
  const graceMinutes = Math.max(0, Number(attendance?.graceMinutes) || 0);
  const cutoffMinutes = expectedMinutes + graceMinutes;
  const cutoffLabel = formatTime12(getTimeFromMinutes(cutoffMinutes));

  if (selectedDate < today) {
    return {
      label: "Time up",
      detail: `Closed after ${cutoffLabel}`
    };
  }

  if (selectedDate > today) {
    return {
      label: "Upcoming",
      detail: `Closes at ${cutoffLabel}`
    };
  }

  const parts = getIndiaDateParts(now);
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);

  if (currentMinutes >= cutoffMinutes) {
    return {
      label: "Time up",
      detail: `Closed after ${cutoffLabel}`
    };
  }

  return {
    label: "Open",
    detail: formatMinutesDuration(cutoffMinutes - currentMinutes)
  };
}

function formatAttendanceTime(value) {
  const time = getTimeFromTimestamp(value);

  return time ? formatTime12(time) : "Not attended";
}

function SkeletonCard() {
  return (
    <div className="admin-skeleton-card">
      <span />
      <strong />
      <i />
    </div>
  );
}

export default function AdminPanel() {
  const adminScrollRef = useRef(null);
  const adminScrollContentRef = useRef(null);
  const adminLenisRef = useRef(null);
  const [form, setForm] = useState({ username: "", password: "" });
  const [session, setSession] = useState(() => getStoredSession());
  const [status, setStatus] = useState(session ? "checking" : "idle");
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [dashboardStatus, setDashboardStatus] = useState("idle");
  const [dashboardError, setDashboardError] = useState("");
  const [companySettings, setCompanySettings] = useState(() => DEFAULT_COMPANY_SETTINGS);
  const [settingsStatus, setSettingsStatus] = useState("idle");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeAttendance, setEmployeeAttendance] = useState(null);
  const [employeeAttendanceStatus, setEmployeeAttendanceStatus] = useState("idle");
  const [selectedDate, setSelectedDate] = useState(() => getTodayDate());
  const [dateAttendance, setDateAttendance] = useState(null);
  const [dateAttendanceStatus, setDateAttendanceStatus] = useState("idle");
  const [timeNow, setTimeNow] = useState(() => new Date());
  const [activeView, setActiveView] = useState(() => {
    const saved = localStorage.getItem("adminActiveView");
    if (saved === "employeeDetail") return "employees";
    return saved || "dashboard";
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isLocalHost =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

  useEffect(() => {
    localStorage.setItem("adminActiveView", activeView);
  }, [activeView]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setTimeNow(new Date());
    }, 30000);

    return () => window.clearTimeout(timeoutId);
  }, [timeNow, selectedDate, companySettings.attendance.expectedTime, companySettings.attendance.graceMinutes]);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      if (!session?.authenticated) return;

      try {
        const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/auth/me`, {
          credentials: "include"
        });
        const payload = await response.json().catch(() => ({}));

        if (!active) return;

        if (!response.ok || !payload.authenticated) {
          localStorage.removeItem(ADMIN_SESSION_KEY);
          setSession(null);
          setStatus("idle");
          return;
        }

        if (payload.admin?.username && !session.username) {
          const updatedSession = { ...session, username: payload.admin.username };
          localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(updatedSession));
          setSession(updatedSession);
        }

        setStatus("authenticated");
      } catch (requestError) {
        if (!active) return;
        setStatus("authenticated");
      }
    }

    verifySession();

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session?.expiresAt) return undefined;

    const expiresInMs = new Date(session.expiresAt).getTime() - Date.now();

    if (expiresInMs <= 0) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      setSession(null);
      setStatus("idle");
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      setSession(null);
      setStatus("idle");
    }, Math.min(expiresInMs, 2147483647));

    return () => window.clearTimeout(timeoutId);
  }, [session?.expiresAt]);

  useEffect(() => {
    if (!session?.authenticated || status === "checking" || !adminScrollRef.current || !adminScrollContentRef.current) {
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowMemoryDevice = navigator.deviceMemory && navigator.deviceMemory <= 2;

    if (prefersReducedMotion || lowMemoryDevice) {
      return undefined;
    }

    const lenis = new Lenis({
      wrapper: adminScrollRef.current,
      content: adminScrollContentRef.current,
      duration: 0.85,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothTouch: false,
      touchMultiplier: 1
    });
    adminLenisRef.current = lenis;
    let frameId;

    function raf(time) {
      lenis.raf(time);
      frameId = requestAnimationFrame(raf);
    }

    frameId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frameId);
      adminLenisRef.current = null;
      lenis.destroy();
    };
  }, [session?.authenticated, status]);

  useEffect(() => {
    if (!session?.authenticated || status === "checking") return;

    if (adminLenisRef.current) {
      adminLenisRef.current.scrollTo(0, { immediate: true });
      return;
    }

    if (adminScrollRef.current) {
      adminScrollRef.current.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [activeView, session?.authenticated, status]);

  useEffect(() => {
    if (!session?.authenticated || status === "checking") return undefined;

    let active = true;

    async function loadDashboard() {
      const dashboardCacheKey = `${ADMIN_DASHBOARD_CACHE_PREFIX}${selectedDate}`;
      const cachedDashboard = await readCache(dashboardCacheKey);

      if (cachedDashboard) {
        setDashboard(cachedDashboard);
        setCompanySettings({
          subscription: {
            startDate: cachedDashboard.settings?.subscription?.startDate || "",
            endDate: cachedDashboard.settings?.subscription?.endDate || ""
          },
          attendance: {
            expectedTime: cachedDashboard.settings?.attendance?.expectedTime || DEFAULT_COMPANY_SETTINGS.attendance.expectedTime,
            graceMinutes: cachedDashboard.settings?.attendance?.graceMinutes ?? DEFAULT_COMPANY_SETTINGS.attendance.graceMinutes
          }
        });
        setDashboardStatus("ready");
      } else {
        setDashboardStatus("loading");
      }

      setDashboardError("");

      try {
        const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/dashboard?endDate=${selectedDate}`, {
          credentials: "include"
        });
        const payload = await response.json().catch(() => ({}));

        if (!active) return;

        if (!response.ok) {
          throw new Error(payload.message || "Unable to load admin dashboard.");
        }

        setDashboard(payload);
        setCompanySettings({
          subscription: {
            startDate: payload.settings?.subscription?.startDate || "",
            endDate: payload.settings?.subscription?.endDate || ""
          },
          attendance: {
            expectedTime: payload.settings?.attendance?.expectedTime || DEFAULT_COMPANY_SETTINGS.attendance.expectedTime,
            graceMinutes: payload.settings?.attendance?.graceMinutes ?? DEFAULT_COMPANY_SETTINGS.attendance.graceMinutes
          }
        });
        await writeCache(dashboardCacheKey, payload);
        setDashboardStatus("ready");
      } catch (requestError) {
        if (!active) return;
        setDashboardStatus("error");
        setDashboardError(requestError.message || "Unable to load admin dashboard.");
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [selectedDate, session?.authenticated, status]);

  useEffect(() => {
    if (!session?.authenticated || status === "checking" || activeView !== "attendance") return undefined;

    let active = true;

    async function loadDateAttendance() {
      const cacheKey = `${ADMIN_DATE_CACHE_PREFIX}${selectedDate}`;
      const cachedDate = await readCache(cacheKey);

      if (cachedDate) {
        setDateAttendance(cachedDate);
        setDateAttendanceStatus("ready");
      } else {
        setDateAttendanceStatus("loading");
      }

      try {
        const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/attendance/${selectedDate}`, {
          credentials: "include"
        });
        const payload = await response.json().catch(() => ({}));

        if (!active) return;

        if (!response.ok) {
          throw new Error(payload.message || "Unable to load date attendance.");
        }

        setDateAttendance(payload);
        await writeCache(cacheKey, payload);
        setDateAttendanceStatus("ready");
      } catch (requestError) {
        if (!active) return;
        setDateAttendanceStatus("error");
        setDateAttendance({
          error: requestError.message || "Unable to load date attendance."
        });
      }
    }

    loadDateAttendance();

    return () => {
      active = false;
    };
  }, [activeView, companySettings.attendance.expectedTime, companySettings.attendance.graceMinutes, selectedDate, session?.authenticated, status]);

  const handleBack = () => {
    if (isLocalHost) {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.href = "/";
      return;
    }

    window.location.href = "https://sweface.netlify.app";
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("submitting");

    try {
      const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "Unable to sign in.");
      }

      const nextSession = {
        authenticated: true,
        expiresAt: payload.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        company: payload.company,
        username: form.username.trim()
      };

      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setForm({ username: "", password: "" });
      setStatus("authenticated");
    } catch (loginError) {
      setStatus("idle");
      setError(loginError.message || "Unable to sign in.");
    }
  };

  const handleLogout = () => {
    const confirmed = window.confirm("Are you sure you want to sign out?");
    if (!confirmed) return;

    fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/auth/logout`, {
      method: "POST",
      credentials: "include"
    }).catch(() => undefined);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem("adminActiveView");
    clearAdminCache();
    setSession(null);
    setStatus("idle");
    setDashboard(null);
    setSelectedEmployee(null);
    setEmployeeAttendance(null);
  };

  const loadEmployeeAttendance = async (employee, attendanceDate = selectedDate) => {
    if (!session?.authenticated || !employee?.employeeDocumentId) return;

    setSelectedEmployee(employee);
    setActiveView("employeeDetail");

    const cacheKey = `${ADMIN_EMPLOYEE_CACHE_PREFIX}${employee.employeeDocumentId}:${attendanceDate}`;
    const cachedAttendance = await readCache(cacheKey);

    if (cachedAttendance) {
      setEmployeeAttendance(cachedAttendance);
      setEmployeeAttendanceStatus("ready");
    } else {
      setEmployeeAttendanceStatus("loading");
      setEmployeeAttendance(null);
    }

    try {
      const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/employees/${encodeURIComponent(employee.employeeDocumentId)}/attendance?endDate=${attendanceDate}`, {
        credentials: "include"
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "Unable to load employee attendance.");
      }

      setEmployeeAttendance(payload);
      await writeCache(cacheKey, payload);
      setEmployeeAttendanceStatus("ready");
    } catch (requestError) {
      setEmployeeAttendanceStatus("error");
      setEmployeeAttendance({
        error: requestError.message || "Unable to load employee attendance."
      });
    }
  };

  const handleSelectedDateChange = (nextDate) => {
    setSelectedDate(nextDate);

    if (activeView === "employeeDetail" && selectedEmployee?.employeeDocumentId) {
      loadEmployeeAttendance(selectedEmployee, nextDate);
    }
  };

  const refreshDashboard = async () => {
    if (!session?.authenticated || isRefreshing) return;

    setIsRefreshing(true);
    try {
      await deleteCache(`${ADMIN_DASHBOARD_CACHE_PREFIX}${selectedDate}`);
      await deleteCache(`${ADMIN_DATE_CACHE_PREFIX}${selectedDate}`);
      if (selectedEmployee?.employeeDocumentId) {
        await deleteCache(`${ADMIN_EMPLOYEE_CACHE_PREFIX}${selectedEmployee.employeeDocumentId}:${selectedDate}`);
      }

      const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/dashboard?endDate=${selectedDate}`, {
        credentials: "include"
      });
      const payload = await response.json().catch(() => ({}));

      if (response.ok) {
        setDashboard(payload);
        setCompanySettings({
          subscription: {
            startDate: payload.settings?.subscription?.startDate || "",
            endDate: payload.settings?.subscription?.endDate || ""
          },
          attendance: {
            expectedTime: payload.settings?.attendance?.expectedTime || DEFAULT_COMPANY_SETTINGS.attendance.expectedTime,
            graceMinutes: payload.settings?.attendance?.graceMinutes ?? DEFAULT_COMPANY_SETTINGS.attendance.graceMinutes
          }
        });
        await writeCache(`${ADMIN_DASHBOARD_CACHE_PREFIX}${selectedDate}`, payload);
        setDashboardStatus("ready");
      }

      if (activeView === "attendance") {
        setDateAttendanceStatus("loading");
        const dateResponse = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/attendance/${selectedDate}`, {
          credentials: "include"
        });
        const datePayload = await dateResponse.json().catch(() => ({}));

        if (dateResponse.ok) {
          setDateAttendance(datePayload);
          await writeCache(`${ADMIN_DATE_CACHE_PREFIX}${selectedDate}`, datePayload);
          setDateAttendanceStatus("ready");
        }
      }

      if (activeView === "employeeDetail" && selectedEmployee?.employeeDocumentId) {
        const employeeResponse = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/employees/${encodeURIComponent(selectedEmployee.employeeDocumentId)}/attendance?endDate=${selectedDate}`, {
          credentials: "include"
        });
        const employeePayload = await employeeResponse.json().catch(() => ({}));

        if (employeeResponse.ok) {
          setEmployeeAttendance(employeePayload);
          await writeCache(`${ADMIN_EMPLOYEE_CACHE_PREFIX}${selectedEmployee.employeeDocumentId}:${selectedDate}`, employeePayload);
          setEmployeeAttendanceStatus("ready");
        }
      }
    } catch (err) {
      console.error("Failed to refresh dashboard:", err);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 700);
    }
  };

  const handleCompanySettingsChange = (section, field, value) => {
    setCompanySettings((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value
      }
    }));
  };

  const handleExpectedTimeChange = (field, value) => {
    const currentParts = getTimeParts12(companySettings.attendance.expectedTime);
    const nextParts = {
      ...currentParts,
      [field]: value
    };

    handleCompanySettingsChange("attendance", "expectedTime", getTimeFromParts12(nextParts));
  };

  const handleCompanySettingsSubmit = async (event) => {
    event.preventDefault();

    if (!session?.authenticated) return;

    setSettingsStatus("saving");
    setSettingsMessage("");

    try {
      const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(companySettings)
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "Unable to save company settings.");
      }

      setCompanySettings({
        subscription: {
          startDate: payload.settings?.subscription?.startDate || "",
          endDate: payload.settings?.subscription?.endDate || ""
        },
        attendance: {
          expectedTime: payload.settings?.attendance?.expectedTime || DEFAULT_COMPANY_SETTINGS.attendance.expectedTime,
          graceMinutes: payload.settings?.attendance?.graceMinutes ?? DEFAULT_COMPANY_SETTINGS.attendance.graceMinutes
        }
      });
      await clearAdminCache();
      await refreshDashboard();
      if (activeView === "employeeDetail" && selectedEmployee?.employeeDocumentId) {
        await loadEmployeeAttendance(selectedEmployee, selectedDate);
      }
      setSettingsStatus("saved");
      setSettingsMessage("Company settings saved. Attendance stats now use this timing.");
    } catch (saveError) {
      setSettingsStatus("error");
      setSettingsMessage(saveError.message || "Unable to save company settings.");
    }
  };

  const handleRemoveEmployee = async () => {
    if (!session?.authenticated || !selectedEmployee?.employeeDocumentId) return;

    const password = window.prompt(`To delete ${selectedEmployee.name || selectedEmployee.employeeId}, please enter your admin password for authorization:`);
    if (password === null) return; // User cancelled

    if (!password) {
      alert("Password is required to authorize deletion.");
      return;
    }

    setEmployeeAttendanceStatus("saving");

    try {
      const authResponse = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: session.username || session.company?.username || "",
          password: password
        })
      });

      const authPayload = await authResponse.json().catch(() => ({}));

      if (!authResponse.ok) {
        throw new Error(authPayload.message || "Incorrect password. Authorization failed.");
      }

      const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}/admin-panel/employees/${encodeURIComponent(selectedEmployee.employeeDocumentId)}`, {
        method: "DELETE",
        credentials: "include"
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "Unable to delete employee.");
      }

      await clearAdminCache();
      await refreshDashboard();
      setSelectedEmployee(null);
      setEmployeeAttendance(null);
      setEmployeeAttendanceStatus("idle");
      setActiveView("employees");
    } catch (requestError) {
      setEmployeeAttendanceStatus("error");
      setEmployeeAttendance({
        error: requestError.message || "Unable to delete employee."
      });
      alert(requestError.message || "Unable to delete employee.");
    }
  };

  const employees = dashboard?.employees || [];
  const filteredEmployees = employees.filter((employee) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [
      employee.name,
      employee.employeeId,
      employee.department,
      employee.role,
      employee.attendance?.latestStatus
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
  const attendanceDates = dashboard?.attendanceDates || [];
  const employeeChart = dashboard?.charts?.employees || [];
  const monthlyChart = dashboard?.charts?.monthly || [];
  const datePresent = dateAttendance?.attendance?.present || [];
  const dateAbsent = dateAttendance?.attendance?.absent || [];
  const dashboardAttendanceSettings = dashboard?.settings?.attendance || companySettings.attendance;
  const dashboardTimeStatus = getAttendanceTimeStatus(selectedDate, dashboardAttendanceSettings, timeNow);
  const attendancePie = [
    { name: "Present", value: datePresent.length, color: "#7ed321" },
    { name: "Absent", value: dateAbsent.length, color: "#111111" }
  ];

  if (session && status !== "checking") {
    return (
      <div className="admin-app-shell">
        <aside className="admin-sidebar" aria-label="Admin navigation">
          <div className="admin-sidebar-brand">
            <img src={logoImg} alt="SweFace logo" />
            <img src={nameImg} alt="SweFace" />
          </div>
          <hr className="admin-sidebar-divider" />
          <nav>
            <button type="button" className={activeView === "dashboard" ? "active" : ""} onClick={() => setActiveView("dashboard")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-icon">
                <rect x="3" y="3" width="7" height="9" rx="1.5" />
                <rect x="14" y="3" width="7" height="5" rx="1.5" />
                <rect x="14" y="12" width="7" height="9" rx="1.5" />
                <rect x="3" y="16" width="7" height="5" rx="1.5" />
              </svg>
              Dashboard
            </button>
            <button type="button" className={activeView === "employees" ? "active" : ""} onClick={() => setActiveView("employees")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-icon">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Manage Employees
            </button>
            <button type="button" className={activeView === "attendance" ? "active" : ""} onClick={() => setActiveView("attendance")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-icon">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <path d="M9 16l2 2 4-4" />
              </svg>
              Attendance Logs
            </button>
            <button type="button" className={activeView === "settings" ? "active" : ""} onClick={() => setActiveView("settings")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="sidebar-icon">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Company Settings
            </button>
          </nav>
        </aside>

        <main className="admin-workspace">
          <section ref={adminScrollRef} className="admin-content" aria-label="Admin dashboard">
            <div ref={adminScrollContentRef} className="admin-content-inner">
              <div className="admin-view-heading">
              <div>
                <h1>{activeView === "dashboard" ? "Dashboard" : activeView === "employees" ? "Manage Employees" : activeView === "attendance" ? "Attendance Logs" : activeView === "employeeDetail" ? "Employee Details" : "Company Settings"}</h1>
              </div>
              <div className="admin-heading-actions">
                {activeView !== "settings" ? (
                  <input
                    className="admin-date-picker"
                    type="date"
                    min={companySettings.subscription.startDate || undefined}
                    max={companySettings.subscription.endDate || undefined}
                    value={selectedDate}
                    onChange={(event) => handleSelectedDateChange(event.target.value)}
                  />
                ) : null}
                <button 
                  type="button" 
                  className={`admin-refresh-button ${isRefreshing ? "refreshing" : ""}`} 
                  onClick={refreshDashboard}
                  disabled={isRefreshing}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="refresh-icon">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                  </svg>
                  Refresh
                </button>
              </div>
              </div>

              {dashboardStatus === "error" ? <div className="admin-alert">{dashboardError}</div> : null}

              {activeView === "dashboard" ? (
              <>
                {dashboardStatus === "loading" && !dashboard ? (
                  <div className="admin-dashboard-stats">
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                ) : (
                  <div className="admin-dashboard-stats">
                    <article>
                      <span>Employees</span>
                      <strong>{employees.length}</strong>
                    </article>
                    <article>
                      <span>Attendance dates</span>
                      <strong>{attendanceDates.length}</strong>
                    </article>
                    <article>
                      <span>Report until</span>
                      <strong>{selectedDate}</strong>
                    </article>
                    <article>
                      <span>Expected time</span>
                      <strong>{formatTime12(dashboardAttendanceSettings.expectedTime)}</strong>
                    </article>
                    <article className={dashboardTimeStatus.label === "Time up" ? "time-up" : ""}>
                      <span>Time status</span>
                      <strong>{dashboardTimeStatus.label}</strong>
                      <p className="admin-muted">{dashboardTimeStatus.detail}</p>
                    </article>
                  </div>
                )}

                <div className="admin-catalog-grid">
                  <section className="admin-chart-card">
                    <h2>Employee Attendance Catalog</h2>
                    {employeeChart.length ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={employeeChart.slice(0, 8)}>
                          <CartesianGrid strokeDasharray="4 4" vertical={false} />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                          <Tooltip />
                          <Bar dataKey="onTimeCount" name="On time" fill="#7ed321" radius={[10, 10, 0, 0]} />
                          <Bar dataKey="lateCount" name="Late" fill="#f59e0b" radius={[10, 10, 0, 0]} />
                          <Bar dataKey="absentCount" name="Absent" fill="#111111" radius={[10, 10, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p>No attendance graph data yet.</p>}
                  </section>

                  <section className="admin-chart-card">
                    <h2>Monthly Timing Graph</h2>
                    {monthlyChart.length ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={monthlyChart}>
                          <CartesianGrid strokeDasharray="4 4" vertical={false} />
                          <XAxis dataKey="month" tickLine={false} axisLine={false} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                          <Tooltip />
                          <Line type="monotone" dataKey="onTimeCount" name="On time" stroke="#7ed321" strokeWidth={4} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="lateCount" name="Late" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="notAttendedCount" name="Absent" stroke="#111111" strokeWidth={3} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : <p>No monthly graph data yet.</p>}
                  </section>
                </div>
              </>
              ) : null}

              {activeView === "employees" ? (
              <>
                <div className="admin-lookup-card">
                  <div className="admin-card-title-row">
                    <h1>Lookup Employee Records</h1>
                  </div>
                  <input
                    type="search"
                    placeholder="Search by employee, department, role, or status"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <div className="admin-lookup-results">
                    {filteredEmployees.slice(0, 4).map((employee) => (
                      <button
                        type="button"
                        key={employee.employeeDocumentId}
                        onClick={() => loadEmployeeAttendance(employee)}
                      >
                        {employee.name || employee.employeeId || employee.employeeDocumentId}
                      </button>
                    ))}
                    {!filteredEmployees.length ? <span>No employee records found</span> : null}
                  </div>
                </div>

                <div className="admin-table-card" id="employees">
                  <div className="admin-table-heading">
                    <h2>Stored Employee Records</h2>
                    <p>This table includes live employee access records stored for your company.</p>
                  </div>

                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Item id</th>
                          <th>Company ID</th>
                          <th>Employee Name</th>
                          <th>Employee Role</th>
                          <th>Department</th>
                          <th>Score</th>
                          <th>Present</th>
                          <th>Absent</th>
                          <th>Date Modified</th>
                          <th>Quick Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmployees.map((employee, index) => (
                          <tr key={employee.employeeDocumentId || employee.employeeId || index}>
                            <td>{index + 1}</td>
                            <td>{employee.employeeId || employee.employeeDocumentId}</td>
                            <td>{employee.name}</td>
                            <td>{employee.role}</td>
                            <td>{employee.department}</td>
                            <td>{employee.attendance?.attendanceScore || 0}%</td>
                            <td>{employee.attendance?.presentCount || 0}</td>
                            <td>{employee.attendance?.absentCount || 0}</td>
                            <td>{employee.updatedAt || employee.registeredAt || "Not available"}</td>
                            <td>
                              <button 
                                type="button" 
                                className="admin-details-button"
                                onClick={() => loadEmployeeAttendance(employee)}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="details-icon">
                                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                                Details
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!filteredEmployees.length ? (
                          <tr>
                            <td colSpan="10">No employees available.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
              ) : null}

              {activeView === "attendance" ? (
              <>
                <section className="admin-detail-card">
                  <div className="admin-date-panel-header">
                    <div className="admin-date-panel-top">
                      <h2>Date Attendance</h2>
                      <input
                        className="admin-date-picker"
                        type="date"
                        min={companySettings.subscription.startDate || undefined}
                        max={companySettings.subscription.endDate || undefined}
                        value={selectedDate}
                        onChange={(event) => handleSelectedDateChange(event.target.value)}
                      />
                    </div>
                    <p className="admin-date-panel-desc">
                      Default is today's attendance. Pick any date to inspect present and absent employees.
                    </p>
                  </div>

                  {dateAttendanceStatus === "loading" && !dateAttendance ? (
                    <div className="admin-dashboard-stats">
                      <SkeletonCard />
                      <SkeletonCard />
                      <SkeletonCard />
                    </div>
                  ) : (
                    <div className="admin-dashboard-stats">
                      <article>
                        <span>Total</span>
                        <strong>{dateAttendance?.attendance?.totalEmployees || 0}</strong>
                      </article>
                      <article>
                        <span>Present</span>
                        <strong>{datePresent.length}</strong>
                      </article>
                      <article>
                        <span>Absent</span>
                        <strong>{dateAbsent.length}</strong>
                      </article>
                      <article>
                        <span>On time</span>
                        <strong>{dateAttendance?.attendance?.punctualityRate || 0}%</strong>
                      </article>
                      <article>
                        <span>Late</span>
                        <strong>{dateAttendance?.attendance?.lateCount || 0}</strong>
                      </article>
                      <article>
                        <span>Avg late</span>
                        <strong>{dateAttendance?.attendance?.averageLateMinutes || 0}m</strong>
                      </article>
                    </div>
                  )}

                  {dateAttendance?.error ? <div className="admin-alert">{dateAttendance.error}</div> : null}
                  {dateAttendance?.attendance?.excludedReason ? <div className="admin-alert">{dateAttendance.attendance.excludedReason}</div> : null}

                  <div className="admin-catalog-grid">
                    <section className="admin-chart-card">
                      <h2>{selectedDate} Overview</h2>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={attendancePie} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={4}>
                            {attendancePie.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </section>

                    <section className="admin-chart-card">
                      <h2>Recent Dates</h2>
                      <div className="admin-date-list">
                        {attendanceDates.slice(0, 8).map((day) => (
                          <button type="button" key={day.date} onClick={() => handleSelectedDateChange(day.date)}>
                            <span>{day.date}</span>
                            <strong>{day.attendedCount} / {day.totalEmployees} present</strong>
                          </button>
                        ))}
                        {!attendanceDates.length ? <p>No attendance dates found in the last year.</p> : null}
                      </div>
                    </section>
                  </div>

                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Employee ID</th>
                          <th>Status</th>
                          <th>Timing</th>
                          <th>Speed</th>
                          <th>Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...datePresent, ...dateAbsent].map((record) => (
                          <tr key={`${record.employeeDocumentId}-${record.status}`}>
                            <td>{record.name || "Unknown"}</td>
                            <td>{record.employeeId || record.employeeDocumentId}</td>
                            <td>{record.status}</td>
                            <td>{formatAttendanceTime(record.timestamp)}</td>
                            <td>{record.timingStatus === "late" ? `${record.lateMinutes}m late` : record.timingStatus}</td>
                            <td>{record.confidence || "-"}</td>
                          </tr>
                        ))}
                        {dateAttendanceStatus === "ready" && !datePresent.length && !dateAbsent.length ? (
                          <tr>
                            <td colSpan="6">No attendance records found for this date.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
              ) : null}

              {activeView === "employeeDetail" && selectedEmployee ? (
              <section className="admin-detail-card">
                <div className="admin-detail-heading">
                  <div>
                    <h2>{selectedEmployee.name || selectedEmployee.employeeId}</h2>
                    <p>{selectedEmployee.employeeId || selectedEmployee.employeeDocumentId}</p>
                    <p>Report range: {employeeAttendance?.range?.startDate || companySettings.subscription.startDate || "Subscription start"} to {employeeAttendance?.range?.endDate || selectedDate}. Sundays are excluded.</p>
                  </div>
                  <div className="admin-detail-actions">
                    <button 
                      type="button" 
                      className="danger admin-delete-btn" 
                      onClick={handleRemoveEmployee}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="delete-btn-icon">
                        <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" />
                      </svg>
                      Delete Employee
                    </button>
                  </div>
                </div>

                <div className="admin-dashboard-stats">
                  <article>
                    <span>Score</span>
                    <strong>{employeeAttendance?.summary?.attendanceScore || 0}%</strong>
                  </article>
                  <article>
                    <span>Present</span>
                    <strong>{employeeAttendance?.summary?.presentCount || 0}</strong>
                  </article>
                  <article>
                    <span>Absent</span>
                    <strong>{employeeAttendance?.summary?.absentCount || 0}</strong>
                  </article>
                  <article>
                    <span>On time</span>
                    <strong>{employeeAttendance?.summary?.punctualityRate || 0}%</strong>
                  </article>
                  <article>
                    <span>Late</span>
                    <strong>{employeeAttendance?.summary?.lateCount || 0}</strong>
                  </article>
                  <article>
                    <span>Avg accuracy</span>
                    <strong>{employeeAttendance?.summary?.averageAccuracyMinutes || 0}m</strong>
                  </article>
                </div>

                {employeeAttendanceStatus === "loading" ? (
                  <div className="admin-dashboard-stats">
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                ) : null}
                {employeeAttendance?.error ? <div className="admin-alert">{employeeAttendance.error}</div> : null}

                <div className="admin-detail-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Timing</th>
                        <th>Speed</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(employeeAttendance?.records || []).map((record) => (
                        <tr key={`${record.date}-${record.status}`}>
                          <td>{record.date}</td>
                          <td>{record.status}</td>
                          <td>{formatAttendanceTime(record.timestamp)}</td>
                          <td>{record.timingStatus === "late" ? `${record.lateMinutes}m late` : record.timingStatus}</td>
                          <td>{record.confidence || "-"}</td>
                        </tr>
                      ))}
                      {employeeAttendanceStatus === "ready" && !(employeeAttendance?.records || []).length ? (
                        <tr>
                          <td colSpan="5">No attendance or absence dates found in the subscription range.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
              ) : null}

            {activeView === "settings" ? (
              <>
                <div className="admin-settings-grid">
                  <article>
                    <span>Company</span>
                    <strong>{session.company?.companyName || "SweFace"}</strong>
                    <p>{session.company?.id || "Company workspace"}</p>
                  </article>
                  <article>
                    <span>Duration</span>
                    <strong>{companySettings.subscription.endDate || "Not set"}</strong>
                    <p>After this date, company login and admin login will show duration finished.</p>
                  </article>
                  <article>
                    <span>Session</span>
                    <strong>Active until {formatSessionDate(session.expiresAt)}</strong>
                    <p>Admin sessions are cached locally and expire automatically.</p>
                  </article>
                </div>

                <form className="admin-settings-form" onSubmit={handleCompanySettingsSubmit}>
                  <div className="admin-table-heading">
                    <h2>Company Setup</h2>
                    <p>Save the active duration and attendance timing rules for this company.</p>
                  </div>

                  <div className="admin-settings-form-grid">
                    <label>
                      Duration from
                      <input
                        type="date"
                        value={companySettings.subscription.startDate}
                        onChange={(event) => handleCompanySettingsChange("subscription", "startDate", event.target.value)}
                      />
                    </label>
                    <label>
                      Duration to
                      <input
                        type="date"
                        value={companySettings.subscription.endDate}
                        onChange={(event) => handleCompanySettingsChange("subscription", "endDate", event.target.value)}
                      />
                    </label>
                    <label>
                      Attendance time
                      <div className="admin-time-select">
                        <select
                          value={getTimeParts12(companySettings.attendance.expectedTime).hour}
                          onChange={(event) => handleExpectedTimeChange("hour", event.target.value)}
                          aria-label="Attendance hour"
                        >
                          {HOURS_12.map((hour) => (
                            <option key={hour} value={hour}>{hour}</option>
                          ))}
                        </select>
                        <select
                          value={getTimeParts12(companySettings.attendance.expectedTime).minute}
                          onChange={(event) => handleExpectedTimeChange("minute", event.target.value)}
                          aria-label="Attendance minute"
                        >
                          {MINUTES.map((minute) => (
                            <option key={minute} value={minute}>{minute}</option>
                          ))}
                        </select>
                        <select
                          value={getTimeParts12(companySettings.attendance.expectedTime).period}
                          onChange={(event) => handleExpectedTimeChange("period", event.target.value)}
                          aria-label="Attendance period"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </label>
                    <label>
                      Grace minutes
                      <input
                        type="number"
                        min="0"
                        max="240"
                        value={companySettings.attendance.graceMinutes}
                        onChange={(event) => handleCompanySettingsChange("attendance", "graceMinutes", event.target.value)}
                      />
                    </label>
                  </div>

                  {settingsMessage ? <p className={settingsStatus === "error" ? "admin-login-error" : "admin-settings-message"}>{settingsMessage}</p> : null}

                  <div className="admin-settings-actions">
                    <button 
                      type="submit" 
                      className={`admin-save-setup-btn ${settingsStatus === "saving" ? "saving" : ""}`} 
                      disabled={settingsStatus === "saving"}
                    >
                      {settingsStatus === "saving" ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="save-icon loading-spin">
                            <line x1="12" y1="2" x2="12" y2="6" />
                            <line x1="12" y1="18" x2="12" y2="22" />
                            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                            <line x1="2" y1="12" x2="6" y2="12" />
                            <line x1="18" y1="12" x2="22" y2="12" />
                            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="save-icon">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                          </svg>
                          Save Setup
                        </>
                      )}
                    </button>
                    <button 
                      type="button" 
                      className="admin-sign-out-btn" 
                      onClick={handleLogout}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sign-out-icon">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </form>
              </>
            ) : null}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-panel-page">
      <form className="admin-login-card" onSubmit={handleLogin}>
        <h1>Administration panel</h1>

        <p className="admin-login-note">
          Use the same company login ID and password here.
        </p>

        <label htmlFor="admin-username">Username:</label>
        <input
          id="admin-username"
          name="username"
          type="text"
          autoComplete="username"
          value={form.username}
          onChange={handleChange}
          disabled={status === "submitting" || status === "checking"}
          required
          autoFocus
        />

        <label htmlFor="admin-password">Password:</label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={handleChange}
          disabled={status === "submitting" || status === "checking"}
          required
        />

        {error ? <p className="admin-login-error">{error}</p> : null}

        <div className="admin-login-actions">
          <button type="submit" disabled={status === "submitting" || status === "checking"}>
            {status === "submitting" || status === "checking" ? "Checking..." : "Sign in"}
          </button>
          <a href="mailto:sanketpadhyal3@gmail.com?subject=SweFace%20admin%20password%20help">
            Forgot your password?
          </a>
        </div>

        <button type="button" className="admin-back-button" onClick={handleBack}>
          Back
        </button>
      </form>
    </div>
  );
}
