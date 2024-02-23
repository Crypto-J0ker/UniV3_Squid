import { assertNotNull } from '@subsquid/util-internal'
import { lookupArchive } from '@subsquid/archive-registry'
import {
  BlockHeader,
  DataHandlerContext,
  EvmBatchProcessor,
  EvmBatchProcessorFields,
  Log as _Log,
  Transaction as _Transaction,
} from '@subsquid/evm-processor'
import * as pool from './abi/pool'
import * as factory from './abi/factory'
import { Store } from '@subsquid/typeorm-store'

export const FACTORY_ADDRESS = '0x1f98431c8ad98523631ae4a59f267346ea31f984'

export const processor = new EvmBatchProcessor()
  .setGateway(lookupArchive('eth-mainnet'))
  .setRpcEndpoint({
    url: assertNotNull(process.env.RPC_ENDPOINT),
    rateLimit: 10,
  })
  .setFinalityConfirmation(75)
  .setFields({
    transaction: {
      from: true,
      value: true,
      hash: true,
    },
    log: {
      data: true,
      topics: true,
    },
  })
  .setBlockRange({
    from: 12_000_000,
  })
  .addLog({
    address: [FACTORY_ADDRESS],
    topic0: [factory.events.PoolCreated.topic],
  })
  .addLog({
    topic0: [pool.events.Swap.topic],
    transaction: true,
  })

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
export type Context = DataHandlerContext<Store, Fields>
