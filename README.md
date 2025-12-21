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

## Common Commands
- `forge test` - run Solidity tests.
- `forge script script/Deploy.s.sol --rpc-url $XDC_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast` - deploy contracts.
- `bun test` - run backend tests (from `backend/`).
- `bun run src/index.ts` - start the API server (from `backend/`).

See `plan.md` and `spec.md` for detailed architecture and implementation notes.
