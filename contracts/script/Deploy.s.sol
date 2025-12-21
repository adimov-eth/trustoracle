// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

import "../src/TrustSignalOracle.sol";
import "../src/TrustSignalToken.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        TrustSignalOracle oracle = new TrustSignalOracle(
            deployer,
            10_000 * 10 ** 18,
            1_000 * 10 ** 18,
            30 days
        );

        TrustSignalToken token = new TrustSignalToken(
            "TrustSignal Token",
            "TST",
            address(oracle),
            1_000_000 * 10 ** 18
        );

        vm.stopBroadcast();

        console2.log("Oracle:", address(oracle));
        console2.log("Token:", address(token));
    }
}
