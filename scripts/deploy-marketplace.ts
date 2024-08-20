// scripts/create-box.js
import { ethers, upgrades } from 'hardhat';

async function main() {
  const Marketplace = await ethers.getContractFactory('NFTMarketplace');
  const marketplace = await upgrades.deployProxy(Marketplace, [42]);
  await marketplace.waitForDeployment();
  console.log('Box deployed to:', await marketplace.getAddress());
}
main();
