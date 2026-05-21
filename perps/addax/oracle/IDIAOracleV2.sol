// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/// @notice Minimal DIA Oracle V2 surface (see https://www.diadata.org/docs/guides/how-to-guides/fetch-price-data/solidity).
interface IDIAOracleV2 {
    /// @param key Asset pair key, e.g. "BTC/USD", "ETH/USD", "LTC/USD".
    /// @return price Fixed-point value with 8 decimals (DIA "fixed-comma" notation).
    /// @return timestamp Unix time of the last oracle update.
    function getValue(string calldata key) external view returns (uint128 price, uint128 timestamp);
}
