import { time, loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { expect } from 'chai';
import hre from 'hardhat';
import 'solidity-coverage';

describe('NFT Marketplace', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  const ownerNftIDs = ['1', '2', '3'];
  const otherNftIDs = ['4', '5', '6'];

  const emptyData = new Uint8Array(0);
  const defaultListingPrice = '100';
  async function deploy() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await hre.ethers.getSigners();
    const name = 'My Marketplace';
    const feeRatio = 5;

    const MyERC1155 = await hre.ethers.getContractFactory('MyErc1155');
    const myERC1155 = await MyERC1155.deploy(owner.address);

    // premint some nfts for both owner and other
    await myERC1155.mintBatch(owner.address, ownerNftIDs, ['1', '1', '1'], emptyData);
    await myERC1155.mintBatch(otherAccount.address, otherNftIDs, ['1', '1', '1'], emptyData);

    const MyERC20 = await hre.ethers.getContractFactory('MyToken');
    const myERC20 = await MyERC20.deploy(owner.address);
    const someRandomErc20 = await MyERC20.deploy(otherAccount.address);

    const Marketplace = await hre.ethers.getContractFactory('NFTMarketplace');
    const marketplace = await Marketplace.deploy(name, feeRatio, await myERC20.getAddress());

    // premint some erc20 token for both owner and other
    await myERC20.mint(owner.address, '100000000');
    await myERC20.mint(otherAccount.address, '100000000');
    // premint some erc20 token for both owner and other
    await someRandomErc20.connect(otherAccount).mint(owner.address, '100000000');
    await someRandomErc20.connect(otherAccount).mint(otherAccount.address, '100000000');

    // initially list a nft for owner and other
    await marketplace.listNFT(await myERC1155.getAddress(), ownerNftIDs[0], defaultListingPrice);
    await marketplace.connect(otherAccount).listNFT(await myERC1155.getAddress(), otherNftIDs[0], defaultListingPrice);

    return { feeRatio, owner, otherAccount, marketplace, myERC20, myERC1155, someRandomErc20 };
  }

  describe('Deployment', function () {
    it('Should have correct fee ratio', async function () {
      const { feeRatio, marketplace } = await loadFixture(deploy);
      expect(await marketplace.feeRatio()).to.equal(feeRatio);
    });
  });
  describe('Accepting Token', function () {
    it('Should be able to add accepted token', async function () {
      const { marketplace, myERC20 } = await loadFixture(deploy);

      await marketplace.AddTokenToWhitelist(await myERC20.getAddress());
      expect(await marketplace.isSupportedERC20(await myERC20.getAddress())).to.be.true;
    });

    it('Should reject nonERC20 token', async function () {
      const { otherAccount, marketplace } = await loadFixture(deploy);

      await expect(marketplace.AddTokenToWhitelist(await otherAccount.getAddress())).to.be.reverted;
    });

    it('Should be able to remove a token from this list', async function () {
      const { marketplace, myERC20 } = await loadFixture(deploy);

      await marketplace.AddTokenToWhitelist(await myERC20.getAddress());
      expect(await marketplace.isSupportedERC20(await myERC20.getAddress())).to.be.true;

      await marketplace.RemoveFromWhitelist(await myERC20.getAddress());
      expect(await marketplace.isSupportedERC20(await myERC20.getAddress())).to.be.false;
    });
  });
  describe('Listing', function () {
    it('Should list a NFT correctly', async function () {
      const { marketplace, myERC1155, myERC20, owner } = await loadFixture(deploy);

      expect(await marketplace.getListingPrice(await myERC1155.getAddress(), ownerNftIDs[0])).to.equals(
        defaultListingPrice
      );

      expect(await marketplace.getListingPrice(await myERC1155.getAddress(), otherNftIDs[0])).to.equals(
        defaultListingPrice
      );
    });

    it('Should cancel listing correctly', async () => {
      const { marketplace, myERC1155, myERC20, owner } = await loadFixture(deploy);

      await expect(await marketplace.cancelListing(await myERC1155.getAddress(), ownerNftIDs[0]))
        .to.emit(marketplace, 'CancelListing')
        .withArgs(owner.address, await myERC1155.getAddress(), ownerNftIDs[0]);
    });

    it('Should update listing', async () => {
      const { marketplace, myERC1155, myERC20, owner } = await loadFixture(deploy);
      const newPrice = '1234567';

      await expect(await marketplace.updateListing(await myERC1155.getAddress(), ownerNftIDs[0], newPrice))
        .to.emit(marketplace, 'UpdateListing')
        .withArgs(owner.address, await myERC1155.getAddress(), ownerNftIDs[0], newPrice);

      expect(await marketplace.getListingPrice(await myERC1155.getAddress(), ownerNftIDs[0])).to.equals(newPrice);
    });

    it('Should get NFT owner correctly', async () => {
      const { marketplace, myERC1155, myERC20, owner } = await loadFixture(deploy);

      expect(await marketplace.getNFTOwner(await myERC1155.getAddress(), ownerNftIDs[0])).to.equals(owner.address);
    });

    it('Should not allow listing non-owned NFT', async () => {
      const { marketplace, myERC1155, otherAccount } = await loadFixture(deploy);

      await expect(
        marketplace.connect(otherAccount).listNFT(await myERC1155.getAddress(), ownerNftIDs[1], '100')
      ).to.be.revertedWithCustomError(marketplace, 'NotOwnNFT');
    });

    it('Should not allow double listing of the same NFT', async () => {
      const { marketplace, myERC1155, owner } = await loadFixture(deploy);

      await expect(
        marketplace.listNFT(await myERC1155.getAddress(), ownerNftIDs[0], '200')
      ).to.be.revertedWithCustomError(marketplace, 'NFTAlreadyListed');
    });

    it('Should not allow list nft with zero price', async () => {
      const { marketplace, myERC1155, owner } = await loadFixture(deploy);

      await expect(
        marketplace.listNFT(await myERC1155.getAddress(), ownerNftIDs[1], '0')
      ).to.be.revertedWithCustomError(marketplace, 'ZeroPriceNotAllowed');
    });
  });

  describe('Buy NFT', () => {
    it('Owner buy one nft from other', async () => {
      const { marketplace, myERC1155, myERC20, owner, otherAccount } = await loadFixture(deploy);

      const nftPrice = await marketplace.getListingPrice(await myERC1155.getAddress(), otherNftIDs[0]);

      // owner buy one nft from another

      // allow the contract to access the token and nft
      await myERC20.approve(await marketplace.getAddress(), nftPrice);
      await myERC1155.connect(otherAccount).setApprovalForAll(await marketplace.getAddress(), true);

      await expect(await marketplace.buyItem(await myERC1155.getAddress(), otherNftIDs[0], await myERC20.getAddress()))
        .to.emit(marketplace, 'BuyNFT')
        .withArgs(owner.address, otherAccount.address, await myERC1155.getAddress(), otherNftIDs[0], nftPrice);

      // then
      expect(await marketplace.getNFTOwner(await myERC1155.getAddress(), otherNftIDs[0])).to.equals(owner.address);
      expect(await marketplace.getNFTOwner(await myERC1155.getAddress(), otherNftIDs[0])).to.not.equals(
        otherAccount.address
      );
      expect(await myERC1155.balanceOf(owner.address, otherNftIDs[0])).to.equals(1);
      expect(await myERC1155.balanceOf(otherAccount.address, otherNftIDs[0])).to.equals(0);
    });

    it('Other buy one nft from owner', async () => {
      const { feeRatio, marketplace, myERC1155, myERC20, owner, otherAccount } = await loadFixture(deploy);

      const nftPrice = await marketplace.getListingPrice(await myERC1155.getAddress(), ownerNftIDs[0]);
      const nftPriceInt = parseInt(nftPrice.toString());
      const feeAmount = (nftPriceInt * feeRatio) / 100;

      // owner buy one nft from another

      // allow the contract to access the token and nft
      await myERC20.connect(otherAccount).approve(await marketplace.getAddress(), nftPriceInt);
      await myERC1155.setApprovalForAll(await marketplace.getAddress(), true);

      await expect(
        await marketplace
          .connect(otherAccount)
          .buyItem(await myERC1155.getAddress(), ownerNftIDs[0], await myERC20.getAddress())
      )
        .to.emit(marketplace, 'BuyNFT')
        .withArgs(otherAccount.address, owner.address, await myERC1155.getAddress(), ownerNftIDs[0], nftPriceInt);

      // then
      expect(await marketplace.getNFTOwner(await myERC1155.getAddress(), ownerNftIDs[0])).to.equals(
        otherAccount.address
      );
      expect(await marketplace.getNFTOwner(await myERC1155.getAddress(), ownerNftIDs[0])).to.not.equals(owner.address);
      expect(await myERC1155.balanceOf(owner.address, ownerNftIDs[0])).to.equals(0);
      expect(await myERC1155.balanceOf(otherAccount.address, ownerNftIDs[0])).to.equals(1);
    });

    it('Should not be able to buy unlisted nft', async () => {
      const { marketplace, myERC1155, myERC20, owner, otherAccount } = await loadFixture(deploy);

      const nftPrice = await marketplace.getListingPrice(await myERC1155.getAddress(), ownerNftIDs[0]);

      // allow the contract to access the token and nft
      await myERC20.connect(otherAccount).approve(await marketplace.getAddress(), nftPrice);
      await myERC1155.setApprovalForAll(await marketplace.getAddress(), true);

      await expect(
        marketplace
          .connect(otherAccount)
          .buyItem(await myERC1155.getAddress(), ownerNftIDs[1], await myERC20.getAddress())
      ).to.be.revertedWithCustomError(marketplace, 'NFTNotListed');
    });

    it('Balance deduction and addition should be correct', async () => {
      const { feeRatio, marketplace, myERC1155, myERC20, owner, otherAccount } = await loadFixture(deploy);

      const nftPrice = await marketplace.getListingPrice(await myERC1155.getAddress(), ownerNftIDs[0]);
      const nftPriceInt = parseInt(nftPrice.toString());
      const feeAmount = (nftPriceInt * feeRatio) / 100;

      // owner buy one nft from another

      // allow the contract to access the token and nft
      await myERC20.connect(otherAccount).approve(await marketplace.getAddress(), nftPrice);
      await myERC1155.setApprovalForAll(await marketplace.getAddress(), true);

      await expect(
        await marketplace
          .connect(otherAccount)
          .buyItem(await myERC1155.getAddress(), ownerNftIDs[0], await myERC20.getAddress())
      ).to.changeTokenBalances(
        myERC20,
        [owner, otherAccount, marketplace],
        [nftPriceInt - feeAmount, -nftPrice, feeAmount]
      );
    });
    it('Should reject non-whitelisted token', async () => {
      const { marketplace, myERC1155, someRandomErc20, owner, otherAccount } = await loadFixture(deploy);
      const nftPrice = await marketplace.getListingPrice(await myERC1155.getAddress(), ownerNftIDs[0]);
      // owner buy one nft from another

      // allow the contract to access the token and nft
      await someRandomErc20.connect(otherAccount).approve(await marketplace.getAddress(), nftPrice);
      await myERC1155.setApprovalForAll(await marketplace.getAddress(), true);

      await expect(
        marketplace
          .connect(otherAccount)
          .buyItem(await myERC1155.getAddress(), ownerNftIDs[0], await someRandomErc20.getAddress())
      ).to.be.revertedWithCustomError(marketplace, 'NotSupportedToken');
    });
    it('Should not allow buying own listed NFT', async () => {
      const { marketplace, myERC1155, myERC20, owner } = await loadFixture(deploy);

      const nftPrice = await marketplace.getListingPrice(await myERC1155.getAddress(), ownerNftIDs[0]);

      await myERC20.approve(await marketplace.getAddress(), nftPrice);

      await expect(
        marketplace.buyItem(await myERC1155.getAddress(), ownerNftIDs[0], await myERC20.getAddress())
      ).to.be.revertedWithCustomError(marketplace, 'CannotBuyOwnNFT');
    });

    it('Should fail if buyer has insufficient balance', async () => {
      const { marketplace, myERC1155, myERC20, owner, otherAccount } = await loadFixture(deploy);

      const nftPrice = await marketplace.getListingPrice(await myERC1155.getAddress(), ownerNftIDs[0]);

      // Set balance to 0
      await myERC20.connect(otherAccount).transfer(owner.address, await myERC20.balanceOf(otherAccount.address));

      await myERC20.connect(otherAccount).approve(await marketplace.getAddress(), nftPrice);
      await myERC1155.setApprovalForAll(await marketplace.getAddress(), true);

      await expect(
        marketplace
          .connect(otherAccount)
          .buyItem(await myERC1155.getAddress(), ownerNftIDs[0], await myERC20.getAddress())
      ).to.be.revertedWithCustomError(myERC20, 'ERC20InsufficientBalance');
    });
  });

  describe('Marketplace fees', () => {
    it('Should allow owner to withdraw collected fees', async () => {
      const { marketplace, myERC1155, myERC20, owner, otherAccount } = await loadFixture(deploy);

      const nftPrice = await marketplace.getListingPrice(await myERC1155.getAddress(), ownerNftIDs[0]);

      await myERC20.connect(otherAccount).approve(await marketplace.getAddress(), nftPrice);
      await myERC1155.setApprovalForAll(await marketplace.getAddress(), true);

      await marketplace
        .connect(otherAccount)
        .buyItem(await myERC1155.getAddress(), ownerNftIDs[0], await myERC20.getAddress());

      const feeBalance = await myERC20.balanceOf(await marketplace.getAddress());

      await expect(marketplace.WithdrawFees(await myERC20.getAddress())).to.changeTokenBalances(
        myERC20,
        [marketplace, owner],
        [-feeBalance, feeBalance]
      );
    });

    it('Should not be able to zero balance fee token', async () => {
      const { marketplace, myERC1155, myERC20, someRandomErc20, otherAccount } = await loadFixture(deploy);

      const nftPrice = await marketplace.getListingPrice(await myERC1155.getAddress(), ownerNftIDs[0]);

      await myERC20.connect(otherAccount).approve(await marketplace.getAddress(), nftPrice);
      await myERC1155.setApprovalForAll(await marketplace.getAddress(), true);

      await marketplace
        .connect(otherAccount)
        .buyItem(await myERC1155.getAddress(), ownerNftIDs[0], await myERC20.getAddress());

      await expect(marketplace.WithdrawFees(await myERC20.getAddress())).to.not.reverted;
      await expect(marketplace.WithdrawFees(await someRandomErc20.getAddress())).to.be.revertedWithCustomError(
        marketplace,
        'NoFeeToWithdraw'
      );
    });
  });
});
