// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WAKE — the counter-ledger token.
/// @notice Fixed supply minted once at genesis to the treasury. No admin mint, no owner. Burnable.
///         It touches identity, ownership, creation, hosting and competition — never a stat.
contract WAKE {
    string public constant name = "Wake";
    string public constant symbol = "WAKE";
    uint8 public constant decimals = 18;
    uint256 public constant CAP = 1_000_000_000 ether;

    uint256 public totalSupply;
    uint256 public burned;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(address treasury) {
        totalSupply = CAP;
        balanceOf[treasury] = CAP;
        emit Transfer(address(0), treasury, CAP);
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
