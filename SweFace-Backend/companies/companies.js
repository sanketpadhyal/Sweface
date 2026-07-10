const crypto = require("crypto");

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readIndexedCompanies() {
  const companies = [];

  for (let index = 1; index <= 20; index += 1) {
    const prefix = `COMPANY_${index}_`;
    const companyName = process.env[`${prefix}NAME`];
    const username = process.env[`${prefix}USERNAME`];
    const password = process.env[`${prefix}PASSWORD`];

    if (!companyName && !username && !password) {
      continue;
    }

    if (!companyName || !username || !password) {
      throw new Error(`Missing ${prefix}NAME, ${prefix}USERNAME, or ${prefix}PASSWORD in .env.`);
    }

    companies.push({
      id: process.env[`${prefix}ID`] || normalizeId(companyName),
      companyName,
      username,
      password,
      envIndex: index
    });
  }

  return companies;
}

function readLegacyCompany() {
  const username = process.env.USERNAME;
  const password = process.env.PASSWORD;
  const companyName = process.env.COMPANY_NAME || "Company";

  if (!username || !password) {
    return [];
  }

  return [{
    id: normalizeId(companyName),
    companyName,
    username,
    password,
    envIndex: null
  }];
}

function getCompanies() {
  const companies = readIndexedCompanies();
  return companies.length > 0 ? companies : readLegacyCompany();
}

function getDefaultCompany() {
  const [company] = getCompanies();
  return company || {
    id: "company",
    companyName: "Company",
    username: null,
    password: null,
    envIndex: null
  };
}

function getPublicCompany(company) {
  if (!company) return null;

  return {
    id: company.id,
    companyName: company.companyName,
    username: company.username
  };
}

function getPublicCompanies() {
  return getCompanies().map(getPublicCompany);
}

function findCompanyByUsername(username) {
  const normalizedUsername = String(username || "").trim();
  return getCompanies().find((company) => company.username === normalizedUsername) || null;
}

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
}

function getFirestoreCompany(company) {
  return {
    id: company.id,
    companyName: company.companyName,
    username: company.username,
    passwordHash: hashPassword(company.password),
    authSource: "env",
    active: true,
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  findCompanyByUsername,
  getCompanies,
  getDefaultCompany,
  getFirestoreCompany,
  getPublicCompanies,
  getPublicCompany,
  hashPassword
};
