"use strict";
var __createBinding =
    (this && this.__createBinding) ||
    (Object.create
        ? function (o, m, k, k2) {
              if (k2 === undefined) k2 = k;
              var desc = Object.getOwnPropertyDescriptor(m, k);
              if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                  desc = {
                      enumerable: true,
                      get: function () {
                          return m[k];
                      },
                  };
              }
              Object.defineProperty(o, k2, desc);
          }
        : function (o, m, k, k2) {
              if (k2 === undefined) k2 = k;
              o[k2] = m[k];
          });
var __setModuleDefault =
    (this && this.__setModuleDefault) ||
    (Object.create
        ? function (o, v) {
              Object.defineProperty(o, "default", { enumerable: true, value: v });
          }
        : function (o, v) {
              o["default"] = v;
          });
var __importStar =
    (this && this.__importStar) ||
    function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
        __setModuleDefault(result, mod);
        return result;
    };
Object.defineProperty(exports, "__esModule", { value: true });
exports.flattenByOption = exports.setToNull = exports.unflatten = exports.FlattenOption = void 0;
const flat = __importStar(require("flat"));
var FlattenOption;
(function (FlattenOption) {
    FlattenOption["flatten"] = "flatten";
    /**
     * @deprecated since version 2.8.1, use .keepFlat()
     */
    FlattenOption["noFlatten"] = "noFlatten";
    FlattenOption["flattenAndSetToNull"] = "flattenAndSetToNull";
})((FlattenOption = exports.FlattenOption || (exports.FlattenOption = {})));
function unflatten(o) {
    if (o instanceof Array) {
        return o.map((i) => unflatten(i));
    }
    return flat.unflatten(o);
}
exports.unflatten = unflatten;
function areAllPropertiesNull(o) {
    if (o === null || o === undefined) {
        return false;
    }
    const keys = Object.keys(o);
    if (keys.length === 0) {
        return false;
    }
    let allNull = true;
    for (const key of keys) {
        if (o[key] !== null) {
            allNull = false;
            break;
        }
    }
    return allNull;
}
function setToNull(o) {
    if (o instanceof Array) {
        return o.map((i) => setToNull(i));
    } else {
        if (o !== null && o !== undefined) {
            const keys = Object.keys(o);
            for (const key of keys) {
                if (typeof o[key] === "object") {
                    setToNull(o[key]);
                    if (areAllPropertiesNull(o[key])) {
                        o[key] = null;
                    }
                }
            }
        }
    }
    return o;
}
exports.setToNull = setToNull;
function flattenByOption(o, flattenOption) {
    if (flattenOption === FlattenOption.noFlatten) {
        return o;
    }
    const unflattened = unflatten(o);
    if (flattenOption === undefined || flattenOption === FlattenOption.flatten) {
        return unflattened;
    }
    return setToNull(unflattened);
}
exports.flattenByOption = flattenByOption;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5mbGF0dGVuLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3VuZmxhdHRlbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJDQUE2QjtBQUU3QixJQUFZLGFBT1g7QUFQRCxXQUFZLGFBQWE7SUFDckIsb0NBQW1CLENBQUE7SUFDbkI7O09BRUc7SUFDSCx3Q0FBdUIsQ0FBQTtJQUN2Qiw0REFBMkMsQ0FBQTtBQUMvQyxDQUFDLEVBUFcsYUFBYSxHQUFiLHFCQUFhLEtBQWIscUJBQWEsUUFPeEI7QUFFRCxTQUFnQixTQUFTLENBQUMsQ0FBTTtJQUM1QixJQUFJLENBQUMsWUFBWSxLQUFLLEVBQUU7UUFDcEIsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNyQztJQUNELE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM3QixDQUFDO0FBTEQsOEJBS0M7QUFFRCxTQUFTLG9CQUFvQixDQUFDLENBQU07SUFDaEMsSUFBSSxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxTQUFTLEVBQUU7UUFDL0IsT0FBTyxLQUFLLENBQUM7S0FDaEI7SUFDRCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVCLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7UUFDbkIsT0FBTyxLQUFLLENBQUM7S0FDaEI7SUFDRCxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUM7SUFDbkIsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUU7UUFDcEIsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQ2pCLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDaEIsTUFBTTtTQUNUO0tBQ0o7SUFDRCxPQUFPLE9BQU8sQ0FBQztBQUNuQixDQUFDO0FBRUQsU0FBZ0IsU0FBUyxDQUFDLENBQU07SUFDNUIsSUFBSSxDQUFDLFlBQVksS0FBSyxFQUFFO1FBQ3BCLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDckM7U0FBTTtRQUNILElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssU0FBUyxFQUFFO1lBQy9CLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUIsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUU7Z0JBQ3BCLElBQUksT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssUUFBUSxFQUFFO29CQUM1QixTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQ2xCLElBQUksb0JBQW9CLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUU7d0JBQzlCLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUM7cUJBQ2pCO2lCQUNKO2FBQ0o7U0FDSjtLQUNKO0lBQ0QsT0FBTyxDQUFDLENBQUM7QUFDYixDQUFDO0FBakJELDhCQWlCQztBQUVELFNBQWdCLGVBQWUsQ0FBQyxDQUFNLEVBQUUsYUFBNkI7SUFDakUsSUFBSSxhQUFhLEtBQUssYUFBYSxDQUFDLFNBQVMsRUFBRTtRQUMzQyxPQUFPLENBQUMsQ0FBQztLQUNaO0lBQ0QsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pDLElBQUksYUFBYSxLQUFLLFNBQVMsSUFBSSxhQUFhLEtBQUssYUFBYSxDQUFDLE9BQU8sRUFBRTtRQUN4RSxPQUFPLFdBQVcsQ0FBQztLQUN0QjtJQUNELE9BQU8sU0FBUyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ2xDLENBQUM7QUFURCwwQ0FTQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZsYXQgZnJvbSBcImZsYXRcIjtcblxuZXhwb3J0IGVudW0gRmxhdHRlbk9wdGlvbiB7XG4gICAgZmxhdHRlbiA9IFwiZmxhdHRlblwiLFxuICAgIC8qKlxuICAgICAqIEBkZXByZWNhdGVkIHNpbmNlIHZlcnNpb24gMi44LjEsIHVzZSAua2VlcEZsYXQoKVxuICAgICAqL1xuICAgIG5vRmxhdHRlbiA9IFwibm9GbGF0dGVuXCIsXG4gICAgZmxhdHRlbkFuZFNldFRvTnVsbCA9IFwiZmxhdHRlbkFuZFNldFRvTnVsbFwiLFxufVxuXG5leHBvcnQgZnVuY3Rpb24gdW5mbGF0dGVuKG86IGFueSk6IGFueSB7XG4gICAgaWYgKG8gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICByZXR1cm4gby5tYXAoKGkpID0+IHVuZmxhdHRlbihpKSk7XG4gICAgfVxuICAgIHJldHVybiBmbGF0LnVuZmxhdHRlbihvKTtcbn1cblxuZnVuY3Rpb24gYXJlQWxsUHJvcGVydGllc051bGwobzogYW55KSB7XG4gICAgaWYgKG8gPT09IG51bGwgfHwgbyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKG8pO1xuICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGxldCBhbGxOdWxsID0gdHJ1ZTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICAgIGlmIChvW2tleV0gIT09IG51bGwpIHtcbiAgICAgICAgICAgIGFsbE51bGwgPSBmYWxzZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhbGxOdWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0VG9OdWxsKG86IGFueSk6IGFueSB7XG4gICAgaWYgKG8gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICByZXR1cm4gby5tYXAoKGkpID0+IHNldFRvTnVsbChpKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKG8gIT09IG51bGwgJiYgbyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMobyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBvW2tleV0gPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2V0VG9OdWxsKG9ba2V5XSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmVBbGxQcm9wZXJ0aWVzTnVsbChvW2tleV0pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvW2tleV0gPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmxhdHRlbkJ5T3B0aW9uKG86IGFueSwgZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICBpZiAoZmxhdHRlbk9wdGlvbiA9PT0gRmxhdHRlbk9wdGlvbi5ub0ZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIG87XG4gICAgfVxuICAgIGNvbnN0IHVuZmxhdHRlbmVkID0gdW5mbGF0dGVuKG8pO1xuICAgIGlmIChmbGF0dGVuT3B0aW9uID09PSB1bmRlZmluZWQgfHwgZmxhdHRlbk9wdGlvbiA9PT0gRmxhdHRlbk9wdGlvbi5mbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiB1bmZsYXR0ZW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIHNldFRvTnVsbCh1bmZsYXR0ZW5lZCk7XG59XG4iXX0=
