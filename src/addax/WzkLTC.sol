// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Minimal {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract WzkLTC {
    string public constant name     = "Addax Wrapped zkLTC";
    string public constant symbol   = "wzkLTC";
    uint8  public constant decimals = 18;

    // Original wzkLTC — accepted 1:1 as an alternative deposit path
    address public constant LEGACY_WZKLTC = 0x60A84eBC3483fEFB251B76Aea5B8458026Ef4bea;

    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Approval(address indexed src, address indexed guy, uint256 wad);
    event Transfer(address indexed src, address indexed dst, uint256 wad);
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);
    event DepositWrapped(address indexed dst, uint256 wad);
    event WithdrawalWrapped(address indexed src, uint256 wad);

    constructor(uint256 bootstrapMint) {
        // Bootstrap liquidity minted to deployer, no native backing
        if (bootstrapMint > 0) {
            _mint(msg.sender, bootstrapMint);
        }
    }

    // ── Native wrap ──────────────────────────────────────────────────────────

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /// @dev Redeemable up to the native balance held by this contract.
    function withdraw(uint256 wad) external {
        require(address(this).balance >= wad, "WzkLTC: insufficient native reserve");
        _burn(msg.sender, wad);
        payable(msg.sender).transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }

    // ── Legacy wzkLTC wrap (1:1) ─────────────────────────────────────────────

    /// @notice Deposit legacy wzkLTC and receive this token 1:1.
    ///         Caller must approve this contract on the legacy token first.
    function depositWrapped(uint256 wad) external {
        require(
            IERC20Minimal(LEGACY_WZKLTC).transferFrom(msg.sender, address(this), wad),
            "WzkLTC: legacy transfer failed"
        );
        _mint(msg.sender, wad);
        emit DepositWrapped(msg.sender, wad);
    }

    /// @notice Burn this token and receive legacy wzkLTC 1:1.
    function withdrawWrapped(uint256 wad) external {
        require(
            IERC20Minimal(LEGACY_WZKLTC).balanceOf(address(this)) >= wad,
            "WzkLTC: insufficient legacy reserve"
        );
        _burn(msg.sender, wad);
        require(
            IERC20Minimal(LEGACY_WZKLTC).transfer(msg.sender, wad),
            "WzkLTC: legacy transfer failed"
        );
        emit WithdrawalWrapped(msg.sender, wad);
    }

    /// @notice How much legacy wzkLTC this contract holds (backs withdrawWrapped).
    function legacyReserve() external view returns (uint256) {
        return IERC20Minimal(LEGACY_WZKLTC).balanceOf(address(this));
    }

    // ── ERC-20 ───────────────────────────────────────────────────────────────

    function approve(address guy, uint256 wad) external returns (bool) {
        allowance[msg.sender][guy] = wad;
        emit Approval(msg.sender, guy, wad);
        return true;
    }

    function transfer(address dst, uint256 wad) external returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    function transferFrom(address src, address dst, uint256 wad) public returns (bool) {
        require(balanceOf[src] >= wad, "WzkLTC: insufficient balance");
        if (src != msg.sender && allowance[src][msg.sender] != type(uint256).max) {
            require(allowance[src][msg.sender] >= wad, "WzkLTC: insufficient allowance");
            allowance[src][msg.sender] -= wad;
        }
        balanceOf[src] -= wad;
        balanceOf[dst] += wad;
        emit Transfer(src, dst, wad);
        return true;
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _mint(address dst, uint256 wad) internal {
        balanceOf[dst] += wad;
        totalSupply     += wad;
        emit Transfer(address(0), dst, wad);
    }

    function _burn(address src, uint256 wad) internal {
        require(balanceOf[src] >= wad, "WzkLTC: insufficient balance");
        balanceOf[src] -= wad;
        totalSupply     -= wad;
        emit Transfer(src, address(0), wad);
    }
}
