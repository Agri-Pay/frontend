import React, { useState } from "react";
import { useWeb3Auth } from "./Web3Context";
import { ethers } from "ethers";
import { toast } from "react-hot-toast";
import { supabase } from "./createclient";

const CROP_ESCROW_ADDRESS = "0x9cFF3a5A713C0B2464E59d13C92018Ea7febDd25";
const USDT_ADDRESS = "0x784D56a7d78380e1c5338cDA3839a1d0F7Ba04B9";

const CROP_ESCROW_ABI = [
  "function deposit(bytes32 _milestoneId, address _farmer, uint256 _amount) external"
];
const USDT_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external"
];

export const FundMilestoneButton = ({ milestone, farm }) => {
  const { loggedIn, login, provider, loading: authLoading, initialized } = useWeb3Auth();
  const [funding, setFunding] = useState(false);

  const handleFund = async () => {
    if (!initialized) {
      toast("Wallet is still initializing, please wait a moment.");
      return;
    }
    if (!loggedIn || !provider) {
      toast("Please login with your wallet to fund this milestone.");
      await login();
      return;
    }

    try {
      setFunding(true);
      toast.loading("Preparing transaction...", { id: "fund-toast" });

      const ethersProvider = new ethers.providers.Web3Provider(provider);
      const signer = ethersProvider.getSigner();
      const signerAddress = await signer.getAddress();

      const usdtContract   = new ethers.Contract(USDT_ADDRESS, USDT_ABI, signer);
      const escrowContract = new ethers.Contract(CROP_ESCROW_ADDRESS, CROP_ESCROW_ABI, signer);

      // Amount: milestone.amount is stored in paisa (×100), parse as 6-decimal USDT
      // e.g. Rs 50000 stored as 5000000 paisa → 500.00 USDT (6 decimals)
      if (!milestone.amount || milestone.amount <= 0) {
        toast.error(
          "This milestone has no amount set. Please set the milestone amount before funding.",
          { id: "fund-toast", duration: 6000 }
        );
        return;
      }

      const amountToFund = ethers.utils.parseUnits(
        (milestone.amount / 100).toFixed(6),
        6
      );

      const milestoneIdBytes = ethers.utils.id(String(milestone.id));

      if (!farm?.wallet_address || !ethers.utils.isAddress(farm.wallet_address)) {
        toast.error(
          "This farm has no wallet address set. Ask the farmer to add their Ethereum address in their farm profile before funding.",
          { id: "fund-toast", duration: 6000 }
        );
        return;
      }
      const farmerAddress = farm.wallet_address;

      // Step 1: Mint mock USDT to funder's address (test only)
      toast.loading("Minting test USDT...", { id: "fund-toast" });
      const mintTx = await usdtContract.mint(signerAddress, amountToFund);
      await mintTx.wait();

      // Step 2: Approve escrow to spend
      toast.loading("Approving escrow contract...", { id: "fund-toast" });
      const approveTx = await usdtContract.approve(CROP_ESCROW_ADDRESS, amountToFund);
      await approveTx.wait();

      // Step 3: Deposit into escrow
      toast.loading("Depositing into escrow...", { id: "fund-toast" });
      const depositTx = await escrowContract.deposit(milestoneIdBytes, farmerAddress, amountToFund);
      const receipt   = await depositTx.wait();

      toast.success("Milestone funded successfully!", { id: "fund-toast" });
      console.log("Deposit tx:", receipt.transactionHash);

      // Mark milestone as funded in DB so UI updates live
      await supabase
        .from("cycle_milestones")
        .update({ payment_status: "funded", updated_at: new Date().toISOString() })
        .eq("id", milestone.id);

    } catch (err) {
      console.error(err);
      toast.error("Funding failed: " + (err.reason || err.message), { id: "fund-toast" });
    } finally {
      setFunding(false);
    }
  };

  if (milestone.payment_status === "paid") {
    return null;
  }

  if (milestone.payment_status === "funded") {
    return (
      <div
        style={{
          marginTop: "8px",
          padding: "4px 8px",
          borderRadius: "4px",
          background: "#ede9fe",
          color: "#6d28d9",
          fontSize: "12px",
          textAlign: "center",
          border: "1px solid #c4b5fd",
        }}
      >
        Funded · Awaiting Release
      </div>
    );
  }

  const noWallet  = !farm?.wallet_address || !ethers.utils.isAddress(farm.wallet_address);
  const noAmount  = !milestone.amount || milestone.amount <= 0;
  const isDisabled = funding || authLoading || !initialized || noWallet || noAmount;

  const buttonTitle = noAmount
    ? "Milestone has no amount set — cannot fund"
    : noWallet
    ? "Farmer has no wallet address set — cannot fund"
    : undefined;

  const buttonLabel = funding
    ? "Processing..."
    : noAmount
    ? "No Amount Set"
    : noWallet
    ? "No Wallet Set"
    : loggedIn
    ? "Fund Milestone"
    : "Connect Wallet";

  return (
    <button
      onClick={handleFund}
      disabled={isDisabled}
      title={buttonTitle}
      style={{
        marginTop: "8px",
        padding: "4px 8px",
        borderRadius: "4px",
        background: noAmount || noWallet ? "#94a3b8" : "#059669",
        color: "white",
        border: "none",
        cursor: isDisabled ? "not-allowed" : "pointer",
        fontSize: "12px",
        display: "block",
        width: "100%",
        opacity: isDisabled ? 0.7 : 1
      }}
    >
      {buttonLabel}
    </button>
  );
};
