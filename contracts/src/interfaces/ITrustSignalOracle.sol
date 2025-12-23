// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITrustSignalOracle {
    enum RiskLevel {
        UNKNOWN,
        GREEN,
        YELLOW,
        RED
    }

    struct WalletStatus {
        RiskLevel riskLevel;
        uint40 validUntil;
        uint40 lastUpdated;
        bytes2 countryCode;
    }

    struct Authorization {
        address from;
        address to;
        uint256 amount;
        uint256 nonce;
        uint40 expiry;
        bytes signature;
    }

    function checkTransfer(
        address from,
        address to,
        uint256 amount
    ) external view returns (bool allowed, string memory reason);

    function checkTransferWithAuth(
        address from,
        address to,
        uint256 amount,
        Authorization calldata auth
    ) external returns (bool allowed, string memory reason);

    function setWalletStatus(
        address wallet,
        RiskLevel riskLevel,
        uint40 validUntil,
        bytes2 countryCode
    ) external;

    function setWalletStatusBatch(
        address[] calldata wallets,
        RiskLevel[] calldata riskLevels,
        uint40[] calldata validUntils,
        bytes2[] calldata countryCodes
    ) external;

    function walletStatus(address wallet) external view returns (WalletStatus memory);

    function authNonces(address wallet) external view returns (uint256);

    function authorizedSigners(address signer) external view returns (bool);

    function setAuthorizedSigner(address signer, bool authorized) external;
}
