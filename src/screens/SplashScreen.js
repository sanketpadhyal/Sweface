import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCompanySession, getEmployee } from "../services/storage";

const splashLogo = require("../assets/splash.png");
const appName = require("../assets/name.png");
const splashBackground = "#7ED321";

export default function SplashScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const nameTranslateY = useRef(new Animated.Value(34)).current;
  const screenScale = useRef(new Animated.Value(1)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let isMounted = true;

    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]),
      Animated.delay(120),
      Animated.parallel([
        Animated.timing(nameOpacity, {
          toValue: 1,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(nameTranslateY, {
          toValue: 0,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]),
      Animated.delay(600)
    ]).start(async ({ finished }) => {
      if (finished) {
        const [savedCompanySession, savedEmployee] = await Promise.all([
          getCompanySession(),
          getEmployee()
        ]);

        if (isMounted) {
          if (savedCompanySession?.token) {
            navigation.replace("FaceVerification", {
              isCompanyLogin: true,
              selectedScanMode: "real",
              restoredCompanySession: true
            });
            return;
          }

          const isRegistered = Boolean(
            savedEmployee &&
            savedEmployee.embedding &&
            Array.isArray(savedEmployee.embedding) &&
            savedEmployee.embedding.length >= 64
          );

          if (savedEmployee && !isRegistered) {
            navigation.replace("FaceVerification");
          } else {
            navigation.replace("Onboarding");
          }
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    logoOpacity,
    logoScale,
    nameOpacity,
    nameTranslateY,
    navigation
  ]);

  return (
    <View style={styles.container}>
      <StatusBar hidden backgroundColor={splashBackground} />
      <View style={styles.centerContent}>
        <Animated.Image
          source={splashLogo}
          resizeMode="contain"
          style={[
            styles.logo,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }]
            }
          ]}
        />
      </View>
      <Animated.Image
        source={appName}
        resizeMode="contain"
        style={[
          styles.name,
          {
            bottom: Math.max(insets.bottom + 44, 68)
          },
          {
            opacity: nameOpacity,
            transform: [{ translateY: nameTranslateY }]
          }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: splashBackground
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  logo: {
    width: 180,
    height: 180
  },
  name: {
    position: "absolute",
    width: 158,
    height: 70
  }
});
