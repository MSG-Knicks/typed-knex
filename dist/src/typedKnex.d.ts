import { Knex } from "knex";
import { NestedForeignKeyKeysOf, NestedKeysOf } from "./NestedKeysOf";
import { NestedRecord } from "./NestedRecord";
import { NonForeignKeyObjects } from "./NonForeignKeyObjects";
import { NonNullableRecursive } from "./NonNullableRecursive";
import { PartialAndUndefined } from "./PartialAndUndefined";
import { GetNestedProperty, GetNestedPropertyType } from "./PropertyTypes";
import { SelectableColumnTypes } from "./SelectableColumnTypes";
import { FlattenOption } from "./unflatten";
export declare class TypedKnex {
    private knex;
    constructor(knex: Knex);
    query<T>(tableClass: new () => T, granularity?: Granularity): ITypedQueryBuilder<T, T, T>;
    with<T, U, V>(cteTableClass: new () => T, cteQuery: (queryBuilder: TypedKnexCTEQueryBuilder) => ITypedQueryBuilder<U, V, T>): TypedKnexQueryBuilder;
    beginTransaction(): Promise<Knex.Transaction>;
}
declare class TypedKnexCTEQueryBuilder {
    protected knex: Knex;
    protected queryBuilder: Knex.QueryBuilder;
    constructor(knex: Knex, queryBuilder: Knex.QueryBuilder);
    query<T>(tableClass: new () => T, granularity?: Granularity): ITypedQueryBuilder<T, T, T>;
}
declare class TypedKnexQueryBuilder extends TypedKnexCTEQueryBuilder {
    with<T, U, V>(cteTableClass: new () => T, cteQuery: (queryBuilder: TypedKnexCTEQueryBuilder) => ITypedQueryBuilder<U, V, T>): TypedKnexQueryBuilder;
}
export declare function registerBeforeInsertTransform<T>(f: (item: T, typedQueryBuilder: ITypedQueryBuilder<{}, {}, {}>) => T): void;
export declare function registerBeforeUpdateTransform<T>(f: (item: T, typedQueryBuilder: ITypedQueryBuilder<{}, {}, {}>) => T): void;
declare class ColumnFromQuery {
    private alias;
    constructor(alias: string);
    toString(): string;
}
export interface ITypedQueryBuilder<Model, SelectableModel, Row> {
    columns: {
        name: string;
    }[];
    where: IWhereWithOperator<Model, SelectableModel, Row>;
    andWhere: IWhereWithOperator<Model, SelectableModel, Row>;
    orWhere: IWhereWithOperator<Model, SelectableModel, Row>;
    whereNot: IWhere<Model, SelectableModel, Row>;
    select: ISelectWithFunctionColumns3<Model, SelectableModel, Row extends Model ? {} : Row>;
    selectQuery: ISelectQuery<Model, SelectableModel, Row>;
    orderBy: IOrderBy<Model, SelectableModel, Row>;
    innerJoinColumn: IKeyFunctionAsParametersReturnQueryBuider<Model, SelectableModel, Row>;
    leftOuterJoinColumn: IKeyFunctionAsParametersReturnQueryBuider<Model, SelectableModel, Row>;
    whereColumn: IWhereCompareTwoColumns<Model, SelectableModel, Row>;
    whereNull: IColumnParameterNoRowTransformation<Model, SelectableModel, Row>;
    whereNotNull: IColumnParameterNoRowTransformation<Model, SelectableModel, Row>;
    orWhereNull: IColumnParameterNoRowTransformation<Model, SelectableModel, Row>;
    orWhereNotNull: IColumnParameterNoRowTransformation<Model, SelectableModel, Row>;
    leftOuterJoinTableOnFunction: IJoinTableMultipleOnClauses<Model, SelectableModel, Row extends Model ? {} : Row>;
    innerJoinTableOnFunction: IJoinTableMultipleOnClauses<Model, SelectableModel, Row extends Model ? {} : Row>;
    innerJoin: IJoin<Model, SelectableModel, Row extends Model ? {} : Row>;
    leftOuterJoin: IJoin<Model, SelectableModel, Row extends Model ? {} : Row>;
    selectAlias: ISelectAlias<Model, SelectableModel, Row extends Model ? {} : Row>;
    selectRaw: ISelectRaw<Model, SelectableModel, Row extends Model ? {} : Row>;
    findByPrimaryKey: IFindByPrimaryKey<Model, SelectableModel, Row extends Model ? {} : Row>;
    whereIn: IWhereIn<Model, SelectableModel, Row>;
    whereNotIn: IWhereIn<Model, SelectableModel, Row>;
    orWhereIn: IWhereIn<Model, SelectableModel, Row>;
    orWhereNotIn: IWhereIn<Model, SelectableModel, Row>;
    whereBetween: IWhereBetween<Model, SelectableModel, Row>;
    whereNotBetween: IWhereBetween<Model, SelectableModel, Row>;
    orWhereBetween: IWhereBetween<Model, SelectableModel, Row>;
    orWhereNotBetween: IWhereBetween<Model, SelectableModel, Row>;
    whereExists: IWhereExists<Model, SelectableModel, Row>;
    orWhereExists: IWhereExists<Model, SelectableModel, Row>;
    whereNotExists: IWhereExists<Model, SelectableModel, Row>;
    orWhereNotExists: IWhereExists<Model, SelectableModel, Row>;
    whereParentheses: IWhereParentheses<Model, SelectableModel, Row>;
    orWhereParentheses: IWhereParentheses<Model, SelectableModel, Row>;
    groupBy: ISelectableColumnKeyFunctionAsParametersReturnQueryBuider<Model, SelectableModel, Row>;
    having: IHaving<Model, SelectableModel, Row>;
    havingNull: ISelectableColumnKeyFunctionAsParametersReturnQueryBuider<Model, SelectableModel, Row>;
    havingNotNull: ISelectableColumnKeyFunctionAsParametersReturnQueryBuider<Model, SelectableModel, Row>;
    havingIn: IWhereIn<Model, SelectableModel, Row>;
    havingNotIn: IWhereIn<Model, SelectableModel, Row>;
    havingExists: IWhereExists<Model, SelectableModel, Row>;
    havingNotExists: IWhereExists<Model, SelectableModel, Row>;
    havingBetween: IWhereBetween<Model, SelectableModel, Row>;
    havingNotBetween: IWhereBetween<Model, SelectableModel, Row>;
    union: IUnion<Model, SelectableModel, Row>;
    unionAll: IUnion<Model, SelectableModel, Row>;
    min: IDbFunctionWithAlias<Model, SelectableModel, Row extends Model ? {} : Row>;
    count: IDbFunctionWithAlias<Model, SelectableModel, Row extends Model ? {} : Row>;
    countDistinct: IDbFunctionWithAlias<Model, SelectableModel, Row extends Model ? {} : Row>;
    max: IDbFunctionWithAlias<Model, SelectableModel, Row extends Model ? {} : Row>;
    sum: IDbFunctionWithAlias<Model, SelectableModel, Row extends Model ? {} : Row>;
    sumDistinct: IDbFunctionWithAlias<Model, SelectableModel, Row extends Model ? {} : Row>;
    avg: IDbFunctionWithAlias<Model, SelectableModel, Row extends Model ? {} : Row>;
    avgDistinct: IDbFunctionWithAlias<Model, SelectableModel, Row extends Model ? {} : Row>;
    insertSelect: IInsertSelect;
    insertItemWithReturning: IInsertItemWithReturning<Model, SelectableModel, Row>;
    updateItemWithReturning: IInsertItemWithReturning<Model, SelectableModel, Row>;
    getColumnAlias(name: NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">): string;
    getColumn(name: NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">): ColumnFromQuery;
    distinctOn(columnNames: NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">[]): ITypedQueryBuilder<Model, SelectableModel, Row>;
    clearSelect(): ITypedQueryBuilder<Model, SelectableModel, Model>;
    clearWhere(): ITypedQueryBuilder<Model, SelectableModel, Row>;
    clearOrder(): ITypedQueryBuilder<Model, SelectableModel, Row>;
    limit(value: number): ITypedQueryBuilder<Model, SelectableModel, Row>;
    offset(value: number): ITypedQueryBuilder<Model, SelectableModel, Row>;
    useKnexQueryBuilder(f: (query: Knex.QueryBuilder) => void): ITypedQueryBuilder<Model, SelectableModel, Row>;
    getKnexQueryBuilder(): Knex.QueryBuilder;
    toQuery(): string;
    getFirstOrNull(flattenOption?: FlattenOption): Promise<(Row extends Model ? RemoveObjectsFrom<Model> : Row) | null>;
    getFirstOrUndefined(flattenOption?: FlattenOption): Promise<(Row extends Model ? RemoveObjectsFrom<Model> : Row) | undefined>;
    getFirst(flattenOption?: FlattenOption): Promise<Row extends Model ? RemoveObjectsFrom<Model> : Row>;
    getSingleOrNull(flattenOption?: FlattenOption): Promise<(Row extends Model ? RemoveObjectsFrom<Model> : Row) | null>;
    getSingleOrUndefined(flattenOption?: FlattenOption): Promise<(Row extends Model ? RemoveObjectsFrom<Model> : Row) | undefined>;
    getSingle(flattenOption?: FlattenOption): Promise<Row extends Model ? RemoveObjectsFrom<Model> : Row>;
    getMany(flattenOption?: FlattenOption): Promise<(Row extends Model ? RemoveObjectsFrom<Model> : Row)[]>;
    getCount(): Promise<number | string>;
    insertItem(newObject: PartialAndUndefined<RemoveObjectsFrom<Model>>): Promise<void>;
    insertItems(items: PartialAndUndefined<RemoveObjectsFrom<Model>>[]): Promise<void>;
    del(): Promise<void>;
    delByPrimaryKey(primaryKeyValue: any): Promise<void>;
    updateItem(item: PartialAndUndefined<RemoveObjectsFrom<Model>>): Promise<void>;
    updateItemByPrimaryKey(primaryKeyValue: any, item: PartialAndUndefined<RemoveObjectsFrom<Model>>): Promise<void>;
    updateItemsByPrimaryKey(items: {
        primaryKeyValue: any;
        data: PartialAndUndefined<RemoveObjectsFrom<Model>>;
    }[]): Promise<void>;
    execute(): Promise<void>;
    whereRaw(sql: string, ...bindings: string[]): ITypedQueryBuilder<Model, SelectableModel, Row>;
    havingRaw(sql: string, ...bindings: string[]): ITypedQueryBuilder<Model, SelectableModel, Row>;
    transacting(trx: Knex.Transaction): ITypedQueryBuilder<Model, SelectableModel, Row>;
    truncate(): Promise<void>;
    distinct(): ITypedQueryBuilder<Model, SelectableModel, Row>;
    clone(): ITypedQueryBuilder<Model, SelectableModel, Row>;
    groupByRaw(sql: string, ...bindings: string[]): ITypedQueryBuilder<Model, SelectableModel, Row>;
    orderByRaw(sql: string, ...bindings: string[]): ITypedQueryBuilder<Model, SelectableModel, Row>;
    keepFlat(): ITypedQueryBuilder<Model, SelectableModel, any>;
}
declare type ReturnNonObjectsNamesOnly<T> = {
    [K in keyof T]: T[K] extends SelectableColumnTypes ? K : never;
}[keyof T];
declare type RemoveObjectsFrom<T> = {
    [P in ReturnNonObjectsNamesOnly<T>]: T[P];
};
export declare type ObjectToPrimitive<T> = T extends String ? string : T extends Number ? number : T extends Boolean ? boolean : never;
export declare type Operator = "=" | "!=" | ">" | "<" | string;
interface IConstructor<T> {
    new (...args: any[]): T;
}
export declare type AddPropertyWithType<Original, NewKey extends keyof any, NewKeyType> = Original & NestedRecord<NewKey, NewKeyType>;
interface IInsertItemWithReturning<Model, _SelectableModel, _Row> {
    (newObject: Partial<RemoveObjectsFrom<Model>>): Promise<RemoveObjectsFrom<Model>>;
    <Keys extends keyof RemoveObjectsFrom<Model>>(newObject: Partial<RemoveObjectsFrom<Model>>, keys: Keys[]): Promise<Pick<RemoveObjectsFrom<Model>, Keys>>;
}
interface IColumnParameterNoRowTransformation<Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">>(key: ConcatKey): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
interface IJoinOn<Model, JoinedModel> {
    <ConcatKey1 extends NestedKeysOf<NonNullableRecursive<JoinedModel>, keyof NonNullableRecursive<JoinedModel>, "">, ConcatKey2 extends NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">>(key1: ConcatKey1, operator: Operator, key2: ConcatKey2): IJoinOnClause2<Model, JoinedModel>;
}
interface IJoinOnVal<Model, JoinedModel> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<JoinedModel>, keyof NonNullableRecursive<JoinedModel>, "">>(key: ConcatKey, operator: Operator, value: any): IJoinOnClause2<Model, JoinedModel>;
}
interface IJoinOnNull<Model, JoinedModel> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<JoinedModel>, keyof NonNullableRecursive<JoinedModel>, "">>(key: ConcatKey): IJoinOnClause2<Model, JoinedModel>;
}
interface IJoinOnClause2<Model, JoinedModel> {
    on: IJoinOn<Model, JoinedModel>;
    orOn: IJoinOn<Model, JoinedModel>;
    andOn: IJoinOn<Model, JoinedModel>;
    onVal: IJoinOnVal<Model, JoinedModel>;
    andOnVal: IJoinOnVal<Model, JoinedModel>;
    orOnVal: IJoinOnVal<Model, JoinedModel>;
    onNull: IJoinOnNull<Model, JoinedModel>;
}
interface IInsertSelect {
    <NewPropertyType, ConcatKey extends NestedKeysOf<NonNullableRecursive<NewPropertyType>, keyof NonNullableRecursive<NewPropertyType>, "">>(newPropertyClass: new () => NewPropertyType, ...columnNames: ConcatKey[]): Promise<void>;
}
interface IJoinTableMultipleOnClauses<Model, _SelectableModel, Row> {
    <NewPropertyType, NewPropertyKey extends keyof any>(newPropertyKey: NewPropertyKey, newPropertyClass: new () => NewPropertyType, on: (join: IJoinOnClause2<AddPropertyWithType<Model, NewPropertyKey, NewPropertyType>, NewPropertyType>) => void): ITypedQueryBuilder<AddPropertyWithType<Model, NewPropertyKey, NewPropertyType>, AddPropertyWithType<Model, NewPropertyKey, NewPropertyType>, Row>;
    <NewPropertyType, NewPropertyKey extends keyof any>(newPropertyKey: NewPropertyKey, newPropertyClass: new () => NewPropertyType, granularity: Granularity, on: (join: IJoinOnClause2<AddPropertyWithType<Model, NewPropertyKey, NewPropertyType>, NewPropertyType>) => void): ITypedQueryBuilder<AddPropertyWithType<Model, NewPropertyKey, NewPropertyType>, AddPropertyWithType<Model, NewPropertyKey, NewPropertyType>, Row>;
}
interface IJoin<Model, _SelectableModel, Row> {
    <NewPropertyType, NewPropertyKey extends keyof any, ConcatKey2 extends keyof NewPropertyType, ConcatKey extends NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">>(newPropertyKey: NewPropertyKey, newPropertyClass: new () => NewPropertyType, key: ConcatKey2, operator: Operator, key2: ConcatKey): ITypedQueryBuilder<AddPropertyWithType<Model, NewPropertyKey, NewPropertyType>, AddPropertyWithType<Model, NewPropertyKey, NewPropertyType>, Row>;
    <NewPropertyType, NewPropertyKey extends keyof any, ConcatKey2 extends keyof NewPropertyType, ConcatKey extends NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">>(newPropertyKey: NewPropertyKey, newPropertyClass: new () => NewPropertyType, granularity: Granularity, key: ConcatKey2, operator: Operator, key2: ConcatKey): ITypedQueryBuilder<AddPropertyWithType<Model, NewPropertyKey, NewPropertyType>, AddPropertyWithType<Model, NewPropertyKey, NewPropertyType>, Row>;
}
interface ISelectAlias<Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<SelectableModel>, keyof NonNullableRecursive<SelectableModel>, "">, TName extends keyof any>(alias: TName, columnName: ConcatKey): ITypedQueryBuilder<Model, SelectableModel, Record<TName, GetNestedPropertyType<SelectableModel, ConcatKey>> & Row>;
}
interface ISelectRaw<Model, SelectableModel, Row> {
    <TReturn extends Boolean | String | Number, TName extends keyof any>(name: TName, returnType: IConstructor<TReturn>, query: string, ...bindings: string[]): ITypedQueryBuilder<Model, SelectableModel, Record<TName, ObjectToPrimitive<TReturn>> & Row>;
}
interface ISelectQuery<Model, SelectableModel, Row> {
    <TReturn extends Boolean | String | Number, TName extends keyof any, SubQueryModel>(name: TName, returnType: IConstructor<TReturn>, subQueryModel: new () => SubQueryModel, code: (subQuery: ITypedQueryBuilder<SubQueryModel, SubQueryModel, {}>, parent: TransformPropsToFunctionsReturnPropertyName<Model>) => void, granularity?: Granularity): ITypedQueryBuilder<Model, SelectableModel, Record<TName, ObjectToPrimitive<TReturn>> & Row>;
}
declare type TransformPropsToFunctionsReturnPropertyName<Model> = {
    [P in keyof Model]: Model[P] extends object ? (Model[P] extends Required<NonForeignKeyObjects> ? () => P : TransformPropsToFunctionsReturnPropertyName<Model[P]>) : () => P;
};
interface IOrderBy<Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<SelectableModel>, keyof NonNullableRecursive<SelectableModel>, "">, TName extends keyof any>(columnNames: ConcatKey, direction?: "asc" | "desc"): ITypedQueryBuilder<Model, SelectableModel, Row & Record<TName, GetNestedPropertyType<SelectableModel, ConcatKey>>>;
}
interface IDbFunctionWithAlias<Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<SelectableModel>, keyof NonNullableRecursive<SelectableModel>, "">, TName extends keyof any>(columnNames: ConcatKey, name: TName): ITypedQueryBuilder<Model, SelectableModel, Row & Record<TName, GetNestedPropertyType<SelectableModel, ConcatKey>>>;
}
declare type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
interface ISelectWithFunctionColumns3<Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<SelectableModel>, keyof NonNullableRecursive<SelectableModel>, "">>(...columnNames: ConcatKey[]): ITypedQueryBuilder<Model, SelectableModel, Row & UnionToIntersection<GetNestedProperty<SelectableModel, ConcatKey>>>;
}
interface IFindByPrimaryKey<_Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<SelectableModel>, keyof NonNullableRecursive<SelectableModel>, "">>(primaryKeyValue: any, ...columnNames: ConcatKey[]): Promise<(Row & UnionToIntersection<GetNestedProperty<SelectableModel, ConcatKey>>) | undefined>;
}
interface IKeyFunctionAsParametersReturnQueryBuider<Model, SelectableModel, Row> {
    <ConcatKey extends NestedForeignKeyKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">>(key: ConcatKey, granularity?: Granularity): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
interface ISelectableColumnKeyFunctionAsParametersReturnQueryBuider<Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">>(key: ConcatKey): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
interface IWhere<Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">>(key: ConcatKey, value: GetNestedPropertyType<Model, ConcatKey>): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
interface IWhereWithOperator<Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">>(key: ConcatKey, value: GetNestedPropertyType<Model, ConcatKey>): ITypedQueryBuilder<Model, SelectableModel, Row>;
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">>(key: ConcatKey, operator: Operator, value: GetNestedPropertyType<Model, ConcatKey>): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
interface IWhereIn<Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">>(key: ConcatKey, value: GetNestedPropertyType<Model, ConcatKey>[]): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
interface IWhereBetween<Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">, PropertyType extends GetNestedPropertyType<Model, ConcatKey>>(key: ConcatKey, value: [PropertyType, PropertyType]): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
interface IHaving<Model, SelectableModel, Row> {
    <ConcatKey extends NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">>(key: ConcatKey, operator: Operator, value: GetNestedPropertyType<Model, ConcatKey>): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
interface IWhereCompareTwoColumns<Model, SelectableModel, Row> {
    <_PropertyType1, _PropertyType2, Model2>(key1: NestedKeysOf<NonNullableRecursive<Model>, keyof NonNullableRecursive<Model>, "">, operator: Operator, key2: NestedKeysOf<NonNullableRecursive<Model2>, keyof NonNullableRecursive<Model2>, "">): ITypedQueryBuilder<Model, SelectableModel, Row>;
    (key1: ColumnFromQuery, operator: Operator, key2: ColumnFromQuery): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
interface IWhereExists<Model, SelectableModel, Row> {
    <SubQueryModel>(subQueryModel: new () => SubQueryModel, code: (subQuery: ITypedQueryBuilder<SubQueryModel, SubQueryModel, {}>, parent: TransformPropsToFunctionsReturnPropertyName<SelectableModel>) => void): ITypedQueryBuilder<Model, SelectableModel, Row>;
    <SubQueryModel>(subQueryModel: new () => SubQueryModel, granularity: Granularity, code: (subQuery: ITypedQueryBuilder<SubQueryModel, SubQueryModel, {}>, parent: TransformPropsToFunctionsReturnPropertyName<SelectableModel>) => void): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
interface IWhereParentheses<Model, SelectableModel, Row> {
    (code: (subQuery: ITypedQueryBuilder<Model, SelectableModel, Row>) => void): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
interface IUnion<Model, SelectableModel, Row> {
    <SubQueryModel>(subQueryModel: new () => SubQueryModel, code: (subQuery: ITypedQueryBuilder<SubQueryModel, SubQueryModel, {}>) => void): ITypedQueryBuilder<Model, SelectableModel, Row>;
    <SubQueryModel>(subQueryModel: new () => SubQueryModel, granularity: Granularity, code: (subQuery: ITypedQueryBuilder<SubQueryModel, SubQueryModel, {}>) => void): ITypedQueryBuilder<Model, SelectableModel, Row>;
}
declare type Granularity = "PAGLOCK" | "NOLOCK" | "READCOMMITTEDLOCK" | "ROWLOCK" | "TABLOCK" | "TABLOCKX";
export declare class TypedQueryBuilder<ModelType, SelectableModel, Row = {}> implements ITypedQueryBuilder<ModelType, SelectableModel, Row> {
    private tableClass;
    private granularity;
    private knex;
    private parentTypedQueryBuilder?;
    private subQueryPrefix?;
    columns: {
        name: string;
    }[];
    onlyLogQuery: boolean;
    queryLog: string;
    private hasSelectClause;
    private queryBuilder;
    private tableName;
    private shouldUnflatten;
    private extraJoinedProperties;
    private transaction?;
    private subQueryCounter;
    private granularitySet;
    constructor(tableClass: new () => ModelType, granularity: Granularity | undefined, knex: Knex, queryBuilder?: Knex.QueryBuilder, parentTypedQueryBuilder?: any, subQueryPrefix?: string | undefined);
    getNextSubQueryPrefix(): string;
    keepFlat(): this;
    getColumnAlias(name: string): string;
    getColumn(name: string): ColumnFromQuery;
    distinctOn(columnNames: NestedKeysOf<NonNullableRecursive<ModelType>, keyof NonNullableRecursive<ModelType>, "">[]): ITypedQueryBuilder<ModelType, SelectableModel, Row>;
    del(): Promise<void>;
    delByPrimaryKey(value: any): Promise<void>;
    updateItemWithReturning(newObject: Partial<RemoveObjectsFrom<ModelType>>): Promise<RemoveObjectsFrom<ModelType>>;
    updateItemWithReturning<Keys extends keyof RemoveObjectsFrom<ModelType>>(newObject: Partial<RemoveObjectsFrom<ModelType>>, keys: Keys[]): Promise<Pick<RemoveObjectsFrom<ModelType>, Keys>>;
    insertItemWithReturning(newObject: Partial<RemoveObjectsFrom<ModelType>>): Promise<RemoveObjectsFrom<ModelType>>;
    insertItemWithReturning<Keys extends keyof RemoveObjectsFrom<ModelType>>(newObject: Partial<RemoveObjectsFrom<ModelType>>, keys: Keys[]): Promise<Pick<RemoveObjectsFrom<ModelType>, Keys>>;
    insertItem(newObject: Partial<RemoveObjectsFrom<ModelType>>): Promise<void>;
    insertItems(items: Partial<RemoveObjectsFrom<ModelType>>[]): Promise<void>;
    updateItem(item: Partial<RemoveObjectsFrom<ModelType>>): Promise<void>;
    updateItemByPrimaryKey(primaryKeyValue: any, item: Partial<RemoveObjectsFrom<ModelType>>): Promise<void>;
    updateItemsByPrimaryKey(items: {
        primaryKeyValue: any;
        data: Partial<RemoveObjectsFrom<ModelType>>;
    }[]): Promise<void>;
    execute(): Promise<void>;
    limit(value: number): any;
    offset(value: number): any;
    findById(id: string, columns: (keyof ModelType)[]): Promise<any>;
    getCount(): Promise<any>;
    getFirstOrNull(flattenOption?: FlattenOption): Promise<any>;
    getFirstOrUndefined(): Promise<any>;
    getFirst(flattenOption?: FlattenOption): Promise<any>;
    getSingleOrNull(flattenOption?: FlattenOption): Promise<any>;
    getSingleOrUndefined(): Promise<any>;
    getSingle(flattenOption?: FlattenOption): Promise<any>;
    selectColumn(): any;
    getArgumentsFromColumnFunction3(f: any): string[][];
    select2(): any;
    select(): any;
    orderBy(): any;
    getMany(flattenOption?: FlattenOption): Promise<(Row extends ModelType ? RemoveObjectsFrom<ModelType> : Row)[]>;
    selectAlias(): any;
    selectRaw(): any;
    innerJoinColumn(): this;
    leftOuterJoinColumn(): this;
    innerJoinTable(): this;
    innerJoin(): any;
    leftOuterJoin(): any;
    innerJoinTableOnFunction(): any;
    leftOuterJoinTableOnFunction(): any;
    leftOuterJoinTable(): this;
    whereColumn(): this;
    toQuery(): string;
    whereNull(): this;
    whereNotNull(): this;
    orWhereNull(): this;
    orWhereNotNull(): this;
    getArgumentsFromColumnFunction(f: any): string[];
    findByPrimaryKey(): Promise<any>;
    where(): this;
    whereNot(): this;
    andWhere(): this;
    orWhere(): this;
    whereIn(): this;
    whereNotIn(): this;
    orWhereIn(): this;
    orWhereNotIn(): this;
    whereBetween(): this;
    whereNotBetween(): this;
    orWhereBetween(): this;
    orWhereNotBetween(): this;
    callQueryCallbackFunction(functionName: string, typeOfSubQuery: any, functionToCall: any, granularity: Granularity | undefined): void;
    selectQuery(): any;
    whereParentheses(): this;
    orWhereParentheses(): this;
    whereExists(): this;
    orWhereExists(): this;
    whereNotExists(): this;
    orWhereNotExists(): this;
    whereRaw(sql: string, ...bindings: string[]): this;
    having(): this;
    havingIn(): this;
    havingNotIn(): this;
    havingNull(): this;
    havingNotNull(): this;
    havingExists(): this;
    havingNotExists(): this;
    havingRaw(sql: string, ...bindings: string[]): this;
    havingBetween(): this;
    havingNotBetween(): this;
    orderByRaw(sql: string, ...bindings: string[]): this;
    union(): this;
    unionAll(): this;
    returningColumn(): void;
    returningColumns(): void;
    transacting(trx: Knex.Transaction): this;
    min(): any;
    count(): any;
    countDistinct(): any;
    max(): any;
    sum(): any;
    sumDistinct(): any;
    avg(): any;
    avgDistinct(): any;
    increment(): this;
    decrement(): this;
    truncate(): Promise<void>;
    insertSelect(): Promise<void>;
    clearSelect(): any;
    clearWhere(): any;
    clearOrder(): any;
    distinct(): any;
    clone(): any;
    groupBy(): this;
    groupByRaw(sql: string, ...bindings: string[]): this;
    useKnexQueryBuilder(f: (query: Knex.QueryBuilder) => void): this;
    getKnexQueryBuilder(): Knex.QueryBuilder<any, any>;
    getColumnName(...keys: string[]): string;
    getColumnNameWithDifferentRoot(_rootKey: string, ...keys: string[]): string;
    private functionWithAlias;
    private getColumnNameFromFunctionOrString;
    private getColumnNameWithoutAliasFromFunctionOrString;
    private joinColumn;
    private getColumnNameFromArgumentsIgnoringLastParameter;
    private getColumnNameWithoutAlias;
    private getColumnSelectAlias;
    private flattenByOption;
    private joinTableOnFunction;
    private callKnexFunctionWithColumnFunction;
    private callKnexFunctionWithConcatKeyColumn;
    private selectAllModelProperties;
    private join;
    mapPropertyNameToColumnName(propertyName: string): string;
    mapColumnNameToPropertyName(columnName: string): string;
    mapColumnsToProperties(item: any): void;
    mapPropertiesToColumns(item: any): void;
}
export {};
