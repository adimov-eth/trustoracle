// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TrustSignalOracle.sol";
import "../src/TrustSignalToken.sol";

contract DeployAllScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address backendSigner = vm.envAddress("BACKEND_SIGNER");

        vm.startBroadcast(deployerKey);

        // 1. Deploy Oracle
        TrustSignalOracle oracle = new TrustSignalOracle(
            deployer,           // admin
            10_000 * 10 ** 18,  // greenThreshold
            1_000 * 10 ** 18,   // yellowThreshold
            30 days             // defaultValidityPeriod
        );
        console2.log("Oracle deployed:", address(oracle));

        // 2. Deploy Token
        TrustSignalToken token = new TrustSignalToken(
            "TrustSignal Token",
            "TST",
            address(oracle),
            1_000_000 * 10 ** 18
        );
        console2.log("Token deployed:", address(token));

        // 3. Register backend signer
        oracle.setAuthorizedSigner(backendSigner, true);
        console2.log("Backend signer authorized:", backendSigner);

        // 4. Set deployer as GREEN
        oracle.setWalletStatus(
            deployer,
            ITrustSignalOracle.RiskLevel.GREEN,
            uint40(block.timestamp + 365 days),
            bytes2("US")
        );
        console2.log("Deployer set to GREEN:", deployer);

        // 5. Enable compliance
        token.setComplianceEnabled(true);
        console2.log("Compliance enabled");

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== DEPLOYMENT COMPLETE ===");
        console2.log("ORACLE_ADDRESS=%s", address(oracle));
        console2.log("TOKEN_ADDRESS=%s", address(token));
    }
}
