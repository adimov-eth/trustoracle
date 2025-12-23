// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TrustSignalToken.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address oracle = vm.envAddress("ORACLE_ADDRESS");

        vm.startBroadcast(deployerKey);

        TrustSignalToken token = new TrustSignalToken(
            "TrustSignal Token",
            "TST",
            oracle,
            1_000_000 * 10 ** 18
        );

        vm.stopBroadcast();

        console2.log("Token:", address(token));
    }
}
