import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors } from "../theme";

export default function CameraPanel({ modeLabel }) {
  const [permission, requestPermission] = useCameraPermissions();
  const canUseCamera = permission?.granted;

  React.useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  return (
    <View style={styles.frame}>
      {canUseCamera ? (
        <CameraView facing="front" style={styles.camera} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Camera preview</Text>
          <Text style={styles.placeholderText}>Permission pending. Demo actions still work.</Text>
        </View>
      )}
      <View style={styles.scanBox} />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{modeLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 330,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.ink,
    position: "relative",
    borderWidth: 1,
    borderColor: colors.border
  },
  camera: {
    flex: 1
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  placeholderTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800"
  },
  placeholderText: {
    color: "#D7E3EA",
    marginTop: 8,
    textAlign: "center"
  },
  scanBox: {
    position: "absolute",
    top: 70,
    left: "18%",
    right: "18%",
    bottom: 70,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 8
  },
  badge: {
    position: "absolute",
    left: 14,
    bottom: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  badgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0
  }
});
