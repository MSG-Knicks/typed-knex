import { ICustomDatabaseType } from "./ICustomDatabaseType";
import { Temporal } from "temporal-polyfill";

export type SelectableColumnTypes = string | number | boolean | Date | Temporal.PlainDate | undefined | null | any[] | ICustomDatabaseType;
