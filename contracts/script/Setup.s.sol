// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

import "../src/TrustSignalOracle.sol";
import "../src/TrustSignalToken.sol";

contract SetupScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address oracleAddress = vm.envAddress("ORACLE_ADDRESS");
        address tokenAddress = vm.envAddress("TOKEN_ADDRESS");
        address backendSigner = vm.envAddress("BACKEND_SIGNER_ADDRESS");

        TrustSignalOracle oracle = TrustSignalOracle(oracleAddress);
        TrustSignalToken token = TrustSignalToken(tokenAddress);

        vm.startBroadcast(deployerKey);

        oracle.setAuthorizedSigner(backendSigner, true);
        token.setComplianceEnabled(true);

        vm.stopBroadcast();
    }
}
