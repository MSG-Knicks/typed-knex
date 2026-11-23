/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Equal, Expect, NotAny } from "@type-challenges/utils";
import knex from "knex";
import { TypedKnex } from "../../src";
import { User, UserSetting } from "../testTables";

export async function leftOuterJoinTableOnFunction() {
    const typedKnex = new TypedKnex(knex({ client: "postgresql" }));

    const item = await typedKnex
        .query(UserSetting)
        .leftOuterJoinTableOnFunction("otherUser", User, (join) => {
            join.on("id", "=", "user2Id");
        })
        .select("otherUser.name", "user2.numericValue")
        .getSingle();

    // eslint-disable-next-line no-unused-vars
    type checks = [Expect<NotAny<typeof item>>, Expect<Equal<typeof item, { otherUser: { name: string } } & { user2: { numericValue: number } }>>];
}

export async function select() {
    const typedKnex = new TypedKnex(knex({ client: "postgresql" }));

    await typedKnex.query(UserSetting).select("id").getSingle();

    // @ts-expect-error - should fail
    await typedKnex.query(UserSetting).select("id", "unknown").getSingle();
}

export async function exactOptionalPropertyTypes() {
    const typedKnex = new TypedKnex(knex({ client: "postgresql" }));

    await typedKnex.query(UserSetting).updateItem({ id: "id", initialValue: undefined });
}

export async function coalesce() {
    const typedKnex = new TypedKnex(knex({ client: "postgresql" }));

    const mixed = await typedKnex.query(User).coalesce("combined", "name", "numericValue").getSingle();
    // eslint-disable-next-line no-unused-vars
    type mixedChecks = [Expect<NotAny<typeof mixed.combined>>, Expect<Equal<typeof mixed.combined, string | number>>];

    const nullable = await typedKnex.query(User).coalesce("combined", "nickName", "someNullableValue").getSingle();
    // eslint-disable-next-line no-unused-vars
    type nullableChecks = [Expect<Equal<typeof nullable.combined, string | null | undefined>>];

    const joined = await typedKnex.query(UserSetting).innerJoinColumn("user").coalesce("combined", "user.numericValue", "value").getSingle();
    // eslint-disable-next-line no-unused-vars
    type joinedChecks = [Expect<Equal<typeof joined.combined, number | string>>];

    // @ts-expect-error - should fail, at least two columns are required
    await typedKnex.query(User).coalesce("combined", "name").getSingle();

    // @ts-expect-error - should fail, unknown column
    await typedKnex.query(User).coalesce("combined", "name", "unknown").getSingle();
}
