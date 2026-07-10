import { NativeModules } from "react-native";
import { Asset } from "expo-asset";
import { decode as decodeJpeg } from "jpeg-js";
import { toByteArray } from "base64-js";

const MODEL_ASSET = require("../assets/models/w600k_mbf.onnx");
const INPUT_SIZE = 112;
const ALIGNMENT_CANVAS_SIZE = 224;
const MATCH_THRESHOLD = 0.38;
const MIN_MATCH_CONFIDENCE = 85;
const MIN_STABLE_FRAMES = 3;
const MIN_STABLE_RATIO = 0.55;
const ARCFACE_LEFT_EYE = { x: 38.2946, y: 51.6963 };
const ARCFACE_RIGHT_EYE = { x: 73.5318, y: 51.5014 };

export const FACE_ENGINE = {
  provider: "insightface-mobilefacenet-arcface-w600k-onnx",
  modelName: "InsightFace MobileFaceNet ArcFace W600K",
  modelFile: "w600k_mbf.onnx",
  modelSizeBytes: 13616099,
  inputSize: INPUT_SIZE,
  embeddingSource: "camera-capture",
  matchThreshold: MATCH_THRESHOLD,
  minMatchConfidence: MIN_MATCH_CONFIDENCE
};

let ortModule;
let ortResolved = false;
let imageManipulatorModule;
let imageManipulatorResolved = false;
let modelSessionPromise;

function getNativeModule(name) {
  return NativeModules?.[name] || global?.nativeModuleProxy?.[name] || null;
}

function getOrt() {
  if (ortResolved) {
    return ortModule;
  }

  ortResolved = true;
  if (!getNativeModule("Onnxruntime")) {
    ortModule = null;
    return ortModule;
  }

  try {
    ortModule = require("onnxruntime-react-native");
  } catch (error) {
    ortModule = null;
  }

  return ortModule;
}

function getImageManipulator() {
  if (imageManipulatorResolved) {
    return imageManipulatorModule;
  }

  imageManipulatorResolved = true;
  try {
    imageManipulatorModule = require("expo-image-manipulator");
  } catch (error) {
    imageManipulatorModule = null;
  }

  return imageManipulatorModule;
}

function getLivenessModule() {
  return getNativeModule("SweFaceLiveness");
}

export async function getFaceEngineStatus() {
  const hasOrt = Boolean(getOrt());
  const hasManipulator = Boolean(getImageManipulator());
  const hasFaceDetection = Boolean(getLivenessModule()?.detectFace);

  return {
    ready: hasOrt && hasManipulator && hasFaceDetection,
    hasOrt,
    hasManipulator,
    hasFaceDetection,
    missing: [
      !hasOrt && "ONNX Runtime",
      !hasManipulator && "Image Manipulator",
      !hasFaceDetection && "ML Kit Face Detection"
    ].filter(Boolean),
    ...FACE_ENGINE
  };
}

export async function preloadFaceEngine() {
  const ort = getOrt();
  if (!ort) {
    return false;
  }

  await getModelSession(ort);
  return true;
}

export function isRealFaceEmbedding(employee) {
  return Boolean(
    (employee?.embeddingProvider === FACE_ENGINE.provider ||
     employee?.embeddingProvider === "simulated-liveness") &&
    Array.isArray(employee?.embedding) &&
    employee.embedding.length >= 64
  );
}

export async function createFaceEmbeddingFromPhoto(photo) {
  if (!photo?.uri) {
    throw new Error("Camera photo is missing.");
  }

  const ort = getOrt();
  const manipulator = getImageManipulator();

  if (!ort || !manipulator) {
    throw new Error("Real face model runtime is not installed in this debug build. Rebuild the Android app.");
  }

  const session = await getModelSession(ort);
  const inputTensor = await createInputTensor(photo, manipulator, ort);
  const inputName = getFaceModelInputName(session.inputNames);
  const outputName = getFaceModelOutputName(session.outputNames);
  const results = await session.run({ [inputName]: inputTensor });
  const output = results[outputName] || Object.values(results)[0];

  if (!output?.data?.length) {
    throw new Error("Face model returned no embedding.");
  }

  return normalize(Array.from(output.data));
}

