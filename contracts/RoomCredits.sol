// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Stewarded} from "./Stewarded.sol";

interface ICAPITALBurn {
    function burnFrom(address from, uint256 value) external;
}

/// @title RoomCredits — private rooms, paid for by the hour.
/// @notice A room-hour is a server the buyer controls: their own rules, their own invite list, no
///         matchmaking. It sells nothing that happens inside the match — the same weapons, the same
///         sim, the same Fairness Lint — so it is a sink that cannot become paid power however the
///         price moves. 100% burned.
///
///         Credits are held on chain rather than off, so a host that loses its database cannot lose
///         a player's hours, and `spend` is the host's own call: the buyer holds the credit, the
///         host burns it down when a room opens. A host key compromise can therefore waste a
///         player's hours and nothing else.
contract RoomCredits is Stewarded {
    ICAPITALBurn public immutable capital;

    /// @notice Price of one room-hour, in wei of $CAPITAL.
    uint256 public pricePerHour;
    uint256 public burned;
    /// @notice The address allowed to spend players' credits when a room opens: the game host.
    address public spender;

    mapping(address => uint256) public hoursOf;

    event PriceChanged(uint256 from, uint256 to);
    event SpenderChanged(address indexed from, address indexed to);
    event Bought(address indexed wallet, uint256 hoursBought, uint256 burnedAmount);
    event Spent(address indexed wallet, uint256 hoursSpent, bytes32 indexed room);

    error BadPrice();
    error BadAmount();
    error NotSpender();
    error NoCredit();

    constructor(address steward_, address capital_, uint256 pricePerHour_) Stewarded(steward_) {
        if (capital_ == address(0)) revert ZeroAddress();
        if (pricePerHour_ == 0) revert BadPrice();
        capital = ICAPITALBurn(capital_);
        pricePerHour = pricePerHour_;
        spender = steward_;
    }

    function setPrice(uint256 to) external onlySteward {
        if (to == 0) revert BadPrice();
        emit PriceChanged(pricePerHour, to);
        pricePerHour = to;
    }

    function setSpender(address to) external onlySteward {
        if (to == address(0)) revert ZeroAddress();
        emit SpenderChanged(spender, to);
        spender = to;
    }

    /// @notice Buy `hoursBought` room-hours for the caller, burning the fee.
    /// @dev `expectedPrice` is the per-hour price the player agreed to, for the same reason as the
    ///      season pass: a price change must not be able to front-run a pending purchase.
    function buy(uint256 hoursBought, uint256 expectedPrice) external {
        if (hoursBought == 0 || hoursBought > 1000) revert BadAmount();
        uint256 p = pricePerHour;
        if (expectedPrice != p) revert BadPrice();
        uint256 fee = p * hoursBought;
        hoursOf[msg.sender] += hoursBought;
        burned += fee;
        capital.burnFrom(msg.sender, fee);
        emit Bought(msg.sender, hoursBought, fee);
    }

    /// @notice The host draws an hour down when it opens a room. Reverts rather than going negative.
    function spend(address wallet, uint256 hoursSpent, bytes32 room) external {
        if (msg.sender != spender) revert NotSpender();
        if (hoursSpent == 0) revert BadAmount();
        uint256 have = hoursOf[wallet];
        if (have < hoursSpent) revert NoCredit();
        unchecked {
            hoursOf[wallet] = have - hoursSpent;
        }
        emit Spent(wallet, hoursSpent, room);
    }
}
