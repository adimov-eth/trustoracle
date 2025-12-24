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
    name: "checkTransfer",
    stateMutability: "view",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [
      { name: "allowed", type: "bool" },
      { name: "reason", type: "string" }
    ]
  }
] as const;

export const tokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }]
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "success", type: "bool" }]
  },
  {
    type: "function",
    name: "cancelTransfer",
    stateMutability: "nonpayable",
    inputs: [{ name: "transferId", type: "bytes32" }],
    outputs: []
  }
] as const;
