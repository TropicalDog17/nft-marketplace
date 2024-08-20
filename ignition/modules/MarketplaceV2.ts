import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import upgradeModule from './UpgradeModule';
const NftV2Module = buildModule('NftV2Module', (m) => {
  const { proxy } = m.useModule(upgradeModule);

  const demo = m.contractAt('NFTMarketplaceV2', proxy);

  return { demo };
});

export default NftV2Module;
