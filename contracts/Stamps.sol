// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vouchers} from "./Vouchers.sol";

/// @title Stamps — attestation stamps as on-chain attestations.
/// @notice EAS-style: the game signs `{wallet, fileId, stampId}` the moment a stamp is earned;
///         anyone may submit it (gas sponsored by the relayer). Revocable only by the steward,
///         for anti-cheat reversal. Nothing here is readable by the sim.
contract Stamps is Vouchers {
    bytes32 public constant STAMP_TYPEHASH = keccak256("Stamp(address wallet,bytes32 fileId,bytes32 stampId,uint256 nonce,uint256 deadline)");

    /// wallet => stampId => block timestamp of the attestation (0 = none)
    mapping(address => mapping(bytes32 => uint64)) public attestedAt;
    mapping(address => uint256) public count;

    event Attested(address indexed wallet, bytes32 indexed stampId, bytes32 fileId);
    event Revoked(address indexed wallet, bytes32 indexed stampId);

    error AlreadyAttested();

    constructor(address signer_) Vouchers(signer_) {}

    function _domainName() internal pure override returns (string memory) {
        return "MELTDOWN Stamps";
    }

    function attest(address wallet, bytes32 fileId, bytes32 stampId, uint256 nonce, uint256 deadline, bytes calldata sig) external {
        if (attestedAt[wallet][stampId] != 0) revert AlreadyAttested();
        _consume(wallet, nonce, deadline, keccak256(abi.encode(STAMP_TYPEHASH, wallet, fileId, stampId, nonce, deadline)), sig);
        attestedAt[wallet][stampId] = uint64(block.timestamp);
        count[wallet] += 1;
        emit Attested(wallet, stampId, fileId);
    }

    function revoke(address wallet, bytes32 stampId) external onlySteward {
        if (attestedAt[wallet][stampId] == 0) return;
        attestedAt[wallet][stampId] = 0;
        count[wallet] -= 1;
        emit Revoked(wallet, stampId);
    }
}
