import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { proxyModule } from './ProxyModule';
const upgradeModule = buildModule('UpgradeModule', (m) => {
  const proxyAdminOwner = m.getAccount(0);

  const { proxyAdmin, proxy } = m.useModule(proxyModule);

  const nftV2 = m.contract('NFTMarketplaceV2');

  const encodedFunctionCall = m.encodeFunctionCall(nftV2, 'setName', ['V2V2V2']);

  m.call(proxyAdmin, 'upgradeAndCall', [proxy, nftV2, encodedFunctionCall], {
    from: proxyAdminOwner
  });

  return { proxyAdmin, proxy };
});
export default upgradeModule;
