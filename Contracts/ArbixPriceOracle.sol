// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         ARBIX PRICE ORACLE AGGREGATOR v1.0              ║
 * ║   On-chain multi-DEX price feed aggregator              ║
 * ║   Reads reserves from PancakeSwap, BiSwap, THENA       ║
 * ║   Computes TWAP, detects anomalies, provides median     ║
 * ╚══════════════════════════════════════════════════════════╝
 */

interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

contract ArbixPriceOracle {
    address public owner;
    
    // DEX factories
    address public constant PANCAKE_FACTORY = 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73;
    address public constant BISWAP_FACTORY  = 0x858E3312ed3A876947EA49d572A7C42DE08af7EE;
    
    // TWAP storage
    struct PricePoint {
        uint256 price;      // price * 1e18
        uint256 timestamp;
    }
    
    // token pair hash -> price history
    mapping(bytes32 => PricePoint[]) public priceHistory;
    mapping(bytes32 => uint256) public lastUpdate;
    
    // Anomaly thresholds
    uint256 public anomalyThresholdBps = 500; // 5% deviation = anomaly
    
    event PriceRecorded(address indexed tokenA, address indexed tokenB, uint256 price, string dex);
    event AnomalyDetected(address indexed tokenA, address indexed tokenB, uint256 price, uint256 median, uint256 deviationBps);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Get price from a specific DEX factory
     * @param factory DEX factory address
     * @param tokenA Base token
     * @param tokenB Quote token  
     * @param decimalsA Decimals of tokenA
     * @param decimalsB Decimals of tokenB
     * @return price Price of tokenA in tokenB (scaled to 1e18)
     */
    function getPriceFromDex(
        address factory,
        address tokenA,
        address tokenB,
        uint8 decimalsA,
        uint8 decimalsB
    ) public view returns (uint256 price) {
        address pair = IUniswapV2Factory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) return 0;
        
        (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pair).getReserves();
        if (reserve0 == 0 || reserve1 == 0) return 0;
        
        address token0 = IUniswapV2Pair(pair).token0();
        
        if (tokenA == token0) {
            // price = reserve1 / reserve0, adjusted for decimals
            price = (uint256(reserve1) * (10 ** decimalsA) * 1e18) / (uint256(reserve0) * (10 ** decimalsB));
        } else {
            price = (uint256(reserve0) * (10 ** decimalsA) * 1e18) / (uint256(reserve1) * (10 ** decimalsB));
        }
    }

    /**
     * @notice Get aggregated price from multiple DEXes
     * @return pancakePrice Price from PancakeSwap
     * @return biswapPrice Price from BiSwap
     * @return medianPrice Median price
     * @return spreadBps Spread between highest and lowest in bps
     */
    function getAggregatedPrice(
        address tokenA,
        address tokenB,
        uint8 decimalsA,
        uint8 decimalsB
    ) external view returns (
        uint256 pancakePrice,
        uint256 biswapPrice,
        uint256 medianPrice,
        uint256 spreadBps
    ) {
        pancakePrice = getPriceFromDex(PANCAKE_FACTORY, tokenA, tokenB, decimalsA, decimalsB);
        biswapPrice = getPriceFromDex(BISWAP_FACTORY, tokenA, tokenB, decimalsA, decimalsB);
        
        // Simple median (2 sources)
        if (pancakePrice > 0 && biswapPrice > 0) {
            medianPrice = (pancakePrice + biswapPrice) / 2;
            uint256 diff = pancakePrice > biswapPrice ? 
                pancakePrice - biswapPrice : biswapPrice - pancakePrice;
            spreadBps = (diff * 10000) / medianPrice;
        } else if (pancakePrice > 0) {
            medianPrice = pancakePrice;
        } else {
            medianPrice = biswapPrice;
        }
    }

    /**
     * @notice Record price for TWAP calculation
     */
    function recordPrice(
        address tokenA,
        address tokenB,
        uint8 decimalsA,
        uint8 decimalsB
    ) external {
        bytes32 pairHash = keccak256(abi.encodePacked(tokenA, tokenB));
        
        uint256 pancakePrice = getPriceFromDex(PANCAKE_FACTORY, tokenA, tokenB, decimalsA, decimalsB);
        uint256 biswapPrice = getPriceFromDex(BISWAP_FACTORY, tokenA, tokenB, decimalsA, decimalsB);
        
        uint256 avgPrice = 0;
        if (pancakePrice > 0 && biswapPrice > 0) {
            avgPrice = (pancakePrice + biswapPrice) / 2;
        } else if (pancakePrice > 0) {
            avgPrice = pancakePrice;
        } else {
            avgPrice = biswapPrice;
        }
        
        if (avgPrice == 0) return;
        
        priceHistory[pairHash].push(PricePoint({
            price: avgPrice,
            timestamp: block.timestamp
        }));
        lastUpdate[pairHash] = block.timestamp;
        
        // Check for anomaly
        _checkAnomaly(pairHash, avgPrice, tokenA, tokenB);
        
        emit PriceRecorded(tokenA, tokenB, avgPrice, "aggregated");
    }

    /**
     * @notice Get TWAP for a token pair over a time window
     * @param tokenA Base token
     * @param tokenB Quote token
     * @param windowSeconds Time window for TWAP (e.g., 3600 for 1 hour)
     */
    function getTWAP(
        address tokenA,
        address tokenB,
        uint256 windowSeconds
    ) external view returns (uint256 twap, uint256 dataPoints) {
        bytes32 pairHash = keccak256(abi.encodePacked(tokenA, tokenB));
        PricePoint[] storage history = priceHistory[pairHash];
        
        if (history.length == 0) return (0, 0);
        
        uint256 cutoff = block.timestamp - windowSeconds;
        uint256 totalPrice = 0;
        uint256 count = 0;
        
        for (uint256 i = history.length; i > 0; i--) {
            if (history[i-1].timestamp < cutoff) break;
            totalPrice += history[i-1].price;
            count++;
        }
        
        if (count == 0) return (0, 0);
        twap = totalPrice / count;
        dataPoints = count;
    }

    /**
     * @notice Internal anomaly detection
     */
    function _checkAnomaly(
        bytes32 pairHash,
        uint256 currentPrice,
        address tokenA,
        address tokenB
    ) internal {
        PricePoint[] storage history = priceHistory[pairHash];
        if (history.length < 5) return;
        
        // Calculate recent average (last 5 points)
        uint256 total = 0;
        uint256 start = history.length > 5 ? history.length - 5 : 0;
        for (uint256 i = start; i < history.length; i++) {
            total += history[i].price;
        }
        uint256 avg = total / (history.length - start);
        
        uint256 deviation = currentPrice > avg ? currentPrice - avg : avg - currentPrice;
        uint256 deviationBps = (deviation * 10000) / avg;
        
        if (deviationBps > anomalyThresholdBps) {
            emit AnomalyDetected(tokenA, tokenB, currentPrice, avg, deviationBps);
        }
    }

    function setAnomalyThreshold(uint256 _bps) external onlyOwner {
        anomalyThresholdBps = _bps;
    }

    function getPriceHistoryLength(address tokenA, address tokenB) external view returns (uint256) {
        bytes32 pairHash = keccak256(abi.encodePacked(tokenA, tokenB));
        return priceHistory[pairHash].length;
    }
}
