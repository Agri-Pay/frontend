/**
 * Smart contract addresses deployed on Sepolia testnet.
 *
 * After redeploying contracts with corrected 6-decimal MockUSDT,
 * update BOTH addresses here. Every file in the frontend imports
 * from this single source of truth.
 *
 * Current deployment (18-decimal MockUSDT — to be replaced):
 *   MockUSDT:    0x784D56a7d78380e1c5338cDA3839a1d0F7Ba04B9
 *   CropEscrow:  0x9cFF3a5A713C0B2464E59d13C92018Ea7febDd25
 */

// ── Addresses ─────────────────────────────────────────────────
export const CROP_ESCROW_ADDRESS = "0x17125Ecd14205750BF1E0aD32d175989669De6Ad";
export const USDT_ADDRESS = "0x4E0C673e9178125fCd1c4798c67ffc7d7dD38EA0";

// ── ABIs (human-readable ethers v5 format) ────────────────────
export const CROP_ESCROW_ABI = [
  "function deposit(bytes32 _milestoneId, address _farmer, uint256 _amount) external",
];

export const USDT_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)",
];

// ── Token config ──────────────────────────────────────────────
export const USDT_DECIMALS = 6;

// ── Network ───────────────────────────────────────────────────
export const BLOCK_EXPLORER_URL = "https://sepolia.etherscan.io";
export const NETWORK_NAME = "Sepolia";
