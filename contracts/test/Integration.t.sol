// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../src/TrustSignalOracle.sol";
import "../src/TrustSignalToken.sol";

contract IntegrationTest is Test {
    using ECDSA for bytes32;

    TrustSignalOracle private oracle;
    TrustSignalToken private token;

    uint256 private signerKey;
    address private signer;
    address private sender;
    address private receiver;

    uint256 private greenThreshold = 1_000 ether;
    uint256 private yellowThreshold = 100 ether;
    uint40 private validityPeriod = 30 days;

    function setUp() public {
        signerKey = 0xA11CE;
        signer = vm.addr(signerKey);
        sender = address(0xA0);
        receiver = address(0xB0);

        oracle = new TrustSignalOracle(address(this), greenThreshold, yellowThreshold, validityPeriod);
        oracle.setAuthorizedSigner(signer, true);

        token = new TrustSignalToken("TrustSignal Token", "TST", address(oracle), 1_000_000 ether);
        token.transfer(sender, 20_000 ether);

        _setStatus(sender, ITrustSignalOracle.RiskLevel.GREEN, _future());
        _setStatus(receiver, ITrustSignalOracle.RiskLevel.GREEN, _future());
        token.setComplianceEnabled(true);
    }

    function test_FullFlow_GreenThenAuth() public {
        vm.prank(sender);
        token.transfer(receiver, 100 ether);
        assertEq(token.balanceOf(receiver), 100 ether);

        uint256 amount = greenThreshold + 1;

        vm.prank(sender);
        vm.expectRevert(bytes("AUTHORIZATION_REQUIRED"));
        token.transfer(receiver, amount);

        uint256 nonce = oracle.authNonces(sender);
        uint40 expiry = _future();
        bytes memory signature = _signAuthorization(sender, receiver, amount, nonce, expiry, signerKey);

        ITrustSignalOracle.Authorization memory auth = ITrustSignalOracle.Authorization({
            from: sender,
            to: receiver,
            amount: amount,
            nonce: nonce,
            expiry: expiry,
            signature: signature
        });

        vm.prank(sender);
        token.transferWithAuth(receiver, amount, auth);

        assertEq(token.balanceOf(receiver), 100 ether + amount);
    }

    function _setStatus(address wallet, ITrustSignalOracle.RiskLevel risk, uint40 validUntil) internal {
        vm.prank(signer);
        oracle.setWalletStatus(wallet, risk, validUntil, "US");
    }

    function _signAuthorization(
        address from,
        address to,
        uint256 amount,
        uint256 nonce,
        uint40 expiry,
        uint256 key
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(from, to, amount, nonce, expiry, block.chainid, address(oracle))
        );
        bytes32 messageHash = structHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, messageHash);
        return abi.encodePacked(r, s, v);
    }

    function _future() internal view returns (uint40) {
        return uint40(block.timestamp + validityPeriod);
    }
}
