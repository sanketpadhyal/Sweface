import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View } from
"react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as NavigationBar from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import SpinnerLoader from "../components/SpinnerLoader";
import NetworkStatusPill from "../components/NetworkStatusPill";
import useNetworkStatus from "../hooks/useNetworkStatus";
import { getEmployee, saveEmployee, getAllEmployees, addAttendanceRecord, getAttendanceQueue, getAttendanceRecordForEmployee, clearCompanySession, getCompanySession, getCompanyProfile, deleteEmployee, refreshMissingEmployeesFromCloud } from "../services/storage";
import { hydrateCompanyProfile } from "../services/companyProfile";
import { buildApiUrl } from "../services/apiConfig";
import { getAttendanceWindowStatus } from "../services/attendanceRules";
import { syncPendingAttendance } from "../services/syncService";
import {
  FACE_ENGINE,
  averageEmbeddings,
  createFaceEmbeddingFromPhoto,
  cosineSimilarity,
  detectFaceLivenessFromPhoto,
  getBestFaceMatch,
  getMatchConfidence,
  isMatch,
  isRealFaceEmbedding,
  isUsableFaceFrame,
  preloadFaceEngine,
  summarizeLivenessFrames } from
"../services/faceEngine";

const PAGE_BG = "#7ED321";

const COMPANY_IDENTIFICATION_MIN_CONFIDENCE = 95;
const COMPANY_IDENTIFICATION_MIN_SIMILARITY = 0.55;
const COMPANY_IDENTIFICATION_REQUIRED_SAMPLE_VOTES = 2;
const DUPLICATE_FACE_MIN_CONFIDENCE = 94;
const DUPLICATE_FACE_MIN_SIMILARITY = 0.5;
const ENROLLMENT_EMBEDDING_SAMPLE_TARGET = 5;
const VERIFY_EMBEDDING_SAMPLE_TARGET = 3;
const COMPANY_EMBEDDING_SAMPLE_TARGET = 3;
const COMPANY_FAST_FRAME_INTERVAL_MS = 35;
const COMPANY_FINAL_SAMPLE_DELAY_MS = 20;
const COMPANY_SMILE_MIN_PROBABILITY = 0.5;
const ANDROID_STATUS_BAR_FALLBACK = 24;
const ANDROID_NAVIGATION_BAR_FALLBACK = 88;
const MUMBAI_TIME_ZONE = "Asia/Kolkata";

const STEPS = [
{
  key: "face",
  icon: "scan-outline",
  label: "Face found",
  instruction: "Look straight at the camera",
  hint: "Keep your face centred in the frame",
  duration: 7
},
{
  key: "singleFace",
  icon: "person-outline",
  label: "One face only",
  instruction: "Stay alone in the frame",
  hint: "Only your face should be visible",
  duration: 7
},
{
  key: "blink",
  icon: "eye-outline",
  label: "Keep blinking",
  instruction: "Keep blinking while looking in camera",
  hint: "Keep blinking until detected",
  duration: 7
},
{
  key: "smile",
  icon: "happy-outline",
  label: "Smile naturally",
  instruction: "Smile naturally",
  hint: "Show your teeth for best detection",
  duration: 7
}];


const VERIFY_STEPS = STEPS.
filter((step) => ["face", "smile"].includes(step.key)).
map((step) => ({
  ...step,
  duration: 3
}));

const COMPANY_VERIFY_STEPS = STEPS.
filter((step) => ["face", "smile"].includes(step.key)).
map((step) => ({
  ...step,
  duration: 3
}));

const DEFAULT_SCAN_FAILURE = {
  title: "Scan incomplete",
  message: "Some checks did not pass. Please retry."
};
const INTERNET_CONNECTION_ERROR = "Internet connection error. Please check your connection and try again.";

const SETTINGS_PANEL_OPEN_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const SETTINGS_PANEL_CLOSE_EASING = Easing.bezier(0.32, 0, 0.67, 0);

async function checkServerFaceDuplicate(employee) {
  const session = await getCompanySession();

  if (!session?.token) {
    throw new Error("Company login required.");
  }

  let response;

  try {
    response = await fetch(buildApiUrl("/employees/check-face"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `${session.tokenType || "Bearer"} ${session.token}`
      },
      body: JSON.stringify({ employee })
    });
  } catch (error) {
    throw new Error(INTERNET_CONNECTION_ERROR);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message && !/server|backend|internal|failed/i.test(payload.message) ?
    payload.message :
    INTERNET_CONNECTION_ERROR);
  }

  return payload;
}

function createStepStatusMap(status = "idle", steps = STEPS) {
  return steps.reduce((result, step) => {
    result[step.key] = status;
    return result;
  }, {});
}

function getJwtExpiryMs(token) {
  try {
    if (typeof atob !== "function") return null;
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    return payload?.exp ? payload.exp * 1000 : null;
  } catch (error) {
    return null;
  }
}

