// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TrustSignalToken.sol";
import "../src/interfaces/ITrustSignalOracle.sol";

// Mock Oracle for testing
contract MockOracle is ITrustSignalOracle {
    mapping(address => WalletStatus) public statuses;
    mapping(address => bool) public override authorizedSigners;
    mapping(address => uint256) public override authNonces;

    uint256 public greenThreshold = 1000 ether;

    function setAuthorizedSigner(address signer, bool authorized) external {
        authorizedSigners[signer] = authorized;
    }

    function setWalletStatus(
        address wallet,
        RiskLevel riskLevel,
        uint40 validUntil,
        bytes2 countryCode
    ) external override {
        statuses[wallet] = WalletStatus({
            riskLevel: riskLevel,
            validUntil: validUntil,
            lastUpdated: uint40(block.timestamp),
            countryCode: countryCode
        });
    }

    function setWalletStatusBatch(
        address[] calldata,
        RiskLevel[] calldata,
        uint40[] calldata,
        bytes2[] calldata
    ) external override {}

    function walletStatus(address wallet) external view override returns (WalletStatus memory) {
        return statuses[wallet];
    }

    function checkTransfer(
        address from,
        address to,
        uint256 amount
    ) external view override returns (bool allowed, string memory reason) {
        WalletStatus memory fromStatus = statuses[from];
        WalletStatus memory toStatus = statuses[to];

        // Check for blocks
        if (fromStatus.riskLevel == RiskLevel.RED) {
            return (false, "SENDER_BLOCKED");
        }
        if (toStatus.riskLevel == RiskLevel.RED) {
            return (false, "RECIPIENT_BLOCKED");
        }

        // Green-to-green under threshold = instant
        if (fromStatus.riskLevel == RiskLevel.GREEN &&
            toStatus.riskLevel == RiskLevel.GREEN &&
            amount <= greenThreshold) {
            return (true, "");
        }

        // Everything else needs authorization
        return (false, "AUTHORIZATION_REQUIRED");
    }

    function checkTransferWithAuth(
        address,
        address,
        uint256,
        Authorization calldata
    ) external pure override returns (bool, string memory) {
        return (true, "");
    }
}

