/**
 * lib/blob.js
 * Real file storage for payment receipts — Part 15/39.
 *
 * Uses Vercel Blob. Despite the name, this works from anywhere — it's
 * just an authenticated HTTPS API — so it works fine from a Koyeb
 * container as long as BLOB_READ_WRITE_TOKEN is set. Create a Blob store
 * in the Vercel dashboard (Storage → Create → Blob) even if the rest of
 * your infrastructure lives elsewhere, and copy the token here.
 *
 * Uploaded with access: "public". Vercel Blob does support a newer
 * "private" access mode, but private blobs require every read to go
 * through an authenticated get() call rather than a plain URL — that
 * would mean building a signed-URL proxy for the admin panel's receipt
 * viewer. Public access with a long, random, unguessable path is a
 * reasonable trade-off here: nothing links to these URLs publicly, only
 * admins ever see them. Swap to private + a proxy route if you need
 * stricter access control.
 */
const { put } = require("@vercel/blob");
const crypto = require("crypto");

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function createError(message, statusCode = 500) {
  return Object.assign(new Error(message), { statusCode });
}

function getToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw createError("File storage is not configured (BLOB_READ_WRITE_TOKEN missing).", 500);
  }
  return token;
}

function resolveExtension(mimeType, originalFilename) {
  if (ALLOWED_TYPES[mimeType]) return ALLOWED_TYPES[mimeType];
  const match = String(originalFilename || "").match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : "bin";
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} bookingId - human-readable booking id, used in the storage path only
 * @param {string} [originalFilename] - used only as an extension fallback if mimeType is unrecognized
 * @returns {Promise<{url: string, fileName: string}>}
 */
async function uploadReceipt(buffer, mimeType, bookingId, originalFilename = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createError("Empty file upload.", 400);
  }
  if (!ALLOWED_TYPES[mimeType]) {
    throw createError("Unsupported file type. Please upload JPG, PNG, WEBP, or PDF.", 400);
  }
  if (buffer.length > MAX_BYTES) {
    throw createError("File too large. Maximum size is 8 MB.", 400);
  }

  const token = getToken();
  const extension = resolveExtension(mimeType, originalFilename);
  const key = `receipts/${bookingId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;

  try {
    const blob = await put(key, buffer, {
      access: "public",
      token,
      contentType: mimeType,
      addRandomSuffix: false,
    });
    return { url: blob.url, fileName: key.split("/").pop() };
  } catch (err) {
    console.error("[Vercel Blob upload error]", err);
    throw createError("Unable to upload receipt. Please try again.", 500);
  }
}

module.exports = { uploadReceipt, ALLOWED_TYPES, MAX_BYTES };
