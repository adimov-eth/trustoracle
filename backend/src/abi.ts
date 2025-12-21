export const oracleAbi = [
  {
    type: "function",
    name: "walletStatus",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      { name: "riskLevel", type: "uint8" },
      { name: "validUntil", type: "uint40" },
      { name: "lastUpdated", type: "uint40" },
      { name: "countryCode", type: "bytes2" }
    ]
  },
  {
    type: "function",
    name: "authNonces",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "nonce", type: "uint256" }]
  },
  {
    type: "function",
    name: "setWalletStatus",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "riskLevel", type: "uint8" },
      { name: "validUntil", type: "uint40" },
      { name: "countryCode", type: "bytes2" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setWalletStatusBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallets", type: "address[]" },
      { name: "riskLevels", type: "uint8[]" },
      { name: "validUntils", type: "uint40[]" },
      { name: "countryCodes", type: "bytes2[]" }
    ],
    outputs: []
  }
] as const;
