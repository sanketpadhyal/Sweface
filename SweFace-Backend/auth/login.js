const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const { findCompanyByUsername, getPublicCompany } = require("../companies/companies");
const { ensureCompanyInFirestore } = require("../companies/firestoreCompanies");
const { getCompanySettings, isCompanyDurationFinished } = require("../companies/companySettings");

const router = express.Router();
const JWT_ISSUER = "sweface-backend";
const JWT_AUDIENCE = "sweface-company-app";
const MUMBAI_TIME_ZONE = "Asia/Kolkata";

function getJwtExpiry() {
  return process.env.JWT_EXPIRES_IN || "1h";
}

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

function requireAuth(req, res, next) {
  const authHeader = req.get("authorization") || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authorization token required." });
  }

  try {
    req.user = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
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
      companyId: company.id,
      companyName: company.companyName,
      username: company.username
    }, getJwtSecret(), {
      expiresIn: getJwtExpiry(),
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    return res.json({
      message: "Login successful.",
      token,
      tokenType: "Bearer",
      expiresIn: getJwtExpiry(),
      company: {
        ...getPublicCompany(company),
        settings
      },
      companyName: company.companyName,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const settings = await getCompanySettings(req.user?.companyId);

    res.json({
      authenticated: true,
      user: req.user,
      company: {
        id: req.user?.companyId || null,
        companyName: req.user?.companyName || null,
        username: req.user?.username || null,
        settings
      },
      settings
    });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  authRouter: router,
  requireAuth,
};
