// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-contracts/contracts/access/Ownable.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

interface IAggregatorV3WBTC {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

contract WBTC is ERC20, Ownable {
    IERC20 public immutable aUSDC;
    IAggregatorV3WBTC public immutable btcUsdFeed;
    uint256 public constant STALE_WINDOW = 2 hours;

    event MintedWithAUSDC(address indexed user, uint256 ausdcIn, uint256 wbtcOut, int256 oraclePrice);

    constructor(address ausdcAddress, address btcUsdFeedAddress) ERC20("Wrapped Bitcoin", "wBTC") {
        require(ausdcAddress != address(0), "wBTC: zero aUSDC");
        require(btcUsdFeedAddress != address(0), "wBTC: zero feed");
        aUSDC = IERC20(ausdcAddress);
        btcUsdFeed = IAggregatorV3WBTC(btcUsdFeedAddress);
    }

    function decimals() public pure override returns (uint8) {
        return 8;
    }

    function mintWithAUSDC(uint256 ausdcAmount) external returns (uint256 wbtcOut) {
        require(ausdcAmount > 0, "wBTC: zero amount");
        (, int256 answer,, uint256 updatedAt,) = btcUsdFeed.latestRoundData();
        require(block.timestamp - updatedAt < STALE_WINDOW, "wBTC: stale oracle");
        require(answer > 0, "wBTC: invalid oracle");

        uint8 feedDecimals = btcUsdFeed.decimals();
        uint256 price = uint256(answer);
        uint256 price1e18 = feedDecimals >= 18
            ? price / (10 ** (feedDecimals - 18))
            : price * (10 ** (18 - feedDecimals));
        require(price1e18 > 0, "wBTC: zero scaled price");

        // aUSDC has 6 decimals -> scale to 1e18 USD value.
        uint256 usdValue1e18 = ausdcAmount * 1e12;
        wbtcOut = (usdValue1e18 * (10 ** uint256(decimals()))) / price1e18;
        require(wbtcOut > 0, "wBTC: amount too small");

        require(aUSDC.transferFrom(msg.sender, address(this), ausdcAmount), "wBTC: transfer failed");
        _mint(msg.sender, wbtcOut);
        emit MintedWithAUSDC(msg.sender, ausdcAmount, wbtcOut, answer);
    }
}
