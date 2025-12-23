// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./interfaces/ITrustSignalOracle.sol";

/**
 * @title TrustSignalToken
 * @notice ERC20 token with escrow-based compliance. Native wallet transfers work seamlessly -
 *         low-risk transfers complete instantly, high-risk transfers are escrowed until
 *         the compliance backend approves and completes them.
 */
contract TrustSignalToken is ERC20, EIP712, Ownable {
    using ECDSA for bytes32;

    ITrustSignalOracle public oracle;
    bool public complianceEnabled;

    // ============ Pending Transfer State ============

    enum TransferStatus { NONE, PENDING, COMPLETED, CANCELLED, REJECTED }

    struct PendingTransfer {
        address from;
        address to;
        uint256 amount;
        uint48 timestamp;
        TransferStatus status;
    }

    mapping(bytes32 => PendingTransfer) public pendingTransfers;

    // Transfer expiry - after this, sender can reclaim
    uint256 public constant TRANSFER_EXPIRY = 24 hours;

    // ============ EIP-712 ============

    bytes32 public constant COMPLETE_TRANSFER_TYPEHASH = keccak256(
        "CompleteTransfer(bytes32 transferId,address from,address to,uint256 amount,uint256 deadline)"
    );

    bytes32 public constant REJECT_TRANSFER_TYPEHASH = keccak256(
        "RejectTransfer(bytes32 transferId,address from,address to,uint256 amount,string reason,uint256 deadline)"
    );

    // ============ Events ============

    event OracleUpdated(address indexed oracle);
    event ComplianceEnabled(bool enabled);
    event TransferPending(
        bytes32 indexed transferId,
        address indexed from,
        address indexed to,
        uint256 amount
    );
    event TransferCompleted(bytes32 indexed transferId);
    event TransferCancelled(bytes32 indexed transferId);
    event TransferRejected(bytes32 indexed transferId, string reason);

    // ============ Constructor ============

    constructor(
        string memory name_,
        string memory symbol_,
        address oracle_,
        uint256 initialSupply
    ) ERC20(name_, symbol_) EIP712(name_, "1") {
        require(oracle_ != address(0), "ORACLE_ZERO");
        oracle = ITrustSignalOracle(oracle_);
        _mint(msg.sender, initialSupply);
    }

    // ============ Admin Functions ============

    function setComplianceEnabled(bool enabled) external onlyOwner {
        complianceEnabled = enabled;
        emit ComplianceEnabled(enabled);
    }

    function setOracle(address oracle_) external onlyOwner {
        require(oracle_ != address(0), "ORACLE_ZERO");
        oracle = ITrustSignalOracle(oracle_);
        emit OracleUpdated(oracle_);
    }

    // ============ Transfer Override ============

    /**
     * @notice Standard ERC20 transfer - works with any wallet's native send.
     *         If authorization is required, tokens are escrowed instead of reverting.
     */
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (!complianceEnabled) {
            return super.transfer(to, amount);
        }

        // Check if transfer can proceed directly
        (bool allowed, string memory reason) = oracle.checkTransfer(msg.sender, to, amount);

        if (allowed) {
            return super.transfer(to, amount);
        }

        // If reason is AUTHORIZATION_REQUIRED, escrow it
        if (_isAuthorizationRequired(reason)) {
            return _escrowTransfer(msg.sender, to, amount);
        }

        // Otherwise it's a hard block (SENDER_BLOCKED, RECIPIENT_BLOCKED, etc.)
        revert(reason);
    }

    /**
     * @notice Standard ERC20 transferFrom - same escrow logic applies
     */
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (!complianceEnabled) {
            return super.transferFrom(from, to, amount);
        }

        (bool allowed, string memory reason) = oracle.checkTransfer(from, to, amount);

        if (allowed) {
            return super.transferFrom(from, to, amount);
        }

        if (_isAuthorizationRequired(reason)) {
            _spendAllowance(from, msg.sender, amount);
            return _escrowTransfer(from, to, amount);
        }

        revert(reason);
    }

    // ============ Escrow Functions ============

    /**
     * @dev Move tokens to contract escrow and create pending transfer
     */
    function _escrowTransfer(address from, address to, uint256 amount) internal returns (bool) {
        bytes32 transferId = _computeTransferId(from, to, amount, block.timestamp);

        require(pendingTransfers[transferId].status == TransferStatus.NONE, "TRANSFER_EXISTS");

        // Move tokens to escrow (this contract)
        _transfer(from, address(this), amount);

        pendingTransfers[transferId] = PendingTransfer({
            from: from,
            to: to,
            amount: amount,
            timestamp: uint48(block.timestamp),
            status: TransferStatus.PENDING
        });

        emit TransferPending(transferId, from, to, amount);

        // Return true - from user's perspective, transfer succeeded
        return true;
    }

    /**
     * @notice Complete a pending transfer with backend authorization (EIP-712 signature)
     * @param transferId The pending transfer ID
     * @param deadline Signature expiry timestamp
     * @param signature EIP-712 signature from authorized signer
     */
    function completeTransfer(
        bytes32 transferId,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(block.timestamp <= deadline, "SIGNATURE_EXPIRED");

        PendingTransfer storage pt = pendingTransfers[transferId];
        require(pt.status == TransferStatus.PENDING, "NOT_PENDING");

        // Verify EIP-712 signature from authorized signer
        bytes32 structHash = keccak256(abi.encode(
            COMPLETE_TRANSFER_TYPEHASH,
            transferId,
            pt.from,
            pt.to,
            pt.amount,
            deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        require(oracle.authorizedSigners(signer), "INVALID_SIGNER");

        // Complete the transfer
        pt.status = TransferStatus.COMPLETED;
        _transfer(address(this), pt.to, pt.amount);

        emit TransferCompleted(transferId);
    }

    /**
     * @notice Reject a pending transfer (compliance denied)
     * @param transferId The pending transfer ID
     * @param reason Rejection reason
     * @param deadline Signature expiry timestamp
     * @param signature EIP-712 signature from authorized signer
     */
    function rejectTransfer(
        bytes32 transferId,
        string calldata reason,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(block.timestamp <= deadline, "SIGNATURE_EXPIRED");

        PendingTransfer storage pt = pendingTransfers[transferId];
        require(pt.status == TransferStatus.PENDING, "NOT_PENDING");

        // Rejection has its own typehash (includes reason)
        bytes32 structHash = keccak256(abi.encode(
            REJECT_TRANSFER_TYPEHASH,
            transferId,
            pt.from,
            pt.to,
            pt.amount,
            keccak256(bytes(reason)),
            deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        require(oracle.authorizedSigners(signer), "INVALID_SIGNER");

        // Return tokens to sender
        pt.status = TransferStatus.REJECTED;
        _transfer(address(this), pt.from, pt.amount);

        emit TransferRejected(transferId, reason);
    }

    /**
     * @notice Cancel a pending transfer (sender can cancel, or anyone after expiry)
     * @param transferId The pending transfer ID
     */
    function cancelTransfer(bytes32 transferId) external {
        PendingTransfer storage pt = pendingTransfers[transferId];
        require(pt.status == TransferStatus.PENDING, "NOT_PENDING");

        // Only sender can cancel before expiry
        if (block.timestamp <= pt.timestamp + TRANSFER_EXPIRY) {
            require(msg.sender == pt.from, "NOT_SENDER");
        }
        // After expiry, anyone can cancel (returns to sender)

        pt.status = TransferStatus.CANCELLED;
        _transfer(address(this), pt.from, pt.amount);

        emit TransferCancelled(transferId);
    }

    // ============ View Functions ============

    /**
     * @notice Get pending transfer details
     */
    function getPendingTransfer(bytes32 transferId) external view returns (
        address from,
        address to,
        uint256 amount,
        uint256 timestamp,
        TransferStatus status
    ) {
        PendingTransfer storage pt = pendingTransfers[transferId];
        return (pt.from, pt.to, pt.amount, pt.timestamp, pt.status);
    }

    /**
     * @notice Compute transfer ID (for frontend)
     */
    function computeTransferId(
        address from,
        address to,
        uint256 amount,
        uint256 timestamp
    ) external pure returns (bytes32) {
        return _computeTransferId(from, to, amount, timestamp);
    }

    /**
     * @notice Get EIP-712 domain separator
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ============ Internal Functions ============

    function _computeTransferId(
        address from,
        address to,
        uint256 amount,
        uint256 timestamp
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(from, to, amount, timestamp));
    }

    function _isAuthorizationRequired(string memory reason) internal pure returns (bool) {
        return keccak256(bytes(reason)) == keccak256(bytes("AUTHORIZATION_REQUIRED"));
    }
}
