// // src/pages/FarmDetailsPage.jsx
// import React, { useState, useEffect } from "react";
// import { useParams } from "react-router-dom";
// import { supabase } from "./createclient";
// import Sidebar from "./sidebar";
// import {
//   getWeatherForPolygon,
//   getSoilDataForPolygon,
//   getNdviHistoryForPolygon,
//   searchSatelliteImages,
// } from "./agromonitoring";

// // Import Chart.js components
// import { Line } from "react-chartjs-2";
// import {
//   Chart as ChartJS,
//   CategoryScale,
//   LinearScale,
//   PointElement,
//   LineElement,
//   Title,
//   Tooltip,
//   Legend,
// } from "chart.js";

// import "./farmdetails.css";

// // Register Chart.js components
// ChartJS.register(
//   CategoryScale,
//   LinearScale,
//   PointElement,
//   LineElement,
//   Title,
//   Tooltip,
//   Legend
// );

// // NDVI Chart Component
// const NdviChart = ({ data }) => {
//   const chartData = {
//     labels: data.map((item) => new Date(item.dt * 1000).toLocaleDateString()),
//     datasets: [
//       {
//         label: "Mean NDVI",
//         data: data.map((item) => item.data.mean),
//         borderColor: "#4cdf20",
//         backgroundColor: "rgba(76, 223, 32, 0.2)",
//         fill: true,
//       },
//     ],
//   };
//   const options = { responsive: true, plugins: { legend: { display: false } } };
//   return <Line options={options} data={chartData} />;
// };

// const FarmDetailsPage = () => {
//   const { farmId } = useParams();
//   const [farm, setFarm] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");

//   // State for all our new data
//   const [weather, setWeather] = useState(null);
//   const [soil, setSoil] = useState(null);
//   const [ndviHistory, setNdviHistory] = useState([]);
//   const [latestImage, setLatestImage] = useState(null);
//   const [imageType, setImageType] = useState("tci"); // 'tci' or 'ndvi'

//   useEffect(() => {
//     const fetchAllData = async () => {
//       try {
//         // 1. Get farm details from our database (this includes the agromonitoring_id)
//         const { data: farmData, error: farmError } = await supabase
//           .from("farms")
//           .select("*")
//           .eq("id", farmId)
//           .single();
//         if (farmError) throw farmError;
//         setFarm(farmData);

//         if (!farmData.agromonitoring_id) {
//           throw new Error(
//             "This farm is not registered with the monitoring service."
//           );
//         }

//         const polyId = farmData.agromonitoring_id;

//         // 2. Fetch all AgroMonitoring data in parallel for speed
//         const [weatherData, soilData, ndviData, imageData] = await Promise.all([
//           getWeatherForPolygon(polyId),
//           getSoilDataForPolygon(polyId),
//           getNdviHistoryForPolygon(polyId),
//           searchSatelliteImages(polyId),
//         ]);

//         setWeather(weatherData);
//         setSoil(soilData);
//         setNdviHistory(ndviData);
//         setLatestImage(imageData);
//       } catch (err) {
//         setError(err.message);
//         console.error("Error fetching farm data:", err);
//       } finally {
//         setLoading(false);
//       }
//     };

//     fetchAllData();
//   }, [farmId]);

//   const getImageUrl = () => {
//     if (!latestImage) return null;
//     return imageType === "tci" ? latestImage.image.tci : latestImage.image.ndvi;
//   };

//   if (loading) {
//     return (
//       <div className="farm-details-container">
//         <Sidebar />
//         <main className="farm-details-main loading-state">
//           Loading farm details...
//         </main>
//       </div>
//     );
//   }
//   if (error) {
//     return (
//       <div className="farm-details-container">
//         <Sidebar />
//         <main className="farm-details-main error-state">Error: {error}</main>
//       </div>
//     );
//   }

//   return (
//     <div className="farm-details-container">
//       <Sidebar />
//       <main className="farm-details-main">
//         <h1 className="farm-name-title">{farm?.name}</h1>

//         <div className="data-grid">
//           {/* Weather Card */}
//           <div className="data-card weather-card">
//             <h3>Current Weather</h3>
//             {weather ? (
//               <div className="weather-content">
//                 <img
//                   src={`http://openweathermap.org/img/wn/${weather[0].weather[0].icon}@2x.png`}
//                   alt="weather icon"
//                 />
//                 <div className="weather-details">
//                   <p className="temperature">
//                     {Math.round(weather[0].main.temp - 273.15)}°C
//                   </p>
//                   <p className="description">
//                     {weather[0].weather[0].description}
//                   </p>
//                 </div>
//               </div>
//             ) : (
//               <p>Loading weather...</p>
//             )}
//           </div>

//           {/* Soil Data Card */}
//           <div className="data-card soil-card">
//             <h3>Soil Data</h3>
//             {soil ? (
//               <div className="soil-content">
//                 <p>Temperature: {Math.round(soil.t10 - 273.15)}°C</p>
//                 <p>Moisture: {(soil.moisture * 100).toFixed(1)}%</p>
//               </div>
//             ) : (
//               <p>Loading soil data...</p>
//             )}
//           </div>

//           {/* NDVI Chart */}
//           <div className="data-card chart-card">
//             <h3>NDVI Trend (30 Days)</h3>
//             {ndviHistory.length > 0 ? (
//               <NdviChart data={ndviHistory} />
//             ) : (
//               <p>No NDVI data available.</p>
//             )}
//           </div>

//           {/* Satellite Image Card */}
//           <div className="data-card image-card">
//             <div className="image-header">
//               <h3>Latest Satellite Image</h3>
//               <div className="image-toggle">
//                 <button
//                   onClick={() => setImageType("tci")}
//                   className={imageType === "tci" ? "active" : ""}
//                 >
//                   True Color
//                 </button>
//                 <button
//                   onClick={() => setImageType("ndvi")}
//                   className={imageType === "ndvi" ? "active" : ""}
//                 >
//                   NDVI
//                 </button>
//               </div>
//             </div>
//             {latestImage ? (
//               <img
//                 src={getImageUrl()}
//                 alt={`${imageType} view`}
//                 className="satellite-image"
//               />
//             ) : (
//               <p>No recent satellite imagery found.</p>
//             )}
//           </div>
//         </div>
//       </main>
//     </div>
//   );
// };

// export default FarmDetailsPage;

// src/pages/FarmDetailsPage.jsx
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "./createclient";
import Sidebar from "./sidebar";
import Modal from "./modal";
import ConfirmDialog from "./confirmdialog";
import MilestoneVerificationPanel from "./MilestoneVerificationPanel";
import {
  getWeatherForPolygon,
  getSoilDataForPolygon,
  getNdviHistoryForPolygon,
  searchSatelliteImages,
  getCurrentWeatherForPolygon,
  getUviForPolygon,
} from "./agromonitoring";
import {
  getVegetationStats,
  getVegetationHistory,
} from "./sentinelhub";
import DroneImagerySection from "./DroneImagerySection";
import SatelliteImagerySection from "./SatelliteImagerySection";
import IoTSensorSection from "./IoTSensorSection";
import CropStageSection from "./CropStageSection";
import { toast } from "react-hot-toast";
import { useWeb3Auth } from "./Web3Context";
import { ethers } from "ethers";

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

