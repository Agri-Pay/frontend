// src/CropStageSection.jsx
// Handles both Farmer Input (9 wheat stages) and Milestones Achieved (3 payable milestones)

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./createclient";
import { toast } from "react-hot-toast";
import {
  MILESTONE_STATUS,
  getStatusDisplay,
  getStatusColor,
  isVerifiedStatus,
  isPendingVerification,
} from "./utils/statusHelpers";
import "./cropstage.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const WHEAT_STAGES = [
  {
    key: "sowing",
    label: "1. Sowing",
    description: "Date of seed sowing and initial field preparation inputs.",
  },
  {
    key: "emergence",
    label: "2. Emergence",
    description: "Seedlings have emerged from the soil (5–7 DAS).",
  },
  {
    key: "tillering",
    label: "3. Tillering",
    description: "Lateral shoots (tillers) developing from the main stem.",
  },
  {
    key: "jointing",
    label: "4. Jointing",
    description: "Stem elongation begins, nodes become detectable.",
  },
  {
    key: "booting",
    label: "5. Booting",
    description: "Flag leaf sheath swells around the developing head.",
  },
  {
    key: "heading",
    label: "6. Heading",
    description: "Wheat head (spike) emerges from flag leaf sheath.",
  },
  {
    key: "anthesis",
    label: "7. Anthesis",
    description: "Pollination and fertilization occurring (flowering).",
  },
  {
    key: "grain_filling",
    label: "8. Grain Filling & Ripening",
    description: "Grains develop, fill, and dry down to harvest moisture.",
  },
  {
    key: "harvest",
    label: "9. Harvest",
    description: "Crop is ready and cut for grain collection.",
  },
];

const TOGGLE_FIELDS = [
  { key: "irrigation", label: "Irrigation" },
  { key: "herbicide", label: "Herbicide" },
  { key: "pesticide", label: "Pesticide" },
  { key: "fungicide", label: "Fungicide" },
  { key: "biologicals", label: "Biologicals" },
];

const emptyStageData = () => ({
  stage_date: "",
  das: "",
  irrigation: false,
  herbicide: false,
  pesticide: false,
  fungicide: false,
  biologicals: false,
  fertilizer_per_acre: "",
  image_url: "",
  notes: "",
});

// ─── Sub-components ───────────────────────────────────────────────────────────

// Full-screen image lightbox
const ImageLightbox = ({ src, alt, onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} type="button">
        <span className="material-symbols-outlined">close</span>
      </button>
      <img
        src={src}
        alt={alt}
        className="lightbox-img"
        onClick={(e) => e.stopPropagation()} // clicking the image itself doesn't close
      />
    </div>
  );
};

const ToggleBtn = ({ value, onChange, label }) => (
  <button
    type="button"
    className={`stage-toggle-btn ${value ? "active-yes" : "active-no"}`}
    onClick={() => onChange(!value)}
  >
    <span className="toggle-indicator">{value ? "✓" : "✗"}</span>
    {label}
  </button>
);

