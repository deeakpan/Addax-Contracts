// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./IDIAOracleV2.sol";

/// @dev Local/test oracle: admin sets prices by key (8 decimals, same as DIA).
contract MockDIAOracle is IDIAOracleV2 {
    address public admin;
    mapping(string => uint128) public prices;
    mapping(string => uint128) public timestamps;

    constructor() public {
        admin = msg.sender;
    }

    function setAdmin(address _admin) external {
        require(msg.sender == admin, "MockDIAOracle: forbidden");
        admin = _admin;
    }

    function setValue(string calldata key, uint128 price) external {
        require(msg.sender == admin, "MockDIAOracle: forbidden");
        prices[key] = price;
        timestamps[key] = uint128(block.timestamp);
    }

    function getValue(string calldata key) external view override returns (uint128 price, uint128 timestamp) {
        return (prices[key], timestamps[key]);
    }
}
