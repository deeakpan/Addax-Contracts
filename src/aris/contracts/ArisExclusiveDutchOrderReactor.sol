// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.17;

import {IPermit2} from "../permit2/interfaces/IPermit2.sol";
import {ExclusiveDutchOrderReactor} from "../arisCore/reactors/ExclusiveDutchOrderReactor.sol";

contract ArisExclusiveDutchOrderReactor is ExclusiveDutchOrderReactor {
    constructor(IPermit2 permit2, address protocolFeeOwner) ExclusiveDutchOrderReactor(permit2, protocolFeeOwner) {}
}
