import React, { useEffect, useRef } from "react";
import { BackHandler, LogBox, Platform, ToastAndroid } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

LogBox.ignoreAllLogs();

import SplashScreen from "./src/screens/SplashScreen";
import OnboardingPage from "./src/pages/onboardingpage";
import FaceVerificationPage from "./src/face verification/FaceVerificationPage";
import RegisterSuccess from "./src/face verification/registersuccess";
import { colors } from "./src/theme";

const Stack = createNativeStackNavigator();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    primary: colors.primary,
    card: colors.surface,
    text: colors.text
  }
};

export default function App() {
  const lastBackPressRef = useRef(0);

  useEffect(() => {
    const backSubscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const now = Date.now();

      if (now - lastBackPressRef.current < 1600) {
        BackHandler.exitApp();
        return true;
      }

      lastBackPressRef.current = now;
      if (Platform.OS === "android") {
        ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      }
      return true;
    });

    return () => {
      backSubscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme}>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{
            headerShown: false,
            animation: "fade",
            contentStyle: { backgroundColor: colors.background }
          }}
        >
          <Stack.Screen name="Onboarding" component={OnboardingPage} />
          <Stack.Screen name="FaceVerification" component={FaceVerificationPage} />
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="RegisterSuccess" component={RegisterSuccess} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
