const normalizedApiUrl = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");

export const API_BASE_URL = normalizedApiUrl;
export const API_BASE_URLS = API_BASE_URL ? [API_BASE_URL] : [];

export function buildApiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error("Missing EXPO_PUBLIC_API_URL.");
  }

  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
