# TrustSignal Oracle PoC

Regulatory-compliant ERC-20 on XDC that enforces transfer restrictions via an oracle and signed authorizations.

## Prerequisites
- Foundry (`forge`, `cast`)
- Bun (runtime + package manager)

## Setup
1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
2. Install contract dependencies:
   ```bash
   forge install foundry-rs/forge-std
   forge install OpenZeppelin/openzeppelin-contracts@v4.9.5
   ```
3. Install backend dependencies:
   ```bash
   cd backend && bun install
   ```
4. Install frontend dependencies:
   ```bash
   cd frontend && bun install
   ```
5. Configure frontend env:
   ```bash
   cp frontend/.env.example frontend/.env
   ```
6. Install admin dashboard dependencies:
   ```bash
   cd admin && bun install
   ```
7. Configure admin env:
   ```bash
   cp admin/.env.example admin/.env
   ```
   Set `ADMIN_API_KEY` in the backend `.env` and `VITE_ADMIN_API_KEY` in `admin/.env` to the same value.
   For faster indexing, set `INDEXER_START_BLOCK` in the backend `.env` to a recent block on XDC Apothem.

## Common Commands
- `forge test` - run Solidity tests.
- `forge script script/Deploy.s.sol --rpc-url $XDC_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast` - deploy contracts.
- `bun test` - run backend tests (from `backend/`).
- `bun run src/index.ts` - start the API server (from `backend/`).
- `bun run dev` - start the frontend (from `frontend/`).
- `bun run dev` - start the admin dashboard (from `admin/`).

See `plan.md` and `spec.md` for detailed architecture and implementation notes.
