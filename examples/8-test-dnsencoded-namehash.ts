import { setup } from '../helpers/utils.js';

async function main() {
    const { foundry } = await setup();

    // Deploy a simplified version of CrossChainResolver just for testing namehash
    const Resolver = await foundry.deploy({
        sol: `
            contract CrossChainResolver {
                function namehash(bytes calldata name) external pure returns (bytes32) {
                    bytes32 node = 0;
                    
                    // First pass: collect label positions
                    uint256[] memory labelPositions = new uint256[](32); // Max 32 labels
                    uint256 labelCount = 0;
                    
                    uint256 i = 0;
                    while (i < name.length) {
                        labelPositions[labelCount] = i;
                        labelCount++;
                        
                        uint256 labelLen = uint8(name[i]);
                        i += 1 + labelLen;
                        require(i <= name.length, "Invalid label length");
                    }
                    
                    // Second pass: process labels right to left
                    for (uint256 j = labelCount; j > 0; j--) {
                        i = labelPositions[j-1];
                        uint256 labelLen = uint8(name[i]);
                        i += 1; // Move past length byte
                        
                        // Hash the label and combine with the previous result
                        node = keccak256(abi.encodePacked(
                            node,
                            keccak256(name[i:i+labelLen])
                        ));
                    }
                    
                    return node;
                }
            }
        `
    });

    // Test cases
    const testCases = [
        {
            name: "eth",
            encoded: "0x03657468",  // length 3, then "eth"
            expected: "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae"
        },
        {
            name: "ens.eth",
            encoded: "0x03656e7303657468", // length 3, "ens", length 3, "eth"
            expected: "0x4e34d3a81dc3a20f71bbdf2160492ddaa17ee7e5523757d47153379c13cb46df"
        }
    ];

    for (const test of testCases) {
        console.log(`\nTesting namehash for "${test.name}":`);
        console.log('Input bytes:', test.encoded);
        
        const result = await Resolver.namehash(test.encoded);
        console.log('Result:  ', result);
        console.log('Expected:', test.expected);
        console.log('Matches:', result === test.expected);
    }

    foundry.shutdown();
}

main().then(() => console.log('Example ran successfully!')); 