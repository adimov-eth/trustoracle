# TrustSignal Token

Regulatory-compliant ERC-20 on XDC with escrow-based compliance. Low-risk transfers complete instantly; high-risk transfers are escrowed and processed by a backend compliance service.

## How It Works

```
User sends transfer
        │
        ▼
┌───────────────────┐
│  Oracle checks:   │
│  - Wallet status  │
│  - Amount vs      │
│    thresholds     │
└───────────────────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
ALLOWED   NEEDS AUTH
   │         │
   ▼         ▼
Instant   Escrowed
transfer  (pending)
             │
             ▼
      ┌─────────────┐
      │   Backend   │
      │  validates  │
      │  & signs    │
      └─────────────┘
             │
        ┌────┴────┐
        │         │
        ▼         ▼
    APPROVED   REJECTED
        │         │
        ▼         ▼
    Complete   Return to
    transfer    sender
```

## Transfer Behavior

| Scenario | Threshold | Result |
|----------|-----------|--------|
| GREEN → GREEN, low value | < 10,000 TST | Instant |
| GREEN → GREEN, high value | ≥ 10,000 TST | Escrow → backend approval |
| YELLOW wallet involved | < 1,000 TST | Instant |
| YELLOW wallet, higher value | ≥ 1,000 TST | Escrow → backend approval |
| RED wallet (sender or receiver) | Any | Blocked at contract |
| UNKNOWN wallet | Any | Blocked at contract |

## Quick Start

```bash
# Install dependencies
bun install

# Start backend (port 3000)
cd backend && bun run src/index.ts

# Start frontend (port 5173)
cd frontend && bun run dev

# Start admin dashboard (port 5174)
cd admin && bun run dev
```

## Run Demo Scenarios

```bash
cd backend && bun test/demo-scenarios.ts
```

This runs three scenarios:
1. **Instant transfer** - 500 TST between GREEN wallets
2. **Escrowed transfer** - 15,000 TST, backend completes in ~6s
3. **Blocked transfer** - to RED wallet, reverts immediately

## Deployed Contracts (XDC Apothem)

- **Oracle**: `0x24a1BA1CB110336e8cE7b5371ebC6F765bE567D0`
- **Token**: `0xf103aBe6039c49259Ee7c014a40603545476F6ef`

## Project Structure

```
├── contracts/          # Solidity contracts (Foundry)
│   ├── src/
│   │   ├── TrustSignalOracle.sol
│   │   └── TrustSignalToken.sol
│   └── test/
├── backend/            # Bun + Hono API server
│   ├── src/
│   │   ├── services/watcher.ts    # Event indexer + transfer processor
│   │   ├── lib/compliance.ts      # Compliance validation
│   │   └── routes/admin/          # Admin API routes
│   └── test/
├── frontend/           # React + RainbowKit wallet UI
└── admin/              # React admin dashboard
```

## Environment Variables

### Backend (`backend/.env`)
```
XDC_RPC_URL=https://rpc.apothem.network
CHAIN_ID=51
ORACLE_ADDRESS=0x24a1BA1CB110336e8cE7b5371ebC6F765bE567D0
TOKEN_ADDRESS=0xf103aBe6039c49259Ee7c014a40603545476F6ef
SIGNER_PRIVATE_KEY=<backend signer key>
ADMIN_API_KEY=<admin api key>
```

### Frontend (`frontend/.env`)
```
VITE_ORACLE_ADDRESS=0x24a1BA1CB110336e8cE7b5371ebC6F765bE567D0
VITE_TOKEN_ADDRESS=0xf103aBe6039c49259Ee7c014a40603545476F6ef
VITE_BACKEND_URL=http://localhost:3000
```

### Admin (`admin/.env`)
```
VITE_BACKEND_URL=http://localhost:3000
VITE_ADMIN_API_KEY=<same as backend ADMIN_API_KEY>
```

## Development

```bash
# Run contract tests
cd contracts && forge test

# Run backend tests
cd backend && bun test

# Type check
bun run typecheck
```
