import { parseAbiItem } from "viem";

import { config } from "../config";
import { publicClient } from "../lib/blockchain";
import {
  getLastSyncedBlock,
  getEventCount,
  insertEvent,
  setLastSyncedBlock,
  upsertWallet
} from "../lib/db";

const WALLET_STATUS_UPDATED_EVENT = parseAbiItem(
  "event WalletStatusUpdated(address indexed wallet, uint8 riskLevel, uint40 validUntil, bytes2 countryCode)"
);

// Track indexer status for health checks
let latestIndexedBlock = 0;

export function getIndexerStatus(): { latestBlock: number; eventsCount: number } {
  return {
    latestBlock: latestIndexedBlock || getLastSyncedBlock(),
    eventsCount: getEventCount()
  };
}

export async function startIndexer(): Promise<void> {
  if (!config.oracleAddress) {
    console.warn("Indexer disabled: ORACLE_ADDRESS not configured.");
    return;
  }

  try {
    await syncHistoricalEvents();
    watchNewEvents();
  } catch (error) {
    console.error("Indexer failed to start.", error);
  }
}

async function syncHistoricalEvents(): Promise<void> {
  const currentBlock = await publicClient.getBlockNumber();
  const lastSynced = getLastSyncedBlock();

  let fromBlock = lastSynced > 0 ? BigInt(lastSynced) : BigInt(config.indexerStartBlock);
  if (fromBlock == 0n) {
    fromBlock = currentBlock;
  }

  if (fromBlock > currentBlock) {
    return;
  }

  const batchSize = 10_000n;
  let processed = 0;

  while (fromBlock <= currentBlock) {
    const toBlock = fromBlock + batchSize > currentBlock ? currentBlock : fromBlock + batchSize;

    const logs = await publicClient.getLogs({
      address: config.oracleAddress,
      event: WALLET_STATUS_UPDATED_EVENT,
      fromBlock,
      toBlock
    });

    for (const log of logs) {
      await processEvent(log);
      processed += 1;
    }

    setLastSyncedBlock(Number(toBlock));
    latestIndexedBlock = Number(toBlock);
    fromBlock = toBlock + 1n;
  }

  if (processed > 0) {
    console.log(`Indexer synced ${processed} status events.`);
  }
}

function watchNewEvents(): void {
  publicClient.watchEvent({
    address: config.oracleAddress,
    event: WALLET_STATUS_UPDATED_EVENT,
    poll: true,
    pollingInterval: config.indexerPollInterval,
    onLogs: async (logs) => {
      for (const log of logs) {
        await processEvent(log);
        if (log.blockNumber) {
          setLastSyncedBlock(Number(log.blockNumber));
          latestIndexedBlock = Number(log.blockNumber);
        }
      }
    }
  });
}

async function processEvent(log: {
  args: {
    wallet: `0x${string}`;
    riskLevel: number;
    validUntil: number;
    countryCode: `0x${string}`;
  };
  blockNumber?: bigint;
  transactionHash?: `0x${string}`;
}): Promise<void> {
  if (!log.blockNumber || !log.transactionHash) {
    return;
  }

  const { wallet, riskLevel, validUntil, countryCode } = log.args;
  const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
  const timestamp = Number(block.timestamp);

  const normalizedAddress = wallet.toLowerCase();
  const normalizedCountry = bytes2ToString(countryCode).toUpperCase();

  upsertWallet({
    address: normalizedAddress,
    risk_level: Number(riskLevel),
    valid_until: Number(validUntil),
    last_updated: timestamp,
    country_code: normalizedCountry,
    first_seen: timestamp,
    update_count: 1
  });

  insertEvent({
    wallet_address: normalizedAddress,
    risk_level: Number(riskLevel),
    valid_until: Number(validUntil),
    country_code: normalizedCountry,
    block_number: Number(log.blockNumber),
    transaction_hash: log.transactionHash,
    timestamp
  });
}

function bytes2ToString(value: `0x${string}`): string {
  const hex = value.replace(/^0x/, "");
  if (!hex) return "";
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)?.map((pair) => parseInt(pair, 16)) ?? []
  );
  return new TextDecoder().decode(bytes).replace(/\u0000/g, "");
}
