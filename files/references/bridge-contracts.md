# Bridge Contract Discovery (Kite -> Base Sepolia)

Last updated: 2026-02-19

This file pins bridge-related constants used by Synoptic V1.

## Pinned From Bridge Frontend Artifacts
Source: `https://bridge.prod.gokite.ai` (inspected bundled app config/ABI).

- Source-chain token adapter (Kite Testnet USDT path): `0xD1bd49F60A6257dC96B3A040e6a1E17296A51375`
- Bridge call signature used by adapter: `send(uint256 _destChainId, address _recipient, uint256 _amount)`
- Destination credit detector event: `Transfer(address indexed from, address indexed to, uint256 value)`

Practical env pin for this V1:
- `KITE_BRIDGE_ROUTER=0xD1bd49F60A6257dC96B3A040e6a1E17296A51375`

## Token Mapping Used In V1
- Kite testnet USDT (source): `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`
- Base Sepolia bUSDT (destination): `0xdAD5b9eB32831D54b7f2D8c92ef4E2A68008989C`
- Base Sepolia bridged KITE: `0xFB9a6AF5C014c32414b4a6e208a89904c6dAe266`

## Manual Trace Evidence (Required For Final Bounty Pack)
Run one tiny bridge and record:
- Source tx hash (Kite explorer): `TODO`
- Destination tx hash (Base Sepolia explorer): `TODO`
- If available, message id / nonce correlation: `TODO`

When these are captured, update this file and mirror them in `/Users/dhiyaan/Code/synoptic/files/bounty/EVIDENCE.md`.
