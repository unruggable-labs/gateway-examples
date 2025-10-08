import { GatewayRequest } from '@unruggable/gateways';
import { setup } from '../helpers/utils.js';
import { toUtf8String } from 'ethers';

async function main() {
    const { foundry, prover } = await setup();

    // Deploy L2ProfileStorage contract
    const L2Storage = await foundry.deploy({
        sol: `
            contract L2ProfileStorage {
                // Profile data structure
                struct Profile {
                    address owner;
                    mapping(string => string) textRecords;
                    string[] textKeys;
                    mapping(uint256 => bytes) addresses;
                    uint256[] coinTypes;
                }
                
                mapping(bytes32 => Profile) private profiles;    // Slot 0
                mapping(bytes32 => bytes32) private nodeProfiles;  // Slot 1
                
                function setText(bytes32 profileId, string calldata key, string calldata value) external {
                    Profile storage profile = profiles[profileId];
                    if (profile.owner == address(0)) {
                        profile.owner = msg.sender;
                    }
                    profile.textRecords[key] = value;
                    profile.textKeys.push(key);
                }

                function setAddr(bytes32 profileId, uint256 coinType, bytes calldata newAddr) external {
                    Profile storage profile = profiles[profileId];
                    if (profile.owner == address(0)) {
                        profile.owner = msg.sender;
                    }
                    profile.addresses[coinType] = newAddr;
                    profile.coinTypes.push(coinType);
                }

                function assignProfileToNode(bytes32 node, bytes32 profileId) external {
                    require(profiles[profileId].owner == msg.sender, "Not profile owner");
                    nodeProfiles[node] = profileId;
                }
            }
        `
    });

    // Set up test data
    const TEST_NODE = '0x0000000000000000000000000000000000000000000000000000000000000001';
    const PROFILE_ID = '0x0000000000000000000000000000000000000000000000000000000000000002';
    const ETH_ADDRESS = '0x1234567890123456789012345678901234567890';

    // Set up profile data on L2
    await foundry.confirm(L2Storage.setAddr(PROFILE_ID, 60, ETH_ADDRESS));
    await foundry.confirm(L2Storage.assignProfileToNode(TEST_NODE, PROFILE_ID));

    const P = await prover();

    // Demonstrate the gateway request pattern used by L1 resolver to read ETH address
    console.log('\nDemonstrating L1 resolver gateway request pattern:');
    console.log('Reading ETH address for node:', TEST_NODE);
    
    const request = new GatewayRequest(4)
        .setTarget(L2Storage.target)
        // Start at nodeProfiles mapping (slot 1)
        .setSlot(1)
        // Use TEST_NODE as key to get profileId
        .push(TEST_NODE)
        .follow()
        .read()
        .setOutput(0)
        // Use returned profileId to look up in profiles mapping (slot 0)
        .pushOutput(0)
        .setSlot(0)
        .follow()
        // Navigate to addresses mapping in Profile struct (offset 3)
        .offset(3)
        // Use coin type 60 (ETH) as key
        .push(60)
        .follow()
        .readBytes()
        .setOutput(1);

    const { vOutputs } = await P.prove(request);
    console.log('Profile ID:', vOutputs[0]);
    console.log('ETH Address:', vOutputs[1]);

    foundry.shutdown();
}

main().then(() => console.log('Example ran successfully!')); 