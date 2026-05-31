// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SettlementToken is ERC20, Ownable, ReentrancyGuard {
    struct SaleConfig {
        uint256 tokensPerEth;
        uint256 minPurchase;
        uint256 maxPurchase;
        uint256 saleSupply;
        uint256 startTime;
        uint256 endTime;
        uint256 hardCap;
        bool whitelistEnabled;
    }

    struct StablecoinConfig {
        uint256 tokensPerUnit; // whole settlement tokens per 1 whole stablecoin
        uint8 stablecoinDecimals;
        bool enabled;
    }

    SaleConfig public saleConfig;

    mapping(address => bool) public whitelist;
    mapping(address => uint256) public contributions;
    mapping(address => StablecoinConfig) public stablecoinConfigs;

    address[] private _stablecoins;

    uint256 public totalRaised;
    uint256 public tokensSold;
    bool public saleActive = false;

    event TokensPurchased(address indexed buyer, uint256 ethAmount, uint256 tokenAmount);
    event TokensPurchasedWithStablecoin(address indexed buyer, address indexed stablecoin, uint256 stablecoinAmount, uint256 tokenAmount);
    event SaleStarted(SaleConfig config);
    event SaleEnded(uint256 totalRaised, uint256 tokensSold);
    event WhitelistUpdated(address[] users, bool status);
    event StablecoinConfigured(address indexed stablecoin, uint256 tokensPerUnit, bool enabled);

    constructor(
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        uint256 initialSupply = 1_000_000 * (10 ** decimals());
        _mint(msg.sender, initialSupply);
    }

    // --- Sale Management ---

    function startSale(
        uint256 _tokensPerEth,
        uint256 _minPurchase,
        uint256 _maxPurchase,
        uint256 _saleSupply,
        uint256 _durationInHours,
        uint256 _hardCap,
        bool _whitelistEnabled
    ) external onlyOwner {
        require(!saleActive, "Sale already active");
        require(_saleSupply > 0, "No tokens allocated for sale");
        require(balanceOf(owner()) >= _saleSupply, "Insufficient tokens in treasury");
        require(_tokensPerEth > 0, "Invalid exchange rate");

        saleConfig = SaleConfig({
            tokensPerEth: _tokensPerEth,
            minPurchase: _minPurchase,
            maxPurchase: _maxPurchase,
            saleSupply: _saleSupply,
            startTime: block.timestamp,
            endTime: block.timestamp + (_durationInHours * 1 hours),
            hardCap: _hardCap,
            whitelistEnabled: _whitelistEnabled
        });

        _transfer(owner(), address(this), _saleSupply);
        saleActive = true;
        emit SaleStarted(saleConfig);
    }

    function endSale() external onlyOwner {
        require(saleActive, "Sale not active");
        saleActive = false;
        uint256 unsoldTokens = balanceOf(address(this));
        if (unsoldTokens > 0) {
            _transfer(address(this), owner(), unsoldTokens);
        }
        emit SaleEnded(totalRaised, tokensSold);
    }

    // --- Purchase with ETH ---

    function buyTokens() external payable nonReentrant {
        require(saleActive, "Sale not active");
        require(block.timestamp >= saleConfig.startTime, "Sale not started");
        require(block.timestamp <= saleConfig.endTime, "Sale ended");
        require(msg.value >= saleConfig.minPurchase, "Below minimum purchase");
        require(msg.value <= saleConfig.maxPurchase, "Above maximum purchase");
        require(totalRaised + msg.value <= saleConfig.hardCap, "Hard cap reached");

        if (saleConfig.whitelistEnabled) {
            require(whitelist[msg.sender], "Not whitelisted");
        }

        require(contributions[msg.sender] + msg.value <= saleConfig.maxPurchase, "Max purchase exceeded");

        uint256 tokenAmount = msg.value * saleConfig.tokensPerEth;
        require(tokenAmount <= balanceOf(address(this)), "Insufficient tokens in sale");
        require(tokensSold + tokenAmount <= saleConfig.saleSupply, "Exceeds sale supply");

        _transfer(address(this), msg.sender, tokenAmount);
        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;
        tokensSold += tokenAmount;

        emit TokensPurchased(msg.sender, msg.value, tokenAmount);
    }

    // --- Purchase with Stablecoins ---

    /**
     * @dev Configure a stablecoin for token purchase.
     * tokensPerUnit: whole settlement tokens issued per 1 whole stablecoin.
     * Example: tokensPerUnit=1000, decimals=6 → 1 USDC (1e6 raw) = 1000 settlement tokens (1000e18 raw).
     */
    function setStablecoinRate(
        address stablecoin,
        uint256 tokensPerUnit,
        uint8 stablecoinDecimals,
        bool enabled
    ) external onlyOwner {
        require(stablecoin != address(0), "Zero address");
        if (!stablecoinConfigs[stablecoin].enabled && enabled) {
            _stablecoins.push(stablecoin);
        }
        stablecoinConfigs[stablecoin] = StablecoinConfig({
            tokensPerUnit: tokensPerUnit,
            stablecoinDecimals: stablecoinDecimals,
            enabled: enabled
        });
        emit StablecoinConfigured(stablecoin, tokensPerUnit, enabled);
    }

    /**
     * @dev Buy settlement tokens with a supported stablecoin.
     * User must approve this contract to spend `stablecoinAmount` of the stablecoin first.
     */
    function buyTokensWithStablecoin(address stablecoin, uint256 stablecoinAmount) external nonReentrant {
        StablecoinConfig memory cfg = stablecoinConfigs[stablecoin];
        require(cfg.enabled, "Stablecoin not supported");
        require(saleActive, "Sale not active");
        require(block.timestamp >= saleConfig.startTime, "Sale not started");
        require(block.timestamp <= saleConfig.endTime, "Sale ended");
        require(stablecoinAmount > 0, "Amount must be positive");

        if (saleConfig.whitelistEnabled) {
            require(whitelist[msg.sender], "Not whitelisted");
        }

        // Pull stablecoins from buyer (buyer must have approved this contract)
        require(
            IERC20(stablecoin).transferFrom(msg.sender, address(this), stablecoinAmount),
            "Stablecoin transfer failed"
        );

        // tokenAmount in raw (18 decimals):
        // = stablecoinAmount_raw * tokensPerUnit * 10^18 / 10^stablecoinDecimals
        uint256 tokenAmount = (stablecoinAmount * cfg.tokensPerUnit * (10 ** decimals()))
            / (10 ** uint256(cfg.stablecoinDecimals));

        require(tokenAmount > 0, "Amount too small");
        require(tokenAmount <= balanceOf(address(this)), "Insufficient tokens in sale");
        require(tokensSold + tokenAmount <= saleConfig.saleSupply, "Exceeds sale supply");

        _transfer(address(this), msg.sender, tokenAmount);
        tokensSold += tokenAmount;

        emit TokensPurchasedWithStablecoin(msg.sender, stablecoin, stablecoinAmount, tokenAmount);
    }

    function getSupportedStablecoins() external view returns (address[] memory) {
        return _stablecoins;
    }

    // --- Whitelist ---

    function addToWhitelist(address[] calldata users) external onlyOwner {
        for (uint i = 0; i < users.length; i++) {
            whitelist[users[i]] = true;
        }
        emit WhitelistUpdated(users, true);
    }

    function removeFromWhitelist(address[] calldata users) external onlyOwner {
        for (uint i = 0; i < users.length; i++) {
            whitelist[users[i]] = false;
        }
        emit WhitelistUpdated(users, false);
    }

    // --- View Helpers ---

    function calculateTokensForEth(uint256 ethAmount) external view returns (uint256) {
        return ethAmount * saleConfig.tokensPerEth;
    }

    function calculateTokensForStablecoin(address stablecoin, uint256 stablecoinAmount) external view returns (uint256) {
        StablecoinConfig memory cfg = stablecoinConfigs[stablecoin];
        if (!cfg.enabled) return 0;
        return (stablecoinAmount * cfg.tokensPerUnit * (10 ** decimals()))
            / (10 ** uint256(cfg.stablecoinDecimals));
    }

    function getSaleInfo() external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 raised,
        uint256 sold,
        uint256 remainingTokens,
        uint256 tokensPerEth,
        bool active
    ) {
        return (
            saleConfig.startTime,
            saleConfig.endTime,
            totalRaised,
            tokensSold,
            balanceOf(address(this)),
            saleConfig.tokensPerEth,
            saleActive
        );
    }

    // --- Withdrawals ---

    function withdrawRaisedETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool success,) = payable(owner()).call{value: balance}("");
        require(success, "ETH transfer failed");
    }

    function withdrawStablecoins(address stablecoin, address to) external onlyOwner {
        uint256 balance = IERC20(stablecoin).balanceOf(address(this));
        require(balance > 0, "No balance");
        require(IERC20(stablecoin).transfer(to, balance), "Transfer failed");
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    receive() external payable {
        revert("Use buyTokens() to purchase tokens");
    }
}
