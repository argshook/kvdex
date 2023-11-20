import {
  collection,
  kvdex,
  model,
  QueueMessage,
  QueueValue,
} from "../../mod.ts"
import { createHandlerId } from "../../src/utils.ts"
import { assert } from "../deps.ts"
import { sleep, useDb, useKv } from "../utils.ts"

Deno.test("collection - enqueue", async (t) => {
  await t.step("Should enqueue message with string data", async () => {
    await useKv(async (kv) => {
      const data = "data"
      const undeliveredId = "undelivered"

      const db = kvdex(kv, {
        numbers: collection(model<number>()),
      })

      const handlerId = createHandlerId(db.numbers._keys.base, undefined)

      let assertion = false

      const listener = kv.listenQueue((msg) => {
        const qMsg = msg as QueueMessage<QueueValue>
        assertion = qMsg.__handlerId__ === handlerId && qMsg.__data__ === data
      })

      await db.numbers.enqueue(data, {
        idsIfUndelivered: [undeliveredId],
      })

      await sleep(500)

      const undelivered = await db.numbers.findUndelivered(undeliveredId)
      assert(assertion || typeof undelivered?.value === typeof data)

      return async () => await listener
    })
  })

  await t.step("Should enqueue message in correct topic", async () => {
    await useDb(async (db) => {
      const data = "data"
      const undeliveredId = "undelivered"
      const topic = "topic"

      let assertion1 = false
      let assertion2 = true

      const l1 = db.users.listenQueue(() => assertion1 = true, { topic })

      const l2 = db.users.listenQueue(() => assertion2 = false)

      await db.users.enqueue("data", {
        idsIfUndelivered: [undeliveredId],
        topic,
      })

      await sleep(500)

      const undelivered = await db.users.findUndelivered(undeliveredId)
      assert(assertion1 || typeof undelivered?.value === typeof data)
      assert(assertion2)

      return async () => await Promise.all([l1, l2])
    })
  })
})
