// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICAPITAL {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function burnFrom(address from, uint256 value) external;
}

interface ICosmetics {
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
    function creatorOf(uint256 id) external view returns (address);
}

/// @title LedgerMarket — player-to-player cosmetics, settled only in $CAPITAL.
/// @notice Every listing shows exactly what is sold. Fee 5% on every sale: 2% burned, 2% treasury,
///         1% to the item's original creator. The only venue the game recognises for equipping.
contract LedgerMarket {
    uint256 public constant FEE_BPS = 500;
    uint256 public constant BURN_BPS = 200;
    uint256 public constant TREASURY_BPS = 200;
    uint256 public constant CREATOR_BPS = 100;

    ICAPITAL public immutable capital;
    ICosmetics public immutable cosmetics;
    address public immutable treasury;

    struct Listing {
        address seller;
        uint256 id;
        uint256 amount;
        uint256 price; // $CAPITAL per unit
    }

    uint256 public nextListing = 1;
    mapping(uint256 => Listing) public listings;
    uint256 public volume;

    event Listed(uint256 indexed listing, address indexed seller, uint256 indexed id, uint256 amount, uint256 price);
    event Sold(uint256 indexed listing, address indexed buyer, uint256 indexed id, uint256 amount, uint256 paid, uint256 burned, uint256 toTreasury, uint256 toCreator);
    event Delisted(uint256 indexed listing);

    error NotSeller();
    error SoldOut();
    error ZeroPrice();

    constructor(address capital_, address cosmetics_, address treasury_) {
        capital = ICAPITAL(capital_);
        cosmetics = ICosmetics(cosmetics_);
        treasury = treasury_;
    }

    /// @notice The seller escrows the items here; the listing is exact: id, amount, unit price.
    function list(uint256 id, uint256 amount, uint256 price) external returns (uint256 l) {
        if (price == 0) revert ZeroPrice();
        cosmetics.safeTransferFrom(msg.sender, address(this), id, amount, "");
        l = nextListing++;
        listings[l] = Listing(msg.sender, id, amount, price);
        emit Listed(l, msg.sender, id, amount, price);
    }

    function delist(uint256 l) external {
        Listing memory L = listings[l];
        if (L.seller != msg.sender) revert NotSeller();
        delete listings[l];
        cosmetics.safeTransferFrom(address(this), msg.sender, L.id, L.amount, "");
        emit Delisted(l);
    }

    function buy(uint256 l, uint256 amount) external {
        Listing storage L = listings[l];
        if (L.amount < amount || amount == 0) revert SoldOut();
        uint256 paid = L.price * amount;
        uint256 burnAmt = (paid * BURN_BPS) / 10_000;
        uint256 treasuryAmt = (paid * TREASURY_BPS) / 10_000;
        uint256 creatorAmt = (paid * CREATOR_BPS) / 10_000;
        address creator = cosmetics.creatorOf(L.id);
        address seller = L.seller;
        uint256 id = L.id;
        // effects before interactions: the escrow is drawn down first, so a cosmetics or token
        // contract that ever gains a receiver callback cannot re-enter and buy the same units twice
        L.amount -= amount;
        volume += paid;
        capital.burnFrom(msg.sender, burnAmt);
        capital.transferFrom(msg.sender, treasury, treasuryAmt + (creator == address(0) ? creatorAmt : 0));
        if (creator != address(0)) capital.transferFrom(msg.sender, creator, creatorAmt);
        capital.transferFrom(msg.sender, seller, paid - burnAmt - treasuryAmt - creatorAmt);
        cosmetics.safeTransferFrom(address(this), msg.sender, id, amount, "");
        emit Sold(l, msg.sender, id, amount, paid, burnAmt, treasuryAmt, creatorAmt);
    }
}
