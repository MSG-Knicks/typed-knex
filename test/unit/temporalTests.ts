import { assert } from "chai";
import { knex } from "knex";
import { Temporal } from "temporal-polyfill";
import mockDb from "mock-knex";
import { TypedKnex } from "../../src/typedKnex";
import { TemporalTestClassTable } from "../testTables";

describe("Temporal", () => {
    const knexConfig = knex({ client: "mssql" });
    mockDb.mock(knexConfig);

    const typedKnex = new TypedKnex(knexConfig);

    it("should return select Temporal class columns from table", (done) => {
        const query = typedKnex.query(TemporalTestClassTable).select("id", "sqlDateColumn", "sqlDateTimeColumn", "temporalDateColumn", "temporalTimeColumn", "temporalDateTimeColumn");

        const queryString = query.toQuery();
        assert.equal(
            queryString,
            "select [temporal].[id] as [id], [temporal].[sqlDateColumn] as [sqlDateColumn], [temporal].[sqlDateTimeColumn] as [sqlDateTimeColumn], [temporal].[temporalDateColumn] as [temporalDateColumn], [temporal].[temporalTimeColumn] as [temporalTimeColumn], [temporal].[temporalDateTimeColumn] as [temporalDateTimeColumn] from [temporal]"
        );

        done();
    });

    describe("should convert Temporal objects as strings when querying the database", () => {
        const date = new Date("2026-07-23T06:30:15");
        const plainDate = Temporal.PlainDate.from("2026-07-23");
        const plainDate2 = Temporal.PlainDate.from("2026-07-25");
        const plainDateTime = Temporal.PlainDateTime.from("2026-07-23T06:30:15");
        const plainTime = Temporal.PlainTime.from("06:30:15");

        it("where", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).where("temporalDateColumn", plainDate);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where [temporal].[temporalDateColumn] = '2026-07-23'");

            done();
        });
        it("andWhere", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).where("temporalDateTimeColumn", plainDateTime);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where [temporal].[temporalDateTimeColumn] = '2026-07-23T06:30:15'");

            done();
        });
        it("orWhere", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).orWhere("temporalTimeColumn", plainTime);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where [temporal].[temporalTimeColumn] = '06:30:15'");

            done();
        });
        it("whereNot", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).whereNot("temporalDateColumn", plainDate);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where not [temporal].[temporalDateColumn] = '2026-07-23'");

            done();
        });

        it("whereIn", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).whereIn("temporalDateColumn", [plainDate]);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where [temporal].[temporalDateColumn] in ('2026-07-23')");

            done();
        });
        it("whereNotIn", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).whereNotIn("temporalDateColumn", [plainDate]);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where [temporal].[temporalDateColumn] not in ('2026-07-23')");

            done();
        });
        it("orWhereIn", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).orWhereIn("temporalDateTimeColumn", [plainDateTime]);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where [temporal].[temporalDateTimeColumn] in ('2026-07-23T06:30:15')");

            done();
        });
        it("orWhereNotIn", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).orWhereNotIn("temporalDateTimeColumn", [plainDateTime]);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where [temporal].[temporalDateTimeColumn] not in ('2026-07-23T06:30:15')");

            done();
        });

        it("whereBetween", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).whereBetween("temporalDateColumn", [plainDate, plainDate2]);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where [temporal].[temporalDateColumn] between '2026-07-23' and '2026-07-25'");

            done();
        });
        it("whereNotBetween", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).whereNotBetween("temporalDateColumn", [plainDate, plainDate2]);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where [temporal].[temporalDateColumn] not between '2026-07-23' and '2026-07-25'");

            done();
        });
        it("orWhereBetween", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).orWhereBetween("temporalDateColumn", [plainDate, plainDate2]);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where [temporal].[temporalDateColumn] between '2026-07-23' and '2026-07-25'");

            done();
        });
        it("orWhereNotBetween", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).orWhereNotBetween("temporalDateColumn", [plainDate, plainDate2]);

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where [temporal].[temporalDateColumn] not between '2026-07-23' and '2026-07-25'");

            done();
        });

        it("whereParentheses", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).whereParentheses((w) => w.where("sqlDateTimeColumn", date).andWhere("temporalDateTimeColumn", plainDateTime));

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where ([temporal].[sqlDateTimeColumn] = '2026-07-23 06:30:15.000' and [temporal].[temporalDateTimeColumn] = '2026-07-23T06:30:15')");

            done();
        });
        it("orWhereParentheses", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).orWhereParentheses((w) => w.where("sqlDateColumn", date).andWhere("temporalDateColumn", plainDate));

            const queryString = query.toQuery();
            assert.equal(queryString, "select * from [temporal] where ([temporal].[sqlDateColumn] = '2026-07-23 06:30:15.000' and [temporal].[temporalDateColumn] = '2026-07-23')");

            done();
        });

        it("having", (done) => {
            const query = typedKnex.query(TemporalTestClassTable).select("id").groupBy("id").max("temporalDateColumn", "test").having("temporalDateColumn", ">=", plainDate);

            const queryString = query.toQuery();
            assert.equal(queryString, "select [temporal].[id] as [id], max([temporal].[temporalDateColumn]) as [test] from [temporal] group by [temporal].[id] having [temporal].[temporalDateColumn] >= '2026-07-23'");

            done();
        });
    });

    describe("should convert Temporal objects as strings when writing to the database", () => {
        const date = new Date("2026-09-29T12:15:45");
        const plainDate = Temporal.PlainDate.from("2026-09-29");
        const plainDate2 = Temporal.PlainDate.from("2026-10-04");
        const plainDateTime = Temporal.PlainDateTime.from("2026-09-29T12:15:45");
        const plainTime = Temporal.PlainTime.from("12:15:45");

        it("insertItem", async () => {
            const query = typedKnex.query(TemporalTestClassTable);

            (query as any).onlyLogQuery = true;
            await query.insertItem({
                sqlDateTimeColumn: date,
                temporalDateColumn: plainDate,
                temporalDateTimeColumn: plainDateTime,
                temporalTimeColumn: plainTime,
            });
            assert.equal(
                (query as any).queryLog.trim(),
                "insert into [temporal] ([sqlDateTimeColumn], [temporalDateColumn], [temporalDateTimeColumn], [temporalTimeColumn]) values ('2026-09-29 12:15:45.000', '2026-09-29', '2026-09-29T12:15:45', '12:15:45')"
            );
        });
        it("updateItem", async () => {
            const query = typedKnex.query(TemporalTestClassTable).where("id", "test");

            (query as any).onlyLogQuery = true;
            await query.updateItem({
                sqlDateTimeColumn: date,
                temporalDateColumn: plainDate,
                temporalDateTimeColumn: plainDateTime,
                temporalTimeColumn: plainTime,
            });
            assert.equal(
                (query as any).queryLog.trim(),
                "update [temporal] set [sqlDateTimeColumn] = '2026-09-29 12:15:45.000', [temporalDateColumn] = '2026-09-29', [temporalDateTimeColumn] = '2026-09-29T12:15:45', [temporalTimeColumn] = '12:15:45' where [temporal].[id] = 'test';select @@rowcount"
            );
        });
        it("updateItemByPrimaryKey", async () => {
            const query = typedKnex.query(TemporalTestClassTable);

            (query as any).onlyLogQuery = true;
            await query.updateItemByPrimaryKey("test", {
                sqlDateTimeColumn: date,
                temporalDateColumn: plainDate,
                temporalDateTimeColumn: plainDateTime,
                temporalTimeColumn: plainTime,
            });
            assert.equal(
                (query as any).queryLog.trim(),
                "update [temporal] set [sqlDateTimeColumn] = '2026-09-29 12:15:45.000', [temporalDateColumn] = '2026-09-29', [temporalDateTimeColumn] = '2026-09-29T12:15:45', [temporalTimeColumn] = '12:15:45' where [id] = 'test';select @@rowcount"
            );
        });
        it("insertItems", async () => {
            const query = typedKnex.query(TemporalTestClassTable).where("id", "test");

            (query as any).onlyLogQuery = true;
            await query.insertItems([
                {
                    sqlDateTimeColumn: date,
                    temporalDateColumn: plainDate,
                },
                {
                    sqlDateTimeColumn: date,
                    temporalDateColumn: plainDate2,
                },
            ]);
            assert.equal((query as any).queryLog.trim(), `insert into [temporal] ([sqlDateTimeColumn], [temporalDateColumn]) values ('2026-09-29 12:15:45.000', '2026-09-29'), ('2026-09-29 12:15:45.000', '2026-10-04')`);
        });
    });

    describe("should convert Date columns from the database to Temporal objects on select", () => {
        let tracker: mockDb.Tracker;
        beforeEach(() => {
            tracker = mockDb.getTracker();
            tracker.install();
        });
        afterEach(() => {
            tracker.uninstall();
        });

        type TemporalTestClassDatabaseTableRow = {
            [K in keyof TemporalTestClassTable]: TemporalTestClassTable[K] extends string | number | boolean ? TemporalTestClassTable[K] : Date;
        };

        const dbData: Partial<TemporalTestClassDatabaseTableRow> = {
            id: "test",
            sqlDateColumn: new Date("2026-09-29"),
            sqlDateTimeColumn: new Date("2026-09-29T12:15:45"),
            temporalDateColumn: new Date(Date.UTC(2026, 8, 29)),
            temporalDateTimeColumn: new Date(Date.UTC(2026, 8, 29, 12, 15, 45)),
            temporalTimeColumn: new Date(new Date(Date.UTC(1970, 0, 1, 12, 15, 45))),
        };
        const expectedData: TemporalTestClassTable = {
            id: "test",
            sqlDateColumn: new Date("2026-09-29"),
            sqlDateTimeColumn: new Date("2026-09-29T12:15:45"),
            temporalDateColumn: Temporal.PlainDate.from("2026-09-29"),
            temporalDateTimeColumn: Temporal.PlainDateTime.from("2026-09-29T12:15:45"),
            temporalTimeColumn: Temporal.PlainTime.from("12:15:45"),
        };

        it("getMany", async () => {
            tracker.on("query", (query) => {
                assert.deepEqual(query.bindings, ["test"]);
                query.response([dbData]);
            });

            const [actual] = await typedKnex.query(TemporalTestClassTable).where("id", "test").getMany();
            assert.equal(actual.id, expectedData.id);
            assert.equal(actual.sqlDateColumn.getTime(), expectedData.sqlDateColumn.getTime());
            assert.equal(Temporal.PlainDate.compare(actual.temporalDateColumn, expectedData.temporalDateColumn), 0);
            assert.equal(Temporal.PlainDateTime.compare(actual.temporalDateTimeColumn, expectedData.temporalDateTimeColumn), 0);
            assert.equal(Temporal.PlainTime.compare(actual.temporalTimeColumn, expectedData.temporalTimeColumn), 0);
        });
        it("getSingle", async () => {
            tracker.on("query", (query) => {
                assert.deepEqual(query.bindings, ["test"]);
                query.response([dbData]);
            });

            const actual = await typedKnex.query(TemporalTestClassTable).where("id", "test").getSingle();
            assert.equal(actual.id, expectedData.id);
            assert.equal(actual.sqlDateColumn.getTime(), expectedData.sqlDateColumn.getTime());
            assert.equal(Temporal.PlainDate.compare(actual.temporalDateColumn, expectedData.temporalDateColumn), 0);
            assert.equal(Temporal.PlainDateTime.compare(actual.temporalDateTimeColumn, expectedData.temporalDateTimeColumn), 0);
            assert.equal(Temporal.PlainTime.compare(actual.temporalTimeColumn, expectedData.temporalTimeColumn), 0);
        });
        it("getFirst", async () => {
            tracker.on("query", (query) => {
                assert.deepEqual(query.bindings, ["test"]);
                query.response([dbData]);
            });

            const actual = await typedKnex.query(TemporalTestClassTable).where("id", "test").getFirst();
            assert.equal(actual.id, expectedData.id);
            assert.equal(actual.sqlDateColumn.getTime(), expectedData.sqlDateColumn.getTime());
            assert.equal(Temporal.PlainDate.compare(actual.temporalDateColumn, expectedData.temporalDateColumn), 0);
            assert.equal(Temporal.PlainDateTime.compare(actual.temporalDateTimeColumn, expectedData.temporalDateTimeColumn), 0);
            assert.equal(Temporal.PlainTime.compare(actual.temporalTimeColumn, expectedData.temporalTimeColumn), 0);
        });
        it("insertItemWithReturning", async () => {
            tracker.on("query", (query) => {
                assert.deepEqual(query.bindings, [expectedData.sqlDateTimeColumn, "2026-09-29", "2026-09-29T12:15:45", "12:15:45"]);
                query.response([dbData]);
            });

            const actual = await typedKnex.query(TemporalTestClassTable).insertItemWithReturning({
                sqlDateTimeColumn: expectedData.sqlDateTimeColumn,
                temporalDateColumn: expectedData.temporalDateColumn,
                temporalDateTimeColumn: expectedData.temporalDateTimeColumn,
                temporalTimeColumn: expectedData.temporalTimeColumn,
            });

            assert.equal(actual.id, expectedData.id);
            assert.equal(actual.sqlDateColumn.getTime(), expectedData.sqlDateColumn.getTime());
            assert.equal(Temporal.PlainDate.compare(actual.temporalDateColumn, expectedData.temporalDateColumn), 0);
            assert.equal(Temporal.PlainDateTime.compare(actual.temporalDateTimeColumn, expectedData.temporalDateTimeColumn), 0);
            assert.equal(Temporal.PlainTime.compare(actual.temporalTimeColumn, expectedData.temporalTimeColumn), 0);
        });
        it("updateItemWithReturning", async () => {
            tracker.on("query", (query) => {
                assert.deepEqual(query.bindings, [expectedData.sqlDateTimeColumn, "2026-09-29", "2026-09-29T12:15:45", "12:15:45", "test"]);
                query.response([dbData]);
            });

            const actual = await typedKnex.query(TemporalTestClassTable).where("id", "test").updateItemWithReturning({
                sqlDateTimeColumn: expectedData.sqlDateTimeColumn,
                temporalDateColumn: expectedData.temporalDateColumn,
                temporalDateTimeColumn: expectedData.temporalDateTimeColumn,
                temporalTimeColumn: expectedData.temporalTimeColumn,
            });

            assert.equal(actual.id, expectedData.id);
            assert.equal(actual.sqlDateColumn.getTime(), expectedData.sqlDateColumn.getTime());
            assert.equal(Temporal.PlainDate.compare(actual.temporalDateColumn, expectedData.temporalDateColumn), 0);
            assert.equal(Temporal.PlainDateTime.compare(actual.temporalDateTimeColumn, expectedData.temporalDateTimeColumn), 0);
            assert.equal(Temporal.PlainTime.compare(actual.temporalTimeColumn, expectedData.temporalTimeColumn), 0);
        });
    });
});
