// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interfaces/ITrustSignalOracle.sol";

contract TrustSignalToken is ERC20, Ownable {
    ITrustSignalOracle public oracle;
    bool public complianceEnabled;
    bool private bypassCompliance;

    event OracleUpdated(address indexed oracle);
    event ComplianceEnabled(bool enabled);

    constructor(
        string memory name_,
        string memory symbol_,
        address oracle_,
        uint256 initialSupply
    ) ERC20(name_, symbol_) {
        require(oracle_ != address(0), "ORACLE_ZERO");
        oracle = ITrustSignalOracle(oracle_);
        _mint(msg.sender, initialSupply);
    }

    function setComplianceEnabled(bool enabled) external onlyOwner {
        complianceEnabled = enabled;
        emit ComplianceEnabled(enabled);
    }

    function setOracle(address oracle_) external onlyOwner {
        require(oracle_ != address(0), "ORACLE_ZERO");
        oracle = ITrustSignalOracle(oracle_);
        emit OracleUpdated(oracle_);
    }

    function transferWithAuth(
        address to,
        uint256 amount,
        ITrustSignalOracle.Authorization calldata auth
    ) external returns (bool) {
        (bool allowed, string memory reason) = oracle.checkTransferWithAuth(
            msg.sender,
            to,
            amount,
            auth
        );
        require(allowed, reason);

        bypassCompliance = true;
        _transfer(msg.sender, to, amount);
        bypassCompliance = false;
        return true;
    }

    function transferFromWithAuth(
        address from,
        address to,
        uint256 amount,
        ITrustSignalOracle.Authorization calldata auth
    ) external returns (bool) {
        (bool allowed, string memory reason) = oracle.checkTransferWithAuth(
            from,
            to,
            amount,
            auth
        );
        require(allowed, reason);

        _spendAllowance(from, msg.sender, amount);
        bypassCompliance = true;
        _transfer(from, to, amount);
        bypassCompliance = false;
        return true;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._beforeTokenTransfer(from, to, amount);

        if (from == address(0) || to == address(0)) {
            return;
        }
        if (!complianceEnabled) {
            return;
        }
        if (bypassCompliance) {
            return;
        }

        (bool allowed, string memory reason) = oracle.checkTransfer(from, to, amount);
        require(allowed, reason);
    }
}
