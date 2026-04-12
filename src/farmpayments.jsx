// src/pages/FarmPaymentsPage.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./createclient";
import Sidebar from "./sidebar";
import Spinner from "./spinner";
import { useAuth } from "./useauth";
import { toast } from "react-hot-toast";
import "./farmpayments.css";
import { MILESTONE_STATUS, isVerifiedStatus, getStatusDisplay } from "./utils/statusHelpers";
import { FundMilestoneButton } from "./FundMilestoneButton";
import { WalletInfoWidget } from "./WalletInfoWidget";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (amount) =>
  `Rs. ${((amount || 0) / 100).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (dateString) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatShortDate = (dateString) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const truncateHash = (hash) => {
  if (!hash) return "—";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
};

// ─── Blockchain Step Tracker ──────────────────────────────────────────────────

const STEPS = [
  { key: "claim",   label: "CLAIM",     icon: "check_circle" },
  { key: "verify",  label: "VERIFYING", icon: "verified" },
  { key: "ledger",  label: "LEDGER",    icon: "account_balance_wallet" },
  { key: "payout",  label: "PAYOUT",    icon: "payments" },
];

const getActiveStep = (paymentStatus, approvalStatus) => {
  if (paymentStatus === "paid") return 4;          // all steps done
  if (paymentStatus === "processing") return 3;    // at PAYOUT step (oracle releasing)
  if (paymentStatus === "funded") return 2;        // at LEDGER step (escrow funded)
  if (isVerifiedStatus(approvalStatus)) return 1;  // at VERIFYING step
  return 0;
};

const BlockchainStepTracker = ({ paymentStatus, approvalStatus }) => {
  const activeStep = getActiveStep(paymentStatus, approvalStatus);

  return (
    <div className="bct-root">
      {STEPS.map((step, idx) => {
        const done    = idx < activeStep;
        const current = idx === activeStep && activeStep < STEPS.length;
        return (
          <React.Fragment key={step.key}>
            <div className={`bct-step ${done ? "done" : current ? "current" : "future"}`}>
              <div className="bct-circle">
                <span className="material-symbols-outlined">
                  {done ? "check_circle" : step.icon}
                </span>
              </div>
              <span className="bct-label">{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`bct-connector ${done ? "done" : current ? "active" : ""}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── Verification In-Progress Card ───────────────────────────────────────────

const VerificationCard = ({ milestone, farm, role }) => {
  const name   = milestone.milestone_templates?.name || "Unnamed Milestone";
  const amount = formatCurrency(milestone.amount);
  const isPaid = milestone.payment_status === "paid";

  return (
    <div className={`verif-card${isPaid ? " verif-card-paid" : ""}`}>
      <div className="verif-card-left">
        <div className={`verif-active-badge${isPaid ? " verif-badge-paid" : ""}`}>
          {isPaid ? "RELEASED" : "ACTIVE"}
        </div>
        <div className="verif-title">Milestone: {name}</div>
        <div className="verif-amount">{amount}</div>
        <div className="verif-desc">
          {isPaid
            ? "Payment has been released to the farmer's wallet on-chain."
            : (milestone.notes ||
              "Satellite verification has confirmed crop health. Our smart agent is currently performing technical auditing before final release.")}
        </div>
        {!isPaid && role !== "farmer" && (
          <div style={{ marginTop: "0.75rem" }}>
            <FundMilestoneButton milestone={milestone} farm={farm} />
          </div>
        )}
      </div>
      <div className="verif-card-right">
        <BlockchainStepTracker
          paymentStatus={milestone.payment_status}
          approvalStatus={milestone.status}
        />
      </div>
    </div>
  );
};

// ─── Blockchain Timeline Row ──────────────────────────────────────────────────

