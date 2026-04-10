import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "./createclient";
import Sidebar from "./sidebar";
import "./adashboard.css";
import Notifications from "./notifications";
import { useAuth } from "./useauth";
import Spinner from "./spinner";
import {
  MILESTONE_STATUS,
  getStatusDisplay,
  isVerifiedStatus,
} from "./utils/statusHelpers";
import { WalletInfoWidget } from "./WalletInfoWidget";

const formatArea = (value) => {
  const parsedValue = parseFloat(value || 0);
  return `${parsedValue.toFixed(2)} ha`;
};

const buildFarmSearchText = (farm) =>
  [farm.name, farm.owner_name, farm.active_crop]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const AdminDashboardPage = () => {
  const [metrics, setMetrics] = useState({
    totalFarms: 0,
    verifiedMilestones: 0,
    paymentsProcessed: 0,
  });
  const [recentActivities, setRecentActivities] = useState([]);
  const [allFarms, setAllFarms] = useState([]);
  const [farmSearch, setFarmSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const fetchAdminData = async () => {
      try {
        const [farmsRpcRes, verifiedCountRes, paidCountRes, activitiesRes] =
          await Promise.all([
            supabase.rpc("get_all_farms_geojson"),
            supabase
              .from("cycle_milestones")
              .select("id", { count: "exact", head: true })
              .eq("status", MILESTONE_STATUS.VERIFIED),
            supabase
              .from("cycle_milestones")
              .select("id", { count: "exact", head: true })
              .eq("payment_status", "paid"),
            supabase.rpc("get_recent_admin_activities"),
          ]);

        let farmsData = farmsRpcRes.data || [];
        if (farmsRpcRes.error) {
          const { data: fallbackFarms, error: fallbackError } = await supabase
            .from("farms")
            .select("id, user_id, name, area_hectares, is_public");

          if (fallbackError) {
            throw farmsRpcRes.error;
          }

          farmsData = fallbackFarms || [];
        }

        const farmIds = farmsData.map((farm) => farm.id);
        const recentActivitiesData = activitiesRes.error ? [] : activitiesRes.data || [];
        const latestActivityByFarm = new Map();

        recentActivitiesData.forEach((activity) => {
          if (!latestActivityByFarm.has(activity.farm_id)) {
            latestActivityByFarm.set(activity.farm_id, activity);
          }
        });

        let activeCyclesData = [];
        if (farmIds.length > 0) {
          const { data, error } = await supabase
            .from("crop_cycles")
            .select("id, farm_id, is_active, crops(name)")
            .in("farm_id", farmIds);

          if (!error) {
            activeCyclesData = data || [];
          }
        }

        const cycleToFarmId = new Map();
        const activeCycleByFarm = new Map();

        activeCyclesData.forEach((cycle) => {
          cycleToFarmId.set(cycle.id, cycle.farm_id);
          if (cycle.is_active && !activeCycleByFarm.has(cycle.farm_id)) {
            activeCycleByFarm.set(cycle.farm_id, cycle);
          }
        });

        let milestoneSummaryByFarm = new Map();
        if (cycleToFarmId.size > 0) {
          const { data, error } = await supabase
            .from("cycle_milestones")
            .select("crop_cycle_id, status, payment_status")
            .in("crop_cycle_id", Array.from(cycleToFarmId.keys()));

          if (!error) {
            milestoneSummaryByFarm = (data || []).reduce((summaryMap, milestone) => {
              const farmId = cycleToFarmId.get(milestone.crop_cycle_id);
              if (!farmId) {
                return summaryMap;
              }

              const currentSummary = summaryMap.get(farmId) || {
                total: 0,
                verified: 0,
                paid: 0,
              };

              currentSummary.total += 1;
              if (isVerifiedStatus(milestone.status)) {
                currentSummary.verified += 1;
              }
              if (milestone.payment_status === "paid") {
                currentSummary.paid += 1;
              }

              summaryMap.set(farmId, currentSummary);
              return summaryMap;
            }, new Map());
          }
        }

        const farmsWithSummaries = farmsData
          .map((farm) => {
            const farmActivity = latestActivityByFarm.get(farm.id);
            const milestoneSummary = milestoneSummaryByFarm.get(farm.id) || {
              total: 0,
              verified: 0,
              paid: 0,
            };

            return {
              ...farm,
              owner_name:
                farm.owner_name || farmActivity?.farmer_name || "Farmer account",
              active_crop:
                activeCycleByFarm.get(farm.id)?.crops?.name || "No active cycle",
              milestone_summary: milestoneSummary,
              latest_status: farmActivity?.status || null,
            };
          })
          .sort((leftFarm, rightFarm) => leftFarm.name.localeCompare(rightFarm.name));

        setMetrics({
          totalFarms: farmsWithSummaries.length,
          verifiedMilestones:
            verifiedCountRes.error || verifiedCountRes.count === null
              ? farmsWithSummaries.reduce(
                  (count, farm) => count + farm.milestone_summary.verified,
                  0
                )
              : verifiedCountRes.count,
          paymentsProcessed:
            paidCountRes.error || paidCountRes.count === null
              ? farmsWithSummaries.reduce(
                  (count, farm) => count + farm.milestone_summary.paid,
                  0
                )
              : paidCountRes.count,
        });
        setRecentActivities(recentActivitiesData);
        setAllFarms(farmsWithSummaries);
      } catch (error) {
        console.error("Error fetching admin data:", error);
        setRecentActivities([]);
        setAllFarms([]);
      } finally {
        setLoading(false);
      }
    };

    if (role === "admin") {
      fetchAdminData();
      return;
    }

    setLoading(false);
  }, [authLoading, role]);

  if (authLoading || loading) {
    return <Spinner />;
  }

  const filteredFarms = allFarms.filter((farm) =>
    buildFarmSearchText(farm).includes(farmSearch.toLowerCase())
  );

  return (
    <div className="admin-dashboard-container">
      <Sidebar />
      <div className="main-content-wrapper">
        <header className="page-header">
          <div className="header-title">
            <h1>Admin Dashboard</h1>
            <p>
              Overview of farm activities, milestone verifications, payment
              status, and every registered farm.
            </p>
          </div>
          <div className="header-actions">
            <WalletInfoWidget />
            <Notifications />
            <div className="user-menu">
              <div className="user-avatar">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="user-info">
                <span className="user-email">{user?.email}</span>
                <button onClick={handleLogout} className="logout-button">
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="admin-main">
          <section className="metrics-section">
            <h2>Key Metrics</h2>
            <div className="metrics-grid">
              <div className="metric-card">
                <span>Total Farms</span>
                <strong>{metrics.totalFarms}</strong>
              </div>
              <div className="metric-card">
                <span>Milestones Verified</span>
                <strong>{metrics.verifiedMilestones}</strong>
              </div>
              <div className="metric-card">
                <span>Payments Processed</span>
                <strong>{metrics.paymentsProcessed}</strong>
              </div>
            </div>
          </section>

          <section className="activity-section">
            <h2>Recent Activities</h2>
            {recentActivities.length > 0 ? (
              <div className="activity-table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Farm Name</th>
                      <th>Farmer Name</th>
                      <th>Milestone</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivities.map((activity) => (
                      <tr key={activity.milestone_id}>
                        <td>{activity.farm_name}</td>
                        <td>{activity.farmer_name}</td>
                        <td>{activity.milestone_name}</td>
                        <td>
                          <span
                            className={`status-pill ${
                              isVerifiedStatus(activity.status)
                                ? "verified"
                                : "pending"
                            }`}
                          >
                            {isVerifiedStatus(activity.status)
                              ? "Verified"
                              : getStatusDisplay(activity.status)}
                          </span>
                        </td>
                        <td>
                          <Link
                            to={`/admin/farms/${activity.farm_id}`}
                            className="action-link"
                          >
                            View Details
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty-card">
                <div className="admin-empty-icon">
                  <span className="material-symbols-outlined">history</span>
                </div>
                <div>
                  <h3>No recent activity yet</h3>
                  <p>
                    Milestone updates, approvals, and payment progress will
                    appear here as soon as farmers start interacting with their
                    farms.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="farm-list-section">
            <div className="section-heading-row">
              <div>
                <h2>All Farms</h2>
                <p>
                  Every farm created by users is visible here for admin review.
                </p>
              </div>
              <label className="admin-search" aria-label="Search farms">
                <span className="material-symbols-outlined">search</span>
                <input
                  type="text"
                  placeholder="Search farms or owners"
                  value={farmSearch}
                  onChange={(event) => setFarmSearch(event.target.value)}
                />
              </label>
            </div>

            <div className="activity-table-card">
              <table className="admin-farms-table">
                <thead>
                  <tr>
                    <th>Farm</th>
                    <th>Owner Name</th>
                    <th>User Email</th>
                    <th>Account Type</th>
                    <th>Area</th>
                    <th>Active Cycle</th>
                    <th>Milestones</th>
                    <th>Visibility</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFarms.length > 0 ? (
                    filteredFarms.map((farm) => (
                      <tr key={farm.id}>
                        <td>
                          <div className="farm-name-stack">
                            <span className="farm-name-text">{farm.name}</span>
                            <span className="farm-secondary-text">
                              {farm.latest_status
                                ? `Latest status: ${getStatusDisplay(farm.latest_status)}`
                                : "No recent milestone activity"}
                            </span>
                          </div>
                        </td>
                        <td>{farm.owner_name}</td>
                        <td>{farm.owner_email || 'N/A'}</td>
                        <td>
                          <span
                            className={`visibility-pill ${
                              farm.owner_role === "admin" ? "admin-role" : "farmer-role"
                            }`}
                          >
                            {farm.owner_role === "admin" ? "Admin" : "Farmer"}
                          </span>
                        </td>
                        <td>{formatArea(farm.area_hectares)}</td>
                        <td>{farm.active_crop}</td>
                        <td>
                          <div className="farm-name-stack">
                            <span className="farm-name-text">
                              {farm.milestone_summary.verified}/
                              {farm.milestone_summary.total} verified
                            </span>
                            <span className="farm-secondary-text">
                              {farm.milestone_summary.paid} paid milestone
                              {farm.milestone_summary.paid === 1 ? "" : "s"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`visibility-pill ${
                              farm.is_public ? "public" : "private"
                            }`}
                          >
                            {farm.is_public ? "Public" : "Private"}
                          </span>
                        </td>
                        <td>
                          <Link
                            to={`/admin/farms/${farm.id}`}
                            className="action-link"
                          >
                            Open Farm
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="9">
                        <div className="admin-empty-state">
                          {allFarms.length === 0
                            ? "No farms have been registered yet."
                            : "No farms matched your search."}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
