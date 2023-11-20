import { collection, Document, kvdex, model } from "../../mod.ts"
import {
  ID_KEY_PREFIX,
  KVDEX_KEY_PREFIX,
  PRIMARY_INDEX_KEY_PREFIX,
  SECONDARY_INDEX_KEY_PREFIX,
} from "../../src/constants.ts"
import { extendKey, keyEq } from "../../src/utils.ts"
import { assert } from "../deps.ts"
import { User } from "../models.ts"
import { generateLargeUsers, useDb, useKv } from "../utils.ts"

const [user] = generateLargeUsers(1)

Deno.test("serialized_indexable_collection - properties", async (t) => {
  await t.step("Keys should have the correct prefixes", async () => {
    await useDb((db) => {
      const baseKey = db.is_users._keys.base
      const idKey = db.is_users._keys.id
      const primaryIndexKey = db.is_users._keys.primaryIndex
      const secondaryIndexKey = db.is_users._keys.secondaryIndex
      const prefix = extendKey([KVDEX_KEY_PREFIX], "is_users")

      assert(keyEq(baseKey, prefix))
      assert(keyEq(idKey, extendKey(prefix, ID_KEY_PREFIX)))
      assert(
        keyEq(primaryIndexKey, extendKey(prefix, PRIMARY_INDEX_KEY_PREFIX)),
      )
      assert(
        keyEq(secondaryIndexKey, extendKey(prefix, SECONDARY_INDEX_KEY_PREFIX)),
      )
    })
  })

  await t.step("Should generate ids with custom id generator", async () => {
    await useKv((kv) => {
      const db = kvdex(kv, {
        users1: collection(model<User>(), {
          idGenerator: () => Math.random(),
          indices: {},
          serialized: true,
        }),
        users2: collection(model<User>(), {
          idGenerator: (data) => data.username,
          indices: {},
          serialized: true,
        }),
      })

      const id1 = db.users1._idGenerator(user)
      const id2 = db.users2._idGenerator(user)

      assert(typeof id1 === "number")
      assert(id2 === user.username)
    })
  })

  await t.step("Should select using pagination", async () => {
    await useDb(async (db) => {
      const users = generateLargeUsers(1_000)
      const cr = await db.is_users.addMany(users)
      assert(cr.ok)

      const selected: Document<User>[] = []
      let cursor: string | undefined = undefined
      do {
        const query = await db.is_users.getMany({
          cursor,
          limit: users.length / 10,
        })

        selected.push(...query.result)
        cursor = query.cursor
      } while (cursor)

      assert(
        users.every((user) =>
          selected.some((doc) => doc.value.username === user.username)
        ),
      )
    })
  })

  await t.step("Should select filtered", async () => {
    await useDb(async (db) => {
      const users = generateLargeUsers(10)
      const cr = await db.is_users.addMany(users)
      const count1 = await db.is_users.count()
      assert(cr.ok)
      assert(count1 === users.length)

      const sliced = users.slice(5, 7)

      const { result } = await db.is_users.getMany({
        filter: (doc) =>
          sliced.map((user) => user.username).includes(
            doc.value.username,
          ),
      })

      assert(result.length === sliced.length)
      assert(
        result.every((doc) =>
          sliced.some((user) => user.username === doc.value.username)
        ),
      )
    })
  })

  await t.step("Should select in reverse", async () => {
    await useDb(async (db) => {
      const users = generateLargeUsers(10)
      const cr = await db.is_users.addMany(users)
      const count1 = await db.is_users.count()
      assert(cr.ok)
      assert(count1 === users.length)

      const query1 = await db.is_users.getMany()
      const query2 = await db.is_users.getMany({ reverse: true })

      assert(
        JSON.stringify(query1.result) ===
          JSON.stringify(query2.result.reverse()),
      )
    })
  })

  await t.step("Should select from start id", async () => {
    await useDb(async (db) => {
      const users = generateLargeUsers(10)
      const cr = await db.is_users.addMany(users)
      const count1 = await db.is_users.count()
      assert(cr.ok)
      assert(count1 === users.length)

      const index = 5

      const query1 = await db.is_users.getMany()
      const query2 = await db.is_users.getMany({
        startId: query1.result.at(index)?.id,
      })

      assert(query2.result.length === query1.result.slice(index).length)
      assert(
        query2.result.every((doc1) =>
          query1.result.slice(index).some((doc2) => doc1.id === doc2.id)
        ),
      )
    })
  })

  await t.step("Should select until end id", async () => {
    await useDb(async (db) => {
      const users = generateLargeUsers(10)
      const cr = await db.is_users.addMany(users)
      const count1 = await db.is_users.count()
      assert(cr.ok)
      assert(count1 === users.length)

      const index = 5

      const query1 = await db.is_users.getMany()
      const query2 = await db.is_users.getMany({
        endId: query1.result.at(index)?.id,
      })

      assert(query2.result.length === query1.result.slice(0, index).length)
      assert(
        query2.result.every((doc1) =>
          query1.result.slice(0, index).some((doc2) => doc1.id === doc2.id)
        ),
      )
    })
  })

  await t.step("Should select from start id to end id", async () => {
    await useDb(async (db) => {
      const users = generateLargeUsers(10)
      const cr = await db.is_users.addMany(users)
      const count1 = await db.is_users.count()
      assert(cr.ok)
      assert(count1 === users.length)

      const index1 = 5
      const index2 = 7

      const query1 = await db.is_users.getMany()
      const query2 = await db.is_users.getMany({
        startId: query1.result.at(index1)?.id,
        endId: query1.result.at(index2)?.id,
      })

      assert(
        query2.result.length === query1.result.slice(index1, index2).length,
      )
      assert(
        query2.result.every((doc1) =>
          query1.result.slice(index1, index2).some((doc2) =>
            doc1.id === doc2.id
          )
        ),
      )
    })
  })

  await t.step("Should allow optional indices", async () => {
    await useKv(async (kv) => {
      const db = kvdex(kv, {
        is: collection(
          model<{
            oblPrimary: string
            oblSecondary: number
            optPrimary?: string
            optSecondary?: number
            check?: Date
          }>(),
          {
            indices: {
              oblPrimary: "primary",
              oblSecondary: "secondary",
              optPrimary: "primary",
              optSecondary: "secondary",
            },
            serialized: true,
          },
        ),
      })

      const cr1 = await db.is.add({
        oblPrimary: "oblPrimary1",
        oblSecondary: 10,
      })

      const cr2 = await db.is.add({
        oblPrimary: "oblPrimary2",
        oblSecondary: 10,
        optPrimary: "optPrimary2",
        optSecondary: 20,
      })

      assert(cr1.ok)
      assert(cr2.ok)

      const byOptPrimary2 = await db.is.findByPrimaryIndex(
        "optPrimary",
        "optPrimary2",
      )
      const byOptSecondary2 = await db.is.findBySecondaryIndex(
        "optSecondary",
        20,
      )

      assert(byOptPrimary2?.id === cr2.id)
      assert(byOptSecondary2.result.length === 1)
      assert(byOptSecondary2.result.some((i) => i.id === cr2.id))

      const cr3 = await db.is.add({
        oblPrimary: "oblPrimary3",
        oblSecondary: 10,
        optPrimary: "optPrimary2",
        optSecondary: 20,
      })

      assert(!cr3.ok)

      const cr4 = await db.is.add({
        oblPrimary: "oblPrimary4",
        oblSecondary: 10,
        optPrimary: "optPrimary4",
        optSecondary: 20,
      })

      assert(cr4.ok)

      const byOptPrimary4 = await db.is.findByPrimaryIndex(
        "optPrimary",
        "optPrimary4",
      )
      const byOptSecondary4 = await db.is.findBySecondaryIndex(
        "optSecondary",
        20,
      )

      assert(byOptPrimary4?.id === cr4.id)
      assert(byOptSecondary4.result.length === 2)
      assert(byOptSecondary4.result.some((i) => i.id === cr2.id))
      assert(byOptSecondary4.result.some((i) => i.id === cr4.id))
    })
  })

  await t.step("Should correctly infer type of document", async () => {
    await useDb(async (db) => {
      const doc = await db.is_users.find("")
      if (doc) {
        doc.value.age.valueOf()
      }
    })
  })

  await t.step(
    "Should correctly infer insert and output of asymmetric model",
    async () => {
      await useDb(async (db) => {
        const cr = await db.ais_users.add(user)
        assert(cr.ok)

        const doc = await db.ais_users.find(cr.id)
        assert(doc !== null)
        assert(typeof doc.value.addressStr === "string")
        assert(typeof doc.value.decadeAge === "number")
        assert(typeof doc.value.name === "string")
      })
    },
  )
})