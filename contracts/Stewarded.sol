// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Stewarded — the one privileged role, and the ability to hand it away.
/// @notice The sinks price themselves in $CAPITAL, and `docs/TOKENOMICS.md` §4.4 says the treasury
///         retunes those prices quarterly against the burn target. That needs an owner. It is kept
///         to exactly two powers — set the price, hand over the role — so an auditor can see the
///         whole blast radius of a compromised steward key in one file: it can make a sink cheaper
///         or dearer. It cannot mint, cannot move a player's tokens, and cannot take a pass away.
abstract contract Stewarded {
    address public steward;

    event StewardChanged(address indexed from, address indexed to);

    error NotSteward();
    error ZeroAddress();

    constructor(address steward_) {
        if (steward_ == address(0)) revert ZeroAddress();
        steward = steward_;
    }

    modifier onlySteward() {
        if (msg.sender != steward) revert NotSteward();
        _;
    }

    /// @notice Hand the role on — to a timelocked multisig after deployment (docs/SECURITY.md §3).
    function setSteward(address to) external onlySteward {
        if (to == address(0)) revert ZeroAddress();
        emit StewardChanged(steward, to);
        steward = to;
    }
}
