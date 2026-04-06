// src/droneImageryService.js
/**
 * Drone Imagery Service
 * Handles uploading GeoTIFFs to the compute server and fetching from cloud storage (Drive/OneDrive).
 *
 * Images are stored directly on the compute server's disk.
 * The server also writes metadata to Supabase Postgres tables
 * (drone_flights + drone_imagery_layers).
 */

import { supabase } from "./createclient";

const COMPUTE_API =
  import.meta.env.VITE_COMPUTE_API_URL ?? "http://localhost:8001";
const TITILER_URL = import.meta.env.VITE_TITILER_URL || "http://localhost:8000";

// Files larger than this threshold use chunked upload (50 MB)
const CHUNKED_UPLOAD_THRESHOLD = 80 * 1024 * 1024;

/**
 * Upload a FormData payload with real progress tracking via XMLHttpRequest.
 * @param {string} url - The endpoint to POST to
 * @param {FormData} formData - The form data to upload
 * @param {function|null} onProgress - Called with {loaded, total, percent} during upload
 * @returns {Promise<object>} Parsed JSON response
 */
const uploadWithProgress = (url, formData, onProgress) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percent: Math.round((e.loaded / e.total) * 100),
          });
        }
      });
    }

    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.detail || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    });

    xhr.addEventListener("error", () =>
      reject(new Error("Network error during upload. Check your connection."))
    );
    xhr.addEventListener("abort", () =>
      reject(new Error("Upload was cancelled"))
    );
    xhr.addEventListener("timeout", () =>
      reject(new Error("Upload timed out. The file may be too large for your connection."))
    );

    xhr.open("POST", url);
    xhr.timeout = 0; // No timeout — large GeoTIFFs can take a long time
    xhr.send(formData);
  });
};

/**
 * Retry a function with exponential backoff.
 * @param {function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} baseDelayMs - Initial delay in milliseconds (doubles each retry)
 * @returns {Promise<any>} Result of the function
 */
const retryWithBackoff = async (fn, maxRetries = 3, baseDelayMs = 1000) => {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(
          `Upload retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${error.message}`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
};

/**
 * Upload a large file using the chunked upload protocol.
 * Splits the file into chunks, sends them sequentially, then finalizes.
 */
const uploadDroneImageryChunked = async ({
  file,
  farmId,
  flightDate,
  layerType,
  bandMapping = null,
  pilotName = null,
  droneModel = null,
  altitude = null,
  onProgress = null,
}) => {
  // Step 1: Initialize the upload session
  const { upload_id, chunk_size } = await retryWithBackoff(async () => {
    const initResp = await fetch(`${COMPUTE_API}/api/v1/imagery/upload/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        total_size: file.size,
        farm_id: farmId,
        flight_date: flightDate,
        layer_type: layerType,
        content_type: file.type || "image/tiff",
      }),
    });

    if (!initResp.ok) {
      const err = await initResp.json().catch(() => ({}));
      throw new Error(err.detail || `Upload init failed (${initResp.status})`);
    }

    return await initResp.json();
  });
  const totalSize = file.size;
  let offset = 0;

  // Step 2: Send chunks sequentially
  while (offset < totalSize) {
    const end = Math.min(offset + chunk_size, totalSize);
    const chunk = file.slice(offset, end);
    const chunkBytes = await chunk.arrayBuffer();

    await retryWithBackoff(async () => {
      const chunkResp = await fetch(
        `${COMPUTE_API}/api/v1/imagery/upload/${upload_id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Range": `bytes ${offset}-${end - 1}/${totalSize}`,
          },
          body: chunkBytes,
        },
      );

      if (!chunkResp.ok) {
        const err = await chunkResp.json().catch(() => ({}));
        throw new Error(
          err.detail || `Chunk upload failed at offset ${offset} (${chunkResp.status})`,
        );
      }
    }, 3, 2000);

    offset = end;

    if (onProgress) {
      onProgress({
        loaded: offset,
        total: totalSize,
        percent: Math.round((offset / totalSize) * 100),
      });
    }
  }

  // Step 3: Finalize the upload
  const completeBody = {};
  if (bandMapping) completeBody.band_mapping = JSON.stringify(bandMapping);
  if (pilotName) completeBody.pilot_name = pilotName;
  if (droneModel) completeBody.drone_model = droneModel;
  if (altitude != null) completeBody.altitude = altitude;

  return await retryWithBackoff(async () => {
    const completeResp = await fetch(
      `${COMPUTE_API}/api/v1/imagery/upload/${upload_id}/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeBody),
      },
    );

    if (!completeResp.ok) {
      const err = await completeResp.json().catch(() => ({}));
      throw new Error(err.detail || `Upload finalization failed (${completeResp.status})`);
    }

    return await completeResp.json();
  }, 3, 2000);
};

/**
 * Upload a GeoTIFF file to the compute server and register in database.
 * Automatically uses chunked upload for files larger than 80 MB.
 *
 * The server stores the file on disk at /data/{farmId}_{YYYYMMDD}_{layerType}.tif
 * and creates/updates drone_flights + drone_imagery_layers records in Supabase.
 */
export const uploadDroneImagery = async ({
  file,
  farmId,
  flightDate,
  layerType,
  bandMapping = null,
  pilotName = null,
  droneModel = null,
  altitude = null,
  onProgress = null,
}) => {
  // Use chunked upload for large files
  if (file.size > CHUNKED_UPLOAD_THRESHOLD) {
    const result = await uploadDroneImageryChunked({
      file,
      farmId,
      flightDate,
      layerType,
      bandMapping,
      pilotName,
      droneModel,
      altitude,
      onProgress,
    });
    return {
      success: result.success,
      flight: result.flight,
      layer: result.layer,
      filename: result.filename,
    };
  }

  // Small files: use single-POST upload with XHR progress
  const formData = new FormData();
  formData.append("file", file);
  formData.append("farm_id", farmId);
  formData.append("flight_date", flightDate);
  formData.append("layer_type", layerType);
  if (bandMapping) formData.append("band_mapping", JSON.stringify(bandMapping));
  if (pilotName) formData.append("pilot_name", pilotName);
  if (droneModel) formData.append("drone_model", droneModel);
  if (altitude != null) formData.append("altitude", altitude.toString());

  const result = await uploadWithProgress(
    `${COMPUTE_API}/api/v1/imagery/upload`,
    formData,
    onProgress,
  );
  return {
    success: result.success,
    flight: result.flight,
    layer: result.layer,
    filename: result.filename,
  };
};

/**
 * Get the TiTiler file URL for a drone imagery file.
 * Since images are stored on the server, TiTiler reads them via file:// protocol.
 * This returns the filename used in TiTiler requests — NOT a browser-accessible URL.
 */
export const getImageryUrl = (farmId, filename) => {
  // For TiTiler, images are at file:///data/{filename} inside the Docker network.
  // The frontend doesn't access files directly — it goes through TiTiler tile endpoints.
  // Return the filename so callers can build TiTiler tile/preview URLs.
  return filename;
};

/**
 * Get tile URL for displaying imagery via TiTiler (server-side files)
 */
export const getTileUrlFromStorage = (farmId, filename, options = {}) => {
  const fileUrl = `file:///data/${filename}`;

  const params = new URLSearchParams({
    url: fileUrl,
  });

  if (options.colormap) {
    params.append("colormap_name", options.colormap);
  }
  if (options.rescale) {
    params.append("rescale", options.rescale);
  }

  return `${TITILER_URL}/cog/tiles/{z}/{x}/{y}?${params.toString()}`;
};

/**
 * Delete a drone imagery file from the server
 */
export const deleteDroneImagery = async (farmId, layerId, filename) => {
  const response = await fetch(
    `${COMPUTE_API}/api/v1/imagery/${farmId}/${encodeURIComponent(filename)}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Delete failed (${response.status})`);
  }

  return { success: true };
};

/**
 * List GeoTIFF files from a Google Drive URL, folder link, or raw ID.
 * All Drive API calls go through the backend (API key is server-side).
 * @param {string} input - Any Google Drive URL or raw ID
 * @returns {Promise<{type: string, files: Array, skippedCount: number}>}
 */
export const listDriveFiles = async (input) => {
  const resp = await fetch(`${COMPUTE_API}/api/v1/imagery/drive/list-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to list Drive files (${resp.status})`);
  }

  const data = await resp.json();
  return {
    type: data.type,
    files: data.files,
    skippedCount: data.skipped_count,
  };
};