export default function FaceVerificationPage({ route, navigation }) {
  const isCompanyLogin = route?.params?.isCompanyLogin || false;
  const pendingRegistrationEmployee = route?.params?.pendingRegistrationEmployee || null;
  const [kioskStatus, setKioskStatus] = useState(null);
  const [dbEmployees, setDbEmployees] = useState([]);
  const [selectedScanMode, setSelectedScanMode] = useState(route?.params?.selectedScanMode || null);
  const [companyName, setCompanyName] = useState("Company");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const [attendanceQueue, setAttendanceQueue] = useState([]);
  const [companySession, setCompanySession] = useState(null);
  const [sessionExpiredInfo, setSessionExpiredInfo] = useState(null);
  const { isOnline, isChecking, pingMs, statusCode } = useNetworkStatus(
    isCompanyLogin || Boolean(pendingRegistrationEmployee)
  );
  const settingsPanelTranslateY = useRef(new Animated.Value(680)).current;
  const settingsBackdropOpacity = useRef(new Animated.Value(0)).current;
  const syncPanelTranslateY = useRef(new Animated.Value(680)).current;
  const syncBackdropOpacity = useRef(new Animated.Value(0)).current;
  const kioskStatusOpacity = useRef(new Animated.Value(1)).current;

  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = useWindowDimensions();

  const sectionGap = Math.round(Math.max(8, Math.min(18, screenH * 0.015)));
  const androidStatusBarHeight =
  Platform.OS === "android" ? NativeStatusBar.currentHeight || ANDROID_STATUS_BAR_FALLBACK : 0;
  const topSafeArea = Math.max(insets.top, androidStatusBarHeight, 12);
  const bottomSafeArea = Math.max(
    insets.bottom,
    Platform.OS === "android" ? ANDROID_NAVIGATION_BAR_FALLBACK : 12,
    12
  );
  const settingsNavSafeArea = Math.max(insets.bottom, Platform.OS === "android" ? 46 : 12, 12);
  const settingsFooterBottomPadding = settingsNavSafeArea + 2;
  const settingsSheetHeight = Math.min(
    screenH - topSafeArea - 18,
    Math.max(390, Math.round(screenH * 0.48)) + bottomSafeArea
  );
  const syncSheetHeight = Math.min(
    screenH - topSafeArea - 24,
    Math.max(340, Math.round(screenH * 0.42)) + bottomSafeArea
  );
  const [permission, requestPermission] = useCameraPermissions();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [processingScan, setProcessingScan] = useState(false);
  const [pendingAttendance, setPendingAttendance] = useState(null);
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [syncingAttendance, setSyncingAttendance] = useState(false);
  const [scanFailure, setScanFailure] = useState(null);
  const scanFailed = Boolean(scanFailure);
  const [activeStep, setActiveStep] = useState(-1);
  const [criteria, setCriteria] = useState({
    face: false,
    singleFace: false,
    centeredFace: false,
    blink: false,
    smile: false
  });
  const [stepStatuses, setStepStatuses] = useState(createStepStatusMap());
  const [countdown, setCountdown] = useState(0);
  const [stepInstruction, setStepInstruction] = useState("");
  const [stepHint, setStepHint] = useState("");
  const [stepIcon, setStepIcon] = useState("scan-outline");
  const failBannerAnim = useRef(new Animated.Value(0)).current;

  const cameraRef = useRef(null);
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const stepFadeAnim = useRef(new Animated.Value(0)).current;
  const confirmTranslateY = useRef(new Animated.Value(360)).current;
  const confirmBackdropOpacity = useRef(new Animated.Value(0)).current;
  const countdownRef = useRef(null);
  const scanLoopRef = useRef(null);
  const kioskStatusTimerRef = useRef(null);
  const tokenValidationRef = useRef({ token: null, checkedAt: 0 });
  const tokenLogoutRef = useRef(false);


  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-16)).current;
  const cameraFade = useRef(new Animated.Value(0)).current;
  const cameraScale = useRef(new Animated.Value(0.985)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(18)).current;
  const pageFade = useRef(new Animated.Value(0)).current;
  const pageScale = useRef(new Animated.Value(0.97)).current;
  const logoutFade = useRef(new Animated.Value(0)).current;
  const logoutSlide = useRef(new Animated.Value(20)).current;
  const logoutScale = useRef(new Animated.Value(0.985)).current;

  useEffect(() => {
    if (!(isCompanyLogin && sessionExpiredInfo)) return;

    logoutFade.stopAnimation();
    logoutSlide.stopAnimation();
    logoutScale.stopAnimation();

    logoutFade.setValue(0);
    logoutSlide.setValue(20);
    logoutScale.setValue(0.985);

    Animated.parallel([
      Animated.timing(logoutFade, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(logoutSlide, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(logoutScale, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [
    isCompanyLogin,
    logoutFade,
    logoutScale,
    logoutSlide,
    sessionExpiredInfo
  ]);

  const finishCompanySessionLogout = useCallback(async (reason = "expired") => {
    if (tokenLogoutRef.current) return;
    tokenLogoutRef.current = true;

    try {
      await clearCompanySession();
    } catch (error) {
      console.warn("Logout error:", error);
    }

    if (countdownRef.current) clearInterval(countdownRef.current);
    if (scanLoopRef.current) clearInterval(scanLoopRef.current);

    setCompanySession(null);
    getAttendanceQueue().then(setAttendanceQueue).catch(() => {});
    setScanning(false);
    setProcessingScan(false);
    setPendingAttendance(null);
    setMarkingAttendance(false);
    setSyncingAttendance(false);
    setSettingsOpen(false);
    setSyncPanelOpen(false);
    setKioskStatus(null);
    setScanFailure(null);
    setSessionExpiredInfo({
      reason,
      title: reason === "invalid" ? "Company Login Changed" : "Company Login Expired",
      message: "Please login again. Offline attendance stays saved and will sync after you login to the same company."
    });
  }, []);

  const dismissPendingAttendance = useCallback(() => {
    Animated.parallel([
    Animated.timing(confirmTranslateY, {
      toValue: 360,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }),
    Animated.timing(confirmBackdropOpacity, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    })]
    ).start(({ finished }) => {
      if (finished) {
        setPendingAttendance(null);
        setMarkingAttendance(false);
        setKioskStatus(null);
      }
    });
  }, [confirmBackdropOpacity, confirmTranslateY]);

  const showKioskStatus = useCallback((status, autoDismiss = false) => {
    if (kioskStatusTimerRef.current) {
      clearTimeout(kioskStatusTimerRef.current);
      kioskStatusTimerRef.current = null;
    }

    kioskStatusOpacity.stopAnimation();
    kioskStatusOpacity.setValue(1);
    setKioskStatus(status);

    if (!autoDismiss) return;

    kioskStatusTimerRef.current = setTimeout(() => {
      Animated.timing(kioskStatusOpacity, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start(({ finished }) => {
        if (finished) {
          setKioskStatus(null);
          kioskStatusOpacity.setValue(1);
        }
        kioskStatusTimerRef.current = null;
      });
    }, 2000);
  }, [kioskStatusOpacity]);

  const showAlreadyMarkedAttendance = useCallback((record, employeeName = "Employee") => {
    const attendedAt = formatAttendanceTimestamp(record?.attendedAt || record?.timestamp);
    showKioskStatus({
      type: "success",
      message: `${employeeName} attendance is already done${attendedAt ? ` at ${attendedAt}` : ""}.`
    }, true);
  }, [showKioskStatus]);

  const hasAttendanceForToday = useCallback(async (targetEmployee, timestamp) => {
    const date = getIndianDate(timestamp);
    const existingRecord = await getAttendanceRecordForEmployee(targetEmployee, date);

    if (existingRecord) {
      showAlreadyMarkedAttendance(existingRecord, targetEmployee?.name || targetEmployee?.employeeId || "Employee");
      return true;
    }

    return false;
  }, [showAlreadyMarkedAttendance]);

  const ensureAttendanceWindowOpen = useCallback((timestamp) => {
    const attendanceSettings =
    companySession?.company?.settings?.attendance ||
    companySession?.settings?.attendance ||
    null;

    if (!attendanceSettings) {
      return true;
    }

    const status = getAttendanceWindowStatus(timestamp, attendanceSettings);

    if (status.allowed) {
      return true;
    }

    showKioskStatus({
      type: "error",
      message: status.message || "Attendance time is over. You are late."
    }, true);
    return false;
  }, [companySession, showKioskStatus]);

  const confirmPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dy) > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          confirmTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 70 || gestureState.vy > 0.85) {
          dismissPendingAttendance();
          return;
        }

        Animated.spring(confirmTranslateY, {
          toValue: 0,
          tension: 70,
          friction: 9,
          useNativeDriver: true
        }).start();
      }
    })
  ).current;

  const settingsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dy) > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          settingsPanelTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 70 || gestureState.vy > 0.85) {
          closeSettingsPanel();
          return;
        }

        Animated.timing(settingsPanelTranslateY, {
          toValue: 0,
          duration: 240,
          easing: SETTINGS_PANEL_OPEN_EASING,
          useNativeDriver: true
        }).start();
      }
    })
  ).current;

  const syncPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dy) > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          syncPanelTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 70 || gestureState.vy > 0.85) {
          closeSyncPanel();
          return;
        }

        Animated.timing(syncPanelTranslateY, {
          toValue: 0,
          duration: 240,
          easing: SETTINGS_PANEL_OPEN_EASING,
          useNativeDriver: true
        }).start();
      }
    })
  ).current;



  useEffect(() => {
    async function loadEmployee() {
      const triggerAnimations = () => {
        headerFade.setValue(0);
        headerSlide.setValue(-16);
        cameraFade.setValue(0);
        cameraScale.setValue(0.985);
        cardFade.setValue(0);
        cardSlide.setValue(18);
        pageFade.setValue(0);
        pageScale.setValue(0.97);

        Animated.stagger(42, [

        Animated.parallel([
        Animated.timing(pageFade, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(pageScale, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })]
        ),

        Animated.parallel([
        Animated.timing(headerFade, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(headerSlide, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })]
        ),

        Animated.parallel([
        Animated.timing(cameraFade, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(cameraScale, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })]
        ),

        Animated.parallel([
        Animated.timing(cardFade, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(cardSlide, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })]
        )]
        ).start();
      };

      if (isCompanyLogin) {
        const [session, cachedProfile, localEmployees, queue] = await Promise.all([
        getCompanySession(),
        getCompanyProfile(),
        getAllEmployees(),
        getAttendanceQueue()]
        );
        setDbEmployees(localEmployees);
        setAttendanceQueue(queue);
        if (session) {
          setCompanySession(session);
        }
        if (cachedProfile?.companyName) {
          setCompanyName(cachedProfile.companyName);
        }
        setEmployee({ name: "Company Verification Mode", employeeId: "COMP-01" });
        setLoading(false);
        triggerAnimations();

        refreshMissingEmployeesFromCloud().
        then((syncResult) => {
          if (syncResult?.employees) {
            setDbEmployees(syncResult.employees);
          }
        }).
        catch((error) => {
          console.warn("Cloud employee refresh skipped:", error?.message || error);
        });

        hydrateCompanyProfile({
          session,
          onUpdate: (profile) => {
            if (profile?.companyName) {
              setCompanyName(profile.companyName);
            }
            if (profile?.username || profile?.settings) {
              setCompanySession((current) =>
              current ?
              {
                ...current,
                username: profile.username || current.username,
                settings: profile.settings || current.settings,
                company: {
                  ...(current.company || {}),
                  settings: profile.settings || current.company?.settings
                }
              } :
              { username: profile.username, settings: profile.settings || null }
              );
            }
          }
        }).catch(() => {});

        return;
      }

      if (pendingRegistrationEmployee) {
        const [session, cachedProfile] = await Promise.all([
        getCompanySession(),
        getCompanyProfile()]
        );

        if (session) {
          setCompanySession(session);
        }
        if (cachedProfile?.companyName) {
          setCompanyName(cachedProfile.companyName);
        }

        setEmployee(pendingRegistrationEmployee);
        setLoading(false);
        triggerAnimations();
        return;
      }

      const savedEmployee = await getEmployee();
      if (!savedEmployee) {
        navigation.replace("Onboarding");
        return;
      }
      setEmployee(savedEmployee);
      setLoading(false);
      triggerAnimations();
    }
    loadEmployee();
  }, [
  navigation,
  isCompanyLogin,
  pendingRegistrationEmployee,
  headerFade,
  headerSlide,
  cameraFade,
  cameraScale,
  cardFade,
  cardSlide,
  pageFade,
  pageScale]
  );

  useEffect(() => {
    preloadFaceEngine().catch((error) => {
      console.warn("Face engine preload failed:", error?.message || error);
    });
  }, []);

  useEffect(() => {
    if (!isCompanyLogin || isOnline !== true || !companySession?.token || tokenLogoutRef.current) {
      return;
    }

    const token = companySession.token;
    const now = Date.now();

    if (
    tokenValidationRef.current.token === token &&
    now - tokenValidationRef.current.checkedAt < 60_000)
    {
      return;
    }

    let cancelled = false;
    tokenValidationRef.current = { token, checkedAt: now };

    const validateToken = async () => {
      try {
        const response = await fetch(buildApiUrl("/auth/me"), {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `${companySession.tokenType || "Bearer"} ${token}`
          }
        });

        if (cancelled || response.ok) {
          return;
        }

        await finishCompanySessionLogout("invalid");
      } catch {

      }
    };

    validateToken();
    const interval = setInterval(validateToken, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [companySession, finishCompanySessionLogout, isCompanyLogin, isOnline]);

  useEffect(() => {
    if (!isCompanyLogin || !companySession?.token || sessionExpiredInfo) {
      return undefined;
    }

    const checkExpiry = () => {
      const expiryMs = getJwtExpiryMs(companySession.token);
      if (expiryMs && expiryMs <= Date.now()) {
        finishCompanySessionLogout("expired");
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 1000);

    return () => clearInterval(interval);
  }, [companySession, finishCompanySessionLogout, isCompanyLogin, sessionExpiredInfo]);

  const sessionExpiryLabel = useMemo(() => {
    if (!companySession?.token) return null;
    try {

      const parts = companySession.token.split(".");
      if (parts.length < 2) return "Invalid token";
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const decoded = JSON.parse(atob(base64));
      if (!decoded.exp) return "No expiry in token";
      const expiresAt = new Date(decoded.exp * 1000);
      const now = new Date();
      if (expiresAt <= now) return "Session expired";
      const diffMs = expiresAt - now;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHrs / 24);
      if (diffDays > 0) return `Expires in ${diffDays}d ${diffHrs % 24}h`;
      if (diffHrs > 0) return `Expires in ${diffHrs}h ${diffMins % 60}m`;
      return `Expires in ${diffMins}m`;
    } catch (e) {
      return "Could not read expiry";
    }
  }, [companySession]);

  const openSettingsPanel = () => {
    settingsPanelTranslateY.stopAnimation();
    settingsBackdropOpacity.stopAnimation();
    settingsPanelTranslateY.setValue(settingsSheetHeight + bottomSafeArea);
    settingsBackdropOpacity.setValue(0);
    setSettingsOpen(true);
    Animated.parallel([
    Animated.timing(settingsBackdropOpacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    }),
    Animated.timing(settingsPanelTranslateY, {
      toValue: 0,
      duration: 340,
      easing: SETTINGS_PANEL_OPEN_EASING,
      useNativeDriver: true
    })]
    ).start();
  };

  const closeSettingsPanel = (callback) => {
    settingsPanelTranslateY.stopAnimation();
    settingsBackdropOpacity.stopAnimation();
    Animated.parallel([
    Animated.timing(settingsBackdropOpacity, {
      toValue: 0,
      duration: 190,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true
    }),
    Animated.timing(settingsPanelTranslateY, {
      toValue: settingsSheetHeight + bottomSafeArea,
      duration: 260,
      easing: SETTINGS_PANEL_CLOSE_EASING,
      useNativeDriver: true
    })]
    ).start(({ finished }) => {
      if (finished) {
        setSettingsOpen(false);
        if (callback) callback();
      }
    });
  };

  const performSettingsLogout = async () => {
    try {
      await clearCompanySession();
    } catch (e) {
      console.warn("Logout error:", e);
    }
    closeSettingsPanel(() => {
      navigation.replace("Onboarding");
    });
  };

  const handleSettingsLogout = () => {
    Alert.alert(
      "Log out?",
      "Are you sure you want to log out of this company session?",
      [
      {
        text: "Cancel",
        style: "cancel"
      },
      {
        text: "Log Out",
        style: "destructive",
        onPress: performSettingsLogout
      }]

    );
  };

  const handleSettingsGoBack = () => {
    closeSettingsPanel(() => {
      navigation.replace("Onboarding");
    });
  };

  const refreshAttendanceQueue = useCallback(async () => {
    const queue = await getAttendanceQueue();
    setAttendanceQueue(queue);
    return queue;
  }, []);

  const openSyncPanel = useCallback(() => {
    refreshAttendanceQueue().catch(() => {});
    syncPanelTranslateY.stopAnimation();
    syncBackdropOpacity.stopAnimation();
    syncPanelTranslateY.setValue(syncSheetHeight + bottomSafeArea);
    syncBackdropOpacity.setValue(0);
    setSyncPanelOpen(true);
    Animated.parallel([
    Animated.timing(syncBackdropOpacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    }),
    Animated.timing(syncPanelTranslateY, {
      toValue: 0,
      duration: 340,
      easing: SETTINGS_PANEL_OPEN_EASING,
      useNativeDriver: true
    })]
    ).start();
  }, [bottomSafeArea, refreshAttendanceQueue, syncBackdropOpacity, syncPanelTranslateY, syncSheetHeight]);

  const closeSyncPanel = useCallback((callback) => {
    syncPanelTranslateY.stopAnimation();
    syncBackdropOpacity.stopAnimation();
    Animated.parallel([
    Animated.timing(syncBackdropOpacity, {
      toValue: 0,
      duration: 190,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true
    }),
    Animated.timing(syncPanelTranslateY, {
      toValue: syncSheetHeight + bottomSafeArea,
      duration: 260,
      easing: SETTINGS_PANEL_CLOSE_EASING,
      useNativeDriver: true
    })]
    ).start(({ finished }) => {
      if (finished) {
        setSyncPanelOpen(false);
        if (callback) callback();
      }
    });
  }, [bottomSafeArea, syncBackdropOpacity, syncPanelTranslateY, syncSheetHeight]);

  const runAttendanceSync = useCallback(async ({ silent = false } = {}) => {
    if (syncingAttendance) return;

    if (isOnline === false) {
      if (!silent) {
        setKioskStatus({
          type: "error",
          message: "Internet connection error. Attendance stays queued locally."
        });
      }
      await refreshAttendanceQueue();
      return;
    }

    setSyncingAttendance(true);
    try {
      const result = await syncPendingAttendance();
      const uploaded = result.uploaded || 0;
      await refreshAttendanceQueue();
      if (!silent) {
        showKioskStatus({
          type: result.rejected ? "error" : "success",
          message: uploaded ?
          `Synced ${uploaded} attendance ${uploaded === 1 ? "record" : "records"}${result.rejected ? `, skipped ${result.rejected} late ${result.rejected === 1 ? "record" : "records"}` : ""}.` :
          result.rejected ?
          `Skipped ${result.rejected} late attendance ${result.rejected === 1 ? "record" : "records"}.` :
          "Everything is already synced."
        }, true);
      }
    } catch (error) {
      console.error("Manual sync error:", error);
      await refreshAttendanceQueue();
      if (!silent) {
        setKioskStatus({
          type: "error",
          message: "Internet connection error. Attendance remains queued locally."
        });
      }
    } finally {
      setSyncingAttendance(false);
    }
  }, [isOnline, refreshAttendanceQueue, showKioskStatus, syncingAttendance]);

  const handleManualSync = useCallback(() => {
    openSyncPanel();
    runAttendanceSync({ silent: true });
  }, [openSyncPanel, runAttendanceSync]);

  useEffect(() => {
    if (!isCompanyLogin) return;

    refreshAttendanceQueue().catch(() => {});
    if (isOnline === true) {
      runAttendanceSync({ silent: true });
    }
  }, [isCompanyLogin, isOnline]);

  const ensureRegistrationFaceIsAvailable = async (candidateEmployee) => {
    if (isOnline !== true) {
      Alert.alert(
        "Internet Connection Error",
        INTERNET_CONNECTION_ERROR
      );
      return false;
    }

    const existingEmployees = await getAllEmployees(candidateEmployee);
    const duplicateFace = getBestFaceMatch(existingEmployees, candidateEmployee.embedding).
    find((candidate) =>
    candidate?.employee?.employeeId !== candidateEmployee.employeeId &&
    candidate.similarity >= DUPLICATE_FACE_MIN_SIMILARITY &&
    candidate.confidence >= DUPLICATE_FACE_MIN_CONFIDENCE
    );

    if (duplicateFace) {
      const duplicateEmployee = duplicateFace.employee;
      Alert.alert(
        "Face already registered",
        `This face is already used for ${duplicateEmployee.name || "another employee"}${duplicateEmployee.employeeId ? ` (${duplicateEmployee.employeeId})` : ""}. Please use a different employee profile.`,
        [{ text: "OK" }]
      );
      return false;
    }

    try {
      const serverResult = await checkServerFaceDuplicate(candidateEmployee);

      if (serverResult?.duplicate) {
        const match = serverResult.match || {};
        Alert.alert(
          "Face already registered",
          `This face is already used for ${match.name || "another employee"}${match.employeeId ? ` (${match.employeeId})` : ""}. Please use a different employee profile.`,
          [{ text: "OK" }]
        );
        return false;
      }
    } catch (error) {
      Alert.alert(
        "Internet Connection Error",
        error?.message && !/server|backend|internal|failed/i.test(error.message) ?
        error.message :
        INTERNET_CONNECTION_ERROR
      );
      return false;
    }

    return true;
  };

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!pendingAttendance) return;

    confirmTranslateY.setValue(360);
    confirmBackdropOpacity.setValue(0);
    Animated.parallel([
    Animated.timing(confirmBackdropOpacity, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }),
    Animated.spring(confirmTranslateY, {
      toValue: 0,
      tension: 72,
      friction: 10,
      useNativeDriver: true
    })]
    ).start();
  }, [confirmBackdropOpacity, confirmTranslateY, pendingAttendance]);

  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setPositionAsync("relative").catch(() => {});
      NavigationBar.setBackgroundColorAsync(PAGE_BG).catch(() => {});
      NavigationBar.setButtonStyleAsync("dark").catch(() => {});
    }
    return () => {
      if (Platform.OS === "android") {
        NavigationBar.setPositionAsync("relative").catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (scanning) {
      scanLoopRef.current = Animated.loop(
        Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true
        })]
        )
      );
      scanLoopRef.current.start();
    } else {
      scanLoopRef.current?.stop();
      scanLineAnim.setValue(0);
    }
  }, [scanning, scanLineAnim]);

  const animateStepIn = useCallback(() => {
    stepFadeAnim.setValue(0);
    Animated.timing(stepFadeAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [stepFadeAnim]);

  const showStep = useCallback(
    (step, stepIndex) => {
      if (!step) return;
      setActiveStep(stepIndex);
      setStepInstruction(step.instruction);
      setStepHint(step.hint);
      setStepIcon(step.icon);
      animateStepIn();


      let remaining = step.duration;
      setCountdown(step.duration >= 1 ? Math.ceil(remaining) : 0);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (step.duration < 1) {
        return;
      }
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(Math.max(0, Math.ceil(remaining)));
        if (remaining <= 0) {
          clearInterval(countdownRef.current);
        }
      }, 1000);
    },
    [animateStepIn]
  );

  const resetState = () => {
    setCriteria({
      face: false,
      singleFace: false,
      centeredFace: false,
      blink: false,
      smile: false
    });
    setStepStatuses(createStepStatusMap());
    setActiveStep(-1);
    setCountdown(0);
    setStepInstruction("");
    setStepHint("");
    setStepIcon("scan-outline");
    setScanFailure(null);
    setProcessingScan(false);
    setPendingAttendance(null);
    setMarkingAttendance(false);
    failBannerAnim.setValue(0);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const showFailBanner = () => {
    failBannerAnim.setValue(0);
    Animated.spring(failBannerAnim, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true
    }).start();
  };

  const hideFailBanner = () => {
    Animated.timing(failBannerAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        setScanFailure(null);
      }
    });
  };

  const performAbortRegistration = async () => {
    try {
      setScanning(false);
      setProcessingScan(false);
      setPendingAttendance(null);
      setMarkingAttendance(false);
      setActiveStep(-1);
      setCountdown(0);
      if (countdownRef.current) clearInterval(countdownRef.current);
      scanLoopRef.current?.stop();
      scanLineAnim.setValue(0);

      if (employee?.employeeId && !pendingRegistrationEmployee) {
        await deleteEmployee(employee.employeeId);
      }

      navigation.replace("Onboarding");
    } catch (error) {
      console.error(error);
      setScanFailure({
        title: "Abort failed",
        message: "Could not cancel registration. Please try again."
      });
      showFailBanner();
    }
  };

  const handleAbortRegistration = () => {
    if (!isRegistering) return;

    Alert.alert(
      "Abort registration?",
      "Are you sure? Your registration will be cleared and aborted.",
      [
      {
        text: "No",
        style: "cancel"
      },
      {
        text: "Yes, Abort",
        style: "destructive",
        onPress: performAbortRegistration
      }]

    );
  };

  const handleVerifyFace = async () => {
    if (!employee || scanning || processingScan || pendingAttendance || markingAttendance) return;

    if (!permission?.granted) {
      await requestPermission();
      return;
    }

    Alert.alert(
      "Select Scan Mode",
      "Choose the scan mode for face verification:",
      [
      {
        text: "Real Scan",
        onPress: () => {
          setSelectedScanMode("real");
          runVerifyFace(false);
        }
      },
      {
        text: "Simulation (Fake)",
        onPress: () => {
          setSelectedScanMode("simulation");
          runVerifyFace(true);
        }
      }],

      { cancelable: true }
    );
  };

  const runVerifyFace = async (isSimulation) => {
    setScanning(true);
    setProcessingScan(false);
    resetState();

    const isRegisteringNow = !isCompanyLogin && !isRealFaceEmbedding(employee);

    if (isSimulation) {
      try {
        const scanSteps = isRegisteringNow ? STEPS : VERIFY_STEPS;
        setStepStatuses(createStepStatusMap("idle", scanSteps));

        for (let i = 0; i < scanSteps.length; i++) {
          const step = scanSteps[i];
          setActiveStep(i);
          setStepInstruction(step.instruction);
          setStepHint(step.hint);
          setStepStatuses((current) => ({ ...current, [step.key]: "active" }));


          let remaining = 2;
          setCountdown(remaining);
          const interval = setInterval(() => {
            remaining -= 1;
            setCountdown(remaining);
            if (remaining <= 0) clearInterval(interval);
          }, 1000);

          await wait(2000);
          clearInterval(interval);
          setStepStatuses((current) => ({ ...current, [step.key]: "success" }));
          setCriteria((current) => ({
            ...current,
            [step.key]: true
          }));
        }
        setScanning(false);
        setProcessingScan(true);
        setActiveStep(-1);
        setCountdown(0);
        if (countdownRef.current) clearInterval(countdownRef.current);


        const mockEmbedding = Array.from({ length: 128 }, () => Math.random() * 2 - 1);
        const magnitude = Math.sqrt(mockEmbedding.reduce((sum, val) => sum + val * val, 0));
        const normalizedMockEmbedding = mockEmbedding.map((val) => val / magnitude);

        const scannedAt = getIndianTimestamp();

        if (isCompanyLogin) {

          const targetEmp = {
            name: "John Doe",
            employeeId: "SIM-8899",
            department: "Engineering",
            designation: "Developer"
          };
          const similarity = 0.98;
          const confidence = 98;
          if (await hasAttendanceForToday(targetEmp, scannedAt)) {
            setProcessingScan(false);
            return;
          }
          if (!ensureAttendanceWindowOpen(scannedAt)) {
            setProcessingScan(false);
            return;
          }
          setProcessingScan(false);
          setPendingAttendance({
            employee: targetEmp,
            similarity,
            confidence,
            timestamp: scannedAt,
            embeddingProvider: "simulated-liveness",
            selectedScanMode: "simulation",
            shouldSaveEmployee: false
          });
          return;
        }

        if (isRegisteringNow) {
          const enrolledEmployee = {
            ...employee,
            embedding: normalizedMockEmbedding,
            embeddingSamples: [normalizedMockEmbedding],
            embeddingProvider: "simulated-liveness",
            embeddingModel: "MockSFaceModel-128D",
            faceTemplateRegisteredAt: scannedAt,
            faceVerifiedAt: null,
            lastVerificationAt: null
          };
          const canRegister = await ensureRegistrationFaceIsAvailable(enrolledEmployee);
          if (!canRegister) {
            setProcessingScan(false);
            return;
          }

          const savedEmployee = await saveEmployee(enrolledEmployee, { requireCloud: true });
          setEmployee(savedEmployee);
          await wait(900);
          navigation.replace("RegisterSuccess", {
            employee: savedEmployee
          });
          return;
        }


        const similarity = 0.98;
        const confidence = 98;
        const verifiedEmployee = {
          ...employee,
          faceVerifiedAt: employee.faceVerifiedAt || scannedAt,
          lastVerificationAt: scannedAt
        };
        if (await hasAttendanceForToday(verifiedEmployee, scannedAt)) {
          return;
        }
        if (!ensureAttendanceWindowOpen(scannedAt)) {
          return;
        }
        await saveEmployee(verifiedEmployee);
        setEmployee(verifiedEmployee);
        const attendanceResult = await addAttendanceRecord({
          employeeId: employee.employeeId,
          name: employee.name || null,
          employeeDocumentId: employee.employeeDocumentId || null,
          companyName: employee.companyName || null,
          companyFolderName: employee.companyFolderName || null,
          companyDocumentId: employee.companyDocumentId || null,
          timestamp: scannedAt,
          similarity,
          confidence,
          embeddingProvider: "simulated-liveness"
        });
        setAttendanceQueue(attendanceResult.queue || (await getAttendanceQueue()));
        if (isOnline === true) {
          syncPendingAttendance().catch((error) => {
            console.warn("Background attendance sync skipped:", error?.message || error);
          });
        }
        await wait(900);
        navigation.replace("RegisterSuccess", {
          employee: verifiedEmployee,
          isVerification: true,
          similarity,
          confidence
        });

      } catch (error) {
        console.error(error);
        const internetError = isInternetConnectionError(error);
        setScanFailure({
          title: internetError ? "Internet Connection Error" : "Simulation error",
          message: internetError ? INTERNET_CONNECTION_ERROR : error?.message || "An error occurred during simulation."
        });
        showFailBanner();
      } finally {
        setScanning(false);
        setProcessingScan(false);
        setActiveStep(-1);
        setCountdown(0);
      }
      return;
    }


    try {
      const { photo, summary, liveEmbedding, embeddingSamples, embeddingError } = await captureLivenessSequence(isRegisteringNow);

      if (isRegisteringNow && (!photo || !summary.livenessPassed)) {
        setScanFailure(getRegistrationFailure(summary));
        showFailBanner();
        setProcessingScan(false);
        return;
      }

      const verificationPassed = isCompanyLogin ?
      isCompanyScanReady(summary) :
      summary.faceDetected && summary.smileDetected;

      if (!isRegisteringNow && (!photo || !verificationPassed)) {
        if (isCompanyLogin) {
          const failInfo = getCompanyVerificationFailure(summary);
          setKioskStatus({
            type: "error",
            message: `${failInfo.title}: ${failInfo.message}`
          });
          await wait(800);
          setKioskStatus(null);
          return;
        }
        setScanFailure(getVerificationFailure(summary));
        showFailBanner();
        setProcessingScan(false);
        return;
      }

      if (!liveEmbedding) {
        if (isCompanyLogin) {
          setKioskStatus({
            type: "error",
            message: `Scan incomplete: ${embeddingError || "Face model not found."} Please try again.`
          });
          await wait(5000);
          setKioskStatus(null);
          return;
        }
        setScanFailure({
          title: "Face model not saved",
          message: embeddingError || "The face checks passed, but the embedding could not be created. Please retry."
        });
        showFailBanner();
        setProcessingScan(false);
        return;
      }

      const scannedAt = getIndianTimestamp();

      if (isRegisteringNow) {
        const enrolledEmployee = {
          ...employee,
          embedding: liveEmbedding,
          embeddingSamples,
          embeddingProvider: FACE_ENGINE.provider,
          embeddingModel: FACE_ENGINE.modelName,
          faceTemplateRegisteredAt: scannedAt,
          faceVerifiedAt: null,
          lastVerificationAt: null
        };
        const canRegister = await ensureRegistrationFaceIsAvailable(enrolledEmployee);
        if (!canRegister) {
          setProcessingScan(false);
          return;
        }

        const savedEmployee = await saveEmployee(enrolledEmployee, { requireCloud: true });
        setEmployee(savedEmployee);
        navigation.replace("RegisterSuccess", {
          employee: savedEmployee
        });
        return;
      }


      if (isCompanyLogin) {
        const allEmployees = await getAllEmployees();

        if (allEmployees.length === 0) {
          setKioskStatus({
            type: "error",
            message: "Local database is empty. Please register employees first."
          });
          await wait(4000);
          setKioskStatus(null);
          return;
        }

        const candidates = getBestFaceMatch(allEmployees, liveEmbedding);
        const bestCandidate = candidates[0] || null;
        const highestSimilarity = bestCandidate?.similarity || 0;
        const highestConfidence = bestCandidate?.confidence || 0;
        const sampleVotes = embeddingSamples.
        map((embedding) => getBestFaceMatch(allEmployees, embedding)[0]).
        filter((candidate) =>
        candidate &&
        candidate.employee.employeeId === bestCandidate?.employee.employeeId &&
        candidate.similarity >= COMPANY_IDENTIFICATION_MIN_SIMILARITY &&
        candidate.confidence >= COMPANY_IDENTIFICATION_MIN_CONFIDENCE
        );
        const canIdentifyEmployee = Boolean(
          bestCandidate &&
          isMatch(highestSimilarity) &&
          highestSimilarity >= COMPANY_IDENTIFICATION_MIN_SIMILARITY &&
          highestConfidence >= COMPANY_IDENTIFICATION_MIN_CONFIDENCE &&
          sampleVotes.length >= Math.min(COMPANY_IDENTIFICATION_REQUIRED_SAMPLE_VOTES, embeddingSamples.length)
        );

        if (canIdentifyEmployee) {
          const matchedEmployee = bestCandidate.employee;
          const verifiedEmployee = {
            ...matchedEmployee,
            faceVerifiedAt: matchedEmployee.faceVerifiedAt || scannedAt,
            lastVerificationAt: scannedAt
          };
          if (await hasAttendanceForToday(verifiedEmployee, scannedAt)) {
            return;
          }
          if (!ensureAttendanceWindowOpen(scannedAt)) {
            return;
          }
          setPendingAttendance({
            employee: verifiedEmployee,
            similarity: highestSimilarity,
            confidence: highestConfidence,
            timestamp: scannedAt,
            embeddingProvider: FACE_ENGINE.provider,
            selectedScanMode: "real",
            shouldSaveEmployee: true
          });
        } else {
          setKioskStatus({
            type: "error",
            message: `Face not matched.\nConfidence was ${highestConfidence}%. Please hold still and retry.`
          });
          await wait(900);
          setKioskStatus(null);
        }
        return;
      }

      const similarity = cosineSimilarity(employee.embedding, liveEmbedding);
      const confidence = getMatchConfidence(similarity);
      const matched = isMatch(similarity);

      if (matched) {
        const verifiedEmployee = {
          ...employee,
          faceVerifiedAt: employee.faceVerifiedAt || scannedAt,
          lastVerificationAt: scannedAt
        };
        if (await hasAttendanceForToday(verifiedEmployee, scannedAt)) {
          return;
        }
        if (!ensureAttendanceWindowOpen(scannedAt)) {
          return;
        }
        await saveEmployee(verifiedEmployee);
        setEmployee(verifiedEmployee);
        const attendanceResult = await addAttendanceRecord({
          employeeId: employee.employeeId,
          name: employee.name || null,
          employeeDocumentId: employee.employeeDocumentId || null,
          companyName: employee.companyName || null,
          companyFolderName: employee.companyFolderName || null,
          companyDocumentId: employee.companyDocumentId || null,
          timestamp: scannedAt,
          similarity,
          confidence,
          embeddingProvider: FACE_ENGINE.provider
        });
        setAttendanceQueue(attendanceResult.queue || (await getAttendanceQueue()));
        if (isOnline === true) {
          syncPendingAttendance().catch((error) => {
            console.warn("Background attendance sync skipped:", error?.message || error);
          });
        }
        await wait(900);
        navigation.replace("RegisterSuccess", {
          employee: verifiedEmployee,
          isVerification: true,
          similarity,
          confidence
        });
      } else {
        setScanFailure({
          title: "Face not matched",
          message: `The live face passed checks, but the match confidence was ${confidence}%. Need ${FACE_ENGINE.minMatchConfidence}% or higher.`
        });
        showFailBanner();
        setProcessingScan(false);
      }
    } catch (error) {
      console.error(error);
      const internetError = isInternetConnectionError(error);
      if (isCompanyLogin) {
        setKioskStatus({
          type: "error",
          message: internetError ? INTERNET_CONNECTION_ERROR : `Scan error: ${error?.message || "Please try again."}`
        });
        await wait(3000);
        setKioskStatus(null);
      } else {
        setScanFailure({
          title: internetError ? "Internet Connection Error" : "Scan error",
          message: internetError ? INTERNET_CONNECTION_ERROR : error?.message || DEFAULT_SCAN_FAILURE.message
        });
        showFailBanner();
        setProcessingScan(false);
      }
    } finally {
      setScanning(false);
      setProcessingScan(false);
      setActiveStep(-1);
      setCountdown(0);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  };

  const retryPendingAttendance = () => {
    dismissPendingAttendance();
  };

  const confirmPendingAttendance = async () => {
    if (!pendingAttendance || markingAttendance) return;

    setMarkingAttendance(true);
    try {
      if (await hasAttendanceForToday(pendingAttendance.employee, pendingAttendance.timestamp)) {
        setPendingAttendance(null);
        return;
      }

      if (!ensureAttendanceWindowOpen(pendingAttendance.timestamp)) {
        setPendingAttendance(null);
        return;
      }

      if (pendingAttendance.shouldSaveEmployee !== false) {
        await saveEmployee(pendingAttendance.employee);
      }
      const attendanceResult = await addAttendanceRecord({
        employeeId: pendingAttendance.employee.employeeId,
        name: pendingAttendance.employee.name || null,
        employeeDocumentId: pendingAttendance.employee.employeeDocumentId || null,
        companyName: pendingAttendance.employee.companyName || companyName,
        companyFolderName: pendingAttendance.employee.companyFolderName || companyName,
        companyDocumentId: pendingAttendance.employee.companyDocumentId || null,
        timestamp: pendingAttendance.timestamp,
        similarity: pendingAttendance.similarity,
        confidence: pendingAttendance.confidence,
        embeddingProvider: pendingAttendance.embeddingProvider
      });

      if (attendanceResult.alreadyMarked) {
        showAlreadyMarkedAttendance(attendanceResult.record, pendingAttendance.employee.name || pendingAttendance.employee.employeeId);
        setPendingAttendance(null);
        return;
      }

      setAttendanceQueue(attendanceResult.queue || (await getAttendanceQueue()));
      if (isOnline === true) {
        syncPendingAttendance().catch((error) => {
          console.warn("Background attendance sync skipped:", error?.message || error);
        });
      }
      navigation.replace("RegisterSuccess", {
        employee: pendingAttendance.employee,
        isVerification: true,
        similarity: pendingAttendance.similarity,
        confidence: pendingAttendance.confidence,
        timestamp: pendingAttendance.timestamp,
        isCompanyLogin: true,
        selectedScanMode: pendingAttendance.selectedScanMode || "real"
      });
    } catch (error) {
      console.error(error);
      setKioskStatus({
        type: "error",
        message: "Could not mark attendance. Please retry."
      });
      setPendingAttendance(null);
      await wait(900);
      setKioskStatus(null);
    } finally {
      setMarkingAttendance(false);
    }
  };

  const captureLivenessSequence = async (isRegistrationScan) => {
    const frames = [];
    let bestPhoto = null;
    let liveEmbedding = null;
    let embeddingSamples = [];
    let embeddingError = "";
    const scanSteps = isRegistrationScan ?
    STEPS :
    isCompanyLogin ?
    COMPANY_VERIFY_STEPS :
    VERIFY_STEPS;

    setStepStatuses(createStepStatusMap("idle", scanSteps));

    let companyFastScanComplete = false;

    for (let stepIndex = 0; stepIndex < scanSteps.length; stepIndex += 1) {
      const step = scanSteps[stepIndex];
      const startedAt = Date.now();
      let stepPassed = false;

      showStep(step, stepIndex);
      setStepStatuses((current) => ({
        ...current,
        [step.key]: "active"
      }));
      await wait(isCompanyLogin ? 20 : stepIndex === 0 ? 160 : 360);

      while (Date.now() - startedAt < step.duration * 1000) {
        const photo = await cameraRef.current?.takePictureAsync({
          quality: 0.15,
          skipProcessing: true
        });

        if (photo?.uri) {
          const frame = await detectFaceLivenessFromPhoto(photo);
          frames.push(frame);

          if (frame.faceDetected) {
            bestPhoto = { ...photo, faceFrame: frame };
          }

          const summary = summarizeLivenessFrames(frames);
          const isCompanyVerificationScan = isCompanyLogin && !isRegistrationScan;
          const justPassed = getStepResult(summary, step.key, isCompanyVerificationScan);
          const companyFastReady = isCompanyLogin &&
          !isRegistrationScan &&
          isCompanyScanReady(summary);

          if (!stepPassed && justPassed) {
            stepPassed = true;

            setStepStatuses((current) => ({ ...current, [step.key]: "success" }));
            setCountdown(0);
            if (countdownRef.current) clearInterval(countdownRef.current);
          }

          if (companyFastReady) {
            companyFastScanComplete = true;
            stepPassed = true;
            setStepStatuses(createStepStatusMap("success", scanSteps));
            setCountdown(0);
            if (countdownRef.current) clearInterval(countdownRef.current);
          }

          setCriteria((current) => ({
            ...current,
            face: summary.faceDetected,
            singleFace: summary.singleFaceDetected,
            centeredFace: summary.centeredFaceDetected,
            blink: summary.blinkDetected,
            smile: isCompanyVerificationScan ? isCompanySmileDetected(summary) : summary.smileDetected
          }));
        }


        if (stepPassed || companyFastScanComplete) break;

        await wait(isCompanyLogin ? COMPANY_FAST_FRAME_INTERVAL_MS : 100);
      }

      setStepStatuses((current) => ({
        ...current,
        [step.key]: stepPassed ? "success" : "failed"
      }));

      if (companyFastScanComplete) {
        break;
      }
    }

    const summary = summarizeLivenessFrames(frames);
    const fastUsableFaceDetected = isCompanyLogin && frames.some((frame) => isUsableFaceFrame(frame));

    if (fastUsableFaceDetected) {
      summary.faceDetected = true;
      summary.singleFaceDetected = true;
      summary.centeredFaceDetected = true;
    }

    const canCreateEmbedding = isRegistrationScan ?
    summary.livenessPassed :
    isCompanyLogin ?
    isCompanyScanReady(summary) :
    summary.faceDetected && summary.smileDetected;

    if (bestPhoto && canCreateEmbedding) {
      const candidates = [];
      const embeddings = [];
      const sampleTarget = isRegistrationScan ?
      ENROLLMENT_EMBEDDING_SAMPLE_TARGET :
      isCompanyLogin ?
      COMPANY_EMBEDDING_SAMPLE_TARGET :
      VERIFY_EMBEDDING_SAMPLE_TARGET;
      setScanning(false);
      setProcessingScan(true);
      setActiveStep(-1);
      setCountdown(0);
      setStepHint(isRegistrationScan ? "Saving secure face template..." : "Finalizing verification...");
      if (countdownRef.current) clearInterval(countdownRef.current);

      try {
        for (let sampleIndex = 0; sampleIndex < sampleTarget; sampleIndex += 1) {
          const finalPhoto = await cameraRef.current?.takePictureAsync({
            quality: isCompanyLogin ? 0.75 : 0.95,
            skipProcessing: false
          });

          if (finalPhoto?.uri) {
            const finalFrame = await detectFaceLivenessFromPhoto(finalPhoto);
            if (isUsableFaceFrame(finalFrame)) {
              candidates.push({ ...finalPhoto, faceFrame: finalFrame });
            }
          }

          if (candidates.length >= sampleTarget) {
            break;
          }

          await wait(isCompanyLogin ? COMPANY_FINAL_SAMPLE_DELAY_MS : 120);
        }
      } catch (error) {
        embeddingError = error?.message || "";
      }

      if (candidates.length < sampleTarget) {
        candidates.push(bestPhoto);
      }

      for (const candidate of candidates) {
        try {
          const embedding = await createFaceEmbeddingFromPhoto(candidate);
          embeddings.push(embedding);
        } catch (error) {
          embeddingError = error?.message || "Embedding creation failed.";
          console.warn("Embedding creation failed:", error);
        }
      }

      embeddingSamples = embeddings;
      liveEmbedding = averageEmbeddings(embeddings) || embeddings[0] || null;
    }

    return { photo: bestPhoto, summary, liveEmbedding, embeddingSamples, embeddingError };
  };

  const handleSessionLoginAgain = () => {
    navigation.replace("Onboarding");
  };

  if (isCompanyLogin && sessionExpiredInfo) {
    return (
      <View
        style={[
        styles.sessionExpiredContainer,
        {
          paddingTop: topSafeArea + 18,
          paddingBottom: bottomSafeArea + 18
        }]
        }>
        <StatusBar style="dark" backgroundColor={PAGE_BG} translucent={true} />
        <View style={styles.sessionExpiredBrandRow}>
          <Image
            source={require("../assets/splash.png")}
            style={styles.sessionExpiredBrandLogo}
          />
        </View>
        <Animated.View
          style={[
          styles.sessionExpiredBody,
          {
            opacity: logoutFade,
            transform: [
            { translateY: logoutSlide },
            { scale: logoutScale }]
          }]
          }>
          <Image
            source={require("../assets/logout-illustration-svg-download-png-12470870.webp")}
            style={styles.sessionExpiredHeroImage}
          />
          <Text style={styles.sessionExpiredTitle}>
            {sessionExpiredInfo.title}
          </Text>
          <View style={styles.sessionExpiredMessageCard}>
            <Text style={styles.sessionExpiredMessage}>{sessionExpiredInfo.message}</Text>
          </View>
          <TouchableOpacity
            style={styles.sessionExpiredButton}
            onPress={handleSessionLoginAgain}
            activeOpacity={0.85}>
            <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
            <Text style={styles.sessionExpiredButtonText}>Login Again</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="dark" backgroundColor={PAGE_BG} />
        <View style={styles.loadingCard}>
          <SpinnerLoader size={34} color="#18232F" />
          <Text style={styles.loadingText}>
            {isCompanyLogin ? "Preparing face scan..." : "Loading secure profile..."}
          </Text>
        </View>
      </View>);

  }

  const isRegistering = !isCompanyLogin && !isRealFaceEmbedding(employee);
  const headerTitle = isCompanyLogin ?
  companyName :
  isRegistering ?
  "Face Registration" :
  employee.name;
  const registrationMeta = [
  employee.name,
  employee.employeeId,
  employee.department].
  filter(Boolean).join(" | ");
  const headerMeta = isCompanyLogin ?
  "Position your face in front of the camera" :
  isRegistering ?
  registrationMeta :
  `${employee.employeeId}${employee.department ? ` | ${employee.department}` : ""}`;
  const faceGuideWidth = Math.min(screenW - 82, isCompanyLogin ? 310 : 280);
  const faceGuideHeight = Math.min(230, Math.round(faceGuideWidth * 0.74));
  const scanTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, faceGuideHeight - 12]
  });

  return (
    <View
      style={[
      styles.container,
      {
        paddingTop: topSafeArea + 2,
        paddingBottom: bottomSafeArea
      }]
      }>
      
      <StatusBar
        style="dark"
        backgroundColor={settingsOpen ? "#FFFFFF" : PAGE_BG}
        translucent={true} />
      

      <Animated.View style={[styles.content, { gap: sectionGap, opacity: pageFade, transform: [{ scale: pageScale }] }]}>
        {}
        <Animated.View
          style={[
          styles.profileCard,
          isCompanyLogin && styles.companyProfileCard,
          {
            opacity: headerFade,
            transform: [{ translateY: headerSlide }]
          }]
          }>
          
          {isCompanyLogin &&
          <View style={styles.companyCardHeaderRow}>
              <NetworkStatusPill
              isOnline={isOnline}
              isChecking={isChecking}
              pingMs={pingMs}
              statusCode={statusCode} />
            
              <View style={styles.companyHeaderActions}>
                <TouchableOpacity
                style={[
                styles.companySettingsButton,
                styles.companySyncButton,
                syncingAttendance && styles.companyActionButtonDisabled]
                }
                onPress={handleManualSync}
                disabled={syncingAttendance}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}>
                
                  {syncingAttendance ?
                <ActivityIndicator size="small" color="#2563EB" /> :

                <Image
                  source={require("../assets/sync.png")}
                  style={styles.companySyncIcon}
                  resizeMode="contain" />

                }
                  {attendanceQueue.length > 0 &&
                <View style={styles.syncQueueBadge}>
                      <Text style={styles.syncQueueBadgeText}>
                        {attendanceQueue.length > 99 ? "99+" : attendanceQueue.length}
                      </Text>
                    </View>
                }
                </TouchableOpacity>
                <TouchableOpacity
                style={styles.companySettingsButton}
                onPress={openSettingsPanel}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                
                  <Ionicons name="settings-outline" size={18} color="#2563EB" />
                </TouchableOpacity>
              </View>
            </View>
          }
          {isRegistering &&
          <TouchableOpacity
            style={styles.abortRegistrationIconButton}
            onPress={handleAbortRegistration}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            
              <Image
              source={require("../assets/cross.png")}
              style={styles.abortRegistrationImage}
              resizeMode="contain" />
            
            </TouchableOpacity>
          }

          <Text style={[styles.employeeName, isCompanyLogin && styles.companyProfileName]} numberOfLines={1}>
            {headerTitle}
          </Text>
          <Text style={[styles.employeeMeta, isCompanyLogin && styles.companyProfileMeta]} numberOfLines={1}>
            {headerMeta}
          </Text>
        </Animated.View>

        {}
        <Animated.View
          style={[
          styles.cameraShell,
          {
            opacity: cameraFade,
            transform: [{ scale: cameraScale }]
          }]
          }>
          
          {permission?.granted ?
          <CameraView
            ref={cameraRef}
            facing="front"
            zoom={0}
            style={styles.camera} /> :


          <View style={styles.cameraFallback}>
              <Ionicons name="camera-outline" size={42} color="#DDEBFF" />
              <Text style={styles.cameraFallbackText}>Camera permission needed</Text>
            </View>
          }

          <View pointerEvents="none" style={styles.cameraGlass} />
          {}
          <View pointerEvents="none" style={styles.faceFrameContainer}>
            <View style={[styles.faceFrame, { width: faceGuideWidth, height: faceGuideHeight }]}>
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />

              {}
              {scanning && !processingScan &&
              <Animated.View
                style={[
                styles.scanLine,
                { transform: [{ translateY: scanTranslateY }] }]
                } />

              }
            </View>
          </View>

          {}
          {scanning && !processingScan && activeStep >= 0 &&
          <Animated.View style={[styles.instructionOverlay, { opacity: stepFadeAnim }]}>
              <Ionicons name={stepIcon} size={22} color="#FFFFFF" />
              <Text style={styles.instructionText}>{stepInstruction}</Text>
              {countdown > 0 &&
            <View style={styles.countdownBadge}>
                  <Text style={styles.countdownText}>{countdown}s</Text>
                </View>
            }
            </Animated.View>
          }

          {processingScan &&
          <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text style={styles.processingTitle}>
                {isRegistering ? "Saving face template" : isCompanyLogin ? "Marking attendance" : "Finalizing verification"}
              </Text>
              <Text style={styles.processingSubtext}>
                {isRegistering ?
              "Please wait while SweFace saves the secure face template." :
              "Please wait while SweFace matches the face and records attendance."}
              </Text>
            </View>
          }
        </Animated.View>

        {}
        <Animated.View
          style={[
          styles.criteriaCard,
          isCompanyLogin && styles.criteriaCardDocked,
          {
            marginBottom: isCompanyLogin ? 0 : 0,
            paddingBottom: isCompanyLogin ? 18 : 12,
            opacity: cardFade,
            transform: [{ translateY: cardSlide }]
          }]
          }>
          
          <View style={styles.criteriaHeader}>
            {isCompanyLogin &&
            <View style={styles.criteriaHeaderIcon}>
                <Image
                source={require("../assets/faceicon.png")}
                style={styles.criteriaHeaderImage} />
              
              </View>
            }
            {!kioskStatus &&
            <Pressable
              style={[
              styles.startButton,
              (scanning || processingScan || pendingAttendance || markingAttendance) && styles.startButtonDisabled,
              scanFailed && styles.startButtonRetry]
              }
              onPress={handleVerifyFace}
              disabled={scanning || processingScan || Boolean(pendingAttendance) || markingAttendance}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={scanFailed ? "Try scan again" : "Start face scan"}>
              
                {processingScan ?
              <ActivityIndicator size="small" color="#FFFFFF" /> :

              <Ionicons
                name={scanning ? "scan" : scanFailed ? "refresh" : "play"}
                size={18}
                color="#FFFFFF" />

              }
              </Pressable>
            }
            <View style={styles.criteriaHeadingBlock}>
              <Text style={styles.criteriaTitle}>
                {isCompanyLogin ? `${companyName} Face Scan` : "Face scan"}
              </Text>
              <Text style={styles.criteriaHint}>
                {isCompanyLogin ?
                kioskStatus ? "Ready for the next scan" : scanning ? stepHint : "Press Start when the employee is ready" :
                processingScan ?
                stepHint :
                scanning && activeStep >= 0 ? stepHint : "Keep your face steady and follow the live prompt"}
              </Text>
              {isRegistering &&
              <View style={styles.criteriaNotice}>
                  <Ionicons name="information-circle" size={16} color="#16A34A" />
                  <Text style={styles.criteriaNoticeText}>
                    Internet connection is required. Faces are checked against the company database so registered faces do not repeat.
                  </Text>
                </View>
              }
            </View>
          </View>

          {isCompanyLogin && kioskStatus ?
          <Animated.View style={{
            backgroundColor: kioskStatus.type === "success" ? "#F0FDF4" : "#FEF2F2",
            borderColor: kioskStatus.type === "success" ? "#DCFCE7" : "#FEE2E2",
            borderWidth: 1.5,
            borderRadius: 12,
            padding: 16,
            marginVertical: 10,
            alignItems: "center",
            flexDirection: "row",
            gap: 12,
            opacity: kioskStatusOpacity
          }}>
              <Ionicons
              name={kioskStatus.type === "success" ? "checkmark-circle" : "alert-circle"}
              size={28}
              color={kioskStatus.type === "success" ? "#16A34A" : "#EF4444"} />
            
              <Text style={{
              flex: 1,
              fontSize: 14,
              lineHeight: 20,
              color: kioskStatus.type === "success" ? "#166534" : "#991B1B",
              fontWeight: "700"
            }}>
                {kioskStatus.message}
              </Text>
            </Animated.View> :
          null}

          {}
          {!isCompanyLogin && scanFailed && !scanning &&
          <Animated.View
            style={[
            styles.failBanner,
            {
              opacity: failBannerAnim,
              transform: [
              {
                translateY: failBannerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-10, 0]
                })
              }]

            }]
            }>
            
              <Ionicons name="warning" size={18} color="#FFFFFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.failBannerTitle}>{scanFailure?.title || DEFAULT_SCAN_FAILURE.title}</Text>
                <Text style={styles.failBannerSub}>{scanFailure?.message || DEFAULT_SCAN_FAILURE.message}</Text>
              </View>
              <Pressable
              onPress={hideFailBanner}
              hitSlop={12}
              style={({ pressed }) => [
              styles.failBannerClose,
              pressed && styles.failBannerClosePressed]
              }>
              
                <Ionicons name="close" size={14} color="#FFFFFF" />
              </Pressable>
            </Animated.View>
          }

          <View style={styles.stepsList}>
            {(isCompanyLogin ? COMPANY_VERIFY_STEPS : isRegistering ? STEPS : VERIFY_STEPS).map((step) => {
              const status = stepStatuses[step.key];
              return (
                <CriteriaRow
                  key={step.key}
                  status={status}
                  label={step.label}
                  icon={step.icon} />);


            })}
          </View>
        </Animated.View>
      </Animated.View>

      {pendingAttendance ?
      <Animated.View
        style={[
        styles.confirmBackdrop,
        {
          opacity: confirmBackdropOpacity
        }]
        }>
        
          <Animated.View
          {...!markingAttendance ? confirmPanResponder.panHandlers : {}}
          style={[
          styles.confirmSheet,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            transform: [{ translateY: confirmTranslateY }]
          }]
          }>
          
            <View style={styles.confirmHandleWrap}>
              <View style={styles.confirmHandle} />
            </View>
            <Image
            source={require("../assets/faceicon.png")}
            style={styles.confirmFaceIcon} />
          
            <Text style={styles.confirmTitle}>
              Hey, is this{" "}
              <Text style={styles.confirmName}>
                {pendingAttendance.employee.name || pendingAttendance.employee.employeeId}
              </Text>
              ?
            </Text>
            <Text style={styles.confirmMeta}>
              Confidence {Math.round(pendingAttendance.confidence)}%
              {pendingAttendance.employee.employeeId ? ` | ${pendingAttendance.employee.employeeId}` : ""}
            </Text>
            <View style={styles.confirmNotice}>
              <Ionicons name="information-circle" size={18} color="#D97706" />
              <Text style={styles.confirmNoticeText}>
                Sorry if we are wrong. Please cooperate with us, we are working on it.
              </Text>
            </View>
            <View style={styles.confirmActions}>
              <Pressable
              style={[styles.confirmButton, styles.confirmRetryButton]}
              onPress={retryPendingAttendance}
              disabled={markingAttendance}>
              
                <Image
                source={require("../assets/refresh.png")}
                style={styles.confirmRetryIcon} />
              
                <Text style={styles.confirmRetryText}>Retry</Text>
              </Pressable>
              <Pressable
              style={[styles.confirmButton, styles.confirmYesButton, markingAttendance && styles.startButtonDisabled]}
              onPress={confirmPendingAttendance}
              disabled={markingAttendance}>
              
                {markingAttendance ?
              <ActivityIndicator size="small" color="#FFFFFF" /> :

              <Image
                source={require("../assets/tick.png")}
                style={styles.confirmYesIcon} />

              }
                <Text style={styles.confirmYesText}>{markingAttendance ? "Marking..." : "Yes"}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View> :
      null}

      {}
      <Animated.View
        pointerEvents={syncPanelOpen ? "auto" : "none"}
        style={[
        styles.settingsBackdrop,
        { opacity: syncBackdropOpacity }]
        }>
        
        <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSyncPanel()} />
      </Animated.View>
      <Animated.View
        collapsable={false}
        pointerEvents={syncPanelOpen ? "auto" : "none"}
        style={[
        styles.syncOverlay,
        {
          bottom: 0,
          height: syncSheetHeight,
          transform: [{ translateY: syncPanelTranslateY }]
        }]
        }>
        
        <View collapsable={false} style={styles.syncSheet}>
          <View {...syncPanResponder.panHandlers} style={styles.settingsSheetGrabArea}>
            <View style={styles.settingsSheetHandle} />
          </View>
          <View style={styles.syncPanelHeader}>
            <View style={styles.syncPanelTitleRow}>
              <View style={styles.syncPanelIcon}>
                <Image
                  source={require("../assets/sync.png")}
                  style={styles.syncPanelIconImage}
                  resizeMode="contain" />
                
              </View>
              <View style={styles.syncPanelTitleBlock}>
                <Text style={styles.syncPanelTitle}>Cloud Queue</Text>
                <Text style={styles.syncPanelSubtitle}>
                  {syncingAttendance ?
                  `Syncing ${attendanceQueue.length} ${attendanceQueue.length === 1 ? "entry" : "entries"}` :
                  `${attendanceQueue.length} ${attendanceQueue.length === 1 ? "entry" : "entries"} waiting`}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => closeSyncPanel()}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.syncPanelClose}>
              
              <Ionicons name="close" size={20} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <View style={styles.syncStatsRow}>
            <View style={styles.syncStatCard}>
              <Text style={styles.syncStatValue}>{attendanceQueue.length}</Text>
              <Text style={styles.syncStatLabel}>Queued</Text>
            </View>
            <View style={styles.syncStatCard}>
              <Text style={[styles.syncStatValue, { color: isOnline ? "#16A34A" : "#EF4444" }]}>
                {isOnline ? "Online" : "Offline"}
              </Text>
              <Text style={styles.syncStatLabel}>Network</Text>
            </View>
            <View style={styles.syncStatCard}>
              <Text style={styles.syncStatValue}>{syncingAttendance ? "Yes" : "No"}</Text>
              <Text style={styles.syncStatLabel}>Syncing</Text>
            </View>
          </View>

          <Pressable
            style={[styles.syncNowButton, (syncingAttendance || isOnline === false) && styles.syncNowButtonDisabled]}
            onPress={() => runAttendanceSync({ silent: true })}
            disabled={syncingAttendance || isOnline === false}>
            
            {syncingAttendance ?
            <ActivityIndicator size="small" color="#FFFFFF" /> :

            <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
            }
            <Text style={styles.syncNowText}>
              {syncingAttendance ? "Syncing..." : "Sync now"}
            </Text>
          </Pressable>

          <ScrollView
            style={styles.syncQueueList}
            contentContainerStyle={styles.syncQueueListContent}
            showsVerticalScrollIndicator={false}>
            
            {attendanceQueue.length === 0 ?
            <View style={styles.syncEmptyState}>
                <Ionicons name="checkmark-circle" size={34} color="#16A34A" />
                <Text style={styles.syncEmptyTitle}>All Synced</Text>
                <Text style={styles.syncEmptyText}>New attendance marks will queue here while offline.</Text>
              </View> :

            attendanceQueue.slice(0, 24).map((record) =>
            <View key={record.id} style={styles.syncQueueRow}>
                  <View style={styles.syncQueueRowIcon}>
                    <Ionicons name="time-outline" size={16} color="#2563EB" />
                  </View>
                  <View style={styles.syncQueueRowBody}>
                    <Text style={styles.syncQueueRowName} numberOfLines={1}>
                      {record.name || record.employeeId || "Employee"}
                    </Text>
                    <Text style={styles.syncQueueRowMeta} numberOfLines={1}>
                      {record.date || String(record.timestamp || "").split("T")[0]} | {record.timestamp ? new Date(record.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "No time"}
                    </Text>
                  </View>
                  <Text style={styles.syncQueueRowStatus}>Queued</Text>
                </View>
            )
            }
          </ScrollView>
        </View>
      </Animated.View>

      {}
      <Animated.View
        pointerEvents={settingsOpen ? "auto" : "none"}
        style={[
        styles.settingsBackdrop,
        { opacity: settingsBackdropOpacity }]
        }>
        
        <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSettingsPanel()} />
      </Animated.View>
      <Animated.View
        collapsable={false}
        pointerEvents={settingsOpen ? "auto" : "none"}
        style={[
        styles.settingsOverlay,
        {
          bottom: 0,
          height: settingsSheetHeight,
          transform: [{ translateY: settingsPanelTranslateY }]
        }]
        }>
        
        <View collapsable={false} style={styles.settingsScreen}>
          <View {...settingsPanResponder.panHandlers} style={styles.settingsSheetGrabArea}>
            <View style={styles.settingsSheetHandle} />
          </View>
          <View style={styles.settingsPanelHeader}>
            <Ionicons name="settings" size={20} color="#2F69FF" />
            <Image
              source={require("../assets/settings.png")}
              style={styles.settingsPanelTitleLogo} />
            
            <TouchableOpacity
              onPress={() => closeSettingsPanel()}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.settingsPanelClose}>
              
              <Ionicons name="close" size={20} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            <ScrollView
              style={styles.settingsBody}
              contentContainerStyle={styles.settingsBodyContent}
              showsVerticalScrollIndicator={false}>
              
              {}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionLabel}>Verified by</Text>
                <View style={styles.settingsCompanyRow}>
                  <View style={styles.settingsCompanyIcon}>
                    <Ionicons name="business" size={16} color="#2F69FF" />
                  </View>
                  <Text style={styles.settingsCompanyName}>{companyName}</Text>
                  <View style={styles.settingsVerifiedBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#16A34A" />
                    <Text style={styles.settingsVerifiedText}>Verified</Text>
                  </View>
                </View>
              </View>

              {}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionLabel}>Session</Text>
                <View style={styles.settingsSessionCard}>
                  <View style={styles.settingsSessionRow}>
                    <Ionicons name="time-outline" size={15} color="#64748B" />
                    <Text style={styles.settingsSessionText}>
                      {sessionExpiryLabel || "No session data"}
                    </Text>
                  </View>
                  {companySession?.loggedInAt &&
                  <View style={styles.settingsSessionRow}>
                      <Ionicons name="calendar-outline" size={15} color="#64748B" />
                      <Text style={styles.settingsSessionText}>
                        Logged in {new Date(companySession.loggedInAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                  }
                  {companySession?.username &&
                  <View style={styles.settingsSessionRow}>
                      <Ionicons name="person-outline" size={15} color="#64748B" />
                      <Text style={styles.settingsSessionText}>
                        {companySession.username}
                      </Text>
                    </View>
                  }
                </View>
              </View>
            </ScrollView>
          </View>

          <View>
            <View style={[styles.settingsFooter, { paddingBottom: settingsFooterBottomPadding }]}>
              <View style={styles.settingsActions}>
                <Pressable
                  style={({ pressed }) => [
                  styles.settingsActionButton,
                  styles.settingsGoBackButton,
                  pressed && { opacity: 0.82 }]
                  }
                  onPress={handleSettingsGoBack}>
                  
                  <Image
                    source={require("../assets/previous.png")}
                    style={styles.settingsGoBackIcon} />
                  
                  <Text style={styles.settingsGoBackText}>Back to Onboarding</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                  styles.settingsActionButton,
                  styles.settingsLogoutButton,
                  pressed && { opacity: 0.82 }]
                  }
                  onPress={handleSettingsLogout}>
                  
                  <Image
                    source={require("../assets/logout.png")}
                    style={styles.settingsLogoutIcon} />
                  
                  <Text style={styles.settingsLogoutText}>Log Out</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>);

}

