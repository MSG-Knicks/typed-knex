import type { Temporal } from "temporal-polyfill";
import "reflect-metadata";
import type { Granularity } from "./typedKnex";
export declare type TemporalColumnType = typeof Temporal.PlainDate | typeof Temporal.PlainDateTime | typeof Temporal.PlainMonthDay | typeof Temporal.PlainTime | typeof Temporal.PlainYearMonth | typeof Temporal.ZonedDateTime;
interface IColumnData {
    name: string;
    /**
     * @deprecated
     */
    primary: boolean;
    propertyKey: string;
    isForeignKey: boolean;
    designType: any;
    columnType: TemporalColumnType | any;
}
declare type TableMetadata = {
    tableName: string;
    defaultLock: Granularity | undefined;
};
/**
 * @deprecated use `getTables`.
 */
export declare function getEntities(): (TableMetadata & {
    tableClass: Function;
})[];
export declare function getTables(): (TableMetadata & {
    tableClass: Function;
})[];
export declare function Table(tableName?: string, defaultLock?: Granularity): (target: Function) => void;
/**
 * @deprecated use `Table`.
 */
export declare const Entity: typeof Table;
export declare function getTableMetadata(tableClass: Function): TableMetadata;
export declare function getTableName(tableClass: Function): string;
export declare function getColumnName<T>(tableClass: new () => T, propertyName: keyof T): string;
interface IColumnOptions {
    /**
     * Column name in the database.
     */
    name?: string;
    /**
     * Indicates if this column is a primary key.
     */
    primary?: boolean;
    /**
     * The Temporal class of this column. Required when the property's declared type is a union
     * (e.g. `Temporal.PlainDate | null`), because decorator metadata erases unions to `Object`.
     */
    type?: TemporalColumnType;
}
export declare function Column(options?: IColumnOptions): (target: object, propertyKey: string) => void;
export declare function getColumnInformation(target: Function, propertyKey: string): {
    columnClass: new () => any;
} & IColumnData;
export declare function getColumnProperties(tableClass: Function): IColumnData[];
/**
 * @deprecated
 */
export declare function getPrimaryKeyColumn(tableClass: Function): IColumnData;
export {};
