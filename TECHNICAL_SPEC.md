# TrustSignal Oracle - Technical Specification

**Version:** 1.0
**Date:** December 30, 2025
**Status:** Proof of Concept - Demo Ready
**Network:** XDC Apothem Testnet (Chain ID: 51)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Smart Contracts](#smart-contracts)
4. [Backend Service](#backend-service)
5. [Admin Dashboard](#admin-dashboard)
6. [User Frontend](#user-frontend)
7. [Transfer Flow](#transfer-flow)
8. [API Reference](#api-reference)
9. [Security Model](#security-model)
10. [Deployment](#deployment)
11. [Known Limitations](#known-limitations)
12. [Future Enhancements](#future-enhancements)

---

## Executive Summary

TrustSignal Oracle is a regulatory-compliant ERC-20 token system that enforces transfer restrictions via an on-chain oracle. The system enables:

- **Instant transfers** for low-value transactions between verified (GREEN) wallets
- **Escrowed transfers** for high-value or elevated-risk transactions requiring backend approval
- **Blocked transfers** for wallets flagged as RED or unverified (UNKNOWN)

The key innovation is that **users can send tokens using any standard wallet** (MetaMask, etc.) without special integrations. High-risk transfers are automatically escrowed rather than rejected, and the compliance backend processes them asynchronously.

### Deployed Contracts

| Contract | Address |
|----------|---------|
| TrustSignalOracle | `0x24a1BA1CB110336e8cE7b5371ebC6F765bE567D0` |
| TrustSignalToken | `0xf103aBe6039c49259Ee7c014a40603545476F6ef` |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                              │
├─────────────────────────────────────────────────────────────────────┤
│  Frontend (React)              │  Admin Dashboard (React)           │
│  - Connect wallet              │  - Wallet registry                 │
│  - Send tokens                 │  - Transfer queue                  │
│  - View pending transfers      │  - Manual complete/reject          │
│  - Cancel transfers            │  - Audit log                       │
│  Port: 5173                    │  Port: 5174                        │
└────────────────┬───────────────┴──────────────────┬─────────────────┘
                 │                                   │
                 ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVICE                              │
│  (Bun + Hono, Port 3000)                                            │
├─────────────────────────────────────────────────────────────────────┤
│  Services:                     │  Storage:                          │
│  - Watcher (event listener)    │  - SQLite (admin.db)               │
│  - Indexer (historical sync)   │    - wallets                       │
│  - Signer (EIP-712)            │    - pending_transfers             │
│  - Compliance (validation)     │    - audit_log                     │
├─────────────────────────────────────────────────────────────────────┤
│  API Routes:                                                         │
│  - /api/v1/status/:address     - Wallet status lookup               │
│  - /api/v1/nonce/:address      - Authorization nonce                │
│  - /api/v1/authorize           - Request transfer authorization     │
│  - /api/v1/transfers/:address  - User's transfer history            │
│  - /api/v1/admin/*             - Admin APIs (auth required)         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      XDC APOTHEM BLOCKCHAIN                          │
├─────────────────────────────────────────────────────────────────────┤
│  TrustSignalOracle                │  TrustSignalToken                │
│  - Wallet status registry         │  - ERC-20 token                  │
│  - Transfer authorization         │  - Escrow mechanism              │
│  - Authorized signers             │  - Pending transfers             │
│  - Threshold configuration        │  - EIP-712 signatures            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Smart Contracts

### TrustSignalOracle

**Purpose:** Stores wallet compliance status and validates transfers.

#### Data Structures

```solidity
enum RiskLevel { UNKNOWN, GREEN, YELLOW, RED }

struct WalletStatus {
    RiskLevel riskLevel;    // 0=UNKNOWN, 1=GREEN, 2=YELLOW, 3=RED
    uint40 validUntil;      // Unix timestamp when status expires
    uint40 lastUpdated;     // Unix timestamp of last update
    bytes2 countryCode;     // ISO 3166-1 alpha-2 (e.g., "US")
}
```

#### Key Functions

| Function | Access | Description |
|----------|--------|-------------|
| `setWalletStatus(wallet, riskLevel, validUntil, countryCode)` | Authorized Signer | Set status for single wallet |
| `setWalletStatusBatch(...)` | Authorized Signer | Batch update multiple wallets |
| `checkTransfer(from, to, amount)` | View | Check if transfer is allowed |
| `checkTransferWithAuth(from, to, amount, auth)` | Public | Validate transfer with signature |
| `walletStatus(wallet)` | View | Get wallet status |
| `setAuthorizedSigner(signer, authorized)` | Owner | Add/remove signers |
| `setThresholds(green, yellow)` | Owner | Update transfer thresholds |

#### Transfer Validation Logic

```
checkTransfer(from, to, amount):

    if sender.riskLevel == RED:         return (false, "SENDER_BLOCKED")
    if receiver.riskLevel == RED:       return (false, "RECEIVER_BLOCKED")
    if sender.riskLevel == UNKNOWN:     return (false, "SENDER_NOT_VERIFIED")
    if receiver.riskLevel == UNKNOWN:   return (false, "RECEIVER_NOT_VERIFIED")

    if sender == GREEN and receiver == GREEN:
        if amount <= greenThreshold and !expired:
            return (true, "")

    if sender == YELLOW or receiver == YELLOW:
        if amount <= yellowThreshold and !expired:
            return (true, "")

    return (false, "AUTHORIZATION_REQUIRED")
```

#### Configuration

| Parameter | Current Value | Description |
|-----------|---------------|-------------|
| `greenThreshold` | 10,000 TST | Max instant transfer for GREEN→GREEN |
| `yellowThreshold` | 1,000 TST | Max instant transfer involving YELLOW |
| `defaultValidityPeriod` | 365 days | Default status expiry |

#### Events

```solidity
event WalletStatusUpdated(address indexed wallet, RiskLevel riskLevel, uint40 validUntil, bytes2 countryCode);
event AuthorizedSignerUpdated(address indexed signer, bool authorized);
event ThresholdsUpdated(uint256 greenThreshold, uint256 yellowThreshold);
```

---

### TrustSignalToken

**Purpose:** ERC-20 token with escrow-based compliance.

#### Key Innovation

Standard `transfer()` and `transferFrom()` work with any wallet. When authorization is required:
1. Tokens are moved to escrow (the contract itself)
2. A `TransferPending` event is emitted
3. Backend detects the event and processes compliance
4. Backend calls `completeTransfer()` or `rejectTransfer()` with EIP-712 signature

#### Data Structures

```solidity
enum TransferStatus { NONE, PENDING, COMPLETED, CANCELLED, REJECTED }

struct PendingTransfer {
    address from;
    address to;
    uint256 amount;
    uint48 timestamp;
    TransferStatus status;
}

// Transfer ID = keccak256(from, to, amount, timestamp)
mapping(bytes32 => PendingTransfer) public pendingTransfers;
```

#### Key Functions

| Function | Access | Description |
|----------|--------|-------------|
| `transfer(to, amount)` | Public | Standard ERC-20 (may escrow) |
| `transferFrom(from, to, amount)` | Public | Standard ERC-20 (may escrow) |
| `completeTransfer(transferId, deadline, signature)` | Public | Complete escrowed transfer |
| `rejectTransfer(transferId, reason, deadline, signature)` | Public | Reject and return to sender |
| `cancelTransfer(transferId)` | Sender/Anyone after 24h | Cancel pending transfer |
| `getPendingTransfer(transferId)` | View | Get transfer details |
| `computeTransferId(from, to, amount, timestamp)` | View | Calculate transfer ID |

#### EIP-712 Signatures

**CompleteTransfer:**
```
keccak256(
    "CompleteTransfer(bytes32 transferId,address from,address to,uint256 amount,uint256 deadline)"
)
```

**RejectTransfer:**
```
keccak256(
    "RejectTransfer(bytes32 transferId,address from,address to,uint256 amount,string reason,uint256 deadline)"
)
```

#### Events

```solidity
event TransferPending(bytes32 indexed transferId, address indexed from, address indexed to, uint256 amount);
event TransferCompleted(bytes32 indexed transferId);
event TransferCancelled(bytes32 indexed transferId);
event TransferRejected(bytes32 indexed transferId, string reason);
```

#### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `TRANSFER_EXPIRY` | 24 hours | After this, anyone can cancel |

---

## Backend Service

### Overview

The backend is a Bun + Hono application that:
1. Watches for `TransferPending` events on-chain
2. Validates escrowed transfers against compliance rules
3. Signs and submits `completeTransfer()` or `rejectTransfer()` transactions
4. Provides APIs for frontend and admin dashboard
5. Indexes wallet status events for the admin registry

### Services

#### Watcher (`src/services/watcher.ts`)

Polls for new `TransferPending` events every 3 seconds. When detected:

```
1. Parse event: transferId, from, to, amount, timestamp
2. Store in pending_transfers table
3. Run compliance validation:
   - Check sender/receiver risk levels
   - Check status expiry
   - (Future: additional rules)
4. If approved:
   - Sign CompleteTransfer message (EIP-712)
   - Submit completeTransfer() transaction
   - Update DB status to COMPLETED
5. If rejected:
   - Sign RejectTransfer message with reason
   - Submit rejectTransfer() transaction
   - Update DB status to REJECTED
6. Log to audit_log
```

#### Indexer (`src/services/indexer.ts`)

On startup, syncs historical `WalletStatusUpdated` events to populate the wallet registry. Then watches for new events in real-time.

#### Signer (`src/lib/signer.ts`)

Generates EIP-712 signatures for transfer completion/rejection:

```typescript
signCompleteTransfer(transferId, from, to, amount, deadline): Promise<`0x${string}`>
signRejectTransfer(transferId, from, to, amount, reason, deadline): Promise<`0x${string}`>
```

Uses `SIGNER_PRIVATE_KEY` from environment. This key must be registered as an authorized signer in the Oracle contract.

#### Compliance (`src/lib/compliance.ts`)

Current validation logic:

```typescript
validateTransfer(from, to, amount):
    if fromRisk == RED: return { approved: false, reason: "SENDER_BLOCKED" }
    if toRisk == RED: return { approved: false, reason: "RECIPIENT_BLOCKED" }
    if fromStatus.validUntil < now: return { approved: false, reason: "SENDER_STATUS_EXPIRED" }
    if toStatus.validUntil < now: return { approved: false, reason: "RECIPIENT_STATUS_EXPIRED" }
    if fromRisk == UNKNOWN: return { approved: false, reason: "SENDER_NOT_VERIFIED" }
    if toRisk == UNKNOWN: return { approved: false, reason: "RECIPIENT_NOT_VERIFIED" }
    return { approved: true }
```

### Database Schema

**SQLite file:** `backend/data/admin.db`

```sql
-- Wallet registry (from indexed events)
CREATE TABLE wallets (
    address TEXT PRIMARY KEY,
    risk_level INTEGER NOT NULL,
    valid_until INTEGER NOT NULL,
    last_updated INTEGER NOT NULL,
    country_code TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    update_count INTEGER DEFAULT 1
);

-- Pending transfer tracking
CREATE TABLE pending_transfers (
    transfer_id TEXT PRIMARY KEY,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    block_number INTEGER NOT NULL,
    transaction_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    process_attempts INTEGER DEFAULT 0,
    last_attempt INTEGER,
    completion_hash TEXT,
    rejection_reason TEXT,
    created_at INTEGER NOT NULL
);

-- Audit log
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    tx_hash TEXT,
    metadata TEXT
);
```

### Configuration

**Environment variables (`backend/.env`):**

```bash
# Required
SIGNER_PRIVATE_KEY=0x...          # Backend signer key (authorized in Oracle)
XDC_RPC_URL=https://rpc.apothem.network
CHAIN_ID=51
ORACLE_ADDRESS=0x24a1BA1CB110336e8cE7b5371ebC6F765bE567D0
TOKEN_ADDRESS=0xf103aBe6039c49259Ee7c014a40603545476F6ef

# Optional
PORT=3000
AUTH_EXPIRY_SECONDS=300           # Signature validity (5 minutes)
ADMIN_API_KEY=your-secret-key     # Admin API authentication
ADMIN_DB_PATH=./data/admin.db
INDEXER_START_BLOCK=0             # Block to start indexing from
INDEXER_POLL_INTERVAL=10000       # Indexer poll interval (ms)
```

---

## Admin Dashboard

### Overview

Separate React application for compliance administrators.

**URL:** https://api-trust.rubeton.app/ or http://localhost:5174

### Pages

#### Dashboard
- Total wallet count
- Risk distribution chart (GREEN/YELLOW/RED)
- Pending transfers count
- Recent activity

#### Wallet Registry
- Searchable/filterable wallet table
- Risk level badges
- Expiry dates
- "Add Wallet" button to whitelist new addresses
- "Update" button to change wallet status

#### Transfer Queue
- List of all transfers (filterable by status)
- For PENDING transfers:
  - ✓ Complete (manual approve)
  - ✗ Reject (with reason input)
  - Retry (re-run compliance check)
- Amount displayed in TST (not wei)

#### Audit Log
- Chronological log of all admin actions
- WALLET_STATUS_CREATED, WALLET_STATUS_UPDATED
- TRANSFER_COMPLETED, TRANSFER_REJECTED
- Expandable rows with metadata

### Authentication

All admin API requests require `X-Admin-Key` header matching `ADMIN_API_KEY` in backend config.

---

## User Frontend

### Overview

React + RainbowKit application for end users.

**URL:** https://trust.rubeton.app/ or http://localhost:5173

### Features

1. **Connect Wallet** - MetaMask integration via RainbowKit
2. **View Status** - Shows user's risk level badge (GREEN/YELLOW/RED/UNKNOWN)
3. **View Balance** - TST token balance
4. **Send Tokens** - Transfer form with recipient address and amount
5. **Pending Transfers** - Panel showing user's escrowed transfers with cancel button

### Transfer Flow (User Perspective)

1. User enters recipient and amount
2. Frontend calls `oracle.checkTransfer()` to preflight
3. If allowed: direct transfer, instant completion
4. If authorization required: transfer succeeds (from user's view), tokens escrowed
5. Frontend shows pending transfer in panel
6. Backend processes and completes/rejects
7. Frontend updates status on next poll

---

## Transfer Flow

### Scenario 1: Instant Transfer (GREEN → GREEN, low value)

```
User                    Token Contract              Oracle
  │                           │                        │
  │─── transfer(to, 500) ────▶│                        │
  │                           │── checkTransfer() ────▶│
  │                           │◀── (true, "") ─────────│
  │                           │                        │
  │                           │ [Direct transfer]      │
  │◀── Transfer event ────────│                        │
  │                           │                        │
  │   [Complete in ~3 sec]    │                        │
```

### Scenario 2: Escrowed Transfer (GREEN → GREEN, high value)

```
User                Token Contract           Backend              Oracle
  │                       │                     │                    │
  │─ transfer(to,15000) ─▶│                     │                    │
  │                       │── checkTransfer() ─────────────────────▶│
  │                       │◀── (false, "AUTH_REQUIRED") ────────────│
  │                       │                     │                    │
  │                       │ [Escrow to contract]│                    │
  │◀─ TransferPending ────│                     │                    │
  │                       │                     │                    │
  │                       │    [Watcher detects event]               │
  │                       │                     │── validateTransfer()
  │                       │                     │◀── { approved: true }
  │                       │                     │                    │
  │                       │                     │── signComplete() ──│
  │                       │◀── completeTransfer(sig) ───────────────│
  │                       │                     │                    │
  │◀─ TransferCompleted ──│                     │                    │
  │                       │                     │                    │
  │   [Complete in ~6 sec]│                     │                    │
```

### Scenario 3: Blocked Transfer (to RED wallet)

```
User                    Token Contract              Oracle
  │                           │                        │
  │─── transfer(to, 100) ────▶│                        │
  │                           │── checkTransfer() ────▶│
  │                           │◀── (false, "RECEIVER_BLOCKED") ─────│
  │                           │                        │
  │◀── REVERT ────────────────│                        │
  │                           │                        │
  │   [Immediate failure]     │                        │
```

---

## API Reference

### Public APIs

#### GET /api/v1/status/:address

Get wallet compliance status.

**Response:**
```json
{
  "address": "0x...",
  "riskLevel": "GREEN",
  "validUntil": 1735689600,
  "countryCode": "US",
  "isExpired": false
}
```

#### GET /api/v1/nonce/:address

Get authorization nonce for address.

**Response:**
```json
{
  "nonce": 0
}
```

#### POST /api/v1/authorize

Request transfer authorization (for frontend auth flow).

**Request:**
```json
{
  "from": "0x...",
  "to": "0x...",
  "amount": "15000000000000000000000"
}
```

**Response:**
```json
{
  "authorized": true,
  "authorization": {
    "from": "0x...",
    "to": "0x...",
    "amount": "15000000000000000000000",
    "nonce": 0,
    "expiry": 1735689600,
    "signature": "0x..."
  }
}
```

#### GET /api/v1/transfers/:address

Get transfers for address.

**Response:**
```json
{
  "transfers": [
    {
      "transferId": "0x...",
      "from": "0x...",
      "to": "0x...",
      "amount": "15000000000000000000000",
      "timestamp": 1735689000,
      "status": "COMPLETED"
    }
  ]
}
```

### Admin APIs

All require `X-Admin-Key` header.

#### GET /api/v1/admin/wallets

List wallets with filtering.

**Query params:** `page`, `limit`, `riskLevel`, `countryCode`, `search`, `expiringSoon`, `sortBy`, `sortOrder`

#### POST /api/v1/admin/wallets

Create new wallet status.

**Request:**
```json
{
  "address": "0x...",
  "riskLevel": "GREEN",
  "validUntil": 1767225600,
  "countryCode": "US"
}
```

#### POST /api/v1/admin/wallets/:address/status

Update wallet status.

#### GET /api/v1/admin/transfers

List transfers with filtering.

**Query params:** `page`, `limit`, `status`

#### POST /api/v1/admin/transfers/:transferId/complete

Manually approve pending transfer (bypasses compliance check).

#### POST /api/v1/admin/transfers/:transferId/reject

Manually reject pending transfer.

**Request:**
```json
{
  "reason": "ADMIN_REJECTED"
}
```

#### POST /api/v1/admin/transfers/:transferId/retry

Re-run compliance check on pending transfer.

#### GET /api/v1/admin/statistics

Get wallet statistics.

#### GET /api/v1/admin/audit

Get audit log entries.

---

## Security Model

### Access Control

| Role | Capabilities |
|------|--------------|
| **Oracle Owner** | Add/remove signers, update thresholds, transfer ownership |
| **Authorized Signer** | Update wallet status (single or batch) |
| **Backend Service** | Sign transfer completions/rejections (uses signer key) |
| **Admin** | API access with ADMIN_API_KEY |
| **User** | Transfer tokens, cancel own pending transfers |

### Key Management

| Key | Purpose | Storage |
|-----|---------|---------|
| Oracle Owner Key | Contract admin | Secure wallet (not in backend) |
| Signer Private Key | Backend operations | `SIGNER_PRIVATE_KEY` env var |
| Admin API Key | Admin dashboard auth | `ADMIN_API_KEY` env var |

### Signature Security

- **EIP-712 typed data** for transfer completion/rejection
- **5-minute expiry** on signatures (`AUTH_EXPIRY_SECONDS`)
- **Nonce tracking** prevents replay (for authorize flow)
- **Chain ID binding** prevents cross-chain replay

### Attack Mitigations

| Attack | Mitigation |
|--------|------------|
| Replay | Nonce + chain ID + transfer ID |
| Front-running | Short expiry, specific amounts |
| Key compromise | Separate signer key, can be rotated |
| Unauthorized admin access | API key authentication |

---

## Deployment

### Prerequisites

- Bun runtime
- Access to XDC Apothem RPC
- Signer key with XDC for gas
- Signer key registered as authorized in Oracle

### Quick Start

```bash
# Install dependencies
bun install

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your keys

# Start backend
cd backend && bun run src/index.ts

# Start frontend (new terminal)
cd frontend && bun run dev

# Start admin (new terminal)
cd admin && bun run dev
```

### Running Demo

```bash
cd backend && bun run test/demo-scenarios.ts
```

Runs three scenarios:
1. Instant transfer (500 TST)
2. Escrowed transfer (15,000 TST)
3. Blocked transfer (to RED wallet)

---

## Known Limitations

### Current State

| Limitation | Impact | Workaround |
|------------|--------|------------|
| No rate limiting | Splitting attacks possible | Manual monitoring |
| No instant revoke | Status update requires tx | Proactive monitoring |
| Single backend signer | No redundancy | Deploy backup instance |
| Polling-based watcher | 3s latency | Acceptable for PoC |
| No Notary Node integration | Centralized trust | Admin panel serves as mock |

### Not Implemented

- Transaction rate limiting per wallet
- Enhanced due diligence flags
- Cross-jurisdiction rules
- Webhook notifications
- Multi-signature admin actions

---

## Future Enhancements

### Near-term

1. **Rate Limiting** - Track transaction frequency, flag rapid small transfers
2. **Instant Revoke** - Emergency blacklist function that clears cache
3. **Webhook Notifications** - Alert on pending transfers, status changes
4. **Batch Operations** - Bulk wallet updates from CSV

### Medium-term

1. **Notary Node Network** - Decentralized verification with multiple signers
2. **Enhanced Due Diligence** - Flag transfers for manual review based on rules
3. **Jurisdiction Rules** - Country-specific transfer restrictions
4. **WebSocket Updates** - Real-time UI updates

### Long-term

1. **Multi-chain Deployment** - Ethereum, Polygon, etc.
2. **Plugin Integration** - Chainlink, XDC Plugin
3. **Zero-Knowledge Proofs** - Privacy-preserving compliance
4. **Decentralized ID Integration** - Self-sovereign identity verification

---

## Appendix: Error Codes

### Oracle Errors

| Code | Meaning |
|------|---------|
| `SENDER_BLOCKED` | Sender is RED |
| `RECEIVER_BLOCKED` | Receiver is RED |
| `SENDER_NOT_VERIFIED` | Sender is UNKNOWN |
| `RECEIVER_NOT_VERIFIED` | Receiver is UNKNOWN |
| `AUTHORIZATION_REQUIRED` | Transfer needs backend approval |
| `AUTH_EXPIRED` | Authorization signature expired |
| `AUTH_NONCE_INVALID` | Wrong nonce |
| `AUTH_INVALID_SIGNER` | Signer not authorized |

### Token Errors

| Code | Meaning |
|------|---------|
| `TRANSFER_EXISTS` | Duplicate transfer ID |
| `NOT_PENDING` | Transfer not in pending state |
| `SIGNATURE_EXPIRED` | Completion/rejection signature expired |
| `INVALID_SIGNER` | Signer not authorized in Oracle |
| `NOT_SENDER` | Only sender can cancel before expiry |

### Backend Errors

| Code | Meaning |
|------|---------|
| `SENDER_STATUS_EXPIRED` | Sender's verification expired |
| `RECIPIENT_STATUS_EXPIRED` | Recipient's verification expired |
| `TRANSFER_NOT_FOUND` | Transfer ID not in database |
| `TRANSFER_NOT_PENDING` | Transfer already resolved |
| `TOKEN_NOT_CONFIGURED` | Missing TOKEN_ADDRESS config |
| `CHAIN_READ_ERROR` | RPC call failed |

---


**Repository:** github.com/adimov-eth/trustoracle