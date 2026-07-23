"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const knex_1 = require("knex");
const validateTables_1 = require("../../src/validateTables");
describe("validateTables", () => {
    it("should fail on empty database", async () => {
        const db = (0, knex_1.knex)({
            client: "sqlite3",
            useNullAsDefault: false,
            connection: { filename: ":memory:" },
        });
        try {
            await (0, validateTables_1.validateTables)(db);
            chai_1.assert.isFalse(true);
        } catch (_error) {}
        await db.destroy();
    });
    it("should succeed on empty database, is tableNamesToValidate is empty", async () => {
        const db = (0, knex_1.knex)({
            client: "sqlite3",
            useNullAsDefault: false,
            connection: { filename: ":memory:" },
        });
        try {
            await (0, validateTables_1.validateTables)(db, []);
            chai_1.assert.isFalse(true);
        } catch (_error) {}
        await db.destroy();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGVUYWJsZXNUZXN0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3Rlc3QvaW50ZWdyYXRpb24vdmFsaWRhdGVUYWJsZXNUZXN0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLCtCQUE4QjtBQUM5QiwrQkFBNEI7QUFDNUIsNkRBQTBEO0FBRzFELFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7SUFDNUIsRUFBRSxDQUFDLCtCQUErQixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzNDLE1BQU0sRUFBRSxHQUFHLElBQUEsV0FBSSxFQUFDO1lBQ1osTUFBTSxFQUFFLFNBQVM7WUFDakIsZ0JBQWdCLEVBQUUsS0FBSztZQUN2QixVQUFVLEVBQUUsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFO1NBQ3ZDLENBQUMsQ0FBQztRQUVILElBQUk7WUFDQSxNQUFNLElBQUEsK0JBQWMsRUFBQyxFQUFFLENBQUMsQ0FBQztZQUN6QixhQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3hCO1FBQUMsT0FBTyxNQUFNLEVBQUUsR0FBRTtRQUVuQixNQUFNLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN2QixDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxvRUFBb0UsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNoRixNQUFNLEVBQUUsR0FBRyxJQUFBLFdBQUksRUFBQztZQUNaLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLGdCQUFnQixFQUFFLEtBQUs7WUFDdkIsVUFBVSxFQUFFLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRTtTQUN2QyxDQUFDLENBQUM7UUFFSCxJQUFJO1lBQ0EsTUFBTSxJQUFBLCtCQUFjLEVBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzdCLGFBQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDeEI7UUFBQyxPQUFPLE1BQU0sRUFBRSxHQUFFO1FBRW5CLE1BQU0sRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3ZCLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiY2hhaVwiO1xuaW1wb3J0IHsga25leCB9IGZyb20gXCJrbmV4XCI7XG5pbXBvcnQgeyB2YWxpZGF0ZVRhYmxlcyB9IGZyb20gXCIuLi8uLi9zcmMvdmFsaWRhdGVUYWJsZXNcIjtcbmltcG9ydCB7fSBmcm9tIFwiLi4vdGVzdFRhYmxlc1wiO1xuXG5kZXNjcmliZShcInZhbGlkYXRlVGFibGVzXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBmYWlsIG9uIGVtcHR5IGRhdGFiYXNlXCIsIGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgZGIgPSBrbmV4KHtcbiAgICAgICAgICAgIGNsaWVudDogXCJzcWxpdGUzXCIsXG4gICAgICAgICAgICB1c2VOdWxsQXNEZWZhdWx0OiBmYWxzZSxcbiAgICAgICAgICAgIGNvbm5lY3Rpb246IHsgZmlsZW5hbWU6IFwiOm1lbW9yeTpcIiB9LFxuICAgICAgICB9KTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdmFsaWRhdGVUYWJsZXMoZGIpO1xuICAgICAgICAgICAgYXNzZXJ0LmlzRmFsc2UodHJ1ZSk7XG4gICAgICAgIH0gY2F0Y2ggKF9lcnJvcikge31cblxuICAgICAgICBhd2FpdCBkYi5kZXN0cm95KCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBzdWNjZWVkIG9uIGVtcHR5IGRhdGFiYXNlLCBpcyB0YWJsZU5hbWVzVG9WYWxpZGF0ZSBpcyBlbXB0eVwiLCBhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGRiID0ga25leCh7XG4gICAgICAgICAgICBjbGllbnQ6IFwic3FsaXRlM1wiLFxuICAgICAgICAgICAgdXNlTnVsbEFzRGVmYXVsdDogZmFsc2UsXG4gICAgICAgICAgICBjb25uZWN0aW9uOiB7IGZpbGVuYW1lOiBcIjptZW1vcnk6XCIgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHZhbGlkYXRlVGFibGVzKGRiLCBbXSk7XG4gICAgICAgICAgICBhc3NlcnQuaXNGYWxzZSh0cnVlKTtcbiAgICAgICAgfSBjYXRjaCAoX2Vycm9yKSB7fVxuXG4gICAgICAgIGF3YWl0IGRiLmRlc3Ryb3koKTtcbiAgICB9KTtcbn0pO1xuIl19
