"use strict";
var __decorate =
    (this && this.__decorate) ||
    function (decorators, target, key, desc) {
        var c = arguments.length,
            r = c < 3 ? target : desc === null ? (desc = Object.getOwnPropertyDescriptor(target, key)) : desc,
            d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if ((d = decorators[i])) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    };
var __metadata =
    (this && this.__metadata) ||
    function (k, v) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
    };
Object.defineProperty(exports, "__esModule", { value: true });
exports.correctTableName = exports.UserSetting = exports.NoLockTable = exports.User = exports.UserCategory = exports.Region = void 0;
const decorators_1 = require("../src/decorators");
const ICustomDatabaseType_1 = require("../src/ICustomDatabaseType");
let Region = class Region {};
__decorate([(0, decorators_1.Column)({ primary: true }), __metadata("design:type", String)], Region.prototype, "id", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", Number)], Region.prototype, "code", void 0);
Region = __decorate([(0, decorators_1.Table)("regions")], Region);
exports.Region = Region;
let UserCategory = class UserCategory {};
__decorate([(0, decorators_1.Column)({ primary: true }), __metadata("design:type", String)], UserCategory.prototype, "id", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], UserCategory.prototype, "name", void 0);
__decorate([(0, decorators_1.Column)({ name: "regionId" }), __metadata("design:type", Region)], UserCategory.prototype, "region", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], UserCategory.prototype, "regionId", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", Number)], UserCategory.prototype, "year", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], UserCategory.prototype, "phoneNumber", void 0);
__decorate([(0, decorators_1.Column)({ name: "backupRegionId" }), __metadata("design:type", Region)], UserCategory.prototype, "backupRegion", void 0);
__decorate([(0, decorators_1.Column)({ name: "INTERNAL_NAME" }), __metadata("design:type", String)], UserCategory.prototype, "specialRegionId", void 0);
UserCategory = __decorate([(0, decorators_1.Table)("userCategories")], UserCategory);
exports.UserCategory = UserCategory;
class IExtraData extends ICustomDatabaseType_1.ICustomDatabaseType {}
let User = class User {};
__decorate([(0, decorators_1.Column)({ primary: true }), __metadata("design:type", String)], User.prototype, "id", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], User.prototype, "name", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", Number)], User.prototype, "numericValue", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], User.prototype, "someValue", void 0);
__decorate([(0, decorators_1.Column)({ name: "categoryId" }), __metadata("design:type", UserCategory)], User.prototype, "category", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], User.prototype, "categoryId", void 0);
__decorate([(0, decorators_1.Column)({ name: "category2Id" }), __metadata("design:type", UserCategory)], User.prototype, "category2", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], User.prototype, "nickName", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", Date)], User.prototype, "birthDate", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", Object)], User.prototype, "deathDate", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", Array)], User.prototype, "tags", void 0);
__decorate([(0, decorators_1.Column)({ name: "weirdDatabaseName" }), __metadata("design:type", String)], User.prototype, "status", void 0);
__decorate([(0, decorators_1.Column)({ name: "weirdDatabaseName2" }), __metadata("design:type", String)], User.prototype, "notUndefinedStatus", void 0);
__decorate([(0, decorators_1.Column)({ name: "optionalCategoryId" }), __metadata("design:type", UserCategory)], User.prototype, "optionalCategory", void 0);
__decorate([(0, decorators_1.Column)({ name: "nullableCategoryId" }), __metadata("design:type", Object)], User.prototype, "nullableCategory", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], User.prototype, "someOptionalValue", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", Object)], User.prototype, "someNullableValue", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", IExtraData)], User.prototype, "extraData", void 0);
User = __decorate([(0, decorators_1.Table)("users")], User);
exports.User = User;
let NoLockTable = class NoLockTable {};
__decorate([(0, decorators_1.Column)({ primary: true }), __metadata("design:type", String)], NoLockTable.prototype, "id", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], NoLockTable.prototype, "name", void 0);
NoLockTable = __decorate([(0, decorators_1.Table)("nolockTable", "NOLOCK")], NoLockTable);
exports.NoLockTable = NoLockTable;
let UserSetting = class UserSetting {};
__decorate([(0, decorators_1.Column)({ primary: true }), __metadata("design:type", String)], UserSetting.prototype, "id", void 0);
__decorate([(0, decorators_1.Column)({ name: "userId" }), __metadata("design:type", User)], UserSetting.prototype, "user", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], UserSetting.prototype, "userId", void 0);
__decorate([(0, decorators_1.Column)({ name: "user2Id" }), __metadata("design:type", User)], UserSetting.prototype, "user2", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], UserSetting.prototype, "user2Id", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], UserSetting.prototype, "key", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], UserSetting.prototype, "value", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", String)], UserSetting.prototype, "initialValue", void 0);
__decorate([(0, decorators_1.Column)({ name: "other_value" }), __metadata("design:type", String)], UserSetting.prototype, "otherValue", void 0);
__decorate([(0, decorators_1.Column)({ name: "no_lock" }), __metadata("design:type", NoLockTable)], UserSetting.prototype, "noLockColumn", void 0);
UserSetting = __decorate([(0, decorators_1.Table)("userSettings")], UserSetting);
exports.UserSetting = UserSetting;
let correctTableName = class correctTableName {};
__decorate([(0, decorators_1.Column)({ primary: true }), __metadata("design:type", String)], correctTableName.prototype, "id", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", Number)], correctTableName.prototype, "code", void 0);
correctTableName = __decorate([(0, decorators_1.Table)()], correctTableName);
exports.correctTableName = correctTableName;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFRhYmxlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3Rlc3QvdGVzdFRhYmxlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSxrREFBa0Q7QUFDbEQsb0VBQWlFO0FBR2pFLElBQWEsTUFBTSxHQUFuQixNQUFhLE1BQU07Q0FLbEIsQ0FBQTtBQUhHO0lBREMsSUFBQSxtQkFBTSxFQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDOztrQ0FDUDtBQUVuQjtJQURDLElBQUEsbUJBQU0sR0FBRTs7b0NBQ1c7QUFKWCxNQUFNO0lBRGxCLElBQUEsa0JBQUssRUFBQyxTQUFTLENBQUM7R0FDSixNQUFNLENBS2xCO0FBTFksd0JBQU07QUFRbkIsSUFBYSxZQUFZLEdBQXpCLE1BQWEsWUFBWTtDQWlCeEIsQ0FBQTtBQWZHO0lBREMsSUFBQSxtQkFBTSxFQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDOzt3Q0FDUDtBQUVuQjtJQURDLElBQUEsbUJBQU0sR0FBRTs7MENBQ1k7QUFFckI7SUFEQyxJQUFBLG1CQUFNLEVBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUM7OEJBQ2IsTUFBTTs0Q0FBQztBQUV2QjtJQURDLElBQUEsbUJBQU0sR0FBRTs7OENBQ2dCO0FBRXpCO0lBREMsSUFBQSxtQkFBTSxHQUFFOzswQ0FDWTtBQUVyQjtJQURDLElBQUEsbUJBQU0sR0FBRTs7aURBQ21CO0FBRTVCO0lBREMsSUFBQSxtQkFBTSxFQUFDLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFFLENBQUM7OEJBQ2IsTUFBTTtrREFBQztBQUU3QjtJQURDLElBQUEsbUJBQU0sRUFBQyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsQ0FBQzs7cURBQ0Y7QUFoQnZCLFlBQVk7SUFEeEIsSUFBQSxrQkFBSyxFQUFDLGdCQUFnQixDQUFDO0dBQ1gsWUFBWSxDQWlCeEI7QUFqQlksb0NBQVk7QUFtQnpC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OzhCQUNQLFdBQVc7aURBQUM7QUFwQnhCLFdBQVc7SUFEdkIsSUFBQSxrQkFBSyxFQUFDLGNBQWMsQ0FBQztHQUNULFdBQVcsQ0FxQnZCO0FBckJZLGtDQUFXO0FBd0J4QixJQUFhLGdCQUFnQixHQUE3QixNQUFhLGdCQUFnQjtDQUs1QixDQUFBO0FBSEc7SUFEQyxJQUFBLG1CQUFNLEVBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUM7OzRDQUNQO0FBRW5CO0lBREMsSUFBQSxtQkFBTSxHQUFFOzs4Q0FDVztBQUpYLGdCQUFnQjtJQUQ1QixJQUFBLGtCQUFLLEdBQUU7R0FDSyxnQkFBZ0IsQ0FLNUI7QUFMWSw0Q0FBZ0IiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb2x1bW4sIFRhYmxlIH0gZnJvbSBcIi4uL3NyYy9kZWNvcmF0b3JzXCI7XG5pbXBvcnQgeyBJQ3VzdG9tRGF0YWJhc2VUeXBlIH0gZnJvbSBcIi4uL3NyYy9JQ3VzdG9tRGF0YWJhc2VUeXBlXCI7XG5cbkBUYWJsZShcInJlZ2lvbnNcIilcbmV4cG9ydCBjbGFzcyBSZWdpb24ge1xuICAgIEBDb2x1bW4oeyBwcmltYXJ5OiB0cnVlIH0pXG4gICAgcHVibGljIGlkITogc3RyaW5nO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBjb2RlOiBudW1iZXI7XG59XG5cbkBUYWJsZShcInVzZXJDYXRlZ29yaWVzXCIpXG5leHBvcnQgY2xhc3MgVXNlckNhdGVnb3J5IHtcbiAgICBAQ29sdW1uKHsgcHJpbWFyeTogdHJ1ZSB9KVxuICAgIHB1YmxpYyBpZCE6IHN0cmluZztcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgbmFtZSE6IHN0cmluZztcbiAgICBAQ29sdW1uKHsgbmFtZTogXCJyZWdpb25JZFwiIH0pXG4gICAgcHVibGljIHJlZ2lvbiE6IFJlZ2lvbjtcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgcmVnaW9uSWQhOiBzdHJpbmc7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIHllYXIhOiBudW1iZXI7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIHBob25lTnVtYmVyPzogc3RyaW5nO1xuICAgIEBDb2x1bW4oeyBuYW1lOiBcImJhY2t1cFJlZ2lvbklkXCIgfSlcbiAgICBwdWJsaWMgYmFja3VwUmVnaW9uPzogUmVnaW9uO1xuICAgIEBDb2x1bW4oeyBuYW1lOiBcIklOVEVSTkFMX05BTUVcIiB9KVxuICAgIHB1YmxpYyBzcGVjaWFsUmVnaW9uSWQhOiBzdHJpbmc7XG59XG5cbmNsYXNzIElFeHRyYURhdGEgZXh0ZW5kcyBJQ3VzdG9tRGF0YWJhc2VUeXBlIHt9XG5cbkBUYWJsZShcInVzZXJzXCIpXG5leHBvcnQgY2xhc3MgVXNlciB7XG4gICAgQENvbHVtbih7IHByaW1hcnk6IHRydWUgfSlcbiAgICBwdWJsaWMgaWQhOiBzdHJpbmc7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIG5hbWUhOiBzdHJpbmc7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIG51bWVyaWNWYWx1ZTogbnVtYmVyO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBzb21lVmFsdWUhOiBzdHJpbmc7XG4gICAgQENvbHVtbih7IG5hbWU6IFwiY2F0ZWdvcnlJZFwiIH0pXG4gICAgcHVibGljIGNhdGVnb3J5ITogVXNlckNhdGVnb3J5O1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBjYXRlZ29yeUlkITogc3RyaW5nO1xuICAgIEBDb2x1bW4oeyBuYW1lOiBcImNhdGVnb3J5MklkXCIgfSlcbiAgICBwdWJsaWMgY2F0ZWdvcnkyITogVXNlckNhdGVnb3J5O1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBuaWNrTmFtZT86IHN0cmluZztcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgYmlydGhEYXRlOiBEYXRlO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBkZWF0aERhdGU6IERhdGUgfCBudWxsO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyB0YWdzPzogc3RyaW5nW107XG4gICAgQENvbHVtbih7IG5hbWU6IFwid2VpcmREYXRhYmFzZU5hbWVcIiB9KVxuICAgIHB1YmxpYyBzdGF0dXM/OiBzdHJpbmc7XG4gICAgQENvbHVtbih7IG5hbWU6IFwid2VpcmREYXRhYmFzZU5hbWUyXCIgfSlcbiAgICBwdWJsaWMgbm90VW5kZWZpbmVkU3RhdHVzOiBzdHJpbmc7XG4gICAgQENvbHVtbih7IG5hbWU6IFwib3B0aW9uYWxDYXRlZ29yeUlkXCIgfSlcbiAgICBwdWJsaWMgb3B0aW9uYWxDYXRlZ29yeT86IFVzZXJDYXRlZ29yeTtcbiAgICBAQ29sdW1uKHsgbmFtZTogXCJudWxsYWJsZUNhdGVnb3J5SWRcIiB9KVxuICAgIHB1YmxpYyBudWxsYWJsZUNhdGVnb3J5OiBVc2VyQ2F0ZWdvcnkgfCBudWxsO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBzb21lT3B0aW9uYWxWYWx1ZT86IHN0cmluZztcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgc29tZU51bGxhYmxlVmFsdWU6IHN0cmluZyB8IG51bGw7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIGV4dHJhRGF0YSE6IElFeHRyYURhdGE7XG59XG5cbkBUYWJsZShcIm5vbG9ja1RhYmxlXCIsIFwiTk9MT0NLXCIpXG5leHBvcnQgY2xhc3MgTm9Mb2NrVGFibGUge1xuICAgIEBDb2x1bW4oeyBwcmltYXJ5OiB0cnVlIH0pXG4gICAgcHVibGljIGlkITogc3RyaW5nO1xuXG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIG5hbWU6IHN0cmluZztcbn1cblxuQFRhYmxlKFwidXNlclNldHRpbmdzXCIpXG5leHBvcnQgY2xhc3MgVXNlclNldHRpbmcge1xuICAgIEBDb2x1bW4oeyBwcmltYXJ5OiB0cnVlIH0pXG4gICAgcHVibGljIGlkITogc3RyaW5nO1xuICAgIEBDb2x1bW4oeyBuYW1lOiBcInVzZXJJZFwiIH0pXG4gICAgcHVibGljIHVzZXIhOiBVc2VyO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyB1c2VySWQhOiBzdHJpbmc7XG4gICAgQENvbHVtbih7IG5hbWU6IFwidXNlcjJJZFwiIH0pXG4gICAgcHVibGljIHVzZXIyITogVXNlcjtcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgdXNlcjJJZCE6IHN0cmluZztcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMga2V5ITogc3RyaW5nO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyB2YWx1ZSE6IHN0cmluZztcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgaW5pdGlhbFZhbHVlITogc3RyaW5nO1xuICAgIEBDb2x1bW4oeyBuYW1lOiBcIm90aGVyX3ZhbHVlXCIgfSlcbiAgICBwdWJsaWMgb3RoZXJWYWx1ZSE6IHN0cmluZztcbiAgICBAQ29sdW1uKHsgbmFtZTogXCJub19sb2NrXCIgfSlcbiAgICBwdWJsaWMgbm9Mb2NrQ29sdW1uOiBOb0xvY2tUYWJsZTtcbn1cblxuQFRhYmxlKClcbmV4cG9ydCBjbGFzcyBjb3JyZWN0VGFibGVOYW1lIHtcbiAgICBAQ29sdW1uKHsgcHJpbWFyeTogdHJ1ZSB9KVxuICAgIHB1YmxpYyBpZCE6IHN0cmluZztcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgY29kZTogbnVtYmVyO1xufVxuIl19