function CriteriaRow({ status, label, icon }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const complete = status === "success";
  const failed = status === "failed";
  const active = status === "active";

  useEffect(() => {
    if (complete) {
      Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.18,
        duration: 160,
        useNativeDriver: true
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true
      })]
      ).start();
    }
  }, [complete, scaleAnim]);

  return (
    <View
      style={[
      styles.criteriaRow,
      active && styles.criteriaRowActive,
      complete && styles.criteriaRowComplete,
      failed && styles.criteriaRowFailed]
      }>
      
      <Animated.View
        style={[
        styles.criteriaIcon,
        complete && styles.criteriaIconComplete,
        failed && styles.criteriaIconFailed,
        active && !complete && styles.criteriaIconActive,
        { transform: [{ scale: scaleAnim }] }]
        }>
        
        <Ionicons
          name={complete ? "checkmark" : failed ? "close" : icon}
          size={14}
          color={complete || failed ? "#FFFFFF" : active ? "#2F69FF" : "#5D744F"} />
        
      </Animated.View>
      <Text
        style={[
        styles.criteriaText,
        complete && styles.criteriaTextComplete,
        failed && styles.criteriaTextFailed,
        active && !complete && styles.criteriaTextActive]
        }>
        
        {label}
      </Text>
      {active && !complete &&
      <View style={styles.activeIndicator}>
          <View style={styles.activeIndicatorDot} />
          <Text style={styles.activeIndicatorText}>Scanning</Text>
        </View>
      }
      {complete &&
      <Ionicons name="checkmark-circle" size={16} color="#22C55E" style={{ marginLeft: "auto" }} />
      }
      {failed &&
      <Ionicons name="close-circle" size={16} color="#DC2626" style={{ marginLeft: "auto" }} />
      }
    </View>);

}

