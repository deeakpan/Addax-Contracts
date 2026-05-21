// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {BaseReactor} from "./BaseReactor.sol";
import {Permit2Lib} from "../lib/Permit2Lib.sol";
import {DcaOrderLib, DcaOrder} from "../lib/DcaOrderLib.sol";
import {SignedOrder, ResolvedOrder, InputToken} from "../base/ReactorStructs.sol";
import {IPermit2} from "../../permit2/interfaces/IPermit2.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";

/// @notice Reactor for time-sliced DCA orders.
contract DcaOrderReactor is BaseReactor {
    using Permit2Lib for ResolvedOrder;
    using DcaOrderLib for DcaOrder;

    error InvalidDcaConfig();
    error InvalidSliceIndex();
    error SliceNotStarted();
    error SliceWindowPassed();
    error DeadlineBeforeSliceWindow();

    constructor(IPermit2 _permit2, address _protocolFeeOwner) BaseReactor(_permit2, _protocolFeeOwner) {}

    function _resolve(SignedOrder calldata signedOrder)
        internal
        view
        override
        returns (ResolvedOrder memory resolvedOrder)
    {
        DcaOrder memory dcaOrder = abi.decode(signedOrder.order, (DcaOrder));
        _validateDcaTiming(dcaOrder);

        resolvedOrder = ResolvedOrder({
            info: dcaOrder.info,
            input: InputToken({token: ERC20(dcaOrder.inputToken), amount: dcaOrder.inputAmount, maxAmount: dcaOrder.inputAmount}),
            outputs: dcaOrder.outputs,
            sig: signedOrder.sig,
            hash: dcaOrder.hash()
        });
    }

    function _transferInputTokens(ResolvedOrder memory order, address to) internal override {
        permit2.permitWitnessTransferFrom(
            order.toPermit(),
            order.transferDetails(to),
            order.info.swapper,
            order.hash,
            DcaOrderLib.PERMIT2_ORDER_TYPE,
            order.sig
        );
    }

    function _validateDcaTiming(DcaOrder memory order) internal view {
        if (order.intervalSeconds == 0 || order.totalSlices == 0) revert InvalidDcaConfig();
        if (order.sliceIndex >= order.totalSlices) revert InvalidSliceIndex();

        uint256 sliceStart = order.startTime + (order.sliceIndex * order.intervalSeconds);
        uint256 fillWindow = order.fillWindowSeconds == 0 ? order.intervalSeconds : order.fillWindowSeconds;
        uint256 sliceEnd = sliceStart + fillWindow;

        if (order.info.deadline < sliceEnd) revert DeadlineBeforeSliceWindow();
        if (block.timestamp < sliceStart) revert SliceNotStarted();
        if (block.timestamp > sliceEnd) revert SliceWindowPassed();
    }
}
