// src/pages/PaymentsPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./createclient";
import Sidebar from "./sidebar";
import "./payments.css";
import Spinner from "./spinner";
import { useAuth } from "./useauth";
import { toast } from "react-hot-toast";
import { geoJSONToMapboxURL } from "./utils/geometryHelpers";
import { MILESTONE_STATUS, isVerifiedStatus } from "./utils/statusHelpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatCurrency = (amount) =>
  `Rs. ${((amount || 0) / 100).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ─── Farm Payment Card ────────────────────────────────────────────────────────
const PaymentFarmCard = ({ farm }) => {
  const navigate = useNavigate();
  const mapboxApiKey = import.meta.env.VITE_MAPBOX_API_KEY;

  const area = farm.area_hectares
    ? parseFloat(farm.area_hectares).toFixed(1)
    : "0.0";

  const getMapImageUrl = () => {
    if (!mapboxApiKey)
      return "https://via.placeholder.com/400x160/e2e8f0/94a3b8?text=Map+Unavailable";
    if (farm.boundary) {
      try {
        const geojson =
          typeof farm.boundary === "string"
            ? JSON.parse(farm.boundary)
            : farm.boundary;
        return geoJSONToMapboxURL(geojson, mapboxApiKey);
      } catch {
        /* ignore */
      }
    }
    return "https://via.placeholder.com/400x160/e2e8f0/94a3b8?text=No+Boundary";
  };

  const ps = farm.paymentSummary || {
    total: 0,
    paid: 0,
    pending: 0,
    processing: 0,
    failed: 0,
    totalAmount: 0,
  };

  const paidPct =
    ps.total > 0 ? Math.round((ps.paid / ps.total) * 100) : 0;

  const statusChips = [
    { key: "paid",       label: "Paid",       count: ps.paid,       cls: "paid"       },
    { key: "pending",    label: "Pending",    count: ps.pending,    cls: "pending"    },
    { key: "processing", label: "Processing", count: ps.processing, cls: "processing" },
    { key: "failed",     label: "Failed",     count: ps.failed,     cls: "failed"     },
  ].filter((c) => c.count > 0);

  return (
    <div className="pfc-card" onClick={() => navigate(`/payments/${farm.id}`)}>
      {/* Map image */}
      <div className="pfc-image-wrap">
        <img
          src={getMapImageUrl()}
          alt={`Map of ${farm.name}`}
          className="pfc-image"
        />
        <div className="pfc-image-overlay" />
        {/* Area badge */}
        <div className="pfc-area-badge">
          <span className="material-symbols-outlined">straighten</span>
          {area} ha
        </div>
      </div>

      <div className="pfc-body">
        {/* Farm name & pills */}
        <div className="pfc-top-row">
          <h3 className="pfc-name">{farm.name}</h3>
          {statusChips.length > 0 && (
            <div className="pfc-chips">
              {statusChips.map((c) => (
                <span key={c.key} className={`pfc-chip ${c.cls}`}>
                  {c.count} {c.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {ps.total > 0 && (
          <div className="pfc-progress-block">
            <div className="pfc-progress-labels">
              <span className="pfc-progress-text">{ps.paid} of {ps.total} milestones paid</span>
              <span className="pfc-progress-pct">{paidPct}%</span>
            </div>
            <div className="pfc-progress-track">
              <div
                className="pfc-progress-fill"
                style={{ width: `${paidPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Earnings row */}
        <div className="pfc-bottom-row">
          <div className="pfc-earnings">
            <span className="pfc-earnings-label">Total Received</span>
            <span className="pfc-earnings-val">{formatCurrency(ps.totalAmount)}</span>
          </div>
          <button
            className="pfc-cta"
            onClick={(e) => { e.stopPropagation(); navigate(`/payments/${farm.id}`); }}
          >
            View Detail
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* No milestones hint */}
      {ps.total === 0 && (
        <div className="pfc-no-payment-hint">
          <span className="material-symbols-outlined">info</span>
          No verified milestones yet
        </div>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const PaymentsPage = () => {
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const [farms, setFarms]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    const fetchData = async () => {
      if (!user) { setLoading(false); return; }
      try {
        setLoading(true);
        setError("");

        let query = supabase
          .from("farms")
          .select("id, name, area_hectares, boundary, user_id");

        if (role === "farmer") query = query.eq("user_id", user.id);

        const { data: farmsData, error: farmsErr } = await query;
        if (farmsErr) throw farmsErr;

        const farmsWithPayments = await Promise.all(
          (farmsData || []).map(async (farm) => {
            try {
              const { data: cycles } = await supabase
                .from("crop_cycles")
                .select("id")
                .eq("farm_id", farm.id);

              const cycleIds = (cycles || []).map((c) => c.id);
              if (!cycleIds.length)
                return { ...farm, paymentSummary: { total: 0, paid: 0, pending: 0, processing: 0, failed: 0, totalAmount: 0 } };

              const { data: milestones } = await supabase
                .from("cycle_milestones")
                .select("payment_status, amount, status")
                .in("crop_cycle_id", cycleIds)
                .eq("status", MILESTONE_STATUS.VERIFIED);

              const ms = milestones || [];
              return {
                ...farm,
                paymentSummary: {
                  total:       ms.length,
                  paid:        ms.filter((m) => m.payment_status === "paid").length,
                  pending:     ms.filter((m) => m.payment_status === "pending").length,
                  processing:  ms.filter((m) => m.payment_status === "processing").length,
                  failed:      ms.filter((m) => m.payment_status === "failed").length,
                  totalAmount: ms.filter((m) => m.payment_status === "paid").reduce((s, m) => s + (m.amount || 0), 0),
                },
              };
            } catch {
              return { ...farm, paymentSummary: { total: 0, paid: 0, pending: 0, processing: 0, failed: 0, totalAmount: 0 } };
            }
          })
        );

        setFarms(farmsWithPayments);
      } catch (err) {
        console.error(err);
        setError("Failed to load payments data");
        toast.error("Failed to load payments data");
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) fetchData();
  }, [user, role, authLoading]);

  // ── Derived global stats ───────────────────────────────────────────────────
  const totalReceived = farms.reduce((s, f) => s + (f.paymentSummary?.totalAmount || 0), 0);
  const totalPaid     = farms.reduce((s, f) => s + (f.paymentSummary?.paid || 0), 0);
  const totalPending  = farms.reduce((s, f) => s + (f.paymentSummary?.pending || 0), 0);
  const totalMs       = farms.reduce((s, f) => s + (f.paymentSummary?.total || 0), 0);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="pay-container">
        <Sidebar />
        <div className="pay-main"><Spinner /></div>
      </div>
    );
  }

  if (!user) { navigate("/login"); return null; }

  return (
    <div className="pay-container">
      <Sidebar />
      <div className="pay-main">

        {/* ── Hero Header ───────────────────────────────────────── */}
        <div className="pay-hero">
          <div className="pay-hero-accent" />
          <div className="pay-hero-body">
            <div className="pay-hero-left">
              <div className="pay-hero-avatar">
                <span className="material-symbols-outlined">account_balance_wallet</span>
              </div>
              <div>
                <p className="pay-hero-eyebrow">REGENERATIVE LEDGER</p>
                <h1 className="pay-hero-title">Payments</h1>
                <p className="pay-hero-sub">
                  Blockchain-verified milestone payments across all farms
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Global Stats ──────────────────────────────────────── */}
        {farms.length > 0 && (
          <div className="pay-stats-row">
            <div className="pay-stat-card sc-green">
              <div className="pay-stat-icon-box">
                <span className="material-symbols-outlined">payments</span>
              </div>
              <p className="pay-stat-label">TOTAL RECEIVED</p>
              <p className="pay-stat-val">{formatCurrency(totalReceived)}</p>
              <p className="pay-stat-sub">across all farms</p>
            </div>
            <div className="pay-stat-card sc-blue">
              <div className="pay-stat-icon-box">
                <span className="material-symbols-outlined">check_circle</span>
              </div>
              <p className="pay-stat-label">PAID MILESTONES</p>
              <p className="pay-stat-val">{totalPaid}</p>
              <p className="pay-stat-sub">of {totalMs} verified</p>
            </div>
            <div className="pay-stat-card sc-amber">
              <div className="pay-stat-icon-box">
                <span className="material-symbols-outlined">schedule</span>
              </div>
              <p className="pay-stat-label">PENDING</p>
              <p className="pay-stat-val">{totalPending}</p>
              <p className="pay-stat-sub">awaiting release</p>
            </div>
            <div className="pay-stat-card sc-purple">
              <div className="pay-stat-icon-box">
                <span className="material-symbols-outlined">grass</span>
              </div>
              <p className="pay-stat-label">FARMS</p>
              <p className="pay-stat-val">{farms.length}</p>
              <p className="pay-stat-sub">active on chain</p>
            </div>
          </div>
        )}

        {/* ── Error Banner ──────────────────────────────────────── */}
        {error && (
          <div className="pay-error-banner">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        )}

        {/* ── Section heading ───────────────────────────────────── */}
        {farms.length > 0 && (
          <div className="pay-section-heading">
            <span className="material-symbols-outlined">view_agenda</span>
            <h2>Your Farms</h2>
          </div>
        )}

        {/* ── Grid / Empty ──────────────────────────────────────── */}
        {farms.length === 0 ? (
          <div className="pay-empty">
            <span className="material-symbols-outlined">receipt_long</span>
            <h3>No Payments Yet</h3>
            <p>Payments appear here once milestones are verified and processed on-chain.</p>
            {role === "farmer" && (
              <button className="pay-empty-btn" onClick={() => navigate("/farms")}>
                <span className="material-symbols-outlined">grass</span>
                View Your Farms
              </button>
            )}
          </div>
        ) : (
          <div className="pay-farms-grid">
            {farms.map((farm) => (
              <PaymentFarmCard key={farm.id} farm={farm} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentsPage;
