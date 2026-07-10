import React, { useRef, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Image,
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  Dimensions,
  TouchableOpacity,
  Animated,
  Easing,
  TextInput,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableWithoutFeedback,
  BackHandler,
  InteractionManager } from
"react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { colors } from "../theme";
import {
  saveCompanySession,
  getCompanySession,
  getCompanyProfile,
  clearCompanySession,
  getEmployee,
  getAllEmployees,
  deleteEmployee,
  refreshMissingEmployeesFromCloud } from
"../services/storage";
import { cacheCompanyProfileAfterLogin } from "../services/companyProfile";
import { buildApiUrl } from "../services/apiConfig";
import { FACE_ENGINE } from "../services/faceEngine";
import SpinnerLoader from "../components/SpinnerLoader";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.86;
const PAGE_BG = "#7ED321";


const EASE_OUT_SMOOTH = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_IN_SMOOTH = Easing.bezier(0.55, 0, 1, 0.45);

const SPRING_SHEET_OPEN = {
  damping: 26,
  stiffness: 280,
  mass: 0.85,
  overshootClamping: true,
  useNativeDriver: true
};

const SPRING_SHEET_CLOSE = {
  damping: 28,
  stiffness: 320,
  mass: 0.9,
  overshootClamping: true,
  useNativeDriver: true
};

const SPRING_ENTRANCE_PANEL = {
  damping: 21,
  stiffness: 195,
  mass: 1,
  overshootClamping: false,
  useNativeDriver: true
};

const SPRING_DRAWER_OPEN = {
  damping: 27,
  stiffness: 300,
  mass: 0.85,
  overshootClamping: true,
  useNativeDriver: true
};

const timing = (value, toValue, duration = 260, easing = EASE_OUT_SMOOTH) =>
Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });

const spring = (value, toValue, config = SPRING_SHEET_OPEN) =>
Animated.spring(value, { toValue, ...config });

const DEPARTMENTS = [
"Engineering",
"Human Resources",
"Sales & Marketing",
"Finance",
"Operations"];


const DESIGNATIONS = [
"Developer",
"Team Lead",
"Manager",
"Executive",
"Director"];


const MAX_FULL_NAME_LENGTH = 60;
const EMPLOYEE_ID_PATTERN = /^[A-Z0-9-]{4,8}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,32}$/;
const INTERNET_CONNECTION_ERROR = "Internet connection error. Please check your connection and try again.";







const _sessionCache = {
  token: null,
  verifiedAt: 0,
  expiresAt: 0
};


const getJwtExpMs = (token) => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return 0;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(base64));
    return decoded.exp ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
};


const clearSessionCache = () => {
  _sessionCache.token = null;
  _sessionCache.verifiedAt = 0;
  _sessionCache.expiresAt = 0;
};

