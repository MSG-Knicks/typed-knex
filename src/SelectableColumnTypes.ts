import type { Temporal, Intl } from "temporal-polyfill";
import { ICustomDatabaseType } from "./ICustomDatabaseType";

export type SelectableColumnTypes = string | number | boolean | Date | Temporal.CalendarLike | Intl.Formattable | undefined | null | any[] | ICustomDatabaseType;
