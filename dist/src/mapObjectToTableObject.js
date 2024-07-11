"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapObjectToTableObject = void 0;
const decorators_1 = require("./decorators");
/**
 * @deprecated use mapPropertiesToColumns
 */
function mapObjectToTableObject(tableClass, input) {
    const output = {};
    for (const key of Object.keys(input)) {
        const columnInformation = (0, decorators_1.getColumnInformation)(tableClass, key);
        output[columnInformation.name] = input[key];
    }
    return output;
}
exports.mapObjectToTableObject = mapObjectToTableObject;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFwT2JqZWN0VG9UYWJsZU9iamVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYXBPYmplY3RUb1RhYmxlT2JqZWN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZDQUFvRDtBQUVwRDs7R0FFRztBQUNILFNBQWdCLHNCQUFzQixDQUFJLFVBQXVCLEVBQUUsS0FBaUI7SUFDaEYsTUFBTSxNQUFNLEdBQUcsRUFBeUIsQ0FBQztJQUN6QyxLQUFLLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDbEMsTUFBTSxpQkFBaUIsR0FBRyxJQUFBLGlDQUFvQixFQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNoRSxNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEdBQUksS0FBNkIsQ0FBQyxHQUFHLENBQUMsQ0FBQztLQUN4RTtJQUNELE9BQU8sTUFBTSxDQUFDO0FBQ2xCLENBQUM7QUFQRCx3REFPQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGdldENvbHVtbkluZm9ybWF0aW9uIH0gZnJvbSBcIi4vZGVjb3JhdG9yc1wiO1xuXG4vKipcbiAqIEBkZXByZWNhdGVkIHVzZSBtYXBQcm9wZXJ0aWVzVG9Db2x1bW5zXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXBPYmplY3RUb1RhYmxlT2JqZWN0PFQ+KHRhYmxlQ2xhc3M6IG5ldyAoKSA9PiBULCBpbnB1dDogUGFydGlhbDxUPik6IHt9IHtcbiAgICBjb25zdCBvdXRwdXQgPSB7fSBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGlucHV0KSkge1xuICAgICAgICBjb25zdCBjb2x1bW5JbmZvcm1hdGlvbiA9IGdldENvbHVtbkluZm9ybWF0aW9uKHRhYmxlQ2xhc3MsIGtleSk7XG4gICAgICAgIG91dHB1dFtjb2x1bW5JbmZvcm1hdGlvbi5uYW1lXSA9IChpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+KVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3V0cHV0O1xufVxuIl19