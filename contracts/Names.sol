// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vouchers} from "./Vouchers.sol";

interface ICAPITALBurn {
    function burnFrom(address from, uint256 value) external;
}

/// @title Names — "the city learns your name".
/// @notice A soulbound handle written at Depth 50. The game signs the voucher (it checks the Depth);
///         the player pays the fee in $CAPITAL, 100% burned, priced by length like a name service.
///         Non-transferable, releasable by the holder, one per wallet.
contract Names is Vouchers {
    bytes32 public constant NAME_TYPEHASH = keccak256("Name(address wallet,string name,uint256 nonce,uint256 deadline)");
    ICAPITALBurn public immutable capital;

    mapping(bytes32 => address) public holderOf;
    mapping(address => string) public nameOf;

    event Registered(address indexed wallet, string name, uint256 burned);
    event Released(address indexed wallet, string name);

    error Taken();
    error HasName();
    error BadLength();
    error BadCharacter();

    constructor(address signer_, address capital_) Vouchers(signer_) {
        capital = ICAPITALBurn(capital_);
    }

    function _domainName() internal pure override returns (string memory) {
        return "MELTDOWN Names";
    }

    /// @notice 3 characters cost more than 12: 3 → 2000, 4 → 1000, 5 → 600, 6–7 → 400, 8–11 → 250, 12+ → 150 $CAPITAL.
    function priceOf(uint256 len) public pure returns (uint256) {
        if (len < 3 || len > 24) revert BadLength();
        if (len == 3) return 2000 ether;
        if (len == 4) return 1000 ether;
        if (len == 5) return 600 ether;
        if (len <= 7) return 400 ether;
        if (len <= 11) return 250 ether;
        return 150 ether;
    }

    /// @dev The price is per byte, so a multi-byte name would buy more characters than it paid for.
    ///      The game only ever signs A-Z 0-9 _ - ; this holds the same line without trusting it.
    function _requireAscii(bytes memory b) private pure {
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            bool ok = (c >= 0x41 && c <= 0x5A) || (c >= 0x30 && c <= 0x39) || c == 0x5F || c == 0x2D;
            if (!ok) revert BadCharacter();
        }
    }

    function register(string calldata name_, uint256 nonce, uint256 deadline, bytes calldata sig) external {
        _requireAscii(bytes(name_));
        bytes32 key = keccak256(bytes(name_));
        if (holderOf[key] != address(0)) revert Taken();
        if (bytes(nameOf[msg.sender]).length != 0) revert HasName();
        _consume(msg.sender, nonce, deadline, keccak256(abi.encode(NAME_TYPEHASH, msg.sender, key, nonce, deadline)), sig);
        uint256 fee = priceOf(bytes(name_).length);
        capital.burnFrom(msg.sender, fee);
        holderOf[key] = msg.sender;
        nameOf[msg.sender] = name_;
        emit Registered(msg.sender, name_, fee);
    }

    function release() external {
        string memory n = nameOf[msg.sender];
        if (bytes(n).length == 0) return;
        delete holderOf[keccak256(bytes(n))];
        delete nameOf[msg.sender];
        emit Released(msg.sender, n);
    }
}
