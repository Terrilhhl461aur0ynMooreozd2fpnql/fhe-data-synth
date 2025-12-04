// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SyntheticDataFHE is SepoliaConfig {
    struct EncryptedDataset {
        uint256 id;
        euint32 encryptedStats;    // Encrypted statistical features
        euint32 encryptedModel;    // Encrypted model parameters
        euint32 encryptedMetadata; // Encrypted metadata
        uint256 timestamp;
    }
    
    struct DecryptedDataset {
        string stats;
        string model;
        string metadata;
        bool isRevealed;
    }

    uint256 public datasetCount;
    mapping(uint256 => EncryptedDataset) public encryptedDatasets;
    mapping(uint256 => DecryptedDataset) public decryptedDatasets;

    mapping(string => euint32) private encryptedDatasetTypeCount;
    string[] private datasetTypeList;

    mapping(uint256 => uint256) private requestToDatasetId;

    event DatasetSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event DatasetDecrypted(uint256 indexed id);

    modifier onlyOwner(uint256 datasetId) {
        _;
    }

    function submitEncryptedDataset(
        euint32 encryptedStats,
        euint32 encryptedModel,
        euint32 encryptedMetadata
    ) public {
        datasetCount += 1;
        uint256 newId = datasetCount;

        encryptedDatasets[newId] = EncryptedDataset({
            id: newId,
            encryptedStats: encryptedStats,
            encryptedModel: encryptedModel,
            encryptedMetadata: encryptedMetadata,
            timestamp: block.timestamp
        });

        decryptedDatasets[newId] = DecryptedDataset({
            stats: "",
            model: "",
            metadata: "",
            isRevealed: false
        });

        emit DatasetSubmitted(newId, block.timestamp);
    }

    function requestDatasetDecryption(uint256 datasetId) public onlyOwner(datasetId) {
        EncryptedDataset storage dataset = encryptedDatasets[datasetId];
        require(!decryptedDatasets[datasetId].isRevealed, "Already decrypted");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(dataset.encryptedStats);
        ciphertexts[1] = FHE.toBytes32(dataset.encryptedModel);
        ciphertexts[2] = FHE.toBytes32(dataset.encryptedMetadata);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptDataset.selector);
        requestToDatasetId[reqId] = datasetId;

        emit DecryptionRequested(datasetId);
    }

    function decryptDataset(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 datasetId = requestToDatasetId[requestId];
        require(datasetId != 0, "Invalid request");

        EncryptedDataset storage eDataset = encryptedDatasets[datasetId];
        DecryptedDataset storage dDataset = decryptedDatasets[datasetId];
        require(!dDataset.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));

        dDataset.stats = results[0];
        dDataset.model = results[1];
        dDataset.metadata = results[2];
        dDataset.isRevealed = true;

        if (!FHE.isInitialized(encryptedDatasetTypeCount[dDataset.metadata])) {
            encryptedDatasetTypeCount[dDataset.metadata] = FHE.asEuint32(0);
            datasetTypeList.push(dDataset.metadata);
        }
        encryptedDatasetTypeCount[dDataset.metadata] = FHE.add(
            encryptedDatasetTypeCount[dDataset.metadata],
            FHE.asEuint32(1)
        );

        emit DatasetDecrypted(datasetId);
    }

    function getDecryptedDataset(uint256 datasetId) public view returns (
        string memory stats,
        string memory model,
        string memory metadata,
        bool isRevealed
    ) {
        DecryptedDataset storage d = decryptedDatasets[datasetId];
        return (d.stats, d.model, d.metadata, d.isRevealed);
    }

    function getEncryptedDatasetTypeCount(string memory datasetType) public view returns (euint32) {
        return encryptedDatasetTypeCount[datasetType];
    }

    function requestDatasetTypeCountDecryption(string memory datasetType) public {
        euint32 count = encryptedDatasetTypeCount[datasetType];
        require(FHE.isInitialized(count), "Type not found");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptDatasetTypeCount.selector);
        requestToDatasetId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(datasetType)));
    }

    function decryptDatasetTypeCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 typeHash = requestToDatasetId[requestId];
        string memory datasetType = getDatasetTypeFromHash(typeHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
    }

    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }

    function getDatasetTypeFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < datasetTypeList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(datasetTypeList[i]))) == hash) {
                return datasetTypeList[i];
            }
        }
        revert("Type not found");
    }
}
