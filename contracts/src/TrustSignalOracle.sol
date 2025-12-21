// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./interfaces/ITrustSignalOracle.sol";

contract TrustSignalOracle is Ownable, ITrustSignalOracle {
    using ECDSA for bytes32;

    mapping(address => WalletStatus) private _walletStatus;
    mapping(address => uint256) public override authNonces;
    mapping(address => bool) public override authorizedSigners;

    uint256 public greenThreshold;
    uint256 public yellowThreshold;
    uint40 public defaultValidityPeriod;

    event WalletStatusUpdated(
        address indexed wallet,
        RiskLevel riskLevel,
        uint40 validUntil,
        bytes2 countryCode
    );
    event AuthorizedSignerUpdated(address indexed signer, bool authorized);
    event ThresholdsUpdated(uint256 greenThreshold, uint256 yellowThreshold);
    event DefaultValidityPeriodUpdated(uint40 period);

    modifier onlyAuthorizedSigner() {
        require(authorizedSigners[msg.sender], "SIGNER_NOT_AUTHORIZED");
        _;
    }

    constructor(
        address admin,
        uint256 greenThreshold_,
        uint256 yellowThreshold_,
        uint40 defaultValidityPeriod_
    ) {
        require(admin != address(0), "ADMIN_ZERO");
        _transferOwnership(admin);
        greenThreshold = greenThreshold_;
        yellowThreshold = yellowThreshold_;
        defaultValidityPeriod = defaultValidityPeriod_;
    }

    function setAuthorizedSigner(address signer, bool authorized) external onlyOwner {
        require(signer != address(0), "SIGNER_ZERO");
        authorizedSigners[signer] = authorized;
        emit AuthorizedSignerUpdated(signer, authorized);
    }

    function setThresholds(uint256 greenThreshold_, uint256 yellowThreshold_) external onlyOwner {
        greenThreshold = greenThreshold_;
        yellowThreshold = yellowThreshold_;
        emit ThresholdsUpdated(greenThreshold_, yellowThreshold_);
    }

    function setDefaultValidityPeriod(uint40 period) external onlyOwner {
        defaultValidityPeriod = period;
        emit DefaultValidityPeriodUpdated(period);
    }

    function checkTransfer(
        address from,
        address to,
        uint256 amount
    ) external view override returns (bool allowed, string memory reason) {
        WalletStatus memory senderStatus = _walletStatus[from];
        WalletStatus memory receiverStatus = _walletStatus[to];

        if (senderStatus.riskLevel == RiskLevel.RED) {
            return (false, "SENDER_BLOCKED");
        }
        if (receiverStatus.riskLevel == RiskLevel.RED) {
            return (false, "RECEIVER_BLOCKED");
        }

        if (senderStatus.riskLevel == RiskLevel.UNKNOWN) {
            return (false, "SENDER_NOT_VERIFIED");
        }
        if (receiverStatus.riskLevel == RiskLevel.UNKNOWN) {
            return (false, "RECEIVER_NOT_VERIFIED");
        }

        bool senderExpired = block.timestamp > senderStatus.validUntil;
        bool receiverExpired = block.timestamp > receiverStatus.validUntil;

        if (
            senderStatus.riskLevel == RiskLevel.GREEN &&
            receiverStatus.riskLevel == RiskLevel.GREEN &&
            amount <= greenThreshold &&
            !senderExpired &&
            !receiverExpired
        ) {
            return (true, "");
        }

        if (
            senderStatus.riskLevel == RiskLevel.YELLOW ||
            receiverStatus.riskLevel == RiskLevel.YELLOW
        ) {
            if (amount <= yellowThreshold && !senderExpired && !receiverExpired) {
                return (true, "");
            }
            return (false, "AUTHORIZATION_REQUIRED");
        }

        return (false, "AUTHORIZATION_REQUIRED");
    }

    function checkTransferWithAuth(
        address from,
        address to,
        uint256 amount,
        Authorization calldata auth
    ) external override returns (bool allowed, string memory reason) {
        require(auth.from == from, "AUTH_FROM_MISMATCH");
        require(auth.to == to, "AUTH_TO_MISMATCH");
        require(auth.amount >= amount, "AUTH_AMOUNT_INSUFFICIENT");
        require(auth.expiry > block.timestamp, "AUTH_EXPIRED");
        require(auth.nonce == authNonces[from], "AUTH_NONCE_INVALID");

        bytes32 structHash = keccak256(
            abi.encode(
                auth.from,
                auth.to,
                auth.amount,
                auth.nonce,
                auth.expiry,
                block.chainid,
                address(this)
            )
        );
        bytes32 messageHash = structHash.toEthSignedMessageHash();
        address signer = ECDSA.recover(messageHash, auth.signature);
        require(authorizedSigners[signer], "AUTH_INVALID_SIGNER");

        authNonces[from] += 1;

        return (true, "");
    }

    function setWalletStatus(
        address wallet,
        RiskLevel riskLevel,
        uint40 validUntil,
        bytes2 countryCode
    ) external override onlyAuthorizedSigner {
        _setWalletStatus(wallet, riskLevel, validUntil, countryCode);
    }

    function setWalletStatusBatch(
        address[] calldata wallets,
        RiskLevel[] calldata riskLevels,
        uint40[] calldata validUntils,
        bytes2[] calldata countryCodes
    ) external override onlyAuthorizedSigner {
        uint256 length = wallets.length;
        require(
            length == riskLevels.length &&
                length == validUntils.length &&
                length == countryCodes.length,
            "BATCH_LENGTH_MISMATCH"
        );

        for (uint256 i = 0; i < length; i++) {
            _setWalletStatus(wallets[i], riskLevels[i], validUntils[i], countryCodes[i]);
        }
    }

    function _setWalletStatus(
        address wallet,
        RiskLevel riskLevel,
        uint40 validUntil,
        bytes2 countryCode
    ) internal {
        require(wallet != address(0), "WALLET_ZERO");
        uint40 resolvedValidUntil = validUntil;
        if (resolvedValidUntil == 0 && defaultValidityPeriod > 0) {
            resolvedValidUntil = uint40(block.timestamp + defaultValidityPeriod);
        }

        _walletStatus[wallet] = WalletStatus({
            riskLevel: riskLevel,
            validUntil: resolvedValidUntil,
            lastUpdated: uint40(block.timestamp),
            countryCode: countryCode
        });

        emit WalletStatusUpdated(wallet, riskLevel, resolvedValidUntil, countryCode);
    }

    function walletStatus(address wallet) external view override returns (WalletStatus memory) {
        return _walletStatus[wallet];
    }
}
