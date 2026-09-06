// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICAPITALMove {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title PrizeVault — the emission channels, as weekly Merkle roots.
/// @notice The game computes each epoch's prizes (Audit placements, Deep Wake season contributions),
///         funds the vault with the epoch's total and posts the root. Claims are pull-based and may be
///         submitted by anyone for the account in the leaf (the relayer sponsors the gas); the tokens go
///         to the account. Unclaimed prizes return to the treasury after 90 days.
contract PrizeVault {
    ICAPITALMove public immutable capital;
    address public immutable treasury;
    address public poster;

    struct Epoch {
        bytes32 root;
        uint256 total;
        uint256 claimed;
        uint64 postedAt;
    }

    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(address => bool)) public claimedBy;
    uint64 public constant RECLAIM_AFTER = 90 days;

    event Posted(uint256 indexed epoch, bytes32 root, uint256 total);
    event Claimed(uint256 indexed epoch, address indexed account, uint256 amount);
    event Reclaimed(uint256 indexed epoch, uint256 amount);

    error NotPoster();
    error EpochExists();
    error NoEpoch();
    error AlreadyClaimed();
    error BadProof();
    error TooEarly();
    error Overclaim();

    constructor(address capital_, address treasury_) {
        capital = ICAPITALMove(capital_);
        treasury = treasury_;
        poster = msg.sender;
    }

    function setPoster(address p) external {
        if (msg.sender != poster) revert NotPoster();
        poster = p;
    }

    /// @notice Post an epoch: the poster funds the vault with `total` and sets the root. One root per epoch.
    function post(uint256 epoch, bytes32 root, uint256 total) external {
        if (msg.sender != poster) revert NotPoster();
        if (epochs[epoch].root != bytes32(0)) revert EpochExists();
        capital.transferFrom(msg.sender, address(this), total);
        epochs[epoch] = Epoch(root, total, 0, uint64(block.timestamp));
        emit Posted(epoch, root, total);
    }

    /// @notice Leaf: keccak256(abi.encode(epoch, account, amount)); proof pairs are hashed in sorted order.
    function claim(uint256 epoch, address account, uint256 amount, bytes32[] calldata proof) external {
        Epoch storage e = epochs[epoch];
        if (e.root == bytes32(0)) revert NoEpoch();
        if (claimedBy[epoch][account]) revert AlreadyClaimed();
        bytes32 node = keccak256(abi.encode(epoch, account, amount));
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            node = node < p ? keccak256(abi.encodePacked(node, p)) : keccak256(abi.encodePacked(p, node));
        }
        if (node != e.root) revert BadProof();
        // An epoch is a ring-fenced pot: it may never pay out more than it was funded with, so a
        // bad root (an off-chain tree bug, a compromised poster) cannot reach another epoch's money.
        // This also closes a claim that arrives after `reclaim` swept the epoch.
        if (e.claimed + amount > e.total) revert Overclaim();
        claimedBy[epoch][account] = true;
        e.claimed += amount;
        capital.transfer(account, amount);
        emit Claimed(epoch, account, amount);
    }

    /// @notice After 90 days what was not claimed returns to the treasury. Idempotent: a second
    ///         call sweeps nothing, and claims after it revert with `Overclaim`.
    function reclaim(uint256 epoch) external {
        Epoch storage e = epochs[epoch];
        if (e.root == bytes32(0)) revert NoEpoch();
        if (block.timestamp < e.postedAt + RECLAIM_AFTER) revert TooEarly();
        uint256 left = e.total - e.claimed;
        e.claimed = e.total;
        capital.transfer(treasury, left);
        emit Reclaimed(epoch, left);
    }
}
