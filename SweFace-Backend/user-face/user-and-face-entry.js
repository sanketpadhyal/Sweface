const express = require("express");
const { getFirebaseAdmin, getFirestore } = require("../firebase/admin");

const router = express.Router();
const MATCH_THRESHOLD = 0.38;
const DUPLICATE_FACE_MIN_CONFIDENCE = 94;
const DUPLICATE_FACE_MIN_SIMILARITY = 0.5;

function cleanCompanyFolderName(value) {
  return String(value || "Company")
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ") || "Company";
}

function cleanEmployeeId(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function cleanDocumentId(value, fallback = "document") {
  return String(value || fallback)
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ") || fallback;
}

function getCompanyDocumentId(employee, company) {
  const fallback = cleanCompanyFolderName(company.companyName || employee.companyName || "Company")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "company";

  return cleanDocumentId(company.companyId || employee.companyId || fallback, fallback);
}

function getUserDocumentId(employee) {
  return cleanDocumentId(employee.name || employee.employeeId, "employee");
}

function getFaceEmbeddingCompanyDocumentId(value = {}) {
  return cleanDocumentId(
    value.companyFolderName || value.companyName || value.companyDocumentId,
    "Company"
  );
}

function toFirestoreValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (Array.isArray(item)) {
        return {
          values: item.map((nestedItem) => {
            const nextNested = toFirestoreValue(nestedItem);
            return nextNested === undefined ? null : nextNested;
          })
        };
      }

      const next = toFirestoreValue(item);
      return next === undefined ? null : next;
    });
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce((result, [key, item]) => {
      const next = toFirestoreValue(item);
      if (next !== undefined) {
        result[key] = next;
      }
      return result;
    }, {});
  }

  return value;
}

function isEmbedding(value) {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => Number.isFinite(Number(item)));
}

function getEmbeddingsFromPayload(payload = {}) {
  const embeddings = [];

  if (isEmbedding(payload.embedding)) {
    embeddings.push(payload.embedding.map(Number));
  }

  if (Array.isArray(payload.embeddingSamples)) {
    for (const sample of payload.embeddingSamples) {
      if (isEmbedding(sample)) {
        embeddings.push(sample.map(Number));
      } else if (isEmbedding(sample?.values)) {
        embeddings.push(sample.values.map(Number));
      }
    }
  }

  return embeddings;
}

function normalizeEmbeddingSamplesForClient(samples) {
  if (!Array.isArray(samples)) {
    return [];
  }

  return samples
    .map((sample) => {
      if (isEmbedding(sample)) {
        return sample.map(Number);
      }
      if (isEmbedding(sample?.values)) {
        return sample.values.map(Number);
      }
      return null;
    })
    .filter(Boolean);
}

function getUserProfilePayload(data) {
  const {
    embedding,
    embeddingSamples,
    ...profile
  } = data;

  return profile;
}

function getFaceEmbeddingPayload(data) {
  return toFirestoreValue({
    employeeId: data.employeeId,
    name: data.name || null,
    companyName: data.companyName,
    companyFolderName: data.companyFolderName,
    companyDocumentId: data.companyDocumentId,
    employeeDocumentId: data.employeeDocumentId,
    embedding: data.embedding || null,
    embeddingSamples: data.embeddingSamples || [],
    embeddingProvider: data.embeddingProvider || null,
    embeddingModel: data.embeddingModel || null,
    updatedAt: data.updatedAt
  });
}

function cosineSimilarity(left, right) {
  if (!isEmbedding(left) || !isEmbedding(right) || left.length !== right.length) {
    return 0;
  }

  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0);
  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));

  return leftMagnitude && rightMagnitude ? dot / (leftMagnitude * rightMagnitude) : 0;
}

function getMatchConfidence(similarity) {
  if (!Number.isFinite(similarity) || similarity <= 0) {
    return 0;
  }

  const confidence = 60 + (similarity / MATCH_THRESHOLD) * 25;
  return Math.max(0, Math.min(99, Math.round(confidence)));
}

