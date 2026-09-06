// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Stewarded} from "./Stewarded.sol";

interface ICAPITALBurn {
    function burnFrom(address from, uint256 value) external;
}

/// @title SeasonBuyout — the Deep Wake pass.
/// @notice A season's cosmetic track, bought once, 100% burned. It is the economy's largest sink by
///         design (docs/TOKENOMICS.md §4.4), which is exactly why it must not sell anything that
///         touches a match: this contract records that a wallet holds a season, and nothing else.
///         What the pass unlocks is a list of cosmetics in `shared/economy/catalog.ts`, and
///         `npm run lint:economy` fails the build if any of them carries a mechanical block.
///
///         There is no track to grind and no reward tiers to chase inside it: the pass is bought,
///         not played toward, and holding one changes no number in the sim. That is the whole
///         difference between a season pass and paid progression.
contract SeasonBuyout is Stewarded {
    ICAPITALBurn public immutable capital;

    /// @notice Price of a season, in wei of $CAPITAL. Retuned quarterly against the burn target.
    uint256 public price;
    /// @notice Total burned through this sink, so the NET DELTA line can be read from the chain.
    uint256 public burned;

    mapping(uint256 => mapping(address => bool)) public holds;
    mapping(uint256 => uint256) public sold;

    event PriceChanged(uint256 from, uint256 to);
    event BoughtOut(address indexed wallet, uint256 indexed season, uint256 burnedAmount);

    error AlreadyHeld();
    error BadPrice();

    constructor(address steward_, address capital_, uint256 price_) Stewarded(steward_) {
        if (capital_ == address(0)) revert ZeroAddress();
        if (price_ == 0) revert BadPrice();
        capital = ICAPITALBurn(capital_);
        price = price_;
    }

    function setPrice(uint256 to) external onlySteward {
        if (to == 0) revert BadPrice();
        emit PriceChanged(price, to);
        price = to;
    }

    /// @notice Buy the season for the caller. One per wallet per season; the fee is burned, not held.
    /// @dev `expectedPrice` is the price the player agreed to. Without it a steward could raise the
    ///      price into a pending transaction and burn more than the player meant to spend.
    function buy(uint256 season, uint256 expectedPrice) external {
        if (holds[season][msg.sender]) revert AlreadyHeld();
        uint256 p = price;
        if (expectedPrice != p) revert BadPrice();
        // effects before the external call: the burn is the only interaction, and it is last
        holds[season][msg.sender] = true;
        sold[season] += 1;
        burned += p;
        capital.burnFrom(msg.sender, p);
        emit BoughtOut(msg.sender, season, p);
    }
}
