"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrimaryKeyColumn =
    exports.getColumnProperties =
    exports.getColumnInformation =
    exports.Column =
    exports.getColumnName =
    exports.getTableName =
    exports.getTableMetadata =
    exports.Entity =
    exports.Table =
    exports.getTables =
    exports.getEntities =
        void 0;
require("reflect-metadata");
const tables = [];
/**
 * @deprecated use `getTables`.
 */
function getEntities() {
    return tables;
}
exports.getEntities = getEntities;
function getTables() {
    return tables;
}
exports.getTables = getTables;
function Table(tableName) {
    return (target) => {
        target.prototype.tableMetadataKey = Symbol("table");
        Reflect.metadata(target.prototype.tableMetadataKey, { tableName: tableName !== null && tableName !== void 0 ? tableName : target.name })(target);
        tables.push({ tableName: tableName !== null && tableName !== void 0 ? tableName : target.name, tableClass: target });
    };
}
exports.Table = Table;
/**
 * @deprecated use `Table`.
 */
exports.Entity = Table;
function getTableMetadata(tableClass) {
    return Reflect.getMetadata(tableClass.prototype.tableMetadataKey, tableClass);
}
exports.getTableMetadata = getTableMetadata;
function getTableName(tableClass) {
    return getTableMetadata(tableClass).tableName;
}
exports.getTableName = getTableName;
function getColumnName(tableClass, propertyName) {
    return getColumnInformation(tableClass, propertyName).name;
}
exports.getColumnName = getColumnName;
const columnMetadataKey = Symbol("column");
function Column(options) {
    return getRegisterColumn(options);
}
exports.Column = Column;
function getRegisterColumn(options) {
    function registerColumn(target, propertyKey) {
        Reflect.metadata(columnMetadataKey, { isColumn: true })(target);
        const designType = Reflect.getMetadata("design:type", target, propertyKey);
        const isForeignKey = designType ? ["String", "Number", "Boolean"].includes(designType.name) === false : false;
        const columns = target.constructor.prototype.tableColumns || [];
        let name = propertyKey;
        // console.log('name: ', name);
        let primary = false;
        // console.log('options: ', options);
        if (options) {
            if (options.name !== undefined) {
                name = options.name;
            }
            primary = options.primary === true;
        }
        columns.push({ name, primary, propertyKey, isForeignKey, designType });
        target.constructor.prototype.tableColumns = columns;
    }
    return registerColumn;
}
function getColumnInformation(target, propertyKey) {
    const properties = getColumnProperties(target);
    const property = properties.find((i) => i.propertyKey === propertyKey);
    if (!property) {
        const fkObject = properties.find((p) => p.name === propertyKey);
        if (typeof (fkObject === null || fkObject === void 0 ? void 0 : fkObject.designType) === "function") {
            throw new Error(
                `It seems that class "${target.name}" only has a foreign key object "${fkObject.propertyKey}", but is missing the foreign key property "${propertyKey}". Try adding "@column() ${propertyKey} : [correct type]" to class "${target.name}"`
            );
        }
        throw new Error(`Cannot get column data. Did you set @Column() attribute on ${target.name}.${propertyKey}?`);
    }
    return {
        columnClass: Reflect.getMetadata("design:type", target.prototype, propertyKey),
        name: property.name,
        primary: property.primary,
        propertyKey: property.propertyKey,
        designType: property.designType,
        isForeignKey: property.isForeignKey,
    };
}
exports.getColumnInformation = getColumnInformation;
function getColumnProperties(tableClass) {
    const columns = tableClass.prototype.tableColumns;
    if (!columns) {
        throw new Error(`Cannot get column data from ${tableClass.constructor.name}, did you set @Column() attribute?`);
    }
    return columns;
}
exports.getColumnProperties = getColumnProperties;
/**
 * @deprecated
 */
