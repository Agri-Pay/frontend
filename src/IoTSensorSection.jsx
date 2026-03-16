// src/IoTSensorSection.jsx
// Component for displaying IoT sensor data from ThingsBoard

import React, { useState, useEffect, useCallback } from "react";
import { getFarmIoTData, getTelemetryHistory } from "./thingsboard";
import { Line } from "react-chartjs-2";
import "./iotsensor.css";

const IoTSensorSection = ({ farmId }) => {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [historyData, setHistoryData] = useState(null);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [historyDays, setHistoryDays] = useState(7);

    // Fetch all devices and their latest readings
    const fetchData = useCallback(async () => {
        if (!farmId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getFarmIoTData(farmId);
            setDevices(data);
            if (data.length > 0 && !selectedDevice) {
                setSelectedDevice(data[0]);
            }
        } catch (err) {
            console.error("Error fetching IoT data:", err);
            setError("Failed to load IoT sensor data");
        } finally {
            setLoading(false);
        }
    }, [farmId, selectedDevice]);

    // Fetch historical data for selected device
    const fetchHistory = useCallback(async () => {
        if (!selectedDevice) return;
        const endTs = Date.now();
        const startTs = endTs - historyDays * 24 * 60 * 60 * 1000;
        try {
            const history = await getTelemetryHistory(
                selectedDevice.device_id,
                ["soilMoisture_%"],
                startTs,
                endTs
            );
            setHistoryData(history);
        } catch (err) {
            console.error("Error fetching history:", err);
        }
    }, [selectedDevice, historyDays]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { fetchHistory(); }, [fetchHistory]);

    // Format timestamp to relative time
    const formatTime = (ts) => {
        if (!ts) return "N/A";
        const diffMins = Math.floor((Date.now() - ts) / 60000);
        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return new Date(ts).toLocaleDateString();
    };

    // Moisture level label helper
    const moistureLabel = (val) => {
        if (val === undefined || val === null) return null;
        if (val < 20) return { text: "Dry", color: "#ef4444" };
        if (val < 40) return { text: "Low", color: "#f59e0b" };
        if (val < 70) return { text: "Good", color: "#22c55e" };
        return { text: "High", color: "#3b82f6" };
    };

    const chartData = historyData?.["soilMoisture_%"]
        ? {
            labels: historyData["soilMoisture_%"]
                .map((d) => new Date(d.ts).toLocaleDateString())
                .reverse(),
            datasets: [{
                label: "Soil Moisture %",
                data: historyData["soilMoisture_%"].map((d) => parseFloat(d.value)).reverse(),
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59, 130, 246, 0.08)",
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                pointBackgroundColor: "#3b82f6",
            }],
        }
        : null;

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: {
                beginAtZero: true,
                max: 100,
                ticks: { font: { size: 11 } },
                grid: { color: "rgba(0,0,0,0.04)" },
                title: { display: true, text: "Moisture %", font: { size: 11 } },
            },
            x: {
                ticks: { font: { size: 10 }, maxRotation: 30 },
                grid: { display: false },
            },
        },
    };

    // ── Loading state ───────────────────────────────────────────
    if (loading && devices.length === 0) {
        return (
            <div className="data-card iot-loading-card">
                <h3>
                    <span className="material-symbols-outlined" style={{ color: "#3b82f6", marginRight: 6, fontSize: "1.1rem", verticalAlign: "middle" }}>sensors</span>
                    IoT Sensors
                </h3>
                <p className="data-unavailable" style={{ marginTop: "1rem" }}>
                    <span className="material-symbols-outlined">refresh</span>
                    Loading sensor data…
                </p>
            </div>
        );
    }

    // ── Error state ─────────────────────────────────────────────
    if (error) {
        return (
            <div className="data-card iot-error-card">
                <h3>
                    <span className="material-symbols-outlined" style={{ color: "#3b82f6", marginRight: 6, fontSize: "1.1rem", verticalAlign: "middle" }}>sensors</span>
                    IoT Sensors
                </h3>
                <p className="data-unavailable" style={{ marginTop: "1rem" }}>
                    <span className="material-symbols-outlined">error</span>
                    {error}
                </p>
            </div>
        );
    }

    // ── Empty state ─────────────────────────────────────────────
    if (devices.length === 0) {
        return (
            <div className="data-card iot-empty-card">
                <h3>
                    <span className="material-symbols-outlined" style={{ color: "#3b82f6", marginRight: 6, fontSize: "1.1rem", verticalAlign: "middle" }}>sensors</span>
                    IoT Sensors
                </h3>
                <p className="data-unavailable" style={{ marginTop: "1rem" }}>
                    <span className="material-symbols-outlined">sensors_off</span>
                    No IoT sensors linked to this farm
                </p>
            </div>
        );
    }

    // ── Has devices ─────────────────────────────────────────────
    return (
        <>
            {/* One data-card per device */}
            {devices.map((device) => {
                const moisture = device.telemetry?.["soilMoisture_%"];
                const temp = device.telemetry?.temperature;
                const label = moistureLabel(moisture);
                const isSelected = selectedDevice?.device_id === device.device_id;

                return (
                    <div
                        key={device.device_id}
                        className={`data-card iot-device-data-card ${isSelected ? "iot-card-selected" : ""}`}
                        onClick={() => setSelectedDevice(device)}
                        style={{ cursor: "pointer" }}
                    >
                        {/* Card header */}
                        <div className="iot-card-header-row">
                            <h3>
                                <span className="material-symbols-outlined" style={{ color: "#3b82f6", marginRight: 6, fontSize: "1.1rem", verticalAlign: "middle" }}>sensors</span>
                                {device.device_name}
                            </h3>
                            <span className="iot-online-dot" title="Device online" />
                        </div>
                        <p className="card-subtitle" style={{ marginBottom: "1rem" }}>
                            Last reading: {formatTime(device.telemetry?.["soilMoisture_%_ts"])}
                        </p>

                        {device.telemetry ? (
                            <div className="iot-metrics">
                                {/* Soil Moisture */}
                                <div className="metric-item">
                                    <span
                                        className="material-symbols-outlined metric-icon"
                                        style={{ backgroundColor: "#eff6ff", color: "#3b82f6" }}
                                    >
                                        water_drop
                                    </span>
                                    <div style={{ flex: 1 }}>
                                        <p className="metric-label">Soil Moisture</p>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <p className="metric-value">
                                                {moisture !== undefined ? `${moisture.toFixed(1)}%` : "—"}
                                            </p>
                                            {label && (
                                                <span
                                                    className="veg-badge"
                                                    style={{ backgroundColor: label.color, fontSize: "0.65rem" }}
                                                >
                                                    {label.text}
                                                </span>
                                            )}
                                        </div>
                                        {/* Moisture bar */}
                                        {moisture !== undefined && (
                                            <div className="iot-moisture-bar-track">
                                                <div
                                                    className="iot-moisture-bar-fill"
                                                    style={{
                                                        width: `${Math.min(moisture, 100)}%`,
                                                        backgroundColor: label?.color || "#3b82f6",
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Temperature */}
                                {temp !== undefined && (
                                    <div className="metric-item" style={{ marginBottom: 0 }}>
                                        <span
                                            className="material-symbols-outlined metric-icon"
                                            style={{ backgroundColor: "#fef3c7", color: "#d97706" }}
                                        >
                                            device_thermostat
                                        </span>
                                        <div>
                                            <p className="metric-label">Temperature</p>
                                            <p className="metric-value">{temp}°C</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="data-unavailable">
                                <span className="material-symbols-outlined">sensors_off</span>
                                No telemetry data
                            </p>
                        )}

                        {isSelected && (
                            <p className="iot-selected-hint">
                                <span className="material-symbols-outlined">touch_app</span>
                                Showing history below
                            </p>
                        )}
                    </div>
                );
            })}

            {/* History chart card — spans full row */}
            {chartData && (
                <div className="data-card chart-card iot-history-card" style={{ gridColumn: "1 / -1" }}>
                    <div className="iot-chart-header-row">
                        <div>
                            <h3>
                                <span className="material-symbols-outlined" style={{ color: "#3b82f6", marginRight: 6, fontSize: "1.1rem", verticalAlign: "middle" }}>show_chart</span>
                                Soil Moisture History — {selectedDevice?.device_name}
                            </h3>
                            <p className="card-subtitle">Sensor telemetry over selected period</p>
                        </div>
                        <div className="iot-controls-row">
                            <button
                                className="iot-refresh-chip"
                                onClick={(e) => { e.stopPropagation(); fetchData(); }}
                                disabled={loading}
                                title="Refresh data"
                            >
                                <span className="material-symbols-outlined">refresh</span>
                                {loading ? "Refreshing…" : "Refresh"}
                            </button>
                            <select
                                value={historyDays}
                                onChange={(e) => setHistoryDays(Number(e.target.value))}
                                className="iot-days-select"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <option value={1}>Last 24h</option>
                                <option value={7}>Last 7 days</option>
                                <option value={30}>Last 30 days</option>
                            </select>
                        </div>
                    </div>
                    <div className="chart-container">
                        <Line data={chartData} options={chartOptions} />
                    </div>
                </div>
            )}
        </>
    );
};

export default IoTSensorSection;
