// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Market is ReentrancyGuard, Ownable {
    enum State { Active, Resolved, Cancelled }
    State public state;
    uint256 public feeBps; // e.g., 200 = 2%
    IERC20 public settlement;
    string public metadata; // ipfs/json pointer
    uint256 public totalPool;
    uint256 public winningOutcome; // only valid when Resolved
    bool public resolved;

    uint256 public outcomesCount;
    mapping(uint256 => uint256) public totalBetsPerOutcome;
    mapping(address => mapping(uint256 => uint256)) public bets; // user -> outcome -> amount

    event BetPlaced(address indexed user, uint256 indexed outcome, uint256 amount);
    event MarketResolved(uint256 indexed winningOutcome);
    event WinningsClaimed(address indexed user, uint256 amount);
    event MarketCancelled();

    constructor(IERC20 _settlement, string memory _metadata, uint256 _outcomesCount, uint256 _feeBps, address _owner) Ownable(_owner) {
        settlement = _settlement;
        metadata = _metadata;
        outcomesCount = _outcomesCount;
        feeBps = _feeBps;
        state = State.Active;
    }

    modifier onlyActive() {
        require(state == State.Active, "Market not active");
        _;
    }

    function placeBet(uint256 outcome, uint256 amount) external nonReentrant onlyActive {
        require(outcome < outcomesCount, "Invalid outcome");
        require(amount > 0, "Amount 0");
        // transfer in settlement token
        require(settlement.transferFrom(msg.sender, address(this), amount), "transfer failed");
        bets[msg.sender][outcome] += amount;
        totalBetsPerOutcome[outcome] += amount;
        totalPool += amount;
        emit BetPlaced(msg.sender, outcome, amount);
    }

    // Admin resolves; in production, this is a Chainlink/onchain oracle callback
    function resolve(uint256 _winningOutcome) external onlyOwner {
        require(state == State.Active, "Already resolved");
        require(_winningOutcome < outcomesCount, "Invalid outcome");
        winningOutcome = _winningOutcome;
        state = State.Resolved;
        resolved = true;
        emit MarketResolved(_winningOutcome);
    }

    // claim winnings after resolve
    function claimWinnings() external nonReentrant {
        require(state == State.Resolved, "Not resolved");
        uint256 userBet = bets[msg.sender][winningOutcome];
        require(userBet > 0, "No winnings");
        uint256 winningPool = totalBetsPerOutcome[winningOutcome];
        // compute user share of pool less fee
        uint256 gross = (totalPool * userBet) / winningPool;
        uint256 fee = (gross * feeBps) / 10000;
        uint256 net = gross - fee;
        // zero out user's bet to avoid double claim
        bets[msg.sender][winningOutcome] = 0;
        // transfer net winnings
        require(settlement.transfer(msg.sender, net), "transfer failed");
        // fee stays in contract; owner can withdraw
        emit WinningsClaimed(msg.sender, net);
    }

    function cancelMarket() external onlyOwner onlyActive {
        state = State.Cancelled;
        emit MarketCancelled();
    }

    // withdraw function for admin to collect fees after resolution/cancellation
    function withdrawFees(address to, uint256 amount) external onlyOwner {
        require(settlement.transfer(to, amount), "transfer failed");
    }
}
