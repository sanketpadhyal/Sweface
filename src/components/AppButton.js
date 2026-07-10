import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export default function AppButton({
  label,
  icon,
  onPress,
  variant = "primary",
  disabled = false
}) {
  const textStyle = styles[`${variant}Text`];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      {icon ? <Text style={[styles.icon, textStyle]}>{icon}</Text> : null}
      <Text style={[styles.label, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18
  },
  primary: {
    backgroundColor: colors.primary
  },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border
  },
  danger: {
    backgroundColor: colors.danger
  },
  ghost: {
    backgroundColor: "transparent"
  },
  primaryText: {
    color: "#FFFFFF"
  },
  secondaryText: {
    color: colors.text
  },
  dangerText: {
    color: "#FFFFFF"
  },
  ghostText: {
    color: colors.primaryDark
  },
  label: {
    fontSize: 16,
    fontWeight: "700"
  },
  icon: {
    fontSize: 18,
    fontWeight: "700"
  },
  disabled: {
    opacity: 0.48
  },
  pressed: {
    transform: [{ scale: 0.98 }]
  }
});
