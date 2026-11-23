"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const knex_1 = require("knex");
const src_1 = require("../../src");
const registerQueryBuilderExtension_1 = require("../../src/registerQueryBuilderExtension");
const testTables_1 = require("../testTables");
describe("registerQueryBuilderExtension", () => {
    it("should map object to table object", (done) => {
        function selectId() {
            this.select("id");
        }
        (0, registerQueryBuilderExtension_1.registerQueryBuilderExtension)("selectId", selectId);
        const typedKnex = new src_1.TypedKnex((0, knex_1.knex)({ client: "postgresql" }));
        typedKnex.onlyLogQuery = true;
        const query = typedKnex.query(testTables_1.User);
        query.selectId();
        const resultSql = query.toQuery();
        chai_1.assert.deepEqual(resultSql, 'select "users"."id" as "id" from "users"');
        done();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnaXN0ZXJRdWVyeUJ1aWxkZXJFeHRlbnNpb25UZXN0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3Rlc3QvdW5pdC9yZWdpc3RlclF1ZXJ5QnVpbGRlckV4dGVuc2lvblRlc3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsK0JBQThCO0FBQzlCLCtCQUE0QjtBQUM1QixtQ0FBc0M7QUFDdEMsMkZBQXdGO0FBQ3hGLDhDQUFxQztBQUVyQyxRQUFRLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFO0lBQzNDLEVBQUUsQ0FBQyxtQ0FBbUMsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQzdDLFNBQVMsUUFBUTtZQUNiLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEIsQ0FBQztRQUVELElBQUEsNkRBQTZCLEVBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXBELE1BQU0sU0FBUyxHQUFHLElBQUksZUFBUyxDQUFDLElBQUEsV0FBSSxFQUFDLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMvRCxTQUFpQixDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7UUFFdkMsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxpQkFBSSxDQUFRLENBQUM7UUFDM0MsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRWpCLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUVsQyxhQUFNLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSwwQ0FBMEMsQ0FBQyxDQUFDO1FBRXhFLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGFzc2VydCB9IGZyb20gXCJjaGFpXCI7XG5pbXBvcnQgeyBrbmV4IH0gZnJvbSBcImtuZXhcIjtcbmltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gXCIuLi8uLi9zcmNcIjtcbmltcG9ydCB7IHJlZ2lzdGVyUXVlcnlCdWlsZGVyRXh0ZW5zaW9uIH0gZnJvbSBcIi4uLy4uL3NyYy9yZWdpc3RlclF1ZXJ5QnVpbGRlckV4dGVuc2lvblwiO1xuaW1wb3J0IHsgVXNlciB9IGZyb20gXCIuLi90ZXN0VGFibGVzXCI7XG5cbmRlc2NyaWJlKFwicmVnaXN0ZXJRdWVyeUJ1aWxkZXJFeHRlbnNpb25cIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIG1hcCBvYmplY3QgdG8gdGFibGUgb2JqZWN0XCIsIChkb25lKSA9PiB7XG4gICAgICAgIGZ1bmN0aW9uIHNlbGVjdElkKHRoaXM6IGFueSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3QoXCJpZFwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlZ2lzdGVyUXVlcnlCdWlsZGVyRXh0ZW5zaW9uKFwic2VsZWN0SWRcIiwgc2VsZWN0SWQpO1xuXG4gICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogXCJwb3N0Z3Jlc3FsXCIgfSkpO1xuICAgICAgICAodHlwZWRLbmV4IGFzIGFueSkub25seUxvZ1F1ZXJ5ID0gdHJ1ZTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHR5cGVkS25leC5xdWVyeShVc2VyKSBhcyBhbnk7XG4gICAgICAgIHF1ZXJ5LnNlbGVjdElkKCk7XG5cbiAgICAgICAgY29uc3QgcmVzdWx0U3FsID0gcXVlcnkudG9RdWVyeSgpO1xuXG4gICAgICAgIGFzc2VydC5kZWVwRXF1YWwocmVzdWx0U3FsLCAnc2VsZWN0IFwidXNlcnNcIi5cImlkXCIgYXMgXCJpZFwiIGZyb20gXCJ1c2Vyc1wiJyk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xufSk7XG4iXX0=
