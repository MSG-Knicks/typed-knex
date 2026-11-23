#!/usr/bin/env node
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
const yargs = __importStar(require("yargs"));
const upgradeRunner_1 = require("./upgrade/upgradeRunner");
async function main() {
    const argv = await yargs
        .usage("Usage: $0 [-p tsconfig.json][-u upgrade] action(s)")
        .options({ u: { type: "boolean" }, p: { type: "string" } })
        .describe({ u: "Run upgrader", h: "Display this help message" })
        .boolean(["u", "h"])
        .help()
        .string("_")
        .alias("h", "help").argv;
    if (argv.u) {
        (0, upgradeRunner_1.runUpgrade)(argv._, argv.p);
    } else {
        yargs.showHelp();
    }
}
main();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2NsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLDZDQUErQjtBQUMvQiwyREFBcUQ7QUFFckQsS0FBSyxVQUFVLElBQUk7SUFDZixNQUFNLElBQUksR0FBRyxNQUFNLEtBQUs7U0FDbkIsS0FBSyxDQUFDLG9EQUFvRCxDQUFDO1NBQzNELE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztTQUMxRCxRQUFRLENBQUMsRUFBRSxDQUFDLEVBQUUsY0FBYyxFQUFFLENBQUMsRUFBRSwyQkFBMkIsRUFBRSxDQUFDO1NBQy9ELE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztTQUNuQixJQUFJLEVBQUU7U0FDTixNQUFNLENBQUMsR0FBRyxDQUFDO1NBQ1gsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFFN0IsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFO1FBQ1IsSUFBQSwwQkFBVSxFQUFDLElBQUksQ0FBQyxDQUFhLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQzFDO1NBQU07UUFDSCxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7S0FDcEI7QUFDTCxDQUFDO0FBRUQsSUFBSSxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQgKiBhcyB5YXJncyBmcm9tIFwieWFyZ3NcIjtcbmltcG9ydCB7IHJ1blVwZ3JhZGUgfSBmcm9tIFwiLi91cGdyYWRlL3VwZ3JhZGVSdW5uZXJcIjtcblxuYXN5bmMgZnVuY3Rpb24gbWFpbigpIHtcbiAgICBjb25zdCBhcmd2ID0gYXdhaXQgeWFyZ3NcbiAgICAgICAgLnVzYWdlKFwiVXNhZ2U6ICQwIFstcCB0c2NvbmZpZy5qc29uXVstdSB1cGdyYWRlXSBhY3Rpb24ocylcIilcbiAgICAgICAgLm9wdGlvbnMoeyB1OiB7IHR5cGU6IFwiYm9vbGVhblwiIH0sIHA6IHsgdHlwZTogXCJzdHJpbmdcIiB9IH0pXG4gICAgICAgIC5kZXNjcmliZSh7IHU6IFwiUnVuIHVwZ3JhZGVyXCIsIGg6IFwiRGlzcGxheSB0aGlzIGhlbHAgbWVzc2FnZVwiIH0pXG4gICAgICAgIC5ib29sZWFuKFtcInVcIiwgXCJoXCJdKVxuICAgICAgICAuaGVscCgpXG4gICAgICAgIC5zdHJpbmcoXCJfXCIpXG4gICAgICAgIC5hbGlhcyhcImhcIiwgXCJoZWxwXCIpLmFyZ3Y7XG5cbiAgICBpZiAoYXJndi51KSB7XG4gICAgICAgIHJ1blVwZ3JhZGUoYXJndi5fIGFzIHN0cmluZ1tdLCBhcmd2LnApO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHlhcmdzLnNob3dIZWxwKCk7XG4gICAgfVxufVxuXG5tYWluKCk7XG4iXX0=
