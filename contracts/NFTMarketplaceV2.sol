// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract NFTMarketplaceV2 is Ownable(msg.sender), Initializable {
    mapping(address => mapping(uint256 => uint256)) prices;
    mapping(address => mapping(uint256 => address)) owners;
    mapping(address => bool) acceptedErc20;

    event ListNFT(address indexed owner, address indexed nftAddress, uint256 tokenId, uint256 price);
    event BuyNFT(
        address indexed buyer, address indexed seller, address indexed nftAddress, uint256 tokenId, uint256 price
    );
    event UpdateListing(address indexed owner, address indexed nftAddress, uint256 tokenId, uint256 price);
    event CancelListing(address indexed owner, address indexed nftAddress, uint256 tokenId);
    event WhitelistToken(address indexed token);
    event UnWhitelistToken(address indexed token);

    error NotOwnNFT();
    error NFTNotListed();
    error NotSupportedToken();
    error CannotBuyOwnNFT();
    error NFTAlreadyListed();
    error ZeroPriceNotAllowed();
    error NoFeeToWithdraw();

    string public name;

    uint16 public feeRatio;

    function initialize(string memory _name, uint16 _feeRatio, address _erc20Token) public initializer {
        name = _name;
        feeRatio = _feeRatio;
        acceptedErc20[_erc20Token] = true;
    }

    function listNFT(address nftAddress, uint256 tokenId, uint256 price) external isNFTOwner(nftAddress, tokenId) {
        if (prices[nftAddress][tokenId] != 0) {
            revert NFTAlreadyListed();
        }
        if (price == 0) {
            revert ZeroPriceNotAllowed();
        }
        prices[nftAddress][tokenId] = price;
        owners[nftAddress][tokenId] = msg.sender;
        emit ListNFT(msg.sender, nftAddress, tokenId, price);
    }

    function updateListing(address nftAddress, uint256 tokenId, uint256 price)
        external
        isNFTOwner(nftAddress, tokenId)
        listedNFT(nftAddress, tokenId)
    {
        // if not owner of this nft then can't update listing
        IERC1155 nft = IERC1155(nftAddress);

        bool ownNft = nft.balanceOf(msg.sender, tokenId) == 1;
        if (!ownNft) {
            revert NotOwnNFT();
        }

        if (prices[nftAddress][tokenId] == 0) {
            revert NFTNotListed();
        }

        prices[nftAddress][tokenId] = price;

        emit UpdateListing(msg.sender, nftAddress, tokenId, price);
    }

    function cancelListing(address nftAddress, uint256 tokenId)
        external
        isNFTOwner(nftAddress, tokenId)
        listedNFT(nftAddress, tokenId)
    {
        prices[nftAddress][tokenId] = 0;
        emit CancelListing(msg.sender, nftAddress, tokenId);
    }

    // function withdrawProceeds() external {}

    function getListingPrice(address nftAddress, uint256 tokenId)
        external
        view
        listedNFT(nftAddress, tokenId)
        returns (uint256)
    {
        return _getListingPrice(nftAddress, tokenId);
    }

    function _getListingPrice(address nftAddress, uint256 tokenId)
        internal
        view
        listedNFT(nftAddress, tokenId)
        returns (uint256)
    {
        return prices[nftAddress][tokenId];
    }

    /**
     * @dev allowance should be greater or equals to nft price;
     */
    function buyItem(address nftAddress, uint256 tokenId, address paymentToken)
        external
        payable
        listedNFT(nftAddress, tokenId)
        acceptedToken(paymentToken)
    {
        IERC20 _token = IERC20(paymentToken);
        IERC1155 _nft = IERC1155(nftAddress);
        uint256 nftPrice = _getListingPrice(nftAddress, tokenId);

        address nftOwner = getNFTOwner(nftAddress, tokenId);
        if (msg.sender == nftOwner) {
            revert CannotBuyOwnNFT();
        }
        // transfer the nft to buyer
        _nft.safeTransferFrom(nftOwner, msg.sender, tokenId, 1, "");

        // send the erc20 to seller
        uint256 feeAmount = nftPrice * feeRatio / 100;
        uint256 afterFeeDeductedAmount = nftPrice - feeAmount;
        _token.transferFrom(msg.sender, nftOwner, afterFeeDeductedAmount);
        _token.transferFrom(msg.sender, address(this), feeAmount);

        // update the mapping on contract
        _transferNFTOwnership(msg.sender, nftAddress, tokenId);
        // emit event
        emit BuyNFT(msg.sender, nftOwner, nftAddress, tokenId, nftPrice);
    }

    function getNFTOwner(address nftAddress, uint256 tokenId)
        public
        view
        listedNFT(nftAddress, tokenId)
        returns (address)
    {
        return owners[nftAddress][tokenId];
    }

    function _transferNFTOwnership(address _to, address nftAddress, uint256 tokenId)
        internal
        isNFTOwner(nftAddress, tokenId)
        listedNFT(nftAddress, tokenId)
    {
        owners[nftAddress][tokenId] = _to;
    }

    /**
     * @dev add a token to the list of supported tokens.
     */
    function AddTokenToWhitelist(address _token) external onlyOwner isERC20(_token) {
        acceptedErc20[_token] = true;

        emit WhitelistToken(_token);
    }

    /**
     * check if an ERC20 token is supported in this marketplace
     */
    function isSupportedERC20(address _token) external view isERC20(_token) returns (bool) {
        return acceptedErc20[_token];
    }

    /**
     * @dev remove a token from the list of supported tokens
     */
    function RemoveFromWhitelist(address _token) external {
        acceptedErc20[_token] = false;
        emit UnWhitelistToken(_token);
    }

    function setFeeRatio(uint8 _feeRatio) external onlyOwner {
        feeRatio = _feeRatio;
    }

    /**
     * @dev withdraw choosen token to the owner address
     */
    function WithdrawFees(address _token) external onlyOwner {
        IERC20 token = IERC20(_token);
        address owner = this.owner();
        uint256 amount = token.balanceOf(address(this));
        if (amount == 0) {
            revert NoFeeToWithdraw();
        }
        token.transfer(owner, amount);
    }

    function setName(string memory _name) external {
        name = _name;
    }

    modifier isNFTOwner(address nftAddress, uint256 tokenId) {
        // if not owner of this nft then can't update listing
        IERC1155 nft = IERC1155(nftAddress);

        bool ownNft = nft.balanceOf(msg.sender, tokenId) == 1;
        if (!ownNft) {
            revert NotOwnNFT();
        }
        _;
    }

    modifier listedNFT(address nftAddress, uint256 tokenId) {
        if (prices[nftAddress][tokenId] == 0) {
            revert NFTNotListed();
        }
        _;
    }

    modifier acceptedToken(address erc20Token) {
        if (acceptedErc20[erc20Token] != true) {
            revert NotSupportedToken();
        }
        _;
    }

    /**
     * @dev     sanity check for ERC20
     */
    modifier isERC20(address _token) {
        IERC20 token = IERC20(_token);
        if (IERC20(token).balanceOf(address(this)) < 0) {
            revert("Address is not an erc20 token");
        }
        _;
    }
}