/**
 * Import a single file from Google Drive directly to the server.
 * The server downloads from Drive and registers in DB.
 * Returns a streaming NDJSON response for real-time progress.
 *
 * @param {object} params - Import parameters
 * @param {string} params.fileId - Google Drive file ID
 * @param {string} params.fileName - Original filename
 * @param {string} params.farmId - Farm ID
 * @param {string} params.flightDate - YYYY-MM-DD
 * @param {string} params.layerType - Layer type (rgb, ndvi, etc.)
 * @param {Array|null} params.bandMapping - Band mapping array (for multispectral)
 * @param {string|null} params.pilotName
 * @param {string|null} params.droneModel
 * @param {number|null} params.altitude
 * @param {function|null} onProgress - Called with {phase, progress} during import
 * @returns {Promise<object>} Final result from server
 */
export const importFromDrive = async (
  { fileId, fileName, farmId, flightDate, layerType, bandMapping = null, pilotName = null, droneModel = null, altitude = null },
  onProgress = null,
) => {
  const body = {
    file_id: fileId,
    file_name: fileName,
    farm_id: farmId,
    flight_date: flightDate,
    layer_type: layerType,
  };
  if (bandMapping) body.band_mapping = JSON.stringify(bandMapping);
  if (pilotName) body.pilot_name = pilotName;
  if (droneModel) body.drone_model = droneModel;
  if (altitude != null) body.altitude = altitude;

  const resp = await fetch(`${COMPUTE_API}/api/v1/imagery/drive/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `Drive import failed (${resp.status})`);
  }

  // Read NDJSON stream line by line
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.phase === "error") {
          throw new Error(msg.message || "Import failed");
        }
        if (msg.phase === "complete") {
          finalResult = msg.result;
        }
        if (onProgress) {
          onProgress({ phase: msg.phase, progress: msg.progress || 0 });
        }
      } catch (e) {
        if (e.message && !e.message.startsWith("Unexpected")) throw e;
        // skip malformed lines
      }
    }
  }

  if (!finalResult) {
    throw new Error("Import stream ended without a result.");
  }

  return finalResult;
};

/**
 * Check if the compute server is reachable (replaces old ensureStorageBucket).
 * Returns true if the server's imagery endpoint is accessible.
 */
export const ensureStorageBucket = async () => {
  try {
    const response = await fetch(`${COMPUTE_API}/health`, { method: "GET" });
    return response.ok;
  } catch {
    console.warn("Compute server not reachable for imagery upload");
    return false;
  }
};