const StageCard = ({ stage, cycleId, existingData, sowingDate }) => {
  const [open, setOpen] = useState(false);
  // editMode: true = form, false = read-only summary
  const [editMode, setEditMode] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [data, setData] = useState(emptyStageData());     // committed/saved state
  const [draft, setDraft] = useState(emptyStageData());   // working copy while editing
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const fileRef = useRef();

  const hasData = existingData !== undefined;

  // Load existing data when it arrives
  useEffect(() => {
    if (existingData) {
      const loaded = {
        stage_date: existingData.stage_date || "",
        das: existingData.das ?? "",
        irrigation: existingData.irrigation ?? false,
        herbicide: existingData.herbicide ?? false,
        pesticide: existingData.pesticide ?? false,
        fungicide: existingData.fungicide ?? false,
        biologicals: existingData.biologicals ?? false,
        fertilizer_per_acre: existingData.fertilizer_per_acre ?? "",
        image_url: existingData.image_url || "",
        notes: existingData.notes || "",
      };
      setData(loaded);
      setDraft(loaded);
      if (existingData.image_url) setImagePreview(existingData.image_url);
    }
  }, [existingData]);

  // Toggle open: saved stages open in view mode; new stages open in edit mode
  const handleToggleOpen = () => {
    if (!open) setEditMode(!hasData);
    setOpen((o) => !o);
  };

  const handleStartEdit = () => {
    setDraft({ ...data }); // snapshot saved state into draft
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setDraft({ ...data }); // restore draft to last saved state
    setImagePreview(data.image_url || null);
    setEditMode(false);
  };

  // Auto-calculate DAS when date changes (in draft)
  const handleDateChange = (dateStr) => {
    setDraft((prev) => {
      let das = prev.das;
      if (dateStr && sowingDate && stage.key !== "sowing") {
        const diff = Math.round(
          (new Date(dateStr) - new Date(sowingDate)) / 86400000
        );
        das = diff >= 0 ? diff : "";
      }
      return { ...prev, stage_date: dateStr, das };
    });
  };

  const handleImageUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    setUploading(true);
    setImagePreview(URL.createObjectURL(file));
    try {
      const ext = file.name.split(".").pop();
      const path = `${cycleId}/${stage.key}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("stage-images")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from("stage-images")
        .getPublicUrl(path);
      setDraft((prev) => ({ ...prev, image_url: urlData.publicUrl }));
    } catch (e) {
      toast.error("Image upload failed: " + e.message);
      setImagePreview(data.image_url || null);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        crop_cycle_id: cycleId,
        stage_name: stage.key,
        stage_date: draft.stage_date || null,
        das: draft.das !== "" ? Number(draft.das) : null,
        irrigation: draft.irrigation,
        herbicide: draft.herbicide,
        pesticide: draft.pesticide,
        fungicide: draft.fungicide,
        biologicals: draft.biologicals,
        fertilizer_per_acre:
          draft.fertilizer_per_acre !== "" ? Number(draft.fertilizer_per_acre) : null,
        image_url: draft.image_url || null,
        notes: draft.notes || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("growth_stage_inputs")
        .upsert(payload, { onConflict: "crop_cycle_id,stage_name" });
      if (error) throw error;
      setData({ ...draft });  // commit draft → saved state
      setEditMode(false);     // switch back to view mode
      toast.success(`${stage.label} saved`);
    } catch (e) {
      toast.error("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Summary helpers for view mode
  const appliedInputs = TOGGLE_FIELDS.filter((f) => data[f.key]);
  const notApplied   = TOGGLE_FIELDS.filter((f) => !data[f.key]);

  return (
    <div className={`stage-card ${open ? "open" : ""} ${hasData ? "has-data" : ""}`}>
      {/* ── Header ──────────────────────────────────────────── */}
      <button className="stage-card-header" onClick={handleToggleOpen} type="button">
        <div className="stage-card-title">
          <span className={`stage-dot ${hasData ? "done" : ""}`} />
          <span>{stage.label}</span>
        </div>
        <div className="stage-card-meta">
          {hasData && data.stage_date && (
            <span className="stage-date-badge">{data.stage_date}</span>
          )}
          {hasData && !open && (
            <span className="stage-saved-tag">
              <span className="material-symbols-outlined">check_circle</span>
              Saved
            </span>
          )}
          <span className="material-symbols-outlined stage-chevron">
            {open ? "expand_less" : "expand_more"}
          </span>
        </div>
      </button>

      {open && (
        <div className="stage-card-body">
          <p className="stage-desc">{stage.description}</p>

          {/* ── VIEW MODE (saved data, not editing) ─────────── */}
          {hasData && !editMode ? (
            <div className="stage-view-mode">
              <div className="stage-summary-grid">
                {data.stage_date && (
                  <div className="sv-row">
                    <span className="sv-label">Date</span>
                    <span className="sv-value">{data.stage_date}</span>
                  </div>
                )}
                {(data.das !== "" && data.das !== null) && (
                  <div className="sv-row">
                    <span className="sv-label">DAS</span>
                    <span className="sv-value">{data.das} days</span>
                  </div>
                )}
                {(data.fertilizer_per_acre !== "" && data.fertilizer_per_acre !== null) && (
                  <div className="sv-row">
                    <span className="sv-label">Fertilizer</span>
                    <span className="sv-value">{data.fertilizer_per_acre} kg/acre</span>
                  </div>
                )}
                <div className="sv-row sv-row-full">
                  <span className="sv-label">Inputs</span>
                  <div className="sv-chips">
                    {appliedInputs.map((f) => (
                      <span key={f.key} className="sv-chip yes">{f.label}</span>
                    ))}
                    {notApplied.map((f) => (
                      <span key={f.key} className="sv-chip no">{f.label}</span>
                    ))}
                  </div>
                </div>
                {data.notes && (
                  <div className="sv-row sv-row-full">
                    <span className="sv-label">Notes</span>
                    <span className="sv-value sv-notes">{data.notes}</span>
                  </div>
                )}
              </div>

              {data.image_url && (
                <div
                  className="sv-image-wrap sv-image-clickable"
                  onClick={() => setLightboxSrc(data.image_url)}
                  title="Click to view full size"
                >
                  <img src={data.image_url} alt="Field photo" className="sv-image" />
                  <div className="sv-image-expand-hint">
                    <span className="material-symbols-outlined">open_in_full</span>
                    View full size
                  </div>
                </div>
              )}
              {lightboxSrc && (
                <ImageLightbox
                  src={lightboxSrc}
                  alt={stage.label}
                  onClose={() => setLightboxSrc(null)}
                />
              )}

              <div className="stage-actions">
                <button className="stage-edit-btn" onClick={handleStartEdit} type="button">
                  <span className="material-symbols-outlined">edit</span>
                  Edit Stage
                </button>
              </div>
            </div>
          ) : (
            /* ── EDIT / NEW MODE ──────────────────────────────── */
            <>
              <div className="stage-row-2">
                <div className="stage-field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={draft.stage_date}
                    onChange={(e) => handleDateChange(e.target.value)}
                  />
                </div>
                <div className="stage-field">
                  <label>DAS (Days After Sowing)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Auto-calculated or enter manually"
                    value={draft.das}
                    onChange={(e) => setDraft((p) => ({ ...p, das: e.target.value }))}
                  />
                </div>
              </div>

              <div className="stage-field">
                <label>Applied Inputs</label>
                <div className="stage-toggles">
                  {TOGGLE_FIELDS.map((f) => (
                    <ToggleBtn
                      key={f.key}
                      label={f.label}
                      value={draft[f.key]}
                      onChange={(v) => setDraft((p) => ({ ...p, [f.key]: v }))}
                    />
                  ))}
                </div>
              </div>

              <div className="stage-field half">
                <label>Fertilizer (per acre)</label>
                <div className="stage-input-unit">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0.00"
                    value={draft.fertilizer_per_acre}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, fertilizer_per_acre: e.target.value }))
                    }
                  />
                  <span className="unit-tag">kg/acre</span>
                </div>
              </div>

              <div className="stage-field">
                <label>Field Photo</label>
                <div className="stage-image-area" onClick={() => fileRef.current?.click()}>
                  {imagePreview ? (
                    <img src={imagePreview} alt="stage" className="stage-preview" />
                  ) : (
                    <div className="stage-image-placeholder">
                      <span className="material-symbols-outlined">add_photo_alternate</span>
                      <span>{uploading ? "Uploading…" : "Click to add photo"}</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => handleImageUpload(e.target.files[0])}
                />
              </div>

              <div className="stage-field">
                <label>Notes (optional)</label>
                <textarea
                  placeholder="Any observations or remarks for this stage…"
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>

              <div className="stage-actions">
                {hasData && (
                  <button
                    className="stage-cancel-btn"
                    onClick={handleCancelEdit}
                    type="button"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                )}
                <button
                  className="stage-save-btn"
                  onClick={handleSave}
                  disabled={saving || uploading}
                >
                  {saving ? "Saving…" : "Save Stage"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Milestone Achieved Card ──────────────────────────────────────────────────

const MilestoneCard = ({
  milestone,
  role,
  onStatusChange,
  onApprove,
  cycleId,
}) => {
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState(
    milestone.image_url || null
  );
  const fileRef = useRef();
  const verified = isVerifiedStatus(milestone.status);
  const pending = isPendingVerification(milestone.status);

  const handleImageUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setImagePreview(URL.createObjectURL(file));
    try {
      const ext = file.name.split(".").pop();
      const path = `milestones/${milestone.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("stage-images")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from("stage-images")
        .getPublicUrl(path);
      // Save image_url to cycle_milestones
      const { error: dbErr } = await supabase
        .from("cycle_milestones")
        .update({ image_url: urlData.publicUrl })
        .eq("id", milestone.id);
      if (dbErr) throw dbErr;
      toast.success("Photo saved");
    } catch (e) {
      toast.error("Upload failed: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const statusColor = {
    not_started: "#94a3b8",
    in_progress: "#3b82f6",
    pending_verification: "#f59e0b",
    verified: "#22c55e",
    rejected: "#ef4444",
  };

  const currentColor =
    statusColor[milestone.status] || statusColor.not_started;

  return (
    <div className={`ms-card ${verified ? "ms-verified" : ""}`}>
      <div
        className="ms-card-accent"
        style={{ background: currentColor }}
      />
      <div className="ms-card-body">
        <div className="ms-card-top">
          <div>
            <h4 className="ms-name">
              {milestone.milestone_templates?.name}
            </h4>
            <p className="ms-desc">
              {milestone.milestone_templates?.description}
            </p>
          </div>
          <span
            className="ms-status-pill"
            style={{
              background: `${currentColor}22`,
              color: currentColor,
              border: `1px solid ${currentColor}55`,
            }}
          >
            {getStatusDisplay(milestone.status)}
          </span>
        </div>

        {/* Farmer controls */}
        {role === "farmer" && !verified && (
          <div className="ms-farmer-controls">
            <div className="ms-toggle-group">
              <button
                className={`ms-toggle-btn ${
                  milestone.status === MILESTONE_STATUS.PENDING_VERIFICATION ||
                  milestone.status === MILESTONE_STATUS.VERIFIED
                    ? "complete"
                    : ""
                }`}
                disabled={pending}
                onClick={() =>
                  onStatusChange(
                    milestone.id,
                    MILESTONE_STATUS.PENDING_VERIFICATION
                  )
                }
              >
                ✓ Complete
              </button>
              <button
                className={`ms-toggle-btn ${
                  milestone.status === MILESTONE_STATUS.IN_PROGRESS ||
                  milestone.status === MILESTONE_STATUS.NOT_STARTED
                    ? "incomplete"
                    : ""
                }`}
                disabled={pending}
                onClick={() =>
                  onStatusChange(milestone.id, MILESTONE_STATUS.IN_PROGRESS)
                }
              >
                ✗ Incomplete
              </button>
            </div>
            {pending && (
              <p className="ms-pending-note">
                ⏳ Awaiting admin verification
              </p>
            )}
          </div>
        )}

        {/* Admin controls */}
        {role === "admin" && !verified && pending && (
          <div className="ms-admin-controls">
            <button
              className="ms-verify-btn"
              onClick={() => onApprove(milestone)}
            >
              <span className="material-symbols-outlined">verified</span>
              Verify & Release Payment
            </button>
          </div>
        )}

        {verified && (
          <div className="ms-verified-badge">
            <span className="material-symbols-outlined">lock</span>
            Verified — Payment Released
          </div>
        )}

        {/* Image upload */}
        {role === "farmer" && !verified && (
          <div
            className="ms-image-area"
            onClick={() => fileRef.current?.click()}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="milestone" className="ms-preview" />
            ) : (
              <div className="ms-image-placeholder">
                <span className="material-symbols-outlined">add_photo_alternate</span>
                <span>{uploading ? "Uploading…" : "Add supporting photo"}</span>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleImageUpload(e.target.files[0])}
            />
          </div>
        )}

        {/* Show image for admin if farmer uploaded */}
        {role === "admin" && imagePreview && (
          <img src={imagePreview} alt="milestone" className="ms-preview" />
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const CropStageSection = ({
  activeCycle,
  cycleMilestones,
  availableCrops,
  role,
  farmId,
  onStatusChange,
  onApprove,
}) => {
  const [stageInputs, setStageInputs] = useState({});
  const [loadingStages, setLoadingStages] = useState(false);

  // Determine if active crop is wheat
  const cropName =
    availableCrops.find((c) => c.id === activeCycle?.crop_id)?.name || "";
  const isWheat = cropName.toLowerCase().includes("wheat");

  // Sowing date for DAS auto-calculation
  const sowingInput = stageInputs["sowing"];
  const sowingDate = sowingInput?.stage_date || null;

  // Fetch existing stage inputs for this cycle
  useEffect(() => {
    if (!activeCycle?.id) return;
    const fetch = async () => {
      setLoadingStages(true);
      const { data, error } = await supabase
        .from("growth_stage_inputs")
        .select("*")
        .eq("crop_cycle_id", activeCycle.id);
      if (!error && data) {
        const map = {};
        data.forEach((row) => {
          map[row.stage_name] = row;
        });
        setStageInputs(map);
      }
      setLoadingStages(false);
    };
    fetch();
  }, [activeCycle?.id]);

  if (!activeCycle) return null;

  return (
    <div className="crop-stage-section">
      <div className="crop-stage-hero">
        <div>
          <h2 className="crop-stage-title">
            Ongoing Cycle:{" "}
            <span className="crop-name">{cropName || "Unknown Crop"}</span>
          </h2>
          <p className="crop-stage-subtitle">
            Record your field activities and track payable milestones
          </p>
        </div>
      </div>

      {/* ── Section 1: Farmer Inputs ── */}
      {isWheat && (
        <div className="cs-panel">
          <div className="cs-panel-header">
            <span className="cs-panel-icon material-symbols-outlined">
              grass
            </span>
            <div>
              <h3>Farmer Input Log</h3>
              <p>Record inputs and activities at each growth stage</p>
            </div>
          </div>

          {loadingStages ? (
            <div className="cs-loading">Loading stage data…</div>
          ) : (
            <div className="stage-cards-list">
              {WHEAT_STAGES.map((stage) => (
                <StageCard
                  key={stage.key}
                  stage={stage}
                  cycleId={activeCycle.id}
                  existingData={stageInputs[stage.key]}
                  sowingDate={sowingDate}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!isWheat && (
        <div className="cs-panel">
          <div className="cs-panel-header">
            <span className="cs-panel-icon material-symbols-outlined">
              grass
            </span>
            <div>
              <h3>Farmer Input Log</h3>
              <p>Stage tracking is currently available for Wheat crops only</p>
            </div>
          </div>
          <div className="cs-empty">
            <span className="material-symbols-outlined">info</span>
            <p>Switch to a Wheat crop cycle to use the farmer input log.</p>
          </div>
        </div>
      )}

      {/* ── Section 2: Milestones Achieved ── */}
      <div className="cs-panel">
        <div className="cs-panel-header">
          <span className="cs-panel-icon material-symbols-outlined">
            workspace_premium
          </span>
          <div>
            <h3>Milestones Achieved</h3>
            <p>These 3 checkpoints are verified by an admin for payment release</p>
          </div>
        </div>

        {cycleMilestones.length === 0 ? (
          <div className="cs-empty">
            <span className="material-symbols-outlined">assignment</span>
            <p>No milestones found for this cycle.</p>
          </div>
        ) : (
          <div className="milestone-cards-grid">
            {cycleMilestones.map((ms) => (
              <MilestoneCard
                key={ms.id}
                milestone={ms}
                role={role}
                cycleId={activeCycle.id}
                onStatusChange={onStatusChange}
                onApprove={onApprove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CropStageSection;
