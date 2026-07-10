import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

function getPingTone(latencyMs) {
  if (latencyMs === null || latencyMs === undefined) return "checking";
  if (latencyMs < 120) return "good";
  if (latencyMs < 300) return "fair";
  return "slow";
}

function NetworkStatusPill({ isOnline, isChecking = false, pingMs = null, statusCode = null }) {
  const checking = isChecking || isOnline === null;
  const online = isOnline === true && !checking;
  const label = checking ? "Checking" : online ? "Online" : "Offline";
  const pingTone = getPingTone(pingMs);
  const statusText = statusCode !== null ? String(statusCode) : null;
  const accessibilityParts = [`Network status: ${label}`];
  const pillStyle = checking ? styles.pillChecking : online ? styles.pillOnline : styles.pillOffline;
  const dotStyle = checking ? styles.dotChecking : online ? styles.dotOnline : styles.dotOffline;
  const labelStyle = checking ? styles.labelChecking : online ? styles.labelOnline : styles.labelOffline;

  if (statusText) accessibilityParts.push(`status code ${statusText}`);
  if (online && pingMs !== null) accessibilityParts.push(`${pingMs} milliseconds`);

  return (
    <View
      style={[styles.pill, pillStyle]}
      accessibilityRole="text"
      accessibilityLabel={accessibilityParts.join(", ")}
    >
      <View style={[styles.dot, dotStyle]} />
      <Text style={[styles.label, labelStyle]} numberOfLines={1}>
        {label}
        {statusText ? (
          <Text style={styles.statusCode}>
            {" · "}
            {statusText}
          </Text>
        ) : null}
        {online && pingMs !== null ? (
          <Text
            style={[
              styles.ping,
              pingTone === "good" && styles.pingGood,
              pingTone === "fair" && styles.pingFair,
              pingTone === "slow" && styles.pingSlow
            ]}
          >
            {" · "}
            {pingMs}ms
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

export default memo(NetworkStatusPill);

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 16
  },
  pillOnline: {
    backgroundColor: "#ECFDF3"
  },
  pillOffline: {
    backgroundColor: "#FEF2F2"
  },
  pillChecking: {
    backgroundColor: "#F8FAFC"
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  dotOnline: {
    backgroundColor: "#16A34A"
  },
  dotOffline: {
    backgroundColor: "#DC2626"
  },
  dotChecking: {
    backgroundColor: "#94A3B8"
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.15
  },
  labelOnline: {
    color: "#15803D"
  },
  labelOffline: {
    color: "#B91C1C"
  },
  labelChecking: {
    color: "#64748B"
  },
  statusCode: {
    color: "#2563EB",
    fontSize: 10,
    fontWeight: "700"
  },
  ping: {
    fontSize: 10,
    fontWeight: "700"
  },
  pingGood: {
    color: "#16A34A"
  },
  pingFair: {
    color: "#CA8A04"
  },
  pingSlow: {
    color: "#EA580C"
  }
});
