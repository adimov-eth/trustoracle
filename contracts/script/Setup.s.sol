// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TrustSignalToken.sol";
import "../src/interfaces/ITrustSignalOracle.sol";

contract SetupScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        address token = vm.envAddress("TOKEN_ADDRESS");
        address backendSigner = vm.envAddress("BACKEND_SIGNER");
        address testRecipient = vm.envAddress("TEST_RECIPIENT");

        vm.startBroadcast(deployerKey);

        // 1. Register backend signer with oracle
        ITrustSignalOracle(oracle).setAuthorizedSigner(backendSigner, true);
        console2.log("Backend signer authorized:", backendSigner);

        // 2. Set deployer as GREEN
        ITrustSignalOracle(oracle).setWalletStatus(
            deployer,
            ITrustSignalOracle.RiskLevel.GREEN,
            uint40(block.timestamp + 365 days),
            bytes2("US")
        );
        console2.log("Deployer set to GREEN:", deployer);

        // 3. Set test recipient as GREEN
        ITrustSignalOracle(oracle).setWalletStatus(
            testRecipient,
            ITrustSignalOracle.RiskLevel.GREEN,
            uint40(block.timestamp + 365 days),
            bytes2("US")
        );
        console2.log("Test recipient set to GREEN:", testRecipient);

        // 4. Enable compliance on Token
        TrustSignalToken(token).setComplianceEnabled(true);
        console2.log("Compliance enabled on Token");

        vm.stopBroadcast();
    }
}
