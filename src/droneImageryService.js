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

  const { upload_id, chunk_size } = await initResp.json();
  const totalSize = file.size;
  let offset = 0;

  // Step 2: Send chunks sequentially
  while (offset < totalSize) {
    const end = Math.min(offset + chunk_size, totalSize);
    const chunk = file.slice(offset, end);
    const chunkBytes = await chunk.arrayBuffer();

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
 * Fetch files from a shared Google Drive folder
 * Requires Google Drive API key and folder ID
 */
export const fetchFromGoogleDrive = async (folderId, farmId) => {
  const apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Google Drive API key not configured. Add VITE_GOOGLE_DRIVE_API_KEY to .env"
    );
  }

  try {
    // List files in the folder
    const listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${apiKey}&fields=files(id,name,mimeType,size,modifiedTime)`;

    const listResponse = await fetch(listUrl);
    if (!listResponse.ok) {
      throw new Error("Failed to list Google Drive files");
    }

    const { files } = await listResponse.json();

    // Filter for GeoTIFF files
    const tiffFiles = files.filter(
      (f) =>
        f.name.endsWith(".tif") ||
        f.name.endsWith(".tiff") ||
        f.mimeType === "image/tiff"
    );

    const results = [];

    for (const file of tiffFiles) {
      try {
        // Download the file
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`;
        const downloadResponse = await fetch(downloadUrl);

        if (!downloadResponse.ok) continue;

        const blob = await downloadResponse.blob();
        const fileObj = new File([blob], file.name, { type: "image/tiff" });

        // Parse filename to extract metadata
        // Expected format: farmId_YYYYMMDD_layerType.tif or just layerType.tif
        const parsed = parseFilename(file.name);

        // Upload to our storage (will automatically use chunked if > 80MB)
        const result = await uploadDroneImagery({
          file: fileObj,
          farmId: farmId,
          flightDate: parsed.date || new Date().toISOString().split("T")[0],
          layerType: parsed.layerType || "rgb",
        });

        results.push({
          originalName: file.name,
          ...result,
        });
      } catch (fileError) {
        console.error(`Error processing file ${file.name}:`, fileError);
        results.push({
          originalName: file.name,
          success: false,
          error: fileError.message,
        });
      }
    }

    return {
      totalFound: tiffFiles.length,
      processed: results,
    };
  } catch (error) {
    console.error("Error fetching from Google Drive:", error);
    throw error;
  }
};

/**
 * Fetch files from a shared OneDrive folder
 * Requires Microsoft Graph API setup
 */
export const fetchFromOneDrive = async (shareLink, farmId) => {
  // OneDrive share links need to be converted to API endpoint
  // Format: https://1drv.ms/f/s!xxx or similar

  // For shared links, we need to use the sharing API
  // This requires OAuth setup - for now, throw an informative error

  throw new Error(
    "OneDrive integration requires Microsoft Graph API setup. " +
      "Please use the manual upload option or Google Drive for now."
  );
};

/**
 * Parse a filename to extract date and layer type
 * Supports formats:
 * - farmId_YYYYMMDD_layerType.tif
 * - YYYYMMDD_layerType.tif
 * - layerType.tif
 * - ndvi_20241208.tif
 */
const parseFilename = (filename) => {
  const name = filename.replace(/\.(tif|tiff)$/i, "");
  const parts = name.split("_");

  let date = null;
  let layerType = "rgb";

  // Look for date pattern (YYYYMMDD or YYYY-MM-DD)
  for (const part of parts) {
    if (/^\d{8}$/.test(part)) {
      date = `${part.slice(0, 4)}-${part.slice(4, 6)}-${part.slice(6, 8)}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
      date = part;
    }
  }

  // Look for layer type
  const layerTypes = [
    "rgb",
    "ndvi",
    "ndre",
    "moisture",
    "thermal",
    "lai",
    "gndvi",
    "savi",
    "multispectral",
  ];
  for (const part of parts) {
    if (layerTypes.includes(part.toLowerCase())) {
      layerType = part.toLowerCase();
    }
  }

  return { date, layerType };
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