function wait(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
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
    second: "2-digit",
    hour12: false
  }).formatToParts(safeDate).reduce((result, part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
    return result;
  }, {});
  const hour = parts.hour === "24" ? "00" : parts.hour;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    timestamp: `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}+05:30`
  };
}

function getIndianDate(value = null) {
  return getIndianDateParts(value).date;
}

function getIndianTimestamp(value = null) {
  return getIndianDateParts(value).timestamp;
}

function formatAttendanceTimestamp(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-IN", {
    timeZone: MUMBAI_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isInternetConnectionError(error) {
  return /internet connection error|network|failed to fetch|backend|server|internal/i.test(String(error?.message || ""));
}

function isCompanyScanReady(summary) {
  return Boolean(summary?.faceDetected && isCompanySmileDetected(summary));
}

function isCompanySmileDetected(summary) {
  return Boolean(summary?.smileDetected || summary?.faceDetected && summary?.maxSmile >= COMPANY_SMILE_MIN_PROBABILITY);
}

function getRegistrationFailure(summary) {
  if (!summary.faceDetected) {
    return {
      title: "Face not found",
      message: "Keep your face inside the scanner box and try again."
    };
  }

  return {
    title: "Scan incomplete",
    message: `${summary.passedActivities} of 5 checks passed. Keep one real face centred and blink or smile naturally.`
  };
}

function getVerificationFailure(summary) {
  if (!summary.faceDetected) {
    return {
      title: "Face not found",
      message: "Keep your face inside the scanner box and try again."
    };
  }

  if (!summary.smileDetected) {
    return {
      title: "Smile not detected",
      message: "Smile naturally for a second, then retry."
    };
  }

  return DEFAULT_SCAN_FAILURE;
}

function getCompanyVerificationFailure(summary) {
  if (!summary.faceDetected) {
    return {
      title: "Face not found",
      message: "Keep one face inside the scanner."
    };
  }

  if (!isCompanySmileDetected(summary)) {
    return {
      title: "Smile not detected",
      message: "Smile naturally for a moment and keep your face in frame."
    };
  }

  return DEFAULT_SCAN_FAILURE;
}

function getStepResult(summary, stepKey, useCompanySmile = false) {
  switch (stepKey) {
    case "face":
      return summary.faceDetected;
    case "singleFace":
      return summary.singleFaceDetected;
    case "centeredFace":
      return summary.centeredFaceDetected;
    case "blink":
      return summary.blinkDetected;
    case "smile":
      return useCompanySmile ? isCompanySmileDetected(summary) : summary.smileDetected;
    default:
      return false;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAGE_BG,
    paddingHorizontal: 14
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PAGE_BG,
    paddingHorizontal: 24
  },
  loadingCard: {
    minWidth: 210,
    minHeight: 116,
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14
  },
  loadingText: {
    color: "#18232F",
    fontSize: 15,
    fontWeight: "800"
  },
  sessionExpiredContainer: {
    flex: 1,
    backgroundColor: "#7CD51D",
    paddingHorizontal: 24,
    justifyContent: "flex-start"
  },
  sessionExpiredBrandRow: {
    width: "100%",
    paddingTop: 6,
    marginBottom: 18,
    alignItems: "flex-start"
  },
  sessionExpiredBrandLogo: {
    width: 48,
    height: 48,
    resizeMode: "contain"
  },
  sessionExpiredBody: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 28
  },
  sessionExpiredHeroImage: {
    width: 180,
    height: 180,
    resizeMode: "contain",
    marginBottom: 14
  },
  sessionExpiredTitle: {
    color: "#13283D",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 16,
    maxWidth: 560
  },
  sessionExpiredMessageCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 20,
    marginTop: 10,
    marginBottom: 34,
    shadowColor: "#16324A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4
  },
  sessionExpiredMessage: {
    color: "#13283D",
    fontSize: 18,
    lineHeight: 30,
    fontWeight: "800",
    textAlign: "center",
    maxWidth: 560
  },
  sessionExpiredButton: {
    width: "100%",
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "#1D7BF2",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    maxWidth: 320
  },
  sessionExpiredButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },

  content: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 18,
    paddingBottom: 4
  },
  profileCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center"
  },
  companyProfileCard: {
    minHeight: 108,
    justifyContent: "center",
    paddingTop: 14,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.78)",
    shadowColor: "#14532D",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 8
  },
  kicker: {
    color: "#233042",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2
  },
  employeeName: {
    color: "#152232",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center"
  },
  companyCardHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },
  companyHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  companySettingsButton: {
    position: "relative",
    width: 32,
    height: 32,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1D4ED8",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2
  },
  companySyncButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CCFBF1",
    shadowColor: "#0F766E"
  },
  companyActionButtonDisabled: {
    opacity: 0.62
  },
  companySyncIcon: {
    width: 22,
    height: 22
  },
  syncQueueBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: "#EF4444",
    borderWidth: 1,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },
  syncQueueBadgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900"
  },
  companyProfileName: {
    width: "100%",
    color: "#102033",
    fontSize: 21,
    lineHeight: 26,
    textAlign: "center"
  },
  employeeMeta: {
    color: "#4C5F75",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "center"
  },
  companyProfileMeta: {
    width: "100%",
    color: "#475D73",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    fontWeight: "800",
    textAlign: "center"
  },

  cameraShell: {
    flex: 1,
    minHeight: 180,
    maxHeight: 330,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#0F1B2B",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.82)"
  },
  camera: {
    flex: 1
  },
  cameraGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)"
  },
  cameraFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  cameraFallbackText: {
    color: "#DDEBFF",
    fontSize: 14,
    fontWeight: "800"
  },
  faceFrameContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "none"
  },
  faceFrame: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center"
  },
  corner: {
    position: "absolute",
    width: 54,
    height: 54,
    borderColor: "rgba(255,255,255,0.95)"
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 5,
    borderLeftWidth: 5,
    borderTopLeftRadius: 20
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 5,
    borderRightWidth: 5,
    borderTopRightRadius: 20
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    borderBottomLeftRadius: 20
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 5,
    borderRightWidth: 5,
    borderBottomRightRadius: 20
  },
  scanLine: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)"
  },
  instructionOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15,30,50,0.72)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  instructionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    flex: 1
  },
  countdownBadge: {
    backgroundColor: "#2F69FF",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 36,
    alignItems: "center"
  },
  countdownText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  processingOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,30,50,0.76)",
    paddingHorizontal: 28
  },
  processingTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 14,
    textAlign: "center"
  },
  processingSubtext: {
    color: "#DDEBFF",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center"
  },
  criteriaCard: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 18,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 14
  },
  criteriaCardDocked: {
    backgroundColor: "rgba(251,255,248,0.96)",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    marginHorizontal: -4,
    paddingHorizontal: 22,
    paddingTop: 18,
    borderWidth: 1,
    borderColor: "rgba(126, 211, 33, 0.22)"
  },
  criteriaHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10
  },
  criteriaHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#DDEBFF"
  },
  criteriaHeaderImage: {
    width: 24,
    height: 24,
    resizeMode: "contain"
  },
  criteriaHeadingBlock: {
    flex: 1,
    gap: 3
  },
  criteriaActionRow: {
    alignItems: "center",
    marginTop: 2,
    marginBottom: 10
  },
  criteriaTitle: {
    color: "#152232",
    fontSize: 15,
    fontWeight: "900"
  },
  criteriaHint: {
    color: "#4C5F75",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17
  },
  criteriaNotice: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#ECFDF3",
    borderWidth: 1,
    borderColor: "#000000",
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  criteriaNoticeText: {
    flex: 1,
    color: "#166534",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700"
  },
  stepsList: {
    gap: 5
  },
  criteriaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 38,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(246,250,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(21,34,50,0.06)"
  },
  criteriaRowActive: {
    backgroundColor: "rgba(47,105,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(47,105,255,0.18)"
  },
  criteriaRowComplete: {
    backgroundColor: "rgba(34,197,94,0.06)",
    borderColor: "rgba(34,197,94,0.18)"
  },
  criteriaRowFailed: {
    backgroundColor: "rgba(220,38,38,0.05)",
    borderColor: "rgba(220,38,38,0.16)"
  },
  criteriaIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#5D744F",
    alignItems: "center",
    justifyContent: "center"
  },
  criteriaIconComplete: {
    backgroundColor: "#22C55E",
    borderColor: "#22C55E"
  },
  criteriaIconFailed: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626"
  },
  criteriaIconActive: {
    borderColor: "#2F69FF",
    backgroundColor: "rgba(47,105,255,0.1)"
  },
  criteriaText: {
    color: "#152232",
    fontSize: 13,
    fontWeight: "700",
    flex: 1
  },
  criteriaTextComplete: {
    color: "#15803D"
  },
  criteriaTextFailed: {
    color: "#B91C1C"
  },
  criteriaTextActive: {
    color: "#2F69FF"
  },
  activeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8
  },
  activeIndicatorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#2F69FF"
  },
  activeIndicatorText: {
    color: "#2F69FF",
    fontSize: 11,
    fontWeight: "800"
  },
  startButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1769FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)"
  },
  startButtonDisabled: {
    opacity: 0.65
  },
  startButtonRetry: {
    backgroundColor: "#DC2626"
  },
  startButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  confirmBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.3)",
    paddingHorizontal: 0,
    paddingBottom: 0
  },
  confirmSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)"
  },
  confirmHandleWrap: {
    alignItems: "center",
    paddingTop: 2,
    paddingBottom: 18
  },
  confirmHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    alignSelf: "center"
  },
  confirmFaceIcon: {
    width: 48,
    height: 48,
    alignSelf: "center",
    marginBottom: 12,
    resizeMode: "contain"
  },
  confirmTitle: {
    color: "#152232",
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 4
  },
  confirmName: {
    color: "#0F172A"
  },
  confirmMeta: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 4
  },
  confirmNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FEF3C7",
    borderRadius: 12,
    padding: 12,
    marginTop: 18
  },
  confirmNoticeText: {
    flex: 1,
    color: "#92400E",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700"
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20
  },
  confirmButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  confirmRetryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1"
  },
  confirmYesButton: {
    backgroundColor: "#2F69FF"
  },
  confirmRetryText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "900"
  },
  confirmRetryIcon: {
    width: 17,
    height: 17,
    resizeMode: "contain",
    tintColor: "#475569"
  },
  confirmYesText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  confirmYesIcon: {
    width: 18,
    height: 18,
    resizeMode: "contain",
    tintColor: "#FFFFFF"
  },
  failBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#DC2626",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12
  },
  failBannerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  failBannerClosePressed: {
    opacity: 0.72
  },
  failBannerTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  failBannerSub: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1
  },
  abortRegistrationIconButton: {
    position: "absolute",
    right: 12,
    top: 10,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  abortRegistrationImage: {
    width: 26,
    height: 26
  },
  syncOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 315,
    backgroundColor: "transparent",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 38
  },
  syncSheet: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
    overflow: "hidden"
  },
  syncPanelHeader: {
    minHeight: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  syncPanelTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  syncPanelIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ECFEFF",
    borderWidth: 1,
    borderColor: "#A5F3FC",
    alignItems: "center",
    justifyContent: "center"
  },
  syncPanelIconImage: {
    width: 24,
    height: 24
  },
  syncPanelTitleBlock: {
    flex: 1
  },
  syncPanelTitle: {
    color: "#152232",
    fontSize: 18,
    fontWeight: "900"
  },
  syncPanelSubtitle: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2
  },
  syncPanelClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center"
  },
  syncStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14
  },
  syncStatCard: {
    flex: 1,
    minHeight: 62,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  syncStatValue: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center"
  },
  syncStatLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3
  },
  syncNowButton: {
    minHeight: 46,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  syncNowButtonDisabled: {
    opacity: 0.58
  },
  syncNowText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  syncQueueList: {
    flex: 1,
    marginTop: 12
  },
  syncQueueListContent: {
    paddingBottom: 20,
    gap: 8
  },
  syncQueueRow: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10
  },
  syncQueueRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center"
  },
  syncQueueRowBody: {
    flex: 1
  },
  syncQueueRowName: {
    color: "#152232",
    fontSize: 13,
    fontWeight: "900"
  },
  syncQueueRowMeta: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2
  },
  syncQueueRowStatus: {
    color: "#2563EB",
    fontSize: 10,
    fontWeight: "900"
  },
  syncEmptyState: {
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20
  },
  syncEmptyTitle: {
    color: "#152232",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 8
  },
  syncEmptyText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center"
  },

  settingsOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 320,
    backgroundColor: "transparent",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 40
  },
  settingsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.35)"
  },
  settingsScreen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
    overflow: "hidden"
  },
  settingsSheetGrabArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 8
  },
  settingsSheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#CBD5E1"
  },
  settingsPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    marginBottom: 16
  },
  settingsPanelTitleLogo: {
    width: 142,
    height: 30,
    marginLeft: -36,
    marginTop: 4,
    marginRight: "auto",
    resizeMode: "contain"
  },
  settingsPanelTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "900",
    color: "#152232"
  },
  settingsPanelClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center"
  },
  settingsBody: {
    flex: 1
  },
  settingsBodyContent: {
    paddingBottom: 18
  },
  settingsSection: {
    marginBottom: 20
  },
  settingsSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#94A3B8",
    marginBottom: 8
  },
  settingsCompanyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  settingsCompanyIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(47, 105, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center"
  },
  settingsCompanyName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: "#152232"
  },
  settingsVerifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DCFCE7"
  },
  settingsVerifiedText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#16A34A"
  },
  settingsSessionCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  settingsSessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  settingsSessionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569"
  },
  settingsFooter: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF"
  },
  settingsActions: {
    gap: 14
  },
  settingsActionButton: {
    minHeight: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  settingsGoBackButton: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  settingsGoBackIcon: {
    width: 16,
    height: 16,
    resizeMode: "contain",
    tintColor: "#334155"
  },
  settingsGoBackText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155"
  },
  settingsLogoutButton: {
    backgroundColor: "#EF4444"
  },
  settingsLogoutIcon: {
    width: 16,
    height: 16,
    resizeMode: "contain",
    tintColor: "#FFFFFF"
  },
  settingsLogoutText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF"
  }
});