function getFaceModelInputName(inputNames = []) {
  if (inputNames.includes("data")) {
    return "data";
  }

  if (inputNames.includes("input")) {
    return "input";
  }

  const imageInput = inputNames.find((name) => !/(weight|bias|gamma|beta|mean|var|scale|zero|shape|conv|batchnorm|relu|fc)/i.test(name));
  return imageInput || inputNames[0] || "data";
}

function getFaceModelOutputName(outputNames = []) {
  return outputNames.includes("fc1") ? "fc1" : outputNames[0] || "fc1";
}

export async function detectFaceLivenessFromPhoto(photo) {
  if (!photo?.uri) {
    throw new Error("Camera photo is missing.");
  }

  const liveness = getLivenessModule();
  if (!liveness?.detectFace) {
    throw new Error("ML Kit face detection is not installed in this debug build. Rebuild the Android app.");
  }

  const result = await liveness.detectFace(photo.uri);
  return {
    faceCount: Number(result?.faceCount ?? 0),
    faceDetected: Boolean(result?.faceDetected),
    smilingProbability: Number(result?.smilingProbability ?? 0),
    leftEyeOpenProbability: Number(result?.leftEyeOpenProbability ?? 1),
    rightEyeOpenProbability: Number(result?.rightEyeOpenProbability ?? 1),
    frame: result?.frame || null,
    landmarks: normalizeLandmarks(result?.landmarks),
    headEulerAngleZ: Number(result?.headEulerAngleZ ?? 0),
    imageWidth: Number(result?.imageWidth ?? photo.width ?? 0),
    imageHeight: Number(result?.imageHeight ?? photo.height ?? 0)
  };
}

export function summarizeLivenessFrames(frames) {
  const validFrames = frames.filter(Boolean);
  const faceFrames = validFrames.filter((frame) => frame.faceDetected);
  const singleFaceFrames = validFrames.filter((frame) => frame.faceCount === 1 && frame.faceDetected);
  const centeredFaceFrames = validFrames.filter((frame) => isCenteredFaceFrame(frame));
  const eyeScores = validFrames.map((frame) => Math.min(
    frame.leftEyeOpenProbability,
    frame.rightEyeOpenProbability
  ));
  const smileScores = validFrames.map((frame) => frame.smilingProbability);
  const maxEyeOpen = Math.max(0, ...eyeScores);
  const minEyeOpen = Math.min(1, ...eyeScores);
  const maxSmile = Math.max(0, ...smileScores);
  const faceDetected = isStable(faceFrames.length, validFrames.length);
  const singleFaceDetected = isStable(singleFaceFrames.length, validFrames.length);
  const centeredFaceDetected = isStable(centeredFaceFrames.length, validFrames.length);
  const blinkDetected = maxEyeOpen >= 0.58 && minEyeOpen <= 0.34 && faceFrames.length >= MIN_STABLE_FRAMES;
  const smileDetected = maxSmile >= 0.62 && faceFrames.length >= MIN_STABLE_FRAMES;
  const passedActivities = [
    faceDetected,
    singleFaceDetected,
    centeredFaceDetected,
    blinkDetected,
    smileDetected
  ].filter(Boolean).length;

  return {
    faceDetected,
    singleFaceDetected,
    centeredFaceDetected,
    blinkDetected,
    smileDetected,
    maxSmile,
    minEyeOpen,
    maxEyeOpen,
    passedActivities,
    livenessPassed: faceDetected && singleFaceDetected && centeredFaceDetected && (blinkDetected || smileDetected)
  };
}

function isStable(passedCount, totalCount) {
  return passedCount >= MIN_STABLE_FRAMES && passedCount / Math.max(totalCount, 1) >= MIN_STABLE_RATIO;
}

