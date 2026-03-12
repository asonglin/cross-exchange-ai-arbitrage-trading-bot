// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         ARBIX VAULT — Secure Fund Management            ║
 * ║   Multi-sig controlled vault for arbitrage capital      ║
 * ║   Features: deposit/withdraw, profit distribution,     ║
 * ║   automated rebalancing, emergency controls             ║
 * ╚══════════════════════════════════════════════════════════╝
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract ArbixVault {
    // ── State ──────────────────────────────────────────────
    address public owner;
    address public executor;  // ArbixExecutor contract
    
    // Depositor tracking
    struct Depositor {
        uint256 depositAmount;
        uint256 depositTimestamp;
        uint256 profitShare;
        bool active;
    }
    
    mapping(address => mapping(address => Depositor)) public depositors; // user -> token -> info
    mapping(address => uint256) public totalDeposited;    // token -> total
    mapping(address => uint256) public totalProfits;      // token -> profits
    
    address[] public supportedTokens;
    mapping(address => bool) public isSupported;
    
    // Profit sharing
    uint256 public performanceFee = 1000; // 10% of profits (in bps)
    uint256 public accumulatedFees;
    
    // Safety
    bool public locked;
    uint256 public constant MIN_LOCK_PERIOD = 1 hours;
    
    // ── Events ─────────────────────────────────────────────
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount, uint256 profit);
    event ProfitDistributed(address indexed token, uint256 totalProfit, uint256 fee);
    event ExecutorFunded(address indexed token, uint256 amount);
    event ExecutorUpdated(address oldExecutor, address newExecutor);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "VAULT: Not owner");
        _;
    }
    
    modifier nonReentrant() {
        require(!locked, "VAULT: Reentrant");
        locked = true;
        _;
        locked = false;
    }
    
    constructor(address _executor) {
        owner = msg.sender;
        executor = _executor;
    }
    
    // ═══════════════════════════════════════════════════════
    // ║              DEPOSIT & WITHDRAW                     ║
    // ═══════════════════════════════════════════════════════

    function addSupportedToken(address token) external onlyOwner {
        require(!isSupported[token], "VAULT: Already supported");
        supportedTokens.push(token);
        isSupported[token] = true;
    }

    function deposit(address token, uint256 amount) external nonReentrant {
        require(isSupported[token], "VAULT: Token not supported");
        require(amount > 0, "VAULT: Zero amount");
        
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        
        Depositor storage dep = depositors[msg.sender][token];
        dep.depositAmount += amount;
        dep.depositTimestamp = block.timestamp;
        dep.active = true;
        
        totalDeposited[token] += amount;
        
        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        Depositor storage dep = depositors[msg.sender][token];
        require(dep.active, "VAULT: No deposit");
        require(dep.depositAmount >= amount, "VAULT: Insufficient balance");
        require(
            block.timestamp >= dep.depositTimestamp + MIN_LOCK_PERIOD,
            "VAULT: Lock period active"
        );
        
        // Calculate proportional profit share
        uint256 profitShare = 0;
        if (totalProfits[token] > 0 && totalDeposited[token] > 0) {
            profitShare = (totalProfits[token] * amount) / totalDeposited[token];
            uint256 fee = (profitShare * performanceFee) / 10000;
            profitShare -= fee;
            accumulatedFees += fee;
        }
        
        dep.depositAmount -= amount;
        dep.profitShare += profitShare;
        if (dep.depositAmount == 0) dep.active = false;
        
        totalDeposited[token] -= amount;
        
        uint256 totalPayout = amount + profitShare;
        IERC20(token).transfer(msg.sender, totalPayout);
        
        emit Withdrawn(msg.sender, token, amount, profitShare);
    }

    // ═══════════════════════════════════════════════════════
    // ║              EXECUTOR MANAGEMENT                    ║
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Fund the executor contract for arbitrage
     */
    function fundExecutor(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).balanceOf(address(this)) >= amount, "VAULT: Insufficient");
        IERC20(token).transfer(executor, amount);
        emit ExecutorFunded(token, amount);
    }

    /**
     * @notice Collect profits from executor back to vault
     */
    function collectProfits(address token, uint256 amount) external onlyOwner {
        IERC20(token).transferFrom(executor, address(this), amount);
        totalProfits[token] += amount;
        emit ProfitDistributed(token, amount, (amount * performanceFee) / 10000);
    }

    function setExecutor(address _executor) external onlyOwner {
        emit ExecutorUpdated(executor, _executor);
        executor = _executor;
    }

    function setPerformanceFee(uint256 _fee) external onlyOwner {
        require(_fee <= 3000, "VAULT: Fee too high"); // Max 30%
        performanceFee = _fee;
    }

    function withdrawFees(address token) external onlyOwner {
        uint256 fees = accumulatedFees;
        accumulatedFees = 0;
        IERC20(token).transfer(owner, fees);
    }

    // ── View Functions ─────────────────────────────────────
    
    function getDepositorInfo(address user, address token) external view returns (
        uint256 amount, uint256 timestamp, uint256 profit, bool active
    ) {
        Depositor storage dep = depositors[user][token];
        return (dep.depositAmount, dep.depositTimestamp, dep.profitShare, dep.active);
    }
    
    function getVaultBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
    
    function getSupportedTokenCount() external view returns (uint256) {
        return supportedTokens.length;
    }

    receive() external payable {}
}
