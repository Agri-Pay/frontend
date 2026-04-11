// src/pages/DashboardPage.jsx
import React from "react";
import Sidebar from "./sidebar";
import "./dashboard.css";
import Modal from "./modal";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import Notifications from "./notifications";

// src/pages/DashboardPage.jsx
import { useState, useEffect } from "react";
import { supabase } from "./createclient"; // Import supabase client
import Spinner from "./spinner";
import { toast } from "react-hot-toast";
import { isVerified, normalizeStatus, MILESTONE_STATUSES } from "./utils/statusHelpers";
import { getMapboxStaticImageUrl } from "./utils/geometryHelpers";
import { useWeb3Auth } from "./Web3Context";
import { ethers } from "ethers";

const USDT_ADDRESS = "0x784D56a7d78380e1c5338cDA3839a1d0F7Ba04B9";
const USDT_ABI = ["function balanceOf(address account) external view returns (uint256)"];

/* ── Farmer Wallet Panel ─────────────────────────────────────── */
const FarmerWalletPanel = () => {
  const { loggedIn, login, logout, provider, loading: web3Loading, initialized } = useWeb3Auth();
  const [address, setAddress]       = React.useState(null);
  const [ethBalance, setEthBalance] = React.useState(null);
  const [usdtBalance, setUsdtBalance] = React.useState(null);
  const [fetching, setFetching]     = React.useState(false);

  const fetchBalances = React.useCallback(async () => {
    if (!loggedIn || !provider) return;
    try {
      setFetching(true);
      const ethersProvider = new ethers.providers.Web3Provider(provider);
      const signer = ethersProvider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      const [ethBal, usdtBal] = await Promise.all([
        ethersProvider.getBalance(addr),
        new ethers.Contract(USDT_ADDRESS, USDT_ABI, ethersProvider).balanceOf(addr),
      ]);
      setEthBalance(parseFloat(ethers.utils.formatEther(ethBal)).toFixed(4));
      setUsdtBalance(parseFloat(ethers.utils.formatUnits(usdtBal, 6)).toFixed(2));
    } catch (err) {
      console.error("Wallet fetch error:", err);
    } finally {
      setFetching(false);
    }
  }, [loggedIn, provider]);

  React.useEffect(() => {
    if (loggedIn && provider) fetchBalances();
    else { setAddress(null); setEthBalance(null); setUsdtBalance(null); }
  }, [loggedIn, provider, fetchBalances]);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    toast.success("Address copied!");
  };

  if (!initialized) return null;

  return (
    <section className="dashboard-section">
      <div className="section-heading-row">
        <span className="material-symbols-outlined">account_balance_wallet</span>
        <h2>Earnings Wallet</h2>
      </div>
      <div className="fw-panel">
        {loggedIn && address ? (
          <>
            <div className="fw-panel-left">
              <div className="fw-status-dot" />
              <div>
                <p className="fw-label">Connected Wallet</p>
                <p className="fw-address">{address}</p>
              </div>
              <div className="fw-addr-actions">
                <button className="fw-icon-btn" onClick={copyAddress} title="Copy address">
                  <span className="material-symbols-outlined">content_copy</span>
                </button>
                <a
                  className="fw-icon-btn"
                  href={`https://sepolia.etherscan.io/address/${address}`}
                  target="_blank" rel="noopener noreferrer"
                  title="View on Etherscan"
                >
                  <span className="material-symbols-outlined">open_in_new</span>
                </a>
                <button className="fw-icon-btn" onClick={fetchBalances} title="Refresh balances">
                  <span className="material-symbols-outlined">refresh</span>
                </button>
              </div>
            </div>
            <div className="fw-balances">
              <div className="fw-balance-card fw-usdt">
                <span className="material-symbols-outlined fw-bal-icon">payments</span>
                <div>
                  <p className="fw-bal-label">USDT Balance</p>
                  <p className="fw-bal-value">{fetching ? "…" : `${usdtBalance ?? "0.00"} USDT`}</p>
                </div>
              </div>
              <div className="fw-balance-card fw-eth">
                <span className="material-symbols-outlined fw-bal-icon">currency_exchange</span>
                <div>
                  <p className="fw-bal-label">ETH (Gas)</p>
                  <p className={`fw-bal-value${ethBalance === "0.0000" ? " fw-zero" : ""}`}>
                    {fetching ? "…" : `${ethBalance ?? "0.0000"} ETH`}
                  </p>
                  {ethBalance === "0.0000" && (
                    <a className="fw-faucet-link" href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noopener noreferrer">
                      Get free Sepolia ETH →
                    </a>
                  )}
                </div>
              </div>
              <div className="fw-balance-card fw-network">
                <span className="material-symbols-outlined fw-bal-icon">language</span>
                <div>
                  <p className="fw-bal-label">Network</p>
                  <p className="fw-bal-value">Sepolia Testnet</p>
                </div>
              </div>
            </div>
            <button className="fw-disconnect-btn" onClick={logout}>
              <span className="material-symbols-outlined">logout</span>
              Disconnect
            </button>
          </>
        ) : (
          <div className="fw-connect-state">
            <span className="material-symbols-outlined fw-connect-icon">account_balance_wallet</span>
            <div>
              <p className="fw-connect-title">No wallet connected</p>
              <p className="fw-connect-sub">Connect with Web3Auth to see your USDT earnings balance.</p>
            </div>
            <button
              className="fw-connect-btn"
              onClick={login}
              disabled={web3Loading || !initialized}
            >
              {web3Loading ? "Connecting…" : "Connect Wallet"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

const DashboardPage = () => {
  // State to hold the user's profile and loading status
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false); // State for modal
  const navigate = useNavigate(); // Hook for navigation
  const [farms, setFarms] = useState([]);
  const [farmSummary, setFarmSummary] = useState({ count: 0, totalAcreage: 0 });
  const [milestoneSummary, setMilestoneSummary] = useState({
    upcoming: [],
    progress: 0,
  });
  const [payments, setPayments] = useState([]);
  const [farmImages, setFarmImages] = useState({ first: null, second: null });
  const mapboxApiKey = import.meta.env.VITE_MAPBOX_API_KEY;

  // useEffect to fetch data when the component mounts
  // useEffect(() => {
  //   const fetchUserProfile = async () => {
  //     try {
  //       // 1. Get the current user session
  //       const {
  //         data: { session },
  //       } = await supabase.auth.getSession();

  //       if (session) {
  //         // 2. Query the 'profiles' table with the user's ID
  //         const { data, error } = await supabase
  //           .from("profiles")
  //           .select("full_name") // We only need the full_name column
  //           .eq("id", session.user.id) // Match the row to the logged-in user
  //           .single(); // We expect only one result

  //         if (error) {
  //           throw error;
  //         }

  //         if (data) {
  //           // 3. Set the user profile in state
  //           setUserProfile(data);
  //         }
  //       }
  //     } catch (error) {
  //       console.error("Error fetching user profile:", error.message);
  //     } finally {
  //       // 4. Set loading to false once fetching is complete
  //       setLoading(false);
  //     }
  //   };
  //   const fetchFarms = async () => {
  //     const { data, error } = await supabase.from("farms").select("id, name");
  //     if (data) setFarms(data);
  //   };
  //   fetchFarms();

  //   fetchUserProfile();
  // }, []); // The empty array ensures this effect runs only once on mount

  // Extract the first name from the full_name
  const getFirstName = () => {
    if (!userProfile || !userProfile.full_name) {
      return "User"; // Return a default value if name isn't available
    }
    return userProfile.full_name.split(" ")[0];
  };
  const handleLogout = async () => {
    try {
      // Use Supabase client to sign out
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // Redirect the user to the login page
      navigate("/login");
    } catch (error) {
      // alert(error.message);
      toast.error(error.message);
    }
  };
  // useEffect(() => {
  //   const fetchDashboardData = async () => {
  //     try {
  //       // Fetch user profile (as before)
  //       const {
  //         data: { session },
  //       } = await supabase.auth.getSession();
  //       if (session) {
  //         const { data, error } = await supabase
  //           .from("profiles")
  //           .select("full_name")
  //           .eq("id", session.user.id)
  //           .single();
  //         if (error) throw error;
  //         if (data) setUserProfile(data);
  //       }

  //       // Fetch all farms to calculate summary
  //       const { data: farms, error: farmsError } = await supabase
  //         .from("farms")
  //         .select("location_data");
  //       if (farmsError) throw farmsError;

  //       if (farms) {
  //         let totalMeters = 0;
  //         farms.forEach((farm) => {
  //           if (farm.location_data) {
  //             // Convert our coordinates to the format Turf.js expects: [[lng, lat], ...]
  //             const coords = farm.location_data.map((p) => [p.lng, p.lat]);
  //             // Ensure polygon is closed for accurate calculation
  //             if (
  //               coords.length > 2 &&
  //               (coords[0][0] !== coords[coords.length - 1][0] ||
  //                 coords[0][1] !== coords[coords.length - 1][1])
  //             ) {
  //               coords.push(coords[0]);
  //             }
  //             const poly = turfPolygon([coords]);
  //             totalMeters += turfArea(poly);
  //           }
  //         });
  //         // Convert square meters to acres (1 acre ≈ 4046.86 sq meters)
  //         const totalAcres = totalMeters / 4046.86;
  //         setFarmSummary({
  //           count: farms.length,
  //           totalAcreage: totalAcres.toFixed(1),
  //         });
  //       }
  //     } catch (error) {
  //       console.error("Error fetching dashboard data:", error.message);
  //     } finally {
  //       setLoading(false);
  //     }
  //     const { data: milestones, error } = await supabase
  //       .from("cycle_milestones")
  //       .select(
  //         `
  //                   status,
  //                   crop_cycles ( farms (id, name) )
  //               `
  //       )
  //       .eq("crop_cycles.is_active", true);

  //     if (milestones) {
  //       const completed = milestones.filter(
  //         (m) => m.status === "Completed"
  //       ).length;
  //       const total = milestones.length;
  //       const progress = total > 0 ? (completed / total) * 100 : 0;

  //       // For simplicity, just show all non-completed as upcoming for now
  //       const upcoming = milestones.filter((m) => m.status !== "Completed");

  //       setMilestoneSummary({ upcoming, progress: progress.toFixed(0) });
  //     }
  //   };

  //   fetchDashboardData();
  // }, []);
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Get the current user's session first
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.user) {
          // If no user, no need to fetch anything else
          setLoading(false);
          return;
        }
        const userId = session.user.id;

        // --- Fetch all data in parallel ---
        const [profileRes, farmsRes, farmsWithBoundaryRes, milestonesRes, paymentsRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("full_name")
            .eq("id", userId)
            .single(),
          // Use stored area_hectares instead of calculating from location_data
          supabase.from("farms").select("id, area_hectares").eq("user_id", userId),
          // Fetch farms with GeoJSON boundaries for map images
          supabase.rpc('get_user_farms_geojson'),
          supabase
            .from("cycle_milestones")
            .select(
              `
                            id,
                            status,
                            crop_cycles!inner(farms(id, name)),
                            milestone_templates(name)
                        `
            )
            .eq("crop_cycles.user_id", userId)
            .eq("crop_cycles.is_active", true),
          // Query for verified milestones using status enum instead of is_verified
          supabase
            .from("cycle_milestones")
            .select(
              `
                            id,
                            updated_at,
                            crop_cycles!inner(
                              farms(name)
                            )
                        `
            )
            .eq("crop_cycles.user_id", userId)
            .eq("status", "verified")  // Use status enum instead of is_verified
            .order("updated_at", { ascending: false })
            .limit(5),
        ]);

        // Process Profile
        if (profileRes.error) throw profileRes.error;
        setUserProfile(profileRes.data);

        // Process Farms for Summary - use stored area_hectares
        if (farmsRes.error) throw farmsRes.error;
        if (farmsRes.data) {
          // Sum up area_hectares and convert to acres
          const totalHectares = farmsRes.data.reduce(
            (sum, farm) => sum + (farm.area_hectares || 0), 
            0
          );
          const totalAcres = totalHectares * 2.471; // 1 hectare = 2.471 acres
          setFarmSummary({
            count: farmsRes.data.length,
            totalAcreage: totalAcres.toFixed(1),
          });
        }

        // Process Farm Images from boundary GeoJSON
        if (!farmsWithBoundaryRes.error && farmsWithBoundaryRes.data && mapboxApiKey) {
          const farmsWithBoundary = farmsWithBoundaryRes.data;
          if (farmsWithBoundary.length > 0) {
            // Get first farm's boundary for the first card image
            const firstFarm = farmsWithBoundary[0];
            let firstImageUrl = null;
            if (firstFarm.boundary_geojson) {
              try {
                let geom = firstFarm.boundary_geojson;
                if (typeof geom === 'string') geom = JSON.parse(geom);
                firstImageUrl = getMapboxStaticImageUrl(geom, mapboxApiKey, { width: 400, height: 200 });
              } catch (e) {
                console.warn('Failed to generate first farm image:', e);
              }
            }

            // Get second farm (or reuse first) for second card image
            const secondFarm = farmsWithBoundary.length > 1 ? farmsWithBoundary[1] : firstFarm;
            let secondImageUrl = null;
            if (secondFarm.boundary_geojson) {
              try {
                let geom = secondFarm.boundary_geojson;
                if (typeof geom === 'string') geom = JSON.parse(geom);
                secondImageUrl = getMapboxStaticImageUrl(geom, mapboxApiKey, { width: 400, height: 200 });
              } catch (e) {
                console.warn('Failed to generate second farm image:', e);
              }
            }

            setFarmImages({ first: firstImageUrl, second: secondImageUrl });
          }
        }

        // Process Milestones for Summary - use new status values
        if (milestonesRes.error) throw milestonesRes.error;
        if (milestonesRes.data) {
          const milestones = milestonesRes.data;
          // Count verified milestones using the helper function
          const verified = milestones.filter(
            (m) => isVerified(m.status)
          ).length;
          const total = milestones.length;
          const progress = total > 0 ? (verified / total) * 100 : 0;
          // Upcoming = not verified (includes not_started, in_progress, pending_verification)
          const upcoming = milestones.filter((m) => !isVerified(m.status));
          setMilestoneSummary({ upcoming, progress: progress.toFixed(0) });
        }

        // Process Payments
        if (paymentsRes.error) throw paymentsRes.error;
        if (paymentsRes.data) {
          setPayments(paymentsRes.data);
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  //this one good
  // useEffect(() => {
  //   const fetchDashboardData = async () => {
  //     try {
  //       // --- Part 1: Fetch User Profile ---
  //       const {
  //         data: { session },
  //       } = await supabase.auth.getSession();
  //       if (session?.user) {
  //         const { data: profileData, error: profileError } = await supabase
  //           .from("profiles")
  //           .select("full_name")
  //           .eq("id", session.user.id)
  //           .single();
  //         if (profileError) throw profileError;
  //         setUserProfile(profileData);
  //       }

  //       // --- Part 2: Fetch Farms for Summary ---
  //       const { data: farms, error: farmsError } = await supabase
  //         .from("farms")
  //         .select("location_data");
  //       if (farmsError) throw farmsError;

  //       if (farms) {
  //         let totalMeters = 0;
  //         farms.forEach((farm) => {
  //           if (farm.location_data?.length > 2) {
  //             const coords = farm.location_data.map((p) => [p.lng, p.lat]);
  //             if (
  //               coords[0][0] !== coords[coords.length - 1][0] ||
  //               coords[0][1] !== coords[coords.length - 1][1]
  //             ) {
  //               coords.push(coords[0]);
  //             }
  //             totalMeters += turfArea(turfPolygon([coords]));
  //           }
  //         });
  //         const totalAcres = totalMeters / 4046.86;
  //         setFarmSummary({
  //           count: farms.length,
  //           totalAcreage: totalAcres.toFixed(1),
  //         });
  //       }

  //       // --- Part 3: Fetch Milestones for Summary ---
  //       const { data: milestones, error: milestonesError } = await supabase
  //         .from("cycle_milestones")
  //         .select(
  //           `
  //                       id,
  //                       status,
  //                       crop_cycles!inner ( is_active, farms (id, name) ),
  //                       milestone_templates ( name )
  //                   `
  //         )
  //         .eq("crop_cycles.is_active", true);

  //       if (milestonesError) throw milestonesError;

  //       if (milestones) {
  //         const completed = milestones.filter(
  //           (m) => m.status === "Completed"
  //         ).length;
  //         const total = milestones.length;
  //         const progress = total > 0 ? (completed / total) * 100 : 0;

  //         const upcoming = milestones.filter((m) => m.status !== "Completed");
  //         setMilestoneSummary({ upcoming, progress: progress.toFixed(0) });
  //       }
  //     } catch (error) {
  //       console.error("Error fetching dashboard data:", error.message);
  //     } finally {
  //       setLoading(false); // Only set loading to false after ALL data is fetched
  //     }
  //   };

  //   fetchDashboardData();
  // }, []);

  // Show a loading indicator while fetching data
  if (loading) {
    return (
      <div className="dashboard-container">
        <Sidebar />
        <main className="dashboard-main">
          <Spinner />
        </main>
      </div>
    );
  }

  // Helper: map milestone status → chip class + label
  const chipClass = (status) => {
    const s = (status || "").toLowerCase().replace(/[_ ]/g, "-");
    if (s === "in-progress") return "in-progress";
    if (s.includes("pending")) return "pending-verif";
    return "not-started";
  };
  const chipLabel = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "in_progress" || s === "in-progress") return "In Progress";
    if (s.includes("pending")) return "Pending Verification";
    return "Not Started";
  };

  return (
    <div className="dashboard-container">
      <Sidebar />
      <main className="dashboard-main">

        {/* ── Hero Header ── */}
        <div className="dash-hero">
          <div className="dash-hero-accent" />
          <div className="dash-hero-body">
            <div className="dash-hero-left">
              <div className="dash-hero-avatar">
                <span className="material-symbols-outlined">person</span>
              </div>
              <div>
                <p className="dash-hero-eyebrow">Farmer Dashboard</p>
                <h1 className="dash-hero-title">Welcome back, {getFirstName().toUpperCase()} </h1>
                <p className="dash-hero-subtitle">Here's what's happening across your farms today.</p>
              </div>
            </div>
            <div className="dash-hero-actions">
              <Notifications />
              <button className="add-farm-btn" onClick={() => setIsModalOpen(true)}>
                <span className="material-symbols-outlined">add</span>
                Add New Farm
              </button>
              <button className="logout-btn" onClick={handleLogout}>
                <span className="material-symbols-outlined">logout</span>
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <section className="dashboard-section">
          <div className="section-heading-row">
            <span className="material-symbols-outlined">bar_chart</span>
            <h2>Overview</h2>
          </div>
          <div className="stat-cards-grid">
            <div className="stat-card sc-green">
              <div className="stat-card-icon">
                <span className="material-symbols-outlined">agriculture</span>
              </div>
              <p className="stat-card-label">Total Farms</p>
              <p className="stat-card-value">{farmSummary.count}</p>
              <p className="stat-card-desc">Registered &amp; active</p>
            </div>
            <div className="stat-card sc-blue">
              <div className="stat-card-icon">
                <span className="material-symbols-outlined">landscape</span>
              </div>
              <p className="stat-card-label">Total Acreage</p>
              <p className="stat-card-value">{farmSummary.totalAcreage}</p>
              <p className="stat-card-desc">Acres under cultivation</p>
            </div>
            <div className="stat-card sc-amber">
              <div className="stat-card-icon">
                <span className="material-symbols-outlined">pending_actions</span>
              </div>
              <p className="stat-card-label">Pending Milestones</p>
              <p className="stat-card-value">{milestoneSummary.upcoming.length}</p>
              <p className="stat-card-desc">Awaiting completion</p>
            </div>
            <div className="stat-card sc-purple">
              <div className="stat-card-icon">
                <span className="material-symbols-outlined">payments</span>
              </div>
              <p className="stat-card-label">Verified Milestones</p>
              <p className="stat-card-value">{payments.length}</p>
              <p className="stat-card-desc">Payments processed</p>
            </div>
          </div>
        </section>

        {/* ── Earnings Wallet ── */}
        <FarmerWalletPanel />

        {/* ── Milestone Progress ── */}
        <section className="dashboard-section">
          <div className="section-heading-row">
            <span className="material-symbols-outlined">track_changes</span>
            <h2>Overall Milestone Progress</h2>
          </div>
          <div className="progress-card">
            <div className="progress-header">
              <p className="progress-label">Milestones verified across all active cycles</p>
              <p className="progress-pct">{milestoneSummary.progress}%</p>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${milestoneSummary.progress}%` }} />
            </div>
            <p className="progress-sub">
              {payments.length} of {payments.length + milestoneSummary.upcoming.length} milestones completed
            </p>
          </div>
        </section>

        {/* ── Farm Images Summary ── */}
        <section className="dashboard-section">
          <div className="section-heading-row">
            <span className="material-symbols-outlined">satellite_alt</span>
            <h2>Farm Summary</h2>
          </div>
          <div className="summary-cards">
            <div className="summary-card">
              <img
                className="summary-card-image"
                src={farmImages.first || "https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=600"}
                alt="Farm aerial view"
              />
              <div className="summary-card-body">
                <p className="summary-card-label">Farms Registered</p>
                <p className="summary-card-value">{farmSummary.count}</p>
                <p className="summary-card-desc">Navigate to a farm to view live data</p>
              </div>
            </div>
            <div className="summary-card">
              <img
                className="summary-card-image"
                src={farmImages.second || "https://images.unsplash.com/photo-1444930694458-01bab732b857?q=80&w=600"}
                alt="Aerial farm view"
              />
              <div className="summary-card-body">
                <p className="summary-card-label">Total Land Area</p>
                <p className="summary-card-value">{farmSummary.totalAcreage} ac</p>
                <p className="summary-card-desc">Total land under management</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Upcoming Milestones ── */}
        <section className="dashboard-section">
          <div className="section-heading-row">
            <span className="material-symbols-outlined">task_alt</span>
            <h2>Upcoming Milestones</h2>
          </div>
          {milestoneSummary.upcoming.length > 0 ? (
            <div className="milestone-list-card">
              {milestoneSummary.upcoming.slice(0, 6).map((m, i) => (
                <div className="milestone-list-item" key={m.id}>
                  <span className={`ms-dot ${chipClass(m.status) === "in-progress" ? "active" : "pending"}`} />
                  <div className="milestone-list-text">
                    <p className="milestone-list-farm">{m.crop_cycles?.farms?.name || "—"}</p>
                    <p className="milestone-list-name">{m.milestone_templates?.name || "Unnamed Milestone"}</p>
                  </div>
                  <span className={`ms-status-chip ${chipClass(m.status)}`}>
                    {chipLabel(m.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="milestone-list-card">
              <div className="milestone-empty">
                <span className="material-symbols-outlined">check_circle</span>
                <p>All milestones are up to date!</p>
              </div>
            </div>
          )}
        </section>

        {/* ── Payment Status ── */}
        <section className="dashboard-section">
          <div className="section-heading-row">
            <span className="material-symbols-outlined">receipt_long</span>
            <h2>Payment Status</h2>
          </div>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Farm</th>
                  <th>Milestone</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.length > 0 ? (
                  payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.crop_cycles?.farms?.name || "—"}</td>
                      <td>Milestone Verified</td>
                      <td>
                        <span className="status-pill paid">
                          <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>check_circle</span>
                          Paid
                        </span>
                      </td>
                      <td>{new Date(payment.updated_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr className="table-empty">
                    <td colSpan="4">No payments processed yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>

      {/* ── Add Farm Modal ── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div className="modal-body">
          <h2>Add a New Farm</h2>
          <p>Choose how you'd like to define your farm's boundaries.</p>
          <div className="modal-options">
            <button className="modal-option-btn" onClick={() => navigate("/create-farm")}>
              <span className="material-symbols-outlined">edit_location</span>
              Draw Polygon on Map
            </button>
            <button className="modal-option-btn" onClick={() => navigate("/upload-kml")}>
              <span className="material-symbols-outlined">upload_file</span>
              Upload Coordinates (KML)
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DashboardPage;
