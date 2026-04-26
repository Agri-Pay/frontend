// src/MilestoneVerificationPanel.jsx
import React, { useMemo } from "react";
import "./MilestoneVerificationPanel.css";
import DroneImagerySection from "./DroneImagerySection";

// ── Wheat milestone-specific expected ranges ──────────────────────────────
// Mirrors wheat_thresholds.py in the backend (Punjab Pakistan, Rabi season).
// Key: lowercased, underscored milestone name
const WHEAT_THRESHOLDS = {
  sowing: {
    ndvi:         { label: "NDVI",          range: [0.06, 0.20], unit: "" },
    savi:         { label: "SAVI",          range: [0.04, 0.16], unit: "" },
    soil_temp:    { label: "Soil Temp",     range: [18,   28],   unit: "°C" },
    soil_moisture:{ label: "Soil Moisture", range: [28,   55],   unit: "%" },
  },
  tillering: {
    ndvi:         { label: "NDVI",          range: [0.35, 0.62], unit: "" },
    savi:         { label: "SAVI",          range: [0.26, 0.50], unit: "" },
    lai:          { label: "LAI",           range: [0.8,  3.0],  unit: "" },
    soil_temp:    { label: "Soil Temp",     range: [10,   20],   unit: "°C" },
    soil_moisture:{ label: "Soil Moisture", range: [30,   55],   unit: "%" },
  },
  grain_filling_and_ripening: {
    ndvi:         { label: "NDVI",          range: [0.40, 0.82], unit: "" },
    lai:          { label: "LAI",           range: [2.0,  7.0],  unit: "" },
    ndmi:         { label: "NDMI",          range: [-0.05, 0.50],unit: "" },
    soil_temp:    { label: "Soil Temp",     range: [15,   30],   unit: "°C" },
    soil_moisture:{ label: "Soil Moisture", range: [20,   52],   unit: "%" },
  },
};

// Normalize milestone name to threshold key
function toThresholdKey(milestoneName) {
  return (milestoneName || "").toLowerCase().replace(/ /g, "_");
}

// ── Utility helpers ───────────────────────────────────────────────
const isValid = (v) =>
  v !== null && v !== undefined && !isNaN(v) && isFinite(v);

const fmt = (v, d = 3) =>
  isValid(v) ? Number(v).toFixed(d) : "N/A";