contract TokenTest is Test {
    TrustSignalToken public token;
    MockOracle public oracle;

    address public owner = address(1);
    address public alice = address(2);
    address public bob = address(3);
    address public backendSigner;
    uint256 public backendSignerKey;

    bytes32 constant COMPLETE_TRANSFER_TYPEHASH = keccak256(
        "CompleteTransfer(bytes32 transferId,address from,address to,uint256 amount,uint256 deadline)"
    );

    bytes32 constant REJECT_TRANSFER_TYPEHASH = keccak256(
        "RejectTransfer(bytes32 transferId,address from,address to,uint256 amount,string reason,uint256 deadline)"
    );

    function setUp() public {
        // Create backend signer
        backendSignerKey = 0xBEEF;
        backendSigner = vm.addr(backendSignerKey);

        vm.startPrank(owner);

        oracle = new MockOracle();
        token = new TrustSignalToken("TrustSignal Token", "TST", address(oracle), 1_000_000 ether);

        // Setup wallets as GREEN (including owner for initial distribution)
        oracle.setWalletStatus(owner, ITrustSignalOracle.RiskLevel.GREEN, uint40(block.timestamp + 365 days), "US");
        oracle.setWalletStatus(alice, ITrustSignalOracle.RiskLevel.GREEN, uint40(block.timestamp + 365 days), "US");
        oracle.setWalletStatus(bob, ITrustSignalOracle.RiskLevel.GREEN, uint40(block.timestamp + 365 days), "US");

        // Authorize backend signer
        oracle.setAuthorizedSigner(backendSigner, true);

        // Give alice some tokens (before compliance enabled, so no checks)
        token.transfer(alice, 100_000 ether);

        // Enable compliance after initial distribution
        token.setComplianceEnabled(true);

        vm.stopPrank();
    }

    function test_LowValueTransfer_Instant() public {
        vm.prank(alice);
        bool success = token.transfer(bob, 500 ether);

        assertTrue(success);
        assertEq(token.balanceOf(bob), 500 ether);
    }

    function test_HighValueTransfer_Escrows() public {
        uint256 amount = 50_000 ether;
        uint256 timestamp = block.timestamp;

        vm.prank(alice);
        bool success = token.transfer(bob, amount);

        // Transfer "succeeds" from user perspective
        assertTrue(success);

        // But tokens are in escrow, not with bob
        assertEq(token.balanceOf(bob), 0);
        assertEq(token.balanceOf(address(token)), amount);

        // Check pending transfer
        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);
        (address from, address to, uint256 amt, uint256 ts, TrustSignalToken.TransferStatus status) =
            token.getPendingTransfer(transferId);

        assertEq(from, alice);
        assertEq(to, bob);
        assertEq(amt, amount);
        assertEq(ts, timestamp);
        assertEq(uint256(status), uint256(TrustSignalToken.TransferStatus.PENDING));
    }

    function test_CompleteTransfer_WithSignature() public {
        uint256 amount = 50_000 ether;
        uint256 timestamp = block.timestamp;

        // Alice initiates high-value transfer
        vm.prank(alice);
        token.transfer(bob, amount);

        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);

        // Backend signs completion
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(
            COMPLETE_TRANSFER_TYPEHASH,
            transferId,
            alice,
            bob,
            amount,
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            token.DOMAIN_SEPARATOR(),
            structHash
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(backendSignerKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Complete the transfer
        token.completeTransfer(transferId, deadline, signature);

        // Now bob has the tokens
        assertEq(token.balanceOf(bob), amount);
        assertEq(token.balanceOf(address(token)), 0);

        // Status is completed
        (,,,, TrustSignalToken.TransferStatus status) = token.getPendingTransfer(transferId);
        assertEq(uint256(status), uint256(TrustSignalToken.TransferStatus.COMPLETED));
    }

    function test_CancelTransfer_BySender() public {
        uint256 amount = 50_000 ether;
        uint256 timestamp = block.timestamp;
        uint256 aliceBalanceBefore = token.balanceOf(alice);

        vm.prank(alice);
        token.transfer(bob, amount);

        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);

        // Alice cancels
        vm.prank(alice);
        token.cancelTransfer(transferId);

        // Alice got tokens back
        assertEq(token.balanceOf(alice), aliceBalanceBefore);
        assertEq(token.balanceOf(address(token)), 0);

        (,,,, TrustSignalToken.TransferStatus status) = token.getPendingTransfer(transferId);
        assertEq(uint256(status), uint256(TrustSignalToken.TransferStatus.CANCELLED));
    }

    function test_CancelTransfer_AfterExpiry_ByAnyone() public {
        uint256 amount = 50_000 ether;
        uint256 timestamp = block.timestamp;
        uint256 aliceBalanceBefore = token.balanceOf(alice);

        vm.prank(alice);
        token.transfer(bob, amount);

        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);

        // Fast forward past expiry
        vm.warp(block.timestamp + 25 hours);

        // Random person can cancel (returns to alice)
        vm.prank(address(999));
        token.cancelTransfer(transferId);

        assertEq(token.balanceOf(alice), aliceBalanceBefore);
    }

    function test_BlockedSender_Reverts() public {
        oracle.setWalletStatus(alice, ITrustSignalOracle.RiskLevel.RED, uint40(block.timestamp + 365 days), "US");

        vm.prank(alice);
        vm.expectRevert("SENDER_BLOCKED");
        token.transfer(bob, 100 ether);
    }

    function test_CompleteTransfer_InvalidSigner_Reverts() public {
        uint256 amount = 50_000 ether;
        uint256 timestamp = block.timestamp;

        vm.prank(alice);
        token.transfer(bob, amount);

        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);

        // Sign with unauthorized key
        uint256 badKey = 0xDEAD;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(
            COMPLETE_TRANSFER_TYPEHASH,
            transferId,
            alice,
            bob,
            amount,
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            token.DOMAIN_SEPARATOR(),
            structHash
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(badKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.expectRevert("INVALID_SIGNER");
        token.completeTransfer(transferId, deadline, signature);
    }

    function test_NativeTransfer_E2E() public {
        // Simulate what happens when user uses MetaMask's native "Send" button

        uint256 lowAmount = 500 ether;
        uint256 highAmount = 50_000 ether;

        // Low value - instant
        vm.prank(alice);
        token.transfer(bob, lowAmount);
        assertEq(token.balanceOf(bob), lowAmount);

        // High value - escrows, then backend completes
        uint256 timestamp = block.timestamp;
        vm.prank(alice);
        token.transfer(bob, highAmount);

        // Bob hasn't received yet
        assertEq(token.balanceOf(bob), lowAmount);

        // Backend sees TransferPending event, validates, signs, completes
        bytes32 transferId = token.computeTransferId(alice, bob, highAmount, timestamp);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(
            COMPLETE_TRANSFER_TYPEHASH,
            transferId,
            alice,
            bob,
            highAmount,
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            token.DOMAIN_SEPARATOR(),
            structHash
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(backendSignerKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        token.completeTransfer(transferId, deadline, signature);

        // Now bob has both amounts
        assertEq(token.balanceOf(bob), lowAmount + highAmount);
    }

    function test_RejectTransfer_ReturnsFunds() public {
        uint256 amount = 50_000 ether;
        uint256 timestamp = block.timestamp;
        uint256 aliceBalanceBefore = token.balanceOf(alice);

        vm.prank(alice);
        token.transfer(bob, amount);

        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);

        // Backend decides to reject (e.g., recipient failed deeper compliance check)
        string memory reason = "RECIPIENT_SANCTIONS_MATCH";
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(
            REJECT_TRANSFER_TYPEHASH,
            transferId,
            alice,
            bob,
            amount,
            keccak256(bytes(reason)),
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            token.DOMAIN_SEPARATOR(),
            structHash
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(backendSignerKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        token.rejectTransfer(transferId, reason, deadline, signature);

        // Alice got tokens back
        assertEq(token.balanceOf(alice), aliceBalanceBefore);
        assertEq(token.balanceOf(bob), 0);
        assertEq(token.balanceOf(address(token)), 0);

        // Status is rejected
        (,,,, TrustSignalToken.TransferStatus status) = token.getPendingTransfer(transferId);
        assertEq(uint256(status), uint256(TrustSignalToken.TransferStatus.REJECTED));
    }

    function test_CompleteAndReject_DifferentSignatures() public {
        // Ensure complete and reject signatures are NOT interchangeable
        uint256 amount = 50_000 ether;
        uint256 timestamp = block.timestamp;

        vm.prank(alice);
        token.transfer(bob, amount);

        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);

        // Sign for complete
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 completeStructHash = keccak256(abi.encode(
            COMPLETE_TRANSFER_TYPEHASH,
            transferId,
            alice,
            bob,
            amount,
            deadline
        ));
        bytes32 completeDigest = keccak256(abi.encodePacked(
            "\x19\x01",
            token.DOMAIN_SEPARATOR(),
            completeStructHash
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(backendSignerKey, completeDigest);
        bytes memory completeSignature = abi.encodePacked(r, s, v);

        // Try to use complete signature for reject - should fail
        string memory reason = "COMPLIANCE_FAILED";
        vm.expectRevert("INVALID_SIGNER");
        token.rejectTransfer(transferId, reason, deadline, completeSignature);

        // Complete should still work
        token.completeTransfer(transferId, deadline, completeSignature);
        assertEq(token.balanceOf(bob), amount);
    }

    // ============ Additional Edge Case Tests ============

    function test_CompleteTransfer_ExpiredSignature_Reverts() public {
        uint256 amount = 50_000 ether;
        uint256 timestamp = block.timestamp;

        vm.prank(alice);
        token.transfer(bob, amount);

        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);

        // Sign with already-expired deadline
        uint256 deadline = block.timestamp - 1;
        bytes32 structHash = keccak256(abi.encode(
            COMPLETE_TRANSFER_TYPEHASH,
            transferId,
            alice,
            bob,
            amount,
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            token.DOMAIN_SEPARATOR(),
            structHash
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(backendSignerKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.expectRevert("SIGNATURE_EXPIRED");
        token.completeTransfer(transferId, deadline, signature);
    }

    function test_CancelTransfer_BeforeExpiry_NotSender_Reverts() public {
        uint256 amount = 50_000 ether;
        uint256 timestamp = block.timestamp;

        vm.prank(alice);
        token.transfer(bob, amount);

        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);

        // Random person tries to cancel before expiry
        vm.prank(address(999));
        vm.expectRevert("NOT_SENDER");
        token.cancelTransfer(transferId);
    }

    function test_CompleteTransfer_AlreadyCompleted_Reverts() public {
        uint256 amount = 50_000 ether;
        uint256 timestamp = block.timestamp;

        vm.prank(alice);
        token.transfer(bob, amount);

        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);

        // Complete once
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(
            COMPLETE_TRANSFER_TYPEHASH,
            transferId,
            alice,
            bob,
            amount,
            deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            token.DOMAIN_SEPARATOR(),
            structHash
        ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(backendSignerKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        token.completeTransfer(transferId, deadline, signature);

        // Try to complete again
        vm.expectRevert("NOT_PENDING");
        token.completeTransfer(transferId, deadline, signature);
    }

    function test_BlockedRecipient_Reverts() public {
        oracle.setWalletStatus(bob, ITrustSignalOracle.RiskLevel.RED, uint40(block.timestamp + 365 days), "US");

        vm.prank(alice);
        vm.expectRevert("RECIPIENT_BLOCKED");
        token.transfer(bob, 100 ether);
    }

    function test_TransferFrom_Escrows() public {
        uint256 amount = 50_000 ether;

        // Alice approves owner to spend
        vm.prank(alice);
        token.approve(owner, amount);

        // Owner uses transferFrom (high value = escrow)
        uint256 timestamp = block.timestamp;
        vm.prank(owner);
        bool success = token.transferFrom(alice, bob, amount);

        assertTrue(success);
        assertEq(token.balanceOf(bob), 0); // Escrowed
        assertEq(token.balanceOf(address(token)), amount);

        // Check pending transfer
        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);
        (address from,,,,) = token.getPendingTransfer(transferId);
        assertEq(from, alice);
    }

    function test_ComplianceDisabled_AllTransfersInstant() public {
        vm.prank(owner);
        token.setComplianceEnabled(false);

        // Even high value transfers now instant
        uint256 amount = 50_000 ether;
        vm.prank(alice);
        token.transfer(bob, amount);

        assertEq(token.balanceOf(bob), amount);
        assertEq(token.balanceOf(address(token)), 0);
    }

    function test_TransferToSelf_Works() public {
        uint256 aliceBefore = token.balanceOf(alice);

        vm.prank(alice);
        token.transfer(alice, 100 ether);

        // Balance unchanged (minus gas)
        assertEq(token.balanceOf(alice), aliceBefore);
    }

    function test_TransferZeroAmount() public {
        vm.prank(alice);
        bool success = token.transfer(bob, 0);

        assertTrue(success);
        assertEq(token.balanceOf(bob), 0);
    }

    function test_DuplicateTransferId_Reverts() public {
        // Same from/to/amount/timestamp = same transferId
        uint256 amount = 50_000 ether;

        vm.prank(alice);
        token.transfer(bob, amount);

        // In same block (same timestamp), same transfer should revert
        vm.prank(alice);
        vm.expectRevert("TRANSFER_EXISTS");
        token.transfer(bob, amount);
    }

    function test_CancelTransfer_AlreadyCancelled_Reverts() public {
        uint256 amount = 50_000 ether;
        uint256 timestamp = block.timestamp;

        vm.prank(alice);
        token.transfer(bob, amount);

        bytes32 transferId = token.computeTransferId(alice, bob, amount, timestamp);

        // Cancel once
        vm.prank(alice);
        token.cancelTransfer(transferId);

        // Try cancel again
        vm.prank(alice);
        vm.expectRevert("NOT_PENDING");
        token.cancelTransfer(transferId);
    }

    function test_MultipleEscrowedTransfers() public {
        // Alice makes multiple high-value transfers
        uint256 amount1 = 50_000 ether;
        uint256 amount2 = 20_000 ether;

        vm.prank(alice);
        token.transfer(bob, amount1);

        vm.warp(block.timestamp + 1); // Different timestamp = different transferId

        vm.prank(alice);
        token.transfer(bob, amount2);

        // Both escrowed
        assertEq(token.balanceOf(address(token)), amount1 + amount2);
        assertEq(token.balanceOf(bob), 0);
    }

    function test_OnlyOwnerCanSetCompliance() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setComplianceEnabled(false);
    }

    function test_OnlyOwnerCanSetOracle() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setOracle(address(1));
    }

    function test_SetOracleZero_Reverts() public {
        vm.prank(owner);
        vm.expectRevert("ORACLE_ZERO");
        token.setOracle(address(0));
    }
}
