import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { API_BASE_URLS } from "../services/apiConfig";
import { setNetworkOnline } from "../services/storage";

const PING_TIMEOUT_MS = 1000;
const REALTIME_HEARTBEAT_MS = 1000;

async function pingBackendUrl(baseUrl) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    return {
      ok: response.ok,
      latencyMs: Date.now() - startedAt,
      statusCode: response.status,
      baseUrl
    };
  } catch {
    return {
      ok: false,
      latencyMs: null,
      statusCode: null,
      baseUrl
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function pingBackend() {
  let lastResult = {
    ok: false,
    latencyMs: null,
    statusCode: null,
    baseUrl: null
  };

  for (const baseUrl of API_BASE_URLS) {
    const result = await pingBackendUrl(baseUrl);
    if (result.ok) return result;
    lastResult = result;
  }

  return lastResult;
}

export default function useNetworkStatus(enabled = true) {
  const [isOnline, setIsOnline] = useState(null);
  const [pingMs, setPingMs] = useState(null);
  const [statusCode, setStatusCode] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const lastPersistedRef = useRef(null);
  const inFlightRef = useRef(false);
  const heartbeatTimerRef = useRef(null);
  const hasResultRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setIsChecking(false);
      return undefined;
    }

    let mounted = true;

    const clearHeartbeatTimer = () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };

    const applyResult = ({ ok, latencyMs, statusCode: nextStatusCode }) => {
      if (!mounted) return;

      setIsOnline(ok);
      setPingMs(ok && latencyMs !== null ? latencyMs : null);
      setStatusCode(nextStatusCode ?? null);
      setIsChecking(false);

      if (lastPersistedRef.current !== ok) {
        lastPersistedRef.current = ok;
        setNetworkOnline(ok).catch(() => {});
      }
    };

    const runCheck = async () => {
      if (!mounted || inFlightRef.current) return;
      inFlightRef.current = true;

      if (!hasResultRef.current) {
        setIsChecking(true);
        setPingMs(null);
        setStatusCode(null);
      }

      try {
        const result = await pingBackend();
        hasResultRef.current = true;
        applyResult(result);
      } catch {
        hasResultRef.current = true;
        applyResult({ ok: false, latencyMs: null, statusCode: null });
      } finally {
        inFlightRef.current = false;
      }
    };

    runCheck();
    heartbeatTimerRef.current = setInterval(runCheck, REALTIME_HEARTBEAT_MS);

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runCheck();
      }
    });

    return () => {
      mounted = false;
      clearHeartbeatTimer();
      appStateSub.remove();
    };
  }, [enabled]);

  return { isOnline, isChecking, pingMs, statusCode };
}