// ── Health Index computation ─────────────────────────────────────
function computeHealthIndex({ sentinelStats, soil }) {
  const entries = [];

  // NDVI  (weight 0.30) — range [0, 1]
  const ndvi = sentinelStats?.ndvi?.mean;
  if (isValid(ndvi)) {
    const s =
      ndvi >= 0.5
        ? 100
        : ndvi >= 0.3
        ? ((ndvi - 0.3) / 0.2) * 40 + 60
        : Math.max(0, (ndvi / 0.3) * 60);
    entries.push({ label: "NDVI", score: s, weight: 0.3, value: fmt(ndvi), icon: "eco" });
  }

  // SAVI  (weight 0.20) — range [-0.2, 1.5]
  const savi = sentinelStats?.savi?.mean;
  if (isValid(savi)) {
    const s =
      savi >= 0.4
        ? 100
        : savi >= 0.2
        ? ((savi - 0.2) / 0.2) * 40 + 60
        : Math.max(0, (savi / 0.2) * 60);
    entries.push({ label: "SAVI", score: s, weight: 0.2, value: fmt(savi), icon: "grass" });
  }

  // LAI   (weight 0.15) — range [0, 8]
  const lai = sentinelStats?.lai?.mean;
  if (isValid(lai)) {
    const s =
      lai >= 3
        ? 100
        : lai >= 1.5
        ? ((lai - 1.5) / 1.5) * 40 + 60
        : Math.max(0, (lai / 1.5) * 60);
    entries.push({ label: "LAI", score: s, weight: 0.15, value: fmt(lai, 2), icon: "nature" });
  }

  // NDMI  (weight 0.15) — range [-0.5, 0.5]
  const ndmi = sentinelStats?.moisture?.mean;
  if (isValid(ndmi)) {
    const s =
      ndmi >= 0.1
        ? 100
        : ndmi >= -0.1
        ? ((ndmi + 0.1) / 0.2) * 40 + 60
        : Math.max(0, ((ndmi + 0.5) / 0.4) * 60);
    entries.push({ label: "NDMI", score: s, weight: 0.15, value: fmt(ndmi), icon: "water_drop" });
  }

  // Soil Moisture (weight 0.10) — optimal 30–60 %
  const sm = soil?.moisture;
  if (isValid(sm)) {
    const s =
      sm >= 0.3 && sm <= 0.6
        ? 100
        : sm < 0.3
        ? Math.max(0, (sm / 0.3) * 80)
        : Math.max(0, 100 - ((sm - 0.6) / 0.4) * 60);
    entries.push({
      label: "Soil Moisture",
      score: s,
      weight: 0.1,
      value: `${(sm * 100).toFixed(1)}%`,
      icon: "water",
    });
  }

  // Soil Temp (weight 0.10) — optimal 15–28 °C
  const tk = soil?.t10;
  if (isValid(tk)) {
    const tc = tk - 273.15;
    const s =
      tc >= 15 && tc <= 28
        ? 100
        : tc < 15
        ? Math.max(0, ((tc - 0) / 15) * 100)
        : Math.max(0, 100 - ((tc - 28) / 15) * 100);
    entries.push({
      label: "Soil Temp",
      score: s,
      weight: 0.1,
      value: `${Math.round(tc)}°C`,
      icon: "device_thermostat",
    });
  }

  if (entries.length === 0) return null;

  const totalWeight = entries.reduce((acc, e) => acc + e.weight, 0);
  const weighted = entries.reduce((acc, e) => acc + e.score * e.weight, 0);
  const score = Math.round(weighted / totalWeight);

  const level =
    score >= 70 ? "Healthy" : score >= 45 ? "Moderate Risk" : "Unhealthy";
  const color =
    score >= 70 ? "#22c55e" : score >= 45 ? "#eab308" : "#ef4444";
  const bgColor =
    score >= 70 ? "#f0fdf4" : score >= 45 ? "#fefce8" : "#fef2f2";

  return { score, level, color, bgColor, breakdown: entries };
}

