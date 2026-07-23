import { ICustomDatabaseType } from "./ICustomDatabaseType";
import { Temporal, Intl } from "temporal-polyfill";

export type SelectableColumnTypes = string | number | boolean | Date | Temporal.CalendarLike | Intl.Formattable | undefined | null | any[] | ICustomDatabaseType;
