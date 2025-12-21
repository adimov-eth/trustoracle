import "dotenv/config";
import { $ } from "bun";

const rpcUrl = process.env.XDC_RPC_URL;
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

if (!rpcUrl || !deployerKey) {
  console.error("Missing XDC_RPC_URL or DEPLOYER_PRIVATE_KEY in .env");
  process.exit(1);
}

await $`forge script script/Deploy.s.sol --rpc-url ${rpcUrl} --private-key ${deployerKey} --broadcast`.cwd(
  "contracts"
);
