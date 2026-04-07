import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./createclient";
import { getNdviHistoryForPolygon } from "./agromonitoring";
import "./publicInsights.css";

// Import Chart.js components
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const PublicNdviChart = ({ data }) => {
  if (!data || data.length === 0) return null;

  const chartData = {
    labels: data.map((item) => new Date(item.dt * 1000).toLocaleDateString()),
    datasets: [
      {
        label: "Vegetation Health Index (NDVI)",
        data: data.map((item) => item.data.mean),
        borderColor: "#4cdf20",
        backgroundColor: "rgba(76, 223, 32, 0.1)",
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(17, 27, 14, 0.9)',
        titleColor: '#fff',
        bodyColor: '#4cdf20',
        padding: 12,
        cornerRadius: 8,
      }
    },
    scales: {
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: { color: '#6b7280' }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#6b7280' }
      }
    }
  };

  return <Line options={options} data={chartData} />;
};

const PublicFarmInsights = () => {
  const { farmId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [farm, setFarm] = useState(null);
  const [activeCycle, setActiveCycle] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [ndviData, setNdviData] = useState([]);
  const [latestMlResult, setLatestMlResult] = useState(null);

  useEffect(() => {
    const fetchPublicData = async () => {
      setLoading(true);
      try {
        // Fetch farm and its active cycle with milestones
        const { data: farmData, error: farmError } = await supabase
          .from("farms")
          .select(`*, crop_cycles(*, cycle_milestones(*))`)
          .eq("id", farmId)
          .single();

        if (farmError) throw farmError;
        setFarm(farmData);

        const cycle = farmData.crop_cycles?.find(c => c.is_active);
        if (cycle) {
          setActiveCycle(cycle);
          if (cycle.cycle_milestones) {
            setMilestones(cycle.cycle_milestones);
            
            // Find latest ML result
            const mlResult = cycle.cycle_milestones
              .filter(m => m.agro_augmentation)
              .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
              
            if (mlResult) setLatestMlResult(mlResult.agro_augmentation);
          }
        }

        // Fetch NDVI Data publicly if agro registered
        if (farmData.agromonitoring_id) {
          try {
            const ndvi = await getNdviHistoryForPolygon(farmData.agromonitoring_id);
            if (ndvi) setNdviData(ndvi);
          } catch (e) {
            console.error("Could not fetch public NDVI", e);
          }
        }
      } catch (err) {
        console.error(err);
        setError("This farm is either unavailable or private.");
      } finally {
        setLoading(false);
      }
    };
    fetchPublicData();
  }, [farmId]);

  if (loading) {
    return (
      <div className="pub-loading-screen">
        <div className="pub-spinner"></div>
        <p>Gathering Verification Oracles...</p>
      </div>
    );
  }

  if (error || !farm) {
    return (
      <div className="pub-error-screen">
        <h2>{error || "Farm Not Found"}</h2>
        <button className="pub-btn" onClick={() => navigate("/")}>Return to AgriPay</button>
      </div>
    );
  }

  return (
    <div className="pub-insights-page">
      <nav className="pub-nav">
        <div className="pub-nav-container">
          <div className="pub-logo" onClick={() => navigate("/")}>AgriPay</div>
          <button className="pub-btn-primary" onClick={() => navigate("/signup")}>Invest Now</button>
        </div>
      </nav>

      <main className="pub-main">
        {/* Farm Hero */}
        <div className="pub-farm-header">
          <div className="pub-badge">VERIFIED OPPORTUNITY</div>
          <h1 className="pub-title">{farm.name}</h1>
          <p className="pub-location"><span className="material-symbols-outlined">location_on</span> Verified Geographic Location</p>
          
          <div className="pub-header-metrics">
            <div className="pub-h-metric">
              <p>Area</p>
              <h4>{parseFloat(farm.area_hectares || 0).toFixed(1)} ha</h4>
            </div>
            <div className="pub-h-metric">
              <p>Status</p>
              <h4>{activeCycle ? "Active Growth" : "Preparing"}</h4>
            </div>
            <div className="pub-h-metric">
              <p>Oracles</p>
              <h4>Sentinel-2, IoT</h4>
            </div>
          </div>
        </div>

        {/* Dash Grid */}
        <div className="pub-bento-grid">
          
          {/* NDVI Trend */}
          <div className="pub-bento-card pub-chart-card">
            <div className="pub-card-header">
              <h3><span className="material-symbols-outlined">analytics</span> Vegetation Health (NDVI)</h3>
              <span className="pub-live-tag">LIVE ORACLE</span>
            </div>
            <p className="pub-card-desc">Independent satellite observations of farm photosynthetic capacity over the last 30 days.</p>
            <div className="pub-chart-wrap">
              {ndviData && ndviData.length > 0 ? (
                <PublicNdviChart data={ndviData} />
              ) : (
                <div className="pub-empty-state">Data synchronizing from orbital systems...</div>
              )}
            </div>
          </div>

          {/* ML Results */}
          <div className="pub-bento-card pub-ml-card">
            <div className="pub-card-header">
              <h3><span className="material-symbols-outlined">memory</span> Farm-Level ML Analysis</h3>
            </div>
            <p className="pub-card-desc">Machine Learning models aggregate visual and sensor data to predict yields and ensure compliance.</p>
            
            <div className="pub-ml-content">
              {latestMlResult ? (
                <div className="pub-ml-result-box">
                  <div className="pub-ml-header-flex">
                    <span className="pub-verdict active">
                      {latestMlResult.verdict === 'MILESTONE_MET' ? 'MILESTONE VERIFIED' : latestMlResult.verdict}
                    </span>
                    <span className="pub-conf">Confidence {(latestMlResult.overall_confidence * 100).toFixed(1)}%</span>
                  </div>
                  
                  <div className="pub-ml-metrics">
                    {latestMlResult.metrics && Object.entries(latestMlResult.metrics).map(([key, val]) => (
                      <div className="pub-ml-m-item" key={key}>
                        <span className="pub-ml-m-key">{key.replace('_', ' ')}:</span>
                        <span className="pub-ml-m-val">{typeof val === 'number' ? val.toFixed(2) : val}</span>
                      </div>
                    ))}
                  </div>

                  <p className="pub-ml-rec"><strong>System Recommendation:</strong> {latestMlResult.recommendation}</p>
                </div>
              ) : (
                <div className="pub-empty-ml">
                  <span className="material-symbols-outlined">model_training</span>
                  <h4>Analysis Pending for Current Cycle</h4>
                  <p>Not available yet for this farm. Awaiting sufficient data volume from drone visual scans regarding this growth stage.</p>
                </div>
              )}
            </div>
          </div>

          {/* Aggregated Cycle Progress */}
          <div className="pub-bento-card pub-progress-card">
            <div className="pub-card-header">
              <h3><span className="material-symbols-outlined">account_tree</span> Smart Contract Path</h3>
            </div>
            <p className="pub-card-desc">Milestones that must be achieved and cryptographically signed to release capital.</p>
            
            <div className="pub-timeline">
              {milestones.length > 0 ? (
                <div className="pub-milestone-list">
                  {milestones.sort((a,b) => new Date(a.created_at) - new Date(b.created_at)).map((m, i) => (
                    <div className="pub-m-item" key={m.id}>
                      <div className={`pub-m-dot ${m.status === 'verified' ? 'verified' : ''}`}></div>
                      <div className="pub-m-text">
                        <p>{(m.name || `Milestone ${i+1}`).split('_').join(' ').toUpperCase()}</p>
                        <span>{m.status === 'verified' ? 'Verification Validated' : 'Pending Action'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pub-empty-ml">No active cycle milestones.</div>
              )}
            </div>
          </div>
        </div>

      </main>
      
      <div className="pub-footer-cta">
        <h2>Want to fund this operation?</h2>
        <p>Log in or create an account to view full financial prospectus, Detailed Live metrics, and execute on-chain investments.</p>
        <button className="pub-btn-primary large" onClick={() => navigate("/signup")}>Create Investor Account</button>
      </div>
    </div>
  );
};

export default PublicFarmInsights;
