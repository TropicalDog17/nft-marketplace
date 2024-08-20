import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const MARKETPLACE_NAME = 'My Marketplace';
const FEE_RATIO: bigint = 5n;
const MarketplaceModule = buildModule('MarketplaceModule', (m) => {
  // Get the deployer's address
  const deployer = m.getAccount(0);

  // Deploy ERC20 token
  const erc20Token = m.contract('MyToken', [deployer]);

  // Deploy ERC1155 token with the deployer as the owner
  const erc1155Token = m.contract('MyERC1155', [deployer]);

  // Get parameters for the marketplace
  const name = m.getParameter('name', MARKETPLACE_NAME);
  const feeRatio = m.getParameter('feeRatio', FEE_RATIO);

  // Deploy marketplace with ERC20 and ERC1155 addresses
  const marketplace = m.contract('NFTMarketplace', [name, feeRatio, erc20Token]);

  return { erc20Token, erc1155Token, marketplace };
});

export default MarketplaceModule;