function getPublicEmployeePayload(employee, company) {
  const now = new Date().toISOString();
  const companyName = cleanCompanyFolderName(company.companyName || employee.companyName);
  const employeeId = cleanEmployeeId(employee.employeeId);
  const companyDocumentId = getCompanyDocumentId(employee, company);
  const employeeDocumentId = getUserDocumentId({ ...employee, employeeId });

  return {
    ...employee,
    employeeId,
    companyId: company.companyId || employee.companyId || null,
    companyName,
    companyFolderName: companyName,
    companyDocumentId,
    employeeDocumentId,
    companyUsername: company.username || employee.companyUsername || null,
    updatedAt: now,
    registeredAt: employee.registeredAt || now
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const employee = req.body?.employee || req.body || {};
    const allowOverwrite = req.body?.allowOverwrite === true;
    const employeeId = cleanEmployeeId(employee.employeeId);

    if (!employeeId) {
      return res.status(400).json({ message: "Employee ID is required." });
    }

    const company = {
      companyId: req.user?.companyId || employee.companyId || null,
      companyName: req.user?.companyName || employee.companyName || "Company",
      username: req.user?.username || employee.companyUsername || null
    };
    const data = toFirestoreValue(getPublicEmployeePayload({ ...employee, employeeId }, company));
    const db = getFirestore();
    const companyRef = db.collection("companies").doc(data.companyDocumentId);
    const employeeRef = companyRef.collection("users").doc(data.employeeDocumentId);
    const [existingNameDoc, existingEmployeeIdSnapshot] = await Promise.all([
      employeeRef.get(),
      companyRef.collection("users").where("employeeId", "==", employeeId).limit(1).get()
    ]);

    if ((existingNameDoc.exists || !existingEmployeeIdSnapshot.empty) && !allowOverwrite) {
      const existingData = existingNameDoc.exists
        ? existingNameDoc.data()
        : existingEmployeeIdSnapshot.docs[0].data();
      return res.status(409).json({
        message: `${existingData?.name || employeeId} is already registered in ${data.companyName}. Use a different name or employee ID.`,
        employee: {
          employeeId: existingData?.employeeId || employeeId,
          name: existingData?.name || null,
          companyName: data.companyName,
          companyDocumentId: data.companyDocumentId
        }
      });
    }

    const batch = db.batch();

    batch.set(companyRef, toFirestoreValue({
      id: company.companyId,
      companyName: data.companyName,
      companyFolderName: data.companyFolderName,
      companyDocumentId: data.companyDocumentId,
      username: data.companyUsername,
      updatedAt: data.updatedAt
    }), { merge: true });

    const deleteField = getFirebaseAdmin().firestore.FieldValue.delete();
    batch.set(employeeRef, {
      ...getUserProfilePayload(data),
      embedding: deleteField,
      embeddingSamples: deleteField
    }, { merge: true });

    if (Array.isArray(data.embedding) || Array.isArray(data.embeddingSamples)) {
      const faceEmbeddingCompanyDocumentId = getFaceEmbeddingCompanyDocumentId(data);
      const faceEmbeddingCompanyRef = db.collection("faceEmbeddings").doc(faceEmbeddingCompanyDocumentId);

      batch.set(faceEmbeddingCompanyRef, {
        companyDocumentId: data.companyDocumentId,
        companyName: data.companyName,
        companyFolderName: data.companyFolderName,
        updatedAt: data.updatedAt
      }, { merge: true });
      batch.set(faceEmbeddingCompanyRef.collection("users").doc(data.employeeDocumentId), getFaceEmbeddingPayload(data), { merge: true });
      batch.delete(db.collection("faceEmbeddings").doc(cleanDocumentId(`${data.companyDocumentId}__${data.employeeDocumentId}`, "faceEmbedding")));
      if (data.companyDocumentId !== faceEmbeddingCompanyDocumentId) {
        batch.delete(db.collection("faceEmbeddings").doc(data.companyDocumentId).collection("users").doc(data.employeeDocumentId));
      }
      batch.delete(companyRef.collection("faceEmbeddings").doc(data.employeeDocumentId));
    }

    await batch.commit();

    return res.json({
      message: "Employee saved.",
      path: `companies/${data.companyDocumentId}/users/${data.employeeDocumentId}`,
      employee: {
        employeeId,
        name: data.name || null,
        companyName: data.companyName,
        companyDocumentId: data.companyDocumentId,
        employeeDocumentId: data.employeeDocumentId
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const company = {
      companyId: req.user?.companyId || null,
      companyName: req.user?.companyName || "Company",
      username: req.user?.username || null
    };
    const companyDocumentId = getCompanyDocumentId({}, company);
    const faceEmbeddingCompanyDocumentId = getFaceEmbeddingCompanyDocumentId({
      companyName: company.companyName,
      companyFolderName: company.companyName,
      companyDocumentId
    });
    const db = getFirestore();
    const companyRef = db.collection("companies").doc(companyDocumentId);
    const [usersSnapshot, embeddingsSnapshot] = await Promise.all([
      companyRef.collection("users").get(),
      db.collection("faceEmbeddings").doc(faceEmbeddingCompanyDocumentId).collection("users").get()
    ]);
    const embeddingsByDocumentId = new Map(
      embeddingsSnapshot.docs.map((docSnap) => {
        const embeddingData = docSnap.data() || {};
        return [embeddingData.employeeDocumentId || docSnap.id, {
          embedding: embeddingData.embedding || null,
          embeddingSamples: normalizeEmbeddingSamplesForClient(embeddingData.embeddingSamples),
          embeddingProvider: embeddingData.embeddingProvider || null,
          embeddingModel: embeddingData.embeddingModel || null
        }];
      })
    );
    const users = usersSnapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      ...(embeddingsByDocumentId.get(docSnap.id) || {}),
      companyDocumentId,
      employeeDocumentId: docSnap.id
    }));

    return res.json({
      company: {
        companyId: company.companyId,
        companyName: company.companyName,
        companyDocumentId
      },
      users
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/check-face", async (req, res, next) => {
  try {
    const employee = req.body?.employee || req.body || {};
    const employeeId = cleanEmployeeId(employee.employeeId);
    const incomingEmbeddings = getEmbeddingsFromPayload(employee);

    if (!employeeId) {
      return res.status(400).json({ message: "Employee ID is required." });
    }

    if (!incomingEmbeddings.length) {
      return res.status(400).json({ message: "Face embedding is required." });
    }

    const company = {
      companyId: req.user?.companyId || employee.companyId || null,
      companyName: req.user?.companyName || employee.companyName || "Company"
    };
    const companyDocumentId = getCompanyDocumentId(employee, company);
    const faceEmbeddingCompanyDocumentId = getFaceEmbeddingCompanyDocumentId({
      companyName: company.companyName,
      companyFolderName: company.companyName,
      companyDocumentId
    });
    const db = getFirestore();
    const faceEmbeddingCompanyRefs = [
      db.collection("faceEmbeddings").doc(faceEmbeddingCompanyDocumentId)
    ];

    if (companyDocumentId !== faceEmbeddingCompanyDocumentId) {
      faceEmbeddingCompanyRefs.push(db.collection("faceEmbeddings").doc(companyDocumentId));
    }

    let bestMatch = null;

    for (const companyRef of faceEmbeddingCompanyRefs) {
      const embeddingsSnapshot = await companyRef.collection("users").get();

      for (const docSnap of embeddingsSnapshot.docs) {
        const stored = docSnap.data() || {};
        const storedEmployeeId = cleanEmployeeId(stored.employeeId || docSnap.id);

        if (!storedEmployeeId || storedEmployeeId === employeeId) {
          continue;
        }

        const storedEmbeddings = getEmbeddingsFromPayload(stored);

        for (const incomingEmbedding of incomingEmbeddings) {
          for (const storedEmbedding of storedEmbeddings) {
            const similarity = cosineSimilarity(incomingEmbedding, storedEmbedding);
            const confidence = getMatchConfidence(similarity);

            if (!bestMatch || similarity > bestMatch.similarity) {
              bestMatch = {
                employeeId: storedEmployeeId,
                employeeDocumentId: stored.employeeDocumentId || docSnap.id,
                companyDocumentId,
                companyName: stored.companyName || company.companyName || null,
                name: stored.name || null,
                similarity,
                confidence
              };
            }
          }
        }
      }
    }

    if (bestMatch &&
      bestMatch.similarity >= DUPLICATE_FACE_MIN_SIMILARITY &&
      bestMatch.confidence >= DUPLICATE_FACE_MIN_CONFIDENCE) {
      if (!bestMatch.name) {
        const companyRef = db.collection("companies").doc(bestMatch.companyDocumentId || companyDocumentId);
        const userSnap = await companyRef.collection("users").doc(bestMatch.employeeDocumentId).get();
        bestMatch.name = userSnap.exists ? userSnap.data()?.name || null : null;
      }

      return res.json({
        duplicate: true,
        match: bestMatch,
        message: `This face is already registered for ${bestMatch.name || bestMatch.employeeId}${bestMatch.companyName ? ` in ${bestMatch.companyName}` : ""}.`
      });
    }

    return res.json({
      duplicate: false,
      match: bestMatch
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = {
  userFaceRouter: router
};