const TimelineRow = ({ milestone }) => {
  const name   = milestone.milestone_templates?.name || "Unnamed";
  const amount = formatCurrency(milestone.amount);
  const tx     = milestone.transactions?.[0];

  const claimDate  = milestone.updated_at;
  const verifyDate = null;   // not yet stored separately
  const chainDate  = tx?.created_at || null;
  const paidDate   = milestone.payment_status === "paid" ? milestone.updated_at : null;

  return (
    <div className="tl-row">
      {/* Left: info */}
      <div className="tl-left">
        <div className="tl-status-badge completed">COMPLETED</div>
        <div className="tl-name">{name}</div>
        <div className="tl-release">Released {formatDate(paidDate || milestone.updated_at)}</div>
        <div className="tl-amount">{amount}</div>
      </div>

      {/* Middle: date columns */}
      <div className="tl-dates">
        {[
          { label: "FARMER\nCLAIM",          val: claimDate  },
          { label: "TECHNICAL\nVERIFICATION", val: verifyDate },
          { label: "BLOCKCHAIN\nINITIATION",  val: chainDate  },
          { label: "FUNDS\nRECEIVED",         val: paidDate   },
        ].map(({ label, val }) => (
          <div key={label} className="tl-date-col">
            <div className="tl-date-label">
              {label.split("\n").map((l, i) => (
                <React.Fragment key={i}>{l}{i === 0 && <br />}</React.Fragment>
              ))}
            </div>
            <div className="tl-date-val">{formatShortDate(val)}</div>
          </div>
        ))}
      </div>

      {/* Right: chain info */}
      <div className="tl-chain-card">
        <div className="tl-chain-row">
          <span className="tl-chain-label">NETWORK</span>
          <span className="tl-chain-val network">Sepolia</span>
        </div>
        <div className="tl-chain-row">
          <span className="tl-chain-label">HASH</span>
          <span className="tl-chain-val hash">
            {tx?.tx_hash ? (
              <a
                href={`https://sepolia.etherscan.io/tx/${tx.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tl-hash-link"
              >
                {truncateHash(tx.tx_hash)}
              </a>
            ) : (
              <span className="tl-hash-pending">pending</span>
            )}
          </span>
        </div>
        <div className="tl-chain-row">
          <span className="tl-chain-label">WALLET</span>
          <span className="tl-chain-val hash">
            {tx?.wallet_address ? truncateHash(tx.wallet_address) : "0x…"}
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const FarmPaymentsPage = () => {
  const { farmId }  = useParams();
  const navigate    = useNavigate();
  const { user, role, loading: authLoading } = useAuth();

  const [farm,    setFarm]    = useState(null);
  const [cycles,  setCycles]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      setLoading(true);
      setError("");

      // Farm
      const { data: farmData, error: farmErr } = await supabase
        .from("farms")
        .select("*")
        .eq("id", farmId)
        .single();
      if (farmErr) throw farmErr;

      if (role === "farmer" && farmData.user_id !== user.id) {
        toast.error("You don't have access to this farm's payments");
        navigate("/payments");
        return;
      }
      setFarm(farmData);

      // Crop cycles
      const { data: cyclesData, error: cyclesErr } = await supabase
        .from("crop_cycles")
        .select("id, start_date, end_date, is_active, crops(id, name)")
        .eq("farm_id", farmId)
        .order("start_date", { ascending: false });
      if (cyclesErr) throw cyclesErr;

      // Milestones per cycle — fetch ALL statuses so we can show pending too
      const cyclesWithPayments = await Promise.all(
        (cyclesData || []).map(async (cycle) => {
          const { data: ms, error: msErr } = await supabase
            .from("cycle_milestones")
            .select(`
              id, status, amount, payment_status, updated_at,
              milestone_templates(id, name, description),
              transactions(id, tx_hash, status, created_at)
            `)
            .eq("crop_cycle_id", cycle.id)
            .order("updated_at", { ascending: false });

          if (msErr) {
            console.error(`Milestone fetch error for cycle ${cycle.id}:`, msErr.message);
            return { ...cycle, milestones: [] };
          }
          return { ...cycle, milestones: ms || [] };
        })
      );

      setCycles(cyclesWithPayments.filter((c) => c.milestones.length > 0));
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load payment data");
      toast.error("Failed to load payment data");
    } finally {
      setLoading(false);
    }
  }, [farmId, user, role, navigate]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  // ── Realtime: watch for farmer wallet_address updates ─────────────────────
  useEffect(() => {
    if (!farmId) return;

    const channel = supabase
      .channel(`farm-wallet-${farmId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "farms",
          filter: `id=eq.${farmId}`,
        },
        (payload) => {
          const updated = payload.new;
          if (updated.wallet_address !== undefined) {
            setFarm((prev) => prev ? { ...prev, wallet_address: updated.wallet_address } : prev);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [farmId]);

  // ── Realtime: watch for milestone payment_status changes ──────────────────
  useEffect(() => {
    if (!farmId) return;

    const channel = supabase
      .channel(`cycle-milestones-${farmId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cycle_milestones" },
        (payload) => {
          const updated = payload.new;
          setCycles((prev) => {
            let changed = false;
            const next = prev.map((cycle) => ({
              ...cycle,
              milestones: cycle.milestones.map((m) => {
                if (m.id === updated.id) {
                  changed = true;
                  return { ...m, payment_status: updated.payment_status, updated_at: updated.updated_at };
                }
                return m;
              }),
            }));
            return changed ? next : prev;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [farmId]);

  const allMilestones = cycles.flatMap((c) => c.milestones);

  const totalPaid = allMilestones
    .filter((m) => m.payment_status === "paid")
    .reduce((s, m) => s + (m.amount || 0), 0);

  const totalPending = allMilestones
    .filter((m) => ["pending", "processing"].includes(m.payment_status))
    .reduce((s, m) => s + (m.amount || 0), 0);

  // Milestones verified → show in verification flow with step progress (including paid)
  const inVerification = allMilestones.filter(
    (m) => isVerifiedStatus(m.status)
  );

  const paidMilestones = allMilestones.filter((m) => m.payment_status === "paid");

  // Next upcoming: first not-yet-verified milestone (reverse order = oldest first)
  const upcoming = allMilestones.filter(
    (m) => !isVerifiedStatus(m.status) && m.payment_status !== "paid"
  );
  const nextMilestone = upcoming[upcoming.length - 1] || null;

  const totalContract = allMilestones.reduce((s, m) => s + (m.amount || 0), 0);
  const paidPct = totalContract > 0 ? Math.round((totalPaid / totalContract) * 100) : 0;

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="fp-container">
        <Sidebar />
        <div className="fp-main"><Spinner /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fp-container">
        <Sidebar />
        <main className="fp-main">
          <div className="fp-error-state">
            <span className="material-symbols-outlined">error</span>
            <p>{error}</p>
            <button className="fp-btn solid" onClick={() => navigate("/payments")}>
              Back to Payments
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fp-container">
      <Sidebar />
      <main className="fp-main">

        {/* Page Header */}
        <div className="fp-header">
          <div className="fp-header-left">
            <button
              className="fp-back-icon-btn"
              onClick={() => navigate("/payments")}
              title="Back"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div>
              <h1 className="fp-page-title">Payment Tracking</h1>
              <p className="fp-page-sub">
                {farm?.name && <span className="fp-farm-name">{farm.name}</span>}
                {cycles[0]?.crops?.name && (
                  <>
                    {" "}
                    <span className="fp-sep">|</span>{" "}
                    <span className="fp-crop-tag">
                      {cycles[0].crops.name}
                      {cycles[0].start_date &&
                        ` · ${new Date(cycles[0].start_date).getFullYear()}`}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="fp-header-right">
            {role !== "farmer" && <WalletInfoWidget />}
            <a
              href={`https://sepolia.etherscan.io/address/${farm?.wallet_address || ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="fp-ledger-link"
            >
              View on Etherscan
              <span className="material-symbols-outlined">open_in_new</span>
            </a>
          </div>
        </div>

        {role === "farmer" && farm?.wallet_address && (
          <div className="fp-farmer-wallet">
            <span className="material-symbols-outlined fp-farmer-wallet-icon">account_balance_wallet</span>
            <div>
              <div className="fp-farmer-wallet-label">Your payment wallet</div>
              <div className="fp-farmer-wallet-addr">
                <span>{farm.wallet_address}</span>
                <button
                  className="fp-farmer-wallet-copy"
                  onClick={() => {
                    navigator.clipboard.writeText(farm.wallet_address);
                    toast.success("Address copied!");
                  }}
                  title="Copy address"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
                </button>
                <a
                  href={`https://sepolia.etherscan.io/address/${farm.wallet_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fp-farmer-wallet-copy"
                  title="View balance on Etherscan"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                </a>
              </div>
              <div className="fp-farmer-wallet-hint">
                Funds released to this address — open in MetaMask or any Ethereum wallet to access USDT.
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="fp-summary-row">

          {/* Total Paid */}
          <div className="fp-sum-card">
            <div className="fp-sum-eyebrow">TOTAL AMOUNT PAID</div>
            <div className="fp-sum-big">{formatCurrency(totalPaid)}</div>
            <div className="fp-progress-track">
              <div
                className="fp-progress-fill"
                style={{ width: `${paidPct}%` }}
              />
            </div>
            <div className="fp-sum-sub">{paidPct}% of total contract value</div>
          </div>

          {/* Pending */}
          <div className="fp-sum-card pending-card">
            <div className="fp-sum-eyebrow">PENDING</div>
            <div className="fp-sum-big">{formatCurrency(totalPending)}</div>
            <div className="fp-sum-sub">
              <span className="fp-dot pending" />
              Awaiting Milestone Completion
            </div>
          </div>

          {/* Next Milestone */}
          {nextMilestone && (
            <div className="fp-sum-card next-card">
              <div className="fp-sum-eyebrow next">NEXT MILESTONE</div>
              <div className="fp-next-body">
                <div>
                  <div className="fp-next-title">
                    {nextMilestone.milestone_templates?.name || "Upcoming"}
                  </div>
                  {nextMilestone.updated_at && (
                    <div className="fp-next-date">
                      Estimated: {formatDate(nextMilestone.updated_at)}
                    </div>
                  )}
                </div>
                <span className="material-symbols-outlined fp-next-icon">agriculture</span>
              </div>
            </div>
          )}
        </div>

        {/* Verification In Progress */}
        {inVerification.length > 0 && (
          <section className="fp-section">
            <h2 className="fp-section-title">Verification in Progress</h2>
            <div className="fp-verif-list">
              {inVerification.map((m) => (
                <VerificationCard key={m.id} milestone={m} farm={farm} role={role} />
              ))}
            </div>
          </section>
        )}

        {/* Blockchain Timeline */}
        {paidMilestones.length > 0 && (
          <section className="fp-section">
            <div className="fp-section-row">
              <h2 className="fp-section-title">Blockchain Timeline</h2>
              <a
                href={`https://sepolia.etherscan.io/address/${farm?.wallet_address || ""}`}
                target="_blank"
                rel="noopener noreferrer"
                className="fp-ledger-link small"
              >
                View on Etherscan
                <span className="material-symbols-outlined">open_in_new</span>
              </a>
            </div>
            <div className="fp-timeline-list">
              {paidMilestones.map((m) => (
                <TimelineRow key={m.id} milestone={m} />
              ))}
            </div>
          </section>
        )}

        {/* Pending / In-progress milestones table */}
        {upcoming.length > 0 && (
          <section className="fp-section">
            <h2 className="fp-section-title">All Milestones</h2>
            <div className="fp-ms-table-wrap">
              <table className="fp-ms-table">
                <thead>
                  <tr>
                    <th>Milestone</th>
                    <th>Amount</th>
                    <th>Approval</th>
                    <th>Payment</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((m) => (
                    <tr key={m.id}>
                      <td className="ms-name-cell">
                        <span className="material-symbols-outlined ms-table-icon">
                          agriculture
                        </span>
                        {m.milestone_templates?.name || "—"}
                      </td>
                      <td className="ms-amount-cell">{formatCurrency(m.amount)}</td>
                      <td>
                        <span
                          className={`fp-pill approval-${
                            isVerifiedStatus(m.status) ? "verified" : "pending"
                          }`}
                        >
                          {isVerifiedStatus(m.status)
                            ? "Verified"
                            : getStatusDisplay(m.status)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`fp-pill payment-${m.payment_status || "pending"}`}
                        >
                          {m.payment_status || "pending"}
                        </span>
                        {role !== "farmer" && (
                          <FundMilestoneButton milestone={m} farm={farm} />
                        )}
                      </td>
                      <td className="fp-date-cell">{formatDate(m.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Empty state */}
        {allMilestones.length === 0 && (
          <div className="fp-empty">
            <span className="material-symbols-outlined">receipt_long</span>
            <h3>No Payments Yet</h3>
            <p>
              Payments appear here once milestones are verified and blockchain
              transactions are confirmed.
            </p>
            <button className="fp-btn solid" onClick={() => navigate("/payments")}>
              Back to All Payments
            </button>
          </div>
        )}


      </main>
    </div>
  );
};

export default FarmPaymentsPage;
