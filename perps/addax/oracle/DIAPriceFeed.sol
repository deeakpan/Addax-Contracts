// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "../../gmx-contracts/contracts/oracle/interfaces/IPriceFeed.sol";
import "./DIAOracleLib.sol";

/// @dev Chainlink-compatible adapter: GMX `VaultPriceFeed` can point `priceFeeds[token]` here.
contract DIAPriceFeed is IPriceFeed {
    address public diaOracle;
    string public key;
    uint256 public maxAge;
    address public gov;

    uint80 public roundId;
    string public override description = "DIAPriceFeed";

    constructor(address _diaOracle, string memory _key, uint256 _maxAge) public {
        gov = msg.sender;
        diaOracle = _diaOracle;
        key = _key;
        maxAge = _maxAge;
        roundId = 1;
    }

    function setGov(address _gov) external {
        require(msg.sender == gov, "DIAPriceFeed: forbidden");
        gov = _gov;
    }

    function aggregator() external view override returns (address) {
        return diaOracle;
    }

    function latestAnswer() public view override returns (int256) {
        (uint128 price, bool inTime) = DIAOracleLib.getPriceIfNotOlderThan(
            diaOracle,
            key,
            uint128(maxAge)
        );
        require(inTime, "DIAPriceFeed: stale");
        require(price > 0, "DIAPriceFeed: invalid price");
        return int256(uint256(price));
    }

    function latestRound() public view override returns (uint80) {
        return roundId;
    }

    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        int256 answer = latestAnswer();
        return (_roundId, answer, block.timestamp, block.timestamp, _roundId);
    }
}
