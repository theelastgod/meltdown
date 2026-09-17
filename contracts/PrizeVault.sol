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

    /// @notice The schedule (Stage 59). An epoch id is `kind * KIND_SPAN + period`; each channel
    ///         (kind) carries a cap per schedule year, and `post` may not fund an epoch past the cap
    ///         for the year its period falls in. The year is counted from `launchDay` in days; a
    ///         channel with one cap holds it in every year. The poster cannot change a channel: only
    ///         the treasury can, so a leaked poster key funds at most a period's schedule per period.
    struct Channel {
        uint256 periodDays;
        uint256[] caps;
    }

    uint256 public constant KIND_SPAN = 1_000_000;
    uint256 public immutable launchDay;
    mapping(uint256 => Channel) private channels;

    event Posted(uint256 indexed epoch, bytes32 root, uint256 total);
    event Claimed(uint256 indexed epoch, address indexed account, uint256 amount);
    event Reclaimed(uint256 indexed epoch, uint256 amount);

    /// @notice Emission that was posted, never claimed, and swept back to the treasury.
    ///         Reading it off the event log means indexing; a counter means an operator can ask.
    ///         It is deliberately NOT re-emitted: see docs/ECONOMY.md §6.4.
    uint256 public reclaimed;

    error NotPoster();
    error EpochExists();
    error NoEpoch();
    error AlreadyClaimed();
    error BadProof();
    error TooEarly();
    error Overclaim();
    error NotTreasury();
    error NoChannel();
    error OverSchedule(uint256 cap);

    event ChannelSet(uint256 indexed kind, uint256 periodDays, uint256[] caps);

    constructor(address capital_, address treasury_, uint256 launchDay_, uint256[] memory kinds, uint256[] memory periodDays_, uint256[][] memory caps_) {
        capital = ICAPITALMove(capital_);
        treasury = treasury_;
        poster = msg.sender;
        launchDay = launchDay_;
        for (uint256 i = 0; i < kinds.length; i++) _setChannel(kinds[i], periodDays_[i], caps_[i]);
    }

    function setPoster(address p) external {
        if (msg.sender != poster) revert NotPoster();
        poster = p;
    }

    /// @notice The treasury (the steward, a multisig on a real network) retunes a channel; the poster never can.
    function setChannel(uint256 kind, uint256 periodDays_, uint256[] calldata caps_) external {
        if (msg.sender != treasury) revert NotTreasury();
        _setChannel(kind, periodDays_, caps_);
    }

    function _setChannel(uint256 kind, uint256 periodDays_, uint256[] memory caps_) internal {
        if (caps_.length == 0 || periodDays_ == 0) revert NoChannel();
        channels[kind] = Channel(periodDays_, caps_);
        emit ChannelSet(kind, periodDays_, caps_);
    }

    function channel(uint256 kind) external view returns (uint256 periodDays, uint256[] memory caps) {
        Channel storage c = channels[kind];
        return (c.periodDays, c.caps);
    }

    /// @notice The most an epoch may be funded with: its channel's cap for the schedule year its period falls in.
    function capOf(uint256 epoch) public view returns (uint256) {
        Channel storage c = channels[epoch / KIND_SPAN];
        if (c.caps.length == 0) revert NoChannel();
        uint256 day = (epoch % KIND_SPAN) * c.periodDays;
        uint256 year = day > launchDay ? (day - launchDay) / 365 : 0;
        if (year >= c.caps.length) year = c.caps.length - 1;
        return c.caps[year];
    }

    /// @notice Post an epoch: the poster funds the vault with `total` and sets the root. One root per epoch,
    ///         and never more than the schedule allows the epoch (checked before anything is drawn).
    function post(uint256 epoch, bytes32 root, uint256 total) external {
        if (msg.sender != poster) revert NotPoster();
        if (epochs[epoch].root != bytes32(0)) revert EpochExists();
        uint256 cap = capOf(epoch);
        if (total > cap) revert OverSchedule(cap);
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
        reclaimed += left;
        capital.transfer(treasury, left);
        emit Reclaimed(epoch, left);
    }
}
