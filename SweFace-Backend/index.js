const path = require("path");

require("dotenv").config({
  path: process.env.DOTENV_CONFIG_PATH || path.join(__dirname, ".env"),
  override: process.env.NODE_ENV !== "production" && !process.env.K_SERVICE
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught startup/runtime exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled startup/runtime rejection:", error);
  process.exit(1);
});

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { authRouter, requireAuth } = require("./auth/login");
const { adminPanelAuthRouter, requireAdminPanelAuth } = require("./admin-panel/auth/adminpanel-auth");
const { adminPanelRouter } = require("./admin-panel/adminpanel");
const { userFaceRouter } = require("./user-face/user-and-face-entry");
const { attendanceRouter } = require("./attendance/attendance");
const { getDefaultCompany, getPublicCompanies } = require("./companies/companies");
const { syncEnvCompaniesToFirestore } = require("./companies/firestoreCompanies");

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.K_SERVICE ? "0.0.0.0" : (process.env.HOST || "0.0.0.0");
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS) || 1;
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5173",
  "https://sweface.netlify.app",
  "https://admin.sweface.netlify.app"
];

function normalizeOrigin(origin) {
  try {
    const url = new URL(String(origin).trim());
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch (error) {
    return String(origin || "")
      .trim()
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}

function isLocalDevelopmentOrigin(origin) {
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch (error) {
    return false;
  }
}

function getAllowedCorsOrigins() {
  return (process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGINS.join(","))
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
}

const allowedCorsOrigins = getAllowedCorsOrigins();

app.set("trust proxy", TRUST_PROXY_HOPS);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.path === "/health",
  validate: { trustProxy: false },
  message: {
    message: "Too many requests. Please try again later.",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  validate: { trustProxy: false },
  message: {
    message: "Too many login attempts. Please try again after 15 minutes.",
  },
});

const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.ADMIN_PANEL_AUTH_RATE_LIMIT_MAX_REQUESTS) || 4,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  validate: { trustProxy: false },
  message: {
    message: "Too many admin login attempts. Please try again after 15 minutes.",
  },
});

const adminPanelLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.ADMIN_PANEL_RATE_LIMIT_MAX_REQUESTS) || 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: {
    message: "Too many admin panel requests. Please slow down and try again later.",
  },
});

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    const normalizedOrigin = normalizeOrigin(origin);

    if (!origin || allowedCorsOrigins.includes("*") || allowedCorsOrigins.includes(normalizedOrigin) || isLocalDevelopmentOrigin(origin)) {
      callback(null, true);
      return;
    }

    console.warn("Blocked CORS origin:", {
      receivedOrigin: origin,
      normalizedOrigin,
      allowedOrigins: allowedCorsOrigins
    });
    callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: "500kb" }));
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(generalLimiter);

app.get("/", (req, res) => {
  const defaultCompany = getDefaultCompany();
  res.json({
    message: "SweFace backend is running.",
    companyName: defaultCompany.companyName
  });
});

app.get("/health", (req, res) => {
  const defaultCompany = getDefaultCompany();
  res.json({
    status: "ok",
    companyName: defaultCompany.companyName
  });
});

app.get("/info", (req, res) => {
  const defaultCompany = getDefaultCompany();
  res.json({
    companyName: defaultCompany.companyName,
    companies: getPublicCompanies()
  });
});

app.use("/auth", authLimiter, authRouter);
app.use("/admin-panel/auth", adminAuthLimiter, adminPanelAuthRouter);
app.use("/admin-panel", adminPanelLimiter, requireAdminPanelAuth, adminPanelRouter);
app.use("/employees", requireAuth, userFaceRouter);
app.use("/attendance", requireAuth, attendanceRouter);

app.get("/protected", requireAuth, (req, res) => {
  res.json({
    message: "You are authenticated.",
    user: req.user,
  });
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    message: process.env.NODE_ENV === "production" ? "Internal server error." : (error?.message || "Internal server error.")
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`SweFace backend running on ${HOST}:${PORT}`, {
    nodeEnv: process.env.NODE_ENV || null,
    cloudRunService: process.env.K_SERVICE || null
  });

  if (process.env.AUTO_SYNC_ENV_COMPANIES !== "false") {
    syncEnvCompaniesToFirestore()
      .then((companies) => {
        console.log(`Auto-synced ${companies.length} env companies to Firestore.`);
      })
      .catch((error) => {
        console.warn("Env company Firestore auto-sync skipped:", error?.message || error);
      });
  }
});

server.on("error", (error) => {
  console.error(`SweFace backend failed to listen on ${HOST}:${PORT}`, error);
  process.exit(1);
});
