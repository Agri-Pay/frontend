import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { ethers } from "ethers";
import { createSmartAccountClient } from "@biconomy/account";

// Define the Web3 Context
const Web3Context = createContext();

export const useWeb3Auth = () => useContext(Web3Context);

const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID || "BLsMQ6LN1UyGAbU2We2p0eBgdrfdOX-d9helzenOItCXrL1ytOpBeg1DLTlLbSXGjdWhveXrSM3bcfNDw6OCfR4";
const bundlerUrl = import.meta.env.VITE_BICONOMY_BUNDLER_URL || "";
const paymasterUrl = import.meta.env.VITE_BICONOMY_PAYMASTER_URL || "";

export const Web3Provider = ({ children }) => {
  // Store the Web3Auth instance in a ref so it survives React StrictMode
  // remounts without being reset to null and without triggering re-renders.
  const web3authRef = useRef(null);
  const initRef = useRef(false);

  const [initialized, setInitialized] = useState(false);
  const [provider, setProvider] = useState(null);
  const [smartAccount, setSmartAccount] = useState(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initWeb3Auth = async () => {
      try {
        const chainConfig = {
          chainNamespace: CHAIN_NAMESPACES.EIP155,
          chainId: "0xaa36a7", // Sepolia
          rpcTarget: "https://ethereum-sepolia-rpc.publicnode.com",
          displayName: "Ethereum Sepolia Testnet",
          blockExplorerUrl: "https://sepolia.etherscan.io",
          ticker: "ETH",
          tickerName: "Ethereum",
          logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png"
        };

        const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

        const web3authInstance = new Web3Auth({
          clientId,
          web3AuthNetwork: "sapphire_devnet",
          privateKeyProvider,
          uiConfig: {
            uxMode: "redirect",
          },
        });

        // Persist in ref before init so it's never null after this point
        web3authRef.current = web3authInstance;
        // initModal() initializes both the core AND the modal UI layer.
        // Calling only init() leaves the modal uninitialized → "Login modal is not initialized"
        await web3authInstance.initModal();
        setInitialized(true);

        if (web3authInstance.connected) {
          setProvider(web3authInstance.provider);
          setLoggedIn(true);
        }
      } catch (error) {
        console.error("Failed to initialize Web3Auth:", error);
      }
    };
    initWeb3Auth();
  }, []);

  // Effect to initialize Biconomy Account when Provider connects
  useEffect(() => {
    const initBiconomy = async () => {
      if (provider && loggedIn) {
        try {
          const ethersProvider = new ethers.providers.Web3Provider(provider);
          
          // Guard: Ensure the Web3Auth underlying provider has actually furnished an account
          const accounts = await ethersProvider.listAccounts();
          if (accounts.length === 0) {
            console.log("Web3Auth provider active, but no accounts exposed yet.");
            return;
          }

          const signer = ethersProvider.getSigner();

          if (!bundlerUrl) {
            console.warn("Biconomy bundlerUrl not configured (VITE_BICONOMY_BUNDLER_URL). Smart account skipped.");
            return;
          }
          
          const biconomySmartAccount = await createSmartAccountClient({
            signer: signer,
            chainId: 11155111, // Sepolia
            bundlerUrl,
            ...(paymasterUrl ? { paymasterUrl } : {}),
          });

          setSmartAccount(biconomySmartAccount);
          const address = await biconomySmartAccount.getAccountAddress();
          setSmartAccountAddress(address);
        } catch (error) {
          console.error("Failed to setup Biconomy Smart Account:", error);
        }
      }
    };

    initBiconomy();
  }, [provider, loggedIn]);

  const login = async () => {
    if (!web3authRef.current || !initialized) {
      console.log("Web3auth not initialized yet");
      return;
    }
    setLoading(true);
    try {
      const web3authProvider = await web3authRef.current.connect();
      setProvider(web3authProvider);
      setLoggedIn(true);
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    if (!web3authRef.current) return;
    setLoading(true);
    try {
      await web3authRef.current.logout();
      setProvider(null);
      setSmartAccount(null);
      setSmartAccountAddress("");
      setLoggedIn(false);
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Web3Context.Provider
      value={{
        provider,
        smartAccount,
        smartAccountAddress,
        loggedIn,
        initialized,
        login,
        logout,
        loading
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};
