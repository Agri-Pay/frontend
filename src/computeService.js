/**
 * Shared API client for the AgriPay compute backend (ml-models).
 *
 * Used by DroneImagerySection (plant counting) and
 * farmdetails (milestone verification).
 */
import { supabase } from "./createclient";

const COMPUTE_API =
  import.meta.env.VITE_COMPUTE_API_URL ?? "http://localhost:8001";

async function errorMessageFromResponse(res, fallback) {
  const err = await res.json().catch(() => ({}));
  const detail = err.detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const loc = Array.isArray(item.loc) ? item.loc.join(".") : item.loc;
        return loc ? `${loc}: ${item.msg}` : item.msg;
      })
      .filter(Boolean)
      .join("; ");
  }

  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return fallback;
}

// ---------------------------------------------------------------------------
// Model discovery
// ---------------------------------------------------------------------------

/**
 * Fetch available ML models, optionally filtered by crop.
 * Returns { models: [...], count: N }
 */
export async function fetchModels(crop = null) {
  const params = new URLSearchParams();
  if (crop) params.set("crop", crop);
  const res = await fetch(`${COMPUTE_API}/api/v1/models?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Plant counting
// ---------------------------------------------------------------------------

/**
 * Analyze an existing drone image by filename.
 * Backend resolves the full path via settings.imagery_dir.
 */
export async function analyzeByFilename(
  filename,
  modelId,
  imageUrl = null
) {
  const body = { filename, model_id: modelId };
  if (imageUrl) body.image_url = imageUrl;
  const res = await fetch(`${COMPUTE_API}/api/v1/analyze/plant-count`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Analysis request failed (${res.status})`);
  return res.json(); // { job_id, status, message }
}

/**
 * Upload a file and start analysis (browser upload flow).
 *
 * Uses XMLHttpRequest instead of fetch() so:
 *   1. Upload progress is reported via onProgress({ percent, loaded, total })
 *   2. Large files (100+ MB) stream to the server instead of buffering
 *   3. The request won't silently time out in the browser
 *
 * Suitable for files up to ~50 MB (single request finishes well within the
 * Cloudflare 100 s timeout).  For larger files use uploadAndAnalyzeChunked().
 *
 * @param {File} file
 * @param {string} [modelId]
 * @param {function} [onProgress]  called with { percent, loaded, total }
 */
export function uploadAndAnalyze(file, modelId = "wheat_plant_counter_v1", onProgress = null) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("model_id", modelId);

    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress({
            percent: Math.round((e.loaded / e.total) * 100),
            loaded: e.loaded,
            total: e.total,
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
          reject(new Error(data.detail || `Upload failed (HTTP ${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (HTTP ${xhr.status})`));
      }
    });

    xhr.addEventListener("error", () =>
      reject(new Error("Network error — check your connection and that the compute server is reachable."))
    );
    xhr.addEventListener("abort", () =>
      reject(new Error("Upload was cancelled."))
    );

    xhr.open("POST", `${COMPUTE_API}/upload`);
    xhr.timeout = 0; // no timeout — large files take a while
    xhr.send(formData);
  });
}

/**
 * Upload a large file using the chunked upload protocol and start analysis.
 *
 * Splits the file into 50 MB chunks so each individual HTTP request finishes
 * well within the Cloudflare 100 s timeout.  Passes analyze=true to the
 * complete endpoint so the backend submits an ML job instead of registering
 * the file as imagery.
 *
 * @param {File} file
 * @param {string} [modelId]
 * @param {function} [onProgress]  called with { percent, loaded, total }
 * @returns {Promise<{job_id: string}>}
 */
