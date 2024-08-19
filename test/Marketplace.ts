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
    const Marketplace = await hre.ethers.getContractFactory('NFTMarketplace');
    const marketplace = await Marketplace.deploy(name, feeRatio);

    const MyERC1155 = await hre.ethers.getContractFactory('MyErc1155');
    const myERC1155 = await MyERC1155.deploy(owner.address);

    // premint some nfts for both owner and other
    await myERC1155.mintBatch(owner.address, ownerNftIDs, ['1', '1', '1'], emptyData);
    await myERC1155.mintBatch(otherAccount.address, otherNftIDs, ['1', '1', '1'], emptyData);

    const MyERC20 = await hre.ethers.getContractFactory('MyToken');
    const myERC20 = await MyERC20.deploy(owner.address);

    // premint some erc20 token for both owner and other
    await myERC20.mint(owner.address, '100000000');
    await myERC20.mint(otherAccount.address, '100000000');

    // initially list a nft for owner and other
    await marketplace.listNFT(await myERC1155.getAddress(), ownerNftIDs[0], defaultListingPrice);
    await marketplace.connect(otherAccount).listNFT(await myERC1155.getAddress(), otherNftIDs[0], defaultListingPrice);

    return { feeRatio, owner, otherAccount, marketplace, myERC20, myERC1155 };
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

      await marketplace.addPurchaseToken(await myERC20.getAddress());
      expect(await marketplace.isSupportedERC20(await myERC20.getAddress())).to.be.true;
    });

    it('Should reject nonERC20 token', async function () {
      const { otherAccount, marketplace } = await loadFixture(deploy);

      await expect(marketplace.addPurchaseToken(await otherAccount.getAddress())).to.be.reverted;
    });

    it('Should be able to remove a token from this list', async function () {
      const { marketplace, myERC20 } = await loadFixture(deploy);

      await marketplace.addPurchaseToken(await myERC20.getAddress());
      expect(await marketplace.isSupportedERC20(await myERC20.getAddress())).to.be.true;

      await marketplace.removePurchaseToken(await myERC20.getAddress());
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
      const { marketplace, myERC1155, myERC20, owner, otherAccount } = await loadFixture(deploy);

      const nftPrice = await marketplace.getListingPrice(await myERC1155.getAddress(), ownerNftIDs[0]);

      // owner buy one nft from another

      // allow the contract to access the token and nft
      await myERC20.connect(otherAccount).approve(await marketplace.getAddress(), nftPrice);
      await myERC1155.setApprovalForAll(await marketplace.getAddress(), true);

      await expect(
        await marketplace
          .connect(otherAccount)
          .buyItem(await myERC1155.getAddress(), ownerNftIDs[0], await myERC20.getAddress())
      )
        .to.emit(marketplace, 'BuyNFT')
        .withArgs(otherAccount.address, owner.address, await myERC1155.getAddress(), ownerNftIDs[0], nftPrice);

      // then
      expect(await marketplace.getNFTOwner(await myERC1155.getAddress(), ownerNftIDs[0])).to.equals(
        otherAccount.address
      );
      expect(await marketplace.getNFTOwner(await myERC1155.getAddress(), ownerNftIDs[0])).to.not.equals(owner.address);
      expect(await myERC1155.balanceOf(owner.address, ownerNftIDs[0])).to.equals(0);
      expect(await myERC1155.balanceOf(otherAccount.address, ownerNftIDs[0])).to.equals(1);
    });
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
    ).to.be.reverted;
  });
});
