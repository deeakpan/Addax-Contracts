// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-contracts/contracts/access/Ownable.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

interface IAggregatorV3WETH {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

contract WETH is ERC20, Ownable {
    IERC20 public immutable aUSDC;
    IAggregatorV3WETH public immutable ethUsdFeed;
    uint256 public constant STALE_WINDOW = 2 hours;

    event MintedWithAUSDC(address indexed user, uint256 ausdcIn, uint256 wethOut, int256 oraclePrice);

    constructor(address ausdcAddress, address ethUsdFeedAddress) ERC20("Wrapped Ether", "wETH") {
        require(ausdcAddress != address(0), "wETH: zero aUSDC");
        require(ethUsdFeedAddress != address(0), "wETH: zero feed");
        aUSDC = IERC20(ausdcAddress);
        ethUsdFeed = IAggregatorV3WETH(ethUsdFeedAddress);
    }

    function mintWithAUSDC(uint256 ausdcAmount) external returns (uint256 wethOut) {
        require(ausdcAmount > 0, "wETH: zero amount");
        (, int256 answer,, uint256 updatedAt,) = ethUsdFeed.latestRoundData();
        require(block.timestamp - updatedAt < STALE_WINDOW, "wETH: stale oracle");
        require(answer > 0, "wETH: invalid oracle");

        uint8 feedDecimals = ethUsdFeed.decimals();
        uint256 price = uint256(answer);
        uint256 price1e18 = feedDecimals >= 18
            ? price / (10 ** (feedDecimals - 18))
            : price * (10 ** (18 - feedDecimals));
        require(price1e18 > 0, "wETH: zero scaled price");

        // aUSDC has 6 decimals -> scale to 1e18 USD value.
        uint256 usdValue1e18 = ausdcAmount * 1e12;
        wethOut = (usdValue1e18 * 1e18) / price1e18;
        require(wethOut > 0, "wETH: amount too small");

        require(aUSDC.transferFrom(msg.sender, address(this), ausdcAmount), "wETH: transfer failed");
        _mint(msg.sender, wethOut);
        emit MintedWithAUSDC(msg.sender, ausdcAmount, wethOut, answer);
    }
}
