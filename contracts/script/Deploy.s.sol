// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.28 <0.9.0;

// Base
import {Script} from "lib/forge-std/src/Script.sol";
import {StdUtils} from "lib/forge-std/src/StdUtils.sol";

// Targets
import {Bot2048} from "src/Bot2048.sol";

contract Deploy is StdUtils, Script {
    uint256 internal deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

    function run() public returns (address gameContract) {
        require(block.chainid == 677 || block.chainid == 968, "Expected BOT Chain");

        vm.startBroadcast(deployerPrivateKey);
        gameContract = address(new Bot2048());
        vm.stopBroadcast();
    }
}
