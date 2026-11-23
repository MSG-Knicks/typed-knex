"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const mapObjectToTableObject_1 = require("../../src/mapObjectToTableObject");
const testTables_1 = require("../testTables");
describe("mapObjectToTableObject", () => {
    it("should map object to table object", (done) => {
        const result = (0, mapObjectToTableObject_1.mapObjectToTableObject)(testTables_1.User, { id: "id", status: "status" });
        chai_1.assert.deepEqual(result, { id: "id", weirdDatabaseName: "status" });
        done();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFwT2JqZWN0VG9UYWJsZU9iamVjdFRlc3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vdGVzdC91bml0L21hcE9iamVjdFRvVGFibGVPYmplY3RUZXN0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLCtCQUE4QjtBQUM5Qiw2RUFBMEU7QUFDMUUsOENBQXFDO0FBRXJDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7SUFDcEMsRUFBRSxDQUFDLG1DQUFtQyxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDN0MsTUFBTSxNQUFNLEdBQUcsSUFBQSwrQ0FBc0IsRUFBQyxpQkFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUU1RSxhQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUVwRSxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiY2hhaVwiO1xuaW1wb3J0IHsgbWFwT2JqZWN0VG9UYWJsZU9iamVjdCB9IGZyb20gXCIuLi8uLi9zcmMvbWFwT2JqZWN0VG9UYWJsZU9iamVjdFwiO1xuaW1wb3J0IHsgVXNlciB9IGZyb20gXCIuLi90ZXN0VGFibGVzXCI7XG5cbmRlc2NyaWJlKFwibWFwT2JqZWN0VG9UYWJsZU9iamVjdFwiLCAoKSA9PiB7XG4gICAgaXQoXCJzaG91bGQgbWFwIG9iamVjdCB0byB0YWJsZSBvYmplY3RcIiwgKGRvbmUpID0+IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gbWFwT2JqZWN0VG9UYWJsZU9iamVjdChVc2VyLCB7IGlkOiBcImlkXCIsIHN0YXR1czogXCJzdGF0dXNcIiB9KTtcblxuICAgICAgICBhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdCwgeyBpZDogXCJpZFwiLCB3ZWlyZERhdGFiYXNlTmFtZTogXCJzdGF0dXNcIiB9KTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG59KTtcbiJdfQ==
