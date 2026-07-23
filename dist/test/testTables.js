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
exports.TemporalTestClassTable = exports.correctTableName = exports.UserSetting = exports.NoLockTable = exports.User = exports.UserCategory = exports.Region = void 0;
const temporal_polyfill_1 = require("temporal-polyfill");
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
let TemporalTestClassTable = class TemporalTestClassTable {};
__decorate([(0, decorators_1.Column)({ primary: true }), __metadata("design:type", String)], TemporalTestClassTable.prototype, "id", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", temporal_polyfill_1.Temporal.PlainDate)], TemporalTestClassTable.prototype, "temporalDateColumn", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", temporal_polyfill_1.Temporal.PlainTime)], TemporalTestClassTable.prototype, "temporalTimeColumn", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", temporal_polyfill_1.Temporal.PlainDateTime)], TemporalTestClassTable.prototype, "temporalDateTimeColumn", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", Date)], TemporalTestClassTable.prototype, "sqlDateColumn", void 0);
__decorate([(0, decorators_1.Column)(), __metadata("design:type", Date)], TemporalTestClassTable.prototype, "sqlDateTimeColumn", void 0);
TemporalTestClassTable = __decorate([(0, decorators_1.Table)("temporal")], TemporalTestClassTable);
exports.TemporalTestClassTable = TemporalTestClassTable;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFRhYmxlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3Rlc3QvdGVzdFRhYmxlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQSx5REFBNkM7QUFDN0Msa0RBQWtEO0FBQ2xELG9FQUFpRTtBQUdqRSxJQUFhLE1BQU0sR0FBbkIsTUFBYSxNQUFNO0NBS2xCLENBQUE7QUFIRztJQURDLElBQUEsbUJBQU0sRUFBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQzs7a0NBQ1A7QUFFbkI7SUFEQyxJQUFBLG1CQUFNLEdBQUU7O29DQUNXO0FBSlgsTUFBTTtJQURsQixJQUFBLGtCQUFLLEVBQUMsU0FBUyxDQUFDO0dBQ0osTUFBTSxDQUtsQjtBQUxZLHdCQUFNO0FBUW5CLElBQWEsWUFBWSxHQUF6QixNQUFhLFlBQVk7Q0FpQnhCLENBQUE7QUFmRztJQURDLElBQUEsbUJBQU0sRUFBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQzs7d0NBQ1A7QUFFbkI7SUFEQyxJQUFBLG1CQUFNLEdBQUU7OzBDQUNZO0FBRXJCO0lBREMsSUFBQSxtQkFBTSxFQUFDLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxDQUFDOzhCQUNiLE1BQU07NENBQUM7QUFFdkI7SUFEQyxJQUFBLG1CQUFNLEdBQUU7OzhDQUNnQjtBQUV6QjtJQURDLElBQUEsbUJBQU0sR0FBRTs7MENBQ1k7QUFFckI7SUFEQyxJQUFBLG1CQUFNLEdBQUU7O2lEQUNtQjtBQUU1QjtJQURDLElBQUEsbUJBQU0sRUFBQyxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxDQUFDOzhCQUNiLE1BQU07a0RBQUM7QUFFN0I7SUFEQyxJQUFBLG1CQUFNLEVBQUMsRUFBRSxJQUFJLEVBQUUsZUFBZSxFQUFFLENBQUM7O3FEQUNGO0FBaEJ2QixZQUFZO0lBRHhCLElBQUEsa0JBQUssRUFBQyxnQkFBZ0IsQ0FBQztHQUNYLFlBQVksQ0FpQnhCO0FBakJZ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QUFTLEVBQUUsQ0FBQzs4QkFDUCxXQUFXO2lEQUFDO0FBcEJ4QixXQUFXO0lBRHZCLElBQUEsa0JBQUssRUFBQyxjQUFjLENBQUM7R0FDVCxXQUFXLENBcUJ2QjtBQXJCWSxrQ0FBVztBQXdCeEIsSUFBYSxnQkFBZ0IsR0FBN0IsTUFBYSxnQkFBZ0I7Q0FLNUIsQ0FBQTtBQUhHO0lBREMsSUFBQSxtQkFBTSxFQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDOzs0Q0FDUDtBQUVuQjtJQURDLElBQUEsbUJBQU0sR0FBRTs7OENBQ1c7QUFKWCxnQkFBZ0I7SUFENUIsSUFBQSxrQkFBSyxHQUFFO0dBQ0ssZ0JBQWdCLENBSzVCO0FBTFksNENBQWdCO0FBUTdCLElBQWEsc0JBQXNCLEdBQW5DLE1BQWEsc0JBQXNCO0NBa0JsQyxDQUFBO0FBaEJHO0lBREMsSUFBQSxtQkFBTSxFQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDOztrREFDUDtBQUduQjtJQURDLElBQUEsbUJBQU0sR0FBRTs4QkFDa0IsNEJBQVEsQ0FBQyxTQUFTO2tFQUFDO0FBRzlDO0lBREMsSUFBQSxtQkFBTSxHQUFFOzhCQUNrQiw0QkFBUSxDQUFDLFNBQVM7a0VBQUM7QUFHOUM7SUFEQyxJQUFBLG1CQUFNLEdBQUU7OEJBQ3NCLDRCQUFRLENBQUMsYUFBYTtzRUFBQztBQUd0RDtJQURDLElBQUEsbUJBQU0sR0FBRTs4QkFDYSxJQUFJOzZEQUFDO0FBRzNCO0lBREMsSUFBQSxtQkFBTSxHQUFFOzhCQUNpQixJQUFJO2lFQUFDO0FBakJ0QixzQkFBc0I7SUFEbEMsSUFBQSxrQkFBSyxFQUFDLFVBQVUsQ0FBQztHQUNMLHNCQUFzQixDQWtCbEM7QUFsQlksd0RBQXNCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVGVtcG9yYWwgfSBmcm9tIFwidGVtcG9yYWwtcG9seWZpbGxcIjtcbmltcG9ydCB7IENvbHVtbiwgVGFibGUgfSBmcm9tIFwiLi4vc3JjL2RlY29yYXRvcnNcIjtcbmltcG9ydCB7IElDdXN0b21EYXRhYmFzZVR5cGUgfSBmcm9tIFwiLi4vc3JjL0lDdXN0b21EYXRhYmFzZVR5cGVcIjtcblxuQFRhYmxlKFwicmVnaW9uc1wiKVxuZXhwb3J0IGNsYXNzIFJlZ2lvbiB7XG4gICAgQENvbHVtbih7IHByaW1hcnk6IHRydWUgfSlcbiAgICBwdWJsaWMgaWQhOiBzdHJpbmc7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIGNvZGU6IG51bWJlcjtcbn1cblxuQFRhYmxlKFwidXNlckNhdGVnb3JpZXNcIilcbmV4cG9ydCBjbGFzcyBVc2VyQ2F0ZWdvcnkge1xuICAgIEBDb2x1bW4oeyBwcmltYXJ5OiB0cnVlIH0pXG4gICAgcHVibGljIGlkITogc3RyaW5nO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBuYW1lITogc3RyaW5nO1xuICAgIEBDb2x1bW4oeyBuYW1lOiBcInJlZ2lvbklkXCIgfSlcbiAgICBwdWJsaWMgcmVnaW9uITogUmVnaW9uO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyByZWdpb25JZCE6IHN0cmluZztcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgeWVhciE6IG51bWJlcjtcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgcGhvbmVOdW1iZXI/OiBzdHJpbmc7XG4gICAgQENvbHVtbih7IG5hbWU6IFwiYmFja3VwUmVnaW9uSWRcIiB9KVxuICAgIHB1YmxpYyBiYWNrdXBSZWdpb24/OiBSZWdpb247XG4gICAgQENvbHVtbih7IG5hbWU6IFwiSU5URVJOQUxfTkFNRVwiIH0pXG4gICAgcHVibGljIHNwZWNpYWxSZWdpb25JZCE6IHN0cmluZztcbn1cblxuY2xhc3MgSUV4dHJhRGF0YSBleHRlbmRzIElDdXN0b21EYXRhYmFzZVR5cGUge31cblxuQFRhYmxlKFwidXNlcnNcIilcbmV4cG9ydCBjbGFzcyBVc2VyIHtcbiAgICBAQ29sdW1uKHsgcHJpbWFyeTogdHJ1ZSB9KVxuICAgIHB1YmxpYyBpZCE6IHN0cmluZztcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgbmFtZSE6IHN0cmluZztcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgbnVtZXJpY1ZhbHVlOiBudW1iZXI7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIHNvbWVWYWx1ZSE6IHN0cmluZztcbiAgICBAQ29sdW1uKHsgbmFtZTogXCJjYXRlZ29yeUlkXCIgfSlcbiAgICBwdWJsaWMgY2F0ZWdvcnkhOiBVc2VyQ2F0ZWdvcnk7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIGNhdGVnb3J5SWQhOiBzdHJpbmc7XG4gICAgQENvbHVtbih7IG5hbWU6IFwiY2F0ZWdvcnkySWRcIiB9KVxuICAgIHB1YmxpYyBjYXRlZ29yeTIhOiBVc2VyQ2F0ZWdvcnk7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIG5pY2tOYW1lPzogc3RyaW5nO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBiaXJ0aERhdGU6IERhdGU7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIGRlYXRoRGF0ZTogRGF0ZSB8IG51bGw7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBAQ29sdW1uKHsgbmFtZTogXCJ3ZWlyZERhdGFiYXNlTmFtZVwiIH0pXG4gICAgcHVibGljIHN0YXR1cz86IHN0cmluZztcbiAgICBAQ29sdW1uKHsgbmFtZTogXCJ3ZWlyZERhdGFiYXNlTmFtZTJcIiB9KVxuICAgIHB1YmxpYyBub3RVbmRlZmluZWRTdGF0dXM6IHN0cmluZztcbiAgICBAQ29sdW1uKHsgbmFtZTogXCJvcHRpb25hbENhdGVnb3J5SWRcIiB9KVxuICAgIHB1YmxpYyBvcHRpb25hbENhdGVnb3J5PzogVXNlckNhdGVnb3J5O1xuICAgIEBDb2x1bW4oeyBuYW1lOiBcIm51bGxhYmxlQ2F0ZWdvcnlJZFwiIH0pXG4gICAgcHVibGljIG51bGxhYmxlQ2F0ZWdvcnk6IFVzZXJDYXRlZ29yeSB8IG51bGw7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIHNvbWVPcHRpb25hbFZhbHVlPzogc3RyaW5nO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBzb21lTnVsbGFibGVWYWx1ZTogc3RyaW5nIHwgbnVsbDtcbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgZXh0cmFEYXRhITogSUV4dHJhRGF0YTtcbn1cblxuQFRhYmxlKFwibm9sb2NrVGFibGVcIiwgXCJOT0xPQ0tcIilcbmV4cG9ydCBjbGFzcyBOb0xvY2tUYWJsZSB7XG4gICAgQENvbHVtbih7IHByaW1hcnk6IHRydWUgfSlcbiAgICBwdWJsaWMgaWQhOiBzdHJpbmc7XG5cbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgbmFtZTogc3RyaW5nO1xufVxuXG5AVGFibGUoXCJ1c2VyU2V0dGluZ3NcIilcbmV4cG9ydCBjbGFzcyBVc2VyU2V0dGluZyB7XG4gICAgQENvbHVtbih7IHByaW1hcnk6IHRydWUgfSlcbiAgICBwdWJsaWMgaWQhOiBzdHJpbmc7XG4gICAgQENvbHVtbih7IG5hbWU6IFwidXNlcklkXCIgfSlcbiAgICBwdWJsaWMgdXNlciE6IFVzZXI7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIHVzZXJJZCE6IHN0cmluZztcbiAgICBAQ29sdW1uKHsgbmFtZTogXCJ1c2VyMklkXCIgfSlcbiAgICBwdWJsaWMgdXNlcjIhOiBVc2VyO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyB1c2VyMklkITogc3RyaW5nO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBrZXkhOiBzdHJpbmc7XG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIHZhbHVlITogc3RyaW5nO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBpbml0aWFsVmFsdWUhOiBzdHJpbmc7XG4gICAgQENvbHVtbih7IG5hbWU6IFwib3RoZXJfdmFsdWVcIiB9KVxuICAgIHB1YmxpYyBvdGhlclZhbHVlITogc3RyaW5nO1xuICAgIEBDb2x1bW4oeyBuYW1lOiBcIm5vX2xvY2tcIiB9KVxuICAgIHB1YmxpYyBub0xvY2tDb2x1bW46IE5vTG9ja1RhYmxlO1xufVxuXG5AVGFibGUoKVxuZXhwb3J0IGNsYXNzIGNvcnJlY3RUYWJsZU5hbWUge1xuICAgIEBDb2x1bW4oeyBwcmltYXJ5OiB0cnVlIH0pXG4gICAgcHVibGljIGlkITogc3RyaW5nO1xuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBjb2RlOiBudW1iZXI7XG59XG5cbkBUYWJsZShcInRlbXBvcmFsXCIpXG5leHBvcnQgY2xhc3MgVGVtcG9yYWxUZXN0Q2xhc3NUYWJsZSB7XG4gICAgQENvbHVtbih7IHByaW1hcnk6IHRydWUgfSlcbiAgICBwdWJsaWMgaWQhOiBzdHJpbmc7XG5cbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgdGVtcG9yYWxEYXRlQ29sdW1uOiBUZW1wb3JhbC5QbGFpbkRhdGU7XG5cbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgdGVtcG9yYWxUaW1lQ29sdW1uOiBUZW1wb3JhbC5QbGFpblRpbWU7XG5cbiAgICBAQ29sdW1uKClcbiAgICBwdWJsaWMgdGVtcG9yYWxEYXRlVGltZUNvbHVtbjogVGVtcG9yYWwuUGxhaW5EYXRlVGltZTtcblxuICAgIEBDb2x1bW4oKVxuICAgIHB1YmxpYyBzcWxEYXRlQ29sdW1uOiBEYXRlO1xuXG4gICAgQENvbHVtbigpXG4gICAgcHVibGljIHNxbERhdGVUaW1lQ29sdW1uOiBEYXRlO1xufVxuIl19