const getInitials = (name) => {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function OnboardingPage({ navigation }) {
  const insets = useSafeAreaInsets();


  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [registrationSaving, setRegistrationSaving] = useState(false);


  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [isCaptchaFocused, setIsCaptchaFocused] = useState(false);


  const [activePicker, setActivePicker] = useState(null);
  const depPickerTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const desPickerTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const depBackdropOpacity = useRef(new Animated.Value(0)).current;
  const desBackdropOpacity = useRef(new Animated.Value(0)).current;
  const refreshRotate = useRef(new Animated.Value(0)).current;
  const formScrollRef = useRef(null);





  const PANEL_HEIGHT = SCREEN_HEIGHT * 0.82;
  const BUTTONS_HEIGHT = 142 + Math.max(insets.bottom, 16);
  const CLOSED_OFFSET = PANEL_HEIGHT - BUTTONS_HEIGHT;
  const OPEN_OFFSET = 0;
  const HIDDEN_OFFSET = PANEL_HEIGHT;


  const closedOffsetRef = useRef(CLOSED_OFFSET);
  const hiddenOffsetRef = useRef(HIDDEN_OFFSET);

  const stableClosedOffset = closedOffsetRef.current;
  const stableHiddenOffset = hiddenOffsetRef.current;
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);


  const [isCompanyLoginOpen, setIsCompanyLoginOpen] = useState(false);
  const [companyUsername, setCompanyUsername] = useState("");
  const [companyPassword, setCompanyPassword] = useState("");
  const [companyLoginLoading, setCompanyLoginLoading] = useState(false);
  const [companySecureEntry, setCompanySecureEntry] = useState(true);
  const [companyLoginNotice, setCompanyLoginNotice] = useState(null);
  const [companySession, setCompanySession] = useState(null);
  const [companyDisplayName, setCompanyDisplayName] = useState("");
  const [companySessionChecking, setCompanySessionChecking] = useState(false);
  const companyFormOpacity = useRef(new Animated.Value(0)).current;
  const companySessionOpacity = useRef(new Animated.Value(0)).current;
  const companySessionTranslateY = useRef(new Animated.Value(12)).current;


  const [isDbDrawerOpen, setIsDbDrawerOpen] = useState(false);
  const [dbEmployee, setDbEmployee] = useState(null);
  const [dbEmployeesList, setDbEmployeesList] = useState([]);
  const dbDrawerTranslateX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const dbBackdropOpacity = useRef(new Animated.Value(0)).current;
  const dbRefreshSpinValue = useRef(new Animated.Value(0)).current;


  const [dbSearchQuery, setDbSearchQuery] = useState("");
  const [selectedDbEmployee, setSelectedDbEmployee] = useState(null);
  const [selectedStatType, setSelectedStatType] = useState(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [detailSheetReady, setDetailSheetReady] = useState(false);
  const detailSheetTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const detailBackdropOpacity = useRef(new Animated.Value(0)).current;
  const skeletonOpacity = useRef(new Animated.Value(1)).current;


  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-10)).current;
  const imageFade = useRef(new Animated.Value(0)).current;
  const imageScale = useRef(new Animated.Value(0.93)).current;
  const textPanelFade = useRef(new Animated.Value(0)).current;
  const textPanelSlide = useRef(new Animated.Value(22)).current;
  const formTranslateY = useRef(new Animated.Value(24)).current;
  const companyFormSlideY = useRef(new Animated.Value(24)).current;


  const panelTranslateY = useRef(new Animated.Value(HIDDEN_OFFSET)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const panelAnimatingRef = useRef(false);
  const companyLoginClosingRef = useRef(false);


  const generateCaptcha = () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setCaptchaCode(code);
    setCaptchaInput("");
  };

  const scrollFormTo = (y) => {
    setTimeout(() => {
      formScrollRef.current?.scrollTo({ y, animated: true });
    }, 120);
  };

  const resetFormScroll = (animated = false) => {
    formScrollRef.current?.scrollTo({ y: 0, animated });
  };

  const syncCompanyContext = async () => {
    try {
      const approvedSession = await getApprovedCompanySession();
      setCompanySession(approvedSession);

      if (!approvedSession) {
        setCompanyDisplayName("");
        return { session: null, profile: null };
      }

      const profile = await getCompanyProfile();
      setCompanyDisplayName(profile?.companyName || approvedSession.username || "");
      return { session: approvedSession, profile };
    } catch (error) {
      console.warn("Could not load company context:", error);
      setCompanySession(null);
      setCompanyDisplayName("");
      return { session: null, profile: null };
    }
  };

  const handleRefreshCaptcha = () => {
    refreshRotate.setValue(0);
    Animated.timing(refreshRotate, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
    generateCaptcha();
  };

  useEffect(() => {
    generateCaptcha();


    if (Platform.OS === "android") {
      NavigationBar.setBackgroundColorAsync("#FFFFFF").catch(() => {});
      NavigationBar.setButtonStyleAsync("dark").catch(() => {});
    }



    const closedOff = closedOffsetRef.current;
    const hiddenOff = hiddenOffsetRef.current;

    headerFade.setValue(0);
    headerSlide.setValue(-10);
    imageFade.setValue(0);
    imageScale.setValue(0.93);
    textPanelFade.setValue(0);
    textPanelSlide.setValue(22);
    panelTranslateY.setValue(hiddenOff);
    buttonsOpacity.setValue(0);

    const runEntrance = () => {
      Animated.parallel([
      Animated.parallel([
      timing(headerFade, 1, 300),
      spring(headerSlide, 0, {
        damping: 20,
        stiffness: 180,
        mass: 0.9,
        overshootClamping: true,
        useNativeDriver: true
      })]
      ),
      Animated.sequence([
      Animated.delay(90),
      Animated.parallel([
      timing(imageFade, 1, 340),
      spring(imageScale, 1, {
        damping: 18,
        stiffness: 165,
        mass: 1,
        overshootClamping: true,
        useNativeDriver: true
      })]
      )]
      ),
      Animated.sequence([
      Animated.delay(170),
      Animated.parallel([
      timing(textPanelFade, 1, 320),
      spring(textPanelSlide, 0, {
        damping: 20,
        stiffness: 175,
        mass: 0.95,
        overshootClamping: true,
        useNativeDriver: true
      })]
      )]
      ),
      Animated.sequence([
      Animated.delay(260),
      Animated.parallel([
      spring(panelTranslateY, closedOff, SPRING_ENTRANCE_PANEL),
      Animated.sequence([
      Animated.delay(140),
      timing(buttonsOpacity, 1, 240)]
      )]
      )]
      )]
      ).start();
    };

    InteractionManager.runAfterInteractions(runEntrance);

  }, [headerFade, headerSlide, imageFade, imageScale, textPanelFade, textPanelSlide, panelTranslateY, buttonsOpacity]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {

      setIsRegisterOpen(false);
      setIsCompanyLoginOpen(false);
      setCompanyLoginNotice(null);

      panelTranslateY.setValue(closedOffsetRef.current);
      buttonsOpacity.setValue(1);
      formOpacity.setValue(0);
      companyFormOpacity.setValue(0);
      backdropOpacity.setValue(0);
      formTranslateY.setValue(24);
      companyFormSlideY.setValue(24);
      syncCompanyContext();
    });

    return unsubscribe;

  }, [navigation]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      if (companyLoginClosingRef.current) return;
      const keyboardTop = event.endCoordinates?.screenY ?? SCREEN_HEIGHT;
      const overlap = Math.max(0, SCREEN_HEIGHT - keyboardTop - Math.max(insets.bottom, 0));
      setKeyboardInset(overlap);
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      if (companyLoginClosingRef.current) return;
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  const verifyCompanySession = async (session) => {
    if (!session?.token) return false;

    const now = Date.now();
    const token = session.token;


    const jwtExpMs = getJwtExpMs(token);


    try {
      const response = await fetch(buildApiUrl("/auth/me"), {
        method: "GET",
        headers: {
          Authorization: `${session.tokenType || "Bearer"} ${token}`
        }
      });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (payload.settings || payload.company?.settings) {
          await saveCompanySession({
            ...session,
            settings: payload.settings || payload.company?.settings,
            company: {
              ...(session.company || {}),
              settings: payload.settings || payload.company?.settings
            }
          });
        }

        _sessionCache.token = token;
        _sessionCache.verifiedAt = now;
        _sessionCache.expiresAt = jwtExpMs || now + 30 * 24 * 60 * 60 * 1000;
        return true;
      }
      clearSessionCache();
      return false;
    } catch {

      _sessionCache.token = token;
      _sessionCache.verifiedAt = now;
      _sessionCache.expiresAt = jwtExpMs || now + 60 * 60 * 1000;
      return true;
    }
  };

  useEffect(() => {
    if (!isCompanyLoginOpen || companySessionChecking || !companySession) return;

    companySessionOpacity.setValue(0);
    companySessionTranslateY.setValue(12);
    Animated.parallel([
    timing(companySessionOpacity, 1, 200),
    spring(companySessionTranslateY, 0, {
      damping: 22,
      stiffness: 220,
      mass: 0.9,
      overshootClamping: true,
      useNativeDriver: true
    })]
    ).start();
  }, [
  isCompanyLoginOpen,
  companySessionChecking,
  companySession,
  companySessionOpacity,
  companySessionTranslateY]
  );

  const getApprovedCompanySession = async () => {
    const storedSession = await getCompanySession();
    const isApproved = await verifyCompanySession(storedSession);

    if (isApproved) {
      return await getCompanySession();
    }

    if (storedSession?.token) {
      await clearCompanySession();
    }
    return null;
  };

  const enterCompanyDashboard = () => {
    Keyboard.dismiss();
    setIsCompanyLoginOpen(false);
    setCompanyLoginNotice(null);
    navigation.replace("FaceVerification", {
      isCompanyLogin: true,
      selectedScanMode: "real"
    });
  };

  const handleCompanyLogout = async () => {
    if (companyLoginLoading) return;

    setCompanyLoginLoading(true);
    try {
      await clearCompanySession();
      clearSessionCache();
      setCompanySession(null);
      setCompanyDisplayName("");
      setCompanyUsername("");
      setCompanyPassword("");
      setCompanyLoginNotice({
        type: "success",
        message: "Company session logged out. Please sign in again."
      });
      Animated.parallel([
      spring(panelTranslateY, OPEN_OFFSET),
      timing(buttonsOpacity, 0, 140, EASE_IN_SMOOTH)]
      ).start();
    } finally {
      setCompanyLoginLoading(false);
    }
  };


  const openCompanyLogin = async () => {
    if (panelAnimatingRef.current || companySessionChecking || isRegisterOpen || isCompanyLoginOpen) return;

    panelAnimatingRef.current = true;
    setCompanyLoginNotice(null);


    setCompanySessionChecking(true);
    let approvedSession = null;
    try {
      approvedSession = await getApprovedCompanySession();
    } catch (error) {
      console.warn("Company session check failed:", error);
    } finally {
      setCompanySessionChecking(false);
    }

    if (approvedSession) {
      panelAnimatingRef.current = false;
      setCompanySession(approvedSession);
      getCompanyProfile().
      then((profile) => {
        if (profile?.companyName) {
          setCompanyDisplayName(profile.companyName);
        }
      }).
      catch(() => {});
      navigation.replace("FaceVerification", {
        isCompanyLogin: true,
        selectedScanMode: "real"
      });
      return;
    }

    setCompanySession(null);
    setIsRegisterOpen(false);
    setIsCompanyLoginOpen(true);
    panelTranslateY.stopAnimation();
    buttonsOpacity.stopAnimation();
    formOpacity.stopAnimation();
    companyFormOpacity.stopAnimation();
    companyFormSlideY.stopAnimation();
    backdropOpacity.stopAnimation();
    panelTranslateY.setValue(stableClosedOffset);
    buttonsOpacity.setValue(0);
    formOpacity.setValue(0);
    companyFormOpacity.setValue(0);
    companyFormSlideY.setValue(24);
    backdropOpacity.setValue(0);

    Animated.parallel([
    spring(panelTranslateY, OPEN_OFFSET),
    timing(buttonsOpacity, 0, 140, EASE_IN_SMOOTH),
    timing(companyFormOpacity, 1, 280),
    timing(backdropOpacity, 1, 300),
    spring(companyFormSlideY, 0, SPRING_SHEET_OPEN)]
    ).start(() => {
      panelAnimatingRef.current = false;
    });
  };


  const closeCompanyLogin = () => {
    if (panelAnimatingRef.current) return;

    panelAnimatingRef.current = true;
    companyLoginClosingRef.current = true;
    panelTranslateY.stopAnimation();
    buttonsOpacity.stopAnimation();
    companyFormOpacity.stopAnimation();
    companyFormSlideY.stopAnimation();
    backdropOpacity.stopAnimation();
    buttonsOpacity.setValue(0);

    Animated.parallel([
    timing(companyFormOpacity, 0, 120, EASE_IN_SMOOTH),
    timing(companyFormSlideY, 14, 140, EASE_IN_SMOOTH),
    timing(backdropOpacity, 0, 220, EASE_IN_SMOOTH)]
    ).start(() => {
      spring(panelTranslateY, stableClosedOffset, SPRING_SHEET_CLOSE).start((finished) => {
        Keyboard.dismiss();

        if (finished) {
          setIsCompanyLoginOpen(false);
          setCompanyUsername("");
          setCompanyPassword("");
          setCompanySecureEntry(true);
          setCompanyLoginNotice(null);
          setKeyboardInset(0);
          formOpacity.setValue(0);
          companyFormOpacity.setValue(0);
          companyFormSlideY.setValue(24);
          backdropOpacity.setValue(0);
          panelTranslateY.setValue(stableClosedOffset);
          timing(buttonsOpacity, 1, 200).start(() => {
            companyLoginClosingRef.current = false;
            panelAnimatingRef.current = false;
          });
        } else {
          companyLoginClosingRef.current = false;
          panelAnimatingRef.current = false;
        }
      });
    });
  };


  const handleCompanyLoginSubmit = async () => {
    if (companyLoginLoading) return;

    const trimmedUser = companyUsername.trim();
    const trimmedPass = companyPassword.trim();

    if (!trimmedUser || !trimmedPass) {
      setCompanyLoginNotice({
        type: "error",
        message: "Enter both company username and password."
      });
      return;
    }

    setCompanyLoginLoading(true);
    setCompanyLoginNotice(null);

    try {
      const response = await fetch(buildApiUrl("/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: trimmedUser,
          password: trimmedPass
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCompanyLoginNotice({
          type: "error",
          message: payload.message || "Invalid username or password."
        });
        return;
      }

      const session = {
        token: payload.token,
        tokenType: payload.tokenType || "Bearer",
        expiresIn: payload.expiresIn,
        username: trimmedUser,
        companyId: payload.company?.id || null,
        companyName: payload.companyName || payload.company?.companyName || null,
        company: payload.company || null,
        loggedInAt: new Date().toISOString()
      };

      await saveCompanySession(session);
      const profile = await cacheCompanyProfileAfterLogin(session);

      const jwtExpMs = getJwtExpMs(session.token);
      _sessionCache.token = session.token;
      _sessionCache.verifiedAt = Date.now();
      _sessionCache.expiresAt = jwtExpMs || Date.now() + 30 * 24 * 60 * 60 * 1000;
      setCompanySession(session);
      setCompanyDisplayName(profile?.companyName || "");

      setCompanyLoginNotice({
        type: "success",
        message: "Company login successful."
      });
      enterCompanyDashboard();
    } catch (error) {
      setCompanyLoginNotice({
        type: "error",
        message: INTERNET_CONNECTION_ERROR
      });
    } finally {
      setCompanyLoginLoading(false);
    }
  };


  const openRegisterSheet = async () => {
    if (panelAnimatingRef.current || isRegisterOpen || isCompanyLoginOpen) return;

    panelAnimatingRef.current = true;
    syncCompanyContext();
    panelTranslateY.stopAnimation();
    buttonsOpacity.stopAnimation();
    formOpacity.stopAnimation();
    formTranslateY.stopAnimation();
    companyFormOpacity.stopAnimation();
    backdropOpacity.stopAnimation();

    setIsRegisterOpen(true);
    setIsCompanyLoginOpen(false);
    resetFormScroll(false);
    panelTranslateY.setValue(stableClosedOffset);
    buttonsOpacity.setValue(0);
    formOpacity.setValue(0);
    formTranslateY.setValue(24);
    companyFormOpacity.setValue(0);
    backdropOpacity.setValue(0);

    Animated.parallel([
    spring(panelTranslateY, OPEN_OFFSET),
    timing(buttonsOpacity, 0, 140, EASE_IN_SMOOTH),
    timing(formOpacity, 1, 280),
    timing(backdropOpacity, 1, 300),
    spring(formTranslateY, 0, SPRING_SHEET_OPEN)]
    ).start(() => {
      panelAnimatingRef.current = false;
    });
  };


  const closeRegisterSheet = () => {
    if (panelAnimatingRef.current) return;

    panelAnimatingRef.current = true;
    panelTranslateY.stopAnimation();
    buttonsOpacity.stopAnimation();
    formOpacity.stopAnimation();
    formTranslateY.stopAnimation();
    backdropOpacity.stopAnimation();
    buttonsOpacity.setValue(0);

    Animated.parallel([
    timing(formOpacity, 0, 120, EASE_IN_SMOOTH),
    timing(formTranslateY, 14, 140, EASE_IN_SMOOTH),
    timing(backdropOpacity, 0, 220, EASE_IN_SMOOTH)]
    ).start(() => {
      spring(panelTranslateY, stableClosedOffset, SPRING_SHEET_CLOSE).start((finished) => {
        if (finished) {
          setIsRegisterOpen(false);
          formOpacity.setValue(0);
          formTranslateY.setValue(24);
          companyFormOpacity.setValue(0);
          backdropOpacity.setValue(0);
          panelTranslateY.setValue(stableClosedOffset);
          resetFormScroll(false);
          timing(buttonsOpacity, 1, 200).start(() => {
            panelAnimatingRef.current = false;
          });
        } else {
          panelAnimatingRef.current = false;
        }
      });
    });
  };

  const handleRefreshDb = async () => {
    dbRefreshSpinValue.setValue(0);
    Animated.timing(dbRefreshSpinValue, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();

    try {
      const [emp, list] = await Promise.all([getEmployee(), getAllEmployees()]);
      setDbEmployee(emp);
      setDbEmployeesList(list);

      refreshMissingEmployeesFromCloud().
      then(async (syncResult) => {
        const activeEmployee = await getEmployee();
        setDbEmployee(activeEmployee);
        setDbEmployeesList(syncResult?.employees || []);
      }).
      catch((syncError) => {
        console.warn("Cloud employee refresh skipped:", syncError?.message || syncError);
      }).
      finally(() => {
        dbRefreshSpinValue.setValue(0);
      });
    } catch (error) {
      console.error("Failed to refresh database data:", error);
      dbRefreshSpinValue.setValue(0);
    }
  };

  const handleDeleteEmployee = async (employeeId) => {
    Alert.alert(
      "Delete Profile",
      "Are you sure you want to permanently delete this employee profile? This action cannot be undone.",
      [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteEmployee(employeeId);
            closeDetailSheet();
            handleRefreshDb();
          } catch (error) {
            console.error("Failed to delete employee:", error);
            Alert.alert("Error", "Failed to delete the employee profile.");
          }
        }
      }]

    );
  };

  const openDbDrawer = async () => {
    handleRefreshDb();
    setIsDbDrawerOpen(true);
    dbDrawerTranslateX.stopAnimation();
    dbBackdropOpacity.stopAnimation();
    dbDrawerTranslateX.setValue(SCREEN_WIDTH);
    dbBackdropOpacity.setValue(0);
    Animated.parallel([
    spring(dbDrawerTranslateX, 0, SPRING_DRAWER_OPEN),
    timing(dbBackdropOpacity, 1, 300)]
    ).start();
  };

  const closeDbDrawer = () => {
    dbDrawerTranslateX.stopAnimation();
    dbBackdropOpacity.stopAnimation();
    Animated.parallel([
    timing(dbDrawerTranslateX, SCREEN_WIDTH, 260, EASE_IN_SMOOTH),
    timing(dbBackdropOpacity, 0, 240, EASE_IN_SMOOTH)]
    ).start((finished) => {
      if (finished) {
        setIsDbDrawerOpen(false);
      }
    });
  };

  const openDetailSheet = (employee) => {

    detailSheetTranslateY.stopAnimation();
    detailBackdropOpacity.stopAnimation();
    detailSheetTranslateY.setValue(SCREEN_HEIGHT);
    detailBackdropOpacity.setValue(0);
    skeletonOpacity.setValue(1);
    setDetailSheetReady(false);
    setSelectedDbEmployee(employee);
    setSelectedStatType(null);
    setIsDetailSheetOpen(true);

    Animated.parallel([
    spring(detailSheetTranslateY, 0, SPRING_SHEET_OPEN),
    timing(detailBackdropOpacity, 1, 280)]
    ).start();

    requestAnimationFrame(() => {
      setDetailSheetReady(true);
      timing(skeletonOpacity, 0, 150).start();
    });
  };

  const openStatDetailSheet = (type) => {

    detailSheetTranslateY.stopAnimation();
    detailBackdropOpacity.stopAnimation();
    detailSheetTranslateY.setValue(SCREEN_HEIGHT);
    detailBackdropOpacity.setValue(0);
    skeletonOpacity.setValue(1);
    setDetailSheetReady(false);
    setSelectedStatType(type);
    setSelectedDbEmployee(null);
    setIsDetailSheetOpen(true);

    Animated.parallel([
    spring(detailSheetTranslateY, 0, SPRING_SHEET_OPEN),
    timing(detailBackdropOpacity, 1, 280)]
    ).start();
    requestAnimationFrame(() => {
      setDetailSheetReady(true);
      timing(skeletonOpacity, 0, 150).start();
    });
  };

  const closeDetailSheet = () => {
    detailSheetTranslateY.stopAnimation();
    detailBackdropOpacity.stopAnimation();
    Animated.parallel([
    timing(detailSheetTranslateY, SCREEN_HEIGHT, 280, EASE_IN_SMOOTH),
    timing(detailBackdropOpacity, 0, 260, EASE_IN_SMOOTH)]
    ).start((finished) => {
      if (finished) {
        setIsDetailSheetOpen(false);
        setSelectedDbEmployee(null);
        setSelectedStatType(null);
        setDetailSheetReady(false);
      }
    });
  };

  const openPicker = (type) => {
    setActivePicker(type);
    const translateYValue = type === "department" ? depPickerTranslateY : desPickerTranslateY;
    const backdropOpacityValue = type === "department" ? depBackdropOpacity : desBackdropOpacity;

    translateYValue.stopAnimation();
    backdropOpacityValue.stopAnimation();
    translateYValue.setValue(SCREEN_HEIGHT);
    backdropOpacityValue.setValue(0);

    Animated.parallel([
    spring(translateYValue, 0, SPRING_SHEET_OPEN),
    timing(backdropOpacityValue, 1, 260)]
    ).start();
  };

  const closePicker = () => {
    const type = activePicker;
    if (!type) return;

    const translateYValue = type === "department" ? depPickerTranslateY : desPickerTranslateY;
    const backdropOpacityValue = type === "department" ? depBackdropOpacity : desBackdropOpacity;

    translateYValue.stopAnimation();
    backdropOpacityValue.stopAnimation();

    Animated.parallel([
    timing(translateYValue, SCREEN_HEIGHT, 240, EASE_IN_SMOOTH),
    timing(backdropOpacityValue, 0, 220, EASE_IN_SMOOTH)]
    ).start((finished) => {
      if (finished) {
        setActivePicker(null);
      }
    });
  };

  useEffect(() => {
    const backSubscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (activePicker) {
        closePicker();
        return true;
      }

      if (isDetailSheetOpen) {
        closeDetailSheet();
        return true;
      }

      if (isDbDrawerOpen) {
        closeDbDrawer();
        return true;
      }

      if (isCompanyLoginOpen) {
        closeCompanyLogin();
        return true;
      }

      if (isRegisterOpen) {
        closeRegisterSheet();
        return true;
      }

      return false;
    });

    return () => {
      backSubscription.remove();
    };
  }, [activePicker, isDetailSheetOpen, isDbDrawerOpen, isCompanyLoginOpen, isRegisterOpen]);

  const handleSelectOption = (option) => {
    if (activePicker === "department") {
      setDepartment((prev) => prev === option ? "" : option);
    } else {
      setDesignation((prev) => prev === option ? "" : option);
    }
    closePicker();
  };

  const handleRegisterSubmit = async () => {
    if (registrationSaving) {
      return;
    }

    const { session: approvedCompanySession, profile: approvedCompanyProfile } = await syncCompanyContext();

    if (!approvedCompanySession?.token) {
      Alert.alert(
        "Company Login Required",
        "Please login by company first, then come back to this page and register the employee."
      );
      return;
    }

    const trimmedName = name.trim();
    const trimmedId = employeeId.trim().toUpperCase();
    const trimmedPassword = password.trim();
    const activeCompanyName =
    approvedCompanyProfile?.companyName ||
    companyDisplayName ||
    approvedCompanySession.username ||
    "Company";

    if (!trimmedName || !trimmedId || !trimmedPassword || !department) {
      Alert.alert("Registration Error", "Please fill in all fields marked with *.");
      return;
    }

    if (trimmedName.length > MAX_FULL_NAME_LENGTH) {
      Alert.alert("Registration Error", `Full name must be ${MAX_FULL_NAME_LENGTH} characters or less.`);
      return;
    }

    if (!EMPLOYEE_ID_PATTERN.test(trimmedId)) {
      Alert.alert("Registration Error", "Employee ID must be 4 to 8 characters using letters, numbers, or hyphens.");
      return;
    }

    if (!PASSWORD_PATTERN.test(trimmedPassword)) {
      Alert.alert("Registration Error", "Password must be 8 to 32 characters and include at least one letter and one number.");
      return;
    }

    if (captchaInput.trim() !== captchaCode) {
      Alert.alert("Verification Failed", "The captcha code you entered is incorrect. Please try again.");
      generateCaptcha();
      return;
    }

    try {
      setRegistrationSaving(true);
      const newEmployee = {
        name: trimmedName,
        employeeId: trimmedId,
        password: trimmedPassword,
        department: department.trim(),
        designation: designation.trim() || "",
        embedding: null,
        embeddingProvider: FACE_ENGINE.provider,
        embeddingModel: FACE_ENGINE.modelName,
        faceVerifiedAt: null,
        faceTemplateRegisteredAt: null,
        companyId: approvedCompanySession.companyId || null,
        companyName: activeCompanyName,
        companyUsername: approvedCompanySession.username || null,
        companyLoggedInAt: approvedCompanySession.loggedInAt || null,
        registeredAt: new Date().toISOString()
      };

      navigation.replace("FaceVerification", {
        pendingRegistrationEmployee: newEmployee
      });
    } catch (error) {
      setRegistrationSaving(false);
      Alert.alert("Error", "Failed to register face template.");
      console.error(error);
    }
  };

  const allEmployees = dbEmployeesList;
  const hasCompanyForRegistration = Boolean(companySession?.token);
  const registrationCompanyName = companyDisplayName || companySession?.username || "Company";

  const filteredEmployees = allEmployees.filter((emp) => {
    if (!dbSearchQuery) return true;
    const query = dbSearchQuery.toLowerCase();
    const nameMatch = emp.name ? emp.name.toLowerCase().includes(query) : false;
    const idMatch = emp.employeeId ? emp.employeeId.toLowerCase().includes(query) : false;
    return nameMatch || idMatch;
  });

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor={PAGE_BG} translucent={true} />

      {}
      <View
        style={[
        styles.contentContainer,
        {
          paddingTop: Math.max(insets.top, 16) + 10,
          paddingBottom: Math.max(insets.bottom, 16) + 175
        }]
        }>
        
        {}
        <Animated.View
          style={[
          styles.headerBar,
          {
            opacity: headerFade,
            transform: [{ translateY: headerSlide }]
          }]
          }>
          
          <View style={styles.headerLeft}>
            <Image
              source={require("../assets/splash.png")}
              style={styles.headerLogo}
              resizeMode="contain" />
            
            <Image
              source={require("../assets/name.png")}
              style={styles.headerName}
              resizeMode="contain" />
            
          </View>
          <TouchableOpacity
            style={styles.storageButton}
            onPress={openDbDrawer}
            activeOpacity={0.7}>
            
            <Image
              source={require("../assets/icons8-storage-100.png")}
              style={styles.storageIcon}
              resizeMode="contain" />
            
          </TouchableOpacity>
        </Animated.View>

        {}
        <Animated.View
          style={[
          styles.imageContainer,
          {
            opacity: imageFade,
            transform: [{ scale: imageScale }]
          }]
          }>
          
          <Image
            source={require("../assets/get-started.png")}
            style={styles.image}
            resizeMode="contain" />
          
        </Animated.View>

        {}
        <Animated.View
          style={[
          styles.textPanel,
          {
            opacity: textPanelFade,
            transform: [{ translateY: textPanelSlide }]
          }]
          }>
          
          <View style={styles.textContainer}>
            <Image
              source={require("../assets/started.png")}
              style={styles.titleImage}
              resizeMode="contain" />
            
            <Text style={styles.subtitle}>
              Experience the future of clocking in. Quick, touchless, and secure face attendance for your workplace.
            </Text>
          </View>
        </Animated.View>
      </View>

      {}
      <Animated.View
        pointerEvents={isRegisterOpen || isCompanyLoginOpen ? "auto" : "none"}
        style={[
        styles.backdrop,
        { opacity: backdropOpacity }]
        }>
        
        <TouchableWithoutFeedback onPress={isCompanyLoginOpen ? closeCompanyLogin : closeRegisterSheet}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {}
      <Animated.View
        collapsable={false}
        style={[
        styles.bottomPanel,
        {
          height: PANEL_HEIGHT,
          transform: [{ translateY: panelTranslateY }]
        }]
        }>
        
        {}
        <Animated.View
          pointerEvents={isRegisterOpen || isCompanyLoginOpen ? "none" : "auto"}
          style={[
          styles.buttonsContainer,
          {
            opacity: buttonsOpacity,
            paddingBottom: Math.max(insets.bottom, 16) + 12
          }]
          }>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={openRegisterSheet}
              disabled={companySessionChecking}
              activeOpacity={0.85}>
              
              <Text style={styles.primaryButtonText}>Create employee account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
              styles.secondaryButton,
              companySessionChecking && styles.secondaryButtonDisabled]
              }
              onPress={openCompanyLogin}
              disabled={companySessionChecking}
              activeOpacity={0.7}>
              
              {companySessionChecking ?
              <View style={styles.secondaryButtonLoader}>
                  <SpinnerLoader size={22} color="#18232F" />
                </View> :

              <>
                  <Text style={styles.secondaryButtonText}>Login as</Text>
                  <Image
                  source={require("../assets/company.png")}
                  style={styles.secondaryButtonLogo} />
                
                </>
              }
            </TouchableOpacity>
          </View>
        </Animated.View>

        {}
        <Animated.View
          pointerEvents={isRegisterOpen && !isCompanyLoginOpen ? "auto" : "none"}
          style={[
          styles.formContainer,
          {
            opacity: formOpacity,
            transform: [{ translateY: formTranslateY }],
            paddingBottom: Math.max(insets.bottom, 12) + 4
          }]
          }>
          
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Math.max(insets.top, 12)}
            style={styles.keyboardFrame}>
            
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Register Employee Account</Text>
              <Text style={styles.sheetSubtitle}>Enter details to initialize face template</Text>
            </View>

            <ScrollView
              ref={formScrollRef}
              contentContainerStyle={[
              styles.formScroll,
              { paddingBottom: keyboardInset > 0 ? Math.max(insets.bottom, 16) + 180 : 24 }]
              }
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
              
              <View
                style={[
                styles.registrationCompanyPanel,
                hasCompanyForRegistration ?
                styles.registrationCompanyPanelReady :
                styles.registrationCompanyPanelWarning]
                }>
                
                <View
                  style={[
                  styles.registrationCompanyIcon,
                  hasCompanyForRegistration ?
                  styles.registrationCompanyIconReady :
                  styles.registrationCompanyIconWarning]
                  }>
                  
                  <Ionicons
                    name={hasCompanyForRegistration ? "business" : "alert-circle"}
                    size={20}
                    color="#16A34A" />
                  
                </View>
                <View style={styles.registrationCompanyCopy}>
                  <Text
                    style={[
                    styles.registrationCompanyEyebrow,
                    hasCompanyForRegistration ?
                    styles.registrationCompanyEyebrowReady :
                    styles.registrationCompanyEyebrowWarning]
                    }>
                    
                    Where to save?
                  </Text>
                  <Text style={styles.registrationCompanyTitle} numberOfLines={2}>
                    {hasCompanyForRegistration ?
                    registrationCompanyName :
                    "Login by company first"}
                  </Text>
                  <Text style={styles.registrationCompanyText}>
                    {hasCompanyForRegistration ?
                    `This employee account will be saved for ${registrationCompanyName}.` :
                    "Please login by company, then come back to this page and register the employee."}
                  </Text>
                </View>
              </View>

              {}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Akash Nitesh Pandey"
                  placeholderTextColor="#A0AEC0"
                  value={name}
                  onChangeText={setName}
                  onFocus={() => scrollFormTo(0)}
                  maxLength={MAX_FULL_NAME_LENGTH}
                  returnKeyType="next" />
                
                <Text style={styles.hintText}>
                  For this MVP, you can write any name.{" "}
                  <Text style={styles.hintTextProduction}>
                    In production, use the same name printed on your ID card because it will be verified.
                  </Text>
                </Text>
              </View>

              {}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Employee ID *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. EMP-101"
                  placeholderTextColor="#A0AEC0"
                  value={employeeId}
                  onChangeText={setEmployeeId}
                  autoCapitalize="characters"
                  onFocus={() => scrollFormTo(72)}
                  maxLength={8}
                  returnKeyType="next" />
                
                <Text style={styles.fieldRuleText}>
                  Employee ID must be 4-8 letters, numbers, or hyphens.
                </Text>
              </View>

              {}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="••••••••"
                  placeholderTextColor="#A0AEC0"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={true}
                  onFocus={() => scrollFormTo(150)}
                  maxLength={32}
                  returnKeyType="done" />
                
                <Text style={styles.fieldRuleText}>
                  Password must be 8-32 characters with at least one letter and one number.
                </Text>
                <Text style={styles.hintText}>
                  For this MVP, you can use any employee ID and password. Please remember them for login and testing.{" "}
                  <Text style={styles.hintTextProduction}>
                    In production, employees will use their real employee ID and password provided by the company.
                  </Text>
                </Text>
              </View>

              {}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Department *</Text>
                <TouchableOpacity
                  style={styles.selectorField}
                  onPress={() => openPicker("department")}
                  activeOpacity={0.7}>
                  
                  <Text style={[styles.selectorValue, !department && styles.selectorPlaceholder]}>
                    {department || "Select Department"}
                  </Text>
                  <Text style={styles.selectorArrow}>▾</Text>
                </TouchableOpacity>
              </View>

              {}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Designation</Text>
                <TouchableOpacity
                  style={styles.selectorField}
                  onPress={() => openPicker("designation")}
                  activeOpacity={0.7}>
                  
                  <Text style={[styles.selectorValue, !designation && styles.selectorPlaceholder]}>
                    {designation || "Select Designation"}
                  </Text>
                  <Text style={styles.selectorArrow}>▾</Text>
                </TouchableOpacity>
              </View>

              {}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Security Captcha *</Text>
                <View style={styles.captchaRow}>
                  <View style={styles.captchaBox}>
                    <Text style={styles.captchaText}>{captchaCode}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.captchaRefreshButton}
                    onPress={handleRefreshCaptcha}
                    activeOpacity={0.7}>
                    
                    <Animated.View
                      style={{
                        transform: [
                        {
                          rotate: refreshRotate.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0deg", "360deg"]
                          })
                        }]

                      }}>
                      
                      <Image
                        source={require("../assets/refresh-348 (1).png")}
                        style={{ width: 24, height: 24 }}
                        resizeMode="contain" />
                      
                    </Animated.View>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.captchaInput}
                    placeholder={isCaptchaFocused ? "" : "Enter Code"}
                    placeholderTextColor="#A0AEC0"
                    keyboardType="number-pad"
                    maxLength={4}
                    value={captchaInput}
                    onChangeText={setCaptchaInput}
                    onFocus={() => {
                      setIsCaptchaFocused(true);
                      scrollFormTo(470);
                    }}
                    onBlur={() => setIsCaptchaFocused(false)}
                    returnKeyType="done" />
                  
                </View>
              </View>

              {}
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[
                  styles.sheetPrimaryButton,
                  registrationSaving && styles.sheetPrimaryButtonDisabled]
                  }
                  onPress={handleRegisterSubmit}
                  disabled={registrationSaving}
                  activeOpacity={0.85}>
                  
                  {registrationSaving ?
                  <ActivityIndicator size="small" color="#FFFFFF" /> :

                  <Text style={styles.sheetPrimaryButtonText}>
                      Register Face & Enter
                    </Text>
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetSecondaryButton}
                  onPress={closeRegisterSheet}
                  disabled={registrationSaving}
                  activeOpacity={0.7}>
                  
                  <Text style={styles.sheetSecondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>

        {}
        <Animated.View
          pointerEvents={isCompanyLoginOpen && !isRegisterOpen ? "auto" : "none"}
          style={[
          styles.formContainer,
          {
            opacity: companyFormOpacity,
            transform: [{ translateY: companyFormSlideY }],
            paddingBottom: Math.max(insets.bottom, 12) + 4
          }]
          }>
          
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Math.max(insets.top, 12)}
            style={styles.keyboardFrame}>
            
            <View
              style={[
              styles.sheetHeader,
              (companySessionChecking || companySession) && styles.companySheetHeaderCompact]
              }>
              
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Company Login</Text>
              <Text style={styles.sheetSubtitle}>Sign in with your organization credentials</Text>
            </View>

            <ScrollView
              contentContainerStyle={[
              styles.formScroll,
              (companySessionChecking || companySession) && styles.companySessionScroll,
              {
                paddingBottom: keyboardInset > 0 ?
                Math.max(insets.bottom, 16) + 180 :
                companySessionChecking || companySession ?
                Math.max(insets.bottom, 16) + 18 :
                24
              }]
              }
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
              
              {!companySessionChecking && !companySession ?
              <View style={{ alignItems: "center", marginBottom: 20 }}>
                  <View style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  backgroundColor: "#EFF6FF",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                    <Ionicons name="business" size={30} color="#3B82F6" />
                  </View>
                </View> :
              null}

              {companySessionChecking ?
              <View style={styles.companySessionPanel}>
                  <ActivityIndicator size="small" color="#2F69FF" />
                  <Text style={styles.companySessionTitle}>Checking saved login</Text>
                  <Text style={styles.companySessionText}>
                    Approving your company JWT with the backend.
                  </Text>
                </View> :
              companySession ?
              <Animated.View
                style={{
                  opacity: companySessionOpacity,
                  transform: [{ translateY: companySessionTranslateY }]
                }}>
                
                  <View style={styles.companySessionPanel}>
                    <View style={styles.companySessionStatusRow}>
                      <View style={styles.companySessionIcon}>
                        <Ionicons name="key-outline" size={20} color="#1D4ED8" />
                      </View>
                      <View style={styles.companySessionCopy}>
                        <Text style={styles.companySessionEyebrow}>Active company session</Text>
                        <Text style={styles.companySessionTitle}>
                          {companyDisplayName || companySession.username || "Company"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.companySessionText}>
                      {companySession.username ?
                    `Signed in as ${companySession.username}. Your backend token is approved.` :
                    "Your backend token is approved."}{" "}
                      Continue to the dashboard or log out to use another company account.
                    </Text>
                  </View>

                  <View style={styles.companySessionActions}>
                    <TouchableOpacity
                    style={[styles.sheetPrimaryButton, styles.companySessionPrimaryButton]}
                    onPress={enterCompanyDashboard}
                    disabled={companyLoginLoading}
                    activeOpacity={0.85}>
                    
                      <Text style={styles.sheetPrimaryButtonText}>Enter dashboard</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                    style={styles.companyLogoutButton}
                    onPress={handleCompanyLogout}
                    disabled={companyLoginLoading}
                    activeOpacity={0.75}>
                    
                      {companyLoginLoading ?
                    <ActivityIndicator size="small" color="#DC2626" /> :

                    <Text style={styles.companyLogoutButtonText}>Log out</Text>
                    }
                    </TouchableOpacity>

                    <TouchableOpacity
                    style={styles.companyCancelButton}
                    onPress={closeCompanyLogin}
                    disabled={companyLoginLoading}
                    activeOpacity={0.7}>
                    
                      <Text style={styles.companyCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View> :

              <>
              {}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Company Username *</Text>
                <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: companyLoginNotice?.type === "error" ? "#FCA5A5" : "#E2E8F0",
                    borderRadius: 8,
                    backgroundColor: "#FFFFFF",
                    paddingHorizontal: 14
                  }}>
                  <Ionicons name="person-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                  <TextInput
                      style={[styles.textInput, { borderWidth: 0, paddingHorizontal: 0, flex: 1 }]}
                      placeholder="Enter company username"
                      placeholderTextColor="#A0AEC0"
                      value={companyUsername}
                      onChangeText={(value) => {
                        setCompanyUsername(value);
                        setCompanyLoginNotice(null);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next" />
                    
                </View>
              </View>

              {}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Company Password *</Text>
                <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: companyLoginNotice?.type === "error" ? "#FCA5A5" : "#E2E8F0",
                    borderRadius: 8,
                    backgroundColor: "#FFFFFF",
                    paddingHorizontal: 14
                  }}>
                  <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                  <TextInput
                      style={[styles.textInput, { borderWidth: 0, paddingHorizontal: 0, flex: 1 }]}
                      placeholder="Enter company password"
                      placeholderTextColor="#A0AEC0"
                      value={companyPassword}
                      onChangeText={(value) => {
                        setCompanyPassword(value);
                        setCompanyLoginNotice(null);
                      }}
                      secureTextEntry={companySecureEntry}
                      returnKeyType="done"
                      onSubmitEditing={handleCompanyLoginSubmit} />
                    
                  <TouchableOpacity
                      onPress={() => setCompanySecureEntry((prev) => !prev)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      
                    <Ionicons
                        name={companySecureEntry ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color="#94A3B8" />
                      
                  </TouchableOpacity>
                </View>
              </View>

              {companyLoginNotice ?
                <View
                  style={[
                  styles.companyLoginNotice,
                  companyLoginNotice.type === "success" && styles.companyLoginNoticeSuccess]
                  }>
                  
                  <Ionicons
                    name={companyLoginNotice.type === "success" ? "checkmark-circle" : "alert-circle"}
                    size={18}
                    color={companyLoginNotice.type === "success" ? "#16A34A" : "#DC2626"}
                    style={styles.companyLoginNoticeIcon} />
                  
                  <Text
                    style={[
                    styles.companyLoginNoticeText,
                    companyLoginNotice.type === "success" && styles.companyLoginNoticeTextSuccess]
                    }>
                    
                    {companyLoginNotice.message}
                  </Text>
                </View> :
                null}

              {}
              <View style={{
                  flexDirection: "row",
                  backgroundColor: "#FFFBEB",
                  borderRadius: 12,
                  padding: 14,
                  marginTop: 4,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: "#FEF3C7"
                }}>
                <Ionicons name="information-circle" size={20} color="#D97706" style={{ marginRight: 10, marginTop: 1 }} />
                <Text style={{
                    flex: 1,
                    fontSize: 12.5,
                    lineHeight: 18,
                    color: "#92400E",
                    fontWeight: "500"
                  }}>
                  Use the same company username and password registered for your organization. Contact your admin if you don't have credentials.
                </Text>
              </View>

              {}
              <View style={{
                  flexDirection: "row",
                  backgroundColor: "#EFF6FF",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: "#DBEAFE"
                }}>
                <Ionicons name="flask" size={18} color="#2563EB" style={{ marginRight: 10, marginTop: 1 }} />
                <Text style={{
                    flex: 1,
                    fontSize: 12.5,
                    lineHeight: 18,
                    color: "#1E40AF",
                    fontWeight: "500"
                  }}>
                  For MVP product demo, you can login using SweFace company demo credentials —{" "}
                  <Text style={{ fontWeight: "800" }}>Username: admin</Text>,{" "}
                  <Text style={{ fontWeight: "800" }}>Password: sweface123</Text>.
                </Text>
              </View>

              {}
              <View style={{
                  flexDirection: "row",
                  backgroundColor: "#F0FDF4",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: "#DCFCE7"
                }}>
                <Ionicons name="shield-checkmark" size={18} color="#16A34A" style={{ marginRight: 10, marginTop: 1 }} />
                <Text style={{
                    flex: 1,
                    fontSize: 12.5,
                    lineHeight: 18,
                    color: "#166534",
                    fontWeight: "500"
                  }}>
                  A 30-day session will be applied, after which the session will expire and you must login again. Uploading IDs on the server is completely secure.
                </Text>
              </View>

              {}
              <View style={styles.formActions}>
                <TouchableOpacity
                    style={[
                    styles.sheetPrimaryButton,
                    companyLoginLoading && styles.sheetPrimaryButtonDisabled]
                    }
                    onPress={handleCompanyLoginSubmit}
                    disabled={companyLoginLoading}
                    activeOpacity={0.85}>
                    
                  {companyLoginLoading ?
                    <ActivityIndicator size="small" color="#FFFFFF" /> :

                    <Text style={styles.sheetPrimaryButtonText}>
                      Sign In
                    </Text>
                    }
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.sheetSecondaryButton}
                    onPress={closeCompanyLogin}
                    disabled={companyLoginLoading}
                    activeOpacity={0.7}>
                    
                  <Text style={styles.sheetSecondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
                </>
              }
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      </Animated.View>



      {}
      <Animated.View
        style={[
        styles.pickerBackdrop,
        { opacity: depBackdropOpacity }]
        }
        pointerEvents={activePicker === "department" ? "auto" : "none"}>
        
        <TouchableWithoutFeedback onPress={closePicker}>
          <View style={styles.pickerBackdropTap} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
          styles.pickerContainer,
          {
            transform: [{ translateY: depPickerTranslateY }],
            paddingBottom: Math.max(insets.bottom, 16) + 12
          }]
          }>
          
          <View style={styles.sheetHandle} />
          <Text style={styles.pickerHeader}>Select Department</Text>

          <View style={styles.pickerOptionsList}>
            {DEPARTMENTS.map((option) => {
              const isSelected = department === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.pickerOptionRow, isSelected && styles.pickerOptionSelected]}
                  onPress={() => handleSelectOption(option)}
                  activeOpacity={0.7}>
                  
                  <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionSelectedText]}>
                    {option}
                  </Text>
                  {isSelected &&
                  <View style={styles.selectedIndicator}>
                      <View style={styles.selectedIndicatorInner} />
                    </View>
                  }
                </TouchableOpacity>);

            })}
          </View>

          <TouchableOpacity
            style={styles.pickerCloseButton}
            onPress={closePicker}
            activeOpacity={0.85}>
            
            <Text style={styles.pickerCloseButtonText}>Close</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {}
      <Animated.View
        style={[
        styles.pickerBackdrop,
        { opacity: desBackdropOpacity }]
        }
        pointerEvents={activePicker === "designation" ? "auto" : "none"}>
        
        <TouchableWithoutFeedback onPress={closePicker}>
          <View style={styles.pickerBackdropTap} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
          styles.pickerContainer,
          {
            transform: [{ translateY: desPickerTranslateY }],
            paddingBottom: Math.max(insets.bottom, 16) + 12
          }]
          }>
          
          <View style={styles.sheetHandle} />
          <Text style={styles.pickerHeader}>Select Designation</Text>

          <View style={styles.pickerOptionsList}>
            {DESIGNATIONS.map((option) => {
              const isSelected = designation === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.pickerOptionRow, isSelected && styles.pickerOptionSelected]}
                  onPress={() => handleSelectOption(option)}
                  activeOpacity={0.7}>
                  
                  <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionSelectedText]}>
                    {option}
                  </Text>
                  {isSelected &&
                  <View style={styles.selectedIndicator}>
                      <View style={styles.selectedIndicatorInner} />
                    </View>
                  }
                </TouchableOpacity>);

            })}
          </View>

          <TouchableOpacity
            style={styles.pickerCloseButton}
            onPress={closePicker}
            activeOpacity={0.85}>
            
            <Text style={styles.pickerCloseButtonText}>Close</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {}
      <Animated.View
        style={[
        styles.dbBackdrop,
        { opacity: dbBackdropOpacity }]
        }
        pointerEvents={isDbDrawerOpen ? "auto" : "none"}>
        
        <TouchableWithoutFeedback onPress={closeDbDrawer}>
          <View style={styles.pickerBackdropTap} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {}
      <Animated.View
        collapsable={false}
        style={[
        styles.dbDrawer,
        {
          transform: [{ translateX: dbDrawerTranslateX }]
        }]
        }
        pointerEvents={isDbDrawerOpen ? "auto" : "none"}>
        
        {}
        <View style={[styles.dbHeader, { paddingTop: Math.max(insets.top, 16) + 12 }]}>
          <View>
            <View style={styles.dbTitleRow}>
              <Text style={styles.dbTitle}>Local</Text>
              <Image
                source={require("../assets/database.png")}
                style={styles.dbTitleImage}
                resizeMode="contain" />
              
            </View>
            <Text style={styles.dbSubtitle}>Registered profiles & vectors</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
                justifyContent: "center"
              }}
              onPress={handleRefreshDb}
              activeOpacity={0.7}>
              
              <Animated.View
                style={{
                  transform: [
                  {
                    rotate: dbRefreshSpinValue.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"]
                    })
                  }]

                }}>
                
                <Image
                  source={require("../assets/refresh-348 (1).png")}
                  style={{ width: 20, height: 20 }}
                  resizeMode="contain" />
                
              </Animated.View>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
                justifyContent: "center"
              }}
              onPress={closeDbDrawer}
              activeOpacity={0.7}>
              
              <Ionicons name="close" size={24} color="#000000" />
            </TouchableOpacity>
          </View>
        </View>

        <>
        {}
        <View style={styles.dbStatsContainer}>
          <TouchableOpacity
              style={styles.dbStatCard}
              onPress={() => openStatDetailSheet("employees")}
              activeOpacity={0.7}>
              
            <View style={[styles.dbStatIconBg, { backgroundColor: "#EFF6FF" }]}>
              <Ionicons name="people" size={18} color="#3B82F6" />
            </View>
            <Text style={styles.dbStatValue}>{dbEmployeesList.length}</Text>
            <Text style={styles.dbStatLabel}>{dbEmployeesList.length === 1 ? "Employee" : "Employees"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
              style={styles.dbStatCard}
              onPress={() => openStatDetailSheet("model")}
              activeOpacity={0.7}>
              
            <View style={[styles.dbStatIconBg, { backgroundColor: "#F5F3FF" }]}>
              <Ionicons name="cube" size={18} color="#8B5CF6" />
            </View>
            <Text style={styles.dbStatValue}>13.0 MB</Text>
            <Text style={styles.dbStatLabel}>Model Size</Text>
          </TouchableOpacity>

          <TouchableOpacity
              style={styles.dbStatCard}
              onPress={() => openStatDetailSheet("storage")}
              activeOpacity={0.7}>
              
            <View style={[styles.dbStatIconBg, { backgroundColor: "#ECFDF5" }]}>
              <Ionicons name="server" size={18} color="#10B981" />
            </View>
            <Text style={styles.dbStatValue}>{dbEmployeesList.length > 0 ? `${(dbEmployeesList.length * 1.2).toFixed(1)} KB` : "0.0 KB"}</Text>
            <Text style={styles.dbStatLabel}>Storage</Text>
          </TouchableOpacity>
        </View>

        {}
        <View style={styles.searchBarContainer}>
          <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
          <TextInput
              style={styles.searchInput}
              placeholder="Search employee or ID..."
              placeholderTextColor="#94A3B8"
              value={dbSearchQuery}
              onChangeText={setDbSearchQuery}
              autoCapitalize="none"
              autoCorrect={false} />
            
          {dbSearchQuery ?
            <TouchableOpacity
              style={styles.searchClearBtn}
              onPress={() => setDbSearchQuery("")}
              activeOpacity={0.7}>
              
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity> :
            null}
        </View>

        <ScrollView
            style={[styles.dbScroll, { marginBottom: insets.bottom > 0 ? insets.bottom : 48 }]}
            contentContainerStyle={{
              paddingBottom: 24,
              paddingHorizontal: 20
            }}
            showsVerticalScrollIndicator={false}>
            
          {filteredEmployees.length > 0 ?
            filteredEmployees.map((emp, idx) => {
              const initials = getInitials(emp.name);
              return (
                <TouchableOpacity
                  key={emp.employeeId || idx}
                  style={styles.employeeCard}
                  onPress={() => openDetailSheet(emp)}
                  activeOpacity={0.7}>
                  
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                  <View style={styles.employeeInfo}>
                    <Text style={styles.employeeName} numberOfLines={1}>
                      {emp.name || "Unknown"}
                    </Text>
                    <Text style={styles.employeeSubId}>
                      ID: {emp.employeeId || "—"}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {emp.department ?
                    <View style={styles.deptBadge}>
                        <Text style={styles.deptBadgeText} numberOfLines={1}>
                          {emp.department}
                        </Text>
                      </View> :
                    null}
                    <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                  </View>
                </TouchableOpacity>);

            }) : (


            <View style={styles.dbEmptyContainer}>
              <View style={styles.dbEmptyIconBg}>
                <Ionicons name="search-outline" size={44} color="#64748B" />
              </View>
              <Text style={styles.dbEmptyText}>No Results Found</Text>
              <Text style={styles.dbEmptySubtext}>
                No profiles match your search criteria. Try a different name or employee ID.
              </Text>
            </View>)
            }
        </ScrollView>
        </>
      </Animated.View>

      {}
      <Animated.View
        style={[
        styles.detailBackdrop,
        { opacity: detailBackdropOpacity }]
        }
        pointerEvents={isDetailSheetOpen ? "auto" : "none"}>
        
        <TouchableWithoutFeedback onPress={closeDetailSheet}>
          <View style={styles.pickerBackdropTap} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {}
      <Animated.View
        collapsable={false}
        style={[
        styles.detailSheet,
        {
          transform: [{ translateY: detailSheetTranslateY }],
          paddingBottom: Math.max(insets.bottom, 16) + 12
        }]
        }
        pointerEvents={isDetailSheetOpen ? "auto" : "none"}>
        
        <View style={styles.sheetHandle} />

        {}
        {!detailSheetReady &&
        <Animated.View
          style={[styles.skeletonOverlay, { opacity: skeletonOpacity }]}
          pointerEvents="none">
          
            {}
            <View style={[styles.skeletonBar, { width: "55%", height: 18, alignSelf: "center", marginBottom: 18 }]} />
            {}
            <View style={styles.skeletonCard}>
              {["88%", "60%", "72%", "50%", "80%", "65%", "75%", "55%"].map((w, i) =>
            <View key={i} style={styles.skeletonRow}>
                  <View style={[styles.skeletonBar, { width: "35%", height: 11 }]} />
                  <View style={[styles.skeletonBar, { width: w, height: 13 }]} />
                </View>
            )}
            </View>
            {}
            <View style={[styles.skeletonBar, { width: "100%", height: 48, borderRadius: 24, marginTop: 16 }]} />
          </Animated.View>
        }

        <Text style={styles.detailHeader}>
          {selectedStatType === "model" && "AI Model Details"}
          {selectedStatType === "storage" && "Local Storage Details"}
          {selectedStatType === "employees" && "Employee Database Summary"}
          {selectedDbEmployee && "Employee Profile Details"}
        </Text>

        <ScrollView
          style={styles.detailScroll}
          showsVerticalScrollIndicator={false}>
          
          {selectedDbEmployee &&
          <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Full Name</Text>
                <Text style={styles.detailValue}>{selectedDbEmployee.name || "—"}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Employee ID</Text>
                <Text style={styles.detailValue}>{selectedDbEmployee.employeeId || "—"}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Department</Text>
                <Text style={styles.detailValue}>{selectedDbEmployee.department || "—"}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Designation</Text>
                <Text style={styles.detailValue}>{selectedDbEmployee.designation || "—"}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Company</Text>
                <Text style={styles.detailValue}>{selectedDbEmployee.companyName || "—"}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Registered At</Text>
                <Text style={styles.detailValue}>
                  {selectedDbEmployee.registeredAt ?
                new Date(selectedDbEmployee.registeredAt).toLocaleString() :
                "—"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Biometrics Enrolled</Text>
                <Text style={styles.detailValue}>
                  {selectedDbEmployee.faceTemplateRegisteredAt ?
                new Date(selectedDbEmployee.faceTemplateRegisteredAt).toLocaleString() :
                "—"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Last Verified</Text>
                <Text style={styles.detailValue}>
                  {selectedDbEmployee.faceVerifiedAt ?
                new Date(selectedDbEmployee.faceVerifiedAt).toLocaleString() :
                "—"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Engine Provider</Text>
                <Text style={[styles.detailValue, { color: "#34D399", fontWeight: "600" }]}>
                  {selectedDbEmployee.embeddingProvider || "—"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Model Engine</Text>
                <Text style={[styles.detailValue, { color: "#A78BFA", fontWeight: "600" }]}>
                  {selectedDbEmployee.embeddingModel || "—"}
                </Text>
              </View>
            </View>
          }

          {selectedStatType === "model" &&
          <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Model Name</Text>
                <Text style={styles.detailValue}>{FACE_ENGINE.modelFile}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>File Size</Text>
                <Text style={styles.detailValue}>13.0 MB ({FACE_ENGINE.modelSizeBytes.toLocaleString()} bytes)</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Algorithm</Text>
                <Text style={styles.detailValue}>ArcFace MobileFaceNet</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Format Type</Text>
                <Text style={styles.detailValue}>ONNX Runtime Mobile</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Quantization</Text>
                <Text style={styles.detailValue}>FP32 Mobile Backbone</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Input Size</Text>
                <Text style={styles.detailValue}>112 x 112 px (RGB)</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Vector Dims</Text>
                <Text style={styles.detailValue}>512 Float Dimensions</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Liveness Check</Text>
                <Text style={[styles.detailValue, { color: "#34D399", fontWeight: "600" }]}>Blink & Smile Detection</Text>
              </View>
            </View>
          }

          {selectedStatType === "storage" &&
          <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Database Name</Text>
                <Text style={styles.detailValue}>SweFace Local Secure DB</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Storage Type</Text>
                <Text style={styles.detailValue}>Company Folder SecureStore</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Profiles Enrolled</Text>
                <Text style={styles.detailValue}>{dbEmployeesList.length}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Avg Record Size</Text>
                <Text style={styles.detailValue}>1.2 KB</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Total Size Used</Text>
                <Text style={styles.detailValue}>{dbEmployeesList.length > 0 ? `${(dbEmployeesList.length * 1.2).toFixed(1)} KB` : "0.0 KB"}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Encryption</Text>
                <Text style={[styles.detailValue, { color: "#34D399", fontWeight: "600" }]}>Expo SecureStore AES-256</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Save Location</Text>
                <Text style={styles.detailValue}>{companyDisplayName || "Company"} / employees</Text>
              </View>
            </View>
          }

          {selectedStatType === "employees" &&
          <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Active Employees</Text>
                <Text style={styles.detailValue}>{dbEmployeesList.length}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Registered Depts</Text>
                <Text style={styles.detailValue}>
                  {new Set(dbEmployeesList.map((e) => e.department).filter(Boolean)).size}
                </Text>
              </View>

              {dbEmployee &&
            <>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Active Dept</Text>
                    <Text style={styles.detailValue}>{dbEmployee.department || "—"}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Active Designation</Text>
                    <Text style={styles.detailValue}>{dbEmployee.designation || "—"}</Text>
                  </View>
                </>
            }

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Liveness Enrolled</Text>
                <Text style={[styles.detailValue, { color: "#34D399", fontWeight: "600" }]}>{dbEmployeesList.length > 0 ? "Yes (Enrolled)" : "No Profiles"}</Text>
              </View>
            </View>
          }
        </ScrollView>

        <TouchableOpacity
          style={styles.detailCloseBtn}
          onPress={closeDetailSheet}
          activeOpacity={0.85}>
          
          <Text style={styles.detailCloseBtnText}>Close</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>);

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAGE_BG
  },
  contentContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 4,
    marginBottom: SCREEN_HEIGHT * 0.01
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  storageButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3
  },
  storageIcon: {
    width: 24,
    height: 24
  },
  headerLogo: {
    width: 34,
    height: 34
  },
  headerName: {
    width: 96,
    height: 40
  },
  imageContainer: {
    flex: 1.1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center"
  },
  image: {
    width: "80%",
    height: "100%",
    maxHeight: SCREEN_HEIGHT * 0.32,
    aspectRatio: 1
  },
  textPanel: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingVertical: SCREEN_HEIGHT * 0.022,
    paddingHorizontal: 18,
    marginVertical: SCREEN_HEIGHT * 0.012,
    alignItems: "center",
    shadowColor: "#1A4D0A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8
  },
  textContainer: {
    width: "100%",
    alignItems: "center",
    gap: SCREEN_HEIGHT * 0.012
  },
  titleImage: {
    width: "88%",
    maxWidth: 320,
    height: undefined,
    aspectRatio: 1080 / 272
  },
  subtitle: {
    fontSize: SCREEN_HEIGHT > 700 ? 15 : 13,
    lineHeight: SCREEN_HEIGHT > 700 ? 23 : 20,
    color: "#18232F",
    textAlign: "center",
    paddingHorizontal: 4
  },
  bottomPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 24,
    zIndex: 10
  },
  buttonsContainer: {
    position: "absolute",
    top: 24,
    left: 24,
    right: 24,
    zIndex: 1,
    elevation: 1
  },
  formContainer: {
    position: "absolute",
    top: 24,
    left: 24,
    right: 24,
    bottom: 0,
    zIndex: 4,
    elevation: 4
  },
  keyboardFrame: {
    width: "100%",
    height: "100%"
  },
  selectorField: {
    height: 48,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC"
  },
  selectorValue: {
    fontSize: 15,
    color: "#18232F",
    fontWeight: "600"
  },
  selectorPlaceholder: {
    color: "#A0AEC0",
    fontWeight: "500"
  },
  selectorArrow: {
    fontSize: 14,
    color: "#718096"
  },
  pickerBackdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    zIndex: 100
  },
  pickerBackdropTap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0
  },
  pickerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 24,
    zIndex: 100
  },
  pickerHeader: {
    fontSize: 18,
    fontWeight: "800",
    color: "#18232F",
    marginBottom: 16,
    textAlign: "center"
  },
  pickerOptionsList: {
    gap: 8,
    marginBottom: 20
  },
  pickerOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#F1F5F9"
  },
  pickerOptionSelected: {
    backgroundColor: "#F0F4FF",
    borderColor: "#BFDBFE"
  },
  pickerOptionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4A5568"
  },
  pickerOptionSelectedText: {
    color: "#2F69FF"
  },
  selectedIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#2F69FF",
    alignItems: "center",
    justifyContent: "center"
  },
  selectedIndicatorInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2F69FF"
  },
  pickerCloseButton: {
    backgroundColor: "#2F69FF",
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center"
  },
  pickerCloseButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700"
  },
  captchaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  captchaBox: {
    backgroundColor: "#EDF2F7",
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CBD5E0",
    borderStyle: "dashed"
  },
  captchaText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2D3748",
    letterSpacing: 4,
    fontStyle: "italic",
    textDecorationLine: "line-through"
  },
  captchaRefreshButton: {
    backgroundColor: "#F7FAFC",
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  captchaInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 0,
    fontSize: 15,
    color: "#18232F",
    backgroundColor: "#F8FAFC",
    fontWeight: "600",
    textAlign: "center"
  },
  buttonContainer: {
    width: "100%",
    gap: 12
  },
  primaryButton: {
    backgroundColor: "#2F69FF",
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700"
  },
  secondaryButton: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  secondaryButtonDisabled: {
    opacity: 0.86
  },
  secondaryButtonLoader: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryButtonIcon: {
    width: 18,
    height: 18,
    resizeMode: "contain"
  },
  secondaryButtonLogo: {
    width: 78,
    height: 34,
    resizeMode: "contain",
    transform: [{ translateX: -7 }, { translateY: -1 }]
  },
  secondaryButtonText: {
    color: "#18232F",
    fontSize: 15,
    fontWeight: "700"
  },
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.54)",
    zIndex: 5,
    elevation: 5
  },
  sheetHeader: {
    alignItems: "center",
    marginBottom: 20
  },
  companySheetHeaderCompact: {
    marginBottom: 10
  },
  sheetHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    marginBottom: 12,
    alignSelf: "center"
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#18232F",
    textAlign: "center"
  },
  sheetSubtitle: {
    fontSize: 13,
    color: "#718096",
    marginTop: 4,
    textAlign: "center"
  },
  formScroll: {
    paddingBottom: 24,
    gap: 22
  },
  registrationCompanyPanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#000000",
    borderStyle: "dashed",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12
  },
  registrationCompanyPanelReady: {
    backgroundColor: "#F0FDF4",
    borderColor: "#000000"
  },
  registrationCompanyPanelWarning: {
    backgroundColor: "#F0FDF4",
    borderColor: "#000000"
  },
  registrationCompanyIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  registrationCompanyIconReady: {
    backgroundColor: "#DCFCE7"
  },
  registrationCompanyIconWarning: {
    backgroundColor: "#DCFCE7"
  },
  registrationCompanyCopy: {
    flex: 1,
    minWidth: 0
  },
  registrationCompanyEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 3
  },
  registrationCompanyEyebrowReady: {
    color: "#166534"
  },
  registrationCompanyEyebrowWarning: {
    color: "#166534"
  },
  registrationCompanyTitle: {
    color: "#16A34A",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900"
  },
  registrationCompanyText: {
    color: "#000000",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    marginTop: 3
  },
  companySessionScroll: {
    gap: 16
  },
  inputGroup: {
    gap: 8
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: "900",
    color: "#0F172A",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  textInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
    fontWeight: "600"
  },
  hintText: {
    fontSize: 11,
    lineHeight: 16,
    color: "#475569",
    fontStyle: "normal",
    marginTop: 4,
    paddingHorizontal: 2
  },
  hintTextProduction: {
    color: "#16A34A"
  },
  fieldRuleText: {
    fontSize: 11,
    lineHeight: 15,
    color: "#64748B",
    marginTop: 3,
    paddingHorizontal: 2,
    fontWeight: "600"
  },
  companyLoginNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  companyLoginNoticeSuccess: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0"
  },
  companyLoginNoticeIcon: {
    marginRight: 8,
    marginTop: 1
  },
  companyLoginNoticeText: {
    flex: 1,
    color: "#991B1B",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700"
  },
  companyLoginNoticeTextSuccess: {
    color: "#166534"
  },
  companySessionPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE7F3",
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 10
  },
  companySessionStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  companySessionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center"
  },
  companySessionCopy: {
    flex: 1,
    minWidth: 0
  },
  companySessionEyebrow: {
    color: "#2563EB",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 3
  },
  companySessionTitle: {
    color: "#18232F",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  companySessionText: {
    color: "#52657A",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600"
  },
  companySessionActions: {
    marginTop: 2,
    gap: 8
  },
  companySessionPrimaryButton: {
    height: 48,
    borderRadius: 24
  },
  companyLogoutButton: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#FEB2B2",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },
  companyLogoutButtonText: {
    color: "#DC2626",
    fontSize: 15,
    fontWeight: "800"
  },
  companyCancelButton: {
    height: 30,
    alignItems: "center",
    justifyContent: "center"
  },
  companyCancelButtonText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "800"
  },
  formActions: {
    marginTop: 4,
    gap: 7
  },
  sheetPrimaryButton: {
    backgroundColor: "#2F69FF",
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10
  },
  sheetPrimaryButtonDisabled: {
    opacity: 0.82
  },
  sheetPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700"
  },
  sheetSecondaryButton: {
    height: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  sheetSecondaryButtonText: {
    color: "#E53E3E",
    fontSize: 15,
    fontWeight: "700"
  },
  dbBackdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    zIndex: 190
  },
  dbDrawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 24,
    zIndex: 200
  },
  dbHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0"
  },
  dbTitleRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  dbTitleImage: {
    width: 105,
    height: 24,
    marginLeft: -4
  },
  dbTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#18232F"
  },
  dbSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2
  },
  dbHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  dbRefreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center"
  },
  dbCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center"
  },
  dbScroll: {
    flex: 1,
    paddingTop: 20
  },
  dbEmptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: SCREEN_HEIGHT * 0.16,
    paddingHorizontal: 20
  },
  dbEmptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16
  },
  dbEmptyText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#18232F",
    marginBottom: 8
  },
  dbEmptySubtext: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20
  },
  profileCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 20
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16
  },
  profileCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2F69FF",
    letterSpacing: 0.3
  },
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0"
  },
  profileLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    width: "40%"
  },
  profileValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#18232F",
    width: "60%",
    textAlign: "right"
  },
  vectorTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#18232F",
    marginBottom: 4,
    paddingHorizontal: 2
  },
  vectorSubtitle: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 2
  },
  embeddingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 6
  },
  embeddingChip: {
    width: "31%",
    backgroundColor: "#F8FAFC",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  embeddingIndex: {
    fontSize: 9,
    fontWeight: "700",
    color: "#718096",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    marginBottom: 2
  },
  embeddingValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2F69FF",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace"
  },
  embeddingPendingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FCD34D",
    marginTop: 8
  },
  embeddingPendingText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#B45309",
    fontWeight: "600"
  },
  dbStatsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 8
  },
  dbStatCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "#F1F5F9"
  },
  dbStatIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  dbStatValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginTop: 4
  },
  dbStatLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
    marginTop: 2
  },
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    color: "#18232F",
    fontSize: 14,
    fontWeight: "500",
    paddingVertical: 0
  },
  searchClearBtn: {
    padding: 4
  },
  employeeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: "#DBEAFE"
  },
  avatarText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "700"
  },
  employeeInfo: {
    flex: 1,
    justifyContent: "center",
    marginRight: 8
  },
  employeeName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 2
  },
  employeeSubId: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500"
  },
  deptBadge: {
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#DCFCE7",
    maxWidth: 100
  },
  deptBadgeText: {
    color: "#166534",
    fontSize: 10,
    fontWeight: "700"
  },
  detailBackdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    zIndex: 210
  },
  detailSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 24,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 24,
    zIndex: 220,
    maxHeight: SCREEN_HEIGHT * 0.75
  },
  detailHeader: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginTop: 2,
    marginBottom: 10
  },
  detailScroll: {
    marginBottom: 16
  },
  detailCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0"
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    width: "40%"
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
    width: "60%",
    textAlign: "right"
  },
  detailDeleteBtn: {
    backgroundColor: "#EF4444",
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 8
  },
  detailDeleteBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700"
  },
  detailCloseBtn: {
    backgroundColor: "#2F69FF",
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 8
  },
  detailCloseBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700"
  },


  skeletonOverlay: {
    position: "absolute",
    top: 12,
    left: 24,
    right: 24,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    zIndex: 5
  },
  skeletonCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 0
  },
  skeletonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9"
  },
  skeletonBar: {
    backgroundColor: "#EEF2F7",
    borderRadius: 6
  }
});
