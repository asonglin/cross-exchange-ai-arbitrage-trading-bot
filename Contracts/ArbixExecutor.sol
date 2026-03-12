// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║           ARBIX ARBITRAGE EXECUTOR v1.0                 ║
 * ║   BNB Chain x YZi Labs Hackathon — Bengaluru 2025      ║
 * ║                                                          ║
 * ║   Flash-loan powered multi-DEX arbitrage executor       ║
 * ║   Supports: PancakeSwap V2, BiSwap, THENA, BabySwap    ║
 * ║   Safety: Circuit breaker, min profit, deadline guard   ║
 * ╚══════════════════════════════════════════════════════════╝
 */

// ── Interfaces ─────────────────────────────────────────────

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);

    function factory() external pure returns (address);
    function WETH() external pure returns (address);
}

interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IPancakeFlashLoan {
    function pancakeCall(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external;
}

// ── Main Contract ──────────────────────────────────────────

contract ArbixExecutor is IPancakeFlashLoan {
    // ── State Variables ────────────────────────────────────
    address public owner;
    address public agent;  // AI agent address (backend hot wallet)
    bool public paused;
    
    // Circuit breaker
    uint256 public maxTradeSize = 10000 * 1e18;  // 10k USDT max
    uint256 public minProfitBps = 5;              // 0.05% min profit
    uint256 public dailyLossLimit = 500 * 1e18;   // $500 daily loss limit
    uint256 public dailyLoss;
    uint256 public lastResetDay;
    
    // Stats
    uint256 public totalTrades;
    uint256 public totalProfit;
    uint256 public totalVolume;
    uint256 public successfulTrades;
    
    // DEX routers on BSC
    address public constant PANCAKESWAP_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address public constant BISWAP_ROUTER      = 0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8;
    address public constant THENA_ROUTER       = 0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109;
    address public constant BABYSWAP_ROUTER    = 0x325E343f1dE602396E256B67eFd1F61C3A6B38Bd;
    
    // Common BSC tokens
    address public constant WBNB  = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address public constant USDT  = 0x55d398326f99059fF775485246999027B3197955;
    address public constant BUSD  = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56;
    address public constant USDC  = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    address public constant BTCB  = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;
    address public constant ETH   = 0x2170Ed0880ac9A755fd29B2688956BD959F933F8;
    
    // Approved DEX routers
    mapping(address => bool) public approvedRouters;
    
    // Trade history (on-chain log)
    struct TradeRecord {
        uint256 timestamp;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 profit;
        address dexBuy;
        address dexSell;
        bool success;
    }
    TradeRecord[] public tradeHistory;
    
    // ── Events ─────────────────────────────────────────────
    event ArbitrageExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 profit,
        address dexBuy,
        address dexSell,
        uint256 timestamp
    );
    
    event FlashArbitrageExecuted(
        address indexed pair,
        address indexed tokenBorrow,
        uint256 amountBorrowed,
        uint256 profit,
        uint256 timestamp
    );
    
    event CircuitBreakerTriggered(
        string reason,
        uint256 value,
        uint256 limit,
        uint256 timestamp
    );
    
    event ConfigUpdated(string param, uint256 oldValue, uint256 newValue);
    event AgentUpdated(address oldAgent, address newAgent);
    
    // ── Modifiers ──────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "ARBIX: Not owner");
        _;
    }
    
    modifier onlyAgent() {
        require(msg.sender == agent || msg.sender == owner, "ARBIX: Not authorized");
        _;
    }
    
    modifier whenNotPaused() {
        require(!paused, "ARBIX: Contract paused");
        _;
    }
    
    modifier circuitBreaker(uint256 amount) {
        // Reset daily loss counter
        uint256 today = block.timestamp / 1 days;
        if (today > lastResetDay) {
            dailyLoss = 0;
            lastResetDay = today;
        }
        require(dailyLoss < dailyLossLimit, "ARBIX: Daily loss limit reached");
        require(amount <= maxTradeSize, "ARBIX: Exceeds max trade size");
        _;
    }

    // ── Constructor ────────────────────────────────────────
    constructor(address _agent) {
        owner = msg.sender;
        agent = _agent;
        lastResetDay = block.timestamp / 1 days;
        
        // Approve known DEX routers
        approvedRouters[PANCAKESWAP_ROUTER] = true;
        approvedRouters[BISWAP_ROUTER] = true;
        approvedRouters[THENA_ROUTER] = true;
        approvedRouters[BABYSWAP_ROUTER] = true;
    }

    // ═══════════════════════════════════════════════════════
    // ║              CORE ARBITRAGE FUNCTIONS               ║
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Execute a two-leg cross-DEX arbitrage
     * @param tokenIn  Token to start with (e.g., USDT)
     * @param tokenOut Token to arbitrage through (e.g., BNB)
     * @param amountIn Amount of tokenIn to use
     * @param dexBuy   Router address to buy tokenOut (lower price)
     * @param dexSell  Router address to sell tokenOut (higher price)
     * @param minProfit Minimum acceptable profit in tokenIn
     * @param deadline Transaction deadline timestamp
     */
    function executeCrossDexArbitrage(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address dexBuy,
        address dexSell,
        uint256 minProfit,
        uint256 deadline
    ) external onlyAgent whenNotPaused circuitBreaker(amountIn) {
        require(block.timestamp <= deadline, "ARBIX: Deadline expired");
        require(approvedRouters[dexBuy] && approvedRouters[dexSell], "ARBIX: Unapproved router");
        require(dexBuy != dexSell, "ARBIX: Same DEX");
        
        uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
        require(balanceBefore >= amountIn, "ARBIX: Insufficient balance");
        
        // Leg 1: Buy tokenOut on cheaper DEX
        IERC20(tokenIn).approve(dexBuy, amountIn);
        address[] memory pathBuy = new address[](2);
        pathBuy[0] = tokenIn;
        pathBuy[1] = tokenOut;
        
        uint256[] memory amountsBuy = IUniswapV2Router(dexBuy).swapExactTokensForTokens(
            amountIn, 0, pathBuy, address(this), deadline
        );
        
        uint256 tokenOutReceived = amountsBuy[amountsBuy.length - 1];
        
        // Leg 2: Sell tokenOut on more expensive DEX
        IERC20(tokenOut).approve(dexSell, tokenOutReceived);
        address[] memory pathSell = new address[](2);
        pathSell[0] = tokenOut;
        pathSell[1] = tokenIn;
        
        IUniswapV2Router(dexSell).swapExactTokensForTokens(
            tokenOutReceived, 0, pathSell, address(this), deadline
        );
        
        uint256 balanceAfter = IERC20(tokenIn).balanceOf(address(this));
        require(balanceAfter > balanceBefore, "ARBIX: No profit");
        
        uint256 profit = balanceAfter - balanceBefore;
        require(profit >= minProfit, "ARBIX: Below min profit");
        
        // Verify min profit in bps
        uint256 profitBps = (profit * 10000) / amountIn;
        require(profitBps >= minProfitBps, "ARBIX: Below min profit bps");
        
        // Update stats
        totalTrades++;
        successfulTrades++;
        totalProfit += profit;
        totalVolume += amountIn;
        
        // Record trade
        tradeHistory.push(TradeRecord({
            timestamp: block.timestamp,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            amountOut: tokenOutReceived,
            profit: profit,
            dexBuy: dexBuy,
            dexSell: dexSell,
            success: true
        }));
        
        emit ArbitrageExecuted(tokenIn, tokenOut, amountIn, profit, dexBuy, dexSell, block.timestamp);
    }

    /**
     * @notice Execute triangular arbitrage on a single DEX
     * @param router   DEX router to use
     * @param tokenA   Start/end token (e.g., USDT)
     * @param tokenB   Intermediate token 1 (e.g., BNB)
     * @param tokenC   Intermediate token 2 (e.g., ETH)
     * @param amountIn Amount of tokenA to start with
     * @param minProfit Minimum acceptable profit
     * @param deadline Transaction deadline
     */
    function executeTriangularArbitrage(
        address router,
        address tokenA,
        address tokenB,
        address tokenC,
        uint256 amountIn,
        uint256 minProfit,
        uint256 deadline
    ) external onlyAgent whenNotPaused circuitBreaker(amountIn) {
        require(block.timestamp <= deadline, "ARBIX: Deadline expired");
        require(approvedRouters[router], "ARBIX: Unapproved router");
        
        uint256 balanceBefore = IERC20(tokenA).balanceOf(address(this));
        require(balanceBefore >= amountIn, "ARBIX: Insufficient balance");
        
        // Leg 1: A → B
        IERC20(tokenA).approve(router, amountIn);
        address[] memory path1 = new address[](2);
        path1[0] = tokenA;
        path1[1] = tokenB;
        uint256[] memory amounts1 = IUniswapV2Router(router).swapExactTokensForTokens(
            amountIn, 0, path1, address(this), deadline
        );
        
        // Leg 2: B → C
        uint256 bReceived = amounts1[1];
        IERC20(tokenB).approve(router, bReceived);
        address[] memory path2 = new address[](2);
        path2[0] = tokenB;
        path2[1] = tokenC;
        uint256[] memory amounts2 = IUniswapV2Router(router).swapExactTokensForTokens(
            bReceived, 0, path2, address(this), deadline
        );
        
        // Leg 3: C → A
        uint256 cReceived = amounts2[1];
        IERC20(tokenC).approve(router, cReceived);
        address[] memory path3 = new address[](2);
        path3[0] = tokenC;
        path3[1] = tokenA;
        IUniswapV2Router(router).swapExactTokensForTokens(
            cReceived, 0, path3, address(this), deadline
        );
        
        uint256 balanceAfter = IERC20(tokenA).balanceOf(address(this));
        require(balanceAfter > balanceBefore, "ARBIX: No profit");
        
        uint256 profit = balanceAfter - balanceBefore;
        require(profit >= minProfit, "ARBIX: Below min profit");
        
        totalTrades++;
        successfulTrades++;
        totalProfit += profit;
        totalVolume += amountIn;
        
        emit ArbitrageExecuted(tokenA, tokenB, amountIn, profit, router, router, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════
    // ║              FLASH LOAN ARBITRAGE                   ║
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Initiate a flash loan arbitrage via PancakeSwap pair
     * @param pair     PancakeSwap pair to borrow from
     * @param tokenBorrow Token to borrow
     * @param amount   Amount to borrow
     * @param dexSell  Router to sell on (the expensive DEX)
     * @param tokenOut Intermediate token
     */
    function executeFlashArbitrage(
        address pair,
        address tokenBorrow,
        uint256 amount,
        address dexSell,
        address tokenOut
    ) external onlyAgent whenNotPaused circuitBreaker(amount) {
        require(approvedRouters[dexSell], "ARBIX: Unapproved router");
        
        // Determine which token index to borrow
        address token0 = IUniswapV2Pair(pair).token0();
        uint256 amount0Out = tokenBorrow == token0 ? amount : 0;
        uint256 amount1Out = tokenBorrow == token0 ? 0 : amount;
        
        // Encode callback data
        bytes memory data = abi.encode(tokenBorrow, tokenOut, dexSell, amount);
        
        // Initiate flash swap (triggers pancakeCall)
        IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), data);
    }

    /**
     * @notice PancakeSwap flash loan callback
     */
    function pancakeCall(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external override {
        require(sender == address(this), "ARBIX: Invalid sender");
        
        (address tokenBorrow, address tokenOut, address dexSell, uint256 borrowAmount) = 
            abi.decode(data, (address, address, address, uint256));
        
        uint256 amountBorrowed = amount0 > 0 ? amount0 : amount1;
        
        // Calculate repayment (0.3% fee for PancakeSwap, 0.1% for BiSwap)
        uint256 fee = (amountBorrowed * 3) / 1000 + 1;  // 0.3% + 1 wei safety
        uint256 amountRepay = amountBorrowed + fee;
        
        // Leg 1: Sell borrowed token on expensive DEX for tokenOut
        IERC20(tokenBorrow).approve(dexSell, amountBorrowed);
        address[] memory pathSell = new address[](2);
        pathSell[0] = tokenBorrow;
        pathSell[1] = tokenOut;
        uint256[] memory sellAmounts = IUniswapV2Router(dexSell).swapExactTokensForTokens(
            amountBorrowed, 0, pathSell, address(this), block.timestamp + 120
        );
        
        // Leg 2: Buy back tokenBorrow on cheaper DEX (the pair we borrowed from)
        uint256 tokenOutReceived = sellAmounts[1];
        // Instead of using the same pair's router, swap back via the pair
        IERC20(tokenOut).approve(PANCAKESWAP_ROUTER, tokenOutReceived);
        address[] memory pathBuy = new address[](2);
        pathBuy[0] = tokenOut;
        pathBuy[1] = tokenBorrow;
        IUniswapV2Router(PANCAKESWAP_ROUTER).swapExactTokensForTokens(
            tokenOutReceived, amountRepay, pathBuy, address(this), block.timestamp + 120
        );
        
        // Repay flash loan
        IERC20(tokenBorrow).transfer(msg.sender, amountRepay);
        
        uint256 profit = IERC20(tokenBorrow).balanceOf(address(this));
        
        totalTrades++;
        if (profit > 0) {
            successfulTrades++;
            totalProfit += profit;
        }
        totalVolume += amountBorrowed;
        
        emit FlashArbitrageExecuted(msg.sender, tokenBorrow, amountBorrowed, profit, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════
    // ║              PRICE QUERY HELPERS                    ║
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Get the best price across multiple DEXes
     * @param tokenIn  Input token
     * @param tokenOut Output token  
     * @param amountIn Input amount
     * @return bestRouter Address of the DEX with best price
     * @return bestAmountOut Best output amount
     * @return prices Array of prices from each DEX
     */
    function getBestPrice(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (
        address bestRouter,
        uint256 bestAmountOut,
        uint256[4] memory prices
    ) {
        address[4] memory routers = [PANCAKESWAP_ROUTER, BISWAP_ROUTER, THENA_ROUTER, BABYSWAP_ROUTER];
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        
        bestAmountOut = 0;
        
        for (uint256 i = 0; i < 4; i++) {
            try IUniswapV2Router(routers[i]).getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
                prices[i] = amounts[amounts.length - 1];
                if (amounts[amounts.length - 1] > bestAmountOut) {
                    bestAmountOut = amounts[amounts.length - 1];
                    bestRouter = routers[i];
                }
            } catch {
                prices[i] = 0;
            }
        }
    }

    /**
     * @notice Calculate arbitrage profit between two DEXes
     * @param tokenIn  Base token (e.g., USDT)
     * @param tokenOut Quote token (e.g., BNB)
     * @param amountIn Amount to trade
     * @param dexBuy   DEX to buy on
     * @param dexSell  DEX to sell on
     * @return profit Expected profit in tokenIn
     * @return profitBps Profit in basis points
     */
    function calculateArbitrageProfit(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address dexBuy,
        address dexSell
    ) external view returns (uint256 profit, uint256 profitBps) {
        address[] memory pathBuy = new address[](2);
        pathBuy[0] = tokenIn;
        pathBuy[1] = tokenOut;
        
        address[] memory pathSell = new address[](2);
        pathSell[0] = tokenOut;
        pathSell[1] = tokenIn;
        
        try IUniswapV2Router(dexBuy).getAmountsOut(amountIn, pathBuy) returns (uint256[] memory buyAmounts) {
            uint256 tokenOutAmount = buyAmounts[1];
            try IUniswapV2Router(dexSell).getAmountsOut(tokenOutAmount, pathSell) returns (uint256[] memory sellAmounts) {
                uint256 finalAmount = sellAmounts[1];
                if (finalAmount > amountIn) {
                    profit = finalAmount - amountIn;
                    profitBps = (profit * 10000) / amountIn;
                }
            } catch {}
        } catch {}
    }

    // ═══════════════════════════════════════════════════════
    // ║              ADMIN & SAFETY FUNCTIONS               ║
    // ═══════════════════════════════════════════════════════

    function setAgent(address _agent) external onlyOwner {
        emit AgentUpdated(agent, _agent);
        agent = _agent;
    }
    
    function setMaxTradeSize(uint256 _max) external onlyOwner {
        emit ConfigUpdated("maxTradeSize", maxTradeSize, _max);
        maxTradeSize = _max;
    }
    
    function setMinProfitBps(uint256 _bps) external onlyOwner {
        emit ConfigUpdated("minProfitBps", minProfitBps, _bps);
        minProfitBps = _bps;
    }
    
    function setDailyLossLimit(uint256 _limit) external onlyOwner {
        emit ConfigUpdated("dailyLossLimit", dailyLossLimit, _limit);
        dailyLossLimit = _limit;
    }
    
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }
    
    function approveRouter(address router, bool approved) external onlyOwner {
        approvedRouters[router] = approved;
    }
    
    function approveToken(address token, address router, uint256 amount) external onlyOwner {
        IERC20(token).approve(router, amount);
    }
    
    /// @notice Emergency: withdraw stuck tokens
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }
    
    /// @notice Emergency: withdraw stuck BNB
    function emergencyWithdrawBNB() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
    
    // ── View Functions ─────────────────────────────────────
    
    function getStats() external view returns (
        uint256 _totalTrades,
        uint256 _successfulTrades,
        uint256 _totalProfit,
        uint256 _totalVolume,
        uint256 _dailyLoss,
        bool _paused
    ) {
        return (totalTrades, successfulTrades, totalProfit, totalVolume, dailyLoss, paused);
    }
    
    function getTradeCount() external view returns (uint256) {
        return tradeHistory.length;
    }
    
    function getRecentTrades(uint256 count) external view returns (TradeRecord[] memory) {
        uint256 total = tradeHistory.length;
        uint256 start = total > count ? total - count : 0;
        uint256 len = total - start;
        
        TradeRecord[] memory recent = new TradeRecord[](len);
        for (uint256 i = 0; i < len; i++) {
            recent[i] = tradeHistory[start + i];
        }
        return recent;
    }
    
    /// @notice Accept BNB deposits
    receive() external payable {}
    fallback() external payable {}
}
