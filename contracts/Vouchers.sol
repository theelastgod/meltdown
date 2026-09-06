// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EIP-712 voucher base for MELTDOWN's counter-ledger.
/// @notice Anything the game grants (a Ghostfile, a stamp, a name) is an EIP-712 message signed
///         by the game signer. Contracts verify the signer; claims are pull-based; nonces are
///         single-use per wallet so a voucher cannot be replayed.
abstract contract Vouchers {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    address public signer;
    address public steward;
    mapping(address => mapping(uint256 => bool)) public nonceUsed;

    event SignerChanged(address indexed signer);

    error NotSteward();
    error BadSigner();
    error Expired();
    error NonceUsed();

    constructor(address signer_) {
        signer = signer_;
        steward = msg.sender;
    }

    modifier onlySteward() {
        if (msg.sender != steward) revert NotSteward();
        _;
    }

    function setSigner(address s) external onlySteward {
        signer = s;
        emit SignerChanged(s);
    }

    function _domainName() internal pure virtual returns (string memory);

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(_domainName())), keccak256("1"), block.chainid, address(this)));
    }

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @dev Verifies the signer, the deadline and the wallet's nonce, then burns the nonce.
    function _consume(address wallet, uint256 nonce, uint256 deadline, bytes32 structHash, bytes calldata sig) internal {
        if (block.timestamp > deadline) revert Expired();
        if (nonceUsed[wallet][nonce]) revert NonceUsed();
        if (_recover(_digest(structHash), sig) != signer) revert BadSigner();
        nonceUsed[wallet][nonce] = true;
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
