import React, { useState, useEffect, useRef, useCallback } from "react";
import { useWeb3Auth } from "./Web3Context";
import { ethers } from "ethers";
import { toast } from "react-hot-toast";
import "./WalletInfoWidget.css";

const USDT_ADDRESS = "0x784D56a7d78380e1c5338cDA3839a1d0F7Ba04B9";
const USDT_ABI = ["function balanceOf(address account) external view returns (uint256)"];

const truncate = (addr) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";

export const WalletInfoWidget = () => {
  const { loggedIn, login, logout, provider, loading: authLoading, initialized } = useWeb3Auth();

  const [open, setOpen]             = useState(false);
  const [address, setAddress]       = useState(null);
  const [ethBalance, setEthBalance] = useState(null);
  const [usdtBalance, setUsdtBalance] = useState(null);
  const [fetching, setFetching]     = useState(false);
  const containerRef                = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchBalances = useCallback(async () => {
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
      console.error("Failed to fetch wallet balances:", err);
    } finally {
      setFetching(false);
    }
  }, [loggedIn, provider]);

  useEffect(() => {
    if (loggedIn && provider) {
      fetchBalances();
    } else {
      setAddress(null);
      setEthBalance(null);
      setUsdtBalance(null);
    }
  }, [loggedIn, provider, fetchBalances]);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    toast.success("Address copied!");
  };

  const gasLow = ethBalance !== null && parseFloat(ethBalance) === 0;

  if (!initialized || authLoading) return null;

  /* ── Not connected ── */
  if (!loggedIn) {
    return (
      <button className="ww-pill disconnected" onClick={login}>
        <span className="ww-dot off" />
        <span className="material-symbols-outlined ww-pill-icon">account_balance_wallet</span>
        Connect Wallet
      </button>
    );
  }

  /* ── Connected — pill + dropdown ── */
  return (
    <div className="ww-root" ref={containerRef}>
      {/* Pill trigger */}
      <button
        className={`ww-pill connected${gasLow ? " warn" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ww-dot on" />
        <span className="material-symbols-outlined ww-pill-icon">account_balance_wallet</span>
        <span className="ww-pill-addr">{truncate(address)}</span>
        {gasLow && (
          <span className="ww-pill-warn" title="Zero ETH — need gas">
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
          </span>
        )}
        <span className="material-symbols-outlined ww-pill-chevron">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="ww-dropdown">
          <div className="ww-dropdown-header">
            <span className="ww-dropdown-label">Funder Wallet</span>
            <span className="ww-network-badge">Sepolia</span>
          </div>

          {/* Address row */}
          <div className="ww-addr-block">
            <span className="ww-full-addr">{address ?? "—"}</span>
            <div className="ww-addr-actions">
              <button className="ww-icon-btn" onClick={copyAddress} title="Copy address">
                <span className="material-symbols-outlined">content_copy</span>
              </button>
              <a
                href={`https://sepolia.etherscan.io/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ww-icon-btn"
                title="View on Etherscan"
              >
                <span className="material-symbols-outlined">open_in_new</span>
              </a>
              <button className="ww-icon-btn" onClick={fetchBalances} title="Refresh">
                <span className="material-symbols-outlined">refresh</span>
              </button>
            </div>
          </div>

          {/* Balances */}
          <div className="ww-balances">
            {fetching ? (
              <div className="ww-loading">Loading balances…</div>
            ) : (
              <>
                <div className={`ww-bal-row${gasLow ? " low" : ""}`}>
                  <span className="ww-bal-token">
                    <span className="material-symbols-outlined ww-token-icon">currency_exchange</span>
                    ETH
                  </span>
                  <span className="ww-bal-amount">{ethBalance ?? "—"}</span>
                  {gasLow && (
                    <span className="ww-gas-warn">
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
                      Needs gas faucet
                    </span>
                  )}
                </div>
                <div className="ww-bal-row">
                  <span className="ww-bal-token">
                    <span className="material-symbols-outlined ww-token-icon">attach_money</span>
                    USDT
                  </span>
                  <span className="ww-bal-amount">{usdtBalance ?? "—"}</span>
                </div>
              </>
            )}
          </div>

          {gasLow && (
            <a
              className="ww-faucet-link"
              href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>water_drop</span>
              Get Sepolia ETH from faucet
            </a>
          )}

          <button className="ww-disconnect-btn" onClick={() => { logout(); setOpen(false); }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>logout</span>
            Disconnect wallet
          </button>
        </div>
      )}
    </div>
  );
};
