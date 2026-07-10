import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export default function StatusPill({ label, tone = "neutral" }) {
  const textStyle = styles[`${tone}Text`];

  return (
    <View style={[styles.pill, styles[tone]]}>
      <Text style={[styles.text, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: "flex-start"
  },
  neutral: {
    backgroundColor: colors.surfaceAlt
  },
  success: {
    backgroundColor: "#DDF5EA"
  },
  danger: {
    backgroundColor: "#FCE5E3"
  },
  warning: {
    backgroundColor: "#FFF2C7"
  },
  text: {
    fontWeight: "800",
    fontSize: 12
  },
  neutralText: {
    color: colors.text
  },
  successText: {
    color: colors.success
  },
  dangerText: {
    color: colors.danger
  },
  warningText: {
    color: "#81610A"
  }
});
