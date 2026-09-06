// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vouchers} from "./Vouchers.sol";

/// @title Ghostfile — the soulbound record.
/// @notice One per wallet, minted at wallet link through a game-signed voucher with sponsored gas.
///         Transfers revert; the holder may burn it (a Rewrite keeps the stamps and the glyph's age
///         off-chain — the record on chain is the wallet's, not the file's).
contract Ghostfile is Vouchers {
    string public constant name = "Ghostfile";
    string public constant symbol = "GHOST";
    bytes32 public constant LINK_TYPEHASH = keccak256("Link(address wallet,bytes32 fileId,uint256 nonce,uint256 deadline)");

    uint256 public nextId = 1;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public tokenOf;
    mapping(uint256 => bytes32) public fileOf;
    /// fileId => the token that holds it: one wallet per file, enforced here and not only by the host
    mapping(bytes32 => uint256) public tokenOfFile;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Linked(address indexed wallet, uint256 indexed tokenId, bytes32 fileId);

    error Soulbound();
    error AlreadyLinked();
    error FileLinked();
    error NotHolder();

    constructor(address signer_) Vouchers(signer_) {}

    function _domainName() internal pure override returns (string memory) {
        return "MELTDOWN Ghostfile";
    }

    function balanceOf(address wallet) external view returns (uint256) {
        return tokenOf[wallet] == 0 ? 0 : 1;
    }

    /// @notice Anyone may submit the voucher (the game relayer sponsors the gas); the token goes to the wallet in it.
    function mint(address wallet, bytes32 fileId, uint256 nonce, uint256 deadline, bytes calldata sig) external returns (uint256 id) {
        if (tokenOf[wallet] != 0) revert AlreadyLinked();
        if (tokenOfFile[fileId] != 0) revert FileLinked();
        _consume(wallet, nonce, deadline, keccak256(abi.encode(LINK_TYPEHASH, wallet, fileId, nonce, deadline)), sig);
        id = nextId++;
        ownerOf[id] = wallet;
        tokenOf[wallet] = id;
        fileOf[id] = fileId;
        tokenOfFile[fileId] = id;
        emit Transfer(address(0), wallet, id);
        emit Linked(wallet, id, fileId);
    }

    function burn(uint256 id) external {
        if (ownerOf[id] != msg.sender) revert NotHolder();
        delete ownerOf[id];
        delete tokenOf[msg.sender];
        delete tokenOfFile[fileOf[id]];
        delete fileOf[id];
        emit Transfer(msg.sender, address(0), id);
    }

    // ---- soulbound: every transfer path reverts ----
    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert Soulbound();
    }

    function approve(address, uint256) external pure {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x80ac58cd || id == 0x01ffc9a7;
    }
}
