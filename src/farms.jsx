// src/pages/FarmsPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./createclient";
import Sidebar from "./sidebar";
import "./farms.css";
import Spinner from "./spinner";
import { toast } from "react-hot-toast";
import { useAuth } from "./useauth";
import { getMapboxStaticImageUrl } from "./utils/geometryHelpers";

// ── Farm Card ──────────────────────────────────────────────────
const FarmCard = ({ farm, onTogglePublic, role }) => {
  const navigate = useNavigate();
  const mapboxApiKey = import.meta.env.VITE_MAPBOX_API_KEY;

  // Area — use stored value from database
  const areaHa = farm.area_hectares?.toFixed(2) || "0.00";
  const areaAc = (parseFloat(farm.area_hectares || 0) * 2.471).toFixed(1);

  // Map image from boundary GeoJSON
  let imageUrl = null;
  if (farm.boundary_geojson && mapboxApiKey) {
    let geom = farm.boundary_geojson;
    if (typeof geom === "string") {
      try { geom = JSON.parse(geom); } catch (e) { /* ignore */ }
    }
    if (geom) imageUrl = getMapboxStaticImageUrl(geom, mapboxApiKey);
  }

  // Milestone progress (placeholder)
  const milestonesComplete = 0;
  const totalMilestones = 5;
  const progress = (milestonesComplete / totalMilestones) * 100;

  return (
    <div className="farm-card">
      <img
        src={imageUrl || "https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=600"}
        alt={`Map of ${farm.name}`}
        className="card-image"
      />
      <div className="card-content">
        {/* Name + View button */}
        <div className="card-name-row">
          <div className="card-name-col">
            <h3>{farm.name.toUpperCase()}</h3>
            {role === "farmer" && (
              <label className="public-toggle-wrapper" onClick={(e) => e.stopPropagation()}>
                <span className="public-toggle-label">Public visibility</span>
                <div className="public-toggle-switch">
                  <input
                    type="checkbox"
                    checked={!!farm.is_public}
                    onChange={(e) => onTogglePublic(farm.id, e.target.checked)}
                  />
                  <span className="public-slider"></span>
                </div>
              </label>
            )}
          </div>
          <button
            className="view-details-btn"
            onClick={() => navigate(`/farm/${farm.id}`)}
          >
            <span className="material-symbols-outlined">arrow_forward</span>
            View
          </button>
        </div>

        {/* Meta chips */}
        <div className="card-meta">
          <span className="card-meta-chip green">
            <span className="material-symbols-outlined">landscape</span>
            {areaHa} ha
          </span>
          <span className="card-meta-chip">
            <span className="material-symbols-outlined">straighten</span>
            {areaAc} acres
          </span>
          <span className="card-meta-chip">
            <span className="material-symbols-outlined">location_on</span>
            Field
          </span>
        </div>

        {/* Milestone progress */}
        <div className="card-progress">
          <div className="card-progress-header">
            <span className="card-progress-label">Milestone Progress</span>
            <span className="card-progress-pct">
              {milestonesComplete}/{totalMilestones}
            </span>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Farms Page ─────────────────────────────────────────────────
const FarmsPage = () => {
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { role } = useAuth();

  useEffect(() => {
    const fetchFarms = async () => {
      try {
        const { data, error } = await supabase.rpc("get_user_farms_geojson");
        if (error) {
          console.warn("RPC not available, using fallback:", error.message);
          const { data: fallbackData, error: fallbackError } = await supabase
            .from("farms")
            .select("id, name, area_hectares");
          if (fallbackError) {
            toast.error("Failed to load farms");
          } else {
            setFarms(fallbackData?.map((f) => ({ ...f, boundary_geojson: null })) || []);
          }
        } else {
          setFarms(data || []);
        }
      } catch (err) {
        toast.error("Failed to load farms");
      } finally {
        setLoading(false);
      }
    };
    fetchFarms();
  }, []);

  const handleTogglePublic = async (farmId, isPublic) => {
    try {
      const { error } = await supabase
        .from("farms")
        .update({ is_public: isPublic })
        .eq("id", farmId);

      if (error) throw error;
      
      setFarms((prev) => 
        prev.map((f) => f.id === farmId ? { ...f, is_public: isPublic } : f)
      );
      toast.success(`Farm is now ${isPublic ? "publicly visible" : "private"}`);
    } catch (err) {
      toast.error("Failed to update visibility");
      console.error(err);
    }
  };

  if (loading) return <Spinner />;

  const filtered = farms.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="farms-page-container">
      <Sidebar />
      <main className="farms-main">

        {/* ── Hero Header ── */}
        <div className="farms-hero">
          <div className="farms-hero-accent" />
          <div className="farms-hero-body">
            <div className="farms-hero-left">
              <div className="farms-hero-icon">
                <span className="material-symbols-outlined">agriculture</span>
              </div>
              <div>
                <p className="farms-hero-eyebrow">Farm Management</p>
                <h1 className="farms-hero-title">My Farms</h1>
                <p className="farms-hero-subtitle">
                  {farms.length} farm{farms.length !== 1 ? "s" : ""} registered · Click a card to view live data
                </p>
              </div>
            </div>
            <div className="farms-search">
              <span className="material-symbols-outlined">search</span>
              <input
                type="text"
                placeholder="Search farms…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── Farm Cards Grid ── */}
        <div className="farms-grid">
          {filtered.map((farm) => (
            <FarmCard key={farm.id} farm={farm} onTogglePublic={handleTogglePublic} role={role} />
          ))}

          {/* ── Add Farm card (farmers only) ── */}
          {role === "farmer" && (
            <div className="add-farm-card" onClick={() => navigate("/create-farm")}>
              <div className="add-icon-circle">
                <span className="material-symbols-outlined">add</span>
              </div>
              <h3>Add Another Farm</h3>
              <p>Register a new property to start tracking its crops, data &amp; milestones.</p>
              <span className="add-farm-cta">
                <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>add_circle</span>
                Add New Farm
              </span>
            </div>
          )}

          {/* ── Empty state ── */}
          {filtered.length === 0 && farms.length > 0 && (
            <div className="farms-empty" style={{ gridColumn: "1/-1" }}>
              <span className="material-symbols-outlined">search_off</span>
              <h3>No farms match "{search}"</h3>
              <p>Try a different search term.</p>
            </div>
          )}
          {farms.length === 0 && (
            <div className="farms-empty" style={{ gridColumn: "1/-1" }}>
              <span className="material-symbols-outlined">agriculture</span>
              <h3>No farms yet</h3>
              <p>Add your first farm to get started.</p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
};

export default FarmsPage;
