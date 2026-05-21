// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Minimal {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract AUSDC {
    string public constant name = "Addax Wrapped USDC";
    string public constant symbol = "aUSDC";
    uint8 public constant decimals = 6;

    address public immutable owner;
    address public immutable underlyingUSDC;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Approval(address indexed src, address indexed guy, uint256 wad);
    event Transfer(address indexed src, address indexed dst, uint256 wad);
    event DepositUnderlying(address indexed dst, uint256 wad);
    event WithdrawUnderlying(address indexed src, uint256 wad);
    event OwnerMint(address indexed dst, uint256 wad);

    modifier onlyOwner() {
        require(msg.sender == owner, "aUSDC: not owner");
        _;
    }

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "aUSDC: invalid USDC");
        owner = msg.sender;
        underlyingUSDC = usdcAddress;
    }

    /// @notice Convert regular USDC to aUSDC 1:1.
    function depositUnderlying(uint256 wad) external {
        require(
            IERC20Minimal(underlyingUSDC).transferFrom(msg.sender, address(this), wad),
            "aUSDC: transfer failed"
        );
        _mint(msg.sender, wad);
        emit DepositUnderlying(msg.sender, wad);
    }

    /// @notice Burn aUSDC and withdraw regular USDC 1:1.
    function withdrawUnderlying(uint256 wad) external {
        require(
            IERC20Minimal(underlyingUSDC).balanceOf(address(this)) >= wad,
            "aUSDC: insufficient reserve"
        );
        _burn(msg.sender, wad);
        require(IERC20Minimal(underlyingUSDC).transfer(msg.sender, wad), "aUSDC: transfer failed");
        emit WithdrawUnderlying(msg.sender, wad);
    }

    /// @notice Owner-only mint for treasury/ops.
    function mint(address dst, uint256 wad) external onlyOwner {
        _mint(dst, wad);
        emit OwnerMint(dst, wad);
    }

    function reserve() external view returns (uint256) {
        return IERC20Minimal(underlyingUSDC).balanceOf(address(this));
    }

    function approve(address guy, uint256 wad) external returns (bool) {
        allowance[msg.sender][guy] = wad;
        emit Approval(msg.sender, guy, wad);
        return true;
    }

    function transfer(address dst, uint256 wad) external returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    function transferFrom(address src, address dst, uint256 wad) public returns (bool) {
        require(balanceOf[src] >= wad, "aUSDC: insufficient balance");
        if (src != msg.sender && allowance[src][msg.sender] != type(uint256).max) {
            require(allowance[src][msg.sender] >= wad, "aUSDC: insufficient allowance");
            allowance[src][msg.sender] -= wad;
        }
        balanceOf[src] -= wad;
        balanceOf[dst] += wad;
        emit Transfer(src, dst, wad);
        return true;
    }

    function _mint(address dst, uint256 wad) internal {
        balanceOf[dst] += wad;
        totalSupply += wad;
        emit Transfer(address(0), dst, wad);
    }

    function _burn(address src, uint256 wad) internal {
        require(balanceOf[src] >= wad, "aUSDC: insufficient balance");
        balanceOf[src] -= wad;
        totalSupply -= wad;
        emit Transfer(src, address(0), wad);
    }
}
