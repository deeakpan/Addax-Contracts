// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import {IPermit2} from "../permit2/interfaces/IPermit2.sol";
import {LimitOrderReactor} from "../arisCore/reactors/LimitOrderReactor.sol";

contract ArisLimitOrderReactor is LimitOrderReactor {
    constructor(IPermit2 permit2, address protocolFeeOwner) LimitOrderReactor(permit2, protocolFeeOwner) {}
}
