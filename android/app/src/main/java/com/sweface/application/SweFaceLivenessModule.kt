package com.sweface.application

import android.graphics.BitmapFactory
import android.graphics.PointF
import android.net.Uri
import com.facebook.react.bridge.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import java.io.File

class SweFaceLivenessModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SweFaceLiveness"

    private val detectorOptions = FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
        .setMinFaceSize(0.15f)
        .build()

    private val detector = FaceDetection.getClient(detectorOptions)

    @ReactMethod
    fun detectFace(uriString: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            val uri = Uri.parse(uriString)
            val inputStream = when (uri.scheme) {
                "content" -> context.contentResolver.openInputStream(uri)
                "file" -> File(uri.path!!).inputStream()
                else -> File(uriString).inputStream()
            } ?: run {
                promise.reject("ERR_FILE", "Cannot open image file.")
                return
            }

            val bitmap = BitmapFactory.decodeStream(inputStream)
            inputStream.close()

            if (bitmap == null) {
                promise.reject("ERR_DECODE", "Cannot decode image.")
                return
            }

            val image = InputImage.fromBitmap(bitmap, 0)
            val imageWidth = bitmap.width
            val imageHeight = bitmap.height

            detector.process(image)
                .addOnSuccessListener { faces ->
                    val result = Arguments.createMap()
                    val faceCount = faces.size
                    result.putInt("faceCount", faceCount)
                    result.putBoolean("faceDetected", faceCount > 0)
                    result.putInt("imageWidth", imageWidth)
                    result.putInt("imageHeight", imageHeight)

                    if (faceCount > 0) {
                        val face = faces[0]

                        result.putDouble(
                            "smilingProbability",
                            (face.smilingProbability ?: 0f).toDouble()
                        )
                        result.putDouble(
                            "leftEyeOpenProbability",
                            (face.leftEyeOpenProbability ?: 1f).toDouble()
                        )
                        result.putDouble(
                            "rightEyeOpenProbability",
                            (face.rightEyeOpenProbability ?: 1f).toDouble()
                        )
                        result.putDouble(
                            "headEulerAngleZ",
                            face.headEulerAngleZ.toDouble()
                        )

                        val frame = Arguments.createMap()
                        val bounds = face.boundingBox
                        frame.putDouble("x", bounds.left.toDouble())
                        frame.putDouble("y", bounds.top.toDouble())
                        frame.putDouble("width", bounds.width().toDouble())
                        frame.putDouble("height", bounds.height().toDouble())
                        result.putMap("frame", frame)

                        val landmarks = Arguments.createMap()
                        putLandmark(landmarks, "leftEye", face, FaceLandmark.LEFT_EYE)
                        putLandmark(landmarks, "rightEye", face, FaceLandmark.RIGHT_EYE)
                        putLandmark(landmarks, "noseBase", face, FaceLandmark.NOSE_BASE)
                        putLandmark(landmarks, "mouthLeft", face, FaceLandmark.MOUTH_LEFT)
                        putLandmark(landmarks, "mouthRight", face, FaceLandmark.MOUTH_RIGHT)
                        putLandmark(landmarks, "mouthBottom", face, FaceLandmark.MOUTH_BOTTOM)
                        result.putMap("landmarks", landmarks)
                    } else {
                        result.putDouble("smilingProbability", 0.0)
                        result.putDouble("leftEyeOpenProbability", 1.0)
                        result.putDouble("rightEyeOpenProbability", 1.0)
                        result.putDouble("headEulerAngleZ", 0.0)
                        result.putNull("frame")
                        result.putNull("landmarks")
                    }

                    promise.resolve(result)
                }
                .addOnFailureListener { e ->
                    promise.reject("ERR_DETECTION", "Face detection failed: ${e.message}", e)
                }
        } catch (e: Exception) {
            promise.reject("ERR_DETECTION", "Face detection error: ${e.message}", e)
        }
    }

    private fun putLandmark(map: WritableMap, key: String, face: Face, landmarkType: Int) {
        val landmark = face.getLandmark(landmarkType)
        if (landmark != null) {
            val point = Arguments.createMap()
            point.putDouble("x", landmark.position.x.toDouble())
            point.putDouble("y", landmark.position.y.toDouble())
            map.putMap(key, point)
        }
    }
}