function isCenteredFaceFrame(frame) {
  const box = frame?.frame;
  const imageWidth = frame?.imageWidth || 0;
  const imageHeight = frame?.imageHeight || 0;

  if (!frame?.faceDetected || !box || !imageWidth || !imageHeight) {
    return false;
  }

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const faceAreaRatio = (box.width * box.height) / (imageWidth * imageHeight);
  const xCentered = centerX >= imageWidth * 0.22 && centerX <= imageWidth * 0.78;
  const yCentered = centerY >= imageHeight * 0.18 && centerY <= imageHeight * 0.82;
  const usableSize = faceAreaRatio >= 0.05 && faceAreaRatio <= 0.72;

  return xCentered && yCentered && usableSize;
}

export function isUsableFaceFrame(frame) {
  return Boolean(frame?.faceDetected && frame.faceCount === 1 && isCenteredFaceFrame(frame));
}

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) {
    return 0;
  }

  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const magA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  const magB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

export function averageEmbeddings(embeddings) {
  const validEmbeddings = embeddings.filter((embedding) => Array.isArray(embedding) && embedding.length);
  const length = validEmbeddings[0]?.length || 0;

  if (!length || validEmbeddings.some((embedding) => embedding.length !== length)) {
    return null;
  }

  const averaged = Array.from({ length }, (_, index) => {
    const sum = validEmbeddings.reduce((total, embedding) => total + embedding[index], 0);
    return sum / validEmbeddings.length;
  });

  return normalize(averaged);
}