export async function uploadAndAnalyzeChunked(
  file,
  modelId = "wheat_plant_counter_v1",
  onProgress = null,
) {
  // Step 1: init — farm_id omitted so backend enters analyze mode
  const initResp = await fetch(`${COMPUTE_API}/api/v1/imagery/upload/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      total_size: file.size,
      content_type: file.type || "image/tiff",
    }),
  });
  if (!initResp.ok) {
    throw new Error(
      await errorMessageFromResponse(
        initResp,
        `Upload init failed (${initResp.status})`,
      ),
    );
  }
  const { upload_id, chunk_size } = await initResp.json();

  // Step 2: send chunks
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + chunk_size, file.size);
    const chunk = file.slice(offset, end);
    const chunkBytes = await chunk.arrayBuffer();

    const chunkResp = await fetch(
      `${COMPUTE_API}/api/v1/imagery/upload/${upload_id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range": `bytes ${offset}-${end - 1}/${file.size}`,
        },
        body: chunkBytes,
      },
    );
    if (!chunkResp.ok) {
      throw new Error(
        await errorMessageFromResponse(
          chunkResp,
          `Chunk upload failed at offset ${offset} (${chunkResp.status})`,
        ),
      );
    }

    offset = end;
    if (onProgress) {
      onProgress({
        loaded: offset,
        total: file.size,
        percent: Math.round((offset / file.size) * 100),
      });
    }
  }

  // Step 3: complete with analyze=true
  const completeResp = await fetch(
    `${COMPUTE_API}/api/v1/imagery/upload/${upload_id}/complete?analyze=true&model_id=${encodeURIComponent(modelId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  if (!completeResp.ok) {
    throw new Error(
      await errorMessageFromResponse(
        completeResp,
        `Upload finalization failed (${completeResp.status})`,
      ),
    );
  }
  return completeResp.json(); // { job_id, status, message }
}

/**
 * List plant-counter-compatible image files from a Google Drive URL/folder/ID.
 */
export async function listDriveImageFiles(input) {
  const resp = await fetch(`${COMPUTE_API}/api/v1/imagery/drive/list-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, allowed_types: "image" }),
  });

  if (!resp.ok) {
    throw new Error(
      await errorMessageFromResponse(
        resp,
        `Failed to list Drive files (${resp.status})`,
      ),
    );
  }

  const data = await resp.json();
  return {
    type: data.type,
    files: data.files,
    skippedCount: data.skipped_count,
  };
}

/**
 * Submit a plant-count analysis for a Google Drive file.
 *
 * The server downloads the file in the background — nothing is uploaded from
 * the browser.  Returns a job_id immediately for polling.
 *
 * @param {string} fileId   Google Drive file ID (from listDriveFiles)
 * @param {string} fileName Original filename (from listDriveFiles)
 * @param {string} [modelId]
 * @returns {Promise<{job_id: string}>}
 */
export async function analyzeFromDriveFile(
  fileId,
  fileName,
  modelId = "wheat_plant_counter_v1",
) {
  const res = await fetch(`${COMPUTE_API}/api/v1/analyze/from-drive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId, file_name: fileName, model_id: modelId }),
  });
  if (!res.ok) {
    throw new Error(
      await errorMessageFromResponse(res, `Request failed (HTTP ${res.status})`),
    );
  }
  return res.json(); // { job_id, status, message }
}

/**
 * Poll job status.
 * Uses the /status compat endpoint which remaps keys to frontend shape.
 */
export async function getJobStatus(jobId) {
  const res = await fetch(`${COMPUTE_API}/status/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch job status");
  return res.json();
  // { job_id, status, progress (0-100), message, result?, error? }
}

/**
 * Download a result image as an object-URL (blob).
 * type: "counting" | "size_annotated" | "size_colored" | "heatmap"
 */
export async function getResultImageBlob(jobId, type) {
  const res = await fetch(`${COMPUTE_API}/download/${jobId}/${type}`);
  if (!res.ok) throw new Error("Could not fetch result image");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ---------------------------------------------------------------------------
// Milestone verification
// ---------------------------------------------------------------------------

/**
 * Trigger multi-source ML verification for a milestone.
 * Returns { status, verdict, overall_confidence, recommendation, report }.
 */
export async function verifyMilestone(milestoneId) {
  const res = await fetch(`${COMPUTE_API}/api/v1/verify-milestone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ milestone_id: milestoneId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Verification failed (${res.status})`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Result caching (Supabase — generic ml_results table)
// ---------------------------------------------------------------------------

/**
 * Check for cached ML results for a specific flight and model.
 * Returns the most recent result row, or null.
 */
export async function getCachedResults(flightId, modelId) {
  const { data, error } = await supabase
    .from("ml_results")
    .select("*")
    .eq("flight_id", flightId)
    .eq("model_id", modelId)
    .order("analyzed_at", { ascending: false })
    .limit(1);
  if (error) {
    console.warn("Cache lookup failed:", error.message);
    return null;
  }
  return data?.[0] || null;
}

/**
 * Persist ML results to the generic cache table.
 * `result` is the raw model output — stored as-is in result_data JSONB.
 */
export async function saveResults({
  farmId,
  flightId,
  layerId,
  jobId,
  filename,
  result,
  modelId,
}) {
  const { error } = await supabase.from("ml_results").insert({
    farm_id: farmId,
    flight_id: flightId || null,
    layer_id: layerId || null,
    job_id: jobId || null,
    model_id: modelId,
    image_filename: filename,
    result_data: result,
    processing_time_seconds: result.processing_time_seconds,
    analyzed_at: new Date().toISOString(),
  });
  if (error) console.warn("Could not save ML results:", error.message);
}
