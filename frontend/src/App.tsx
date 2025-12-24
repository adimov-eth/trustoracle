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
import type { RiskLevel, WalletStatus } from "@trustsignal/shared/types/oracle";

import { oracleAbi, tokenAbi } from "./abi";
import { getPendingTransfers, type PendingTransfer } from "./api";
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

const RISK_LEVELS: RiskLevel[] = ["UNKNOWN", "GREEN", "YELLOW", "RED"];

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
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);

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

  // Fetch pending transfers
  useEffect(() => {
    if (!accountAddress || !isConnected) {
      setPendingTransfers([]);
      return;
    }

    const fetchPending = async () => {
      const transfers = await getPendingTransfers(accountAddress);
      setPendingTransfers(transfers);
    };

    void fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, [accountAddress, isConnected, txHash]); // Refetch when txHash changes (new transfer)

  const walletStatus = useMemo<WalletStatus | null>(() => {
    if (!statusData) return null;
    const [riskLevelNumber, validUntil, , countryCode] = statusData as readonly [
      number,
      number,
      number,
      `0x${string}`
    ];

    return {
      riskLevel: RISK_LEVELS[Math.min(riskLevelNumber, 3)] ?? "UNKNOWN",
      validUntil,
      countryCode: bytes2ToString(countryCode)
    };
  }, [statusData]);

  const riskLabel = walletStatus?.riskLevel ?? "UNKNOWN";

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
    } catch {
      setTxError("Enter a valid amount.");
      return;
    }

    setTxState("signing");
    setTxHash(null);

    try {
      // With escrow pattern, just call transfer() - it never reverts for auth_required
      // Low-risk transfers complete instantly, high-risk transfers are escrowed
      const hash = await writeContractAsync({
        address: TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: "transfer",
        args: [to as `0x${string}`, amountWei]
      });

      setTxHash(hash);
    } catch (error) {
      setTxState("error");
      setTxError(formatError(error) ?? "Transfer failed");
    }
  };

  const handleCancelTransfer = async (transferId: string) => {
    if (!TOKEN_ADDRESS) return;

    setTxError(null);
    setTxState("signing");

    try {
      const hash = await writeContractAsync({
        address: TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: "cancelTransfer",
        args: [transferId as `0x${string}`]
      });
      setTxHash(hash);
    } catch (error) {
      setTxState("error");
      setTxError(formatError(error) ?? "Cancel failed");
    }
  };

  const activePending = pendingTransfers.filter((t) => t.status === "PENDING");
  const recentRejections = pendingTransfers.filter(
    (t) => t.status === "REJECTED" && t.timestamp > Date.now() / 1000 - 3600
  );

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Compliance Engine</p>
          <h1>{APP_NAME}</h1>
          <p className="lead">
            Move TST across XDC Apothem with instant low-risk transfers.
            High-risk transfers are escrowed and processed by the compliance backend.
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
            Oracle reads determine transfer behavior: instant, escrowed, or blocked.
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

        {activePending.length > 0 && (
          <div className="panel" style={{ animationDelay: "0.12s" }}>
            <div className="panel-header">
              <h2>Pending Transfers</h2>
              <span className="badge badge-warning">{activePending.length}</span>
            </div>
            <div className="pending-list">
              {activePending.map((t) => (
                <div key={t.transferId} className="pending-item">
                  <div className="pending-info">
                    <span className="pending-amount">
                      {formatAmount(BigInt(t.amount), TOKEN_DECIMALS)} {TOKEN_SYMBOL}
                    </span>
                    <span className="pending-to">→ {shortenAddress(t.to as `0x${string}`)}</span>
                  </div>
                  <div className="pending-meta">
                    <span className="pending-time">{formatRelativeTime(t.timestamp)}</span>
                    {isTransferExpired(t.timestamp) && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => void handleCancelTransfer(t.transferId)}
                        disabled={txState === "signing" || txState === "confirming"}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="muted">
              Pending transfers are processed by the backend. You can cancel after 24h.
            </p>
          </div>
        )}

        {recentRejections.length > 0 && (
          <div className="panel" style={{ animationDelay: "0.12s" }}>
            <div className="panel-header">
              <h2>Recent Rejections</h2>
              <span className="badge badge-red">{recentRejections.length}</span>
            </div>
            {recentRejections.map((t) => (
              <div key={t.transferId} className="callout callout-error">
                Transfer of {formatAmount(BigInt(t.amount), TOKEN_DECIMALS)} {TOKEN_SYMBOL} rejected
                {t.rejectionReason && `: ${t.rejectionReason}`}
              </div>
            ))}
          </div>
        )}

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
              {txState === "success" && <span>Transfer submitted</span>}
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
          <h2>Escrow-Based Compliance</h2>
          <p>
            Transfers never revert for compliance. Low-risk transfers complete instantly.
            High-risk transfers are escrowed until the backend validates and releases them.
          </p>
        </div>
        <div className="steps">
          <div>
            <span>01</span>
            <p>User sends tokens (always succeeds)</p>
          </div>
          <div>
            <span>02</span>
            <p>Backend validates compliance</p>
          </div>
          <div>
            <span>03</span>
            <p>Backend releases or rejects transfer</p>
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
      message: "Transfer will be escrowed for backend approval."
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

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() / 1000 - timestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function isTransferExpired(timestamp: number): boolean {
  const TRANSFER_EXPIRY = 24 * 60 * 60; // 24 hours
  return Date.now() / 1000 > timestamp + TRANSFER_EXPIRY;
}
