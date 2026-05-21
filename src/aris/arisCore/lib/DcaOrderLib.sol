// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {OrderInfo, OutputToken} from "../base/ReactorStructs.sol";
import {OrderInfoLib} from "./OrderInfoLib.sol";

/// @dev External struct for time-sliced DCA orders.
struct DcaOrder {
    // generic order information
    OrderInfo info;
    // token sent by swapper on each slice fill
    address inputToken;
    // exact input amount for this slice
    uint256 inputAmount;
    // required outputs for this slice
    OutputToken[] outputs;
    // schedule start timestamp
    uint256 startTime;
    // per-slice cadence in seconds
    uint256 intervalSeconds;
    // index of this slice (0-based)
    uint256 sliceIndex;
    // total slices in strategy
    uint256 totalSlices;
    // allowed late fill window in seconds; if 0, defaults to intervalSeconds
    uint256 fillWindowSeconds;
}

/// @notice helpers for handling DCA order objects
library DcaOrderLib {
    using OrderInfoLib for OrderInfo;

    bytes private constant OUTPUT_TOKEN_TYPE = "OutputToken(address token,uint256 amount,address recipient)";
    bytes32 private constant OUTPUT_TOKEN_TYPE_HASH = keccak256(OUTPUT_TOKEN_TYPE);

    bytes internal constant ORDER_TYPE = abi.encodePacked(
        "DcaOrder(",
        "OrderInfo info,",
        "address inputToken,",
        "uint256 inputAmount,",
        "OutputToken[] outputs,",
        "uint256 startTime,",
        "uint256 intervalSeconds,",
        "uint256 sliceIndex,",
        "uint256 totalSlices,",
        "uint256 fillWindowSeconds)",
        OrderInfoLib.ORDER_INFO_TYPE,
        OUTPUT_TOKEN_TYPE
    );
    bytes32 internal constant ORDER_TYPE_HASH = keccak256(ORDER_TYPE);

    string private constant TOKEN_PERMISSIONS_TYPE = "TokenPermissions(address token,uint256 amount)";
    string internal constant PERMIT2_ORDER_TYPE =
        string(abi.encodePacked("DcaOrder witness)", ORDER_TYPE, TOKEN_PERMISSIONS_TYPE));

    function hash(OutputToken memory output) private pure returns (bytes32) {
        return keccak256(abi.encode(OUTPUT_TOKEN_TYPE_HASH, output.token, output.amount, output.recipient));
    }

    function hash(OutputToken[] memory outputs) private pure returns (bytes32) {
        unchecked {
            bytes memory packedHashes = new bytes(32 * outputs.length);
            for (uint256 i = 0; i < outputs.length; i++) {
                bytes32 outputHash = hash(outputs[i]);
                assembly {
                    mstore(add(add(packedHashes, 0x20), mul(i, 0x20)), outputHash)
                }
            }
            return keccak256(packedHashes);
        }
    }

    function hash(DcaOrder memory order) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ORDER_TYPE_HASH,
                order.info.hash(),
                order.inputToken,
                order.inputAmount,
                hash(order.outputs),
                order.startTime,
                order.intervalSeconds,
                order.sliceIndex,
                order.totalSlices,
                order.fillWindowSeconds
            )
        );
    }
}
