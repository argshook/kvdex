import { assert } from "jsr:@std/assert@0.215/assert"
import { generateUsers } from "../utils.ts"
import { useDb } from "../utils.ts"

Deno.test("indexable_collection - count", async (t) => {
  await t.step(
    "Should correctly count total number of documents in the collection",
    async () => {
      await useDb(async (db) => {
        const count1 = await db.i_users.count()
        assert(count1 === 0)

        const users = generateUsers(1_000)
        const cr = await db.i_users.addMany(users)
        assert(cr.ok)

        const count2 = await db.i_users.count()
        assert(count2 === users.length)
      })
    },
  )
})
