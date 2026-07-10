import { getCompanyProfile, saveCompanyProfile, saveCompanySession } from "./storage";
import { buildApiUrl } from "./apiConfig";

const INTERNET_CONNECTION_ERROR = "Internet connection error. Please check your connection and try again.";

export function buildCompanyProfile(info = {}, session = null, cached = null) {
  return {
    companyName: session?.companyName || session?.company?.companyName || info.companyName || cached?.companyName || "Company",
    username: session?.username || cached?.username || null,
    settings: session?.company?.settings || session?.settings || info.company?.settings || info.settings || cached?.settings || null,
    updatedAt: new Date().toISOString()
  };
}

export async function fetchLatestCompanyInfo(session = null) {
  let response;

  try {
    response = await fetch(buildApiUrl(session?.token ? "/auth/me" : "/info"), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(session?.token ? { Authorization: `${session.tokenType || "Bearer"} ${session.token}` } : {})
      }
    });
  } catch (error) {
    throw new Error(INTERNET_CONNECTION_ERROR);
  }

  if (!response.ok) {
    throw new Error(INTERNET_CONNECTION_ERROR);
  }

  return response.json();
}





export async function hydrateCompanyProfile({ session = null, onUpdate } = {}) {
  const cached = await getCompanyProfile();

  if (cached?.companyName && typeof onUpdate === "function") {
    onUpdate(cached);
  }

  try {
    const info = await fetchLatestCompanyInfo(session);
    const fresh = buildCompanyProfile(info, session, cached);
    const changed =
    !cached ||
    cached.companyName !== fresh.companyName ||
    cached.username !== fresh.username ||
    JSON.stringify(cached.settings || null) !== JSON.stringify(fresh.settings || null);

    await saveCompanyProfile(fresh);
    if (session && fresh.settings) {
      await saveCompanySession({
        ...session,
        settings: fresh.settings,
        company: {
          ...(session.company || {}),
          settings: fresh.settings
        }
      });
    }

    if (changed && typeof onUpdate === "function") {
      onUpdate(fresh);
    }

    return fresh;
  } catch (error) {
    console.warn("Could not refresh company profile:", error?.message || error);
    return cached;
  }
}

export async function cacheCompanyProfileAfterLogin(session, info = null) {
  let resolvedInfo = info;

  if (!resolvedInfo) {
    try {
      resolvedInfo = await fetchLatestCompanyInfo(session);
    } catch (error) {
      console.warn("Could not fetch company profile at login:", error?.message || error);
      resolvedInfo = {};
    }
  }

  const cached = await getCompanyProfile();
  const profile = buildCompanyProfile(resolvedInfo, session, cached);
  return saveCompanyProfile(profile);
}
