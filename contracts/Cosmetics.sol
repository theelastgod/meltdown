// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Cosmetics — ERC-1155 wear skins, trims, plates, stamps, themes, furnishings.
/// @notice Metadata carries the deterministic wear seed; no stats field exists. The minter role
///         (the studio, later the Forge) mints; the LedgerMarket is the only venue the game equips from.
contract Cosmetics {
    address public steward;
    mapping(address => bool) public minter;
    /// id => creator (paid the 1% royalty on every market sale)
    mapping(uint256 => address) public creatorOf;
    mapping(uint256 => uint32) public wearSeedOf;
    mapping(uint256 => mapping(address => uint256)) public balanceOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event Defined(uint256 indexed id, address indexed creator, uint32 wearSeed);

    error NotSteward();
    error NotMinter();
    error NotApproved();
    error Insufficient();

    constructor() {
        steward = msg.sender;
        minter[msg.sender] = true;
    }

    function setMinter(address m, bool on) external {
        if (msg.sender != steward) revert NotSteward();
        minter[m] = on;
    }

    /// @notice Defines an item (its creator and wear seed) and mints `amount` to `to`.
    function mint(address to, uint256 id, uint256 amount, address creator, uint32 wearSeed) external {
        if (!minter[msg.sender]) revert NotMinter();
        if (creatorOf[id] == address(0)) {
            creatorOf[id] = creator;
            wearSeedOf[id] = wearSeed;
            emit Defined(id, creator, wearSeed);
        }
        balanceOf[id][to] += amount;
        emit TransferSingle(msg.sender, address(0), to, id, amount);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) external {
        if (from != msg.sender && !isApprovedForAll[from][msg.sender]) revert NotApproved();
        if (balanceOf[id][from] < amount) revert Insufficient();
        balanceOf[id][from] -= amount;
        balanceOf[id][to] += amount;
        emit TransferSingle(msg.sender, from, to, id, amount);
    }

    function balanceOfBatch(address[] calldata owners, uint256[] calldata ids) external view returns (uint256[] memory out) {
        out = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) out[i] = balanceOf[ids[i]][owners[i]];
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0xd9b67a26 || id == 0x01ffc9a7;
    }
}
