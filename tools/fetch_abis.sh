#!/bin/bash

set -ex

mkdir -p tmp_abis
cd tmp_abis

echo "Fetching latest Mira v1 core sources"
git clone git@github.com:mira-amm/mira-v1-core.git

echo "Building Mira v1 core"

cd mira-v1-core
forc build --release

cd ../..

rm -rf fixtures/mira-amm

mkdir -p fixtures/mira-amm

mv -f tmp_abis/mira-v1-core/contracts/mira_amm_contract/out/release/* fixtures/mira-amm

rm -rf tmp_abis
