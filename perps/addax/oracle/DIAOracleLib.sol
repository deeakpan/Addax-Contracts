// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./IDIAOracleV2.sol";

/// @dev Thin helpers around DIA `getValue` (ported from DIA integration docs for Solidity 0.6.x).
library DIAOracleLib {
    function getPrice(address oracle, string memory key)
        internal
        view
        returns (uint128 price, uint128 timestamp)
    {
        return IDIAOracleV2(oracle).getValue(key);
    }

    function getPriceIfNotOlderThan(
        address oracle,
        string memory key,
        uint128 maxTimePassed
    ) internal view returns (uint128 price, bool inTime) {
        uint128 updatedAt;
        (price, updatedAt) = IDIAOracleV2(oracle).getValue(key);
        inTime = block.timestamp <= uint256(updatedAt) + uint256(maxTimePassed);
    }
}
