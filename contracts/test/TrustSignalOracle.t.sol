// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../src/TrustSignalOracle.sol";

contract TrustSignalOracleTest is Test {
    using ECDSA for bytes32;

    TrustSignalOracle private oracle;

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
    }

    function test_GreenUnderThreshold_Allows() public {
        _setStatus(sender, ITrustSignalOracle.RiskLevel.GREEN, _future());
        _setStatus(receiver, ITrustSignalOracle.RiskLevel.GREEN, _future());

        (bool allowed, string memory reason) = oracle.checkTransfer(sender, receiver, greenThreshold);
        assertTrue(allowed);
        assertEq(reason, "");
    }

    function test_GreenOverThreshold_RequiresAuth() public {
        _setStatus(sender, ITrustSignalOracle.RiskLevel.GREEN, _future());
        _setStatus(receiver, ITrustSignalOracle.RiskLevel.GREEN, _future());

        (bool allowed, string memory reason) = oracle.checkTransfer(sender, receiver, greenThreshold + 1);
        assertFalse(allowed);
        assertEq(reason, "AUTHORIZATION_REQUIRED");
    }

    function test_YellowUnderThreshold_Allows() public {
        _setStatus(sender, ITrustSignalOracle.RiskLevel.YELLOW, _future());
        _setStatus(receiver, ITrustSignalOracle.RiskLevel.GREEN, _future());

        (bool allowed, string memory reason) = oracle.checkTransfer(sender, receiver, yellowThreshold);
        assertTrue(allowed);
        assertEq(reason, "");
    }

    function test_RedBlocked() public {
        _setStatus(sender, ITrustSignalOracle.RiskLevel.RED, _future());
        _setStatus(receiver, ITrustSignalOracle.RiskLevel.GREEN, _future());

        (bool allowed, string memory reason) = oracle.checkTransfer(sender, receiver, 1 ether);
        assertFalse(allowed);
        assertEq(reason, "SENDER_BLOCKED");
    }

    function test_UnknownBlocked() public {
        (bool allowed, string memory reason) = oracle.checkTransfer(sender, receiver, 1 ether);
        assertFalse(allowed);
        assertEq(reason, "SENDER_NOT_VERIFIED");
    }

    function test_ExpiredStatus_RequiresAuth() public {
        _setStatus(sender, ITrustSignalOracle.RiskLevel.GREEN, _past());
        _setStatus(receiver, ITrustSignalOracle.RiskLevel.GREEN, _past());

        (bool allowed, string memory reason) = oracle.checkTransfer(sender, receiver, greenThreshold);
        assertFalse(allowed);
        assertEq(reason, "AUTHORIZATION_REQUIRED");
    }

    function test_ValidAuthorization() public {
        uint256 amount = greenThreshold + 1;
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

        (bool allowed, string memory reason) = oracle.checkTransferWithAuth(sender, receiver, amount, auth);
        assertTrue(allowed);
        assertEq(reason, "");
        assertEq(oracle.authNonces(sender), nonce + 1);
    }

    function test_ExpiredAuthorization_Reverts() public {
        uint256 amount = 1 ether;
        uint256 nonce = oracle.authNonces(sender);
        uint40 expiry = _past();

        bytes memory signature = _signAuthorization(sender, receiver, amount, nonce, expiry, signerKey);

        ITrustSignalOracle.Authorization memory auth = ITrustSignalOracle.Authorization({
            from: sender,
            to: receiver,
            amount: amount,
            nonce: nonce,
            expiry: expiry,
            signature: signature
        });

        vm.expectRevert(bytes("AUTH_EXPIRED"));
        oracle.checkTransferWithAuth(sender, receiver, amount, auth);
    }

    function test_WrongNonce_Reverts() public {
        uint256 amount = 1 ether;
        uint256 nonce = oracle.authNonces(sender) + 1;
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

        vm.expectRevert(bytes("AUTH_NONCE_INVALID"));
        oracle.checkTransferWithAuth(sender, receiver, amount, auth);
    }

    function test_InvalidSigner_Reverts() public {
        uint256 amount = 1 ether;
        uint256 nonce = oracle.authNonces(sender);
        uint40 expiry = _future();

        uint256 otherKey = 0xB0B;
        bytes memory signature = _signAuthorization(sender, receiver, amount, nonce, expiry, otherKey);

        ITrustSignalOracle.Authorization memory auth = ITrustSignalOracle.Authorization({
            from: sender,
            to: receiver,
            amount: amount,
            nonce: nonce,
            expiry: expiry,
            signature: signature
        });

        vm.expectRevert(bytes("AUTH_INVALID_SIGNER"));
        oracle.checkTransferWithAuth(sender, receiver, amount, auth);
    }

    function test_BatchStatusUpdate() public {
        address[] memory wallets = new address[](2);
        wallets[0] = sender;
        wallets[1] = receiver;

        ITrustSignalOracle.RiskLevel[] memory risks = new ITrustSignalOracle.RiskLevel[](2);
        risks[0] = ITrustSignalOracle.RiskLevel.GREEN;
        risks[1] = ITrustSignalOracle.RiskLevel.YELLOW;

        uint40[] memory validUntils = new uint40[](2);
        validUntils[0] = _future();
        validUntils[1] = _future();

        bytes2[] memory countries = new bytes2[](2);
        countries[0] = "US";
        countries[1] = "DE";

        vm.prank(signer);
        oracle.setWalletStatusBatch(wallets, risks, validUntils, countries);

        ITrustSignalOracle.WalletStatus memory senderStatus = oracle.walletStatus(sender);
        ITrustSignalOracle.WalletStatus memory receiverStatus = oracle.walletStatus(receiver);

        assertEq(uint8(senderStatus.riskLevel), uint8(ITrustSignalOracle.RiskLevel.GREEN));
        assertEq(uint8(receiverStatus.riskLevel), uint8(ITrustSignalOracle.RiskLevel.YELLOW));
    }

    function test_UnauthorizedSigner_Reverts() public {
        vm.expectRevert(bytes("SIGNER_NOT_AUTHORIZED"));
        oracle.setWalletStatus(sender, ITrustSignalOracle.RiskLevel.GREEN, _future(), "US");
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

    function _past() internal view returns (uint40) {
        if (block.timestamp == 0) {
            return 0;
        }
        return uint40(block.timestamp - 1);
    }
}
