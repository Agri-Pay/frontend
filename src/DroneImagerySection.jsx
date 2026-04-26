// src/DroneImagerySection.jsx
/**
 * Drone Imagery Section for Farm Details Page
 * Displays drone imagery with upload and cloud fetch capabilities
 * Uses TiTiler for tile serving with interactive Leaflet map
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "./createclient";
import {
  getPreviewUrl,
  getTileUrl,
  getBounds,
  getStatistics,
  getPointValue,
  checkHealth,
  LAYER_CONFIGS,
  LAYER_CONFIGS_5BAND,
  isLocalMode,
  isTiTilerConfigured,
  computeVegetationIndices,
  getNdviHealthStatus,
  MICASENSE_BANDS,
  MICASENSE_5BAND,
} from "./titiler";
import {
  uploadDroneImagery,
  listDriveFiles,
  importFromDrive,
  ensureStorageBucket,
} from "./droneImageryService";
import {
  login as webodmLogin,
  checkHealth as checkWebODM,
  processImages,
  getTaskStatus,
  TASK_STATUS,
  getStatusLabel,
} from "./webodmService";
import { toast } from "react-hot-toast";
import {
  analyzeByFilename,
  getJobStatus,
  getResultImageBlob,
  getCachedResults,
  saveResults,
  fetchModels,
} from "./computeService";
import "./droneimagery.css";

// Helper component to fit map to bounds
const FitBounds = ({ bounds }) => {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [bounds, map]);

  return null;
};

// Helper component for map click events
const MapClickHandler = ({ onClick }) => {
  useMapEvents({
    click: (e) => {
      if (onClick) {
        onClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
};

const DroneImagerySection = ({ farmId, farmName = "Farm", cropType = null }) => {
  // Refs
  const fileInputRef = useRef(null);
  const rawFilesInputRef = useRef(null);

  // State
  const [serverOnline, setServerOnline] = useState(false);
  const [isLocal, setIsLocal] = useState(false);
  const [webodmOnline, setWebodmOnline] = useState(false);
  const [droneFlights, setDroneFlights] = useState([]);
  const [selectedFlight, setSelectedFlight] = useState(null);
  const [activeLayerType, setActiveLayerType] = useState("rgb");
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Map state
  const [mapBounds, setMapBounds] = useState(null);
  const [layerOpacity, setLayerOpacity] = useState(1.0);
  const [tileUrl, setTileUrl] = useState(null);
  const [pointValue, setPointValue] = useState(null);
  const [layerStats, setLayerStats] = useState(null);
  const [useMapView, setUseMapView] = useState(true); // Toggle between map and image view

  // Multi-layer selection state
  const [selectedLayers, setSelectedLayers] = useState(["rgb"]); // Array of selected layer types
  const [layerDropdownOpen, setLayerDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Returns the right LAYER_CONFIGS dict based on how many bands the file has.
  // 5-band files use different band indices than 10-band files.
  const getLayerConfigs = useCallback(() => {
    const bandCount = selectedFlight?.bands?.length ?? 0;
    return bandCount === 5 ? LAYER_CONFIGS_5BAND : LAYER_CONFIGS;
  }, [selectedFlight]);

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadMode, setUploadMode] = useState("processed"); // "processed" or "raw"
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadForm, setUploadForm] = useState({
    file: null,
    flightDate: new Date().toISOString().split("T")[0],
    layerType: "ndvi",
    pilotName: "",
    droneModel: "",
    bandMapping: null,
    bandPreset: "",
  });

  // Raw image processing state
  const [rawFiles, setRawFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(null);
  const [processingJobs, setProcessingJobs] = useState([]);
  const [webodmToken, setWebodmToken] = useState(null);

  // Drive fetch state (integrated into upload modal)
  const [fileSource, setFileSource] = useState("local"); // "local" | "drive"
  const [driveInput, setDriveInput] = useState("");
  const [driveFiles, setDriveFiles] = useState([]);
  const [driveSelectedFile, setDriveSelectedFile] = useState(null);
  const [driveListLoading, setDriveListLoading] = useState(false);
  const [driveListError, setDriveListError] = useState(null);
  const [uploadPhase, setUploadPhase] = useState("idle"); // idle|downloading|uploading|registering|processing

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [searchingByDate, setSearchingByDate] = useState(false);

  // Plant count analysis state
  const [analysisStatus, setAnalysisStatus] = useState("idle");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisJobId, setAnalysisJobId] = useState(null);
  const [analysisImageUrl, setAnalysisImageUrl] = useState(null);
  const [analysisOutputType, setAnalysisOutputType] = useState("counting");
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);
  const [cachedResult, setCachedResult] = useState(null);
  const analysisPollRef = useRef(null);

  // Model selection state
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setLayerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check TiTiler server health and local mode
  useEffect(() => {
    // Check if we're in local development mode
    setIsLocal(isLocalMode());

    const checkServer = async () => {
      // Only check if TiTiler is configured
      if (!isTiTilerConfigured()) {
        setServerOnline(false);
        return;
      }
      const online = await checkHealth();
      setServerOnline(online);
    };

    checkServer();
    // Recheck every 30 seconds (only in local mode)
    if (isLocalMode()) {
      const interval = setInterval(checkServer, 30000);
      return () => clearInterval(interval);
    }
  }, []);

  // Check WebODM server health
  useEffect(() => {
    const checkWebODMServer = async () => {
      const online = await checkWebODM();
      setWebodmOnline(online);
    };

    checkWebODMServer();
    const interval = setInterval(checkWebODMServer, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch processing jobs
  const fetchProcessingJobs = useCallback(async () => {
    if (!farmId) return;

    try {
      const { data, error } = await supabase
        .from("processing_jobs")
        .select(
          `
          *,
          drone_flights!inner(farm_id)
        `
        )
        .eq("drone_flights.farm_id", farmId)
        .in("status", ["pending", "uploading", "queued", "processing"])
        .order("created_at", { ascending: false });

      if (!error && data) {
        setProcessingJobs(data);
      }
    } catch (error) {
      console.error("Error fetching processing jobs:", error);
    }
  }, [farmId]);

  // Poll processing jobs
  useEffect(() => {
    fetchProcessingJobs();
    const interval = setInterval(fetchProcessingJobs, 10000);
    return () => clearInterval(interval);
  }, [fetchProcessingJobs]);

  // Fetch drone flights from Supabase
  const fetchDroneFlights = useCallback(async () => {
    if (!farmId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("drone_flights")
        .select(
          `
          *,
          drone_imagery_layers(*)
        `
        )
        .eq("farm_id", farmId)
        .order("flight_date", { ascending: false });

      if (error) throw error;

      // Transform data for easier use
      const flights = (data || []).map((flight) => ({
        id: flight.id,
        date: flight.flight_date.replace(/-/g, ""), // Convert to YYYYMMDD
        displayDate: flight.flight_date,
        pilotName: flight.pilot_name,
        droneModel: flight.drone_model,
        altitude: flight.altitude_meters,
        storageLocation: flight.storage_location || "local", // NEW: track storage location
        layers: flight.drone_imagery_layers.map((l) => l.layer_type),
        layersData: flight.drone_imagery_layers,
        // NEW: Get bands (layers where is_band = true)
        bands: flight.drone_imagery_layers
          .filter((l) => l.is_band)
          .sort((a, b) => a.band_number - b.band_number),
      }));

      setDroneFlights(flights);

      if (flights.length > 0) {
        setSelectedFlight(flights[0]);
        // Set first available layer as active (prefer rgb if available)
        const availableLayers = flights[0].layers;
        if (availableLayers.includes("rgb")) {
          setActiveLayerType("rgb");
        } else if (availableLayers.length > 0) {
          setActiveLayerType(availableLayers[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching drone flights:", error);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  // Fetch on mount
  useEffect(() => {
    fetchDroneFlights();
  }, [fetchDroneFlights]);

  // Check cache when selected flight or model changes
  useEffect(() => {
    if (!selectedFlight?.id || !selectedModelId) {
      setCachedResult(null);
      setAnalysisResult(null);
      setAnalysisStatus("idle");
      return;
    }
    const checkCache = async () => {
      setAnalysisStatus("loading_cache");
      const cached = await getCachedResults(selectedFlight.id, selectedModelId);
      if (cached) {
        setCachedResult(cached);
        const rd = cached.result_data || {};
        setAnalysisResult({
          total_count: rd.total_count,
          average_size: rd.average_size,
          processing_time_seconds: cached.processing_time_seconds,
        });
        setAnalysisJobId(cached.job_id);
        setAnalysisStatus("completed");
      } else {
        setCachedResult(null);
        setAnalysisResult(null);
        setAnalysisStatus("idle");
      }
    };
    checkCache();
  }, [selectedFlight?.id, selectedModelId]);

  // Cleanup analysis polling on unmount
  useEffect(() => {
    return () => {
      if (analysisPollRef.current) clearInterval(analysisPollRef.current);
    };
  }, []);

  // Fetch available models for the current crop type
  useEffect(() => {
    if (!cropType) {
      setAvailableModels([]);
      setSelectedModelId(null);
      return;
    }
    const loadModels = async () => {
      setModelsLoading(true);
      try {
        const { models } = await fetchModels(cropType);
        setAvailableModels(models);
        if (models.length > 0) {
          setSelectedModelId(models[0].model_id);
        } else {
          setSelectedModelId(null);
        }
      } catch (err) {
        console.warn("Failed to fetch models:", err.message);
        setAvailableModels([]);
        setSelectedModelId(null);
      } finally {
        setModelsLoading(false);
      }
    };
    loadModels();
  }, [cropType]);

  // Start plant count analysis on current flight image
  const startAnalysis = async () => {
    const filename = getCurrentFilename();
    if (!filename) {
      toast.error("No image available for analysis");
      return;
    }

    if (!selectedModelId) {
      toast.error("No model available for this crop type");
      return;
    }

    setAnalysisStatus("analyzing");
    setAnalysisProgress(0);
    setAnalysisMessage("Submitting analysis job...");
    setAnalysisResult(null);
    setAnalysisImageUrl(null);
    setCachedResult(null);
    setShowAnalysisPanel(true);

    try {
      // Images are on the server disk — just pass the filename, no URL needed
      const { job_id } = await analyzeByFilename(filename, selectedModelId);
      setAnalysisJobId(job_id);
      setAnalysisMessage("Job submitted. Processing...");

      // Poll for status
      analysisPollRef.current = setInterval(async () => {
        try {
          const status = await getJobStatus(job_id);
          setAnalysisProgress(status.progress || 0);
          setAnalysisMessage(status.message || "Processing...");

          if (status.status === "completed") {
            clearInterval(analysisPollRef.current);
            analysisPollRef.current = null;
            setAnalysisResult(status.result);
            setAnalysisStatus("completed");

            // Save to Supabase cache
            const currentLayer = selectedFlight.layersData?.find(
              (l) => l.layer_type === activeLayerType
            );
            await saveResults({
              farmId,
              flightId: selectedFlight.id,
              layerId: currentLayer?.id || null,
              jobId: job_id,
              filename,
              result: status.result,
              modelId: selectedModelId,
            });

            // Load the default visualization
            try {
              const url = await getResultImageBlob(job_id, "counting");
              setAnalysisImageUrl(url);
              setAnalysisOutputType("counting");
            } catch {
              // Visualization may not be available yet
            }
          } else if (status.status === "failed") {
            clearInterval(analysisPollRef.current);
            analysisPollRef.current = null;
            setAnalysisStatus("failed");
            setAnalysisMessage(status.error || "Analysis failed");
          }
        } catch {
          clearInterval(analysisPollRef.current);
          analysisPollRef.current = null;
          setAnalysisStatus("failed");
          setAnalysisMessage("Lost connection to compute server");
        }
      }, 2000);
    } catch (err) {
      setAnalysisStatus("failed");
      setAnalysisMessage(err.message || "Failed to submit analysis job");
    }
  };

  // Fetch a specific visualization type
  const fetchAnalysisImage = async (type) => {
    if (!analysisJobId) return;
    setAnalysisOutputType(type);
    setAnalysisImageUrl(null);
    try {
      const url = await getResultImageBlob(analysisJobId, type);
      setAnalysisImageUrl(url);
    } catch {
      setAnalysisImageUrl(null);
    }
  };

  // Handle file upload
  const handleFileUpload = async () => {
    if (!uploadForm.file) {
      toast.error("Please select a file");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Check compute server is reachable
      const serverReachable = await ensureStorageBucket();
      if (!serverReachable) {
        toast.error(
          "Compute server not reachable. Please check that the server is running."
        );
        return;
      }

      const result = await uploadDroneImagery({
        file: uploadForm.file,
        farmId,
        flightDate: uploadForm.flightDate,
        layerType: uploadForm.layerType,
        bandMapping: uploadForm.bandMapping || null,
        pilotName: uploadForm.pilotName || null,
        droneModel: uploadForm.droneModel || null,
        onProgress: ({ percent }) => setUploadProgress(percent),
      });

      if (result.success) {
        toast.success(
          `Uploaded ${uploadForm.layerType.toUpperCase()} layer successfully!`
        );
        setShowUploadModal(false);
        resetUploadState();
        // Refresh the flights list
        await fetchDroneFlights();
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle Google Drive file listing
  const handleListDriveFiles = async () => {
    if (!driveInput.trim()) {
      toast.error("Please enter a Google Drive link or ID");
      return;
    }

    setDriveListLoading(true);
    setDriveListError(null);
    setDriveFiles([]);
    setDriveSelectedFile(null);

    try {
      const result = await listDriveFiles(driveInput.trim());

      if (result.files.length === 0) {
        const msg = result.skippedCount > 0
          ? `No GeoTIFF files found (${result.skippedCount} non-GeoTIFF file${result.skippedCount > 1 ? "s" : ""} skipped). Only .tif/.tiff files are supported.`
          : "No files found at this location.";
        setDriveListError(msg);
        return;
      }

      setDriveFiles(result.files);
      // Auto-select if only one file
      if (result.files.length === 1) {
        setDriveSelectedFile(result.files[0]);
      }
    } catch (error) {
      console.error("Drive list error:", error);
      setDriveListError(error.message);
    } finally {
      setDriveListLoading(false);
    }
  };

  // Handle Google Drive import
  const handleDriveImport = async () => {
    if (!driveSelectedFile) {
      toast.error("Please select a file from Google Drive");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadPhase("downloading");

    try {
      const result = await importFromDrive(
        {
          fileId: driveSelectedFile.id,
          fileName: driveSelectedFile.name,
          farmId,
          flightDate: uploadForm.flightDate,
          layerType: uploadForm.layerType,
          bandMapping: uploadForm.bandMapping || null,
          pilotName: uploadForm.pilotName || null,
          droneModel: uploadForm.droneModel || null,
        },
        ({ phase, progress }) => {
          setUploadPhase(phase);
          setUploadProgress(progress);
        },
      );

      if (result.success) {
        toast.success(
          `Imported ${uploadForm.layerType.toUpperCase()} layer from Google Drive!`
        );
        setShowUploadModal(false);
        resetUploadState();
        await fetchDroneFlights();
      }
    } catch (error) {
      console.error("Drive import error:", error);
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadPhase("idle");
    }
  };

  // Reset upload form to defaults
  const resetUploadState = () => {
    setUploadForm({
      file: null,
      flightDate: new Date().toISOString().split("T")[0],
      layerType: "ndvi",
      pilotName: "",
      droneModel: "",
      bandMapping: null,
      bandPreset: "",
    });
    setFileSource("local");
    setDriveInput("");
    setDriveFiles([]);
    setDriveSelectedFile(null);
    setDriveListError(null);
  };

  // Handle search by date
  const handleSearchByDate = async () => {
    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }

    setSearchingByDate(true);

    try {
      // Search for flights on the selected date
      const { data, error } = await supabase
        .from("drone_flights")
        .select(
          `
          *,
          drone_imagery_layers(*)
        `
        )
        .eq("farm_id", farmId)
        .eq("flight_date", selectedDate);

      if (error) throw error;

      if (data && data.length > 0) {
        // Found imagery for this date
        const flight = {
          id: data[0].id,
          date: data[0].flight_date.replace(/-/g, ""),
          displayDate: data[0].flight_date,
          pilotName: data[0].pilot_name,
          droneModel: data[0].drone_model,
          altitude: data[0].altitude_meters,
          layers: data[0].drone_imagery_layers.map((l) => l.layer_type),
          layersData: data[0].drone_imagery_layers,
        };

        setSelectedFlight(flight);
        if (flight.layers.length > 0) {
          setActiveLayerType(flight.layers[0]);
        }
        setImageError(false);
        toast.success(`Found imagery from ${formatDate(selectedDate)}`);
        setShowDatePicker(false);
      } else {
        toast.error(`No imagery found for ${formatDate(selectedDate)}`);
      }
    } catch (error) {
      console.error("Date search error:", error);
      toast.error("Failed to search for imagery");
    } finally {
      setSearchingByDate(false);
    }
  };

  // Get available dates for the date picker (dates with imagery)
  const getAvailableDates = useCallback(() => {
    return droneFlights.map((f) => f.displayDate);
  }, [droneFlights]);

  // Handle raw image processing with WebODM
  const handleProcessRawImages = async () => {
    if (rawFiles.length < 3) {
      toast.error("Please select at least 3 images for processing");
      return;
    }

    if (!webodmOnline) {
      toast.error("WebODM is not running. Start it with docker-compose up -d");
      return;
    }

    setProcessing(true);
    setProcessingProgress({ step: "auth", message: "Connecting to WebODM..." });

    try {
      // Login to WebODM
      let token = webodmToken;
      if (!token) {
        token = await webodmLogin();
        setWebodmToken(token);
      }

      // Create a flight record first
      const { data: flight, error: flightError } = await supabase
        .from("drone_flights")
        .insert({
          farm_id: farmId,
          flight_date: uploadForm.flightDate,
          pilot_name: uploadForm.pilotName || null,
          drone_model: uploadForm.droneModel || null,
          status: "processing",
        })
        .select()
        .single();

      if (flightError) throw flightError;

      // Create processing job record
      const { data: job, error: jobError } = await supabase
        .from("processing_jobs")
        .insert({
          flight_id: flight.id,
          status: "uploading",
          images_count: rawFiles.length,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Start processing
      const result = await processImages({
        token,
        farmId,
        farmName,
        images: rawFiles,
        onProgress: async (progress) => {
          setProcessingProgress(progress);

          // Update job progress in DB
          await supabase
            .from("processing_jobs")
            .update({
              status:
                progress.step === "processing"
                  ? "processing"
                  : progress.step === "complete"
                    ? "completed"
                    : "uploading",
              progress: progress.progress || 0,
            })
            .eq("id", job.id);
        },
      });

      // Update job with results
      await supabase
        .from("processing_jobs")
        .update({
          status: "completed",
          progress: 100,
          webodm_project_id: result.projectId,
          webodm_task_id: result.taskId,
          processing_time: result.processingTime,
          completed_at: new Date().toISOString(),
          outputs: {
            orthophoto: result.orthophotoUrl,
            tiles: result.tileUrl,
          },
        })
        .eq("id", job.id);

      // Update flight status
      await supabase
        .from("drone_flights")
        .update({ status: "completed" })
        .eq("id", flight.id);

      toast.success("Processing complete! Orthophoto is ready.");
      setShowUploadModal(false);
      setRawFiles([]);
      await fetchDroneFlights();
    } catch (error) {
      console.error("Processing error:", error);
      toast.error(`Processing failed: ${error.message}`);
      setProcessingProgress({ step: "error", message: error.message });
    } finally {
      setProcessing(false);
    }
  };

  // Build filename for TiTiler
  const getFilename = useCallback(
    (flight, layerType) => {
      // Check if we have specific filename from DB
      const layerData = flight.layersData?.find(
        (l) => l.layer_type === layerType
      );
      if (layerData?.filename) {
        return layerData.filename;
      }
      // Fallback to convention: farmId_date_layerType.tif
      return `${farmId}_${flight.date}_${layerType}.tif`;
    },
    [farmId]
  );

  // Get preview URL - handles both local and cloud storage
  const getPreviewImageUrl = useCallback(() => {
    if (!selectedFlight || !serverOnline) {
      console.log("No selected flight or server offline");
      return null;
    }

    // Get the layer configuration
    const config = getLayerConfigs()[activeLayerType] || {};
    console.log("Active layer type:", activeLayerType, "Config:", config);

    // Get filename from bands or layers
    let filename = null;
    if (selectedFlight.bands && selectedFlight.bands.length > 0) {
      // Use filename from first band (all bands share same file for MicaSense)
      filename = selectedFlight.bands[0]?.filename;
    } else {
      // Fallback: try to find from layersData
      const layerData = selectedFlight.layersData?.find(
        (l) => l.layer_type === activeLayerType
      );
      filename = layerData?.filename;
    }

    if (!filename) {
      console.log("No filename found for layer");
      return null;
    }

    console.log("Using filename:", filename, "Storage:", selectedFlight.storageLocation);

    // All imagery is stored on the server — always use TiTiler with file:// protocol
    return getPreviewUrl(filename, {
      bidx: config.bidx,
      expression: config.expression,
      colormap: config.colormap,
      rescale: config.rescale,
      maxSize: 800,
    });
  }, [selectedFlight, activeLayerType, farmId, serverOnline, getLayerConfigs]);

  // Get filename for the current flight (used by tile URL and other functions)
  const getCurrentFilename = useCallback(() => {
    if (!selectedFlight) return null;

    // Get filename from bands (for multi-band files like MicaSense)
    if (selectedFlight.bands && selectedFlight.bands.length > 0) {
      return selectedFlight.bands[0]?.filename;
    }

    // Fallback: try to find from layersData
    const layerData = selectedFlight.layersData?.find(
      (l) => l.layer_type === activeLayerType
    );
    return layerData?.filename || null;
  }, [selectedFlight, activeLayerType]);

  // Build tile URL for Leaflet map (for a specific layer type)
  const buildTileUrl = useCallback((layerType = activeLayerType) => {
    if (!selectedFlight || !serverOnline) return null;

    const filename = getCurrentFilename();
    if (!filename) return null;

    const config = getLayerConfigs()[layerType] || {};

    return getTileUrl(filename, {
      bidx: config.bidx,
      expression: config.expression,
      colormap: config.colormap,
      rescale: config.rescale,
      nodata: config.nodata, // Add nodata for transparency
    });
  }, [selectedFlight, serverOnline, activeLayerType, getCurrentFilename, getLayerConfigs]);

  // Load bounds and statistics when flight/layer changes
  useEffect(() => {
    if (!selectedFlight || !serverOnline) {
      setTileUrl(null);
      setMapBounds(null);
      setLayerStats(null);
      return;
    }

    const filename = getCurrentFilename();
    if (!filename) {
      setTileUrl(null);
      return;
    }

    // Build tile URL for primary layer (first selected layer)
    const primaryLayer = selectedLayers[0] || activeLayerType;
    const url = buildTileUrl(primaryLayer);
    setTileUrl(url);
    setImageError(false);
    setImageLoading(true);

    // Fetch bounds — try TiTiler first, fall back to DB-stored bounds
    const loadBounds = async () => {
      try {
        const bounds = await getBounds(filename);
        // bounds is [minx, miny, maxx, maxy] = [minLon, minLat, maxLon, maxLat]
        setMapBounds([
          [bounds[1], bounds[0]], // [minLat, minLon]
          [bounds[3], bounds[2]], // [maxLat, maxLon]
        ]);
      } catch (error) {
        console.warn("TiTiler bounds failed, trying DB fallback:", error.message);
        // Fallback: use bounds stored in DB during upload registration
        const layerData = selectedFlight.layersData?.find(
          (l) => l.filename === filename
        );
        const dbBounds = layerData?.bounds;
        if (dbBounds && Array.isArray(dbBounds) && dbBounds.length === 4) {
          setMapBounds([
            [dbBounds[1], dbBounds[0]],
            [dbBounds[3], dbBounds[2]],
          ]);
        } else {
          console.error("No bounds available from TiTiler or DB");
          setImageError(true);
        }
      } finally {
        setImageLoading(false);
      }
    };

    // Fetch statistics
    const loadStats = async () => {
      try {
        const statistics = await getStatistics(filename);
        setLayerStats(statistics);
      } catch (error) {
        console.warn("Statistics not available:", error.message);
      }
    };

    loadBounds();
    loadStats();
  }, [selectedFlight, serverOnline, activeLayerType, selectedLayers, getCurrentFilename, buildTileUrl]);

  // Handle point value click - computes vegetation indices from band values
  const handleMapClick = useCallback(async (lat, lng) => {
    if (!selectedFlight || !serverOnline) return;

    const filename = getCurrentFilename();
    if (!filename) return;

    try {
      const result = await getPointValue(filename, lat, lng);
      const indices = computeVegetationIndices(result.values);
      const healthStatus = indices ? getNdviHealthStatus(indices.ndvi) : null;

      setPointValue({
        lat: lat.toFixed(6),
        lng: lng.toFixed(6),
        indices: indices,
        healthStatus: healthStatus,
        isNoData: indices === null,
      });
    } catch (error) {
      console.error("Error getting point value:", error);
      setPointValue(null);
    }
  }, [selectedFlight, serverOnline, getCurrentFilename]);

  // Fallback: Get preview URL from local files (for backwards compatibility)
  const getLocalPreviewUrl = useCallback(() => {
    if (!selectedFlight || !serverOnline) return null;

    const filename = getFilename(selectedFlight, activeLayerType);
    const config = getLayerConfigs()[activeLayerType] || {};

    return getPreviewUrl(filename, {
      colormap: config.colormap,
      rescale: config.rescale,
      maxSize: 800, // Higher resolution preview
    });
  }, [selectedFlight, activeLayerType, serverOnline, getFilename, getLayerConfigs]);

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Get available layer types for current flight - organized by category
  const getAvailableLayers = () => {
    if (!selectedFlight) return { composites: [], indices: [], bands: [] };

    const bandCount = selectedFlight?.bands?.length ?? 0;

    if (bandCount === 5) {
      // Standard 5-band MicaSense RedEdge: b1=Blue/475, b2=Green/560, b3=Red/668, b4=RE/717, b5=NIR/840
      return {
        composites: ["rgb", "cir", "nrg"],
        indices:    ["ndvi", "ndre", "gndvi"],
        bands:      ["blue", "green", "red", "rededge", "nir"],
      };
    }

    if (bandCount >= 10) {
      // 10-band MicaSense RedEdge-MX Dual: b1-b10
      return {
        composites: ["rgb", "cir", "nrg"],
        indices:    ["ndvi", "ndre", "gndvi"],
        bands: [
          "blue444", "blue",       // Blue bands (1, 2)
          "green531", "green",     // Green bands (3, 4)
          "red650", "red",         // Red bands (5, 6)
          "rededge705", "rededge", "rededge740", // Red Edge bands (7, 8, 9)
          "nir"                    // NIR band (10)
        ],
      };
    }

    // Fallback: use layers from database
    if (selectedFlight.layers && selectedFlight.layers.length > 0) {
      return {
        composites: selectedFlight.layers.filter(l => ["rgb", "cir", "nrg"].includes(l)),
        indices: selectedFlight.layers.filter(l => ["ndvi", "ndre", "gndvi", "moisture", "thermal", "lai"].includes(l)),
        bands: selectedFlight.layers.filter(l => ["blue444", "blue", "green531", "green", "red650", "red", "rededge705", "rededge", "rededge740", "nir"].includes(l)),
      };
    }

    return { composites: ["rgb"], indices: ["ndvi"], bands: [] }; // Default layers
  };

  // Get all available layers as flat array
  const getAllAvailableLayers = () => {
    const layers = getAvailableLayers();
    return [...layers.composites, ...layers.indices, ...layers.bands];
  };

  // Toggle layer selection
  const toggleLayerSelection = (layerType) => {
    setSelectedLayers((prev) => {
      if (prev.includes(layerType)) {
        // Remove layer, but keep at least one
        if (prev.length > 1) {
          return prev.filter((l) => l !== layerType);
        }
        return prev;
      } else {
        // Add layer
        return [...prev, layerType];
      }
    });
    // Update active layer type to the most recently toggled one
    if (!selectedLayers.includes(layerType)) {
      setActiveLayerType(layerType);
    }
    setPointValue(null);
  };

  // Get layer statistics from DB
  const getLayerStats = () => {
    if (!selectedFlight?.layersData) return null;
    const layer = selectedFlight.layersData.find(
      (l) => l.layer_type === activeLayerType
    );
    return layer?.statistics;
  };

  const previewUrl = getPreviewImageUrl();
  const stats = getLayerStats();

  // Loading state
  if (loading) {
    return (
      <div className="data-card drone-imagery-card">
        <div className="image-header">
          <h3>
            <span
              className="material-symbols-outlined"
              style={{ marginRight: "8px" }}
            >
              flight
            </span>
            Drone Imagery
          </h3>
        </div>
        <div className="drone-loading">
          <div className="loader"></div>
          <p>Loading drone flights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="data-card drone-imagery-card">
      <div className="image-header">
        <h3>
          <span
            className="material-symbols-outlined"
            style={{ marginRight: "8px" }}
          >
            flight
          </span>
          Drone Imagery
          {serverOnline ? (
            <span
              className="server-status online"
              title="TiTiler server online"
            >
              ●
            </span>
          ) : (
            <span
              className="server-status offline"
              title={
                isLocal
                  ? "TiTiler server offline - run docker-compose up"
                  : "TiTiler server not reachable"
              }
            >
              ●
            </span>
          )}
        </h3>

        {droneFlights.length > 0 && (
          <div className="flight-selector">
            <select
              value={selectedFlight?.date || ""}
              onChange={(e) => {
                const flight = droneFlights.find(
                  (f) => f.date === e.target.value
                );
                setSelectedFlight(flight);
                setImageError(false);
              }}
            >
              {droneFlights.map((flight) => (
                <option key={flight.id} value={flight.date}>
                  {formatDate(flight.displayDate)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="drone-actions">
        <button
          className="drone-action-btn upload-btn"
          onClick={() => setShowUploadModal(true)}
          title="Upload GeoTIFF file"
        >
          <span className="material-symbols-outlined">upload_file</span>
          Upload Image
        </button>
        <button
          className="drone-action-btn date-btn"
          onClick={() => setShowDatePicker(true)}
          title="Find imagery by date"
        >
          <span className="material-symbols-outlined">calendar_month</span>
          By Date
        </button>
        <button
          className="drone-action-btn drive-btn"
          onClick={() => {
            setFileSource("drive");
            setUploadMode("processed");
            setShowUploadModal(true);
          }}
          title="Fetch from Google Drive"
        >
          <span className="material-symbols-outlined">cloud_download</span>
          Get from Drive
        </button>
        <button
          className="drone-action-btn refresh-btn"
          onClick={fetchDroneFlights}
          disabled={loading}
          title="Refresh imagery list"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>

      {/* Processing Jobs Status */}
      {processingJobs.length > 0 && (
        <div className="processing-jobs-section">
          <h4>
            <span className="material-symbols-outlined">sync</span>
            Processing Jobs
          </h4>
          {processingJobs.map((job) => (
            <div key={job.id} className="processing-job-item">
              <div className="job-info">
                <span className="job-status">{job.status}</span>
                <span className="job-images">{job.images_count} images</span>
              </div>
              <div className="job-progress">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${job.progress || 0}%` }}
                  ></div>
                </div>
                <span className="progress-text">
                  {Math.round(job.progress || 0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Layer Type Toggle */}
      {droneFlights.length > 0 && (
        <div className="layer-controls-section">
          {/* View Toggle */}
          <div className="view-toggle">
            <button
              className={useMapView ? "active" : ""}
              onClick={() => setUseMapView(true)}
              title="Interactive map view"
            >
              <span className="material-symbols-outlined">map</span>
              Map
            </button>
            <button
              className={!useMapView ? "active" : ""}
              onClick={() => setUseMapView(false)}
              title="Simple image preview"
            >
              <span className="material-symbols-outlined">image</span>
              Image
            </button>
          </div>

          {/* Layer Selection Dropdown */}
          <div className="layer-dropdown-container" ref={dropdownRef}>
            <button
              className="layer-dropdown-trigger"
              onClick={() => setLayerDropdownOpen(!layerDropdownOpen)}
            >
              <span className="material-symbols-outlined">layers</span>
              <span className="dropdown-label">
                {selectedLayers.length === 1
                  ? getLayerConfigs()[selectedLayers[0]]?.name || selectedLayers[0]
                  : `${selectedLayers.length} Layers Selected`}
              </span>
              <span className="material-symbols-outlined dropdown-arrow">
                {layerDropdownOpen ? "expand_less" : "expand_more"}
              </span>
            </button>

            {layerDropdownOpen && (
              <div className="layer-dropdown-menu">
                {/* Composites */}
                {getAvailableLayers().composites.length > 0 && (
                  <div className="layer-group">
                    <div className="layer-group-header">
                      <span className="material-symbols-outlined">photo_library</span>
                      Band Composites
                    </div>
                    {getAvailableLayers().composites.map((layerType) => {
                      const config = getLayerConfigs()[layerType] || { name: layerType };
                      return (
                        <label key={layerType} className="layer-checkbox-item">
                          <input
                            type="checkbox"
                            checked={selectedLayers.includes(layerType)}
                            onChange={() => toggleLayerSelection(layerType)}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="layer-name">{config.name}</span>
                          <span className="layer-description">{config.description}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Vegetation Indices */}
                {getAvailableLayers().indices.length > 0 && (
                  <div className="layer-group">
                    <div className="layer-group-header">
                      <span className="material-symbols-outlined">eco</span>
                      Vegetation Indices
                    </div>
                    {getAvailableLayers().indices.map((layerType) => {
                      const config = getLayerConfigs()[layerType] || { name: layerType };
                      return (
                        <label key={layerType} className="layer-checkbox-item">
                          <input
                            type="checkbox"
                            checked={selectedLayers.includes(layerType)}
                            onChange={() => toggleLayerSelection(layerType)}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="layer-name">{config.name}</span>
                          <span className="layer-description">{config.description}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Individual Bands */}
                {getAvailableLayers().bands.length > 0 && (
                  <div className="layer-group">
                    <div className="layer-group-header">
                      <span className="material-symbols-outlined">tune</span>
                      Individual Bands
                    </div>
                    {getAvailableLayers().bands.map((layerType) => {
                      const config = getLayerConfigs()[layerType] || { name: layerType };
                      return (
                        <label key={layerType} className="layer-checkbox-item">
                          <input
                            type="checkbox"
                            checked={selectedLayers.includes(layerType)}
                            onChange={() => toggleLayerSelection(layerType)}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="layer-name">{config.name}</span>
                          <span className="layer-description">{config.description}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Clear All / Select All */}
                <div className="layer-dropdown-actions">
                  <button
                    onClick={() => {
                      const allLayers = getAllAvailableLayers();
                      if (selectedLayers.length === allLayers.length) {
                        setSelectedLayers(["rgb"]); // Reset to default
                      } else {
                        setSelectedLayers(allLayers);
                      }
                    }}
                  >
                    {selectedLayers.length === getAllAvailableLayers().length
                      ? "Clear All"
                      : "Select All"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Selected Layers Tags */}
          {selectedLayers.length > 0 && (
            <div className="selected-layers-tags">
              {selectedLayers.map((layerType, index) => {
                const config = getLayerConfigs()[layerType] || { name: layerType };
                return (
                  <span
                    key={layerType}
                    className={`layer-tag ${layerType === activeLayerType ? "active" : ""}`}
                    onClick={() => setActiveLayerType(layerType)}
                    title={`Click to set as primary layer (for preview/click values)`}
                  >
                    <span className="layer-order">{index + 1}</span>
                    {config.name}
                    {selectedLayers.length > 1 && (
                      <button
                        className="remove-layer"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerSelection(layerType);
                        }}
                      >
                        <span className="material-symbols-outlined">close</span>
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {/* Opacity Slider (only for map view) */}
          {useMapView && (
            <div className="opacity-control">
              <label>
                <span className="material-symbols-outlined">opacity</span>
                Opacity: {Math.round(layerOpacity * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={layerOpacity}
                onChange={(e) => setLayerOpacity(parseFloat(e.target.value))}
              />
            </div>
          )}
        </div>
      )}

      {/* Map/Image Display */}
      <div className="drone-image-container">
        {!serverOnline ? (
          <div className="drone-placeholder">
            <span className="material-symbols-outlined">cloud_off</span>
            <p>TiTiler server is offline</p>
            <small>
              {isLocal
                ? "Run docker-compose up -d in the titiler-local folder"
                : "The imagery server is not reachable. Check that the server and tunnel are running."}
            </small>
          </div>
        ) : droneFlights.length === 0 ? (
          <div className="drone-placeholder">
            <span className="material-symbols-outlined">flight</span>
            <p>No drone imagery available</p>
            <small>Add GeoTIFF files to the imagery folder</small>
          </div>
        ) : imageError ? (
          <div className="drone-placeholder">
            <span className="material-symbols-outlined">broken_image</span>
            <p>Could not load {activeLayerType.toUpperCase()} layer</p>
            <small>Check that the file exists on the server in the imagery directory</small>
          </div>
        ) : useMapView && mapBounds && tileUrl ? (
          /* Interactive Map View */
          <div className="drone-map-container">
            {imageLoading && (
              <div className="image-loading-overlay">
                <div className="loader"></div>
              </div>
            )}
            <MapContainer
              bounds={mapBounds}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={true}
              doubleClickZoom={true}
              maxZoom={28}
              minZoom={10}
            >
              {/* Base map layer - using ESRI satellite which supports higher zoom */}
              <TileLayer
                attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={23}
                maxNativeZoom={19}
              />
              {/* Render selected layers.
                  When 2-3 single bands are chosen, combine into ONE RGB tile so they form
                  a proper composite (avoids the top-layer-covers-everything problem).
                  When indices / composites are selected alongside others, render separately
                  at reduced opacity so all layers are visible. */}
              {(() => {
                const configs = getLayerConfigs();
                const singleBandLayers = selectedLayers.filter(
                  (lt) => configs[lt]?.bidx && !configs[lt]?.expression && configs[lt].bidx.split(",").length === 1
                );
                const complexLayers = selectedLayers.filter(
                  (lt) => !singleBandLayers.includes(lt)
                );
                const filename = getCurrentFilename();

                // --- Case 1: 2–3 single bands only → one merged RGB tile ---
                if (singleBandLayers.length >= 2 && complexLayers.length === 0 && filename) {
                  const bandBidx = singleBandLayers.slice(0, 3).map((lt) => configs[lt].bidx).join(",");
                  const combinedUrl = getTileUrl(filename, { bidx: bandBidx, rescale: "500,10000", nodata: 65535 });
                  return (
                    <TileLayer
                      key="combined-bands"
                      url={combinedUrl}
                      opacity={layerOpacity}
                      tms={false}
                      maxZoom={28}
                      maxNativeZoom={24}
                      zIndex={100}
                      eventHandlers={{
                        load: () => setImageLoading(false),
                        tileerror: (e) => console.error("Tile error: combined bands", e),
                      }}
                    />
                  );
                }

                // --- Case 2: indices / composites (or single band alone) → separate layers ---
                const perLayerOpacity = selectedLayers.length > 1 ? layerOpacity * 0.8 : layerOpacity;
                return selectedLayers.map((layerType, index) => {
                  const layerTileUrl = buildTileUrl(layerType);
                  if (!layerTileUrl) return null;
                  return (
                    <TileLayer
                      key={layerType}
                      url={layerTileUrl}
                      opacity={perLayerOpacity}
                      tms={false}
                      maxZoom={28}
                      maxNativeZoom={24}
                      zIndex={100 + index}
                      eventHandlers={{
                        load: () => index === 0 && setImageLoading(false),
                        tileerror: (e) => console.error("Tile load error for", layerType, e),
                      }}
                    />
                  );
                });
              })()}
              <FitBounds bounds={mapBounds} />
              <MapClickHandler onClick={handleMapClick} />
            </MapContainer>

            {/* Point Value Display - Vegetation Indices */}
            {pointValue && (
              <div className="point-value-display">
                <button
                  className="close-point-value"
                  onClick={() => setPointValue(null)}
                  title="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>

                <div className="point-header">
                  <span className="material-symbols-outlined">location_on</span>
                  <span className="coords-text">
                    {pointValue.lat}, {pointValue.lng}
                  </span>
                </div>

                {pointValue.isNoData ? (
                  <div className="point-nodata">
                    <span className="material-symbols-outlined">block</span>
                    <span>No data at this location</span>
                  </div>
                ) : pointValue.indices ? (
                  <>
                    {/* Health Status Badge */}
                    <div
                      className="health-status-badge"
                      style={{ backgroundColor: pointValue.healthStatus?.color }}
                    >
                      {pointValue.healthStatus?.label}
                    </div>

                    {/* Vegetation Indices Grid */}
                    <div className="indices-grid">
                      <div className="index-item">
                        <span className="index-label">NDVI</span>
                        <span className="index-value">
                          {pointValue.indices.ndvi?.toFixed(3) ?? "N/A"}
                        </span>
                      </div>
                      <div className="index-item">
                        <span className="index-label">NDRE</span>
                        <span className="index-value">
                          {pointValue.indices.ndre?.toFixed(3) ?? "N/A"}
                        </span>
                      </div>
                      <div className="index-item">
                        <span className="index-label">GNDVI</span>
                        <span className="index-value">
                          {pointValue.indices.gndvi?.toFixed(3) ?? "N/A"}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="point-nodata">
                    <span>Click on imagery to see values</span>
                  </div>
                )}
              </div>
            )}

            {/* Layer Legend */}
            {selectedLayers.length > 1 && (
              <div className="map-layer-legend">
                <div className="legend-title">Active Layers</div>
                {selectedLayers.map((layerType, index) => {
                  const config = getLayerConfigs()[layerType] || { name: layerType };
                  return (
                    <div key={layerType} className="legend-item">
                      <span className="legend-order">{index + 1}</span>
                      <span className="legend-name">{config.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Static Image Preview */
          <>
            {imageLoading && (
              <div className="image-loading-overlay">
                <div className="loader"></div>
              </div>
            )}
            <img
              src={previewUrl}
              alt={`${activeLayerType.toUpperCase()} drone imagery`}
              className="drone-image"
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                setImageError(true);
              }}
            />
          </>
        )}
      </div>

      {/* Statistics */}
      {layerStats && !imageError && (
        <div className="drone-stats">
          {Object.entries(layerStats).slice(0, 1).map(([bandKey, bandStats]) => (
            <React.Fragment key={bandKey}>
              <div className="stat-item">
                <span className="stat-label">Min</span>
                <span className="stat-value">{bandStats.min?.toFixed(3) || "N/A"}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Max</span>
                <span className="stat-value">{bandStats.max?.toFixed(3) || "N/A"}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Mean</span>
                <span className="stat-value">{bandStats.mean?.toFixed(3) || "N/A"}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Std</span>
                <span className="stat-value">{bandStats.std?.toFixed(3) || "N/A"}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Plant Count Analysis */}
      {selectedFlight && droneFlights.length > 0 && (
        <div className="drone-analysis-section">
          <div
            className="analysis-header"
            onClick={() => setShowAnalysisPanel(!showAnalysisPanel)}
          >
            <span className="material-symbols-outlined">biotech</span>
            <span className="analysis-header-title">Plant Count Analysis</span>
            {analysisResult && (
              <span className="analysis-badge">
                {analysisResult.total_count?.toLocaleString()} plants
              </span>
            )}
            <span className="material-symbols-outlined analysis-chevron">
              {showAnalysisPanel ? "expand_less" : "expand_more"}
            </span>
          </div>

          {showAnalysisPanel && (
            <div className="analysis-panel">
              {/* Idle — show analyze button */}
              {(analysisStatus === "idle" || analysisStatus === "loading_cache") && (
                <div className="analysis-idle">
                  <p className="analysis-description">
                    Run ML plant counting on this drone image to detect and count
                    individual plants.
                  </p>
                  {availableModels.length > 0 && (
                    <div className="model-selector" style={{ marginBottom: "0.75rem" }}>
                      <label style={{ fontSize: "0.85rem", marginRight: "0.5rem" }}>Model:</label>
                      <select
                        value={selectedModelId || ""}
                        onChange={(e) => setSelectedModelId(e.target.value)}
                        disabled={analysisStatus === "analyzing"}
                        style={{ fontSize: "0.85rem", padding: "0.25rem 0.5rem" }}
                      >
                        {availableModels.map((m) => (
                          <option key={m.model_id} value={m.model_id}>
                            {m.name} (v{m.version})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {availableModels.length === 0 && cropType && !modelsLoading && (
                    <p className="analysis-description" style={{ color: "var(--text-secondary)" }}>
                      No ML models available for crop: {cropType}
                    </p>
                  )}
                  <button
                    className="analyze-btn"
                    onClick={startAnalysis}
                    disabled={analysisStatus === "loading_cache" || !selectedModelId}
                  >
                    <span className="material-symbols-outlined">query_stats</span>
                    {analysisStatus === "loading_cache"
                      ? "Checking cache..."
                      : "Analyze Image"}
                  </button>
                </div>
              )}

              {/* Analyzing — show progress */}
              {analysisStatus === "analyzing" && (
                <div className="analysis-progress">
                  <div className="pc-progress-track">
                    <div
                      className="pc-progress-fill"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                  <div className="analysis-progress-info">
                    <span className="pc-spinner" />
                    <span>{analysisMessage}</span>
                    <span className="analysis-pct">{analysisProgress}%</span>
                  </div>
                </div>
              )}

              {/* Failed */}
              {analysisStatus === "failed" && (
                <div className="analysis-failed">
                  <span className="material-symbols-outlined">error</span>
                  <span>{analysisMessage}</span>
                  <button className="re-analyze-btn" onClick={startAnalysis}>
                    Retry
                  </button>
                </div>
              )}

              {/* Completed — show results */}
              {analysisStatus === "completed" && analysisResult && (
                <div className="analysis-results">
                  {/* Stats row */}
                  <div className="pc-stats-row">
                    <div className="pc-stat-chip pc-stat-green">
                      <span className="material-symbols-outlined">eco</span>
                      <div>
                        <span className="pc-stat-val">
                          {analysisResult.total_count?.toLocaleString()}
                        </span>
                        <span className="pc-stat-lbl">Plants</span>
                      </div>
                    </div>
                    <div className="pc-stat-chip pc-stat-blue">
                      <span className="material-symbols-outlined">straighten</span>
                      <div>
                        <span className="pc-stat-val">
                          {analysisResult.average_size?.toFixed(1) ?? "—"}
                        </span>
                        <span className="pc-stat-lbl">Avg Size (px)</span>
                      </div>
                    </div>
                    <div className="pc-stat-chip pc-stat-slate">
                      <span className="material-symbols-outlined">timer</span>
                      <div>
                        <span className="pc-stat-val">
                          {analysisResult.processing_time_seconds?.toFixed(1) ?? "—"}s
                        </span>
                        <span className="pc-stat-lbl">Time</span>
                      </div>
                    </div>
                  </div>

                  {/* Cached indicator */}
                  {cachedResult && (
                    <div className="cached-indicator">
                      <span className="material-symbols-outlined">cached</span>
                      Cached result from{" "}
                      {new Date(cachedResult.analyzed_at).toLocaleString()}
                    </div>
                  )}

                  {/* Re-analyze button */}
                  <button className="re-analyze-btn" onClick={startAnalysis}>
                    <span className="material-symbols-outlined">refresh</span>
                    Re-analyze
                  </button>

                  {/* Visualization tabs */}
                  {analysisJobId && (
                    <>
                      <div className="pc-tabs">
                        {[
                          { key: "counting", icon: "tag", label: "Count" },
                          { key: "size_annotated", icon: "straighten", label: "Size" },
                          { key: "size_colored", icon: "palette", label: "Color" },
                          { key: "heatmap", icon: "thermostat", label: "Heatmap" },
                        ].map((tab) => (
                          <button
                            key={tab.key}
                            className={`pc-tab-btn ${
                              analysisOutputType === tab.key ? "active" : ""
                            }`}
                            onClick={() => fetchAnalysisImage(tab.key)}
                          >
                            <span className="material-symbols-outlined">
                              {tab.icon}
                            </span>
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      {analysisImageUrl ? (
                        <img
                          src={analysisImageUrl}
                          alt={`${analysisOutputType} visualization`}
                          className="pc-result-img"
                        />
                      ) : (
                        <div className="viz-unavailable">
                          <span className="material-symbols-outlined">
                            image_not_supported
                          </span>
                          <span>
                            Click a tab to load visualization, or images may have
                            expired (2hr TTL).
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Flight Info */}
      {selectedFlight && droneFlights.length > 0 && (
        <div className="flight-info">
          {selectedFlight.droneModel && (
            <span className="info-chip">
              <span className="material-symbols-outlined">adb</span>
              {selectedFlight.droneModel}
            </span>
          )}
          {selectedFlight.altitude && (
            <span className="info-chip">
              <span className="material-symbols-outlined">height</span>
              {selectedFlight.altitude}m
            </span>
          )}
          {selectedFlight.pilotName && (
            <span className="info-chip">
              <span className="material-symbols-outlined">person</span>
              {selectedFlight.pilotName}
            </span>
          )}
        </div>
      )}

      {/* Layer Legend */}
      {!imageError && droneFlights.length > 0 && (
        <div className="drone-legend">
          {activeLayerType === "ndvi" && (
            <>
              <div className="legend-gradient ndvi-gradient"></div>
              <div className="legend-labels">
                <span>-1 (Bare/Water)</span>
                <span>0 (Soil)</span>
                <span>+1 (Dense Vegetation)</span>
              </div>
            </>
          )}
          {activeLayerType === "moisture" && (
            <>
              <div className="legend-gradient moisture-gradient"></div>
              <div className="legend-labels">
                <span>0 (Dry)</span>
                <span>1 (Wet)</span>
              </div>
            </>
          )}
          {activeLayerType === "thermal" && (
            <>
              <div className="legend-gradient thermal-gradient"></div>
              <div className="legend-labels">
                <span>20°C (Cool)</span>
                <span>45°C (Hot)</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Upload Modal - Rendered via Portal to avoid z-index issues */}
      {showUploadModal &&
        createPortal(
          <div
            className="drone-modal-overlay"
            onClick={() => !processing && setShowUploadModal(false)}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseOver={(e) => e.stopPropagation()}
          >
            <div
              className="drone-modal drone-modal-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="drone-modal-header">
                <h3>Upload Drone Imagery</h3>
                <button
                  className="close-btn"
                  onClick={() => setShowUploadModal(false)}
                  disabled={processing}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Upload Mode Toggle */}
              <div className="upload-mode-toggle">
                <button
                  className={uploadMode === "processed" ? "active" : ""}
                  onClick={() => setUploadMode("processed")}
                  disabled={processing}
                >
                  <span className="material-symbols-outlined">image</span>
                  Pre-processed GeoTIFF
                </button>
                <button
                  className={uploadMode === "raw" ? "active" : ""}
                  onClick={() => setUploadMode("raw")}
                  disabled={processing}
                >
                  <span className="material-symbols-outlined">
                    photo_library
                  </span>
                  Raw Images (Process with WebODM)
                </button>
              </div>

              <div className="drone-modal-content">
                {/* Common fields */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Flight Date *</label>
                    <input
                      type="date"
                      value={uploadForm.flightDate}
                      onChange={(e) =>
                        setUploadForm({
                          ...uploadForm,
                          flightDate: e.target.value,
                        })
                      }
                      disabled={processing}
                    />
                  </div>
                  <div className="form-group">
                    <label>Pilot Name</label>
                    <input
                      type="text"
                      placeholder="Optional"
                      value={uploadForm.pilotName}
                      onChange={(e) =>
                        setUploadForm({
                          ...uploadForm,
                          pilotName: e.target.value,
                        })
                      }
                      disabled={processing}
                    />
                  </div>
                  <div className="form-group">
                    <label>Drone Model</label>
                    <input
                      type="text"
                      placeholder="e.g., DJI Mavic 3"
                      value={uploadForm.droneModel}
                      onChange={(e) =>
                        setUploadForm({
                          ...uploadForm,
                          droneModel: e.target.value,
                        })
                      }
                      disabled={processing}
                    />
                  </div>
                </div>

                {/* Processed GeoTIFF Upload */}
                {uploadMode === "processed" && (
                  <>
                    {/* File Source Toggle */}
                    <div className="file-source-toggle">
                      <button
                        className={fileSource === "local" ? "active" : ""}
                        onClick={() => {
                          setFileSource("local");
                          setDriveInput("");
                          setDriveFiles([]);
                          setDriveSelectedFile(null);
                          setDriveListError(null);
                        }}
                        disabled={uploading}
                      >
                        <span className="material-symbols-outlined">upload_file</span>
                        Local File
                      </button>
                      <button
                        className={fileSource === "drive" ? "active" : ""}
                        onClick={() => {
                          setFileSource("drive");
                          setUploadForm({ ...uploadForm, file: null });
                        }}
                        disabled={uploading}
                      >
                        <span className="material-symbols-outlined">cloud_download</span>
                        Google Drive
                      </button>
                    </div>

                    {/* Local File Input */}
                    {fileSource === "local" && (
                      <div className="form-group">
                        <label>GeoTIFF File *</label>
                        <div className="file-input-wrapper">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".tif,.tiff,image/tiff"
                            onChange={(e) =>
                              setUploadForm({
                                ...uploadForm,
                                file: e.target.files[0],
                              })
                            }
                          />
                          {uploadForm.file && (
                            <span className="file-name">
                              {uploadForm.file.name}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Google Drive File Source */}
                    {fileSource === "drive" && (
                      <div className="drive-source-section">
                        <div className="form-group">
                          <label>Google Drive Link *</label>
                          <div className="drive-input-row">
                            <input
                              type="text"
                              placeholder="Paste Drive file link, folder link, or ID"
                              value={driveInput}
                              onChange={(e) => {
                                setDriveInput(e.target.value);
                                setDriveListError(null);
                              }}
                              disabled={uploading || driveListLoading}
                            />
                            <button
                              className="drive-list-btn"
                              onClick={handleListDriveFiles}
                              disabled={uploading || driveListLoading || !driveInput.trim()}
                            >
                              {driveListLoading ? (
                                <div className="loader small"></div>
                              ) : (
                                <span className="material-symbols-outlined">search</span>
                              )}
                              {driveListLoading ? "Searching..." : "Find Files"}
                            </button>
                          </div>
                          <small className="input-help">
                            Accepts file links, folder links, or raw IDs. Folder must be shared with "Anyone with the link".
                          </small>
                        </div>

                        {/* Drive Error */}
                        {driveListError && (
                          <div className="drive-error">
                            <span className="material-symbols-outlined">error</span>
                            <span>{driveListError}</span>
                          </div>
                        )}

                        {/* Drive File List (multiple files in folder) */}
                        {driveFiles.length > 1 && (
                          <div className="drive-file-list">
                            <label>Select a GeoTIFF file:</label>
                            <div className="drive-file-table">
                              {driveFiles.map((f) => (
                                <label
                                  key={f.id}
                                  className={`drive-file-row ${driveSelectedFile?.id === f.id ? "selected" : ""}`}
                                >
                                  <input
                                    type="radio"
                                    name="driveFile"
                                    checked={driveSelectedFile?.id === f.id}
                                    onChange={() => setDriveSelectedFile(f)}
                                  />
                                  <span className="drive-file-name">{f.name}</span>
                                  <span className="drive-file-size">
                                    {f.size > 0 ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` : "—"}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Single file auto-selected */}
                        {driveSelectedFile && driveFiles.length <= 1 && (
                          <div className="drive-file-selected">
                            <span className="material-symbols-outlined">check_circle</span>
                            <span>
                              {driveSelectedFile.name}
                              {driveSelectedFile.size > 0 && (
                                <> — {(driveSelectedFile.size / (1024 * 1024)).toFixed(1)} MB</>
                              )}
                            </span>
                          </div>
                        )}

                        <div className="info-box" style={{ marginTop: "10px" }}>
                          <span className="material-symbols-outlined">info</span>
                          <div>
                            <strong>Supported format:</strong> GeoTIFF (.tif, .tiff) only.
                            <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "#888" }}>
                              JPEG/PNG files cannot be used — GeoTIFF is required for georeferenced map display.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Layer Type *</label>
                      <select
                        value={uploadForm.layerType}
                        onChange={(e) => {
                          const newType = e.target.value;
                          setUploadForm({
                            ...uploadForm,
                            layerType: newType,
                            bandMapping: null,
                            bandPreset: "",
                          });
                        }}
                      >
                        <option value="rgb">True Color (RGB)</option>
                        <option value="ndvi">NDVI</option>
                        <option value="ndre">NDRE</option>
                        <option value="moisture">Moisture</option>
                        <option value="thermal">Thermal</option>
                        <option value="lai">LAI</option>
                        <option value="gndvi">GNDVI</option>
                        <option value="multispectral">Multispectral (Multi-band)</option>
                      </select>
                    </div>

                    {/* Band mapping UI for multispectral uploads */}
                    {uploadForm.layerType === "multispectral" && (
                      <div className="form-group">
                        <label>Band Preset</label>
                        <select
                          value={uploadForm.bandPreset}
                          onChange={(e) => {
                            const preset = e.target.value;
                            let mapping = null;
                            if (preset === "micasense_10") {
                              mapping = Object.entries(MICASENSE_BANDS).map(
                                ([num, b]) => ({
                                  band_number: parseInt(num),
                                  band_name: b.name,
                                  wavelength: b.wavelength,
                                })
                              );
                            } else if (preset === "micasense_5") {
                              mapping = Object.entries(MICASENSE_5BAND).map(
                                ([num, b]) => ({
                                  band_number: parseInt(num),
                                  band_name: b.name,
                                  wavelength: b.wavelength,
                                })
                              );
                            } else if (preset === "custom") {
                              mapping = [
                                { band_number: 1, band_name: "", wavelength: "" },
                                { band_number: 2, band_name: "", wavelength: "" },
                                { band_number: 3, band_name: "", wavelength: "" },
                              ];
                            }
                            setUploadForm({
                              ...uploadForm,
                              bandPreset: preset,
                              bandMapping: mapping,
                            });
                          }}
                        >
                          <option value="">Auto-detect from file</option>
                          <option value="micasense_10">
                            MicaSense RedEdge-MX Dual (10 bands)
                          </option>
                          <option value="micasense_5">
                            MicaSense RedEdge (5 bands)
                          </option>
                          <option value="custom">Custom band mapping</option>
                        </select>

                        {uploadForm.bandMapping && (
                          <div className="band-mapping-table" style={{ marginTop: "10px" }}>
                            <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ddd" }}>#</th>
                                  <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ddd" }}>Band Name</th>
                                  <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ddd" }}>Wavelength</th>
                                  {uploadForm.bandPreset === "custom" && (
                                    <th style={{ padding: "4px 8px", borderBottom: "1px solid #ddd" }}></th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {uploadForm.bandMapping.map((band, idx) => (
                                  <tr key={idx}>
                                    <td style={{ padding: "4px 8px" }}>{band.band_number}</td>
                                    <td style={{ padding: "4px 8px" }}>
                                      {uploadForm.bandPreset === "custom" ? (
                                        <input
                                          type="text"
                                          value={band.band_name}
                                          placeholder="e.g. Blue"
                                          style={{ width: "100%", padding: "2px 4px" }}
                                          onChange={(e) => {
                                            const updated = [...uploadForm.bandMapping];
                                            updated[idx] = { ...updated[idx], band_name: e.target.value };
                                            setUploadForm({ ...uploadForm, bandMapping: updated });
                                          }}
                                        />
                                      ) : (
                                        band.band_name
                                      )}
                                    </td>
                                    <td style={{ padding: "4px 8px" }}>
                                      {uploadForm.bandPreset === "custom" ? (
                                        <input
                                          type="text"
                                          value={band.wavelength}
                                          placeholder="e.g. 475nm"
                                          style={{ width: "100%", padding: "2px 4px" }}
                                          onChange={(e) => {
                                            const updated = [...uploadForm.bandMapping];
                                            updated[idx] = { ...updated[idx], wavelength: e.target.value };
                                            setUploadForm({ ...uploadForm, bandMapping: updated });
                                          }}
                                        />
                                      ) : (
                                        band.wavelength
                                      )}
                                    </td>
                                    {uploadForm.bandPreset === "custom" && (
                                      <td style={{ padding: "4px 8px" }}>
                                        {uploadForm.bandMapping.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = uploadForm.bandMapping.filter((_, i) => i !== idx);
                                              setUploadForm({ ...uploadForm, bandMapping: updated });
                                            }}
                                            style={{ border: "none", background: "none", cursor: "pointer", color: "#e53e3e", fontSize: "1rem" }}
                                            title="Remove band"
                                          >
                                            &times;
                                          </button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {uploadForm.bandPreset === "custom" && (
                              <button
                                type="button"
                                onClick={() => {
                                  const nextNum = uploadForm.bandMapping.length + 1;
                                  setUploadForm({
                                    ...uploadForm,
                                    bandMapping: [
                                      ...uploadForm.bandMapping,
                                      { band_number: nextNum, band_name: "", wavelength: "" },
                                    ],
                                  });
                                }}
                                style={{ marginTop: "6px", padding: "4px 12px", fontSize: "0.8rem", cursor: "pointer" }}
                              >
                                + Add band
                              </button>
                            )}
                            {uploadForm.bandPreset !== "custom" && (
                              <p style={{ marginTop: "6px", fontSize: "0.8rem", color: "#777" }}>
                                {uploadForm.bandMapping.length} bands configured
                              </p>
                            )}
                          </div>
                        )}

                        {!uploadForm.bandMapping && (
                          <p style={{ marginTop: "6px", fontSize: "0.8rem", color: "#777" }}>
                            The server will auto-detect band count from the GeoTIFF metadata.
                          </p>
                        )}
                      </div>
                    )}

                    {uploading && (
                      <div className="upload-progress">
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>
                        <span>
                          {uploadPhase === "downloading"
                            ? `Downloading from Google Drive... ${uploadProgress}%`
                            : uploadPhase === "registering"
                            ? "Registering in database..."
                            : uploadPhase === "complete"
                            ? "Complete!"
                            : uploadProgress < 100
                            ? `Uploading... ${uploadProgress}%`
                            : "Processing on server..."}
                          {fileSource === "local" && uploadForm.file && (
                            <> — {(uploadForm.file.size / (1024 * 1024)).toFixed(1)} MB</>
                          )}
                          {fileSource === "drive" && driveSelectedFile && driveSelectedFile.size > 0 && (
                            <> — {(driveSelectedFile.size / (1024 * 1024)).toFixed(1)} MB</>
                          )}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Raw Images Upload for WebODM Processing */}
                {uploadMode === "raw" && (
                  <>
                    <div className="webodm-status">
                      <span
                        className={`status-indicator ${webodmOnline ? "online" : "offline"
                          }`}
                      ></span>
                      <span>WebODM: {webodmOnline ? "Online" : "Offline"}</span>
                      {!webodmOnline && (
                        <small className="status-help">
                          Start WebODM: <code>docker-compose up -d</code> in
                          webodm-local folder
                        </small>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Raw Drone Images * (JPG, PNG - minimum 3)</label>
                      <div className="file-input-wrapper multi-file">
                        <input
                          ref={rawFilesInputRef}
                          type="file"
                          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                          multiple
                          onChange={(e) =>
                            setRawFiles(Array.from(e.target.files))
                          }
                          disabled={processing}
                        />
                        <div className="drop-zone">
                          <span className="material-symbols-outlined">
                            cloud_upload
                          </span>
                          <p>Drop images here or click to browse</p>
                          <small>
                            Supports JPG, PNG - Select all images from a flight
                          </small>
                        </div>
                      </div>
                      {rawFiles.length > 0 && (
                        <div className="selected-files">
                          <span className="file-count">
                            {rawFiles.length} files selected
                          </span>
                          <span className="file-size">
                            (
                            {(
                              rawFiles.reduce((sum, f) => sum + f.size, 0) /
                              1024 /
                              1024
                            ).toFixed(1)}{" "}
                            MB)
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="info-box processing-info">
                      <span className="material-symbols-outlined">info</span>
                      <div>
                        <strong>What happens next:</strong>
                        <ol>
                          <li>Images are uploaded to WebODM</li>
                          <li>WebODM creates an orthomosaic (stitched map)</li>
                          <li>RGB and NDVI layers are generated</li>
                          <li>Results appear in your drone imagery</li>
                        </ol>
                        <p>
                          <strong>Processing time:</strong> 5-30 minutes
                          depending on image count
                        </p>
                      </div>
                    </div>

                    {processing && processingProgress && (
                      <div className="processing-status">
                        <div className="processing-step">
                          <span
                            className={`step-icon ${processingProgress.step}`}
                          >
                            {processingProgress.step === "error" ? (
                              <span className="material-symbols-outlined">
                                error
                              </span>
                            ) : processingProgress.step === "complete" ? (
                              <span className="material-symbols-outlined">
                                check_circle
                              </span>
                            ) : (
                              <div className="loader small"></div>
                            )}
                          </span>
                          <span className="step-message">
                            {processingProgress.message}
                          </span>
                        </div>
                        {processingProgress.progress !== undefined && (
                          <div className="progress-bar">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${processingProgress.progress}%`,
                              }}
                            ></div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="drone-modal-footer">
                <button
                  className="cancel-btn"
                  onClick={() => setShowUploadModal(false)}
                  disabled={uploading || processing}
                >
                  Cancel
                </button>
                {uploadMode === "processed" ? (
                  <button
                    className="submit-btn"
                    onClick={fileSource === "drive" ? handleDriveImport : handleFileUpload}
                    disabled={
                      uploading ||
                      (fileSource === "local" && !uploadForm.file) ||
                      (fileSource === "drive" && !driveSelectedFile)
                    }
                  >
                    {uploading
                      ? fileSource === "drive"
                        ? "Importing..."
                        : "Uploading..."
                      : fileSource === "drive"
                      ? "Import from Drive"
                      : "Upload"}
                  </button>
                ) : (
                  <button
                    className="submit-btn process-btn"
                    onClick={handleProcessRawImages}
                    disabled={
                      processing || rawFiles.length < 3 || !webodmOnline
                    }
                  >
                    {processing
                      ? "Processing..."
                      : `Process ${rawFiles.length} Images`}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Date Picker Modal - Rendered via Portal */}
      {showDatePicker &&
        createPortal(
          <div
            className="drone-modal-overlay"
            onClick={() => setShowDatePicker(false)}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseOver={(e) => e.stopPropagation()}
          >
            <div
              className="drone-modal date-picker-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="drone-modal-header">
                <h3>Find Imagery by Date</h3>
                <button
                  className="close-btn"
                  onClick={() => setShowDatePicker(false)}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="drone-modal-content">
                <p className="modal-description">
                  Select a date to find drone imagery captured on that day.
                </p>

                <div className="form-group">
                  <label>Capture Date *</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                  />
                </div>

                {searchingByDate && (
                  <div className="fetch-progress">
                    <div className="loader"></div>
                    <span>Searching for imagery...</span>
                  </div>
                )}
              </div>

              <div className="drone-modal-footer">
                <button
                  className="cancel-btn"
                  onClick={() => setShowDatePicker(false)}
                  disabled={searchingByDate}
                >
                  Cancel
                </button>
                <button
                  className="submit-btn"
                  onClick={handleSearchByDate}
                  disabled={searchingByDate || !selectedDate}
                >
                  {searchingByDate ? "Searching..." : "Find Imagery"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

    </div>
  );
};

export default DroneImagerySection;
