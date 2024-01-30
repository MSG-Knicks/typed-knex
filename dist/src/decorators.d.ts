import "reflect-metadata";
interface IColumnData {
    name: string;
    /**
     * @deprecated
     */
    primary: boolean;
    propertyKey: string;
    isForeignKey: boolean;
    designType: any;
}
/**
 * @deprecated use `getTables`.
 */
export declare function getEntities(): {
    tableName: string;
    tableClass: Function;
}[];
export declare function getTables(): {
    tableName: string;
    tableClass: Function;
}[];
export declare function Table(tableName?: string): (target: Function) => void;
/**
 * @deprecated use `Table`.
 */
export declare const Entity: typeof Table;
export declare function getTableMetadata(tableClass: Function): {
    tableName: string;
};
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