// ── Score bar sub-component ──────────────────────────────────────
function ScoreBar({ score, color }) {
  return (
    <div className="mvp-score-bar-track">
      <div
        className="mvp-score-bar-fill"
        style={{ width: `${score}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Metric mini-card ─────────────────────────────────────────────
function MetricCard({ icon, label, value, badge, badgeColor }) {
  return (
    <div className="mvp-metric-card">
      <span className="material-symbols-outlined mvp-metric-icon">{icon}</span>
      <div className="mvp-metric-body">
        <p className="mvp-metric-label">{label}</p>
        <p className="mvp-metric-value">{value}</p>
        {badge && (
          <span
            className="mvp-metric-badge"
            style={{ backgroundColor: badgeColor }}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Verification breakdown component ────────────────────────────
// Renders per-source confidence bars + metric range table
// from the result returned by /api/v1/verify-milestone.
function VerificationBreakdown({ result, milestoneName }) {
  if (!result) return null;

  const thresholdKey = toThresholdKey(milestoneName);
  const thresholds  = WHEAT_THRESHOLDS[thresholdKey] || {};

  // Source confidence bars
  const sources = [
    {
      key:    "satellite",
      label:  "Satellite",
      icon:   "satellite_alt",
      data:   result.satellite_analysis,
    },
    {
      key:    "iot",
      label:  "IoT Sensors",
      icon:   "sensors",
      data:   result.iot_analysis,
    },
    {
      key:    "farmer_input",
      label:  "Farmer Input",
      icon:   "assignment_ind",
      data:   result.farmer_input_analysis,
    },
    {
      key:    "drone",
      label:  "Drone",
      icon:   "flight",
      data:   result.drone_analysis,
    },
  ];

  // Build metric rows to show actual vs expected ranges
  const metricRows = [];

  // From satellite analysis
  const sat = result.satellite_analysis || {};
  if (isValid(sat.ndvi_current) && thresholds.ndvi) {
    const { range } = thresholds.ndvi;
    const inRange = sat.ndvi_current >= range[0] && sat.ndvi_current <= range[1];
    metricRows.push({
      source: "Satellite",
      label: "NDVI",
      value: fmt(sat.ndvi_current),
      range: `${range[0].toFixed(2)} – ${range[1].toFixed(2)}`,
      inRange,
    });
  }
  if (isValid(sat.savi_current) && thresholds.savi) {
    const { range } = thresholds.savi;
    const inRange = sat.savi_current >= range[0] && sat.savi_current <= range[1];
    metricRows.push({
      source: "Satellite",
      label: "SAVI",
      value: fmt(sat.savi_current),
      range: `${range[0].toFixed(2)} – ${range[1].toFixed(2)}`,
      inRange,
    });
  }
  if (isValid(sat.lai_current) && thresholds.lai) {
    const { range } = thresholds.lai;
    const inRange = sat.lai_current >= range[0] && sat.lai_current <= range[1];
    metricRows.push({
      source: "Satellite",
      label: "LAI",
      value: fmt(sat.lai_current, 2),
      range: `${range[0]} – ${range[1]}`,
      inRange,
    });
  }
  if (isValid(sat.ndmi_current) && thresholds.ndmi) {
    const { range } = thresholds.ndmi;
    const inRange = sat.ndmi_current >= range[0] && sat.ndmi_current <= range[1];
    metricRows.push({
      source: "Satellite",
      label: "NDMI",
      value: fmt(sat.ndmi_current),
      range: `${range[0].toFixed(2)} – ${range[1].toFixed(2)}`,
      inRange,
    });
  }

  // From IoT analysis
  const iot = result.iot_analysis || {};
  const sensorMeans = iot.sensor_means || {};
  if (isValid(sensorMeans.soil_temperature) && thresholds.soil_temp) {
    const { range } = thresholds.soil_temp;
    const v = sensorMeans.soil_temperature;
    metricRows.push({
      source: "IoT",
      label: "Soil Temp",
      value: `${fmt(v, 1)}°C`,
      range: `${range[0]}–${range[1]}°C`,
      inRange: v >= range[0] && v <= range[1],
    });
  }
  if (isValid(sensorMeans.soil_moisture) && thresholds.soil_moisture) {
    const { range } = thresholds.soil_moisture;
    const v = sensorMeans.soil_moisture;
    metricRows.push({
      source: "IoT",
      label: "Soil Moisture",
      value: `${fmt(v, 1)}%`,
      range: `${range[0]}–${range[1]}%`,
      inRange: v >= range[0] && v <= range[1],
    });
  }

  // From farmer input analysis
  const fi = result.farmer_input_analysis || {};
  if (fi.stages_required) {
    fi.stages_required.forEach((stage) => {
      const filled = (fi.stages_found || []).includes(stage);
      metricRows.push({
        source: "Farmer",
        label: stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value: filled ? "Filled ✓" : "Missing ✗",
        range: "Required",
        inRange: filled,
      });
    });
  }

  // From drone analysis
  const drone = result.drone_analysis || {};
  if (isValid(drone.ndvi_mean)) {
    const dKey = thresholdKey === "sowing" ? [0.04, 0.20] :
                 thresholdKey === "tillering" ? [0.32, 0.62] : [0.35, 0.82];
    metricRows.push({
      source: "Drone",
      label: "NDVI (layer)",
      value: fmt(drone.ndvi_mean),
      range: `${dKey[0].toFixed(2)} – ${dKey[1].toFixed(2)}`,
      inRange: drone.ndvi_mean >= dKey[0] && drone.ndvi_mean <= dKey[1],
    });
  }

  return (
    <div className="mvp-verification-breakdown">
      {/* Per-source confidence bars */}
      <div className="mvp-source-bars">
        {sources.map(({ key, label, icon, data }) => {
          const conf  = data?.confidence;
          const status = data?.status;
          const hasData = status === "ANALYZED" && isValid(conf);
          const pct   = hasData ? Math.round(conf * 100) : 0;
          const color = pct >= 75 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";
          return (
            <div key={key} className="mvp-source-bar-row">
              <span className="material-symbols-outlined mvp-source-icon">{icon}</span>
              <span className="mvp-source-label">{label}</span>
              <div className="mvp-source-bar-track">
                {hasData ? (
                  <div
                    className="mvp-source-bar-fill"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                ) : (
                  <div className="mvp-source-bar-nodata" />
                )}
              </div>
              <span className="mvp-source-pct" style={{ color: hasData ? color : "#94a3b8" }}>
                {hasData ? `${pct}%` : "No data"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Metric range table */}
      {metricRows.length > 0 && (
        <div className="mvp-metric-table">
          <div className="mvp-metric-table-header">
            <span>Source</span>
            <span>Metric</span>
            <span>Value</span>
            <span>Expected Range</span>
            <span>Status</span>
          </div>
          {metricRows.map((row, i) => (
            <div key={i} className="mvp-metric-table-row">
              <span className="mvp-mtr-source">{row.source}</span>
              <span className="mvp-mtr-label">{row.label}</span>
              <span className="mvp-mtr-value">{row.value}</span>
              <span className="mvp-mtr-range">{row.range}</span>
              <span
                className="mvp-mtr-badge"
                style={{
                  backgroundColor: row.inRange ? "#dcfce7" : "#fee2e2",
                  color:           row.inRange ? "#16a34a" : "#dc2626",
                }}
              >
                {row.inRange ? "In Range" : "Out of Range"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────
const MilestoneVerificationPanel = ({
  isOpen,
  onClose,
  onApprove,
  onReject,
  milestone,
  farm,
  sentinelStats,
  soil,
  currentWeather,
  uvi,
  farmId,
  availableCrops,
  activeCycle,
  // ML verification props (passed-through)
  verificationResult,
  verificationLoading,
  verificationError,
  onRunVerification,
}) => {
  const healthIndex = useMemo(
    () => computeHealthIndex({ sentinelStats, soil }),
    [sentinelStats, soil]
  );

  if (!isOpen || !milestone) return null;

  const milestoneName =
    milestone.milestone_templates?.name || "Milestone";
  const sequence = milestone.milestone_templates?.sequence;
  const submittedAt = milestone.updated_at
    ? new Date(milestone.updated_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  const cropName =
    availableCrops?.find((c) => c.id === activeCycle?.crop_id)?.name || "—";

  // Score arc degrees for gauge visualization
  const arcDeg = healthIndex ? Math.round((healthIndex.score / 100) * 180) : 0;

  return (
    <>
      {/* Backdrop */}
      <div className="mvp-backdrop" onClick={onClose} />

      {/* Panel */}
      <aside className="mvp-panel">
        {/* ── Header ── */}
        <div className="mvp-header">
          <div className="mvp-header-left">
            {sequence && (
              <span className="mvp-seq-badge">Stage {sequence}</span>
            )}
            <h2 className="mvp-title">{milestoneName}</h2>
          </div>
          <button className="mvp-close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="mvp-body">

          {/* ── Milestone Meta ── */}
          <section className="mvp-section">
            <div className="mvp-section-header">
              <span className="material-symbols-outlined">assignment</span>
              Milestone Details
            </div>
            <div className="mvp-meta-row">
              <div className="mvp-meta-item">
                <span className="mvp-meta-label">Submitted</span>
                <span className="mvp-meta-val">{submittedAt}</span>
              </div>
              <div className="mvp-meta-item">
                <span className="mvp-meta-label">Crop</span>
                <span className="mvp-meta-val">{cropName}</span>
              </div>
              <div className="mvp-meta-item">
                <span className="mvp-meta-label">Farm</span>
                <span className="mvp-meta-val">{farm?.name || "—"}</span>
              </div>
              <div className="mvp-meta-item">
                <span className="mvp-meta-label">Farm Size</span>
                <span className="mvp-meta-val">
                  {farm?.area_hectares ? `${farm.area_hectares} ha` : "—"}
                </span>
              </div>
            </div>
          </section>

          {/* ── Health Index ── */}
          <section className="mvp-section">
            <div className="mvp-section-header">
              <span className="material-symbols-outlined">monitor_heart</span>
              Crop Health Index
            </div>
            <p className="mvp-section-note">
              General crop health based on live satellite data — not milestone-specific.
              Run Verification below for milestone-specific analysis.
            </p>

            {healthIndex ? (
              <div
                className="mvp-health-card"
                style={{
                  borderColor: healthIndex.color,
                  backgroundColor: healthIndex.bgColor,
                }}
              >
                {/* Gauge */}
                <div className="mvp-gauge-wrap">
                  <div className="mvp-gauge">
                    <svg viewBox="0 0 120 70" className="mvp-gauge-svg">
                      {/* Background arc */}
                      <path
                        d="M 10 60 A 50 50 0 0 1 110 60"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="10"
                        strokeLinecap="round"
                      />
                      {/* Foreground arc */}
                      <path
                        d="M 10 60 A 50 50 0 0 1 110 60"
                        fill="none"
                        stroke={healthIndex.color}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${(arcDeg / 180) * 157} 157`}
                      />
                    </svg>
                    <div className="mvp-gauge-center">
                      <span
                        className="mvp-gauge-score"
                        style={{ color: healthIndex.color }}
                      >
                        {healthIndex.score}
                      </span>
                      <span className="mvp-gauge-of">/100</span>
                    </div>
                  </div>
                  <span
                    className="mvp-health-verdict"
                    style={{ color: healthIndex.color }}
                  >
                    {healthIndex.level}
                  </span>
                </div>

                {/* Breakdown */}
                <div className="mvp-breakdown">
                  {healthIndex.breakdown.map((e) => (
                    <div key={e.label} className="mvp-breakdown-row">
                      <span className="material-symbols-outlined mvp-bi-icon">
                        {e.icon}
                      </span>
                      <span className="mvp-bi-label">{e.label}</span>
                      <ScoreBar
                        score={e.score}
                        color={
                          e.score >= 70
                            ? "#22c55e"
                            : e.score >= 45
                            ? "#eab308"
                            : "#ef4444"
                        }
                      />
                      <span className="mvp-bi-val">{e.value}</span>
                      <span
                        className="mvp-bi-score"
                        style={{
                          color:
                            e.score >= 70
                              ? "#22c55e"
                              : e.score >= 45
                              ? "#eab308"
                              : "#ef4444",
                        }}
                      >
                        {Math.round(e.score)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mvp-no-data">
                <span className="material-symbols-outlined">info</span>
                Satellite data is still loading — the Health Index will appear
                once metrics are available.
              </p>
            )}
          </section>

          {/* ── Vegetation Metrics ── */}
          <section className="mvp-section">
            <div className="mvp-section-header">
              <span className="material-symbols-outlined">grass</span>
              Vegetation Indices
            </div>
            <div className="mvp-metrics-grid">
              <MetricCard
                icon="eco"
                label="NDVI"
                value={fmt(sentinelStats?.ndvi?.mean)}
                badge={
                  isValid(sentinelStats?.ndvi?.mean)
                    ? sentinelStats.ndvi.mean > 0.5
                      ? "Healthy"
                      : sentinelStats.ndvi.mean > 0.3
                      ? "Moderate"
                      : "Low"
                    : null
                }
                badgeColor={
                  isValid(sentinelStats?.ndvi?.mean)
                    ? sentinelStats.ndvi.mean > 0.5
                      ? "#22c55e"
                      : sentinelStats.ndvi.mean > 0.3
                      ? "#eab308"
                      : "#ef4444"
                    : "#94a3b8"
                }
              />
              <MetricCard
                icon="grass"
                label="SAVI"
                value={fmt(sentinelStats?.savi?.mean)}
                badge={
                  isValid(sentinelStats?.savi?.mean)
                    ? sentinelStats.savi.mean > 0.4
                      ? "Good"
                      : sentinelStats.savi.mean > 0.2
                      ? "Fair"
                      : "Poor"
                    : null
                }
                badgeColor={
                  isValid(sentinelStats?.savi?.mean)
                    ? sentinelStats.savi.mean > 0.4
                      ? "#22c55e"
                      : sentinelStats.savi.mean > 0.2
                      ? "#eab308"
                      : "#ef4444"
                    : "#94a3b8"
                }
              />
              <MetricCard
                icon="nature"
                label="LAI"
                value={fmt(sentinelStats?.lai?.mean, 2)}
                badge={
                  isValid(sentinelStats?.lai?.mean)
                    ? sentinelStats.lai.mean > 3
                      ? "Dense"
                      : sentinelStats.lai.mean > 1.5
                      ? "Growing"
                      : "Sparse"
                    : null
                }
                badgeColor={
                  isValid(sentinelStats?.lai?.mean)
                    ? sentinelStats.lai.mean > 3
                      ? "#22c55e"
                      : sentinelStats.lai.mean > 1.5
                      ? "#eab308"
                      : "#ef4444"
                    : "#94a3b8"
                }
              />
              <MetricCard
                icon="water_drop"
                label="NDMI (Moisture)"
                value={fmt(sentinelStats?.moisture?.mean)}
                badge={
                  isValid(sentinelStats?.moisture?.mean)
                    ? sentinelStats.moisture.mean > 0.1
                      ? "Adequate"
                      : sentinelStats.moisture.mean > -0.1
                      ? "Normal"
                      : "Dry"
                    : null
                }
                badgeColor={
                  isValid(sentinelStats?.moisture?.mean)
                    ? sentinelStats.moisture.mean > 0.1
                      ? "#3b82f6"
                      : sentinelStats.moisture.mean > -0.1
                      ? "#eab308"
                      : "#ef4444"
                    : "#94a3b8"
                }
              />
            </div>
          </section>

          {/* ── Soil & Weather ── */}
          <section className="mvp-section">
            <div className="mvp-section-header">
              <span className="material-symbols-outlined">sensors</span>
              Soil &amp; Atmospheric Conditions
            </div>
            <div className="mvp-metrics-grid">
              <MetricCard
                icon="device_thermostat"
                label="Soil Temperature"
                value={
                  isValid(soil?.t10) ? `${Math.round(soil.t10 - 273.15)}°C` : "N/A"
                }
              />
              <MetricCard
                icon="water"
                label="Soil Moisture"
                value={
                  isValid(soil?.moisture)
                    ? `${(soil.moisture * 100).toFixed(1)}%`
                    : "N/A"
                }
              />
              <MetricCard
                icon="humidity_percentage"
                label="Air Humidity"
                value={
                  isValid(currentWeather?.main?.humidity)
                    ? `${currentWeather.main.humidity}%`
                    : "N/A"
                }
              />
              <MetricCard
                icon="air"
                label="Wind Speed"
                value={
                  isValid(currentWeather?.wind?.speed)
                    ? `${currentWeather.wind.speed.toFixed(1)} m/s`
                    : "N/A"
                }
              />
              <MetricCard
                icon="wb_sunny"
                label="UV Index"
                value={
                  isValid(uvi?.uvi) ? uvi.uvi.toFixed(1) : "N/A"
                }
                badge={
                  isValid(uvi?.uvi)
                    ? uvi.uvi <= 2
                      ? "Low"
                      : uvi.uvi <= 5
                      ? "Moderate"
                      : uvi.uvi <= 7
                      ? "High"
                      : "Very High"
                    : null
                }
                badgeColor={
                  isValid(uvi?.uvi)
                    ? uvi.uvi <= 2
                      ? "#22c55e"
                      : uvi.uvi <= 5
                      ? "#eab308"
                      : "#ef4444"
                    : "#94a3b8"
                }
              />
            </div>
          </section>

          {/* ── Drone Imagery ── */}
          <section className="mvp-section">
            <div className="mvp-section-header">
              <span className="material-symbols-outlined">flight</span>
              Drone Imagery
            </div>
            <div className="mvp-drone-wrap">
              <DroneImagerySection
                farmId={farmId}
                cropType={cropName?.toLowerCase() || null}
              />
            </div>
          </section>

          {/* ── ML Analysis ── */}
          <section className="mvp-section">
            <div className="mvp-section-header">
              <span className="material-symbols-outlined">smart_toy</span>
              ML Analysis Tools
            </div>

            {/* ML verification (existing capability) */}
            <div className="mvp-ml-primary">
              <div className="mvp-ml-primary-info">
                <span className="material-symbols-outlined">verified</span>
                <div>
                  <p className="mvp-ml-title">Automated Milestone Verification</p>
                  <p className="mvp-ml-sub">
                    Run the ML model to cross-check submitted evidence against
                    satellite and historical crop data.
                  </p>
                </div>
              </div>
              <button
                className="mvp-run-btn"
                onClick={onRunVerification}
                disabled={verificationLoading}
              >
                {verificationLoading ? (
                  <>
                    <span className="mvp-spinner" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">play_arrow</span>
                    Run Verification
                  </>
                )}
              </button>

              {verificationError && (
                <p className="mvp-ml-error">
                  <span className="material-symbols-outlined">error</span>
                  {verificationError}
                </p>
              )}

              {verificationResult && (
                <div
                  className={`mvp-ml-result ${
                    verificationResult.verdict === "MILESTONE_COMPLETE"
                      ? "mvp-ml-pass"
                      : "mvp-ml-fail"
                  }`}
                >
                  <span className="material-symbols-outlined">
                    {verificationResult.verdict === "MILESTONE_COMPLETE"
                      ? "check_circle"
                      : "cancel"}
                  </span>
                  <div>
                    <p className="mvp-ml-verdict">
                      {verificationResult.verdict === "MILESTONE_COMPLETE"
                        ? "Milestone Passed"
                        : verificationResult.verdict === "MANUAL_REVIEW_REQUIRED"
                        ? "Manual Review Required"
                        : "Milestone Failed"}
                    </p>
                    {verificationResult.overall_confidence && (
                      <p className="mvp-ml-confidence">
                        Confidence: {(verificationResult.overall_confidence * 100).toFixed(0)}%
                      </p>
                    )}
                    {verificationResult.recommendation && (
                      <p className="mvp-ml-rec">{verificationResult.recommendation}</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Wheat verification metrics breakdown ── */}
              {verificationResult && (
                <div className="mvp-breakdown-section">
                  <p className="mvp-breakdown-title">
                    <span className="material-symbols-outlined">bar_chart</span>
                    Verification Breakdown
                  </p>
                  <VerificationBreakdown
                    result={verificationResult}
                    milestoneName={milestoneName}
                  />
                </div>
              )}
            </div>

            {/* Future ML tools */}
            <p className="mvp-ml-coming-label">More tools coming soon</p>
            <div className="mvp-ml-tools">
              {[
                { icon: "coronavirus", label: "Disease Detection", desc: "Identify leaf diseases and pest damage from imagery" },
                { icon: "agriculture", label: "Yield Estimation", desc: "Predict expected harvest yield based on crop data" },
                { icon: "analytics", label: "Anomaly Detection", desc: "Flag unusual patterns in vegetation indices" },
              ].map((tool) => (
                <div key={tool.label} className="mvp-tool-card mvp-tool-disabled">
                  <span className="material-symbols-outlined mvp-tool-icon">{tool.icon}</span>
                  <div>
                    <p className="mvp-tool-name">{tool.label}</p>
                    <p className="mvp-tool-desc">{tool.desc}</p>
                  </div>
                  <span className="mvp-coming-chip">Coming Soon</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Action Bar ── */}
        <div className="mvp-action-bar">
          <button className="mvp-reject-btn" onClick={onReject}>
            <span className="material-symbols-outlined">cancel</span>
            Reject Milestone
          </button>
          <button className="mvp-approve-btn" onClick={onApprove}>
            <span className="material-symbols-outlined">check_circle</span>
            Approve &amp; Verify
          </button>
        </div>
      </aside>
    </>
  );
};

export default MilestoneVerificationPanel;
