import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Market (Pari-mutuels) flow", function () {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let token: Contract;
  let factory: Contract;
  let market: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("SettlementToken");
    token = await Token.deploy("Settl", "SET");
    await token.waitForDeployment();

    // mint for alice/bob
    await token.mint(alice.address, ethers.parseEther("1000"));
    await token.mint(bob.address, ethers.parseEther("1000"));

    const Factory = await ethers.getContractFactory("MarketFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();

    // create market (2 outcomes)
    const tx = await factory.createMarket(
      await token.getAddress(),
      "Q: Will X happen?",
      2,
      200
    );
    await tx.wait();

    const marketAddress = await factory.markets(0);
    market = await ethers.getContractAt("Market", marketAddress);
  });

  it("bets, resolve, and claims", async function () {
    // alice approves and bets on outcome 0
    await token
      .connect(alice)
      .approve(await market.getAddress(), ethers.parseEther("10"));
    await market.connect(alice).placeBet(0, ethers.parseEther("10"));

    // bob bets on outcome 1
    await token
      .connect(bob)
      .approve(await market.getAddress(), ethers.parseEther("5"));
    await market.connect(bob).placeBet(1, ethers.parseEther("5"));

    // resolve market in favour of outcome 0
    await market.connect(deployer).resolve(0);

    // alice claims: she should get entire pool proportionally = (15 * 10/10) - fee
    const balanceBefore = await token.balanceOf(alice.address);
    await market.connect(alice).claimWinnings();
    const balanceAfter = await token.balanceOf(alice.address);
    expect(balanceAfter).to.be.gt(balanceBefore);
  });
});