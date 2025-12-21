import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits, isAddress, parseUnits } from "viem";

import { oracleAbi, tokenAbi } from "./abi";
import { requestAuthorization } from "./api";
import {
  APP_NAME,
  BACKEND_URL,
  CHAIN_ID,
  EXPLORER_URL,
  ORACLE_ADDRESS,
  TOKEN_ADDRESS,
  TOKEN_DECIMALS,
  TOKEN_SYMBOL
} from "./config";

const RISK_LABELS = ["UNKNOWN", "GREEN", "YELLOW", "RED"] as const;

type PreflightState =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ready"; allowed: boolean; reason: string }
  | { state: "error"; message: string };

type TxState = "idle" | "signing" | "confirming" | "success" | "error";

export default function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [preflight, setPreflight] = useState<PreflightState>({ state: "idle" });
  const [txState, setTxState] = useState<TxState>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const accountAddress = address as `0x${string}` | undefined;
  const isCorrectChain = chainId === CHAIN_ID;
  const missingConfig = !ORACLE_ADDRESS || !TOKEN_ADDRESS;

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: accountAddress ? [accountAddress] : undefined,
    query: {
      enabled: Boolean(accountAddress && TOKEN_ADDRESS),
      refetchInterval: 15000
    }
  });

  const { data: statusData, refetch: refetchStatus } = useReadContract({
    address: ORACLE_ADDRESS,
    abi: oracleAbi,
    functionName: "walletStatus",
    args: accountAddress ? [accountAddress] : undefined,
    query: {
      enabled: Boolean(accountAddress && ORACLE_ADDRESS),
      refetchInterval: 20000
    }
  });

  const { data: receipt, isLoading: confirming } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    query: {
      enabled: Boolean(txHash)
    }
  });

  useEffect(() => {
    if (confirming) {
      setTxState("confirming");
      return;
    }

    if (receipt) {
      setTxState("success");
      setTxError(null);
      void refetchBalance();
      void refetchStatus();
      setAmount("");
    }
  }, [confirming, receipt, refetchBalance, refetchStatus]);

  useEffect(() => {
    if (!publicClient || !accountAddress || !isConnected || !isCorrectChain) {
      setPreflight({ state: "idle" });
      return;
    }

    if (!ORACLE_ADDRESS || !isAddress(to) || amount.trim() === "") {
      setPreflight({ state: "idle" });
      return;
    }

    const oracleAddress = ORACLE_ADDRESS as `0x${string}`;
    const recipient = to as `0x${string}`;

    let cancelled = false;
    setPreflight({ state: "checking" });

    const timeout = setTimeout(async () => {
      try {
        const amountWei = parseUnits(amount, TOKEN_DECIMALS);
        const [allowed, reason] = (await publicClient.readContract({
          address: oracleAddress,
          abi: oracleAbi,
          functionName: "checkTransfer",
          args: [accountAddress, recipient, amountWei]
        })) as readonly [boolean, string];

        if (!cancelled) {
          setPreflight({ state: "ready", allowed, reason });
        }
      } catch (error) {
        if (!cancelled) {
          setPreflight({
            state: "error",
            message: formatError(error) ?? "Preflight check failed"
          });
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    publicClient,
    accountAddress,
    isConnected,
    isCorrectChain,
    to,
    amount
  ]);

  const walletStatus = useMemo(() => {
    if (!statusData) return null;
    const [riskLevel, validUntil, , countryCode] = statusData as readonly [
      number,
      number,
      number,
      `0x${string}`
    ];

    return {
      riskLevel,
      validUntil,
      countryCode: bytes2ToString(countryCode)
    };
  }, [statusData]);

  const riskLabel = walletStatus
    ? RISK_LABELS[Math.min(walletStatus.riskLevel, 3)]
    : "UNKNOWN";

  const balanceRaw = balance
    ? formatUnits(balance as bigint, TOKEN_DECIMALS)
    : "0";
  const balanceDisplay = balance
    ? formatAmount(balance as bigint, TOKEN_DECIMALS)
    : "0";

  const canSubmit =
    isConnected &&
    isCorrectChain &&
    !missingConfig &&
    isAddress(to) &&
    amount.trim() !== "" &&
    txState !== "signing" &&
    txState !== "confirming" &&
    !isBlocked(preflight);

  const callout = buildPreflightCallout(preflight);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTxError(null);

    if (!isConnected || !accountAddress) {
      setTxError("Connect a wallet to continue.");
      return;
    }
    if (!isCorrectChain) {
      setTxError("Switch to XDC Apothem to send tokens.");
      return;
    }
    if (!ORACLE_ADDRESS || !TOKEN_ADDRESS) {
      setTxError("Missing contract addresses in the frontend config.");
      return;
    }
    if (!isAddress(to)) {
      setTxError("Enter a valid recipient address.");
      return;
    }

    let amountWei: bigint;
    try {
      amountWei = parseUnits(amount, TOKEN_DECIMALS);
    } catch (error) {
      setTxError("Enter a valid amount.");
      return;
    }

    // Check if preflight indicates authorization is needed
    const needsAuth = preflight.state === "ready" &&
                      !preflight.allowed &&
                      preflight.reason === "AUTHORIZATION_REQUIRED";

    setTxState("signing");
    setTxHash(null);

    try {
      const hash = await writeContractAsync({
        address: TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: "transfer",
        args: [to as `0x${string}`, amountWei]
      });

      setTxHash(hash);
    } catch (error) {
      // Use preflight result instead of trying to parse error
      if (needsAuth || isAuthorizationRequired(error)) {
        try {
          const authResponse = await requestAuthorization(
            accountAddress,
            to as `0x${string}`,
            amountWei.toString()
          );

          const auth = authResponse.authorization;

          const hash = await writeContractAsync({
            address: TOKEN_ADDRESS,
            abi: tokenAbi,
            functionName: "transferWithAuth",
            args: [
              to as `0x${string}`,
              amountWei,
              {
                from: auth.from,
                to: auth.to,
                amount: BigInt(auth.amount),
                nonce: BigInt(auth.nonce),
                expiry: Number(auth.expiry),
                signature: auth.signature
              }
            ]
          });

          setTxHash(hash);
        } catch (authError) {
          setTxState("error");
          setTxError(formatError(authError) ?? "Authorization failed");
        }
        return;
      }

      setTxState("error");
      setTxError(formatError(error) ?? "Transfer failed");
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Compliance Engine</p>
          <h1>{APP_NAME}</h1>
          <p className="lead">
            Move TST across XDC Apothem with instant low-risk transfers and
            cryptographic authorizations for anything that needs fresh
            compliance.
          </p>
          <div className="hero-actions">
            <ConnectButton chainStatus="icon" showBalance={false} />
            {isConnected && !isCorrectChain && (
              <button
                className="btn btn-warning"
                onClick={() => switchChain({ chainId: CHAIN_ID })}
                disabled={isSwitching}
              >
                {isSwitching ? "Switching..." : "Switch to Apothem"}
              </button>
            )}
          </div>
          {missingConfig && (
            <div className="callout callout-error">
              Frontend config missing contract addresses. Set VITE_ORACLE_ADDRESS
              and VITE_TOKEN_ADDRESS in frontend/.env.
            </div>
          )}
        </div>
        <div className="panel hero-panel">
          <div className="chip">XDC Apothem</div>
          <div className="meta">
            <div>
              <span>Oracle</span>
              <strong>{shortenAddress(ORACLE_ADDRESS)}</strong>
            </div>
            <div>
              <span>Token</span>
              <strong>{shortenAddress(TOKEN_ADDRESS)}</strong>
            </div>
            <div>
              <span>Backend</span>
              <strong>{BACKEND_URL.replace(/^https?:\/\//, "")}</strong>
            </div>
          </div>
          <div className="hero-stats">
            <div>
              <p>Green threshold</p>
              <h3>10,000 {TOKEN_SYMBOL}</h3>
            </div>
            <div>
              <p>Yellow threshold</p>
              <h3>1,000 {TOKEN_SYMBOL}</h3>
            </div>
          </div>
        </div>
      </header>

      <section className="grid">
        <div className="panel" style={{ animationDelay: "0.05s" }}>
          <div className="panel-header">
            <h2>Wallet Status</h2>
            <span className={`badge badge-${riskLabel.toLowerCase()}`}
              data-level={riskLabel}
            >
              {riskLabel}
            </span>
          </div>
          <div className="status-grid">
            <div>
              <span>Address</span>
              <strong>{isConnected ? shortenAddress(accountAddress) : "-"}</strong>
            </div>
            <div>
              <span>Country</span>
              <strong>{walletStatus?.countryCode || "-"}</strong>
            </div>
            <div>
              <span>Status expiry</span>
              <strong>
                {walletStatus?.validUntil
                  ? formatDate(walletStatus.validUntil)
                  : "-"}
              </strong>
            </div>
          </div>
          <p className="muted">
            Oracle reads decide whether transfers are instant, authorized, or
            blocked.
          </p>
        </div>

        <div className="panel" style={{ animationDelay: "0.1s" }}>
          <div className="panel-header">
            <h2>Balance</h2>
            <span className="badge badge-neutral">{TOKEN_SYMBOL}</span>
          </div>
          <div className="balance">
            <h3>{balanceDisplay}</h3>
            <p>Available {TOKEN_SYMBOL} for transfers.</p>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => void refetchBalance()}
            disabled={!isConnected}
          >
            Refresh balance
          </button>
        </div>

        <div className="panel panel-wide" style={{ animationDelay: "0.15s" }}>
          <div className="panel-header">
            <h2>Send Tokens</h2>
            <span className="badge badge-neutral">Transfer</span>
          </div>
          <form className="transfer-form" onSubmit={handleSubmit}>
            <label>
              Recipient address
              <input
                value={to}
                onChange={(event) => setTo(event.target.value.trim())}
                placeholder="0x..."
              />
            </label>
            <label>
              Amount
              <div className="amount-row">
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder={`0.0 ${TOKEN_SYMBOL}`}
                  inputMode="decimal"
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setAmount(balanceRaw)}
                  disabled={!balance || balanceRaw === "0"}
                >
                  Max
                </button>
              </div>
            </label>
            {callout && (
              <div className={`callout callout-${callout.tone}`}>
                {callout.message}
              </div>
            )}
            {txError && (
              <div className="callout callout-error">{txError}</div>
            )}
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
                {txState === "signing" ? "Approve in wallet" : "Send"}
              </button>
              {txState === "confirming" && <span>Confirming on-chain...</span>}
              {txState === "success" && <span>Transfer confirmed</span>}
            </div>
            {txHash && (
              <a
                className="tx-link"
                href={`${EXPLORER_URL}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction
              </a>
            )}
          </form>
        </div>
      </section>

      <section className="panel spotlight">
        <div>
          <h2>Authorization Flow</h2>
          <p>
            High-value transfers prompt the backend to sign a short-lived
            authorization. The token contract verifies it before moving funds.
          </p>
        </div>
        <div className="steps">
          <div>
            <span>01</span>
            <p>Backend checks compliance in real time.</p>
          </div>
          <div>
            <span>02</span>
            <p>Signer returns a time-bound authorization.</p>
          </div>
          <div>
            <span>03</span>
            <p>Transfer executes with fresh data on-chain.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function buildPreflightCallout(preflight: PreflightState):
  | { tone: "info" | "warning" | "error" | "success"; message: string }
  | null {
  if (preflight.state === "idle") return null;
  if (preflight.state === "checking") {
    return { tone: "info", message: "Checking oracle status..." };
  }
  if (preflight.state === "error") {
    return { tone: "error", message: preflight.message };
  }
  if (preflight.allowed) {
    return { tone: "success", message: "Instant transfer ready." };
  }
  if (preflight.reason === "AUTHORIZATION_REQUIRED") {
    return {
      tone: "warning",
      message:
        "Authorization required. The backend will sign this transfer before submit."
    };
  }
  return { tone: "error", message: `Blocked: ${preflight.reason}` };
}

function isBlocked(preflight: PreflightState): boolean {
  return (
    preflight.state === "ready" &&
    !preflight.allowed &&
    preflight.reason !== "AUTHORIZATION_REQUIRED"
  );
}

function formatError(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const anyError = error as {
      shortMessage?: string;
      message?: string;
      reason?: string;
      cause?: { reason?: string; shortMessage?: string };
    };
    return (
      anyError.shortMessage ||
      anyError.reason ||
      anyError.cause?.reason ||
      anyError.cause?.shortMessage ||
      anyError.message ||
      null
    );
  }
  return null;
}

function isAuthorizationRequired(error: unknown): boolean {
  console.log('[DEBUG] Checking authorization error:', error);

  const message = formatError(error) ?? "";
  console.log('[DEBUG] Formatted message:', message);
  if (message.includes("AUTHORIZATION_REQUIRED")) return true;

  // Check for viem/wagmi error structure
  if (error && typeof error === "object") {
    try {
      // Use replacer to handle BigInt serialization
      const errorStr = JSON.stringify(error, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
      );
      console.log('[DEBUG] Stringified error:', errorStr.substring(0, 500));
      if (errorStr.includes("AUTHORIZATION_REQUIRED")) return true;
    } catch (e) {
      console.log('[DEBUG] Stringify failed, using manual search:', e);
      // If stringify still fails, do manual deep search
      const searchError = (obj: any): boolean => {
        if (!obj || typeof obj !== 'object') return false;
        for (const key in obj) {
          const val = obj[key];
          if (typeof val === 'string' && val.includes("AUTHORIZATION_REQUIRED")) return true;
          if (typeof val === 'object' && searchError(val)) return true;
        }
        return false;
      };
      return searchError(error);
    }
  }

  return false;
}

function formatAmount(value: bigint, decimals: number): string {
  const raw = formatUnits(value, decimals);
  const [whole, fraction] = raw.split(".");
  if (!fraction) return whole;
  const trimmed = fraction.slice(0, 4).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function shortenAddress(address?: `0x${string}`): string {
  if (!address) return "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function bytes2ToString(value: `0x${string}`): string {
  const hex = value.replace(/^0x/, "");
  if (!hex) return "";
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []);
  return new TextDecoder().decode(bytes).replace(/\u0000/g, "");
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}
