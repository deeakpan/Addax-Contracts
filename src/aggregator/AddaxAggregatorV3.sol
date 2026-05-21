// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

interface IRouterMulticall {
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactInputParams {
        bytes   path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactOutputParams {
        bytes   path;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
    }

    function exactInputSingle(ExactInputSingleParams calldata)  external payable returns (uint256);
    function exactInput(ExactInputParams calldata)              external payable returns (uint256);
    function exactOutputSingle(ExactOutputSingleParams calldata) external payable returns (uint256);
    function exactOutput(ExactOutputParams calldata)            external payable returns (uint256);
}

// ── Aggregator ────────────────────────────────────────────────────────────────

/// @title  AddaxAggregatorV3
/// @notice Thin aggregator that forwards swaps to any allowlisted router.
///         Supports Uniswap V3-compatible routers and V2-compatible routers.
///
/// Flow:
///   1. Caller approves this contract for tokenIn.
///   2. Caller calls one of the swap functions, passing the target `router`.
///   3. This contract pulls tokenIn, approves the router, forwards the call.
///   4. amountOut lands on `params.recipient` directly from the router.
contract AddaxAggregatorV3 {

    address public owner;
    mapping(address => bool) public allowedRouters;

    error RouterNotAllowed(address router);
    error OnlyOwner();
    error MulticallFailed(uint256 index, bytes reason);
    error NativeRefundFailed();

    event RouterAdded(address indexed router);
    event RouterRemoved(address indexed router);

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ── Router management ────────────────────────────────────────────────────

    function addRouter(address router) external onlyOwner {
        allowedRouters[router] = true;
        emit RouterAdded(router);
    }

    function removeRouter(address router) external onlyOwner {
        allowedRouters[router] = false;
        emit RouterRemoved(router);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ── Swap helpers ─────────────────────────────────────────────────────────

    function _pullAndApprove(address token, address router, uint256 amount) internal {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(router, amount);
    }

    function _resetApproval(address token, address router) internal {
        IERC20(token).approve(router, 0);
    }

    // ── Universal router multicall ────────────────────────────────────────────

    /// @notice Forward a pre-encoded V3 router multicall through this aggregator.
    ///
    ///         Handles ALL swap types — ERC20 in, native in, native out — in one
    ///         function. The caller builds the exact same `data` array they would
    ///         pass directly to the router (exactInputSingle, exactInput,
    ///         unwrapWETH9, refundETH, etc.). The aggregator handles the token
    ///         plumbing: pulling ERC20 from the caller and approving the router,
    ///         or forwarding native ETH when tokenIn is address(0).
    ///
    /// @param router    Any allowlisted V3-compatible router.
    /// @param tokenIn   ERC20 address of the input token, or address(0) for native.
    /// @param amountIn  Amount to pull from caller (ignored when tokenIn == address(0)).
    /// @param data      Pre-encoded router call(s), identical to a direct router multicall.
    function routerMulticall(
        address router,
        address tokenIn,
        uint256 amountIn,
        bytes[] calldata data
    ) external payable returns (bytes[] memory results) {
        if (!allowedRouters[router]) revert RouterNotAllowed(router);

        if (tokenIn != address(0) && amountIn > 0) {
            _pullAndApprove(tokenIn, router, amountIn);
        }

        results = IRouterMulticall(router).multicall{value: msg.value}(data);

        if (tokenIn != address(0)) {
            _resetApproval(tokenIn, router);
        }

        // Forward any native ETH refunded by the router back to caller.
        uint256 ethBal = address(this).balance;
        if (ethBal > 0) {
            (bool ok,) = msg.sender.call{value: ethBal}("");
            if (!ok) revert NativeRefundFailed();
        }
    }

    // ── V3 swap functions (kept for direct/programmatic use) ──────────────────

    function exactInputSingle(
        address router,
        ISwapRouter.ExactInputSingleParams calldata params
    ) external returns (uint256 amountOut) {
        if (!allowedRouters[router]) revert RouterNotAllowed(router);
        _pullAndApprove(params.tokenIn, router, params.amountIn);
        amountOut = ISwapRouter(router).exactInputSingle(params);
        _resetApproval(params.tokenIn, router);
    }

    function exactInput(
        address router,
        ISwapRouter.ExactInputParams calldata params
    ) external returns (uint256 amountOut) {
        if (!allowedRouters[router]) revert RouterNotAllowed(router);
        address tokenIn = address(bytes20(params.path[:20]));
        _pullAndApprove(tokenIn, router, params.amountIn);
        amountOut = ISwapRouter(router).exactInput(params);
        _resetApproval(tokenIn, router);
    }

    function exactOutputSingle(
        address router,
        ISwapRouter.ExactOutputSingleParams calldata params
    ) external returns (uint256 amountIn) {
        if (!allowedRouters[router]) revert RouterNotAllowed(router);
        _pullAndApprove(params.tokenIn, router, params.amountInMaximum);
        amountIn = ISwapRouter(router).exactOutputSingle(params);
        _resetApproval(params.tokenIn, router);
        uint256 leftover = IERC20(params.tokenIn).balanceOf(address(this));
        if (leftover > 0) IERC20(params.tokenIn).transfer(msg.sender, leftover);
    }

    function exactOutput(
        address router,
        ISwapRouter.ExactOutputParams calldata params
    ) external returns (uint256 amountIn) {
        if (!allowedRouters[router]) revert RouterNotAllowed(router);
        address tokenIn = address(bytes20(params.path[params.path.length - 20:]));
        _pullAndApprove(tokenIn, router, params.amountInMaximum);
        amountIn = ISwapRouter(router).exactOutput(params);
        _resetApproval(tokenIn, router);
        uint256 leftover = IERC20(tokenIn).balanceOf(address(this));
        if (leftover > 0) IERC20(tokenIn).transfer(msg.sender, leftover);
    }

    // ── Aggregator self-multicall ─────────────────────────────────────────────

    function multicall(bytes[] calldata data) external returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool ok, bytes memory res) = address(this).delegatecall(data[i]);
            if (!ok) revert MulticallFailed(i, res);
            results[i] = res;
        }
    }

    // ── V2 Swap functions ─────────────────────────────────────────────────────

    /// @notice ERC20 → ERC20 via a Uniswap-V2-compatible router.
    function exactInputV2(
        address router,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        if (!allowedRouters[router]) revert RouterNotAllowed(router);
        _pullAndApprove(path[0], router, amountIn);
        amounts = IUniswapV2Router(router).swapExactTokensForTokens(
            amountIn, amountOutMin, path, msg.sender, deadline
        );
        _resetApproval(path[0], router);
    }

    /// @notice Native → ERC20 via a Uniswap-V2-compatible router.
    ///         V2 wraps native internally; msg.value is forwarded directly.
    function exactInputETHV2(
        address router,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts) {
        if (!allowedRouters[router]) revert RouterNotAllowed(router);
        amounts = IUniswapV2Router(router).swapExactETHForTokens{value: msg.value}(
            amountOutMin, path, msg.sender, deadline
        );
    }

    /// @notice ERC20 → native via a Uniswap-V2-compatible router.
    function exactInputTokensForETHV2(
        address router,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        if (!allowedRouters[router]) revert RouterNotAllowed(router);
        _pullAndApprove(path[0], router, amountIn);
        amounts = IUniswapV2Router(router).swapExactTokensForETH(
            amountIn, amountOutMin, path, msg.sender, deadline
        );
        _resetApproval(path[0], router);
    }

    // Accept ETH refunds from V2 routers.
    receive() external payable {}
}
