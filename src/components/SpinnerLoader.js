import React, { useEffect, useRef } from "react";
import { View, Animated } from "react-native";

const NUM_BARS = 12;

export default function SpinnerLoader({ size = 28, color = "#8E8E93" }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
        easing: (t) => Math.floor(t * NUM_BARS) / NUM_BARS
      })
    );
    animation.start();
    return () => animation.stop();
  }, [rotation]);

  const barWidth = Math.max(2, size * 0.09);
  const barHeight = Math.max(5, size * 0.24);
  const barRadius = barWidth / 2;
  const translateY = -(size * 0.34);

  const bars = [];
  for (let i = 0; i < NUM_BARS; i++) {
    const angle = i * 30;
    const opacity = 1 - (i * 0.75 / 11);
    bars.push(
      <View
        key={i}
        style={{
          position: "absolute",
          width: barWidth,
          height: barHeight,
          backgroundColor: color,
          borderRadius: barRadius,
          opacity,
          left: size / 2 - barWidth / 2,
          top: size / 2 - barHeight / 2,
          transform: [
            { rotate: `${angle}deg` },
            { translateY }
          ]
        }}
      />
    );
  }

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        transform: [
          {
            rotate: rotation.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", "360deg"]
            })
          }
        ]
      }}
    >
      {bars}
    </Animated.View>
  );
}
