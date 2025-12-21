// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../src/TrustSignalOracle.sol";
import "../src/TrustSignalToken.sol";

contract TrustSignalTokenHarness is TrustSignalToken {
    constructor(
        string memory name_,
        string memory symbol_,
        address oracle_,
        uint256 initialSupply
    ) TrustSignalToken(name_, symbol_, oracle_, initialSupply) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

contract TrustSignalTokenTest is Test {
    using ECDSA for bytes32;

    TrustSignalOracle private oracle;
    TrustSignalTokenHarness private token;

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

        token = new TrustSignalTokenHarness("TrustSignal Token", "TST", address(oracle), 1_000_000 ether);
        token.transfer(sender, 10_000 ether);
    }

    function test_Transfer_AllowsGreenUnderThreshold() public {
        _setStatus(sender, ITrustSignalOracle.RiskLevel.GREEN, _future());
        _setStatus(receiver, ITrustSignalOracle.RiskLevel.GREEN, _future());
        token.setComplianceEnabled(true);

        vm.prank(sender);
        token.transfer(receiver, 50 ether);

        assertEq(token.balanceOf(receiver), 50 ether);
    }

    function test_Transfer_RevertsOnOracleDenial() public {
        _setStatus(sender, ITrustSignalOracle.RiskLevel.GREEN, _future());
        token.setComplianceEnabled(true);

        vm.prank(sender);
        vm.expectRevert(bytes("RECEIVER_NOT_VERIFIED"));
        token.transfer(receiver, 1 ether);
    }

    function test_TransferWithAuth_AllowsHighValue() public {
        _setStatus(sender, ITrustSignalOracle.RiskLevel.GREEN, _future());
        _setStatus(receiver, ITrustSignalOracle.RiskLevel.GREEN, _future());
        token.setComplianceEnabled(true);

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

        assertEq(token.balanceOf(receiver), amount);
    }

    function test_ComplianceToggle() public {
        _setStatus(sender, ITrustSignalOracle.RiskLevel.GREEN, _future());
        token.setComplianceEnabled(true);

        vm.prank(sender);
        vm.expectRevert(bytes("RECEIVER_NOT_VERIFIED"));
        token.transfer(receiver, 1 ether);

        token.setComplianceEnabled(false);

        vm.prank(sender);
        token.transfer(receiver, 1 ether);
        assertEq(token.balanceOf(receiver), 1 ether);
    }

    function test_MintBurn_SkipCompliance() public {
        token.setComplianceEnabled(true);

        token.mint(receiver, 5 ether);
        assertEq(token.balanceOf(receiver), 5 ether);

        token.burn(receiver, 2 ether);
        assertEq(token.balanceOf(receiver), 3 ether);
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
