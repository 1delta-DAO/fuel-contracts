#!/bin/bash

set -ex

mkdir -p tmp_abis
cd tmp_abis

echo "Fetching latest Swaylend sources"
git clone git@github.com:Swaylend/swaylend-monorepo.git

echo "Building Swaylend"

cd swaylend-monorepo/contracts/market
forc build --release

cd ../../../..

rm -rf fixtures/swaylend

mkdir -p fixtures/swaylend

mv -f tmp_abis/swaylend-monorepo/contracts/market/out/release/* fixtures/swaylend

rm -rf tmp_abis
