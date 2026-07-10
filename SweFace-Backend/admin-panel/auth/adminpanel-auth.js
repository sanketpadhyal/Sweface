const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const { findCompanyByUsername, getPublicCompany } = require("../../companies/companies");
const { ensureCompanyInFirestore } = require("../../companies/firestoreCompanies");
const { getCompanySettings, isCompanyDurationFinished } = require("../../companies/companySettings");

const router = express.Router();
const JWT_ISSUER = "sweface-backend";
const JWT_AUDIENCE = "sweface-admin-panel";
const JWT_EXPIRES_IN = process.env.ADMIN_PANEL_JWT_EXPIRES_IN || "1d";
const MUMBAI_TIME_ZONE = "Asia/Kolkata";
const ADMIN_COOKIE_NAME = "sweface_admin_session";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Missing JWT_SECRET in .env.");
  }

  if (secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long.");
  }

  return secret;
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getTokenExpiryDate(token) {
  const decoded = jwt.decode(token);

  if (!decoded || typeof decoded.exp !== "number") {
    return null;
  }

  return new Date(decoded.exp * 1000).toISOString();
}

function getTodayDate() {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: MUMBAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getCookie(req, name) {
  const cookieHeader = req.get("cookie") || "";

  if (!cookieHeader) {
    return "";
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const target = `${name}=`;
  const cookie = cookies.find((item) => item.startsWith(target));

  if (!cookie) {
    return "";
  }

  return decodeURIComponent(cookie.slice(target.length));
}

function isSecureRequest(req) {
  return req.secure || req.get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production";
}

function getCookieBaseOptions(req) {
  const secure = isSecureRequest(req);

  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/"
  };
}

function getCookieOptions(req, token) {
  const expiresAt = token ? getTokenExpiryDate(token) : null;
  const maxAge = expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0;

  return {
    ...getCookieBaseOptions(req),
    ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
    maxAge
  };
}

function requireAdminPanelAuth(req, res, next) {
  const authHeader = req.get("authorization") || "";
  const [scheme, bearerToken] = authHeader.split(" ");
  const token = getCookie(req, ADMIN_COOKIE_NAME) || (scheme === "Bearer" ? bearerToken : "");

  if (!token) {
    return res.status(401).json({ message: "Admin authorization token required." });
  }

  try {
    req.admin = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"]
    });

    if (req.admin?.scope !== "admin-panel") {
      return res.status(403).json({ message: "Admin session scope is not allowed." });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired admin session." });
  }
}

router.post("/login", async (req, res, next) => {
  const { username, password } = req.body || {};

  try {
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Username and password are required." });
    }

    if (username.length > 80 || password.length > 200) {
      return res.status(400).json({ message: "Invalid username or password." });
    }

    const company = findCompanyByUsername(username);
    const validUsername = Boolean(company) && timingSafeEqualString(username.trim(), company.username);
    const validPassword = Boolean(company) && timingSafeEqualString(password, company.password);

    if (!validUsername || !validPassword) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    await ensureCompanyInFirestore(company);

    const settings = await getCompanySettings(company.id);

    if (isCompanyDurationFinished(settings, getTodayDate())) {
      return res.status(403).json({ message: "Your duration has been finished." });
    }

    const token = jwt.sign({
      scope: "admin-panel",
      companyId: company.id,
      companyName: company.companyName,
      username: company.username
    }, getJwtSecret(), {
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: "HS256",
      jwtid: crypto.randomUUID()
    });

    const expiresAt = getTokenExpiryDate(token);

    res.cookie(ADMIN_COOKIE_NAME, token, getCookieOptions(req, token));

    return res.json({
      message: "Admin login successful.",
      expiresIn: JWT_EXPIRES_IN,
      expiresAt,
      company: {
        ...getPublicCompany(company),
        settings
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAdminPanelAuth, (req, res) => {
  res.json({
    authenticated: true,
    admin: req.admin
  });
});

router.post("/logout", (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, getCookieBaseOptions(req));
  res.json({
    message: "Admin session cleared."
  });
});

module.exports = {
  adminPanelAuthRouter: router,
  requireAdminPanelAuth
};
