import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  Dimensions,
  Pressable,
  Image } from
"react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const PAGE_BG = "#7ED321";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");


function Particle({ delay, startX, size, color }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 2200 + Math.random() * 1200,
        delay,
        easing: Easing.linear,
        useNativeDriver: true
      })
    ).start();
  }, [anim, delay]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, SCREEN_HEIGHT + 20]
  });
  const opacity = anim.interpolate({
    inputRange: [0, 0.1, 0.9, 1],
    outputRange: [0, 1, 1, 0]
  });
  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "720deg"]
  });

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: startX,
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }, { rotate }]
      }} />);


}

const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  delay: i * 220,
  startX: Math.random() * SCREEN_WIDTH,
  size: 6 + Math.random() * 8,
  color: [
  "#FFFFFF",
  "#FFE066",
  "#A7F3D0",
  "#BFDBFE",
  "#FCA5A5",
  "#D9F99D",
  "#FDE68A"][
  Math.floor(Math.random() * 7)]
}));

export default function RegisterSuccess({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { employee, isVerification = false, confidence } = route?.params || {};

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;
  const tickScaleAnim = useRef(new Animated.Value(0)).current;
  const tickOpacityAnim = useRef(new Animated.Value(0)).current;
  const ringScaleAnim = useRef(new Animated.Value(0.4)).current;
  const ringOpacityAnim = useRef(new Animated.Value(0)).current;
  const cardSlideAnim = useRef(new Animated.Value(40)).current;
  const cardOpacityAnim = useRef(new Animated.Value(0)).current;
  const buttonSlideAnim = useRef(new Animated.Value(30)).current;
  const buttonOpacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {

    Animated.sequence([

    Animated.parallel([
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }),
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    })]
    ),

    Animated.parallel([
    Animated.spring(ringScaleAnim, {
      toValue: 1,
      tension: 60,
      friction: 6,
      useNativeDriver: true
    }),
    Animated.timing(ringOpacityAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true
    })]
    ),

    Animated.spring(tickScaleAnim, {
      toValue: 1,
      tension: 80,
      friction: 5,
      useNativeDriver: true
    }),
    Animated.timing(tickOpacityAnim, {
      toValue: 1,
      duration: 1,
      useNativeDriver: true
    }),

    Animated.parallel([
    Animated.timing(cardSlideAnim, {
      toValue: 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }),
    Animated.timing(cardOpacityAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true
    })]
    ),

    Animated.parallel([
    Animated.timing(buttonSlideAnim, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }),
    Animated.timing(buttonOpacityAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true
    })]
    )]
    ).start();


    tickOpacityAnim.setValue(1);


    Animated.loop(
      Animated.sequence([
      Animated.timing(glowAnim, {
        toValue: 1.08,
        duration: 1200,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true
      }),
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true
      })]
      )
    ).start();
  }, []);

  const handleContinue = () => {
    if (route?.params?.isCompanyLogin) {
      navigation.replace("FaceVerification", {
        isCompanyLogin: true,
        selectedScanMode: route.params.selectedScanMode || "real",
        resumeScanner: true
      });
    } else {
      navigation.replace("Onboarding");
    }
  };



  const matchPercent =
  confidence != null ? Math.round(confidence) : null;

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 20) }]}>
      <StatusBar style="dark" backgroundColor={PAGE_BG} />

      {}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {PARTICLES.map((p) =>
        <Particle key={p.id} {...p} />
        )}
      </View>

      <Image
        source={require("../assets/splash.png")}
        style={[styles.topLeftLogo, { top: Math.max(insets.top, 12) }]} />
      

      <Animated.View
        style={[
        styles.inner,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          paddingBottom: Math.max(insets.bottom, 28) + 8
        }]
        }>
        


        {}
        <View style={styles.tickSection}>
          {}
          <Animated.View
            style={[
            styles.glowRing,
            {
              opacity: ringOpacityAnim,
              transform: [{ scale: Animated.multiply(ringScaleAnim, glowAnim) }]
            }]
            } />
          
          {}
          <Animated.View
            style={[
            styles.successRing,
            {
              opacity: ringOpacityAnim,
              transform: [{ scale: ringScaleAnim }]
            }]
            } />
          
          {}
          <Animated.View
            style={[
            styles.tickCircle,
            {
              opacity: tickOpacityAnim,
              transform: [{ scale: tickScaleAnim }]
            }]
            }>
            
            <Ionicons name="checkmark" size={58} color="#FFFFFF" />
          </Animated.View>
        </View>

        {}
        <View style={styles.headlineBlock}>
          <Text style={styles.headline}>
            {isVerification ? "Attendance Marked!" : "Face Registered!"}
          </Text>
          <Text style={styles.subheadline}>
            {isVerification ?
            "Your identity was verified and attendance was recorded" :
            "Your name and face biometric have been securely saved"}
          </Text>
        </View>

        {}
        <Animated.View
          style={[
          styles.identityCard,
          {
            opacity: cardOpacityAnim,
            transform: [{ translateY: cardSlideAnim }]
          }]
          }>
          
          <View style={styles.identityCardHeader}>
            <Ionicons name="shield-checkmark" size={18} color="#22C55E" />
            <Text style={styles.identityCardTitle}>Identity Confirmed</Text>
          </View>

          <View style={styles.identityDivider} />

          <View style={styles.identityRow}>
            <Text style={styles.identityLabel}>Full Name</Text>
            <Text style={styles.identityValue}>{employee?.name || "—"}</Text>
          </View>
          <View style={styles.identityRow}>
            <Text style={styles.identityLabel}>Employee ID</Text>
            <Text style={styles.identityValue}>{employee?.employeeId || "—"}</Text>
          </View>
          {employee?.department ?
          <View style={styles.identityRow}>
              <Text style={styles.identityLabel}>Department</Text>
              <Text style={styles.identityValue}>{employee.department}</Text>
            </View> :
          null}
          {employee?.designation ?
          <View style={styles.identityRow}>
              <Text style={styles.identityLabel}>Designation</Text>
              <Text style={styles.identityValue}>{employee.designation}</Text>
            </View> :
          null}

          {isVerification &&
          <View style={styles.identityRow}>
              <Text style={styles.identityLabel}>Verified At</Text>
              <Text style={styles.identityValue}>
                {route?.params?.timestamp ?
              new Date(route.params.timestamp).toLocaleDateString() + " " + new Date(route.params.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
              new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          }

          {matchPercent != null &&
          <View style={styles.identityRow}>
              <Text style={styles.identityLabel}>Match Score</Text>
              <View style={styles.matchBadge}>
                <Text style={styles.matchBadgeText}>{matchPercent}%</Text>
              </View>
            </View>
          }

          <View style={styles.identityDivider} />

          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              {isVerification ?
              "Attendance recorded successfully" :
              "Registration completed."}
            </Text>
          </View>
        </Animated.View>

        {}
        <Animated.View
          style={{
            opacity: buttonOpacityAnim,
            transform: [{ translateY: buttonSlideAnim }],
            width: "100%"
          }}>
          
          <Pressable
            style={styles.ctaButton}
            onPress={handleContinue}
            android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: false }}>
            
            <Text style={styles.ctaButtonText}>Done</Text>
            <Image
              source={require("../assets/icons8-done-48.png")}
              style={styles.ctaButtonIcon} />
            
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>);

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAGE_BG
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 24
  },
  pageLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "rgba(21,34,50,0.7)",
    textTransform: "uppercase",
    letterSpacing: 1.5
  },
  tickSection: {
    width: 170,
    height: 170,
    alignItems: "center",
    justifyContent: "center"
  },
  glowRing: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(34,197,94,0.18)"
  },
  successRing: {
    position: "absolute",
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 5,
    borderColor: "#FFFFFF",
    backgroundColor: "transparent"
  },
  tickCircle: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    elevation: 20
  },
  headlineBlock: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8
  },
  headline: {
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.5
  },
  subheadline: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(21,34,50,0.72)",
    textAlign: "center",
    lineHeight: 22
  },
  identityCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.93)",
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 14
  },
  identityCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14
  },
  identityCardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#152232",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  identityDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 12
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5
  },
  identityLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.3
  },
  identityValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#152232",
    maxWidth: "58%",
    textAlign: "right"
  },
  matchBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#86EFAC"
  },
  matchBadgeText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#15803D"
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E"
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#15803D",
    flex: 1
  },
  ctaButton: {
    backgroundColor: "#2F69FF",
    height: 56,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  ctaButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900"
  },
  ctaButtonIcon: {
    width: 22,
    height: 22,
    resizeMode: "contain",
    tintColor: "#FFFFFF"
  },
  topLeftLogo: {
    position: "absolute",
    left: 18,
    width: 44,
    height: 44,
    resizeMode: "contain"
  }
});
