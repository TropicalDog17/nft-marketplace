// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.24;
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

contract NFTMarketplace {
    mapping(address => mapping(uint256 => uint256)) prices;
    mapping(address => mapping(address => uint256)) owners;

    error NotOwnNFT();
    error NFTNotListed();
    function listNFT(
        address nftAddress,
        uint256 tokenId,
        uint256 price
    ) external {
        prices[nftAddress][tokenId] = price;
    }

    function updateListing(
        address nftAddress,
        uint256 tokenId,
        uint256 price
    ) external {
        // if not owner of this nft then can't update listing.abi
        IERC1155 nft = IERC1155(nftAddress);

        bool ownNft = nft.balanceOf(nftAddress, tokenId) == 1;
        if (!ownNft){
            revert NotOwnNFT();
        }

        if (prices[nftAddress][tokenId] == 0){
            revert NFTNotListed();
        }

        prices[nftAddress][tokenId] = price;
    }

    function cancelListing(address nftAddress, uint256 tokenId) external {}

    function withdrawProceeds() external {}

    function getListing(address nftAddress, uint256 tokenId) external view {}

    function buyItem(address nftAddress, uint256 tokenId) external payable {}

    function setPurchaseToken(address token) external {}
}