import "./farmdetails.css";
import { useAuth } from "./useauth";
import {
  MILESTONE_STATUS,
  getStatusDisplay,
  getStatusColor,
  isVerifiedStatus,
  isPendingVerification,
} from "./utils/statusHelpers";
import { geoJSONToLeaflet } from "./utils/geometryHelpers";

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
import Spinner from "./spinner";
import {
  uploadAndAnalyze,
  uploadAndAnalyzeChunked,
  analyzeFromDriveFile,
  getJobStatus as getComputeJobStatus,
  getResultImageBlob,
  saveResults as saveComputeResults,
  verifyMilestone as runMlVerification,
} from "./computeService";
import { listDriveFiles } from "./droneImageryService";
// NDVI Chart Component (from AgroMonitoring)
const NdviChart = ({ data }) => {
  const chartData = {
    labels: data.map((item) => new Date(item.dt * 1000).toLocaleDateString()),
    datasets: [
      {
        label: "Mean NDVI",
        data: data.map((item) => item.data.mean),
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        fill: true,
        tension: 0.4,
      },
    ],
  };
  const options = { responsive: true, plugins: { legend: { display: false } } };
  return <Line options={options} data={chartData} />;
};

// Generic Vegetation Index Chart Component (for Sentinel Hub data)
const VegetationChart = ({
  data,
  label,
  color,
  minValue = -1,
  maxValue = 1,
}) => {
  if (!data || data.length === 0) return null;

  const chartData = {
    labels: data.map((item) => new Date(item.dt * 1000).toLocaleDateString()),
    datasets: [
      {
        label: label,
        data: data.map((item) => item.data.mean),
        borderColor: color,
        backgroundColor: `${color}20`,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${label}: ${context.parsed.y.toFixed(3)}`,
        },
      },
    },
    scales: {
      y: {
        min: minValue,
        max: maxValue,
        title: {
          display: true,
          text: label,
        },
      },
    },
  };

  return <Line options={options} data={chartData} />;
};

// Helper function to safely format numbers (handles NaN and undefined)
const safeToFixed = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) {
    return "N/A";
  }
  return Number(value).toFixed(decimals);
};

// Helper to check if a value is a valid number
const isValidNumber = (value) => {
  return (
    value !== null && value !== undefined && !isNaN(value) && isFinite(value)
  );
};

// Helper function to get farm coordinates from PostGIS boundary
// Returns coordinates in Leaflet format [{lat, lng}] for Sentinel Hub API compatibility
const getFarmCoordinates = (farmData) => {
  if (!farmData) return null;

  // Get coordinates from PostGIS boundary column
  if (farmData.boundary) {
    try {
      // boundary is already GeoJSON from the database
      const geojson =
        typeof farmData.boundary === "string"
          ? JSON.parse(farmData.boundary)
          : farmData.boundary;
      return geoJSONToLeaflet(geojson);
    } catch (e) {
      console.warn("Failed to parse boundary GeoJSON:", e);
    }
  }

  return null;
};

const FarmDetailsPage = () => {
  const { farmId } = useParams();
  const { role, loading: authLoading } = useAuth();
  const { loggedIn, login, logout, provider, loading: web3Loading, initialized: web3Initialized } = useWeb3Auth();
  const [farm, setFarm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [weather, setWeather] = useState(null);
  const [soil, setSoil] = useState(null);
  const [ndviHistory, setNdviHistory] = useState([]);
  const [latestImage, setLatestImage] = useState(null);
  const [imageType, setImageType] = useState("tci");

  // Additional AgroMonitoring data states
  const [currentWeather, setCurrentWeather] = useState(null);
  const [uvi, setUvi] = useState(null);

  // Sentinel Hub data states (stats and history only - images handled by SatelliteImagerySection)
  const [sentinelLoading, setSentinelLoading] = useState(false);
  const [sentinelStats, setSentinelStats] = useState(null);
  const [sentinelHistory, setSentinelHistory] = useState({
    ndvi: [],
    savi: [],
    moisture: [],
    lai: [],
  });
  // Farm coordinates for satellite imagery component
  const [farmCoords, setFarmCoords] = useState(null);
  const [activeCycle, setActiveCycle] = useState(null);
  const [cycleMilestones, setCycleMilestones] = useState([]);
  const [availableCrops, setAvailableCrops] = useState([]);

  // Modal state for starting a cycle
  const [isStartCycleModalOpen, setIsStartCycleModalOpen] = useState(false);
  const [selectedCropId, setSelectedCropId] = useState("");

  // Confirmation dialog state for milestone verification
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [milestoneToVerify, setMilestoneToVerify] = useState(null);

  // ML Verification state
  const [verificationResult, setVerificationResult] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState(null);

  // --- Plant Counter AI State ---
  const [pcInputMode, setPcInputMode] = useState("file"); // "file" | "drive"
  const [pcFile, setPcFile] = useState(null);
  const [pcDriveUrl, setPcDriveUrl] = useState("");
  const [pcJobId, setPcJobId] = useState(null);
  const [pcStatus, setPcStatus] = useState("idle"); // idle | uploading | processing | completed | failed
  const [pcProgress, setPcProgress] = useState(0);
  const [pcUploadProgress, setPcUploadProgress] = useState(0); // XHR upload % (0-100)
  const [pcMessage, setPcMessage] = useState("");
  const [pcResult, setPcResult] = useState(null);
  const [pcOutputType, setPcOutputType] = useState("counting");
  const [pcImageUrl, setPcImageUrl] = useState(null);
  const [pcOriginalUrl, setPcOriginalUrl] = useState(null); // preview of the original uploaded image
  const [pcDragOver, setPcDragOver] = useState(false);
  const pcPollRef = React.useRef(null);

  // Farmer wallet — auto-synced from Web3Auth (no manual input needed)
  const [farmerWalletAddress, setFarmerWalletAddress] = useState("");
  const [walletSaving, setWalletSaving] = useState(false);

  useEffect(() => {
    const fetchFarmData = async () => {
      setLoading(true);
      setError("");
      try {
        // --- Part 1: Fetch core farm data and available crops ---
        const { data: farmData, error: farmError } = await supabase
          .from("farms")
          .select("*")
          .eq("id", farmId)
          .single();
        if (farmError) throw farmError;
        setFarm(farmData);

        const { data: crops } = await supabase.from("crops").select("*");
        if (crops) {
          setAvailableCrops(crops);
          if (crops.length > 0) setSelectedCropId(crops[0].id);
        }

        // --- Part 2: Check for an active crop cycle (this remains the same) ---
        const { data: cycleData, error: cycleError } = await supabase
          .from("crop_cycles")
          .select(`*, cycle_milestones(*, milestone_templates(*))`)
          .eq("farm_id", farmId)
          .eq("is_active", true);
        if (cycleError) throw cycleError;

        if (cycleData && cycleData.length === 1) {
          const currentCycle = cycleData[0];
          setActiveCycle(currentCycle);
          const sortedMilestones = currentCycle.cycle_milestones.sort(
            (a, b) =>
              a.milestone_templates.sequence - b.milestone_templates.sequence
          );
          setCycleMilestones(sortedMilestones);
        } else {
          setActiveCycle(null);
          setCycleMilestones([]);
        }

        // --- THE FIX IS HERE ---
        // Part 3: Fetch AgroMonitoring data regardless of active cycle, as long as the farm is registered.
        if (farmData && farmData.agromonitoring_id) {
          const polyId = farmData.agromonitoring_id;

          // Use Promise.allSettled to prevent one failed request from stopping all others
          // Note: Some APIs (EVI, accumulated temp/precip, weather history) require paid subscription
          const results = await Promise.allSettled([
            getWeatherForPolygon(polyId),
            getSoilDataForPolygon(polyId),
            getNdviHistoryForPolygon(polyId),
            searchSatelliteImages(polyId),
            getCurrentWeatherForPolygon(polyId),
            getUviForPolygon(polyId),
          ]);

          const apiNames = [
            "Weather Forecast",
            "Soil",
            "NDVI",
            "Satellite Images",
            "Current Weather",
            "UV Index",
          ];

          // Assign data if the request was successful
          if (results[0].status === "fulfilled") {
            console.log("Weather forecast data fetched successfully");
            setWeather(results[0].value);
          }
          if (results[1].status === "fulfilled") {
            console.log("Soil data fetched successfully");
            setSoil(results[1].value);
          }
          if (results[2].status === "fulfilled") {
            console.log("NDVI data fetched successfully");
            setNdviHistory(results[2].value);
          }
          if (results[3].status === "fulfilled") {
            console.log("Satellite images fetched successfully");
            setLatestImage(results[3].value);
          }
          if (results[4].status === "fulfilled") {
            console.log("Current weather data fetched successfully");
            setCurrentWeather(results[4].value);
          }
          if (results[5].status === "fulfilled") {
            console.log("UV Index data fetched successfully");
            setUvi(results[5].value);
          }

          // Log any errors without crashing the page
          const failedRequests = [];
          results.forEach((result, index) => {
            if (result.status === "rejected") {
              console.warn(
                `Failed to fetch ${apiNames[index]} data:`,
                result.reason
              );
              // Only add to failed list if it's not NDVI (which takes time for new farms)
              if (apiNames[index] !== "NDVI") {
                failedRequests.push(apiNames[index]);
              }
            }
          });

          // Show toast notification if critical API calls failed (not NDVI)
          if (failedRequests.length > 0) {
            toast.error(`Failed to fetch: ${failedRequests.join(", ")}`);
          }

          // Show info message if NDVI specifically failed (normal for new farms)
          if (results[2].status === "rejected") {
            console.info(
              "NDVI data not yet available - this is normal for newly registered farms (takes 24-48 hours)"
            );
          }

          // --- Fetch Sentinel Hub data ---
          // Get coordinates from either new PostGIS boundary or deprecated location_data
          const coords = getFarmCoordinates(farmData);
          if (coords && coords.length > 0) {
            setFarmCoords(coords); // Store for SatelliteImagerySection
            fetchSentinelData(coords);
          }
        } else {
          // If the farm isn't registered with AgroMonitoring, we can't fetch this data.
          console.warn(
            "Farm is not registered with AgroMonitoring service. Skipping data fetch."
          );

          // But we can still try Sentinel Hub if we have coordinates
          const coords = getFarmCoordinates(farmData);
          if (coords && coords.length > 0) {
            setFarmCoords(coords); // Store for SatelliteImagerySection
            fetchSentinelData(coords);
          }
        }
        // --- END OF FIX ---
      } catch (error) {
        setError(error.message);
        console.error("Error fetching page data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFarmData();
  }, [farmId]);

  // Auto-read & auto-save farmer wallet from Web3Auth
  useEffect(() => {
    if (role !== "farmer" || !farm) return;

    if (loggedIn && provider) {
      const syncAddress = async () => {
        try {
          const ethProvider = new ethers.providers.Web3Provider(provider);
          const address = await ethProvider.getSigner().getAddress();
          setFarmerWalletAddress(address);

          if (address !== farm.wallet_address) {
            setWalletSaving(true);
            const { error } = await supabase
              .from("farms")
              .update({ wallet_address: address })
              .eq("id", farmId);
            setWalletSaving(false);
            if (!error) {
              setFarm((prev) => ({ ...prev, wallet_address: address }));
              toast.success("Payment wallet linked!", { id: "wallet-sync" });
            }
          }
        } catch (err) {
          console.error("Failed to sync wallet:", err);
          setWalletSaving(false);
        }
      };
      syncAddress();
    } else {
      // Not connected — show existing DB address so they know what's already saved
      setFarmerWalletAddress(farm.wallet_address || "");
    }
  }, [loggedIn, provider, farm?.id, role]);

  // Function to fetch Sentinel Hub vegetation stats and history
  // Publishing now handled by scheduled satellite-data-scheduler
  const fetchSentinelData = async (coords) => {
    setSentinelLoading(true);
    try {
      const [statsResult, historyResult] = await Promise.allSettled([
        getVegetationStats(coords),
        getVegetationHistory(coords, 60), // Get 60 days of history
      ]);

      // Handle vegetation stats
      if (statsResult.status === "fulfilled") {
        console.log("Sentinel vegetation stats fetched:", statsResult.value);
        setSentinelStats(statsResult.value);
      } else {
        console.error("Sentinel stats failed:", statsResult.reason);
      }

      // Handle vegetation history
      if (historyResult.status === "fulfilled") {
        console.log("Sentinel vegetation history fetched:", historyResult.value);
        setSentinelHistory(historyResult.value);
      } else {
        console.error("Sentinel history failed:", historyResult.reason);
      }
    } catch (error) {
      console.error("Error fetching Sentinel data:", error);
      toast.error("Failed to fetch Sentinel satellite data");
    } finally {
      setSentinelLoading(false);
    }
  };

  const getImageUrl = () => {
    if (!latestImage) return null;
    console.log("Latest Image Object:", latestImage);
    // AgroMonitoring API uses 'truecolor' not 'tci' for true color images
    if (imageType === "tci") {
      return latestImage.image?.truecolor || latestImage.image?.tci || null;
    }
    return latestImage.image?.ndvi || null;
  };
  const handleApproveClick = (milestone) => {
    setMilestoneToVerify(milestone);
    setVerificationResult(null);
    setVerificationError(null);
    setVerificationLoading(false);
    setShowConfirmDialog(true);

    // Show cached ML results if available
    if (milestone.agro_augmentation?.verdict) {
      setVerificationResult({
        verdict: milestone.agro_augmentation.verdict,
        overall_confidence: milestone.agro_augmentation.overall_confidence,
        recommendation: milestone.agro_augmentation.recommendation,
        report: milestone.agro_augmentation,
      });
    }
  };

  const handleRunVerification = async () => {
    if (!milestoneToVerify) return;
    setVerificationLoading(true);
    setVerificationError(null);
    try {
      const result = await runMlVerification(milestoneToVerify.id);
      setVerificationResult(result);
      // Update local milestone data with agro_augmentation
      setCycleMilestones((prev) =>
        prev.map((m) =>
          m.id === milestoneToVerify.id
            ? { ...m, agro_augmentation: result.report || result }
            : m
        )
      );
    } catch (err) {
      setVerificationError(err.message);
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleConfirmApprove = async () => {
    if (!milestoneToVerify) return;

    const action =
      verificationResult?.verdict === "MILESTONE_FAILED" ? "reject" : "verify";
    const newStatus = action === "verify" ? MILESTONE_STATUS.VERIFIED : MILESTONE_STATUS.REJECTED;

    try {
      // Direct database update - triggers will handle notifications
      const { error } = await supabase
        .from("cycle_milestones")
        .update({ status: newStatus })
        .eq("id", milestoneToVerify.id);

      if (error) throw error;

      if (action === "verify") {
        toast.success("Milestone approved successfully");
        setCycleMilestones((prev) =>
          prev.map((m) =>
            m.id === milestoneToVerify.id
              ? { ...m, status: MILESTONE_STATUS.VERIFIED }
              : m
          )
        );
      } else {
        toast.success("Milestone rejected");
        setCycleMilestones((prev) =>
          prev.map((m) =>
            m.id === milestoneToVerify.id
              ? { ...m, status: MILESTONE_STATUS.REJECTED }
              : m
          )
        );
      }
    } catch (error) {
      console.error("Verification error:", error);
      toast.error(error.message || "Error updating verification");
    }
    setShowConfirmDialog(false);
    setMilestoneToVerify(null);
  };

  const handleManualReject = async () => {
    if (!milestoneToVerify) return;
    try {
      const { error } = await supabase
        .from("cycle_milestones")
        .update({ status: MILESTONE_STATUS.REJECTED })
        .eq("id", milestoneToVerify.id);
      if (error) throw error;
      toast.success("Milestone rejected");
      setCycleMilestones((prev) =>
        prev.map((m) =>
          m.id === milestoneToVerify.id
            ? { ...m, status: MILESTONE_STATUS.REJECTED }
            : m
        )
      );
    } catch (err) {
      console.error("Rejection error:", err);
      toast.error(err.message || "Error rejecting milestone");
    }
    setShowConfirmDialog(false);
    setMilestoneToVerify(null);
    setVerificationResult(null);
    setVerificationError(null);
  };

  const handleStartCycle = async () => {
    if (!selectedCropId) {
      // alert("Please select a crop.");
      toast.error("No Crop Selected");
      return;
    }

    try {
      const { error } = await supabase.functions.invoke("start-crop-cycle", {
        body: { farm_id: farmId, crop_id: selectedCropId },
      });
      if (error) throw error;
      // alert("Crop cycle started successfully!");
      toast.success("Cycle Started Succesfully");
      window.location.reload(); // Easiest way to refresh all data
    } catch (error) {
      // alert("Error starting cycle: " + error.message);
      toast.error("Error starting cycle");
    }
  };
  // Maps each payable milestone name to the growth stage input keys
  // that must be filled (with a stage_date) before it can be submitted.
  const MILESTONE_REQUIRED_STAGES = {
    "Sowing":                     ["sowing"],
    "Tillering":                  ["sowing", "tillering"],
    "Grain Filling and Ripening": ["sowing", "tillering", "grain_filling"],
  };

  const STAGE_LABELS = {
    sowing:        "Sowing",
    tillering:     "Tillering",
    grain_filling: "Grain Filling",
  };

  const handleStatusChange = async (milestoneId, newStatus) => {
    // Apply guards only when the farmer marks a milestone as complete
    if (newStatus === MILESTONE_STATUS.PENDING_VERIFICATION) {
      const targetMilestone = cycleMilestones.find((m) => m.id === milestoneId);

      // ── Guard 1: Sequential milestone completion ──────────────────
      if (targetMilestone) {
        const targetSeq = targetMilestone.milestone_templates?.sequence ?? 0;
        const blockedBy = cycleMilestones.find((m) => {
          const seq = m.milestone_templates?.sequence ?? 0;
          const status = m.status || "";
          return (
            seq < targetSeq &&
            status !== MILESTONE_STATUS.VERIFIED &&
            status !== "verified"
          );
        });
        if (blockedBy) {
          const blockedName =
            blockedBy.milestone_templates?.name ||
            `Milestone ${blockedBy.milestone_templates?.sequence}`;
          toast.error(
            `Complete "${blockedName}" first before marking this milestone as complete.`
          );
          return;
        }
      }

      // ── Guard 2: Required growth stage inputs must be filled ──────
      const milestoneName = targetMilestone?.milestone_templates?.name;
      const requiredStages = MILESTONE_REQUIRED_STAGES[milestoneName];

      if (requiredStages?.length > 0 && activeCycle?.id) {
        try {
          const { data: stageRows, error: stageErr } = await supabase
            .from("growth_stage_inputs")
            .select("stage_name, stage_date")
            .eq("crop_cycle_id", activeCycle.id)
            .in("stage_name", requiredStages);

          if (stageErr) throw stageErr;

          const filledStages = new Set(
            (stageRows || [])
              .filter((r) => r.stage_date)
              .map((r) => r.stage_name)
          );

          const missingStages = requiredStages.filter(
            (s) => !filledStages.has(s)
          );

          if (missingStages.length > 0) {
            const missingLabels = missingStages
              .map((s) => STAGE_LABELS[s] || s)
              .join(", ");
            toast.error(
              `Please fill in the "${missingLabels}" growth stage input log before marking this milestone as complete.`
            );
            return;
          }
        } catch (err) {
          console.error("Growth stage check error:", err);
          // Non-blocking: allow the update if the check fails transiently
        }
      }
    }

    try {
      // Direct database update - triggers will handle notifications
      const { error } = await supabase
        .from("cycle_milestones")
        .update({ status: newStatus })
        .eq("id", milestoneId);

      if (error) throw error;

      // Update local state for instant UI feedback
      setCycleMilestones((prev) =>
        prev.map((m) =>
          m.id === milestoneId ? { ...m, status: newStatus } : m
        )
      );

      if (newStatus === MILESTONE_STATUS.PENDING_VERIFICATION) {
        toast.success("Milestone submitted for verification!");
      }
    } catch (error) {
      console.error("Status change error:", error);
      toast.error(error.message || "Error updating status");
    }
  };

  // --- Plant Counter AI Handlers ---
  const handlePcFile = (file) => {
    if (!file || !file.type.startsWith("image/") && !file.name.match(/\.(tif|tiff|png|jpg|jpeg)$/i)) {
      toast.error("Please select a PNG, TIFF, or JPEG image file.");
      return;
    }
    setPcInputMode("file");
    setPcFile(file);
    setPcStatus("idle");
    setPcResult(null);
    if (pcImageUrl) { URL.revokeObjectURL(pcImageUrl); setPcImageUrl(null); }
    if (pcOriginalUrl) { URL.revokeObjectURL(pcOriginalUrl); }
    setPcOriginalUrl(URL.createObjectURL(file));
  };

  const saveResultsToSupabase = async (result, filename) => {
    await saveComputeResults({
      farmId,
      filename,
      result,
    });
  };

  const startPlantCounting = async () => {
    const isDrive = pcInputMode === "drive";
    if (!isDrive && !pcFile) return;
    if (isDrive && !pcDriveUrl.trim()) {
      toast.error("Please paste a Google Drive or image URL.");
      return;
    }
    if (pcPollRef.current) clearInterval(pcPollRef.current);
    setPcStatus("uploading");
    setPcProgress(0);
    setPcUploadProgress(0);
    setPcMessage(isDrive ? "Server is downloading image from Drive..." : "Uploading image...");
    setPcResult(null);
    if (pcImageUrl) { URL.revokeObjectURL(pcImageUrl); setPcImageUrl(null); }

    try {
      let job_id;
      if (isDrive) {
        // Resolve the Drive URL to a file entry, then kick off server-side download
        let driveFiles;
        try {
          const result = await listDriveFiles(pcDriveUrl.trim());
          driveFiles = result.files;
        } catch (e) {
          throw new Error(`Could not read Drive link: ${e.message}`);
        }
        if (!driveFiles || driveFiles.length === 0) {
          throw new Error("No image files found at that Drive link. Make sure the file is shared publicly.");
        }
        const driveFile = driveFiles[0];
        setPcMessage(`Found: ${driveFile.name} — submitting analysis…`);
        ({ job_id } = await analyzeFromDriveFile(
          driveFile.id,
          driveFile.name,
          "wheat_plant_counter_v1",
        ));
      } else {
        // Large files: use chunked upload (each chunk << 100 s → no Cloudflare 524)
        const CHUNK_THRESHOLD = 50 * 1024 * 1024;
        if (pcFile.size > CHUNK_THRESHOLD) {
          setPcMessage("Uploading in chunks (large file)…");
          ({ job_id } = await uploadAndAnalyzeChunked(
            pcFile,
            "wheat_plant_counter_v1",
            ({ percent }) => setPcUploadProgress(percent),
          ));
        } else {
          ({ job_id } = await uploadAndAnalyze(
            pcFile,
            "wheat_plant_counter_v1",
            ({ percent }) => setPcUploadProgress(percent),
          ));
        }
      }
      setPcJobId(job_id);
      setPcStatus("processing");

      pcPollRef.current = setInterval(async () => {
        try {
          const data = await getComputeJobStatus(job_id);
          setPcProgress(data.progress || 0);
          setPcMessage(data.message || "");
          if (data.status === "completed") {
            clearInterval(pcPollRef.current);
            setPcStatus("completed");
            setPcResult(data.result);
            fetchPcImage(job_id, "counting");
            saveResultsToSupabase(data.result, pcFile?.name || "unknown");
          } else if (data.status === "failed") {
            clearInterval(pcPollRef.current);
            setPcStatus("failed");
            setPcMessage(data.error || "Processing failed");
            toast.error("Plant counting failed.");
          }
        } catch (e) {
          clearInterval(pcPollRef.current);
          setPcStatus("failed");
          setPcMessage("Lost connection to server.");
        }
      }, 1500);
    } catch (err) {
      setPcStatus("failed");
      setPcMessage(err.message);
      toast.error(err.message);
    }
  };

  const fetchPcImage = async (jobId, type) => {
    try {
      const url = await getResultImageBlob(jobId, type);
      setPcImageUrl(url);
      setPcOutputType(type);
    } catch (e) {
      toast.error("Could not load result image.");
    }
  };

  if (loading) {
    return (
      <div className="farm-details-container">
        <Sidebar />
        <main className="farm-details-main loading-state">
          Loading farm details...
        </main>
        <Spinner></Spinner>
      </div>
    );
  }
  if (error) {
    return (
      <div className="farm-details-container">
        <Sidebar />
        <main className="farm-details-main error-state">Error: {error}</main>
      </div>
    );
  }

  //   const getImageUrl = () => {
  //     // ... (This function remains exactly the same)
  //   };

  // Improved Loading and Error states
  if (loading) {
    return (
      <div className="farm-details-container">
        <Sidebar />
        <main className="farm-details-main state-container">
          <div className="loader"></div>
          <p>Fetching farm data...</p>
          <Spinner></Spinner>
        </main>
      </div>
    );
  }
  if (error) {
    return (
      <div className="farm-details-container">
        <Sidebar />
        <main className="farm-details-main state-container">
          <span className="material-symbols-outlined error-icon">error</span>
          <p>Error: {error}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="farm-details-container">
      <Sidebar />
      <main className="farm-details-main">

        {/* ── Page Header ── */}
        <div className="fd-hero">
          <div className="fd-hero-accent" />
          <div className="fd-hero-content">
            <div className="fd-hero-top">
              <div>
                <p className="fd-hero-label">Farm Overview</p>
                <h1 className="farm-name-title">{farm?.name}</h1>
                <p className="farm-subtitle">
                  Live metrics, satellite imagery &amp; AI-powered insights
                </p>
              </div>
              <div className="fd-hero-badges">
                <span className="fd-status-badge">
                  <span className="fd-status-dot" />
                  Live
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Payment Wallet (farmer only) ── */}
        {role === "farmer" && (
          <div className="fd-wallet-card">
            <div className="fd-wallet-header">
              <span className="material-symbols-outlined fd-wallet-icon">account_balance_wallet</span>
              <div>
                <div className="fd-wallet-title">Payment Wallet</div>
                <div className="fd-wallet-sub">
                  {loggedIn && farmerWalletAddress
                    ? "Your Web3Auth wallet is linked — milestone payments will be sent here."
                    : "Connect with Web3Auth to link your wallet and receive payments."}
                </div>
              </div>
            </div>

            {loggedIn && farmerWalletAddress ? (
              <div>
                <div className="fd-wallet-address-display">
                  {walletSaving && (
                    <span className="fd-wallet-syncing">Syncing…</span>
                  )}
                  <span className="fd-wallet-addr">{farmerWalletAddress}</span>
                </div>
                <div className="fd-wallet-actions">
                  <a
                    className="fd-wallet-link"
                    href={`https://sepolia.etherscan.io/address/${farmerWalletAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                    View on Etherscan
                  </a>
                  <button className="fd-wallet-disconnect-btn" onClick={logout}>
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="fd-wallet-connect-btn"
                onClick={login}
                disabled={web3Loading || !web3Initialized}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: 6 }}>login</span>
                {web3Loading ? "Connecting…" : "Connect with Web3Auth"}
              </button>
            )}
          </div>
        )}

        {/* ── Crop Cycle / Milestone Section ── */}
        {activeCycle ? (
          <CropStageSection
            activeCycle={activeCycle}
            cycleMilestones={cycleMilestones}
            availableCrops={availableCrops}
            role={role}
            farmId={farmId}
            onStatusChange={handleStatusChange}
            onApprove={handleApproveClick}
          />
        ) : (
          role === "farmer" && (
            <div className="start-cycle-card">
              <div className="start-cycle-icon">
                <span className="material-symbols-outlined">agriculture</span>
              </div>
              <h3>No Active Crop Cycle</h3>
              <p>Start a new crop cycle to begin tracking growth stages, recording field inputs, and unlocking milestone-based payments for this farm.</p>
              <button className="start-btn" onClick={() => setIsStartCycleModalOpen(true)}>
                <span className="material-symbols-outlined">add_circle</span>
                Start New Crop Cycle
              </button>
            </div>
          )
        )}

        {/* ── Live Conditions ── */}
        <p className="section-heading">
          <span className="material-symbols-outlined">sensors</span>
          Live Conditions
        </p>
        <div className="data-grid" style={{ marginBottom: "2rem" }}>

          {/* Weather */}
          <div className="data-card weather-card">
            <h3>Live Weather</h3>
            {weather && weather.length > 0 ? (
              <div className="weather-content">
                <img
                  src={`http://openweathermap.org/img/wn/${weather[0].weather[0].icon}@4x.png`}
                  alt="weather icon"
                />
                <div>
                  <p className="temperature">{Math.round(weather[0].main.temp - 273.15)}°C</p>
                  <p className="description">{weather[0].weather[0].description}</p>
                </div>
              </div>
            ) : (
              <p className="data-unavailable">
                <span className="material-symbols-outlined">cloud_off</span>
                Weather data unavailable
              </p>
            )}
          </div>

          {/* Current Conditions */}
          <div className="data-card current-weather-card">
            <h3>Atmospheric Conditions</h3>
            {currentWeather ? (
              <div className="current-weather-content">
                <div className="weather-grid">
                  <div className="weather-stat">
                    <span className="material-symbols-outlined">air</span>
                    <div>
                      <p className="stat-label">Wind Speed</p>
                      <p className="stat-value">{currentWeather.wind?.speed?.toFixed(1) || 0} m/s</p>
                    </div>
                  </div>
                  <div className="weather-stat">
                    <span className="material-symbols-outlined">humidity_percentage</span>
                    <div>
                      <p className="stat-label">Humidity</p>
                      <p className="stat-value">{currentWeather.main?.humidity || 0}%</p>
                    </div>
                  </div>
                  <div className="weather-stat">
                    <span className="material-symbols-outlined">compress</span>
                    <div>
                      <p className="stat-label">Pressure</p>
                      <p className="stat-value">{currentWeather.main?.pressure || 0} hPa</p>
                    </div>
                  </div>
                  <div className="weather-stat">
                    <span className="material-symbols-outlined">visibility</span>
                    <div>
                      <p className="stat-label">Cloud Cover</p>
                      <p className="stat-value">{currentWeather.clouds?.all || 0}%</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="data-unavailable">
                <span className="material-symbols-outlined">cloud_off</span>
                Current conditions unavailable
              </p>
            )}
          </div>

          {/* Soil Data */}
          <div className="data-card soil-card">
            <h3>Soil Data</h3>
            {soil ? (
              <div className="soil-content">
                <div className="metric-item">
                  <span className="material-symbols-outlined metric-icon" style={{ backgroundColor: "#fef3c7", color: "#d97706" }}>device_thermostat</span>
                  <div>
                    <p className="metric-label">Temperature (10 cm)</p>
                    <p className="metric-value">{Math.round(soil.t10 - 273.15)}°C</p>
                  </div>
                </div>
                <div className="metric-item">
                  <span className="material-symbols-outlined metric-icon" style={{ backgroundColor: "#eff6ff", color: "#3b82f6" }}>water_drop</span>
                  <div>
                    <p className="metric-label">Moisture</p>
                    <p className="metric-value">{(soil.moisture * 100).toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="data-unavailable">
                <span className="material-symbols-outlined">layers_clear</span>
                Soil data unavailable
              </p>
            )}
          </div>

          {/* UV Index */}
          <div className="data-card uvi-card">
            <h3>UV Index</h3>
            {uvi ? (
              <div className="metric-item" style={{ marginBottom: 0 }}>
                <span className="material-symbols-outlined metric-icon" style={{ backgroundColor: "#fef3c7", color: "#f59e0b" }}>wb_sunny</span>
                <div>
                  <p className="metric-label">Current UV Index</p>
                  <p className="metric-value">{uvi.uvi?.toFixed(1) || "N/A"}</p>
                  <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "0.125rem 0 0", fontWeight: 500 }}>
                    {uvi.uvi <= 2 ? "Low" : uvi.uvi <= 5 ? "Moderate" : uvi.uvi <= 7 ? "High" : uvi.uvi <= 10 ? "Very High" : "Extreme"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="data-unavailable">
                <span className="material-symbols-outlined">wb_sunny</span>
                UV index unavailable
              </p>
            )}
          </div>

        </div>

        {/* ── Vegetation Indices ── */}
        <p className="section-heading">
          <span className="material-symbols-outlined">grass</span>
          Vegetation Indices
        </p>
        <div className="data-grid" style={{ marginBottom: "2rem" }}>

          {/* NDVI */}
          <div className="data-card ndvi-card">
            <h3>NDVI — Vegetation Health</h3>
            {sentinelStats?.ndvi && isValidNumber(sentinelStats.ndvi.mean) ? (
              <div className="vegetation-stat-content">
                <div className="vegetation-main-value">
                  <span className="veg-value">{safeToFixed(sentinelStats.ndvi.mean, 3)}</span>
                  <span className="veg-badge" style={{ backgroundColor: sentinelStats.ndvi.mean > 0.5 ? "#22c55e" : sentinelStats.ndvi.mean > 0.3 ? "#eab308" : "#ef4444" }}>
                    {sentinelStats.ndvi.mean > 0.5 ? "Healthy" : sentinelStats.ndvi.mean > 0.3 ? "Moderate" : "Low"}
                  </span>
                </div>
                <p className="veg-description">Normalized Difference Vegetation Index</p>
                <div className="veg-range">
                  <span>Min: {safeToFixed(sentinelStats.ndvi.min, 2)}</span>
                  <span>Max: {safeToFixed(sentinelStats.ndvi.max, 2)}</span>
                </div>
              </div>
            ) : sentinelLoading ? (
              <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Loading NDVI…</p>
            ) : (
              <p className="data-unavailable"><span className="material-symbols-outlined">eco</span>NDVI data unavailable</p>
            )}
          </div>

          {/* SAVI */}
          <div className="data-card savi-card">
            <h3>SAVI — Soil-Adjusted</h3>
            {sentinelStats?.savi && isValidNumber(sentinelStats.savi.mean) ? (
              <div className="vegetation-stat-content">
                <div className="vegetation-main-value">
                  <span className="veg-value">{safeToFixed(sentinelStats.savi.mean, 3)}</span>
                  <span className="veg-badge" style={{ backgroundColor: sentinelStats.savi.mean > 0.4 ? "#22c55e" : sentinelStats.savi.mean > 0.2 ? "#eab308" : "#ef4444" }}>
                    {sentinelStats.savi.mean > 0.4 ? "Good" : sentinelStats.savi.mean > 0.2 ? "Fair" : "Poor"}
                  </span>
                </div>
                <p className="veg-description">Soil-Adjusted Vegetation Index</p>
                <div className="veg-range">
                  <span>Min: {safeToFixed(sentinelStats.savi.min, 2)}</span>
                  <span>Max: {safeToFixed(sentinelStats.savi.max, 2)}</span>
                </div>
              </div>
            ) : sentinelLoading ? (
              <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Loading SAVI…</p>
            ) : (
              <p className="data-unavailable"><span className="material-symbols-outlined">grass</span>SAVI data unavailable</p>
            )}
          </div>

          {/* LAI */}
          <div className="data-card lai-card">
            <h3>LAI — Leaf Area</h3>
            {sentinelStats?.lai && isValidNumber(sentinelStats.lai.mean) ? (
              <div className="vegetation-stat-content">
                <div className="vegetation-main-value">
                  <span className="veg-value">{safeToFixed(sentinelStats.lai.mean, 2)}</span>
                  <span className="veg-badge" style={{ backgroundColor: sentinelStats.lai.mean > 3 ? "#22c55e" : sentinelStats.lai.mean > 1.5 ? "#eab308" : "#ef4444" }}>
                    {sentinelStats.lai.mean > 3 ? "Dense" : sentinelStats.lai.mean > 1.5 ? "Growing" : "Sparse"}
                  </span>
                </div>
                <p className="veg-description">Leaf Area Index</p>
                <div className="veg-range">
                  <span>Min: {safeToFixed(sentinelStats.lai.min, 1)}</span>
                  <span>Max: {safeToFixed(sentinelStats.lai.max, 1)}</span>
                </div>
              </div>
            ) : sentinelLoading ? (
              <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Loading LAI…</p>
            ) : (
              <p className="data-unavailable"><span className="material-symbols-outlined">nature</span>LAI data unavailable</p>
            )}
          </div>

          {/* Moisture */}
          <div className="data-card moisture-card">
            <h3>Plant Moisture — NDMI</h3>
            {sentinelStats?.moisture && isValidNumber(sentinelStats.moisture.mean) ? (
              <div className="vegetation-stat-content">
                <div className="vegetation-main-value">
                  <span className="veg-value">{safeToFixed(sentinelStats.moisture.mean, 3)}</span>
                  <span className="veg-badge" style={{ backgroundColor: sentinelStats.moisture.mean > 0.1 ? "#3b82f6" : sentinelStats.moisture.mean > -0.1 ? "#eab308" : "#ef4444" }}>
                    {sentinelStats.moisture.mean > 0.1 ? "Adequate" : sentinelStats.moisture.mean > -0.1 ? "Normal" : "Dry"}
                  </span>
                </div>
                <p className="veg-description">Normalized Difference Moisture Index</p>
                <div className="veg-range">
                  <span>Min: {safeToFixed(sentinelStats.moisture.min, 2)}</span>
                  <span>Max: {safeToFixed(sentinelStats.moisture.max, 2)}</span>
                </div>
              </div>
            ) : sentinelLoading ? (
              <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Loading moisture…</p>
            ) : (
              <p className="data-unavailable"><span className="material-symbols-outlined">water_drop</span>Moisture data unavailable</p>
            )}
          </div>
        </div>

        {/* ── IoT Sensors ── */}
        <p className="section-heading">
          <span className="material-symbols-outlined">sensors</span>
          IoT Sensors
        </p>
        <div className="data-grid" style={{ marginBottom: "2rem" }}>
          <IoTSensorSection farmId={farmId} />
        </div>

        {/* ── Historical Trends ── */}
        <p className="section-heading">
          <span className="material-symbols-outlined">show_chart</span>
          Historical Trends
        </p>
        <div className="data-grid grid-2col" style={{ marginBottom: "2rem" }}>

          <div className="data-card chart-card">
            <h3>NDVI Trend — Last 30 Days</h3>
            <p className="card-subtitle">Source: AgroMonitoring · Higher values indicate healthier vegetation</p>
            {ndviHistory.length > 0 ? (
              <div className="chart-container"><NdviChart data={ndviHistory} /></div>
            ) : (
              <p className="data-unavailable"><span className="material-symbols-outlined">show_chart</span>No NDVI data available</p>
            )}
          </div>

          {/* Sentinel NDVI History */}
          <div className="data-card chart-card sentinel-chart-card">
            <h3>
              <span className="material-symbols-outlined" style={{ color: "#22c55e", marginRight: "6px", fontSize: "1.1rem", verticalAlign: "middle" }}>show_chart</span>
              NDVI History — Sentinel Hub
            </h3>
            <p className="card-subtitle">60-day vegetation health trend</p>
            {sentinelHistory.ndvi.length > 0 ? (
              <div className="chart-container"><VegetationChart data={sentinelHistory.ndvi} label="NDVI" color="#22c55e" minValue={-0.2} maxValue={1} /></div>
            ) : (
              <p className="data-unavailable"><span className="material-symbols-outlined">show_chart</span>No NDVI history available</p>
            )}
          </div>

          {/* Sentinel SAVI History */}
          <div className="data-card chart-card sentinel-chart-card">
            <h3>
              <span className="material-symbols-outlined" style={{ color: "#10b981", marginRight: "6px", fontSize: "1.1rem", verticalAlign: "middle" }}>grass</span>
              SAVI History — Sentinel Hub
            </h3>
            <p className="card-subtitle">60-day soil-adjusted vegetation trend</p>
            {sentinelHistory.savi.length > 0 ? (
              <div className="chart-container"><VegetationChart data={sentinelHistory.savi} label="SAVI" color="#10b981" minValue={-0.2} maxValue={1.5} /></div>
            ) : (
              <p className="data-unavailable"><span className="material-symbols-outlined">grass</span>No SAVI history available</p>
            )}
          </div>

          {/* Sentinel Moisture History */}
          <div className="data-card chart-card sentinel-chart-card">
            <h3>
              <span className="material-symbols-outlined" style={{ color: "#0ea5e9", marginRight: "6px", fontSize: "1.1rem", verticalAlign: "middle" }}>water_drop</span>
              Moisture History — Sentinel Hub
            </h3>
            <p className="card-subtitle">60-day vegetation moisture trend</p>
            {sentinelHistory.moisture.length > 0 ? (
              <div className="chart-container"><VegetationChart data={sentinelHistory.moisture} label="Moisture" color="#0ea5e9" minValue={-0.5} maxValue={0.5} /></div>
            ) : (
              <p className="data-unavailable"><span className="material-symbols-outlined">water_drop</span>No moisture history available</p>
            )}
          </div>

          {/* Sentinel LAI History */}
          <div className="data-card chart-card sentinel-chart-card">
            <h3>
              <span className="material-symbols-outlined" style={{ color: "#84cc16", marginRight: "6px", fontSize: "1.1rem", verticalAlign: "middle" }}>eco</span>
              LAI History — Sentinel Hub
            </h3>
            <p className="card-subtitle">60-day leaf area index trend</p>
            {sentinelHistory.lai.length > 0 ? (
              <div className="chart-container"><VegetationChart data={sentinelHistory.lai} label="LAI" color="#84cc16" minValue={0} maxValue={8} /></div>
            ) : (
              <p className="data-unavailable"><span className="material-symbols-outlined">eco</span>No LAI history available</p>
            )}
          </div>
        </div>

        {/* ── Imagery ── */}
        <p className="section-heading">
          <span className="material-symbols-outlined">satellite_alt</span>
          Imagery
        </p>
        <div className="data-grid" style={{ marginBottom: "2rem" }}>
          <DroneImagerySection
            farmId={farmId}
            cropType={
              availableCrops.find((c) => c.id === activeCycle?.crop_id)?.name?.toLowerCase() || null
            }
          />
          <SatelliteImagerySection farmId={farmId} coords={farmCoords} />
        </div>

        {/* ── AI Tools ── */}
        <p className="section-heading">
          <span className="material-symbols-outlined">smart_toy</span>
          AI Tools
        </p>
        <div className="data-grid">
          {/* ===== Plant Counter AI Section ===== */}
          <div className="data-card pc-card">
            <div className="pc-header">
              <div className="pc-header-icon">
                <span className="material-symbols-outlined">biotech</span>
              </div>
              <div>
                <h3>Plant Counter AI</h3>
                <p className="card-subtitle">Upload a drone or field image to automatically detect, count, and size-estimate plants using the on-device ML model.</p>
              </div>
            </div>

            {/* Source tabs */}
            {(pcStatus === "idle" || pcStatus === "failed") && (
              <div className="pc-source-tabs">
                <button
                  className={`pc-source-tab ${pcInputMode === "file" ? "active" : ""}`}
                  onClick={() => { setPcInputMode("file"); setPcDriveUrl(""); }}
                >
                  <span className="material-symbols-outlined">upload_file</span>
                  Upload File
                </button>
                <button
                  className={`pc-source-tab ${pcInputMode === "drive" ? "active" : ""}`}
                  onClick={() => { setPcInputMode("drive"); setPcFile(null); if (pcOriginalUrl) { URL.revokeObjectURL(pcOriginalUrl); setPcOriginalUrl(null); } }}
                >
                  <span className="material-symbols-outlined">cloud</span>
                  From Drive / URL
                </button>
              </div>
            )}

            {/* Upload Zone — file mode */}
            {(pcStatus === "idle" || pcStatus === "failed") && pcInputMode === "file" && (
              <div
                className={`pc-upload-zone ${pcDragOver ? "pc-drag-over" : ""} ${pcFile ? "pc-has-file" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setPcDragOver(true); }}
                onDragLeave={() => setPcDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setPcDragOver(false); const f = e.dataTransfer.files[0]; if (f) handlePcFile(f); }}
                onClick={() => document.getElementById("pc-file-input").click()}
              >
                <input id="pc-file-input" type="file" accept="image/*,.tif,.tiff" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) handlePcFile(e.target.files[0]); }} />
                <span className="pc-upload-icon material-symbols-outlined">
                  {pcFile ? "check_circle" : "cloud_upload"}
                </span>
                <p className="pc-upload-title">
                  {pcFile ? pcFile.name : "Drag & drop an image, or click to browse"}
                </p>
                <p className="pc-upload-sub">
                  {pcFile ? `${(pcFile.size / 1024 / 1024).toFixed(2)} MB — ready for analysis` : "Supports JPG, PNG, TIFF · Max 10 GB"}
                </p>
                {pcStatus === "failed" && (
                  <div className="pc-error-banner">
                    <span className="material-symbols-outlined">error</span>
                    <span>{pcMessage}</span>
                  </div>
                )}
              </div>
            )}

            {/* Upload Zone — drive/url mode */}
            {(pcStatus === "idle" || pcStatus === "failed") && pcInputMode === "drive" && (
              <div className="pc-drive-zone">
                <span className="material-symbols-outlined pc-drive-icon">add_link</span>
                <p className="pc-upload-title">Paste a Google Drive link or image URL</p>
                <p className="pc-upload-sub">
                  Share the file with <strong>Anyone with the link</strong>, then paste the URL below.
                  The server downloads it directly — no browser upload needed.
                </p>
                <input
                  className="pc-drive-input"
                  type="url"
                  placeholder="https://drive.google.com/file/d/… or https://example.com/image.tif"
                  value={pcDriveUrl}
                  onChange={(e) => { setPcDriveUrl(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && pcDriveUrl.trim()) startPlantCounting(); }}
                />
                {pcStatus === "failed" && (
                  <div className="pc-error-banner" style={{ marginTop: "0.75rem" }}>
                    <span className="material-symbols-outlined">error</span>
                    <span>{pcMessage}</span>
                  </div>
                )}
              </div>
            )}

            {/* Analyze Button */}
            {(pcStatus === "idle" || pcStatus === "failed") && (pcFile || pcDriveUrl.trim()) && (
              <button className="pc-analyze-btn" onClick={startPlantCounting}>
                <span className="material-symbols-outlined">play_arrow</span>
                Run Analysis
              </button>
            )}

            {/* Progress */}
            {(pcStatus === "uploading" || pcStatus === "processing") && (
              <div className="pc-progress-wrap">
                <div className="pc-status-label">
                  <span className="pc-spinner" />
                  <span>{pcMessage || "Processing..."}</span>
                  <span className="pc-progress-pct-inline">
                    {pcStatus === "uploading" && pcInputMode === "file" && pcUploadProgress > 0
                      ? `${pcUploadProgress}% uploaded`
                      : `${Math.round(pcProgress)}%`}
                  </span>
                </div>
                {pcStatus === "uploading" && pcInputMode === "file" ? (
                  <div className="pc-progress-track">
                    <div className="pc-progress-fill" style={{ width: `${pcUploadProgress}%` }} />
                  </div>
                ) : (
                  <div className="pc-progress-track">
                    <div className="pc-progress-fill" style={{ width: `${pcProgress}%` }} />
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {pcStatus === "completed" && pcResult && (
              <div className="pc-results">
                <div className="pc-section-label">Analysis Summary</div>
                <div className="pc-stats-row">
                  <div className="pc-stat-chip pc-stat-green">
                    <span className="material-symbols-outlined">scatter_plot</span>
                    <div>
                      <p className="pc-stat-val">{pcResult.total_count.toLocaleString()}</p>
                      <p className="pc-stat-lbl">Plants Detected</p>
                    </div>
                  </div>
                  <div className="pc-stat-chip pc-stat-blue">
                    <span className="material-symbols-outlined">straighten</span>
                    <div>
                      <p className="pc-stat-val">{pcResult.average_size?.toFixed(1) ?? "—"} px</p>
                      <p className="pc-stat-lbl">Avg. Plant Size</p>
                    </div>
                  </div>
                  <div className="pc-stat-chip pc-stat-slate">
                    <span className="material-symbols-outlined">schedule</span>
                    <div>
                      <p className="pc-stat-val">{pcResult.processing_time_seconds?.toFixed(1) ?? "—"} s</p>
                      <p className="pc-stat-lbl">Processing Time</p>
                    </div>
                  </div>
                </div>

                <div className="pc-section-label" style={{ marginTop: "1.5rem" }}>Output View</div>
                <div className="pc-tabs">
                  {[
                    { key: "counting",       icon: "location_on", label: "Count Overlay" },
                    { key: "size_annotated", icon: "crop_free",   label: "Size Annotated" },
                    { key: "size_colored",   icon: "palette",     label: "Color Coded" },
                    { key: "heatmap",        icon: "areas",       label: "Density Heatmap" },
                  ].map(({ key, icon, label }) => (
                    <button key={key} className={`pc-tab-btn ${pcOutputType === key ? "active" : ""}`} onClick={() => fetchPcImage(pcJobId, key)}>
                      <span className="material-symbols-outlined">{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>

                <div className="pc-section-label" style={{ marginTop: "1.5rem" }}>Image Comparison</div>
                <div className="pc-comparison-row">
                  <div className="pc-comparison-col">
                    <p className="pc-comparison-label">Original Image</p>
                    {pcOriginalUrl ? (<img className="pc-result-img" src={pcOriginalUrl} alt="Original uploaded image" />) : (<div className="pc-img-loading"><span>No preview</span></div>)}
                  </div>
                  <div className="pc-comparison-col">
                    <p className="pc-comparison-label">AI Output</p>
                    {pcImageUrl ? (<img className="pc-result-img" src={pcImageUrl} alt="Plant counting result" />) : (<div className="pc-img-loading"><span className="pc-spinner" /><span>Loading output image...</span></div>)}
                  </div>
                </div>

                <button className="pc-reset-btn" onClick={() => {
                  setPcFile(null); setPcDriveUrl(""); setPcInputMode("file");
                  setPcStatus("idle"); setPcResult(null);
                  if (pcImageUrl) { URL.revokeObjectURL(pcImageUrl); setPcImageUrl(null); }
                  if (pcOriginalUrl) { URL.revokeObjectURL(pcOriginalUrl); setPcOriginalUrl(null); }
                }}>
                  <span className="material-symbols-outlined">refresh</span>
                  New Analysis
                </button>
              </div>
            )}
          </div>
          {/* ===== End Plant Counter AI Section ===== */}
        </div>
      </main>
      <Modal
        isOpen={isStartCycleModalOpen}
        onClose={() => setIsStartCycleModalOpen(false)}
      >
        <div className="start-cycle-modal">
          <h2>Start a New Crop Cycle</h2>
          <div className="crop-selector">
            <label htmlFor="crop-select">Select a Crop:</label>
            <div className="select-wrapper">
              <select
                id="crop-select"
                value={selectedCropId}
                onChange={(e) => setSelectedCropId(e.target.value)}
              >
                {availableCrops.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="modal-start-btn" onClick={handleStartCycle}>
              Start Cycle
            </button>
          </div>
        </div>
      </Modal>

      <MilestoneVerificationPanel
        isOpen={showConfirmDialog}
        onClose={() => {
          setShowConfirmDialog(false);
          setMilestoneToVerify(null);
          setVerificationResult(null);
          setVerificationError(null);
        }}
        onApprove={handleConfirmApprove}
        onReject={handleManualReject}
        milestone={milestoneToVerify}
        farm={farm}
        sentinelStats={sentinelStats}
        soil={soil}
        currentWeather={currentWeather}
        uvi={uvi}
        farmId={farmId}
        availableCrops={availableCrops}
        activeCycle={activeCycle}
        verificationResult={verificationResult}
        verificationLoading={verificationLoading}
        verificationError={verificationError}
        onRunVerification={handleRunVerification}
      />

    </div>
  );
};

export default FarmDetailsPage;