function getPrimaryKeyColumn(tableClass) {
    const columns = tableClass.prototype.tableColumns;
    if (!columns) {
        throw new Error(`Cannot get column data from ${tableClass.constructor.name}, did you set @Column() attribute?`);
    }
    const primaryKeyColumn = columns.find((i) => i.primary);
    if (primaryKeyColumn === undefined) {
        throw new Error(`Cannot get primary key column ${tableClass.constructor.name}, did you set @Column({primary:true}) attribute?`);
    }
    return primaryKeyColumn;
}
exports.getPrimaryKeyColumn = getPrimaryKeyColumn;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdG9ycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9kZWNvcmF0b3JzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDRCQUEwQjtBQWExQixNQUFNLE1BQU0sR0FBRyxFQUdaLENBQUM7QUFFSjs7R0FFRztBQUNILFNBQWdCLFdBQVc7SUFDdkIsT0FBTyxNQUFNLENBQUM7QUFDbEIsQ0FBQztBQUZELGtDQUVDO0FBRUQsU0FBZ0IsU0FBUztJQUNyQixPQUFPLE1BQU0sQ0FBQztBQUNsQixDQUFDO0FBRkQsOEJBRUM7QUFFRCxTQUFnQixLQUFLLENBQUMsU0FBa0I7SUFDcEMsT0FBTyxDQUFDLE1BQWdCLEVBQUUsRUFBRTtRQUN4QixNQUFNLENBQUMsU0FBUyxDQUFDLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNwRCxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxTQUFTLEVBQUUsU0FBUyxhQUFULFNBQVMsY0FBVCxTQUFTLEdBQUksTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckcsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLGFBQVQsU0FBUyxjQUFULFNBQVMsR0FBSSxNQUFNLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzdFLENBQUMsQ0FBQztBQUNOLENBQUM7QUFQRCxzQkFPQztBQUVEOztHQUVHO0FBQ1UsUUFBQSxNQUFNLEdBQUcsS0FBSyxDQUFDO0FBRTVCLFNBQWdCLGdCQUFnQixDQUFDLFVBQW9CO0lBQ2pELE9BQU8sT0FBTyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFGRCw0Q0FFQztBQUVELFNBQWdCLFlB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QyxJQUFJLGtEQUFrRCxDQUFDLENBQUM7S0FDbkk7SUFDRCxPQUFPLGdCQUFnQixDQUFDO0FBQzVCLENBQUM7QUFWRCxrREFVQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBcInJlZmxlY3QtbWV0YWRhdGFcIjtcblxuaW50ZXJmYWNlIElDb2x1bW5EYXRhIHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgLyoqXG4gICAgICogQGRlcHJlY2F0ZWRcbiAgICAgKi9cbiAgICBwcmltYXJ5OiBib29sZWFuO1xuICAgIHByb3BlcnR5S2V5OiBzdHJpbmc7XG4gICAgaXNGb3JlaWduS2V5OiBib29sZWFuO1xuICAgIGRlc2lnblR5cGU6IGFueTtcbn1cblxuY29uc3QgdGFibGVzID0gW10gYXMge1xuICAgIHRhYmxlTmFtZTogc3RyaW5nO1xuICAgIHRhYmxlQ2xhc3M6IEZ1bmN0aW9uO1xufVtdO1xuXG4vKipcbiAqIEBkZXByZWNhdGVkIHVzZSBgZ2V0VGFibGVzYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEVudGl0aWVzKCkge1xuICAgIHJldHVybiB0YWJsZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUYWJsZXMoKSB7XG4gICAgcmV0dXJuIHRhYmxlcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIFRhYmxlKHRhYmxlTmFtZT86IHN0cmluZykge1xuICAgIHJldHVybiAodGFyZ2V0OiBGdW5jdGlvbikgPT4ge1xuICAgICAgICB0YXJnZXQucHJvdG90eXBlLnRhYmxlTWV0YWRhdGFLZXkgPSBTeW1ib2woXCJ0YWJsZVwiKTtcbiAgICAgICAgUmVmbGVjdC5tZXRhZGF0YSh0YXJnZXQucHJvdG90eXBlLnRhYmxlTWV0YWRhdGFLZXksIHsgdGFibGVOYW1lOiB0YWJsZU5hbWUgPz8gdGFyZ2V0Lm5hbWUgfSkodGFyZ2V0KTtcblxuICAgICAgICB0YWJsZXMucHVzaCh7IHRhYmxlTmFtZTogdGFibGVOYW1lID8/IHRhcmdldC5uYW1lLCB0YWJsZUNsYXNzOiB0YXJnZXQgfSk7XG4gICAgfTtcbn1cblxuLyoqXG4gKiBAZGVwcmVjYXRlZCB1c2UgYFRhYmxlYC5cbiAqL1xuZXhwb3J0IGNvbnN0IEVudGl0eSA9IFRhYmxlO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VGFibGVNZXRhZGF0YSh0YWJsZUNsYXNzOiBGdW5jdGlvbik6IHsgdGFibGVOYW1lOiBzdHJpbmcgfSB7XG4gICAgcmV0dXJuIFJlZmxlY3QuZ2V0TWV0YWRhdGEodGFibGVDbGFzcy5wcm90b3R5cGUudGFibGVNZXRhZGF0YUtleSwgdGFibGVDbGFzcyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUYWJsZU5hbWUodGFibGVDbGFzczogRnVuY3Rpb24pOiBzdHJpbmcge1xuICAgIHJldHVybiBnZXRUYWJsZU1ldGFkYXRhKHRhYmxlQ2xhc3MpLnRhYmxlTmFtZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbHVtbk5hbWU8VD4odGFibGVDbGFzczogbmV3ICgpID0+IFQsIHByb3BlcnR5TmFtZToga2V5b2YgVCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGdldENvbHVtbkluZm9ybWF0aW9uKHRhYmxlQ2xhc3MsIHByb3BlcnR5TmFtZSBhcyBzdHJpbmcpLm5hbWU7XG59XG5cbmNvbnN0IGNvbHVtbk1ldGFkYXRhS2V5ID0gU3ltYm9sKFwiY29sdW1uXCIpO1xuXG5pbnRlcmZhY2UgSUNvbHVtbk9wdGlvbnMge1xuICAgIC8qKlxuICAgICAqIENvbHVtbiBuYW1lIGluIHRoZSBkYXRhYmFzZS5cbiAgICAgKi9cbiAgICBuYW1lPzogc3RyaW5nO1xuXG4gICAgLyoqXG4gICAgICogSW5kaWNhdGVzIGlmIHRoaXMgY29sdW1uIGlzIGEgcHJpbWFyeSBrZXkuXG4gICAgICovXG4gICAgcHJpbWFyeT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBDb2x1bW4ob3B0aW9ucz86IElDb2x1bW5PcHRpb25zKTogKHRhcmdldDogb2JqZWN0LCBwcm9wZXJ0eUtleTogc3RyaW5nKSA9PiB2b2lkIHtcbiAgICByZXR1cm4gZ2V0UmVnaXN0ZXJDb2x1bW4ob3B0aW9ucyk7XG59XG5cbmZ1bmN0aW9uIGdldFJlZ2lzdGVyQ29sdW1uKG9wdGlvbnM/OiBJQ29sdW1uT3B0aW9ucykge1xuICAgIGZ1bmN0aW9uIHJlZ2lzdGVyQ29sdW1uKHRhcmdldDogYW55LCBwcm9wZXJ0eUtleTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIFJlZmxlY3QubWV0YWRhdGEoY29sdW1uTWV0YWRhdGFLZXksIHsgaXNDb2x1bW46IHRydWUgfSkodGFyZ2V0KTtcblxuICAgICAgICBjb25zdCBkZXNpZ25UeXBlID0gUmVmbGVjdC5nZXRNZXRhZGF0YShcImRlc2lnbjp0eXBlXCIsIHRhcmdldCwgcHJvcGVydHlLZXkpO1xuICAgICAgICBjb25zdCBpc0ZvcmVpZ25LZXkgPSBkZXNpZ25UeXBlID8gW1wiU3RyaW5nXCIsIFwiTnVtYmVyXCIsIFwiQm9vbGVhblwiXS5pbmNsdWRlcyhkZXNpZ25UeXBlLm5hbWUpID09PSBmYWxzZSA6IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IGNvbHVtbnM6IElDb2x1bW5EYXRhW10gPSB0YXJnZXQuY29uc3RydWN0b3IucHJvdG90eXBlLnRhYmxlQ29sdW1ucyB8fCBbXTtcblxuICAgICAgICBsZXQgbmFtZSA9IHByb3BlcnR5S2V5O1xuICAgICAgICAvLyBjb25zb2xlLmxvZygnbmFtZTogJywgbmFtZSk7XG4gICAgICAgIGxldCBwcmltYXJ5ID0gZmFsc2U7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKCdvcHRpb25zOiAnLCBvcHRpb25zKTtcbiAgICAgICAgaWYgKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLm5hbWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIG5hbWUgPSBvcHRpb25zLm5hbWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwcmltYXJ5ID0gb3B0aW9ucy5wcmltYXJ5ID09PSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29sdW1ucy5wdXNoKHsgbmFtZSwgcHJpbWFyeSwgcHJvcGVydHlLZXksIGlzRm9yZWlnbktleSwgZGVzaWduVHlwZSB9KTtcbiAgICAgICAgdGFyZ2V0LmNvbnN0cnVjdG9yLnByb3RvdHlwZS50YWJsZUNvbHVtbnMgPSBjb2x1bW5zO1xuICAgIH1cblxuICAgIHJldHVybiByZWdpc3RlckNvbHVtbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbHVtbkluZm9ybWF0aW9uKHRhcmdldDogRnVuY3Rpb24sIHByb3BlcnR5S2V5OiBzdHJpbmcpOiB7IGNvbHVtbkNsYXNzOiBuZXcgKCkgPT4gYW55IH0gJiBJQ29sdW1uRGF0YSB7XG4gICAgY29uc3QgcHJvcGVydGllcyA9IGdldENvbHVtblByb3BlcnRpZXModGFyZ2V0KTtcblxuICAgIGNvbnN0IHByb3BlcnR5ID0gcHJvcGVydGllcy5maW5kKChpKSA9PiBpLnByb3BlcnR5S2V5ID09PSBwcm9wZXJ0eUtleSk7XG4gICAgaWYgKCFwcm9wZXJ0eSkge1xuICAgICAgICBjb25zdCBma09iamVjdCA9IHByb3BlcnRpZXMuZmluZCgocCkgPT4gcC5uYW1lID09PSBwcm9wZXJ0eUtleSk7XG4gICAgICAgIGlmICh0eXBlb2YgZmtPYmplY3Q/LmRlc2lnblR5cGUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIGBJdCBzZWVtcyB0aGF0IGNsYXNzIFwiJHt0YXJnZXQubmFtZX1cIiBvbmx5IGhhcyBhIGZvcmVpZ24ga2V5IG9iamVjdCBcIiR7ZmtPYmplY3QucHJvcGVydHlLZXl9XCIsIGJ1dCBpcyBtaXNzaW5nIHRoZSBmb3JlaWduIGtleSBwcm9wZXJ0eSBcIiR7cHJvcGVydHlLZXl9XCIuIFRyeSBhZGRpbmcgXCJAY29sdW1uKCkgJHtwcm9wZXJ0eUtleX0gOiBbY29ycmVjdCB0eXBlXVwiIHRvIGNsYXNzIFwiJHt0YXJnZXQubmFtZX1cImBcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZ2V0IGNvbHVtbiBkYXRhLiBEaWQgeW91IHNldCBAQ29sdW1uKCkgYXR0cmlidXRlIG9uICR7dGFyZ2V0Lm5hbWV9LiR7cHJvcGVydHlLZXl9P2ApO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBjb2x1bW5DbGFzczogUmVmbGVjdC5nZXRNZXRhZGF0YShcImRlc2lnbjp0eXBlXCIsIHRhcmdldC5wcm90b3R5cGUsIHByb3BlcnR5S2V5KSxcbiAgICAgICAgbmFtZTogcHJvcGVydHkubmFtZSxcbiAgICAgICAgcHJpbWFyeTogcHJvcGVydHkucHJpbWFyeSxcbiAgICAgICAgcHJvcGVydHlLZXk6IHByb3BlcnR5LnByb3BlcnR5S2V5LFxuICAgICAgICBkZXNpZ25UeXBlOiBwcm9wZXJ0eS5kZXNpZ25UeXBlLFxuICAgICAgICBpc0ZvcmVpZ25LZXk6IHByb3BlcnR5LmlzRm9yZWlnbktleSxcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29sdW1uUHJvcGVydGllcyh0YWJsZUNsYXNzOiBGdW5jdGlvbik6IElDb2x1bW5EYXRhW10ge1xuICAgIGNvbnN0IGNvbHVtbnM6IElDb2x1bW5EYXRhW10gPSB0YWJsZUNsYXNzLnByb3RvdHlwZS50YWJsZUNvbHVtbnM7XG4gICAgaWYgKCFjb2x1bW5zKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGdldCBjb2x1bW4gZGF0YSBmcm9tICR7dGFibGVDbGFzcy5jb25zdHJ1Y3Rvci5uYW1lfSwgZGlkIHlvdSBzZXQgQENvbHVtbigpIGF0dHJpYnV0ZT9gKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbHVtbnM7XG59XG5cbi8qKlxuICogQGRlcHJlY2F0ZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFByaW1hcnlLZXlDb2x1bW4odGFibGVDbGFzczogRnVuY3Rpb24pOiBJQ29sdW1uRGF0YSB7XG4gICAgY29uc3QgY29sdW1uczogSUNvbHVtbkRhdGFbXSA9IHRhYmxlQ2xhc3MucHJvdG90eXBlLnRhYmxlQ29sdW1ucztcbiAgICBpZiAoIWNvbHVtbnMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZ2V0IGNvbHVtbiBkYXRhIGZyb20gJHt0YWJsZUNsYXNzLmNvbnN0cnVjdG9yLm5hbWV9LCBkaWQgeW91IHNldCBAQ29sdW1uKCkgYXR0cmlidXRlP2ApO1xuICAgIH1cbiAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uID0gY29sdW1ucy5maW5kKChpKSA9PiBpLnByaW1hcnkpO1xuICAgIGlmIChwcmltYXJ5S2V5Q29sdW1uID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZ2V0IHByaW1hcnkga2V5IGNvbHVtbiAke3RhYmxlQ2xhc3MuY29uc3RydWN0b3IubmFtZX0sIGRpZCB5b3Ugc2V0IEBDb2x1bW4oe3ByaW1hcnk6dHJ1ZX0pIGF0dHJpYnV0ZT9gKTtcbiAgICB9XG4gICAgcmV0dXJuIHByaW1hcnlLZXlDb2x1bW47XG59XG4iXX0=
