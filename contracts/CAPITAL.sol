// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title $CAPITAL — the counter-ledger token.
/// @notice Fixed supply minted once at genesis to the treasury. No admin mint, no owner. Burnable,
///         with EIP-2612 permit so a market buy or a name registration is one transaction, not two.
///         It touches identity, ownership, creation, hosting and competition — never a stat.
contract $CAPITAL {
    string public constant name = "$CAPITAL";
    string public constant symbol = "CAPITAL";
    uint8 public constant decimals = 18;
    uint256 public constant CAP = 1_000_000_000 ether;

    uint256 public totalSupply;
    uint256 public burned;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    /// EIP-2612: one permit nonce per owner
    mapping(address => uint256) public nonces;

    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant PERMIT_TYPEHASH = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();
    error PermitExpired();
    error BadPermit();

    constructor(address treasury) {
        if (treasury == address(0)) revert ZeroAddress();
        totalSupply = CAP;
        balanceOf[treasury] = CAP;
        emit Transfer(address(0), treasury, CAP);
    }

    /// @dev Computed per call rather than cached, so a chain fork cannot replay a permit.
    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256("1"), block.chainid, address(this)));
    }

    /// @notice EIP-2612: the owner signs an allowance instead of sending a transaction for it.
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        if (block.timestamp > deadline) revert PermitExpired();
        if (owner == address(0)) revert ZeroAddress();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))));
        // reject the malleable high-s half and the zero address ecrecover answers on bad input
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadPermit();
        address got = ecrecover(digest, v, r, s);
        if (got == address(0) || got != owner) revert BadPermit();
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        _spend(from, value);
        _move(from, to, value);
        return true;
    }

    function burn(uint256 value) external {
        _burn(msg.sender, value);
    }

    function burnFrom(address from, uint256 value) external {
        _spend(from, value);
        _burn(from, value);
    }

    function _spend(address from, uint256 value) private {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = a - value;
        }
    }

    function _move(address from, address to, uint256 value) private {
        // a transfer to the zero address would destroy supply without counting it as burned, and the
        // NET DELTA line the game prints is only honest if every burn goes through `_burn`
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < value) revert InsufficientBalance();
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _burn(address from, uint256 value) private {
        if (balanceOf[from] < value) revert InsufficientBalance();
        balanceOf[from] -= value;
        totalSupply -= value;
        burned += value;
        emit Transfer(from, address(0), value);
    }
}
