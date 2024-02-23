import { TypeormDatabase } from '@subsquid/typeorm-store'
import { Swap, Pool } from './model'
import {
  processor,
  Block,
  Log,
  Context,
  Transaction,
  FACTORY_ADDRESS,
} from './processor'
import * as poolAbi from './abi/pool'
import * as factoryAbi from './abi/factory'
import { In } from 'typeorm'
import { assertNotNull } from '@subsquid/evm-processor'

interface PoolData {
  id: string
  token0: string
  token1: string
}

interface SwapData {
  id: string
  block: Block
  transaction: Transaction
  pool: string
  amount0: bigint
  amount1: bigint
  recipient: string
  sender: string
}

let factoryPools = new Set<string>()

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async ctx => {
  if (!factoryPools) {
    factoryPools = await ctx.store
      .findBy(Pool, {})
      .then(pools => new Set(pools.map(pool => pool.id)))
  }

  let swapsData: SwapData[] = []
  let poolsData: PoolData[] = []

  for (let block of ctx.blocks) {
    for (let log of block.logs) {
      if (
        log.topics[0] == factoryAbi.events.PoolCreated.topic &&
        log.address === FACTORY_ADDRESS
      ) {
        let poolData = getPoolData(log)
        poolsData.push(poolData)
      }
      if (
        log.topics[0] == poolAbi.events.Swap.topic &&
        factoryPools.has(log.address)
      ) {
        let swapData = getSwapData(log)
        swapsData.push(swapData)
      }
    }
  }
  await savePools(ctx, poolsData)
  await saveSwaps(ctx, swapsData)
})

function getPoolData(log: Log): PoolData {
  let event = factoryAbi.events.PoolCreated.decode(log)
  return {
    id: event.pool.toLowerCase(),
    token0: event.token0.toLowerCase(),
    token1: event.token1.toLowerCase(),
  }
}

function getSwapData(log: Log): SwapData {
  let transaction = assertNotNull(
    log.transaction,
    'Swap log without transaction'
  )
  let event = poolAbi.events.Swap.decode(log)
  return {
    id: log.id,
    block: log.block,
    transaction,
    pool: log.address.toLowerCase(),
    amount0: event.amount0,
    amount1: event.amount1,
    recipient: event.recipient.toLowerCase(),
    sender: event.sender.toLowerCase(),
  }
}

async function savePools(ctx: Context, poolsData: PoolData[]) {
  let pools: Pool[] = []
  for (let data of poolsData) {
    let pool = new Pool({
      id: data.id,
      token0: data.token0,
      token1: data.token1,
    })
    pools.push(pool)
    factoryPools.add(data.id)
  }
  await ctx.store.save(pools)
}

async function saveSwaps(ctx: Context, swapsData: SwapData[]) {
  let poolIds = new Set<string>()
  for (let data of swapsData) {
    poolIds.add(data.pool)
  }
  let pools = await ctx.store.findBy(Pool, { id: In([...poolIds]) })
  let poolMap: Map<string, Pool> = new Map(pools.map(pool => [pool.id, pool]))

  let swaps: Swap[] = []
  for (let data of swapsData) {
    let { id, block, transaction, pool, amount0, amount1, recipient, sender } =
      data
    let poolEntity = assertNotNull(poolMap.get(pool))
    let swap = new Swap({
      id,
      blockNumber: block.height,
      timestamp: new Date(block.timestamp),
      hash: transaction.hash,
      pool: poolEntity,
      amount0,
      amount1,
      recipient,
      sender,
    })
    swaps.push(swap)
  }
  await ctx.store.save(swaps)
}
