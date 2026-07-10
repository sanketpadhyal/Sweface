# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# ONNX Runtime — JNI bridge must not be stripped
-keep class ai.onnxruntime.** { *; }
-dontwarn ai.onnxruntime.**

# Expo modules
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# React Native core
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.**

# AsyncStorage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# Keep native module registrations
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }

# Google ML Kit
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

# SweFaceLiveness native module
-keep class com.sweface.application.SweFaceLivenessModule { *; }
-keep class com.sweface.application.SweFaceLivenessPackage { *; }