export function getBestFaceMatch(employees, liveEmbedding) {
  if (!Array.isArray(employees) || !Array.isArray(liveEmbedding)) {
    return [];
  }

  return employees
    .filter((employee) => getEmployeeEmbeddings(employee).length > 0)
    .map((employee) => {
      const similarities = getEmployeeEmbeddings(employee).map((embedding) =>
        cosineSimilarity(embedding, liveEmbedding)
      );
      const similarity = Math.max(0, ...similarities);
      return {
        employee,
        similarity,
        confidence: getMatchConfidence(similarity)
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

export function getEmployeeEmbeddings(employee) {
  const embeddings = [];

  if (Array.isArray(employee?.embedding)) {
    embeddings.push(employee.embedding);
  }

  if (Array.isArray(employee?.embeddingSamples)) {
    for (const sample of employee.embeddingSamples) {
      if (Array.isArray(sample)) {
        embeddings.push(sample);
      }
    }
  }

  return embeddings;
}

export function isMatch(similarity) {
  return similarity >= MATCH_THRESHOLD && getMatchConfidence(similarity) >= MIN_MATCH_CONFIDENCE;
}

export function getMatchThreshold() {
  return MATCH_THRESHOLD;
}

export function getMatchConfidence(similarity) {
  if (!Number.isFinite(similarity) || similarity <= 0) {
    return 0;
  }

  const confidence = 60 + (similarity / MATCH_THRESHOLD) * 25;
  return Math.max(0, Math.min(99, Math.round(confidence)));
}

async function getModelSession(ort) {
  if (!modelSessionPromise) {
    modelSessionPromise = (async () => {
      const asset = Asset.fromModule(MODEL_ASSET);
      await asset.downloadAsync();
      const modelPath = asset.localUri || asset.uri;
      return ort.InferenceSession.create(modelPath, {
        executionProviders: ["cpu"],
        graphOptimizationLevel: "all"
      });
    })();
  }

  return modelSessionPromise;
}

async function createInputTensor(photo, manipulator, ort) {
  const width = photo.width || INPUT_SIZE;
  const height = photo.height || INPUT_SIZE;
  const cropPlan = getFaceCropPlan(photo, width, height);
  const outputSize = cropPlan.canAlign ? ALIGNMENT_CANVAS_SIZE : INPUT_SIZE;

  const processed = await manipulator.manipulateAsync(
    photo.uri,
    [
      {
        crop: cropPlan.crop
      },
      {
        resize: {
          width: outputSize,
          height: outputSize
        }
      }
    ],
    {
      base64: true,
      compress: 1,
      format: manipulator.SaveFormat.JPEG
    }
  );

  if (!processed.base64) {
    throw new Error("Unable to decode camera frame for face model.");
  }

  const jpegBytes = toByteArray(processed.base64);
  const decoded = decodeJpeg(jpegBytes, { useTArray: true });

  if (decoded.width !== outputSize || decoded.height !== outputSize) {
    throw new Error("Face model input resize failed.");
  }

  const input = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const planeSize = INPUT_SIZE * INPUT_SIZE;
  const aligner = cropPlan.canAlign ? getEyeAligner(cropPlan) : null;

  for (let y = 0; y < INPUT_SIZE; y += 1) {
    for (let x = 0; x < INPUT_SIZE; x += 1) {
      const tensorIndex = y * INPUT_SIZE + x;
      const source = aligner ? getAlignedSourcePoint(x, y, aligner) : getResizeSourcePoint(decoded, x, y);
      const { r, g, b } = sampleRgb(decoded, source.x, source.y);

      input[tensorIndex] = (r - 127.5) / 127.5;
      input[planeSize + tensorIndex] = (g - 127.5) / 127.5;
      input[planeSize * 2 + tensorIndex] = (b - 127.5) / 127.5;
    }
  }

  return new ort.Tensor("float32", input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

function normalizeLandmarks(landmarks) {
  if (!landmarks || typeof landmarks !== "object") {
    return null;
  }

  return Object.entries(landmarks).reduce((normalized, [key, point]) => {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      normalized[key] = { x, y };
    }
    return normalized;
  }, {});
}

function getFaceCropPlan(photo, width, height) {
  const frame = photo?.faceFrame;
  const box = frame?.frame;
  const landmarks = frame?.landmarks || null;
  const leftEye = landmarks?.leftEye;
  const rightEye = landmarks?.rightEye;
  const canAlign = Boolean(leftEye && rightEye && box?.width && box?.height);
  const points = [
    box && { x: box.x, y: box.y },
    box && { x: box.x + box.width, y: box.y + box.height },
    landmarks?.leftEye,
    landmarks?.rightEye,
    landmarks?.noseBase,
    landmarks?.mouthLeft,
    landmarks?.mouthRight,
    landmarks?.mouthBottom
  ].filter(Boolean);

  if (!points.length) {
    const cropSize = Math.floor(Math.min(width, height) * 0.82);
    return {
      canAlign: false,
      crop: {
        originX: Math.max(0, Math.floor((width - cropSize) / 2)),
        originY: Math.max(0, Math.floor((height - cropSize) / 2)),
        width: cropSize,
        height: cropSize
      }
    };
  }

  const bounds = getPointBounds(points);
  const faceWidth = Math.max(bounds.maxX - bounds.minX, Number(box?.width || 0));
  const faceHeight = Math.max(bounds.maxY - bounds.minY, Number(box?.height || 0));
  const eyeCenter = canAlign
    ? {
        x: (leftEye.x + rightEye.x) / 2,
        y: (leftEye.y + rightEye.y) / 2
      }
    : null;
  const centerX = eyeCenter?.x ?? (bounds.minX + bounds.maxX) / 2;
  const centerY = eyeCenter ? eyeCenter.y + faceHeight * 0.18 : (bounds.minY + bounds.maxY) / 2;
  const cropSize = Math.floor(Math.min(
    Math.max(faceWidth, faceHeight) * 1.72,
    Math.min(width, height)
  ));
  const originX = clamp(Math.round(centerX - cropSize / 2), 0, Math.max(0, width - cropSize));
  const originY = clamp(Math.round(centerY - cropSize / 2), 0, Math.max(0, height - cropSize));
  const crop = {
    originX,
    originY,
    width: cropSize,
    height: cropSize
  };

  return {
    canAlign,
    crop,
    leftEye: convertPointToCropCanvas(leftEye, crop),
    rightEye: convertPointToCropCanvas(rightEye, crop)
  };
}

function getPointBounds(points) {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
  );
}

function convertPointToCropCanvas(point, crop) {
  if (!point || !crop?.width) {
    return null;
  }

  const scale = ALIGNMENT_CANVAS_SIZE / crop.width;
  return {
    x: (point.x - crop.originX) * scale,
    y: (point.y - crop.originY) * scale
  };
}

function getEyeAligner(cropPlan) {
  const leftEye = cropPlan.leftEye;
  const rightEye = cropPlan.rightEye;
  const sourceDx = rightEye.x - leftEye.x;
  const sourceDy = rightEye.y - leftEye.y;
  const sourceDistance = Math.hypot(sourceDx, sourceDy);
  const targetDistance = Math.hypot(
    ARCFACE_RIGHT_EYE.x - ARCFACE_LEFT_EYE.x,
    ARCFACE_RIGHT_EYE.y - ARCFACE_LEFT_EYE.y
  );

  if (sourceDistance < 12 || !targetDistance) {
    return null;
  }

  return {
    cos: sourceDx / sourceDistance,
    sin: sourceDy / sourceDistance,
    scale: targetDistance / sourceDistance,
    sourceEyeCenter: {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2
    },
    targetEyeCenter: {
      x: (ARCFACE_LEFT_EYE.x + ARCFACE_RIGHT_EYE.x) / 2,
      y: (ARCFACE_LEFT_EYE.y + ARCFACE_RIGHT_EYE.y) / 2
    }
  };
}

function getAlignedSourcePoint(x, y, aligner) {
  const targetX = (x + 0.5 - aligner.targetEyeCenter.x) / aligner.scale;
  const targetY = (y + 0.5 - aligner.targetEyeCenter.y) / aligner.scale;

  return {
    x: aligner.sourceEyeCenter.x + aligner.cos * targetX - aligner.sin * targetY,
    y: aligner.sourceEyeCenter.y + aligner.sin * targetX + aligner.cos * targetY
  };
}

function getResizeSourcePoint(decoded, x, y) {
  return {
    x: ((x + 0.5) * decoded.width) / INPUT_SIZE - 0.5,
    y: ((y + 0.5) * decoded.height) / INPUT_SIZE - 0.5
  };
}

function sampleRgb(decoded, x, y) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x > decoded.width - 1 ||
    y > decoded.height - 1
  ) {
    return { r: 127.5, g: 127.5, b: 127.5 };
  }

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, decoded.width - 1);
  const y1 = Math.min(y0 + 1, decoded.height - 1);
  const dx = x - x0;
  const dy = y - y0;
  const topWeight = 1 - dy;
  const bottomWeight = dy;
  const leftWeight = 1 - dx;
  const rightWeight = dx;
  const topLeft = (y0 * decoded.width + x0) * 4;
  const topRight = (y0 * decoded.width + x1) * 4;
  const bottomLeft = (y1 * decoded.width + x0) * 4;
  const bottomRight = (y1 * decoded.width + x1) * 4;

  return {
    r: (
      decoded.data[topLeft] * leftWeight * topWeight +
      decoded.data[topRight] * rightWeight * topWeight +
      decoded.data[bottomLeft] * leftWeight * bottomWeight +
      decoded.data[bottomRight] * rightWeight * bottomWeight
    ),
    g: (
      decoded.data[topLeft + 1] * leftWeight * topWeight +
      decoded.data[topRight + 1] * rightWeight * topWeight +
      decoded.data[bottomLeft + 1] * leftWeight * bottomWeight +
      decoded.data[bottomRight + 1] * rightWeight * bottomWeight
    ),
    b: (
      decoded.data[topLeft + 2] * leftWeight * topWeight +
      decoded.data[topRight + 2] * rightWeight * topWeight +
      decoded.data[bottomLeft + 2] * leftWeight * bottomWeight +
      decoded.data[bottomRight + 2] * rightWeight * bottomWeight
    )
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) {
    return vector;
  }
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}
