import "dotenv/config";
import { $ } from "bun";

const rpcUrl = process.env.XDC_RPC_URL;
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const oracleAddress = process.env.ORACLE_ADDRESS;
const tokenAddress = process.env.TOKEN_ADDRESS;
const backendSigner = process.env.BACKEND_SIGNER_ADDRESS;

if (!rpcUrl || !deployerKey || !oracleAddress || !tokenAddress || !backendSigner) {
  console.error(
    "Missing XDC_RPC_URL, DEPLOYER_PRIVATE_KEY, ORACLE_ADDRESS, TOKEN_ADDRESS, or BACKEND_SIGNER_ADDRESS in .env"
  );
  process.exit(1);
}

await $`forge script script/Setup.s.sol --rpc-url ${rpcUrl} --private-key ${deployerKey} --broadcast`.cwd(
  "contracts"
);
