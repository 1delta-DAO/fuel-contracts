import { createConfig } from 'fuels';
import { PRIVATE_KEY, RPC } from "./env"

export default createConfig({
  contracts: [
    "./contracts/logger"
  ],
  scripts: [
    // "./scripts/batch_swap_exact_in_script",
    // "./scripts/batch_swap_exact_out_script",
    "./scripts/composer_script"
  ],
  output: './ts-scripts/sway_abis',
  forcBuildFlags: ['--release'],
  privateKey: PRIVATE_KEY ?? "0x001",
  providerUrl: RPC ?? "https://testnet.fuel.network/v1/graphql"
  // providerUrl: "https://devnet.fuel.network/v1/graphql"
});
