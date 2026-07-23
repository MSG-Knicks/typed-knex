"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypedQueryBuilder = exports.registerBeforeUpdateTransform = exports.registerBeforeInsertTransform = exports.TypedKnex = void 0;
const temporal_polyfill_1 = require("temporal-polyfill");
const decorators_1 = require("./decorators");
const unflatten_1 = require("./unflatten");
class TypedKnex {
    constructor(knex) {
        this.knex = knex;
    }
    query(tableClass, granularity) {
        const queryGranularity = granularity !== null && granularity !== void 0 ? granularity : (0, decorators_1.getTableMetadata)(tableClass).defaultLock;
        return new TypedQueryBuilder(tableClass, queryGranularity, this.knex);
    }
    with(cteTableClass, cteQuery) {
        const alias = (0, decorators_1.getTableName)(cteTableClass);
        const qb = this.knex.with(alias, (w) => cteQuery(new TypedKnexCTEQueryBuilder(this.knex, w)));
        return new TypedKnexQueryBuilder(this.knex, qb);
    }
    beginTransaction() {
        return new Promise((resolve) => {
            this.knex
                .transaction((tr) => resolve(tr))
                // If this error is not caught here, it will throw, resulting in an unhandledRejection
                .catch((_e) => {});
        });
    }
}
exports.TypedKnex = TypedKnex;
class TypedKnexCTEQueryBuilder {
    constructor(knex, queryBuilder) {
        this.knex = knex;
        this.queryBuilder = queryBuilder;
    }
    query(tableClass, granularity) {
        return new TypedQueryBuilder(tableClass, granularity, this.knex, this.queryBuilder);
    }
}
class TypedKnexQueryBuilder extends TypedKnexCTEQueryBuilder {
    with(cteTableClass, cteQuery) {
        const alias = (0, decorators_1.getTableName)(cteTableClass);
        const qb = this.queryBuilder.with(alias, (w) => cteQuery(new TypedKnexCTEQueryBuilder(this.knex, w)));
        return new TypedKnexQueryBuilder(this.knex, qb);
    }
}
let beforeInsertTransform = undefined;
function registerBeforeInsertTransform(f) {
    beforeInsertTransform = f;
}
exports.registerBeforeInsertTransform = registerBeforeInsertTransform;
let beforeUpdateTransform = undefined;
function registerBeforeUpdateTransform(f) {
    beforeUpdateTransform = f;
}
exports.registerBeforeUpdateTransform = registerBeforeUpdateTransform;
class NotImplementedError extends Error {
    constructor() {
        super("Not implemented");
    }
}
class ColumnFromQuery {
    constructor(alias) {
        this.alias = alias;
    }
    toString() {
        return this.alias;
    }
}
function getProxyAndMemories(typedQueryBuilder) {
    const memories = [];
    function allGet(_target, name) {
        if (name === "memories") {
            return memories;
        }
        if (name === "getColumnName") {
            return typedQueryBuilder.getColumnName(...memories);
        }
        if (typeof name === "string") {
            memories.push(name);
        }
        return new Proxy(
            {},
            {
                get: allGet,
            }
        );
    }
    const root = new Proxy(
        {},
        {
            get: allGet,
        }
    );
    return { root, memories };
}
function getProxyAndMemoriesForArray(typedQueryBuilder) {
    const result = [];
    let counter = -1;
    function allGet(_target, name) {
        if (_target.level === 0) {
            counter++;
            result.push([]);
        }
        if (name === "memories") {
            return result[counter];
        }
        if (name === "result") {
            return result;
        }
        if (name === "level") {
            return _target.level;
        }
        if (name === "getColumnName") {
            return typedQueryBuilder.getColumnName(...result[counter]);
        }
        if (typeof name === "string") {
            result[counter].push(name);
        }
        return new Proxy(
            {},
            {
                get: allGet,
            }
        );
    }
    const root = new Proxy(
        { level: 0 },
        {
            get: allGet,
        }
    );
    return { root, result };
}
class TypedQueryBuilder {
    constructor(tableClass, granularity, knex, queryBuilder, parentTypedQueryBuilder, subQueryPrefix) {
        this.tableClass = tableClass;
        this.granularity = granularity;
        this.knex = knex;
        this.parentTypedQueryBuilder = parentTypedQueryBuilder;
        this.subQueryPrefix = subQueryPrefix;
        this.onlyLogQuery = false;
        this.queryLog = "";
        this.hasSelectClause = false;
        this.subQueryCounter = 0;
        this.granularitySet = new Set(["NOLOCK", "PAGLOCK", "READCOMMITTEDLOCK", "ROWLOCK", "TABLOCK", "TABLOCKX"]);
        // once all environments can use native Temporal, this process should be simplified
        this.TEMPORAL_CLASS_NAMES = new Set(["PlainDate", "PlainDateTime", "PlainMonthDay", "PlainTime", "PlainYearMonth", "ZonedDateTime"]);
        this.tableName = (0, decorators_1.getTableName)(tableClass);
        this.columns = (0, decorators_1.getColumnProperties)(tableClass);
        const granularityQuery = !granularity ? "" : ` WITH (${granularity})`;
        if (queryBuilder !== undefined) {
            this.queryBuilder = queryBuilder;
            if (this.subQueryPrefix) {
                this.queryBuilder.from(this.knex.raw(`?? as ??${granularityQuery}`, [this.tableName, `${this.subQueryPrefix}${this.tableName}`]));
            } else {
                this.queryBuilder.from(this.knex.raw(`??${granularityQuery}`, [this.tableName]));
            }
        } else {
            this.queryBuilder = this.knex.from(this.knex.raw(`??${granularityQuery}`, [this.tableName]));
        }
        this.extraJoinedProperties = [];
        this.shouldUnflatten = true;
    }
    getNextSubQueryPrefix() {
        var _a;
        const result = `${(_a = this.subQueryPrefix) !== null && _a !== void 0 ? _a : ""}subquery${this.subQueryCounter}$`;
        this.subQueryCounter++;
        return result;
    }
    keepFlat() {
        this.shouldUnflatten = false;
        return this;
    }
    getColumnAlias(name) {
        return this.knex.raw("??", this.getColumnName(...name.split("."))).toQuery();
    }
    getColumn(name) {
        return new ColumnFromQuery(this.getColumnAlias(name));
    }
    distinctOn(columnNames) {
        const mappedColumnNames = columnNames.map((columnName) => this.getColumnName(...columnName.split(".")));
        this.queryBuilder.distinctOn(mappedColumnNames);
        return this;
    }
    async del() {
        await this.queryBuilder.del();
    }
    async delByPrimaryKey(value) {
        const primaryKeyColumnInfo = (0, decorators_1.getPrimaryKeyColumn)(this.tableClass);
        await this.queryBuilder.del().where(primaryKeyColumnInfo.name, this.convertTemporalParam(value));
    }
    async updateItemWithReturning(newObject, returnProperties) {
        let item = newObject;
        if (beforeUpdateTransform) {
            item = beforeUpdateTransform(newObject, this);
        }
        this.mapPropertiesToColumns(item);
        const query = this.queryBuilder.update(item);
        if (returnProperties) {
            const mappedNames = returnProperties.map((columnName) => this.getColumnName(columnName));
            query.returning(mappedNames);
        } else {
            query.returning("*");
        }
        if (this.onlyLogQuery) {
            this.queryLog += query.toQuery() + "\n";
            return {};
        } else {
            const rows = await query;
            const item = rows[0];
            this.mapColumnsToProperties(item);
            this.applyTemporalConversionsForRead(item);
            return item;
        }
    }
    async insertItemWithReturning(newObject, returnProperties) {
        let item = newObject;
        if (beforeInsertTransform) {
            item = beforeInsertTransform(newObject, this);
        }
        this.mapPropertiesToColumns(this.tableClass);
        const query = this.queryBuilder.insert(item);
        if (returnProperties) {
            const mappedNames = returnProperties.map((columnName) => this.getColumnName(columnName));
            query.returning(mappedNames);
        } else {
            query.returning("*");
        }
        if (this.onlyLogQuery) {
            this.queryLog += query.toQuery() + "\n";
            return {};
        } else {
            const rows = await query;
            const item = rows[0];
            this.mapColumnsToProperties(item);
            this.applyTemporalConversionsForRead(item);
            return item;
        }
    }
    async insertItem(newObject) {
        await this.insertItems([newObject]);
    }
    async insertItems(items) {
        items = [...items];
        if (beforeInsertTransform) {
            items = items.map((item) => beforeInsertTransform(item, this));
        }
        items.forEach((item) => this.mapPropertiesToColumns(item));
        while (items.length > 0) {
            const chunk = items.splice(0, 500);
            const query = this.queryBuilder.clone().insert(chunk);
            if (this.transaction !== undefined) {
                query.transacting(this.transaction);
            }
            if (this.onlyLogQuery) {
                this.queryLog += query.toQuery() + "\n";
            } else {
                await query;
            }
        }
    }
    async updateItem(item) {
        if (beforeUpdateTransform) {
            item = beforeUpdateTransform(item, this);
        }
        this.mapPropertiesToColumns(item);
        if (this.onlyLogQuery) {
            this.queryLog += this.queryBuilder.update(item).toQuery() + "\n";
        } else {
            await this.queryBuilder.update(item);
        }
    }
    async updateItemByPrimaryKey(primaryKeyValue, item) {
        if (beforeUpdateTransform) {
            item = beforeUpdateTransform(item, this);
        }
        this.mapPropertiesToColumns(item);
        const primaryKeyColumnInfo = (0, decorators_1.getPrimaryKeyColumn)(this.tableClass);
        const query = this.queryBuilder.update(item).where(primaryKeyColumnInfo.name, this.convertTemporalParam(primaryKeyValue));
        if (this.onlyLogQuery) {
            this.queryLog += query.toQuery() + "\n";
        } else {
            await query;
        }
    }
    async updateItemsByPrimaryKey(items) {
        const primaryKeyColumnInfo = (0, decorators_1.getPrimaryKeyColumn)(this.tableClass);
        items = [...items];
        while (items.length > 0) {
            const chunk = items.splice(0, 500);
            let sql = "";
            for (const item of chunk) {
                const query = this.queryBuilder.clone();
                if (beforeUpdateTransform) {
                    item.data = beforeUpdateTransform(item.data, this);
                }
                this.mapPropertiesToColumns(item.data);
                query.update(item.data);
                sql += query.where(primaryKeyColumnInfo.name, this.convertTemporalParam(item.primaryKeyValue)).toString().replace("?", "\\?") + ";\n";
            }
            const finalQuery = this.knex.raw(sql);
            if (this.transaction !== undefined) {
                finalQuery.transacting(this.transaction);
            }
            if (this.onlyLogQuery) {
                this.queryLog += finalQuery.toQuery() + "\n";
            } else {
                await finalQuery;
            }
        }
    }
    async execute() {
        await this.queryBuilder;
    }
    limit(value) {
        this.queryBuilder.limit(value);
        return this;
    }
    offset(value) {
        this.queryBuilder.offset(value);
        return this;
    }
    async findById(id, columns) {
        return await this.queryBuilder
            .select(columns)
            .where(this.tableName + ".id", id)
            .first();
    }
    async getCount() {
        const query = this.queryBuilder.count({ count: "*" });
        const result = await query;
        if (result.length === 0) {
            return 0;
        }
        return result[0].count;
    }
    async getFirstOrNull(flattenOption) {
        if (this.hasSelectClause === false) {
            this.selectAllModelProperties();
        }
        if (this.onlyLogQuery) {
            this.queryLog += this.queryBuilder.toQuery() + "\n";
            return [];
        } else {
            const items = await this.queryBuilder;
            if (!items || items.length === 0) {
                return null;
            }
            return this.flattenByOption(items[0], flattenOption);
        }
    }
    async getFirstOrUndefined() {
        const firstOrNullResult = await this.getFirstOrNull();
        if (firstOrNullResult === null) {
            return undefined;
        }
        return firstOrNullResult;
    }
    async getFirst(flattenOption) {
        if (this.hasSelectClause === false) {
            this.selectAllModelProperties();
        }
        if (this.onlyLogQuery) {
            this.queryLog += this.queryBuilder.toQuery() + "\n";
            return [];
        } else {
            const items = await this.queryBuilder;
            if (!items || items.length === 0) {
                throw new Error("Item not found.");
            }
            return this.flattenByOption(items[0], flattenOption);
        }
    }
    async getSingleOrNull(flattenOption) {
        if (this.hasSelectClause === false) {
            this.selectAllModelProperties();
        }
        if (this.onlyLogQuery) {
            this.queryLog += this.queryBuilder.toQuery() + "\n";
            return [];
        } else {
            const items = await this.queryBuilder;
            if (!items || items.length === 0) {
                return null;
            } else if (items.length > 1) {
                throw new Error(`More than one item found: ${items.length}.`);
            }
            return this.flattenByOption(items[0], flattenOption);
        }
    }
    async getSingleOrUndefined() {
        const singleOrNullResult = await this.getSingleOrNull();
        if (singleOrNullResult === null) {
            return undefined;
        }
        return singleOrNullResult;
    }
    async getSingle(flattenOption) {
        if (this.hasSelectClause === false) {
            this.selectAllModelProperties();
        }
        if (this.onlyLogQuery) {
            this.queryLog += this.queryBuilder.toQuery() + "\n";
            return [];
        } else {
            const items = await this.queryBuilder;
            if (!items || items.length === 0) {
                throw new Error("Item not found.");
            } else if (items.length > 1) {
                throw new Error(`More than one item found: ${items.length}.`);
            }
            return this.flattenByOption(items[0], flattenOption);
        }
    }
    selectColumn() {
        this.hasSelectClause = true;
        let calledArguments = [];
        function saveArguments(...args) {
            calledArguments = args;
        }
        arguments[0](saveArguments);
        this.queryBuilder.select(this.getColumnName(...calledArguments) + " as " + this.getColumnSelectAlias(...calledArguments));
        return this;
    }
    getArgumentsFromColumnFunction3(f) {
        const { root, result } = getProxyAndMemoriesForArray();
        f(root);
        return result;
    }
    select2() {
        this.hasSelectClause = true;
        const f = arguments[0];
        const columnArgumentsList = this.getArgumentsFromColumnFunction3(f);
        for (const columnArguments of columnArgumentsList) {
            this.queryBuilder.select(this.getColumnName(...columnArguments) + " as " + this.getColumnSelectAlias(...columnArguments));
        }
        return this;
    }
    select() {
        this.hasSelectClause = true;
        let columnArgumentsList;
        if (typeof arguments[0] === "string") {
            columnArgumentsList = [...arguments].map((concatKey) => concatKey.split("."));
        } else {
            const f = arguments[0];
            columnArgumentsList = this.getArgumentsFromColumnFunction3(f);
        }
        for (const columnArguments of columnArgumentsList) {
            this.queryBuilder.select(this.getColumnName(...columnArguments) + " as " + this.getColumnSelectAlias(...columnArguments));
        }
        return this;
    }
    orderBy() {
        this.queryBuilder.orderBy(this.getColumnNameWithoutAliasFromFunctionOrString(arguments[0]), arguments[1]);
        return this;
    }
    async getMany(flattenOption) {
        // attach any default locks to the query if they are not specified
        if (this.hasSelectClause === false) {
            this.selectAllModelProperties();
        }
        if (this.onlyLogQuery) {
            this.queryLog += this.queryBuilder.toQuery() + "\n";
            return [];
        } else {
            const items = await this.queryBuilder;
            return this.flattenByOption(items, flattenOption);
        }
    }
    selectAlias() {
        this.hasSelectClause = true;
        const columnArguments = arguments[1].split(".");
        this.queryBuilder.select(`${this.getColumnName(...columnArguments)} as ${arguments[0]}`);
        return this;
    }
    selectRaw() {
        this.hasSelectClause = true;
        const [name, _, query, ...bindings] = Array.from(arguments);
        this.queryBuilder.select(this.knex.raw(`(${query}) as "${name}"`, bindings));
        return this;
    }
    innerJoinColumn() {
        return this.joinColumn("innerJoin", arguments[0], arguments[1]);
    }
    leftOuterJoinColumn() {
        return this.joinColumn("leftOuterJoin", arguments[0], arguments[1]);
    }
    innerJoinTable() {
        const newPropertyKey = arguments[0];
        const newPropertyType = arguments[1];
        const column1Parts = arguments[2];
        const operator = arguments[3];
        const column2Parts = arguments[4];
        this.extraJoinedProperties.push({
            name: newPropertyKey,
            propertyType: newPropertyType,
        });
        const tableToJoinClass = newPropertyType;
        const tableToJoinName = (0, decorators_1.getTableName)(tableToJoinClass);
        const tableToJoinAlias = newPropertyKey;
        const table1Column = this.getColumnName(...column1Parts);
        const table2Column = this.getColumnName(...column2Parts);
        this.queryBuilder.innerJoin(`${tableToJoinName} as ${tableToJoinAlias}`, table1Column, operator, table2Column);
        return this;
    }
    innerJoin() {
        const callIncludesGranularity = this.granularitySet.has(arguments[2]);
        const granularity = callIncludesGranularity ? arguments[2] : (0, decorators_1.getTableMetadata)(arguments[1]).defaultLock;
        const joinTableColumnString = callIncludesGranularity ? arguments[3] : arguments[2];
        const operator = callIncludesGranularity ? arguments[4] : arguments[3];
        const existingTableColumnString = callIncludesGranularity ? arguments[5] : arguments[4];
        return this.join("innerJoin", arguments[0], arguments[1], granularity, joinTableColumnString, operator, existingTableColumnString);
    }
    leftOuterJoin() {
        const callIncludesGranularity = this.granularitySet.has(arguments[2]);
        const granularity = callIncludesGranularity ? arguments[2] : (0, decorators_1.getTableMetadata)(arguments[1]).defaultLock;
        const joinTableColumnString = callIncludesGranularity ? arguments[3] : arguments[2];
        const operator = callIncludesGranularity ? arguments[4] : arguments[3];
        const existingTableColumnString = callIncludesGranularity ? arguments[5] : arguments[4];
        return this.join("leftOuterJoin", arguments[0], arguments[1], granularity, joinTableColumnString, operator, existingTableColumnString);
    }
    innerJoinTableOnFunction() {
        const granularity = typeof arguments[2] === "string" ? arguments[2] : (0, decorators_1.getTableMetadata)(arguments[1]).defaultLock;
        const on = typeof arguments[2] === "string" ? arguments[3] : arguments[2];
        return this.joinTableOnFunction(this.queryBuilder.innerJoin.bind(this.queryBuilder), arguments[0], arguments[1], granularity, on);
    }
    leftOuterJoinTableOnFunction() {
        const granularity = typeof arguments[2] === "string" ? arguments[2] : (0, decorators_1.getTableMetadata)(arguments[1]).defaultLock;
        const on = typeof arguments[2] === "string" ? arguments[3] : arguments[2];
        return this.joinTableOnFunction(this.queryBuilder.leftOuterJoin.bind(this.queryBuilder), arguments[0], arguments[1], granularity, on);
    }
    leftOuterJoinTable() {
        const newPropertyKey = arguments[0];
        const newPropertyType = arguments[1];
        const column1Parts = arguments[2];
        const operator = arguments[3];
        const column2Parts = arguments[4];
        this.extraJoinedProperties.push({
            name: newPropertyKey,
            propertyType: newPropertyType,
        });
        const tableToJoinClass = newPropertyType;
        const tableToJoinName = (0, decorators_1.getTableName)(tableToJoinClass);
        const tableToJoinAlias = newPropertyKey;
        const table1Column = this.getColumnName(...column1Parts);
        const table2Column = this.getColumnName(...column2Parts);
        this.queryBuilder.leftOuterJoin(`${tableToJoinName} as ${tableToJoinAlias}`, table1Column, operator, table2Column);
        return this;
    }
    whereColumn() {
        // This is called from the sub-query
        // The first column is from the sub-query
        // The second column is from the parent query
        let column1Name;
        let column2Name;
        const operator = arguments[1];
        if (arguments[0] instanceof ColumnFromQuery) {
            column1Name = arguments[0].toString();
            column2Name = arguments[2].toString();
            this.queryBuilder.whereRaw(`${column1Name} ${operator} ${column2Name}`);
            return this;
        }
        if (typeof arguments[0] === "string") {
            column1Name = this.getColumnName(...arguments[0].split("."));
            if (!this.parentTypedQueryBuilder) {
                throw new Error('Parent query builder is missing, "whereColumn" can only be used in sub-query.');
            }
            column2Name = this.parentTypedQueryBuilder.getColumnName(...arguments[2].split("."));
        } else {
            column1Name = this.getColumnName(...this.getArgumentsFromColumnFunction(arguments[0]));
            if (typeof arguments[2] === "string") {
                column2Name = arguments[2];
            } else if (arguments[2].memories !== undefined) {
                column2Name = arguments[2].getColumnName; // parent this needed ...
            } else {
                column2Name = this.getColumnName(...this.getArgumentsFromColumnFunction(arguments[2]));
            }
        }
        this.queryBuilder.whereRaw(`?? ${operator} ??`, [column1Name, column2Name]);
        return this;
    }
    toQuery() {
        return this.queryBuilder.toQuery();
    }
    whereNull() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.whereNull.bind(this.queryBuilder), ...arguments);
    }
    whereNotNull() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.whereNotNull.bind(this.queryBuilder), ...arguments);
    }
    orWhereNull() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.orWhereNull.bind(this.queryBuilder), ...arguments);
    }
    orWhereNotNull() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.orWhereNotNull.bind(this.queryBuilder), ...arguments);
    }
    getArgumentsFromColumnFunction(f) {
        if (typeof f === "string") {
            return f.split(".");
        }
        const { root, memories } = getProxyAndMemories();
        f(root);
        return memories;
    }
    async findByPrimaryKey() {
        const primaryKeyColumnInfo = (0, decorators_1.getPrimaryKeyColumn)(this.tableClass);
        const primaryKeyValue = arguments[0];
        let columnArgumentsList;
        if (typeof arguments[1] === "string") {
            const [, ...columnArguments] = arguments;
            columnArgumentsList = columnArguments.map((concatKey) => concatKey.split("."));
        } else {
            const f = arguments[1];
            columnArgumentsList = this.getArgumentsFromColumnFunction3(f);
        }
        for (const columnArguments of columnArgumentsList) {
            this.queryBuilder.select(this.getColumnName(...columnArguments) + " as " + this.getColumnSelectAlias(...columnArguments));
        }
        this.queryBuilder.where(primaryKeyColumnInfo.name, this.convertTemporalParam(primaryKeyValue));
        if (this.onlyLogQuery) {
            this.queryLog += this.queryBuilder.toQuery() + "\n";
        } else {
            return this.queryBuilder.first();
        }
    }
    where() {
        if (typeof arguments[0] === "string") {
            return this.callKnexFunctionWithConcatKeyColumn(this.queryBuilder.where.bind(this.queryBuilder), ...arguments);
        }
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.where.bind(this.queryBuilder), ...arguments);
    }
    whereNot() {
        if (typeof arguments[0] === "string") {
            return this.callKnexFunctionWithConcatKeyColumn(this.queryBuilder.whereNot.bind(this.queryBuilder), ...arguments);
        }
        const columnArguments = this.getArgumentsFromColumnFunction(arguments[0]);
        this.queryBuilder.whereNot(this.getColumnName(...columnArguments), this.convertTemporalParam(arguments[1]));
        return this;
    }
    andWhere() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.andWhere.bind(this.queryBuilder), ...arguments);
    }
    orWhere() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.orWhere.bind(this.queryBuilder), ...arguments);
    }
    whereIn() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.whereIn.bind(this.queryBuilder), ...arguments);
    }
    whereNotIn() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.whereNotIn.bind(this.queryBuilder), ...arguments);
    }
    orWhereIn() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.orWhereIn.bind(this.queryBuilder), ...arguments);
    }
    orWhereNotIn() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.orWhereNotIn.bind(this.queryBuilder), ...arguments);
    }
    whereBetween() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.whereBetween.bind(this.queryBuilder), ...arguments);
    }
    whereNotBetween() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.whereNotBetween.bind(this.queryBuilder), ...arguments);
    }
    orWhereBetween() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.orWhereBetween.bind(this.queryBuilder), ...arguments);
    }
    orWhereNotBetween() {
        return this.callKnexFunctionWithColumnFunction(this.queryBuilder.orWhereNotBetween.bind(this.queryBuilder), ...arguments);
    }
    callQueryCallbackFunction(functionName, typeOfSubQuery, functionToCall, granularity) {
        const that = this;
        let subQueryPrefix;
        if (["whereExists", "orWhereExists", "whereNotExists", "orWhereNotExists", "havingExists", "havingNotExists"].includes(functionName)) {
            subQueryPrefix = this.getNextSubQueryPrefix();
        }
        this.queryBuilder[functionName](function () {
            const subQuery = this;
            const { root, memories } = getProxyAndMemories(that);
            const subQB = new TypedQueryBuilder(typeOfSubQuery, granularity, that.knex, subQuery, that, subQueryPrefix);
            subQB.extraJoinedProperties = that.extraJoinedProperties;
            functionToCall(subQB, root, memories);
        });
    }
    selectQuery() {
        var _a;
        this.hasSelectClause = true;
        const name = arguments[0];
        const typeOfSubQuery = arguments[2];
        const functionToCall = arguments[3];
        const granularity = (_a = arguments[4]) !== null && _a !== void 0 ? _a : (0, decorators_1.getTableMetadata)(typeOfSubQuery).defaultLock;
        const { root, memories } = getProxyAndMemories(this);
        const subQueryBuilder = new TypedQueryBuilder(typeOfSubQuery, granularity, this.knex, undefined, this);
        functionToCall(subQueryBuilder, root, memories);
        this.selectRaw(name, undefined, subQueryBuilder.toQuery());
        return this;
    }
    whereParentheses() {
        this.callQueryCallbackFunction("where", this.tableClass, arguments[0], undefined);
        return this;
    }
    orWhereParentheses() {
        this.callQueryCallbackFunction("orWhere", this.tableClass, arguments[0], undefined);
        return this;
    }
    whereExists() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : (0, decorators_1.getTableMetadata)(arguments[0]).defaultLock;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("whereExists", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    orWhereExists() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : (0, decorators_1.getTableMetadata)(arguments[0]).defaultLock;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("orWhereExists", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    whereNotExists() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : (0, decorators_1.getTableMetadata)(arguments[0]).defaultLock;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("whereNotExists", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    orWhereNotExists() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : (0, decorators_1.getTableMetadata)(arguments[0]).defaultLock;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("orWhereNotExists", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    whereRaw(sql, ...bindings) {
        this.queryBuilder.whereRaw(sql, bindings);
        return this;
    }
    having() {
        const operator = arguments[1];
        const value = this.convertTemporalParam(arguments[2]);
        this.queryBuilder.having(this.getColumnNameFromFunctionOrString(arguments[0]), operator, value);
        return this;
    }
    havingIn() {
        const value = this.convertTemporalParam(arguments[1]);
        this.queryBuilder.havingIn(this.getColumnNameFromFunctionOrString(arguments[0]), value);
        return this;
    }
    havingNotIn() {
        const value = this.convertTemporalParam(arguments[1]);
        this.queryBuilder.havingNotIn(this.getColumnNameFromFunctionOrString(arguments[0]), value);
        return this;
    }
    havingNull() {
        this.queryBuilder.havingNull(this.getColumnNameFromFunctionOrString(arguments[0]));
        return this;
    }
    havingNotNull() {
        this.queryBuilder.havingNotNull(this.getColumnNameFromFunctionOrString(arguments[0]));
        return this;
    }
    havingExists() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : (0, decorators_1.getTableMetadata)(arguments[0]).defaultLock;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("havingExists", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    havingNotExists() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : (0, decorators_1.getTableMetadata)(arguments[0]).defaultLock;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("havingNotExists", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    havingRaw(sql, ...bindings) {
        this.queryBuilder.havingRaw(sql, bindings);
        return this;
    }
    havingBetween() {
        const value = this.convertTemporalParam(arguments[1]);
        this.queryBuilder.havingBetween(this.getColumnNameFromFunctionOrString(arguments[0]), value);
        return this;
    }
    havingNotBetween() {
        const value = this.convertTemporalParam(arguments[1]);
        this.queryBuilder.havingNotBetween(this.getColumnNameFromFunctionOrString(arguments[0]), value);
        return this;
    }
    orderByRaw(sql, ...bindings) {
        this.queryBuilder.orderByRaw(sql, bindings);
        return this;
    }
    union() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : (0, decorators_1.getTableMetadata)(arguments[0]).defaultLock;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("union", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    unionAll() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : (0, decorators_1.getTableMetadata)(arguments[0]).defaultLock;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("unionAll", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    returningColumn() {
        throw new NotImplementedError();
    }
    returningColumns() {
        throw new NotImplementedError();
    }
    transacting(trx) {
        this.queryBuilder.transacting(trx);
        this.transaction = trx;
        return this;
    }
    min() {
        return this.functionWithAlias("min", arguments[0], arguments[1]);
    }
    count() {
        return this.functionWithAlias("count", arguments[0], arguments[1]);
    }
    countDistinct() {
        return this.functionWithAlias("countDistinct", arguments[0], arguments[1]);
    }
    max() {
        return this.functionWithAlias("max", arguments[0], arguments[1]);
    }
    sum() {
        return this.functionWithAlias("sum", arguments[0], arguments[1]);
    }
    sumDistinct() {
        return this.functionWithAlias("sumDistinct", arguments[0], arguments[1]);
    }
    avg() {
        return this.functionWithAlias("avg", arguments[0], arguments[1]);
    }
    avgDistinct() {
        return this.functionWithAlias("avgDistinct", arguments[0], arguments[1]);
    }
    increment() {
        const value = arguments[arguments.length - 1];
        this.queryBuilder.increment(this.getColumnNameFromArgumentsIgnoringLastParameter(...arguments), value);
        return this;
    }
    decrement() {
        const value = arguments[arguments.length - 1];
        this.queryBuilder.decrement(this.getColumnNameFromArgumentsIgnoringLastParameter(...arguments), value);
        return this;
    }
    async truncate() {
        await this.queryBuilder.truncate();
    }
    async insertSelect() {
        const tableName = (0, decorators_1.getTableName)(arguments[0]);
        const typedQueryBuilderForInsert = new TypedQueryBuilder(arguments[0], undefined, this.knex);
        let columnArgumentsList;
        if (typeof arguments[1] === "string") {
            const [, ...columnArguments] = arguments;
            columnArgumentsList = columnArguments.map((concatKey) => concatKey.split("."));
        } else {
            const f = arguments[1];
            columnArgumentsList = this.getArgumentsFromColumnFunction3(f);
        }
        const insertColumns = columnArgumentsList.map((i) => typedQueryBuilderForInsert.getColumnName(...i));
        // https://github.com/knex/knex/issues/1056
        const qb = this.knex.from(this.knex.raw(`?? (${insertColumns.map(() => "??").join(",")})`, [tableName, ...insertColumns])).insert(this.knex.raw(this.toQuery()));
        const finalQuery = qb.toString();
        this.toQuery = () => finalQuery;
        await qb;
    }
    clearSelect() {
        this.queryBuilder.clearSelect();
        return this;
    }
    clearWhere() {
        this.queryBuilder.clearWhere();
        return this;
    }
    clearOrder() {
        this.queryBuilder.clearOrder();
        return this;
    }
    distinct() {
        this.queryBuilder.distinct();
        return this;
    }
    clone() {
        const queryBuilderClone = this.queryBuilder.clone();
        const typedQueryBuilderClone = new TypedQueryBuilder(this.tableClass, this.granularity, this.knex, queryBuilderClone);
        return typedQueryBuilderClone;
    }
    groupBy() {
        this.queryBuilder.groupBy(this.getColumnNameFromFunctionOrString(arguments[0]));
        return this;
    }
    groupByRaw(sql, ...bindings) {
        this.queryBuilder.groupByRaw(sql, bindings);
        return this;
    }
    useKnexQueryBuilder(f) {
        f(this.queryBuilder);
        return this;
    }
    getKnexQueryBuilder() {
        return this.queryBuilder;
    }
    getColumnName(...keys) {
        var _a;
        const firstPartName = this.getColumnNameWithoutAlias(keys[0]);
        if (keys.length === 1) {
            return firstPartName;
        } else {
            let columnName = "";
            let columnAlias;
            let currentClass;
            let currentColumnPart;
            const prefix = keys.slice(0, -1).join(".");
            const extraJoinedProperty = this.extraJoinedProperties.find((i) => i.name === prefix);
            if (extraJoinedProperty) {
                columnAlias = extraJoinedProperty.name;
                currentClass = extraJoinedProperty.propertyType;
                currentColumnPart = (0, decorators_1.getColumnInformation)(currentClass, keys[keys.length - 1]);
                columnName = keys.slice(0, -1).join("_") + "." + currentColumnPart.name;
            } else {
                currentColumnPart = (0, decorators_1.getColumnInformation)(this.tableClass, keys[0]);
                columnAlias = currentColumnPart.propertyKey;
                currentClass = currentColumnPart.columnClass;
                for (let i = 1; i < keys.length; i++) {
                    currentColumnPart = (0, decorators_1.getColumnInformation)(currentClass, keys[i]);
                    columnName = columnAlias + "." + (keys.length - 1 === i ? currentColumnPart.name : currentColumnPart.propertyKey);
                    columnAlias += "_" + (keys.length - 1 === i ? currentColumnPart.name : currentColumnPart.propertyKey);
                    currentClass = currentColumnPart.columnClass;
                }
            }
            return `${(_a = this.subQueryPrefix) !== null && _a !== void 0 ? _a : ""}${columnName}`;
        }
    }
    getColumnNameWithDifferentRoot(_rootKey, ...keys) {
        const firstPartName = this.getColumnNameWithoutAlias(keys[0]);
        if (keys.length === 1) {
            return firstPartName;
        } else {
            let currentColumnPart = (0, decorators_1.getColumnInformation)(this.tableClass, keys[0]);
            let columnName = "";
            let columnAlias = currentColumnPart.propertyKey;
            let currentClass = currentColumnPart.columnClass;
            for (let i = 0; i < keys.length; i++) {
                currentColumnPart = (0, decorators_1.getColumnInformation)(currentClass, keys[i]);
                columnName = columnAlias + "." + (keys.length - 1 === i ? currentColumnPart.name : currentColumnPart.propertyKey);
                columnAlias += "_" + (keys.length - 1 === i ? currentColumnPart.name : currentColumnPart.propertyKey);
                currentClass = currentColumnPart.columnClass;
            }
            return columnName;
        }
    }
    functionWithAlias(knexFunctionName, f, aliasName) {
        this.hasSelectClause = true;
        this.queryBuilder[knexFunctionName](`${this.getColumnNameWithoutAliasFromFunctionOrString(f)} as ${aliasName}`);
        return this;
    }
    getColumnNameFromFunctionOrString(f) {
        let columnParts;
        if (typeof f === "string") {
            columnParts = f.split(".");
        } else {
            columnParts = this.getArgumentsFromColumnFunction(f);
        }
        return this.getColumnName(...columnParts);
    }
    getColumnNameWithoutAliasFromFunctionOrString(f) {
        let columnParts;
        if (typeof f === "string") {
            columnParts = f.split(".");
        } else {
            columnParts = this.getArgumentsFromColumnFunction(f);
        }
        return this.getColumnNameWithoutAlias(...columnParts);
    }
    joinColumn(joinType, f, granularity) {
        var _a;
        let columnToJoinArguments;
        if (typeof f === "string") {
            columnToJoinArguments = f.split(".");
        } else {
            columnToJoinArguments = this.getArgumentsFromColumnFunction(f);
        }
        const columnToJoinName = this.getColumnName(...columnToJoinArguments);
        let secondColumnName = columnToJoinArguments[0];
        let secondColumnAlias = columnToJoinArguments[0];
        let secondColumnClass = (0, decorators_1.getColumnInformation)(this.tableClass, secondColumnName).columnClass;
        for (let i = 1; i < columnToJoinArguments.length; i++) {
            const beforeSecondColumnAlias = secondColumnAlias;
            const beforeSecondColumnClass = secondColumnClass;
            const columnInfo = (0, decorators_1.getColumnInformation)(beforeSecondColumnClass, columnToJoinArguments[i]);
            secondColumnName = columnInfo.name;
            secondColumnAlias = beforeSecondColumnAlias + "_" + columnInfo.propertyKey;
            secondColumnClass = columnInfo.columnClass;
        }
        const tableToJoinName = (0, decorators_1.getTableName)(secondColumnClass);
        const tableToJoinAlias = `${(_a = this.subQueryPrefix) !== null && _a !== void 0 ? _a : ""}${secondColumnAlias}`;
        const tableToJoinJoinColumnName = `${tableToJoinAlias}.${(0, decorators_1.getPrimaryKeyColumn)(secondColumnClass).name}`;
        const joinTableGranularity = granularity !== null && granularity !== void 0 ? granularity : (0, decorators_1.getTableMetadata)(secondColumnClass).defaultLock;
        const granularityQuery = !joinTableGranularity ? "" : ` WITH (${joinTableGranularity})`;
        const tableNameRaw = this.knex.raw(`?? as ??${granularityQuery}`, [tableToJoinName, tableToJoinAlias]);
        if (joinType === "innerJoin") {
            this.queryBuilder.innerJoin(tableNameRaw, tableToJoinJoinColumnName, columnToJoinName);
        } else if (joinType === "leftOuterJoin") {
            this.queryBuilder.leftOuterJoin(tableNameRaw, tableToJoinJoinColumnName, columnToJoinName);
        }
        return this;
    }
    getColumnNameFromArgumentsIgnoringLastParameter(...keys) {
        const argumentsExceptLast = keys.slice(0, -1);
        return this.getColumnName(...argumentsExceptLast);
    }
    getColumnNameWithoutAlias(...keys) {
        var _a;
        const extraJoinedProperty = this.extraJoinedProperties.find((i) => i.name === keys[0]);
        if (extraJoinedProperty) {
            if (keys.length === 1) {
                return extraJoinedProperty.name;
            }
            const columnInfo = (0, decorators_1.getColumnInformation)(extraJoinedProperty.propertyType, keys[1]);
            return extraJoinedProperty.name + "." + columnInfo.name;
        }
        if (keys.length === 1) {
            const columnInfo = (0, decorators_1.getColumnInformation)(this.tableClass, keys[0]);
            return `${(_a = this.subQueryPrefix) !== null && _a !== void 0 ? _a : ""}${this.tableName}.${columnInfo.name}`;
        } else {
            let currentColumnPart = (0, decorators_1.getColumnInformation)(this.tableClass, keys[0]);
            let result = currentColumnPart.propertyKey;
            let currentClass = currentColumnPart.columnClass;
            for (let i = 1; i < keys.length; i++) {
                currentColumnPart = (0, decorators_1.getColumnInformation)(currentClass, keys[i]);
                result += "." + (keys.length - 1 === i ? currentColumnPart.name : currentColumnPart.propertyKey);
                currentClass = currentColumnPart.columnClass;
            }
            return result;
        }
    }
    getColumnSelectAlias(...keys) {
        if (keys.length === 1) {
            return keys[0];
        } else {
            let columnAlias = keys[0];
            for (let i = 1; i < keys.length; i++) {
                columnAlias += "." + keys[i];
            }
            return columnAlias;
        }
    }
    applyTemporalConversionsForRead(item) {
        if (item === null || item === undefined) {
            return item;
        }
        if (Array.isArray(item)) {
            return item.map((i) => this.applyTemporalConversionsForRead(i));
        }
        const rootColumns = (0, decorators_1.getColumnProperties)(this.tableClass);
        for (const col of rootColumns) {
            if (!this.isTemporalClass(col === null || col === void 0 ? void 0 : col.designType)) {
                continue;
            }
            const val = item[col.propertyKey];
            if (val === null || val === undefined) {
                continue;
            }
            if (val instanceof Date) {
                let dateString = val.toISOString();
                if (col.designType.name === "PlainDate" || col.designType.name === "PlainMonthDay" || col.designType.name === "PlainYearMonth") {
                    dateString = dateString.substring(0, 10);
                } else if (col.designType.name === "PlainDateTime") {
                    dateString = dateString.substring(0, 23);
                } else if (col.designType.name === "PlainTime") {
                    dateString = dateString.substring(11, 23).padEnd(18, "0");
                }
                item[col.propertyKey] = col.designType.from(dateString);
            } else {
                item[col.propertyKey] = col.designType.from(val);
            }
        }
        for (const joined of this.extraJoinedProperties) {
            const nestedItem = item[joined.name];
            if (nestedItem === null || nestedItem === undefined) {
                continue;
            }
            try {
                const joinedColumns = (0, decorators_1.getColumnProperties)(joined.propertyType);
                for (const col of joinedColumns) {
                    if (!this.isTemporalClass(col === null || col === void 0 ? void 0 : col.designType)) {
                        continue;
                    }
                    const val = nestedItem[col.propertyKey];
                    if (val === null || val === undefined) {
                        continue;
                    }
                    if (val instanceof Date) {
                        let dateString = val.toISOString();
                        if (col.designType.name === "PlainDate" || col.designType.name === "PlainMonthDay" || col.designType.name === "PlainYearMonth") {
                            dateString = dateString.substring(0, 10);
                        } else if (col.designType.name === "PlainDateTime") {
                            dateString = dateString.substring(0, 23);
                        } else if (col.designType.name === "PlainTime") {
                            dateString = dateString.substring(11, 23).padEnd(18, "0");
                        }
                        nestedItem[col.propertyKey] = col.designType.from(dateString);
                    } else {
                        nestedItem[col.propertyKey] = col.designType.from(val);
                    }
                }
            } catch (_a) {
                // joined type may not have @Column decorators (e.g. CTEs)
            }
        }
        return item;
    }
    flattenByOption(o, flattenOption) {
        if (flattenOption === unflatten_1.FlattenOption.noFlatten || this.shouldUnflatten === false) {
            return this.applyTemporalConversionsForRead(o);
        }
        const unflattened = (0, unflatten_1.unflatten)(o);
        if (flattenOption === undefined || flattenOption === unflatten_1.FlattenOption.flatten) {
            return this.applyTemporalConversionsForRead(unflattened);
        }
        return this.applyTemporalConversionsForRead((0, unflatten_1.setToNull)(unflattened));
    }
    joinTableOnFunction(queryBuilderJoin, newPropertyKey, newPropertyType, granularity, onFunction) {
        this.extraJoinedProperties.push({
            name: newPropertyKey,
            propertyType: newPropertyType,
        });
        const tableToJoinClass = newPropertyType;
        const tableToJoinName = (0, decorators_1.getTableName)(tableToJoinClass);
        const tableToJoinAlias = newPropertyKey;
        const granularityQuery = !granularity ? "" : ` WITH (${granularity})`;
        let knexOnObject;
        const tableNameRaw = this.knex.raw(`?? as ??${granularityQuery}`, [tableToJoinName, tableToJoinAlias]);
        queryBuilderJoin(tableNameRaw, function () {
            knexOnObject = this;
        });
        const onObject = this.getTypedKnexOnObject(newPropertyKey, tableToJoinAlias, knexOnObject);
        onFunction(onObject);
        return this;
    }
    getTypedKnexOnObject(newPropertyKey, tableToJoinAlias, knexOnObject) {
        const onWithJoinedColumnOperatorColumn = (joinedColumn, operator, modelColumn, functionName) => {
            let column1Arguments;
            if (typeof modelColumn === "string") {
                column1Arguments = modelColumn.split(".");
            } else {
                column1Arguments = this.getArgumentsFromColumnFunction(modelColumn);
            }
            const column2Name = this.getColumnNameWithoutAlias(newPropertyKey, joinedColumn);
            knexOnObject[functionName](this.getColumnName(...column1Arguments), operator, column2Name);
        };
        const onWithColumnOperatorValue = (joinedModelColumn, operator, value, functionName) => {
            const column2Name = this.getColumnNameWithoutAlias(newPropertyKey, joinedModelColumn);
            knexOnObject[functionName](column2Name, operator, this.convertTemporalParam(value));
        };
        const onWithModelColumnOperatorValue = (modelColumn, operator, value, functionName) => {
            let columnArguments;
            if (typeof modelColumn === "string") {
                columnArguments = modelColumn.split(".");
            } else {
                columnArguments = this.getArgumentsFromColumnFunction(modelColumn);
            }
            knexOnObject[functionName](this.getColumnName(...columnArguments), operator, this.convertTemporalParam(value));
        };
        const onNullValue = (joinedModelColumn, functionName) => {
            const columnArguments = this.getArgumentsFromColumnFunction(joinedModelColumn);
            const columnArgumentsWithJoinedTable = [tableToJoinAlias, ...columnArguments];
            knexOnObject[functionName](columnArgumentsWithJoinedTable.join("."));
        };
        const onNullModelValue = (modelColumn, functionName) => {
            let columnArguments;
            if (typeof modelColumn === "string") {
                columnArguments = modelColumn.split(".");
            } else {
                columnArguments = this.getArgumentsFromColumnFunction(modelColumn);
            }
            knexOnObject[functionName](this.getColumnName(...columnArguments));
        };
        const onObject = {
            onColumns: (column1, operator, column2) => {
                onWithJoinedColumnOperatorColumn(column2, operator, column1, "on");
                return onObject;
            },
            on: (column1, operator, column2) => {
                onWithJoinedColumnOperatorColumn(column1, operator, column2, "on");
                return onObject;
            },
            andOn: (column1, operator, column2) => {
                onWithJoinedColumnOperatorColumn(column1, operator, column2, "andOn");
                return onObject;
            },
            orOn: (column1, operator, column2) => {
                onWithJoinedColumnOperatorColumn(column1, operator, column2, "orOn");
                return onObject;
            },
            onVal: (column1, operator, value) => {
                onWithColumnOperatorValue(column1, operator, value, "onVal");
                return onObject;
            },
            andOnVal: (column1, operator, value) => {
                onWithColumnOperatorValue(column1, operator, value, "andOnVal");
                return onObject;
            },
            orOnVal: (column1, operator, value) => {
                onWithColumnOperatorValue(column1, operator, value, "orOnVal");
                return onObject;
            },
            onNull: (column) => {
                onNullValue(column, "onNull");
                return onObject;
            },
            onNotNull: (column) => {
                onNullValue(column, "onNotNull");
                return onObject;
            },
            orOnNull: (column) => {
                onNullValue(column, "orOnNull");
                return onObject;
            },
            orOnNotNull: (column) => {
                onNullValue(column, "orOnNotNull");
                return onObject;
            },
            andOnNull: (column) => {
                onNullValue(column, "andOnNull");
                return onObject;
            },
            andOnNotNull: (column) => {
                onNullValue(column, "andOnNotNull");
                return onObject;
            },
            onParentheses: (onParenthesesFunction) => {
                knexOnObject.on((on) => {
                    const parenthesesOnObject = this.getTypedKnexOnObject(newPropertyKey, tableToJoinAlias, on);
                    onParenthesesFunction(parenthesesOnObject);
                });
                return onObject;
            },
            andOnParentheses: (onParenthesesFunction) => {
                knexOnObject.andOn((on) => {
                    const parenthesesOnObject = this.getTypedKnexOnObject(newPropertyKey, tableToJoinAlias, on);
                    onParenthesesFunction(parenthesesOnObject);
                });
                return onObject;
            },
            orOnParentheses: (onParenthesesFunction) => {
                knexOnObject.orOn((on) => {
                    const parenthesesOnObject = this.getTypedKnexOnObject(newPropertyKey, tableToJoinAlias, on);
                    onParenthesesFunction(parenthesesOnObject);
                });
                return onObject;
            },
            onQueryVal: (modelColumn, operator, value) => {
                onWithModelColumnOperatorValue(modelColumn, operator, value, "onVal");
                return onObject;
            },
            orOnQueryVal: (modelColumn, operator, value) => {
                onWithModelColumnOperatorValue(modelColumn, operator, value, "orOnVal");
                return onObject;
            },
            onQueryNull: (modelColumn) => {
                onNullModelValue(modelColumn, "onNull");
                return onObject;
            },
            orOnQueryNull: (modelColumn) => {
                onNullModelValue(modelColumn, "orOnNull");
                return onObject;
            },
            onQueryNotNull: (modelColumn) => {
                onNullModelValue(modelColumn, "onNotNull");
                return onObject;
            },
            orOnQueryNotNull: (modelColumn) => {
                onNullModelValue(modelColumn, "orOnNotNull");
                return onObject;
            },
            onRaw: (raw, ...bindings) => {
                knexOnObject.on((on) => on.on(this.knex.raw(raw, bindings)));
                return onObject;
            },
            orOnRaw: (raw, ...bindings) => {
                knexOnObject.orOn((on) => on.on(this.knex.raw(raw, bindings)));
                return onObject;
            },
        };
        return onObject;
    }
    isTemporalClass(designType) {
        return (
            designType === temporal_polyfill_1.Temporal.PlainDate ||
            designType === temporal_polyfill_1.Temporal.PlainDateTime ||
            designType === temporal_polyfill_1.Temporal.PlainMonthDay ||
            designType === temporal_polyfill_1.Temporal.PlainTime ||
            designType === temporal_polyfill_1.Temporal.PlainYearMonth ||
            designType === temporal_polyfill_1.Temporal.ZonedDateTime ||
            // fallback for environments where Temporal class definitions may differ
            (designType && this.TEMPORAL_CLASS_NAMES.has(designType.name) && typeof designType.from === "function")
        );
    }
    isTemporalValue(value) {
        return (
            value instanceof temporal_polyfill_1.Temporal.PlainDate ||
            value instanceof temporal_polyfill_1.Temporal.PlainDateTime ||
            value instanceof temporal_polyfill_1.Temporal.PlainMonthDay ||
            value instanceof temporal_polyfill_1.Temporal.PlainTime ||
            value instanceof temporal_polyfill_1.Temporal.PlainYearMonth ||
            value instanceof temporal_polyfill_1.Temporal.ZonedDateTime ||
            // fallback for environments where Temporal class definitions may differ
            !!(value && value.constructor && this.TEMPORAL_CLASS_NAMES.has(value.constructor.name) && typeof value.toString === "function")
        );
    }
    convertTemporalParam(value) {
        if (Array.isArray(value)) {
            return value.map((v) => this.convertTemporalParam(v));
        }
        if (this.isTemporalValue(value)) {
            return value.toString();
        }
        return value;
    }
    callKnexFunctionWithColumnFunction(knexFunction, ...args) {
        if (typeof args[0] === "string") {
            return this.callKnexFunctionWithConcatKeyColumn(knexFunction, ...args);
        }
        const columnArguments = this.getArgumentsFromColumnFunction(args[0]);
        if (args.length === 3) {
            knexFunction(this.getColumnName(...columnArguments), args[1], this.convertTemporalParam(args[2]));
        } else {
            knexFunction(this.getColumnName(...columnArguments), this.convertTemporalParam(args[1]));
        }
        return this;
    }
    callKnexFunctionWithConcatKeyColumn(knexFunction, ...args) {
        const columnArguments = args[0].split(".");
        const columnName = this.getColumnName(...columnArguments);
        if (args.length === 3) {
            knexFunction(columnName, args[1], this.convertTemporalParam(args[2]));
        } else {
            knexFunction(columnName, this.convertTemporalParam(args[1]));
        }
        return this;
    }
    selectAllModelProperties() {
        const properties = (0, decorators_1.getColumnProperties)(this.tableClass);
        for (const property of properties) {
            this.queryBuilder.select(`${property.name} as ${property.propertyKey}`);
        }
    }
    join(joinFunctionName, tableToJoinAlias, tableToJoinClass, granularity, joinTableColumnString, operator, existingTableColumnString) {
        this.extraJoinedProperties.push({
            name: tableToJoinAlias,
            propertyType: tableToJoinClass,
        });
        const tableToJoinAliasWithUnderscores = tableToJoinAlias.split(".").join("_");
        const tableToJoinName = (0, decorators_1.getTableName)(tableToJoinClass);
        const joinTableColumnInformation = (0, decorators_1.getColumnInformation)(tableToJoinClass, joinTableColumnString);
        const joinTableColumnArguments = `${tableToJoinAliasWithUnderscores}.${joinTableColumnInformation.name}`;
        const existingTableColumnName = this.getColumnName(...existingTableColumnString.split("."));
        const granularityQuery = !granularity ? "" : ` WITH (${granularity})`;
        const tableNameRaw = this.knex.raw(`?? as ??${granularityQuery}`, [tableToJoinName, tableToJoinAliasWithUnderscores]);
        this.queryBuilder[joinFunctionName](tableNameRaw, joinTableColumnArguments, operator, existingTableColumnName);
        return this;
    }
    mapPropertyNameToColumnName(propertyName) {
        const columnInfo = (0, decorators_1.getColumnInformation)(this.tableClass, propertyName);
        return columnInfo.name;
    }
    mapColumnNameToPropertyName(columnName) {
        const columnProperties = (0, decorators_1.getColumnProperties)(this.tableClass);
        const columnProperty = columnProperties.find((i) => i.name === columnName);
        if (columnProperty === undefined) {
            throw new Error(`Cannot find column with name "${columnName}"`);
        }
        return columnProperty.propertyKey;
    }
    mapColumnsToProperties(item) {
        const columnNames = Object.keys(item);
        for (const columnName of columnNames) {
            const propertyName = this.mapColumnNameToPropertyName(columnName);
            if (columnName !== propertyName) {
                Object.defineProperty(item, propertyName, Object.getOwnPropertyDescriptor(item, columnName));
                delete item[columnName];
            }
        }
    }
    mapPropertiesToColumns(item) {
        const columnsByPropertyKey = new Map((0, decorators_1.getColumnProperties)(this.tableClass).map((c) => [c.propertyKey, c]));
        const propertyNames = Object.keys(item);
        for (const propertyName of propertyNames) {
            const col = columnsByPropertyKey.get(propertyName);
            const val = item[propertyName];
            if (val && (this.isTemporalClass(col === null || col === void 0 ? void 0 : col.designType) || this.isTemporalValue(val))) {
                item[propertyName] = val.toString();
            }
            const columnName = this.mapPropertyNameToColumnName(propertyName);
            if (columnName !== propertyName) {
                Object.defineProperty(item, columnName, Object.getOwnPropertyDescriptor(item, propertyName));
                delete item[propertyName];
            }
        }
    }
}
exports.TypedQueryBuilder = TypedQueryBuilder;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZWRLbmV4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3R5cGVkS25leC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSx5REFBNkM7QUFDN0MsNkNBQThIO0FBUTlILDJDQUFrRTtBQUVsRSxNQUFhLFNBQVM7SUFDbEIsWUFBb0IsSUFBVTtRQUFWLFNBQUksR0FBSixJQUFJLENBQU07SUFBRyxDQUFDO0lBRTNCLEtBQUssQ0FBSSxVQUF1QixFQUFFLFdBQXlCO1FBQzlELE1BQU0sZ0JBQWdCLEdBQUcsV0FBVyxhQUFYLFdBQVcsY0FBWCxXQUFXLEdBQUksSUFBQSw2QkFBZ0IsRUFBQyxVQUFVLENBQUMsQ0FBQyxXQUFXLENBQUM7UUFDakYsT0FBTyxJQUFJLGlCQUFpQixDQUFVLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbkYsQ0FBQztJQUVNLElBQUksQ0FBVSxhQUEwQixFQUFFLFFBQWlGO1FBQzlILE1BQU0sS0FBSyxHQUFHLElBQUEseUJBQVksRUFBQyxhQUFhLENBQUMsQ0FBQztRQUMxQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLHdCQUF3QixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLE9BQU8sSUFBSSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFTSxnQkFBZ0I7UUFDbkIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLElBQUksQ0FBQyxJQUFJO2lCQUNKLFdBQVcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNq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cmVmZXItcmVzdC1wYXJhbXMsIG5vLXVudXNlZC12YXJzICovXG5pbXBvcnQgeyBLbmV4IH0gZnJvbSBcImtuZXhcIjtcbmltcG9ydCB7IFRlbXBvcmFsIH0gZnJvbSBcInRlbXBvcmFsLXBvbHlmaWxsXCI7XG5pbXBvcnQgeyBnZXRDb2x1bW5JbmZvcm1hdGlvbiwgZ2V0Q29sdW1uUHJvcGVydGllcywgZ2V0UHJpbWFyeUtleUNvbHVtbiwgZ2V0VGFibGVNZXRhZGF0YSwgZ2V0VGFibGVOYW1lIH0gZnJvbSBcIi4vZGVjb3JhdG9yc1wiO1xuaW1wb3J0IHsgTmVzdGVkRm9yZWlnbktleUtleXNPZiwgTmVzdGVkS2V5c09mIH0gZnJvbSBcIi4vTmVzdGVkS2V5c09mXCI7XG5pbXBvcnQgeyBOZXN0ZWRSZWNvcmQgfSBmcm9tIFwiLi9OZXN0ZWRSZWNvcmRcIjtcbmltcG9ydCB7IE5vbkZvcmVpZ25LZXlPYmplY3RzIH0gZnJvbSBcIi4vTm9uRm9yZWlnbktleU9iamVjdHNcIjtcbmltcG9ydCB7IE5vbk51bGxhYmxlUmVjdXJzaXZlIH0gZnJvbSBcIi4vTm9uTnVsbGFibGVSZWN1cnNpdmVcIjtcbmltcG9ydCB7IFBhcnRpYWxBbmRVbmRlZmluZWQgfSBmcm9tIFwiLi9QYXJ0aWFsQW5kVW5kZWZpbmVkXCI7XG5pbXBvcnQgeyBHZXROZXN0ZWRQcm9wZXJ0eSwgR2V0TmVzdGVkUHJvcGVydHlUeXBlIH0gZnJvbSBcIi4vUHJvcGVydHlUeXBlc1wiO1xuaW1wb3J0IHsgU2VsZWN0YWJsZUNvbHVtblR5cGVzIH0gZnJvbSBcIi4vU2VsZWN0YWJsZUNvbHVtblR5cGVzXCI7XG5pbXBvcnQgeyBGbGF0dGVuT3B0aW9uLCBzZXRUb051bGwsIHVuZmxhdHRlbiB9IGZyb20gXCIuL3VuZmxhdHRlblwiO1xuXG5leHBvcnQgY2xhc3MgVHlwZWRLbmV4IHtcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIGtuZXg6IEtuZXgpIHt9XG5cbiAgICBwdWJsaWMgcXVlcnk8VD4odGFibGVDbGFzczogbmV3ICgpID0+IFQsIGdyYW51bGFyaXR5PzogR3JhbnVsYXJpdHkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8VCwgVCwgVD4ge1xuICAgICAgICBjb25zdCBxdWVyeUdyYW51bGFyaXR5ID0gZ3JhbnVsYXJpdHkgPz8gZ2V0VGFibGVNZXRhZGF0YSh0YWJsZUNsYXNzKS5kZWZhdWx0TG9jaztcbiAgICAgICAgcmV0dXJuIG5ldyBUeXBlZFF1ZXJ5QnVpbGRlcjxULCBULCBUPih0YWJsZUNsYXNzLCBxdWVyeUdyYW51bGFyaXR5LCB0aGlzLmtuZXgpO1xuICAgIH1cblxuICAgIHB1YmxpYyB3aXRoPFQsIFUsIFY+KGN0ZVRhYmxlQ2xhc3M6IG5ldyAoKSA9PiBULCBjdGVRdWVyeTogKHF1ZXJ5QnVpbGRlcjogVHlwZWRLbmV4Q1RFUXVlcnlCdWlsZGVyKSA9PiBJVHlwZWRRdWVyeUJ1aWxkZXI8VSwgViwgVD4pOiBUeXBlZEtuZXhRdWVyeUJ1aWxkZXIge1xuICAgICAgICBjb25zdCBhbGlhcyA9IGdldFRhYmxlTmFtZShjdGVUYWJsZUNsYXNzKTtcbiAgICAgICAgY29uc3QgcWIgPSB0aGlzLmtuZXgud2l0aChhbGlhcywgKHcpID0+IGN0ZVF1ZXJ5KG5ldyBUeXBlZEtuZXhDVEVRdWVyeUJ1aWxkZXIodGhpcy5rbmV4LCB3KSkpO1xuICAgICAgICByZXR1cm4gbmV3IFR5cGVkS25leFF1ZXJ5QnVpbGRlcih0aGlzLmtuZXgsIHFiKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYmVnaW5UcmFuc2FjdGlvbigpOiBQcm9taXNlPEtuZXguVHJhbnNhY3Rpb24+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmtuZXhcbiAgICAgICAgICAgICAgICAudHJhbnNhY3Rpb24oKHRyKSA9PiByZXNvbHZlKHRyKSlcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGlzIGVycm9yIGlzIG5vdCBjYXVnaHQgaGVyZSwgaXQgd2lsbCB0aHJvdywgcmVzdWx0aW5nIGluIGFuIHVuaGFuZGxlZFJlamVjdGlvblxuICAgICAgICAgICAgICAgIC5jYXRjaCgoX2UpID0+IHt9KTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5jbGFzcyBUeXBlZEtuZXhDVEVRdWVyeUJ1aWxkZXIge1xuICAgIGNvbnN0cnVjdG9yKHByb3RlY3RlZCBrbmV4OiBLbmV4LCBwcm90ZWN0ZWQgcXVlcnlCdWlsZGVyOiBLbmV4LlF1ZXJ5QnVpbGRlcikge31cblxuICAgIHB1YmxpYyBxdWVyeTxUPih0YWJsZUNsYXNzOiBuZXcgKCkgPT4gVCwgZ3JhbnVsYXJpdHk/OiBHcmFudWxhcml0eSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxULCBULCBUPiB7XG4gICAgICAgIHJldHVybiBuZXcgVHlwZWRRdWVyeUJ1aWxkZXI8VCwgVCwgVD4odGFibGVDbGFzcywgZ3JhbnVsYXJpdHksIHRoaXMua25leCwgdGhpcy5xdWVyeUJ1aWxkZXIpO1xuICAgIH1cbn1cblxuY2xhc3MgVHlwZWRLbmV4UXVlcnlCdWlsZGVyIGV4dGVuZHMgVHlwZWRLbmV4Q1RFUXVlcnlCdWlsZGVyIHtcbiAgICBwdWJsaWMgd2l0aDxULCBVLCBWPihjdGVUYWJsZUNsYXNzOiBuZXcgKCkgPT4gVCwgY3RlUXVlcnk6IChxdWVyeUJ1aWxkZXI6IFR5cGVkS25leENURVF1ZXJ5QnVpbGRlcikgPT4gSVR5cGVkUXVlcnlCdWlsZGVyPFUsIFYsIFQ+KTogVHlwZWRLbmV4UXVlcnlCdWlsZGVyIHtcbiAgICAgICAgY29uc3QgYWxpYXMgPSBnZXRUYWJsZU5hbWUoY3RlVGFibGVDbGFzcyk7XG4gICAgICAgIGNvbnN0IHFiID0gdGhpcy5xdWVyeUJ1aWxkZXIud2l0aChhbGlhcywgKHcpID0+IGN0ZVF1ZXJ5KG5ldyBUeXBlZEtuZXhDVEVRdWVyeUJ1aWxkZXIodGhpcy5rbmV4LCB3KSkpO1xuICAgICAgICByZXR1cm4gbmV3IFR5cGVkS25leFF1ZXJ5QnVpbGRlcih0aGlzLmtuZXgsIHFiKTtcbiAgICB9XG59XG5cbmxldCBiZWZvcmVJbnNlcnRUcmFuc2Zvcm0gPSB1bmRlZmluZWQgYXMgdW5kZWZpbmVkIHwgKChpdGVtOiBhbnksIHR5cGVkUXVlcnlCdWlsZGVyOiBhbnkpID0+IGFueSk7XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckJlZm9yZUluc2VydFRyYW5zZm9ybTxUPihmOiAoaXRlbTogVCwgdHlwZWRRdWVyeUJ1aWxkZXI6IElUeXBlZFF1ZXJ5QnVpbGRlcjx7fSwge30sIHt9PikgPT4gVCkge1xuICAgIGJlZm9yZUluc2VydFRyYW5zZm9ybSA9IGY7XG59XG5cbmxldCBiZWZvcmVVcGRhdGVUcmFuc2Zvcm0gPSB1bmRlZmluZWQgYXMgdW5kZWZpbmVkIHwgKChpdGVtOiBhbnksIHR5cGVkUXVlcnlCdWlsZGVyOiBhbnkpID0+IGFueSk7XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckJlZm9yZVVwZGF0ZVRyYW5zZm9ybTxUPihmOiAoaXRlbTogVCwgdHlwZWRRdWVyeUJ1aWxkZXI6IElUeXBlZFF1ZXJ5QnVpbGRlcjx7fSwge30sIHt9PikgPT4gVCkge1xuICAgIGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSA9IGY7XG59XG5cbmNsYXNzIE5vdEltcGxlbWVudGVkRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKFwiTm90IGltcGxlbWVudGVkXCIpO1xuICAgIH1cbn1cblxuY2xhc3MgQ29sdW1uRnJvbVF1ZXJ5IHtcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIGFsaWFzOiBzdHJpbmcpIHt9XG5cbiAgICBwdWJsaWMgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmFsaWFzO1xuICAgIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgY29sdW1uczogeyBuYW1lOiBzdHJpbmcgfVtdO1xuXG4gICAgd2hlcmU6IElXaGVyZVdpdGhPcGVyYXRvcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGFuZFdoZXJlOiBJV2hlcmVXaXRoT3BlcmF0b3I8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlOiBJV2hlcmVXaXRoT3BlcmF0b3I8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdDogSVdoZXJlPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgc2VsZWN0OiBJU2VsZWN0V2l0aEZ1bmN0aW9uQ29sdW1uczM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBzZWxlY3RRdWVyeTogSVNlbGVjdFF1ZXJ5PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBvcmRlckJ5OiBJT3JkZXJCeTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGlubmVySm9pbkNvbHVtbjogSUtleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBsZWZ0T3V0ZXJKb2luQ29sdW1uOiBJS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgd2hlcmVDb2x1bW46IElXaGVyZUNvbXBhcmVUd29Db2x1bW5zPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZU51bGw6IElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgd2hlcmVOb3ROdWxsOiBJQ29sdW1uUGFyYW1ldGVyTm9Sb3dUcmFuc2Zvcm1hdGlvbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVOdWxsOiBJQ29sdW1uUGFyYW1ldGVyTm9Sb3dUcmFuc2Zvcm1hdGlvbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVOb3ROdWxsOiBJQ29sdW1uUGFyYW1ldGVyTm9Sb3dUcmFuc2Zvcm1hdGlvbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgbGVmdE91dGVySm9pblRhYmxlT25GdW5jdGlvbjogSUpvaW5UYWJsZU11bHRpcGxlT25DbGF1c2VzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIGlubmVySm9pblRhYmxlT25GdW5jdGlvbjogSUpvaW5UYWJsZU11bHRpcGxlT25DbGF1c2VzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgaW5uZXJKb2luOiBJSm9pbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBsZWZ0T3V0ZXJKb2luOiBJSm9pbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIHNlbGVjdEFsaWFzOiBJU2VsZWN0QWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgc2VsZWN0UmF3OiBJU2VsZWN0UmF3PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgZmluZEJ5UHJpbWFyeUtleTogSUZpbmRCeVByaW1hcnlLZXk8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICB3aGVyZUluOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIHdoZXJlTm90SW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBvcldoZXJlSW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU5vdEluOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgd2hlcmVCZXR3ZWVuOiBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgd2hlcmVOb3RCZXR3ZWVuOiBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZUJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlTm90QmV0d2VlbjogSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgd2hlcmVFeGlzdHM6IElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgb3JXaGVyZUV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgd2hlcmVOb3RFeGlzdHM6IElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVOb3RFeGlzdHM6IElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgd2hlcmVQYXJlbnRoZXNlczogSVdoZXJlUGFyZW50aGVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlUGFyZW50aGVzZXM6IElXaGVyZVBhcmVudGhlc2VzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBncm91cEJ5OiBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGhhdmluZzogSUhhdmluZzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nTnVsbDogSVNlbGVjdGFibGVDb2x1bW5LZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgaGF2aW5nTm90TnVsbDogSVNlbGVjdGFibGVDb2x1bW5LZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBoYXZpbmdJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3RJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGhhdmluZ0V4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgaGF2aW5nTm90RXhpc3RzOiBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGhhdmluZ0JldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3RCZXR3ZWVuOiBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB1bmlvbjogSVVuaW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgdW5pb25BbGw6IElVbmlvbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgbWluOiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIGNvdW50OiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBjb3VudERpc3RpbmN0OiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBtYXg6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIHN1bTogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgc3VtRGlzdGluY3Q6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIGF2ZzogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgYXZnRGlzdGluY3Q6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgaW5zZXJ0U2VsZWN0OiBJSW5zZXJ0U2VsZWN0O1xuXG4gICAgaW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmc6IElJbnNlcnRJdGVtV2l0aFJldHVybmluZzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nOiBJSW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmc8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGdldENvbHVtbkFsaWFzKG5hbWU6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4pOiBzdHJpbmc7XG4gICAgZ2V0Q29sdW1uKG5hbWU6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4pOiBDb2x1bW5Gcm9tUXVlcnk7XG5cbiAgICBkaXN0aW5jdE9uKGNvbHVtbk5hbWVzOiBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+W10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGNsZWFyU2VsZWN0KCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBNb2RlbD47XG4gICAgY2xlYXJXaGVyZSgpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBjbGVhck9yZGVyKCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgbGltaXQodmFsdWU6IG51bWJlcik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9mZnNldCh2YWx1ZTogbnVtYmVyKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB1c2VLbmV4UXVlcnlCdWlsZGVyKGY6IChxdWVyeTogS25leC5RdWVyeUJ1aWxkZXIpID0+IHZvaWQpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBnZXRLbmV4UXVlcnlCdWlsZGVyKCk6IEtuZXguUXVlcnlCdWlsZGVyO1xuICAgIHRvUXVlcnkoKTogc3RyaW5nO1xuXG4gICAgZ2V0Rmlyc3RPck51bGwoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdykgfCBudWxsPjtcbiAgICBnZXRGaXJzdE9yVW5kZWZpbmVkKGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTwoUm93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3cpIHwgdW5kZWZpbmVkPjtcbiAgICBnZXRGaXJzdChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8Um93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3c+O1xuICAgIGdldFNpbmdsZU9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8KFJvdyBleHRlbmRzIE1vZGVsID8gUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+IDogUm93KSB8IG51bGw+O1xuICAgIGdldFNpbmdsZU9yVW5kZWZpbmVkKGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTwoUm93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3cpIHwgdW5kZWZpbmVkPjtcbiAgICBnZXRTaW5nbGUoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPFJvdyBleHRlbmRzIE1vZGVsID8gUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+IDogUm93PjtcbiAgICBnZXRNYW55KGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTwoUm93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3cpW10+O1xuICAgIGdldENvdW50KCk6IFByb21pc2U8bnVtYmVyIHwgc3RyaW5nPjtcbiAgICBpbnNlcnRJdGVtKG5ld09iamVjdDogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+KTogUHJvbWlzZTx2b2lkPjtcbiAgICBpbnNlcnRJdGVtcyhpdGVtczogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+W10pOiBQcm9taXNlPHZvaWQ+O1xuICAgIGRlbCgpOiBQcm9taXNlPHZvaWQ+O1xuICAgIGRlbEJ5UHJpbWFyeUtleShwcmltYXJ5S2V5VmFsdWU6IGFueSk6IFByb21pc2U8dm9pZD47XG4gICAgdXBkYXRlSXRlbShpdGVtOiBQYXJ0aWFsQW5kVW5kZWZpbmVkPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4pOiBQcm9taXNlPHZvaWQ+O1xuICAgIHVwZGF0ZUl0ZW1CeVByaW1hcnlLZXkocHJpbWFyeUtleVZhbHVlOiBhbnksIGl0ZW06IFBhcnRpYWxBbmRVbmRlZmluZWQ8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+Pik6IFByb21pc2U8dm9pZD47XG4gICAgdXBkYXRlSXRlbXNCeVByaW1hcnlLZXkoXG4gICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICBwcmltYXJ5S2V5VmFsdWU6IGFueTtcbiAgICAgICAgICAgIGRhdGE6IFBhcnRpYWxBbmRVbmRlZmluZWQ8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+PjtcbiAgICAgICAgfVtdXG4gICAgKTogUHJvbWlzZTx2b2lkPjtcbiAgICBleGVjdXRlKCk6IFByb21pc2U8dm9pZD47XG4gICAgd2hlcmVSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGhhdmluZ1JhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB0cmFuc2FjdGluZyh0cng6IEtuZXguVHJhbnNhY3Rpb24pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHRydW5jYXRlKCk6IFByb21pc2U8dm9pZD47XG4gICAgZGlzdGluY3QoKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBjbG9uZSgpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGdyb3VwQnlSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgb3JkZXJCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBrZWVwRmxhdCgpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgYW55Pjtcbn1cblxudHlwZSBSZXR1cm5Ob25PYmplY3RzTmFtZXNPbmx5PFQ+ID0geyBbSyBpbiBrZXlvZiBUXTogVFtLXSBleHRlbmRzIFNlbGVjdGFibGVDb2x1bW5UeXBlcyA/IEsgOiBuZXZlciB9W2tleW9mIFRdO1xuXG50eXBlIFJlbW92ZU9iamVjdHNGcm9tPFQ+ID0geyBbUCBpbiBSZXR1cm5Ob25PYmplY3RzTmFtZXNPbmx5PFQ+XTogVFtQXSB9O1xuXG5leHBvcnQgdHlwZSBPYmplY3RUb1ByaW1pdGl2ZTxUPiA9IFQgZXh0ZW5kcyBTdHJpbmcgPyBzdHJpbmcgOiBUIGV4dGVuZHMgTnVtYmVyID8gbnVtYmVyIDogVCBleHRlbmRzIEJvb2xlYW4gPyBib29sZWFuIDogbmV2ZXI7XG5cbmV4cG9ydCB0eXBlIE9wZXJhdG9yID0gXCI9XCIgfCBcIiE9XCIgfCBcIj5cIiB8IFwiPFwiIHwgc3RyaW5nO1xuXG5pbnRlcmZhY2UgSUNvbnN0cnVjdG9yPFQ+IHtcbiAgICBuZXcgKC4uLmFyZ3M6IGFueVtdKTogVDtcbn1cblxuZXhwb3J0IHR5cGUgQWRkUHJvcGVydHlXaXRoVHlwZTxPcmlnaW5hbCwgTmV3S2V5IGV4dGVuZHMga2V5b2YgYW55LCBOZXdLZXlUeXBlPiA9IE9yaWdpbmFsICYgTmVzdGVkUmVjb3JkPE5ld0tleSwgTmV3S2V5VHlwZT47XG5cbmludGVyZmFjZSBJSW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmc8TW9kZWwsIF9TZWxlY3RhYmxlTW9kZWwsIF9Sb3c+IHtcbiAgICAobmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4pOiBQcm9taXNlPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj47XG4gICAgPEtleXMgZXh0ZW5kcyBrZXlvZiBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+KG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+LCBrZXlzOiBLZXlzW10pOiBQcm9taXNlPFBpY2s8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+LCBLZXlzPj47XG59XG5cbmludGVyZmFjZSBJQ29sdW1uUGFyYW1ldGVyTm9Sb3dUcmFuc2Zvcm1hdGlvbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElKb2luT248TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleTEgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8Sm9pbmVkTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIFwiXCI+LCBDb25jYXRLZXkyIGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oXG4gICAgICAgIGtleTE6IENvbmNhdEtleTEsXG4gICAgICAgIG9wZXJhdG9yOiBPcGVyYXRvcixcbiAgICAgICAga2V5MjogQ29uY2F0S2V5MlxuICAgICk6IElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSm9pbk9uVmFsPE1vZGVsLCBKb2luZWRNb2RlbD4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8Sm9pbmVkTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgb3BlcmF0b3I6IE9wZXJhdG9yLCB2YWx1ZTogYW55KTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cbmludGVyZmFjZSBJSm9pbk9uTW9kZWxWYWw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBvcGVyYXRvcjogT3BlcmF0b3IsIHZhbHVlOiBhbnkpOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5Pbk51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5KTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cbmludGVyZmFjZSBJSm9pbk9uTW9kZWxOdWxsPE1vZGVsLCBKb2luZWRNb2RlbD4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSk6IElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSm9pbk9uUGFyZW50aGVzZXM8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgKG9uRnVuY3Rpb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+KSA9PiB2b2lkKTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElKb2luT25SYXc8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgKHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgb246IElKb2luT248TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvck9uOiBJSm9pbk9uPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgYW5kT246IElKb2luT248TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvblZhbDogSUpvaW5PblZhbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIGFuZE9uVmFsOiBJSm9pbk9uVmFsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25RdWVyeVZhbDogSUpvaW5Pbk1vZGVsVmFsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPblZhbDogSUpvaW5PblZhbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25RdWVyeVZhbDogSUpvaW5Pbk1vZGVsVmFsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25OdWxsOiBJSm9pbk9uTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9uUXVlcnlOdWxsOiBJSm9pbk9uTW9kZWxOdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPbk51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPblF1ZXJ5TnVsbDogSUpvaW5Pbk1vZGVsTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9uTm90TnVsbDogSUpvaW5Pbk51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvblF1ZXJ5Tm90TnVsbDogSUpvaW5Pbk1vZGVsTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25Ob3ROdWxsOiBJSm9pbk9uTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25RdWVyeU5vdE51bGw6IElKb2luT25Nb2RlbE51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBhbmRPbk5vdE51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgYW5kT25OdWxsOiBJSm9pbk9uTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9uUGFyZW50aGVzZXM6IElKb2luT25QYXJlbnRoZXNlczxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIGFuZE9uUGFyZW50aGVzZXM6IElKb2luT25QYXJlbnRoZXNlczxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25QYXJlbnRoZXNlczogSUpvaW5PblBhcmVudGhlc2VzPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25SYXc6IElKb2luT25SYXc8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvck9uUmF3OiBJSm9pbk9uUmF3PE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSW5zZXJ0U2VsZWN0IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TmV3UHJvcGVydHlUeXBlPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TmV3UHJvcGVydHlUeXBlPiwgXCJcIj4+KFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICAuLi5jb2x1bW5OYW1lczogQ29uY2F0S2V5W11cbiAgICApOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5UYWJsZU11bHRpcGxlT25DbGF1c2VzPE1vZGVsLCBfU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueT4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgTmV3UHJvcGVydHlUeXBlPikgPT4gdm9pZFxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgQWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIFJvdz47XG5cbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueT4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LFxuICAgICAgICBvbjogKGpvaW46IElKb2luT25DbGF1c2UyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBOZXdQcm9wZXJ0eVR5cGU+KSA9PiB2b2lkXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElKb2luPE1vZGVsLCBfU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueSwgQ29uY2F0S2V5MiBleHRlbmRzIGtleW9mIE5ld1Byb3BlcnR5VHlwZSwgQ29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAga2V5OiBDb25jYXRLZXkyLFxuICAgICAgICBvcGVyYXRvcjogT3BlcmF0b3IsXG4gICAgICAgIGtleTI6IENvbmNhdEtleVxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgQWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIFJvdz47XG5cbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueSwgQ29uY2F0S2V5MiBleHRlbmRzIGtleW9mIE5ld1Byb3BlcnR5VHlwZSwgQ29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LFxuICAgICAgICBrZXk6IENvbmNhdEtleTIsXG4gICAgICAgIG9wZXJhdG9yOiBPcGVyYXRvcixcbiAgICAgICAga2V5MjogQ29uY2F0S2V5XG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElTZWxlY3RBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIFwiXCI+LCBUTmFtZSBleHRlbmRzIGtleW9mIGFueT4oYWxpYXM6IFROYW1lLCBjb2x1bW5OYW1lOiBDb25jYXRLZXkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJlY29yZDxUTmFtZSwgR2V0TmVzdGVkUHJvcGVydHlUeXBlPFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj4gJiBSb3dcbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSVNlbGVjdFJhdzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8VFJldHVybiBleHRlbmRzIEJvb2xlYW4gfCBTdHJpbmcgfCBOdW1iZXIsIFROYW1lIGV4dGVuZHMga2V5b2YgYW55PihuYW1lOiBUTmFtZSwgcmV0dXJuVHlwZTogSUNvbnN0cnVjdG9yPFRSZXR1cm4+LCBxdWVyeTogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJlY29yZDxUTmFtZSwgT2JqZWN0VG9QcmltaXRpdmU8VFJldHVybj4+ICYgUm93XG4gICAgPjtcbn1cblxuaW50ZXJmYWNlIElTZWxlY3RRdWVyeTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8VFJldHVybiBleHRlbmRzIEJvb2xlYW4gfCBTdHJpbmcgfCBOdW1iZXIsIFROYW1lIGV4dGVuZHMga2V5b2YgYW55LCBTdWJRdWVyeU1vZGVsPihcbiAgICAgICAgbmFtZTogVE5hbWUsXG4gICAgICAgIHJldHVyblR5cGU6IElDb25zdHJ1Y3RvcjxUUmV0dXJuPixcbiAgICAgICAgc3ViUXVlcnlNb2RlbDogbmV3ICgpID0+IFN1YlF1ZXJ5TW9kZWwsXG4gICAgICAgIGNvZGU6IChzdWJRdWVyeTogSVR5cGVkUXVlcnlCdWlsZGVyPFN1YlF1ZXJ5TW9kZWwsIFN1YlF1ZXJ5TW9kZWwsIHt9PiwgcGFyZW50OiBUcmFuc2Zvcm1Qcm9wc1RvRnVuY3Rpb25zUmV0dXJuUHJvcGVydHlOYW1lPE1vZGVsPikgPT4gdm9pZCxcbiAgICAgICAgZ3JhbnVsYXJpdHk/OiBHcmFudWxhcml0eVxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSZWNvcmQ8VE5hbWUsIE9iamVjdFRvUHJpbWl0aXZlPFRSZXR1cm4+PiAmIFJvdz47XG59XG5cbnR5cGUgVHJhbnNmb3JtUHJvcHNUb0Z1bmN0aW9uc1JldHVyblByb3BlcnR5TmFtZTxNb2RlbD4gPSB7XG4gICAgW1AgaW4ga2V5b2YgTW9kZWxdOiBNb2RlbFtQXSBleHRlbmRzIG9iamVjdCA/IChNb2RlbFtQXSBleHRlbmRzIFJlcXVpcmVkPE5vbkZvcmVpZ25LZXlPYmplY3RzPiA/ICgpID0+IFAgOiBUcmFuc2Zvcm1Qcm9wc1RvRnVuY3Rpb25zUmV0dXJuUHJvcGVydHlOYW1lPE1vZGVsW1BdPikgOiAoKSA9PiBQO1xufTtcblxuaW50ZXJmYWNlIElPcmRlckJ5PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwgXCJcIj4sIFROYW1lIGV4dGVuZHMga2V5b2YgYW55PihcbiAgICAgICAgY29sdW1uTmFtZXM6IENvbmNhdEtleSxcbiAgICAgICAgZGlyZWN0aW9uPzogXCJhc2NcIiB8IFwiZGVzY1wiXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyAmIFJlY29yZDxUTmFtZSwgR2V0TmVzdGVkUHJvcGVydHlUeXBlPFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj4+O1xufVxuXG5pbnRlcmZhY2UgSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBcIlwiPiwgVE5hbWUgZXh0ZW5kcyBrZXlvZiBhbnk+KGNvbHVtbk5hbWVzOiBDb25jYXRLZXksIG5hbWU6IFROYW1lKTogSVR5cGVkUXVlcnlCdWlsZGVyPFxuICAgICAgICBNb2RlbCxcbiAgICAgICAgU2VsZWN0YWJsZU1vZGVsLFxuICAgICAgICBSb3cgJiBSZWNvcmQ8VE5hbWUsIEdldE5lc3RlZFByb3BlcnR5VHlwZTxTZWxlY3RhYmxlTW9kZWwsIENvbmNhdEtleT4+XG4gICAgPjtcbn1cblxudHlwZSBVbmlvblRvSW50ZXJzZWN0aW9uPFU+ID0gKFUgZXh0ZW5kcyBhbnkgPyAoazogVSkgPT4gdm9pZCA6IG5ldmVyKSBleHRlbmRzIChrOiBpbmZlciBJKSA9PiB2b2lkID8gSSA6IG5ldmVyO1xuXG5pbnRlcmZhY2UgSVNlbGVjdFdpdGhGdW5jdGlvbkNvbHVtbnMzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwgXCJcIj4+KC4uLmNvbHVtbk5hbWVzOiBDb25jYXRLZXlbXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxcbiAgICAgICAgTW9kZWwsXG4gICAgICAgIFNlbGVjdGFibGVNb2RlbCxcbiAgICAgICAgUm93ICYgVW5pb25Ub0ludGVyc2VjdGlvbjxHZXROZXN0ZWRQcm9wZXJ0eTxTZWxlY3RhYmxlTW9kZWwsIENvbmNhdEtleT4+XG4gICAgPjtcbn1cblxuaW50ZXJmYWNlIElGaW5kQnlQcmltYXJ5S2V5PF9Nb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIFwiXCI+PihwcmltYXJ5S2V5VmFsdWU6IGFueSwgLi4uY29sdW1uTmFtZXM6IENvbmNhdEtleVtdKTogUHJvbWlzZTxcbiAgICAgICAgKFJvdyAmIFVuaW9uVG9JbnRlcnNlY3Rpb248R2V0TmVzdGVkUHJvcGVydHk8U2VsZWN0YWJsZU1vZGVsLCBDb25jYXRLZXk+PikgfCB1bmRlZmluZWRcbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSUtleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEZvcmVpZ25LZXlLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgZ3JhbnVsYXJpdHk/OiBHcmFudWxhcml0eSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVNlbGVjdGFibGVDb2x1bW5LZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVdoZXJlPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgdmFsdWU6IEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5Pik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVdoZXJlV2l0aE9wZXJhdG9yPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgdmFsdWU6IEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5Pik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBvcGVyYXRvcjogT3BlcmF0b3IsIHZhbHVlOiBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT4pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJvd1xuICAgID47XG59XG5cbmludGVyZmFjZSBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXksIHZhbHVlOiBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT5bXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPiwgUHJvcGVydHlUeXBlIGV4dGVuZHMgR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+PihcbiAgICAgICAga2V5OiBDb25jYXRLZXksXG4gICAgICAgIHZhbHVlOiBbUHJvcGVydHlUeXBlLCBQcm9wZXJ0eVR5cGVdXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJSGF2aW5nPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgb3BlcmF0b3I6IE9wZXJhdG9yLCB2YWx1ZTogR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+KTogSVR5cGVkUXVlcnlCdWlsZGVyPFxuICAgICAgICBNb2RlbCxcbiAgICAgICAgU2VsZWN0YWJsZU1vZGVsLFxuICAgICAgICBSb3dcbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSVdoZXJlQ29tcGFyZVR3b0NvbHVtbnM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPF9Qcm9wZXJ0eVR5cGUxLCBfUHJvcGVydHlUeXBlMiwgTW9kZWwyPihcbiAgICAgICAga2V5MTogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPixcbiAgICAgICAgb3BlcmF0b3I6IE9wZXJhdG9yLFxuICAgICAgICBrZXkyOiBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWwyPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWwyPiwgXCJcIj5cbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIChrZXkxOiBDb2x1bW5Gcm9tUXVlcnksIG9wZXJhdG9yOiBPcGVyYXRvciwga2V5MjogQ29sdW1uRnJvbVF1ZXJ5KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPFN1YlF1ZXJ5TW9kZWw+KFxuICAgICAgICBzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCxcbiAgICAgICAgY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8U3ViUXVlcnlNb2RlbCwgU3ViUXVlcnlNb2RlbCwge30+LCBwYXJlbnQ6IFRyYW5zZm9ybVByb3BzVG9GdW5jdGlvbnNSZXR1cm5Qcm9wZXJ0eU5hbWU8U2VsZWN0YWJsZU1vZGVsPikgPT4gdm9pZFxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgPFN1YlF1ZXJ5TW9kZWw+KFxuICAgICAgICBzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCxcbiAgICAgICAgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LFxuICAgICAgICBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4sIHBhcmVudDogVHJhbnNmb3JtUHJvcHNUb0Z1bmN0aW9uc1JldHVyblByb3BlcnR5TmFtZTxTZWxlY3RhYmxlTW9kZWw+KSA9PiB2b2lkXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmVQYXJlbnRoZXNlczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICAoY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PikgPT4gdm9pZCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVVuaW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxTdWJRdWVyeU1vZGVsPihzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCwgY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8U3ViUXVlcnlNb2RlbCwgU3ViUXVlcnlNb2RlbCwge30+KSA9PiB2b2lkKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICA8U3ViUXVlcnlNb2RlbD4oc3ViUXVlcnlNb2RlbDogbmV3ICgpID0+IFN1YlF1ZXJ5TW9kZWwsIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSwgY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8U3ViUXVlcnlNb2RlbCwgU3ViUXVlcnlNb2RlbCwge30+KSA9PiB2b2lkKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmV4cG9ydCB0eXBlIEdyYW51bGFyaXR5ID0gXCJQQUdMT0NLXCIgfCBcIk5PTE9DS1wiIHwgXCJSRUFEQ09NTUlUVEVETE9DS1wiIHwgXCJST1dMT0NLXCIgfCBcIlRBQkxPQ0tcIiB8IFwiVEFCTE9DS1hcIjtcblxuZnVuY3Rpb24gZ2V0UHJveHlBbmRNZW1vcmllczxNb2RlbFR5cGUsIFJvdz4odHlwZWRRdWVyeUJ1aWxkZXI/OiBUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbFR5cGUsIFJvdz4pIHtcbiAgICBjb25zdCBtZW1vcmllcyA9IFtdIGFzIHN0cmluZ1tdO1xuXG4gICAgZnVuY3Rpb24gYWxsR2V0KF90YXJnZXQ6IGFueSwgbmFtZTogYW55KTogYW55IHtcbiAgICAgICAgaWYgKG5hbWUgPT09IFwibWVtb3JpZXNcIikge1xuICAgICAgICAgICAgcmV0dXJuIG1lbW9yaWVzO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG5hbWUgPT09IFwiZ2V0Q29sdW1uTmFtZVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZWRRdWVyeUJ1aWxkZXIhLmdldENvbHVtbk5hbWUoLi4ubWVtb3JpZXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBtZW1vcmllcy5wdXNoKG5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJveHkoXG4gICAgICAgICAgICB7fSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCByb290ID0gbmV3IFByb3h5KFxuICAgICAgICB7fSxcbiAgICAgICAge1xuICAgICAgICAgICAgZ2V0OiBhbGxHZXQsXG4gICAgICAgIH1cbiAgICApO1xuXG4gICAgcmV0dXJuIHsgcm9vdCwgbWVtb3JpZXMgfTtcbn1cblxuZnVuY3Rpb24gZ2V0UHJveHlBbmRNZW1vcmllc0ZvckFycmF5PE1vZGVsVHlwZSwgUm93Pih0eXBlZFF1ZXJ5QnVpbGRlcj86IFR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsVHlwZSwgUm93Pikge1xuICAgIGNvbnN0IHJlc3VsdCA9IFtdIGFzIHN0cmluZ1tdW107XG5cbiAgICBsZXQgY291bnRlciA9IC0xO1xuXG4gICAgZnVuY3Rpb24gYWxsR2V0KF90YXJnZXQ6IGFueSwgbmFtZTogYW55KTogYW55IHtcbiAgICAgICAgaWYgKF90YXJnZXQubGV2ZWwgPT09IDApIHtcbiAgICAgICAgICAgIGNvdW50ZXIrKztcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKFtdKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobmFtZSA9PT0gXCJtZW1vcmllc1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0W2NvdW50ZXJdO1xuICAgICAgICB9XG4gICAgICAgIGlmIChuYW1lID09PSBcInJlc3VsdFwiKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChuYW1lID09PSBcImxldmVsXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBfdGFyZ2V0LmxldmVsO1xuICAgICAgICB9XG4gICAgICAgIGlmIChuYW1lID09PSBcImdldENvbHVtbk5hbWVcIikge1xuICAgICAgICAgICAgcmV0dXJuIHR5cGVkUXVlcnlCdWlsZGVyIS5nZXRDb2x1bW5OYW1lKC4uLnJlc3VsdFtjb3VudGVyXSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXN1bHRbY291bnRlcl0ucHVzaChuYW1lKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb3h5KFxuICAgICAgICAgICAge30sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZ2V0OiBhbGxHZXQsXG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgcm9vdCA9IG5ldyBQcm94eShcbiAgICAgICAgeyBsZXZlbDogMCB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICByZXR1cm4geyByb290LCByZXN1bHQgfTtcbn1cblxuZXhwb3J0IGNsYXNzIFR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsVHlwZSwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgPSB7fT4gaW1wbGVtZW50cyBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIHB1YmxpYyBjb2x1bW5zOiB7IG5hbWU6IHN0cmluZyB9W107XG5cbiAgICBwdWJsaWMgb25seUxvZ1F1ZXJ5ID0gZmFsc2U7XG4gICAgcHVibGljIHF1ZXJ5TG9nID0gXCJcIjtcbiAgICBwcml2YXRlIGhhc1NlbGVjdENsYXVzZSA9IGZhbHNlO1xuXG4gICAgcHJpdmF0ZSBxdWVyeUJ1aWxkZXI6IEtuZXguUXVlcnlCdWlsZGVyO1xuICAgIHByaXZhdGUgdGFibGVOYW1lOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBzaG91bGRVbmZsYXR0ZW46IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBleHRyYUpvaW5lZFByb3BlcnRpZXM6IHtcbiAgICAgICAgbmFtZTogc3RyaW5nO1xuICAgICAgICBwcm9wZXJ0eVR5cGU6IG5ldyAoKSA9PiBhbnk7XG4gICAgfVtdO1xuXG4gICAgcHJpdmF0ZSB0cmFuc2FjdGlvbj86IEtuZXguVHJhbnNhY3Rpb247XG5cbiAgICBwcml2YXRlIHN1YlF1ZXJ5Q291bnRlciA9IDA7XG5cbiAgICBwcml2YXRlIGdyYW51bGFyaXR5U2V0OiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8R3JhbnVsYXJpdHk+KFtcIk5PTE9DS1wiLCBcIlBBR0xPQ0tcIiwgXCJSRUFEQ09NTUlUVEVETE9DS1wiLCBcIlJPV0xPQ0tcIiwgXCJUQUJMT0NLXCIsIFwiVEFCTE9DS1hcIl0pO1xuXG4gICAgY29uc3RydWN0b3IoXG4gICAgICAgIHByaXZhdGUgdGFibGVDbGFzczogbmV3ICgpID0+IE1vZGVsVHlwZSxcbiAgICAgICAgcHJpdmF0ZSBncmFudWxhcml0eTogR3JhbnVsYXJpdHkgfCB1bmRlZmluZWQsXG4gICAgICAgIHByaXZhdGUga25leDogS25leCxcbiAgICAgICAgcXVlcnlCdWlsZGVyPzogS25leC5RdWVyeUJ1aWxkZXIsXG4gICAgICAgIHByaXZhdGUgcGFyZW50VHlwZWRRdWVyeUJ1aWxkZXI/OiBhbnksXG4gICAgICAgIHByaXZhdGUgc3ViUXVlcnlQcmVmaXg/OiBzdHJpbmdcbiAgICApIHtcbiAgICAgICAgdGhpcy50YWJsZU5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVDbGFzcyk7XG4gICAgICAgIHRoaXMuY29sdW1ucyA9IGdldENvbHVtblByb3BlcnRpZXModGFibGVDbGFzcyk7XG5cbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHlRdWVyeSA9ICFncmFudWxhcml0eSA/IFwiXCIgOiBgIFdJVEggKCR7Z3JhbnVsYXJpdHl9KWA7XG4gICAgICAgIGlmIChxdWVyeUJ1aWxkZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIgPSBxdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAodGhpcy5zdWJRdWVyeVByZWZpeCkge1xuICAgICAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmZyb20odGhpcy5rbmV4LnJhdyhgPz8gYXMgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RoaXMudGFibGVOYW1lLCBgJHt0aGlzLnN1YlF1ZXJ5UHJlZml4fSR7dGhpcy50YWJsZU5hbWV9YF0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZnJvbSh0aGlzLmtuZXgucmF3KGA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGhpcy50YWJsZU5hbWVdKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlciA9IHRoaXMua25leC5mcm9tKHRoaXMua25leC5yYXcoYD8/JHtncmFudWxhcml0eVF1ZXJ5fWAsIFt0aGlzLnRhYmxlTmFtZV0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZXh0cmFKb2luZWRQcm9wZXJ0aWVzID0gW107XG4gICAgICAgIHRoaXMuc2hvdWxkVW5mbGF0dGVuID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0TmV4dFN1YlF1ZXJ5UHJlZml4KCkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBgJHt0aGlzLnN1YlF1ZXJ5UHJlZml4ID8/IFwiXCJ9c3VicXVlcnkke3RoaXMuc3ViUXVlcnlDb3VudGVyfSRgO1xuICAgICAgICB0aGlzLnN1YlF1ZXJ5Q291bnRlcisrO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBrZWVwRmxhdCgpIHtcbiAgICAgICAgdGhpcy5zaG91bGRVbmZsYXR0ZW4gPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGdldENvbHVtbkFsaWFzKG5hbWU6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5rbmV4LnJhdyhcIj8/XCIsIHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5uYW1lLnNwbGl0KFwiLlwiKSkpLnRvUXVlcnkoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q29sdW1uKG5hbWU6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gbmV3IENvbHVtbkZyb21RdWVyeSh0aGlzLmdldENvbHVtbkFsaWFzKG5hbWUpKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZGlzdGluY3RPbihjb2x1bW5OYW1lczogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsVHlwZT4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsVHlwZT4sIFwiXCI+W10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgICAgICBjb25zdCBtYXBwZWRDb2x1bW5OYW1lcyA9IGNvbHVtbk5hbWVzLm1hcCgoY29sdW1uTmFtZSkgPT4gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbk5hbWUuc3BsaXQoXCIuXCIpKSk7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmRpc3RpbmN0T24obWFwcGVkQ29sdW1uTmFtZXMpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZGVsKCkge1xuICAgICAgICBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlci5kZWwoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZGVsQnlQcmltYXJ5S2V5KHZhbHVlOiBhbnkpIHtcbiAgICAgICAgY29uc3QgcHJpbWFyeUtleUNvbHVtbkluZm8gPSBnZXRQcmltYXJ5S2V5Q29sdW1uKHRoaXMudGFibGVDbGFzcyk7XG5cbiAgICAgICAgYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXIuZGVsKCkud2hlcmUocHJpbWFyeUtleUNvbHVtbkluZm8ubmFtZSwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbSh2YWx1ZSkpO1xuICAgIH1cblxuICAgIHB1YmxpYyB1cGRhdGVJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pOiBQcm9taXNlPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+O1xuICAgIHB1YmxpYyB1cGRhdGVJdGVtV2l0aFJldHVybmluZzxLZXlzIGV4dGVuZHMga2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4obmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+LCBrZXlzOiBLZXlzW10pOiBQcm9taXNlPFBpY2s8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPiwgS2V5cz4+O1xuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4sIHJldHVyblByb3BlcnRpZXM/OiAoa2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPilbXSkge1xuICAgICAgICBsZXQgaXRlbSA9IG5ld09iamVjdDtcbiAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShuZXdPYmplY3QsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKTtcbiAgICAgICAgaWYgKHJldHVyblByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hcHBlZE5hbWVzID0gcmV0dXJuUHJvcGVydGllcy5tYXAoKGNvbHVtbk5hbWUpID0+IHRoaXMuZ2V0Q29sdW1uTmFtZShjb2x1bW5OYW1lIGFzIHN0cmluZykpO1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKG1hcHBlZE5hbWVzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHF1ZXJ5LnJldHVybmluZyhcIipcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gcXVlcnkudG9RdWVyeSgpICsgXCJcXG5cIjtcblxuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IChhd2FpdCBxdWVyeSkgYXMgYW55O1xuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHJvd3NbMF07XG5cbiAgICAgICAgICAgIHRoaXMubWFwQ29sdW1uc1RvUHJvcGVydGllcyhpdGVtKTtcbiAgICAgICAgICAgIHRoaXMuYXBwbHlUZW1wb3JhbENvbnZlcnNpb25zRm9yUmVhZChpdGVtKTtcblxuICAgICAgICAgICAgcmV0dXJuIGl0ZW07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgaW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmcobmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+KTogUHJvbWlzZTxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+PjtcbiAgICBwdWJsaWMgaW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmc8S2V5cyBleHRlbmRzIGtleW9mIFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+KG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+Piwga2V5czogS2V5c1tdKTogUHJvbWlzZTxQaWNrPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4sIEtleXM+PjtcbiAgICBwdWJsaWMgYXN5bmMgaW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmcobmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+LCByZXR1cm5Qcm9wZXJ0aWVzPzogKGtleW9mIFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4pW10pIHtcbiAgICAgICAgbGV0IGl0ZW0gPSBuZXdPYmplY3Q7XG4gICAgICAgIGlmIChiZWZvcmVJbnNlcnRUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGl0ZW0gPSBiZWZvcmVJbnNlcnRUcmFuc2Zvcm0obmV3T2JqZWN0LCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm1hcFByb3BlcnRpZXNUb0NvbHVtbnModGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLmluc2VydChpdGVtKTtcbiAgICAgICAgaWYgKHJldHVyblByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hcHBlZE5hbWVzID0gcmV0dXJuUHJvcGVydGllcy5tYXAoKGNvbHVtbk5hbWUpID0+IHRoaXMuZ2V0Q29sdW1uTmFtZShjb2x1bW5OYW1lIGFzIHN0cmluZykpO1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKG1hcHBlZE5hbWVzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHF1ZXJ5LnJldHVybmluZyhcIipcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gcXVlcnkudG9RdWVyeSgpICsgXCJcXG5cIjtcblxuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHF1ZXJ5O1xuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHJvd3NbMF07XG5cbiAgICAgICAgICAgIHRoaXMubWFwQ29sdW1uc1RvUHJvcGVydGllcyhpdGVtKTtcbiAgICAgICAgICAgIHRoaXMuYXBwbHlUZW1wb3JhbENvbnZlcnNpb25zRm9yUmVhZChpdGVtKTtcblxuICAgICAgICAgICAgcmV0dXJuIGl0ZW07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgaW5zZXJ0SXRlbShuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pIHtcbiAgICAgICAgYXdhaXQgdGhpcy5pbnNlcnRJdGVtcyhbbmV3T2JqZWN0XSk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGluc2VydEl0ZW1zKGl0ZW1zOiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+W10pIHtcbiAgICAgICAgaXRlbXMgPSBbLi4uaXRlbXNdO1xuXG4gICAgICAgIGlmIChiZWZvcmVJbnNlcnRUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGl0ZW1zID0gaXRlbXMubWFwKChpdGVtKSA9PiBiZWZvcmVJbnNlcnRUcmFuc2Zvcm0hKGl0ZW0sIHRoaXMpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKSk7XG5cbiAgICAgICAgd2hpbGUgKGl0ZW1zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IGNodW5rID0gaXRlbXMuc3BsaWNlKDAsIDUwMCk7XG4gICAgICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLmNsb25lKCkuaW5zZXJ0KGNodW5rKTtcbiAgICAgICAgICAgIGlmICh0aGlzLnRyYW5zYWN0aW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBxdWVyeS50cmFuc2FjdGluZyh0aGlzLnRyYW5zYWN0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gcXVlcnkudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgcXVlcnk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdXBkYXRlSXRlbShpdGVtOiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+KSB7XG4gICAgICAgIGlmIChiZWZvcmVVcGRhdGVUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGl0ZW0gPSBiZWZvcmVVcGRhdGVUcmFuc2Zvcm0oaXRlbSwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1hcFByb3BlcnRpZXNUb0NvbHVtbnMoaXRlbSk7XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci51cGRhdGUoaXRlbSkudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVJdGVtQnlQcmltYXJ5S2V5KHByaW1hcnlLZXlWYWx1ZTogYW55LCBpdGVtOiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+KSB7XG4gICAgICAgIGlmIChiZWZvcmVVcGRhdGVUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGl0ZW0gPSBiZWZvcmVVcGRhdGVUcmFuc2Zvcm0oaXRlbSwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1hcFByb3BlcnRpZXNUb0NvbHVtbnMoaXRlbSk7XG5cbiAgICAgICAgY29uc3QgcHJpbWFyeUtleUNvbHVtbkluZm8gPSBnZXRQcmltYXJ5S2V5Q29sdW1uKHRoaXMudGFibGVDbGFzcyk7XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJ5QnVpbGRlci51cGRhdGUoaXRlbSkud2hlcmUocHJpbWFyeUtleUNvbHVtbkluZm8ubmFtZSwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShwcmltYXJ5S2V5VmFsdWUpKTtcblxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gcXVlcnkudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGF3YWl0IHF1ZXJ5O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZUl0ZW1zQnlQcmltYXJ5S2V5KFxuICAgICAgICBpdGVtczoge1xuICAgICAgICAgICAgcHJpbWFyeUtleVZhbHVlOiBhbnk7XG4gICAgICAgICAgICBkYXRhOiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+O1xuICAgICAgICB9W11cbiAgICApIHtcbiAgICAgICAgY29uc3QgcHJpbWFyeUtleUNvbHVtbkluZm8gPSBnZXRQcmltYXJ5S2V5Q29sdW1uKHRoaXMudGFibGVDbGFzcyk7XG5cbiAgICAgICAgaXRlbXMgPSBbLi4uaXRlbXNdO1xuICAgICAgICB3aGlsZSAoaXRlbXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgY2h1bmsgPSBpdGVtcy5zcGxpY2UoMCwgNTAwKTtcblxuICAgICAgICAgICAgbGV0IHNxbCA9IFwiXCI7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgY2h1bmspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLmNsb25lKCk7XG4gICAgICAgICAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgICAgICBpdGVtLmRhdGEgPSBiZWZvcmVVcGRhdGVUcmFuc2Zvcm0oaXRlbS5kYXRhLCB0aGlzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5tYXBQcm9wZXJ0aWVzVG9Db2x1bW5zKGl0ZW0uZGF0YSk7XG5cbiAgICAgICAgICAgICAgICBxdWVyeS51cGRhdGUoaXRlbS5kYXRhKTtcbiAgICAgICAgICAgICAgICBzcWwgKz0gcXVlcnkud2hlcmUocHJpbWFyeUtleUNvbHVtbkluZm8ubmFtZSwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShpdGVtLnByaW1hcnlLZXlWYWx1ZSkpLnRvU3RyaW5nKCkucmVwbGFjZShcIj9cIiwgXCJcXFxcP1wiKSArIFwiO1xcblwiO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBmaW5hbFF1ZXJ5ID0gdGhpcy5rbmV4LnJhdyhzcWwpO1xuICAgICAgICAgICAgaWYgKHRoaXMudHJhbnNhY3Rpb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGZpbmFsUXVlcnkudHJhbnNhY3RpbmcodGhpcy50cmFuc2FjdGlvbik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gZmluYWxRdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBmaW5hbFF1ZXJ5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGUoKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyO1xuICAgIH1cblxuICAgIHB1YmxpYyBsaW1pdCh2YWx1ZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmxpbWl0KHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBvZmZzZXQodmFsdWU6IG51bWJlcikge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5vZmZzZXQodmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGZpbmRCeUlkKGlkOiBzdHJpbmcsIGNvbHVtbnM6IChrZXlvZiBNb2RlbFR5cGUpW10pIHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyXG4gICAgICAgICAgICAuc2VsZWN0KGNvbHVtbnMgYXMgYW55KVxuICAgICAgICAgICAgLndoZXJlKHRoaXMudGFibGVOYW1lICsgXCIuaWRcIiwgaWQpXG4gICAgICAgICAgICAuZmlyc3QoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0Q291bnQoKSB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuY291bnQoeyBjb3VudDogXCIqXCIgfSk7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1ZXJ5O1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFswXS5jb3VudDtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0Rmlyc3RPck51bGwoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAoIWl0ZW1zIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXNbMF0sIGZsYXR0ZW5PcHRpb24pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHB1YmxpYyBhc3luYyBnZXRGaXJzdE9yVW5kZWZpbmVkKCkge1xuICAgICAgICBjb25zdCBmaXJzdE9yTnVsbFJlc3VsdCA9IGF3YWl0IHRoaXMuZ2V0Rmlyc3RPck51bGwoKTtcbiAgICAgICAgaWYgKGZpcnN0T3JOdWxsUmVzdWx0ID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmaXJzdE9yTnVsbFJlc3VsdDtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0Rmlyc3QoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAoIWl0ZW1zIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkl0ZW0gbm90IGZvdW5kLlwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmxhdHRlbkJ5T3B0aW9uKGl0ZW1zWzBdLCBmbGF0dGVuT3B0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRTaW5nbGVPck51bGwoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAoIWl0ZW1zIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpdGVtcy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNb3JlIHRoYW4gb25lIGl0ZW0gZm91bmQ6ICR7aXRlbXMubGVuZ3RofS5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZsYXR0ZW5CeU9wdGlvbihpdGVtc1swXSwgZmxhdHRlbk9wdGlvbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0U2luZ2xlT3JVbmRlZmluZWQoKSB7XG4gICAgICAgIGNvbnN0IHNpbmdsZU9yTnVsbFJlc3VsdCA9IGF3YWl0IHRoaXMuZ2V0U2luZ2xlT3JOdWxsKCk7XG4gICAgICAgIGlmIChzaW5nbGVPck51bGxSZXN1bHQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNpbmdsZU9yTnVsbFJlc3VsdDtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0U2luZ2xlKGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKSB7XG4gICAgICAgIGlmICh0aGlzLmhhc1NlbGVjdENsYXVzZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0QWxsTW9kZWxQcm9wZXJ0aWVzKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5TG9nICs9IHRoaXMucXVlcnlCdWlsZGVyLnRvUXVlcnkoKSArIFwiXFxuXCI7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBpdGVtcyA9IGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyO1xuICAgICAgICAgICAgaWYgKCFpdGVtcyB8fCBpdGVtcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJdGVtIG5vdCBmb3VuZC5cIik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGl0ZW1zLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1vcmUgdGhhbiBvbmUgaXRlbSBmb3VuZDogJHtpdGVtcy5sZW5ndGh9LmApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmxhdHRlbkJ5T3B0aW9uKGl0ZW1zWzBdLCBmbGF0dGVuT3B0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3RDb2x1bW4oKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgbGV0IGNhbGxlZEFyZ3VtZW50cyA9IFtdIGFzIHN0cmluZ1tdO1xuXG4gICAgICAgIGZ1bmN0aW9uIHNhdmVBcmd1bWVudHMoLi4uYXJnczogc3RyaW5nW10pIHtcbiAgICAgICAgICAgIGNhbGxlZEFyZ3VtZW50cyA9IGFyZ3M7XG4gICAgICAgIH1cblxuICAgICAgICBhcmd1bWVudHNbMF0oc2F2ZUFyZ3VtZW50cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jYWxsZWRBcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNhbGxlZEFyZ3VtZW50cykpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uMyhmOiBhbnkpIHtcbiAgICAgICAgY29uc3QgeyByb290LCByZXN1bHQgfSA9IGdldFByb3h5QW5kTWVtb3JpZXNGb3JBcnJheSgpO1xuXG4gICAgICAgIGYocm9vdCk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2VsZWN0MigpIHtcbiAgICAgICAgdGhpcy5oYXNTZWxlY3RDbGF1c2UgPSB0cnVlO1xuICAgICAgICBjb25zdCBmID0gYXJndW1lbnRzWzBdO1xuXG4gICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50c0xpc3QgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbjMoZik7XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5Bcmd1bWVudHMgb2YgY29sdW1uQXJndW1lbnRzTGlzdCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2VsZWN0KCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGxldCBjb2x1bW5Bcmd1bWVudHNMaXN0OiBzdHJpbmdbXVtdO1xuXG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzBdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gWy4uLmFyZ3VtZW50c10ubWFwKChjb25jYXRLZXk6IHN0cmluZykgPT4gY29uY2F0S2V5LnNwbGl0KFwiLlwiKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBmID0gYXJndW1lbnRzWzBdO1xuICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzTGlzdCA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uMyhmKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgY29sdW1uQXJndW1lbnRzIG9mIGNvbHVtbkFyZ3VtZW50c0xpc3QpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnNlbGVjdCh0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSArIFwiIGFzIFwiICsgdGhpcy5nZXRDb2x1bW5TZWxlY3RBbGlhcyguLi5jb2x1bW5Bcmd1bWVudHMpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yZGVyQnkoKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLm9yZGVyQnkodGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgYXJndW1lbnRzWzFdKTtcblxuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGdldE1hbnkoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbFR5cGUgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+IDogUm93KVtdPiB7XG4gICAgICAgIC8vIGF0dGFjaCBhbnkgZGVmYXVsdCBsb2NrcyB0byB0aGUgcXVlcnkgaWYgdGhleSBhcmUgbm90IHNwZWNpZmllZFxuXG4gICAgICAgIGlmICh0aGlzLmhhc1NlbGVjdENsYXVzZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0QWxsTW9kZWxQcm9wZXJ0aWVzKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5TG9nICs9IHRoaXMucXVlcnlCdWlsZGVyLnRvUXVlcnkoKSArIFwiXFxuXCI7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBpdGVtcyA9IGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmxhdHRlbkJ5T3B0aW9uKGl0ZW1zLCBmbGF0dGVuT3B0aW9uKSBhcyAoUm93IGV4dGVuZHMgTW9kZWxUeXBlID8gUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPiA6IFJvdylbXTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3RBbGlhcygpIHtcbiAgICAgICAgdGhpcy5oYXNTZWxlY3RDbGF1c2UgPSB0cnVlO1xuICAgICAgICBjb25zdCBjb2x1bW5Bcmd1bWVudHMgPSBhcmd1bWVudHNbMV0uc3BsaXQoXCIuXCIpO1xuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnNlbGVjdChgJHt0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKX0gYXMgJHthcmd1bWVudHNbMF19YCk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2VsZWN0UmF3KCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IFtuYW1lLCBfLCBxdWVyeSwgLi4uYmluZGluZ3NdID0gQXJyYXkuZnJvbShhcmd1bWVudHMpO1xuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnNlbGVjdCh0aGlzLmtuZXgucmF3KGAoJHtxdWVyeX0pIGFzIFwiJHtuYW1lfVwiYCwgYmluZGluZ3MpKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBpbm5lckpvaW5Db2x1bW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmpvaW5Db2x1bW4oXCJpbm5lckpvaW5cIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pbkNvbHVtbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbkNvbHVtbihcImxlZnRPdXRlckpvaW5cIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBpbm5lckpvaW5UYWJsZSgpIHtcbiAgICAgICAgY29uc3QgbmV3UHJvcGVydHlLZXkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IG5ld1Byb3BlcnR5VHlwZSA9IGFyZ3VtZW50c1sxXTtcbiAgICAgICAgY29uc3QgY29sdW1uMVBhcnRzID0gYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGFyZ3VtZW50c1szXTtcbiAgICAgICAgY29uc3QgY29sdW1uMlBhcnRzID0gYXJndW1lbnRzWzRdO1xuXG4gICAgICAgIHRoaXMuZXh0cmFKb2luZWRQcm9wZXJ0aWVzLnB1c2goe1xuICAgICAgICAgICAgbmFtZTogbmV3UHJvcGVydHlLZXksXG4gICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IG5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5DbGFzcyA9IG5ld1Byb3BlcnR5VHlwZTtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5OYW1lID0gZ2V0VGFibGVOYW1lKHRhYmxlVG9Kb2luQ2xhc3MpO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkFsaWFzID0gbmV3UHJvcGVydHlLZXk7XG5cbiAgICAgICAgY29uc3QgdGFibGUxQ29sdW1uID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbjFQYXJ0cyk7XG4gICAgICAgIGNvbnN0IHRhYmxlMkNvbHVtbiA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW4yUGFydHMpO1xuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmlubmVySm9pbihgJHt0YWJsZVRvSm9pbk5hbWV9IGFzICR7dGFibGVUb0pvaW5BbGlhc31gLCB0YWJsZTFDb2x1bW4sIG9wZXJhdG9yLCB0YWJsZTJDb2x1bW4pO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBpbm5lckpvaW4oKSB7XG4gICAgICAgIGNvbnN0IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID0gdGhpcy5ncmFudWxhcml0eVNldC5oYXMoYXJndW1lbnRzWzJdKTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSBjYWxsSW5jbHVkZXNHcmFudWxhcml0eSA/IChhcmd1bWVudHNbMl0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMV0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBqb2luVGFibGVDb2x1bW5TdHJpbmcgPSBjYWxsSW5jbHVkZXNHcmFudWxhcml0eSA/IGFyZ3VtZW50c1szXSA6IGFyZ3VtZW50c1syXTtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBjYWxsSW5jbHVkZXNHcmFudWxhcml0eSA/IGFyZ3VtZW50c1s0XSA6IGFyZ3VtZW50c1szXTtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdUYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzVdIDogYXJndW1lbnRzWzRdO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmpvaW4oXCJpbm5lckpvaW5cIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0sIGdyYW51bGFyaXR5LCBqb2luVGFibGVDb2x1bW5TdHJpbmcsIG9wZXJhdG9yLCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nKTtcbiAgICB9XG4gICAgcHVibGljIGxlZnRPdXRlckpvaW4oKSB7XG4gICAgICAgIGNvbnN0IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID0gdGhpcy5ncmFudWxhcml0eVNldC5oYXMoYXJndW1lbnRzWzJdKTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSBjYWxsSW5jbHVkZXNHcmFudWxhcml0eSA/IChhcmd1bWVudHNbMl0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMV0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBqb2luVGFibGVDb2x1bW5TdHJpbmcgPSBjYWxsSW5jbHVkZXNHcmFudWxhcml0eSA/IGFyZ3VtZW50c1szXSA6IGFyZ3VtZW50c1syXTtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBjYWxsSW5jbHVkZXNHcmFudWxhcml0eSA/IGFyZ3VtZW50c1s0XSA6IGFyZ3VtZW50c1szXTtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdUYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzVdIDogYXJndW1lbnRzWzRdO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmpvaW4oXCJsZWZ0T3V0ZXJKb2luXCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdLCBncmFudWxhcml0eSwgam9pblRhYmxlQ29sdW1uU3RyaW5nLCBvcGVyYXRvciwgZXhpc3RpbmdUYWJsZUNvbHVtblN0cmluZyk7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pblRhYmxlT25GdW5jdGlvbigpIHtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1sxXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IG9uID0gdHlwZW9mIGFyZ3VtZW50c1syXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1szXSA6IGFyZ3VtZW50c1syXTtcblxuICAgICAgICByZXR1cm4gdGhpcy5qb2luVGFibGVPbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLmlubmVySm9pbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0sIGdyYW51bGFyaXR5LCBvbik7XG4gICAgfVxuXG4gICAgcHVibGljIGxlZnRPdXRlckpvaW5UYWJsZU9uRnVuY3Rpb24oKSB7XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1syXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMl0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMV0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBvbiA9IHR5cGVvZiBhcmd1bWVudHNbMl0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbM10gOiBhcmd1bWVudHNbMl07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuam9pblRhYmxlT25GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci5sZWZ0T3V0ZXJKb2luLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgZ3JhbnVsYXJpdHksIG9uKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pblRhYmxlKCkge1xuICAgICAgICBjb25zdCBuZXdQcm9wZXJ0eUtleSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgbmV3UHJvcGVydHlUeXBlID0gYXJndW1lbnRzWzFdO1xuICAgICAgICBjb25zdCBjb2x1bW4xUGFydHMgPSBhcmd1bWVudHNbMl07XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBjb2x1bW4yUGFydHMgPSBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMucHVzaCh7XG4gICAgICAgICAgICBuYW1lOiBuZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgICAgIHByb3BlcnR5VHlwZTogbmV3UHJvcGVydHlUeXBlLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkNsYXNzID0gbmV3UHJvcGVydHlUeXBlO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXMgPSBuZXdQcm9wZXJ0eUtleTtcblxuICAgICAgICBjb25zdCB0YWJsZTFDb2x1bW4gPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMVBhcnRzKTtcbiAgICAgICAgY29uc3QgdGFibGUyQ29sdW1uID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbjJQYXJ0cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIubGVmdE91dGVySm9pbihgJHt0YWJsZVRvSm9pbk5hbWV9IGFzICR7dGFibGVUb0pvaW5BbGlhc31gLCB0YWJsZTFDb2x1bW4sIG9wZXJhdG9yLCB0YWJsZTJDb2x1bW4pO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZUNvbHVtbigpIHtcbiAgICAgICAgLy8gVGhpcyBpcyBjYWxsZWQgZnJvbSB0aGUgc3ViLXF1ZXJ5XG4gICAgICAgIC8vIFRoZSBmaXJzdCBjb2x1bW4gaXMgZnJvbSB0aGUgc3ViLXF1ZXJ5XG4gICAgICAgIC8vIFRoZSBzZWNvbmQgY29sdW1uIGlzIGZyb20gdGhlIHBhcmVudCBxdWVyeVxuICAgICAgICBsZXQgY29sdW1uMU5hbWU7XG4gICAgICAgIGxldCBjb2x1bW4yTmFtZTtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgaWYgKGFyZ3VtZW50c1swXSBpbnN0YW5jZW9mIENvbHVtbkZyb21RdWVyeSkge1xuICAgICAgICAgICAgY29sdW1uMU5hbWUgPSAoYXJndW1lbnRzWzBdIGFzIENvbHVtbkZyb21RdWVyeSkudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIGNvbHVtbjJOYW1lID0gKGFyZ3VtZW50c1syXSBhcyBDb2x1bW5Gcm9tUXVlcnkpLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZVJhdyhgJHtjb2x1bW4xTmFtZX0gJHtvcGVyYXRvcn0gJHtjb2x1bW4yTmFtZX1gKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhcmd1bWVudHNbMF0gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtbjFOYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmFyZ3VtZW50c1swXS5zcGxpdChcIi5cIikpO1xuICAgICAgICAgICAgaWYgKCF0aGlzLnBhcmVudFR5cGVkUXVlcnlCdWlsZGVyKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQYXJlbnQgcXVlcnkgYnVpbGRlciBpcyBtaXNzaW5nLCBcIndoZXJlQ29sdW1uXCIgY2FuIG9ubHkgYmUgdXNlZCBpbiBzdWItcXVlcnkuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb2x1bW4yTmFtZSA9IHRoaXMucGFyZW50VHlwZWRRdWVyeUJ1aWxkZXIuZ2V0Q29sdW1uTmFtZSguLi5hcmd1bWVudHNbMl0uc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbHVtbjFOYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLnRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGFyZ3VtZW50c1swXSkpO1xuXG4gICAgICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1syXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGNvbHVtbjJOYW1lID0gYXJndW1lbnRzWzJdO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChhcmd1bWVudHNbMl0ubWVtb3JpZXMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNvbHVtbjJOYW1lID0gYXJndW1lbnRzWzJdLmdldENvbHVtbk5hbWU7IC8vIHBhcmVudCB0aGlzIG5lZWRlZCAuLi5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMk5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4udGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oYXJndW1lbnRzWzJdKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZVJhdyhgPz8gJHtvcGVyYXRvcn0gPz9gLCBbY29sdW1uMU5hbWUsIGNvbHVtbjJOYW1lXSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHRvUXVlcnkoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCk7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlTnVsbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU51bGwuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlTm90TnVsbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdE51bGwuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmVOdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVOdWxsLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBvcldoZXJlTm90TnVsbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci5vcldoZXJlTm90TnVsbC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGY6IGFueSkge1xuICAgICAgICBpZiAodHlwZW9mIGYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBmLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHsgcm9vdCwgbWVtb3JpZXMgfSA9IGdldFByb3h5QW5kTWVtb3JpZXMoKTtcblxuICAgICAgICBmKHJvb3QpO1xuXG4gICAgICAgIHJldHVybiBtZW1vcmllcztcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZmluZEJ5UHJpbWFyeUtleSgpIHtcbiAgICAgICAgY29uc3QgcHJpbWFyeUtleUNvbHVtbkluZm8gPSBnZXRQcmltYXJ5S2V5Q29sdW1uKHRoaXMudGFibGVDbGFzcyk7XG5cbiAgICAgICAgY29uc3QgcHJpbWFyeUtleVZhbHVlID0gYXJndW1lbnRzWzBdO1xuXG4gICAgICAgIGxldCBjb2x1bW5Bcmd1bWVudHNMaXN0O1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29uc3QgWywgLi4uY29sdW1uQXJndW1lbnRzXSA9IGFyZ3VtZW50cztcbiAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50c0xpc3QgPSBjb2x1bW5Bcmd1bWVudHMubWFwKChjb25jYXRLZXk6IHN0cmluZykgPT4gY29uY2F0S2V5LnNwbGl0KFwiLlwiKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBmID0gYXJndW1lbnRzWzFdO1xuICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzTGlzdCA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uMyhmKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgY29sdW1uQXJndW1lbnRzIG9mIGNvbHVtbkFyZ3VtZW50c0xpc3QpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnNlbGVjdCh0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSArIFwiIGFzIFwiICsgdGhpcy5nZXRDb2x1bW5TZWxlY3RBbGlhcyguLi5jb2x1bW5Bcmd1bWVudHMpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlKHByaW1hcnlLZXlDb2x1bW5JbmZvLm5hbWUsIHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0ocHJpbWFyeUtleVZhbHVlKSk7XG5cbiAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5TG9nICs9IHRoaXMucXVlcnlCdWlsZGVyLnRvUXVlcnkoKSArIFwiXFxuXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5xdWVyeUJ1aWxkZXIuZmlyc3QoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZSgpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmd1bWVudHNbMF0gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29uY2F0S2V5Q29sdW1uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmUuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlTm90KCkge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb25jYXRLZXlDb2x1bW4odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmVOb3QuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29sdW1uQXJndW1lbnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oYXJndW1lbnRzWzBdKTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIud2hlcmVOb3QodGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cyksIHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0oYXJndW1lbnRzWzFdKSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBhbmRXaGVyZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci5hbmRXaGVyZS5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JXaGVyZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci5vcldoZXJlLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZUluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlSW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlTm90SW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmVOb3RJbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVJbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci5vcldoZXJlSW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuICAgIHB1YmxpYyBvcldoZXJlTm90SW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZU5vdEluLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZUJldHdlZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmVCZXR3ZWVuLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cbiAgICBwdWJsaWMgd2hlcmVOb3RCZXR3ZWVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90QmV0d2Vlbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JXaGVyZUJldHdlZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZUJldHdlZW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuICAgIHB1YmxpYyBvcldoZXJlTm90QmV0d2VlbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci5vcldoZXJlTm90QmV0d2Vlbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihmdW5jdGlvbk5hbWU6IHN0cmluZywgdHlwZU9mU3ViUXVlcnk6IGFueSwgZnVuY3Rpb25Ub0NhbGw6IGFueSwgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5IHwgdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IHRoYXQgPSB0aGlzIGFzIGFueTtcbiAgICAgICAgbGV0IHN1YlF1ZXJ5UHJlZml4OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgIGlmIChbXCJ3aGVyZUV4aXN0c1wiLCBcIm9yV2hlcmVFeGlzdHNcIiwgXCJ3aGVyZU5vdEV4aXN0c1wiLCBcIm9yV2hlcmVOb3RFeGlzdHNcIiwgXCJoYXZpbmdFeGlzdHNcIiwgXCJoYXZpbmdOb3RFeGlzdHNcIl0uaW5jbHVkZXMoZnVuY3Rpb25OYW1lKSkge1xuICAgICAgICAgICAgc3ViUXVlcnlQcmVmaXggPSB0aGlzLmdldE5leHRTdWJRdWVyeVByZWZpeCgpO1xuICAgICAgICB9XG4gICAgICAgICgodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KVtmdW5jdGlvbk5hbWVdIGFzIChjYWxsYmFjazogS25leC5RdWVyeUNhbGxiYWNrKSA9PiBLbmV4LlF1ZXJ5QnVpbGRlcikoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgY29uc3Qgc3ViUXVlcnkgPSB0aGlzO1xuICAgICAgICAgICAgY29uc3QgeyByb290LCBtZW1vcmllcyB9ID0gZ2V0UHJveHlBbmRNZW1vcmllcyh0aGF0KTtcblxuICAgICAgICAgICAgY29uc3Qgc3ViUUIgPSBuZXcgVHlwZWRRdWVyeUJ1aWxkZXIodHlwZU9mU3ViUXVlcnksIGdyYW51bGFyaXR5LCB0aGF0LmtuZXgsIHN1YlF1ZXJ5LCB0aGF0LCBzdWJRdWVyeVByZWZpeCk7XG4gICAgICAgICAgICBzdWJRQi5leHRyYUpvaW5lZFByb3BlcnRpZXMgPSB0aGF0LmV4dHJhSm9pbmVkUHJvcGVydGllcztcbiAgICAgICAgICAgIGZ1bmN0aW9uVG9DYWxsKHN1YlFCLCByb290LCBtZW1vcmllcyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3RRdWVyeSgpIHtcbiAgICAgICAgdGhpcy5oYXNTZWxlY3RDbGF1c2UgPSB0cnVlO1xuICAgICAgICBjb25zdCBuYW1lID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1syXTtcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSBhcmd1bWVudHNbM107XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gYXJndW1lbnRzWzRdID8/IGdldFRhYmxlTWV0YWRhdGEodHlwZU9mU3ViUXVlcnkpLmRlZmF1bHRMb2NrO1xuXG4gICAgICAgIGNvbnN0IHsgcm9vdCwgbWVtb3JpZXMgfSA9IGdldFByb3h5QW5kTWVtb3JpZXModGhpcyBhcyBhbnkpO1xuXG4gICAgICAgIGNvbnN0IHN1YlF1ZXJ5QnVpbGRlciA9IG5ldyBUeXBlZFF1ZXJ5QnVpbGRlcih0eXBlT2ZTdWJRdWVyeSwgZ3JhbnVsYXJpdHksIHRoaXMua25leCwgdW5kZWZpbmVkLCB0aGlzKTtcbiAgICAgICAgZnVuY3Rpb25Ub0NhbGwoc3ViUXVlcnlCdWlsZGVyLCByb290LCBtZW1vcmllcyk7XG5cbiAgICAgICAgKHRoaXMuc2VsZWN0UmF3IGFzIGFueSkobmFtZSwgdW5kZWZpbmVkLCBzdWJRdWVyeUJ1aWxkZXIudG9RdWVyeSgpKTtcblxuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlUGFyZW50aGVzZXMoKSB7XG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIndoZXJlXCIsIHRoaXMudGFibGVDbGFzcywgYXJndW1lbnRzWzBdLCB1bmRlZmluZWQpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZVBhcmVudGhlc2VzKCkge1xuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJvcldoZXJlXCIsIHRoaXMudGFibGVDbGFzcywgYXJndW1lbnRzWzBdLCB1bmRlZmluZWQpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZUV4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMF0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwid2hlcmVFeGlzdHNcIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIHB1YmxpYyBvcldoZXJlRXhpc3RzKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1swXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJvcldoZXJlRXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZU5vdEV4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMF0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwid2hlcmVOb3RFeGlzdHNcIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIHB1YmxpYyBvcldoZXJlTm90RXhpc3RzKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1swXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJvcldoZXJlTm90RXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlUmF3KHNxbCwgYmluZGluZ3MpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nKCkge1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGFyZ3VtZW50c1sxXTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKGFyZ3VtZW50c1syXSk7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmhhdmluZyh0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pLCBvcGVyYXRvciwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nSW4oKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShhcmd1bWVudHNbMV0pO1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5oYXZpbmdJbih0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdOb3RJbigpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKGFyZ3VtZW50c1sxXSk7XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmhhdmluZ05vdEluKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ051bGwoKSB7XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmhhdmluZ051bGwodGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdOb3ROdWxsKCkge1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5oYXZpbmdOb3ROdWxsKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nRXhpc3RzKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1swXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJoYXZpbmdFeGlzdHNcIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ05vdEV4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMF0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwiaGF2aW5nTm90RXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5oYXZpbmdSYXcoc3FsLCBiaW5kaW5ncyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdCZXR3ZWVuKCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0oYXJndW1lbnRzWzFdKTtcbiAgICAgICAgKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSkuaGF2aW5nQmV0d2Vlbih0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdOb3RCZXR3ZWVuKCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0oYXJndW1lbnRzWzFdKTtcbiAgICAgICAgKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSkuaGF2aW5nTm90QmV0d2Vlbih0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBvcmRlckJ5UmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIub3JkZXJCeVJhdyhzcWwsIGJpbmRpbmdzKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHVuaW9uKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1swXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJ1bmlvblwiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgdW5pb25BbGwoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcInVuaW9uQWxsXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyByZXR1cm5pbmdDb2x1bW4oKSB7XG4gICAgICAgIHRocm93IG5ldyBOb3RJbXBsZW1lbnRlZEVycm9yKCk7XG4gICAgfVxuXG4gICAgcHVibGljIHJldHVybmluZ0NvbHVtbnMoKSB7XG4gICAgICAgIHRocm93IG5ldyBOb3RJbXBsZW1lbnRlZEVycm9yKCk7XG4gICAgfVxuXG4gICAgcHVibGljIHRyYW5zYWN0aW5nKHRyeDogS25leC5UcmFuc2FjdGlvbikge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci50cmFuc2FjdGluZyh0cngpO1xuXG4gICAgICAgIHRoaXMudHJhbnNhY3Rpb24gPSB0cng7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIG1pbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJtaW5cIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBjb3VudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJjb3VudFwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGNvdW50RGlzdGluY3QoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwiY291bnREaXN0aW5jdFwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIG1heCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJtYXhcIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBzdW0oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwic3VtXCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3VtRGlzdGluY3QoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwic3VtRGlzdGluY3RcIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBhdmcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwiYXZnXCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXZnRGlzdGluY3QoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwiYXZnRGlzdGluY3RcIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBpbmNyZW1lbnQoKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gYXJndW1lbnRzW2FyZ3VtZW50cy5sZW5ndGggLSAxXTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaW5jcmVtZW50KHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21Bcmd1bWVudHNJZ25vcmluZ0xhc3RQYXJhbWV0ZXIoLi4uYXJndW1lbnRzKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgcHVibGljIGRlY3JlbWVudCgpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5kZWNyZW1lbnQodGhpcy5nZXRDb2x1bW5OYW1lRnJvbUFyZ3VtZW50c0lnbm9yaW5nTGFzdFBhcmFtZXRlciguLi5hcmd1bWVudHMpLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyB0cnVuY2F0ZSgpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXIudHJ1bmNhdGUoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgaW5zZXJ0U2VsZWN0KCkge1xuICAgICAgICBjb25zdCB0YWJsZU5hbWUgPSBnZXRUYWJsZU5hbWUoYXJndW1lbnRzWzBdKTtcblxuICAgICAgICBjb25zdCB0eXBlZFF1ZXJ5QnVpbGRlckZvckluc2VydCA9IG5ldyBUeXBlZFF1ZXJ5QnVpbGRlcjxhbnksIGFueT4oYXJndW1lbnRzWzBdLCB1bmRlZmluZWQsIHRoaXMua25leCk7XG4gICAgICAgIGxldCBjb2x1bW5Bcmd1bWVudHNMaXN0O1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29uc3QgWywgLi4uY29sdW1uQXJndW1lbnRzXSA9IGFyZ3VtZW50cztcbiAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50c0xpc3QgPSBjb2x1bW5Bcmd1bWVudHMubWFwKChjb25jYXRLZXk6IHN0cmluZykgPT4gY29uY2F0S2V5LnNwbGl0KFwiLlwiKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBmID0gYXJndW1lbnRzWzFdO1xuICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzTGlzdCA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uMyhmKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGluc2VydENvbHVtbnMgPSBjb2x1bW5Bcmd1bWVudHNMaXN0Lm1hcCgoaSkgPT4gdHlwZWRRdWVyeUJ1aWxkZXJGb3JJbnNlcnQuZ2V0Q29sdW1uTmFtZSguLi5pKSk7XG5cbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2tuZXgva25leC9pc3N1ZXMvMTA1NlxuICAgICAgICBjb25zdCBxYiA9IHRoaXMua25leC5mcm9tKHRoaXMua25leC5yYXcoYD8/ICgke2luc2VydENvbHVtbnMubWFwKCgpID0+IFwiPz9cIikuam9pbihcIixcIil9KWAsIFt0YWJsZU5hbWUsIC4uLmluc2VydENvbHVtbnNdKSkuaW5zZXJ0KHRoaXMua25leC5yYXcodGhpcy50b1F1ZXJ5KCkpKTtcblxuICAgICAgICBjb25zdCBmaW5hbFF1ZXJ5ID0gcWIudG9TdHJpbmcoKTtcbiAgICAgICAgdGhpcy50b1F1ZXJ5ID0gKCkgPT4gZmluYWxRdWVyeTtcblxuICAgICAgICBhd2FpdCBxYjtcbiAgICB9XG5cbiAgICBwdWJsaWMgY2xlYXJTZWxlY3QoKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmNsZWFyU2VsZWN0KCk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG4gICAgcHVibGljIGNsZWFyV2hlcmUoKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmNsZWFyV2hlcmUoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cbiAgICBwdWJsaWMgY2xlYXJPcmRlcigpIHtcbiAgICAgICAgKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSkuY2xlYXJPcmRlcigpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGRpc3RpbmN0KCkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5kaXN0aW5jdCgpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGNsb25lKCkge1xuICAgICAgICBjb25zdCBxdWVyeUJ1aWxkZXJDbG9uZSA9IHRoaXMucXVlcnlCdWlsZGVyLmNsb25lKCk7XG5cbiAgICAgICAgY29uc3QgdHlwZWRRdWVyeUJ1aWxkZXJDbG9uZSA9IG5ldyBUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbFR5cGUsIFJvdz4odGhpcy50YWJsZUNsYXNzLCB0aGlzLmdyYW51bGFyaXR5LCB0aGlzLmtuZXgsIHF1ZXJ5QnVpbGRlckNsb25lKTtcblxuICAgICAgICByZXR1cm4gdHlwZWRRdWVyeUJ1aWxkZXJDbG9uZSBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGdyb3VwQnkoKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmdyb3VwQnkodGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBncm91cEJ5UmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZ3JvdXBCeVJhdyhzcWwsIGJpbmRpbmdzKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHVzZUtuZXhRdWVyeUJ1aWxkZXIoZjogKHF1ZXJ5OiBLbmV4LlF1ZXJ5QnVpbGRlcikgPT4gdm9pZCkge1xuICAgICAgICBmKHRoaXMucXVlcnlCdWlsZGVyKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGdldEtuZXhRdWVyeUJ1aWxkZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q29sdW1uTmFtZSguLi5rZXlzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGZpcnN0UGFydE5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXMoa2V5c1swXSk7XG5cbiAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gZmlyc3RQYXJ0TmFtZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBjb2x1bW5OYW1lID0gXCJcIjtcbiAgICAgICAgICAgIGxldCBjb2x1bW5BbGlhcztcbiAgICAgICAgICAgIGxldCBjdXJyZW50Q2xhc3M7XG4gICAgICAgICAgICBsZXQgY3VycmVudENvbHVtblBhcnQ7XG4gICAgICAgICAgICBjb25zdCBwcmVmaXggPSBrZXlzLnNsaWNlKDAsIC0xKS5qb2luKFwiLlwiKTtcbiAgICAgICAgICAgIGNvbnN0IGV4dHJhSm9pbmVkUHJvcGVydHkgPSB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5maW5kKChpKSA9PiBpLm5hbWUgPT09IHByZWZpeCk7XG4gICAgICAgICAgICBpZiAoZXh0cmFKb2luZWRQcm9wZXJ0eSkge1xuICAgICAgICAgICAgICAgIGNvbHVtbkFsaWFzID0gZXh0cmFKb2luZWRQcm9wZXJ0eS5uYW1lO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDbGFzcyA9IGV4dHJhSm9pbmVkUHJvcGVydHkucHJvcGVydHlUeXBlO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24oY3VycmVudENsYXNzLCBrZXlzW2tleXMubGVuZ3RoIC0gMV0pO1xuICAgICAgICAgICAgICAgIGNvbHVtbk5hbWUgPSBrZXlzLnNsaWNlKDAsIC0xKS5qb2luKFwiX1wiKSArIFwiLlwiICsgY3VycmVudENvbHVtblBhcnQubmFtZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIGtleXNbMF0pO1xuICAgICAgICAgICAgICAgIGNvbHVtbkFsaWFzID0gY3VycmVudENvbHVtblBhcnQucHJvcGVydHlLZXk7XG4gICAgICAgICAgICAgICAgY3VycmVudENsYXNzID0gY3VycmVudENvbHVtblBhcnQuY29sdW1uQ2xhc3M7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24oY3VycmVudENsYXNzLCBrZXlzW2ldKTtcblxuICAgICAgICAgICAgICAgICAgICBjb2x1bW5OYW1lID0gY29sdW1uQWxpYXMgKyBcIi5cIiArIChrZXlzLmxlbmd0aCAtIDEgPT09IGkgPyBjdXJyZW50Q29sdW1uUGFydC5uYW1lIDogY3VycmVudENvbHVtblBhcnQucHJvcGVydHlLZXkpO1xuICAgICAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyArPSBcIl9cIiArIChrZXlzLmxlbmd0aCAtIDEgPT09IGkgPyBjdXJyZW50Q29sdW1uUGFydC5uYW1lIDogY3VycmVudENvbHVtblBhcnQucHJvcGVydHlLZXkpO1xuICAgICAgICAgICAgICAgICAgICBjdXJyZW50Q2xhc3MgPSBjdXJyZW50Q29sdW1uUGFydC5jb2x1bW5DbGFzcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBgJHt0aGlzLnN1YlF1ZXJ5UHJlZml4ID8/IFwiXCJ9JHtjb2x1bW5OYW1lfWA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q29sdW1uTmFtZVdpdGhEaWZmZXJlbnRSb290KF9yb290S2V5OiBzdHJpbmcsIC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgZmlyc3RQYXJ0TmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyhrZXlzWzBdKTtcblxuICAgICAgICBpZiAoa2V5cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBmaXJzdFBhcnROYW1lO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBrZXlzWzBdKTtcblxuICAgICAgICAgICAgbGV0IGNvbHVtbk5hbWUgPSBcIlwiO1xuICAgICAgICAgICAgbGV0IGNvbHVtbkFsaWFzID0gY3VycmVudENvbHVtblBhcnQucHJvcGVydHlLZXk7XG4gICAgICAgICAgICBsZXQgY3VycmVudENsYXNzID0gY3VycmVudENvbHVtblBhcnQuY29sdW1uQ2xhc3M7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKGN1cnJlbnRDbGFzcywga2V5c1tpXSk7XG5cbiAgICAgICAgICAgICAgICBjb2x1bW5OYW1lID0gY29sdW1uQWxpYXMgKyBcIi5cIiArIChrZXlzLmxlbmd0aCAtIDEgPT09IGkgPyBjdXJyZW50Q29sdW1uUGFydC5uYW1lIDogY3VycmVudENvbHVtblBhcnQucHJvcGVydHlLZXkpO1xuICAgICAgICAgICAgICAgIGNvbHVtbkFsaWFzICs9IFwiX1wiICsgKGtleXMubGVuZ3RoIC0gMSA9PT0gaSA/IGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWUgOiBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleSk7XG4gICAgICAgICAgICAgICAgY3VycmVudENsYXNzID0gY3VycmVudENvbHVtblBhcnQuY29sdW1uQ2xhc3M7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY29sdW1uTmFtZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZnVuY3Rpb25XaXRoQWxpYXMoa25leEZ1bmN0aW9uTmFtZTogc3RyaW5nLCBmOiBhbnksIGFsaWFzTmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSlba25leEZ1bmN0aW9uTmFtZV0oYCR7dGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzRnJvbUZ1bmN0aW9uT3JTdHJpbmcoZil9IGFzICR7YWxpYXNOYW1lfWApO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoZjogYW55KSB7XG4gICAgICAgIGxldCBjb2x1bW5QYXJ0cztcbiAgICAgICAgaWYgKHR5cGVvZiBmID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb2x1bW5QYXJ0cyA9IGYuc3BsaXQoXCIuXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sdW1uUGFydHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihmKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uUGFydHMpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhc0Zyb21GdW5jdGlvbk9yU3RyaW5nKGY6IGFueSkge1xuICAgICAgICBsZXQgY29sdW1uUGFydHM7XG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uUGFydHMgPSBmLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbHVtblBhcnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oZik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKC4uLmNvbHVtblBhcnRzKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGpvaW5Db2x1bW4oam9pblR5cGU6IFwiaW5uZXJKb2luXCIgfCBcImxlZnRPdXRlckpvaW5cIiwgZjogYW55LCBncmFudWxhcml0eTogR3JhbnVsYXJpdHkgfCB1bmRlZmluZWQpIHtcbiAgICAgICAgbGV0IGNvbHVtblRvSm9pbkFyZ3VtZW50czogc3RyaW5nW107XG5cbiAgICAgICAgaWYgKHR5cGVvZiBmID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb2x1bW5Ub0pvaW5Bcmd1bWVudHMgPSBmLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbHVtblRvSm9pbkFyZ3VtZW50cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29sdW1uVG9Kb2luTmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Ub0pvaW5Bcmd1bWVudHMpO1xuXG4gICAgICAgIGxldCBzZWNvbmRDb2x1bW5OYW1lID0gY29sdW1uVG9Kb2luQXJndW1lbnRzWzBdO1xuICAgICAgICBsZXQgc2Vjb25kQ29sdW1uQWxpYXMgPSBjb2x1bW5Ub0pvaW5Bcmd1bWVudHNbMF07XG4gICAgICAgIGxldCBzZWNvbmRDb2x1bW5DbGFzcyA9IGdldENvbHVtbkluZm9ybWF0aW9uKHRoaXMudGFibGVDbGFzcywgc2Vjb25kQ29sdW1uTmFtZSkuY29sdW1uQ2xhc3M7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBjb2x1bW5Ub0pvaW5Bcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZVNlY29uZENvbHVtbkFsaWFzID0gc2Vjb25kQ29sdW1uQWxpYXM7XG4gICAgICAgICAgICBjb25zdCBiZWZvcmVTZWNvbmRDb2x1bW5DbGFzcyA9IHNlY29uZENvbHVtbkNsYXNzO1xuXG4gICAgICAgICAgICBjb25zdCBjb2x1bW5JbmZvID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24oYmVmb3JlU2Vjb25kQ29sdW1uQ2xhc3MsIGNvbHVtblRvSm9pbkFyZ3VtZW50c1tpXSk7XG4gICAgICAgICAgICBzZWNvbmRDb2x1bW5OYW1lID0gY29sdW1uSW5mby5uYW1lO1xuICAgICAgICAgICAgc2Vjb25kQ29sdW1uQWxpYXMgPSBiZWZvcmVTZWNvbmRDb2x1bW5BbGlhcyArIFwiX1wiICsgY29sdW1uSW5mby5wcm9wZXJ0eUtleTtcbiAgICAgICAgICAgIHNlY29uZENvbHVtbkNsYXNzID0gY29sdW1uSW5mby5jb2x1bW5DbGFzcztcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luTmFtZSA9IGdldFRhYmxlTmFtZShzZWNvbmRDb2x1bW5DbGFzcyk7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXMgPSBgJHt0aGlzLnN1YlF1ZXJ5UHJlZml4ID8/IFwiXCJ9JHtzZWNvbmRDb2x1bW5BbGlhc31gO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkpvaW5Db2x1bW5OYW1lID0gYCR7dGFibGVUb0pvaW5BbGlhc30uJHtnZXRQcmltYXJ5S2V5Q29sdW1uKHNlY29uZENvbHVtbkNsYXNzKS5uYW1lfWA7XG5cbiAgICAgICAgY29uc3Qgam9pblRhYmxlR3JhbnVsYXJpdHkgPSBncmFudWxhcml0eSA/PyBnZXRUYWJsZU1ldGFkYXRhKHNlY29uZENvbHVtbkNsYXNzKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHlRdWVyeSA9ICFqb2luVGFibGVHcmFudWxhcml0eSA/IFwiXCIgOiBgIFdJVEggKCR7am9pblRhYmxlR3JhbnVsYXJpdHl9KWA7XG5cbiAgICAgICAgY29uc3QgdGFibGVOYW1lUmF3ID0gdGhpcy5rbmV4LnJhdyhgPz8gYXMgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RhYmxlVG9Kb2luTmFtZSwgdGFibGVUb0pvaW5BbGlhc10pO1xuICAgICAgICBpZiAoam9pblR5cGUgPT09IFwiaW5uZXJKb2luXCIpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmlubmVySm9pbih0YWJsZU5hbWVSYXcsIHRhYmxlVG9Kb2luSm9pbkNvbHVtbk5hbWUsIGNvbHVtblRvSm9pbk5hbWUpO1xuICAgICAgICB9IGVsc2UgaWYgKGpvaW5UeXBlID09PSBcImxlZnRPdXRlckpvaW5cIikge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIubGVmdE91dGVySm9pbih0YWJsZU5hbWVSYXcsIHRhYmxlVG9Kb2luSm9pbkNvbHVtbk5hbWUsIGNvbHVtblRvSm9pbk5hbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRDb2x1bW5OYW1lRnJvbUFyZ3VtZW50c0lnbm9yaW5nTGFzdFBhcmFtZXRlciguLi5rZXlzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGFyZ3VtZW50c0V4Y2VwdExhc3QgPSBrZXlzLnNsaWNlKDAsIC0xKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5hcmd1bWVudHNFeGNlcHRMYXN0KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtbk5hbWVXaXRob3V0QWxpYXMoLi4ua2V5czogc3RyaW5nW10pOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBleHRyYUpvaW5lZFByb3BlcnR5ID0gdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMuZmluZCgoaSkgPT4gaS5uYW1lID09PSBrZXlzWzBdKTtcbiAgICAgICAgaWYgKGV4dHJhSm9pbmVkUHJvcGVydHkpIHtcbiAgICAgICAgICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBleHRyYUpvaW5lZFByb3BlcnR5Lm5hbWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjb2x1bW5JbmZvID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24oZXh0cmFKb2luZWRQcm9wZXJ0eS5wcm9wZXJ0eVR5cGUsIGtleXNbMV0pO1xuICAgICAgICAgICAgcmV0dXJuIGV4dHJhSm9pbmVkUHJvcGVydHkubmFtZSArIFwiLlwiICsgY29sdW1uSW5mby5uYW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICBjb25zdCBjb2x1bW5JbmZvID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBrZXlzWzBdKTtcbiAgICAgICAgICAgIHJldHVybiBgJHt0aGlzLnN1YlF1ZXJ5UHJlZml4ID8/IFwiXCJ9JHt0aGlzLnRhYmxlTmFtZX0uJHtjb2x1bW5JbmZvLm5hbWV9YDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKHRoaXMudGFibGVDbGFzcywga2V5c1swXSk7XG5cbiAgICAgICAgICAgIGxldCByZXN1bHQgPSBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleTtcbiAgICAgICAgICAgIGxldCBjdXJyZW50Q2xhc3MgPSBjdXJyZW50Q29sdW1uUGFydC5jb2x1bW5DbGFzcztcblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihjdXJyZW50Q2xhc3MsIGtleXNbaV0pO1xuICAgICAgICAgICAgICAgIHJlc3VsdCArPSBcIi5cIiArIChrZXlzLmxlbmd0aCAtIDEgPT09IGkgPyBjdXJyZW50Q29sdW1uUGFydC5uYW1lIDogY3VycmVudENvbHVtblBhcnQucHJvcGVydHlLZXkpO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRDb2x1bW5TZWxlY3RBbGlhcyguLi5rZXlzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gICAgICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGtleXNbMF07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgY29sdW1uQWxpYXMgPSBrZXlzWzBdO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uQWxpYXMgKz0gXCIuXCIgKyBrZXlzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvbHVtbkFsaWFzO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhcHBseVRlbXBvcmFsQ29udmVyc2lvbnNGb3JSZWFkKGl0ZW06IGFueSk6IGFueSB7XG4gICAgICAgIGlmIChpdGVtID09PSBudWxsIHx8IGl0ZW0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGl0ZW07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoaXRlbSkpIHtcbiAgICAgICAgICAgIHJldHVybiBpdGVtLm1hcCgoaSkgPT4gdGhpcy5hcHBseVRlbXBvcmFsQ29udmVyc2lvbnNGb3JSZWFkKGkpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJvb3RDb2x1bW5zID0gZ2V0Q29sdW1uUHJvcGVydGllcyh0aGlzLnRhYmxlQ2xhc3MpO1xuICAgICAgICBmb3IgKGNvbnN0IGNvbCBvZiByb290Q29sdW1ucykge1xuICAgICAgICAgICAgaWYgKCF0aGlzLmlzVGVtcG9yYWxDbGFzcyhjb2w/LmRlc2lnblR5cGUpKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB2YWwgPSBpdGVtW2NvbC5wcm9wZXJ0eUtleV07XG4gICAgICAgICAgICBpZiAodmFsID09PSBudWxsIHx8IHZhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgICAgICAgICAgbGV0IGRhdGVTdHJpbmcgPSB2YWwudG9JU09TdHJpbmcoKTtcbiAgICAgICAgICAgICAgICBpZiAoY29sLmRlc2lnblR5cGUubmFtZSA9PT0gXCJQbGFpbkRhdGVcIiB8fCBjb2wuZGVzaWduVHlwZS5uYW1lID09PSBcIlBsYWluTW9udGhEYXlcIiB8fCBjb2wuZGVzaWduVHlwZS5uYW1lID09PSBcIlBsYWluWWVhck1vbnRoXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGF0ZVN0cmluZyA9IGRhdGVTdHJpbmcuc3Vic3RyaW5nKDAsIDEwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbC5kZXNpZ25UeXBlLm5hbWUgPT09IFwiUGxhaW5EYXRlVGltZVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGRhdGVTdHJpbmcgPSBkYXRlU3RyaW5nLnN1YnN0cmluZygwLCAyMyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb2wuZGVzaWduVHlwZS5uYW1lID09PSBcIlBsYWluVGltZVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGRhdGVTdHJpbmcgPSBkYXRlU3RyaW5nLnN1YnN0cmluZygxMSwgMjMpLnBhZEVuZCgxOCwgXCIwXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpdGVtW2NvbC5wcm9wZXJ0eUtleV0gPSBjb2wuZGVzaWduVHlwZS5mcm9tKGRhdGVTdHJpbmcpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpdGVtW2NvbC5wcm9wZXJ0eUtleV0gPSBjb2wuZGVzaWduVHlwZS5mcm9tKHZhbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IGpvaW5lZCBvZiB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcykge1xuICAgICAgICAgICAgY29uc3QgbmVzdGVkSXRlbSA9IGl0ZW1bam9pbmVkLm5hbWVdO1xuICAgICAgICAgICAgaWYgKG5lc3RlZEl0ZW0gPT09IG51bGwgfHwgbmVzdGVkSXRlbSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGpvaW5lZENvbHVtbnMgPSBnZXRDb2x1bW5Qcm9wZXJ0aWVzKGpvaW5lZC5wcm9wZXJ0eVR5cGUpO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY29sIG9mIGpvaW5lZENvbHVtbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLmlzVGVtcG9yYWxDbGFzcyhjb2w/LmRlc2lnblR5cGUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWwgPSBuZXN0ZWRJdGVtW2NvbC5wcm9wZXJ0eUtleV07XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWwgPT09IG51bGwgfHwgdmFsID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBkYXRlU3RyaW5nID0gdmFsLnRvSVNPU3RyaW5nKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29sLmRlc2lnblR5cGUubmFtZSA9PT0gXCJQbGFpbkRhdGVcIiB8fCBjb2wuZGVzaWduVHlwZS5uYW1lID09PSBcIlBsYWluTW9udGhEYXlcIiB8fCBjb2wuZGVzaWduVHlwZS5uYW1lID09PSBcIlBsYWluWWVhck1vbnRoXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRlU3RyaW5nID0gZGF0ZVN0cmluZy5zdWJzdHJpbmcoMCwgMTApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb2wuZGVzaWduVHlwZS5uYW1lID09PSBcIlBsYWluRGF0ZVRpbWVcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGVTdHJpbmcgPSBkYXRlU3RyaW5nLnN1YnN0cmluZygwLCAyMyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbC5kZXNpZ25UeXBlLm5hbWUgPT09IFwiUGxhaW5UaW1lXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRlU3RyaW5nID0gZGF0ZVN0cmluZy5zdWJzdHJpbmcoMTEsIDIzKS5wYWRFbmQoMTgsIFwiMFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIG5lc3RlZEl0ZW1bY29sLnByb3BlcnR5S2V5XSA9IGNvbC5kZXNpZ25UeXBlLmZyb20oZGF0ZVN0cmluZyk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXN0ZWRJdGVtW2NvbC5wcm9wZXJ0eUtleV0gPSBjb2wuZGVzaWduVHlwZS5mcm9tKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAvLyBqb2luZWQgdHlwZSBtYXkgbm90IGhhdmUgQENvbHVtbiBkZWNvcmF0b3JzIChlLmcuIENURXMpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaXRlbTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGZsYXR0ZW5CeU9wdGlvbihvOiBhbnksIGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKSB7XG4gICAgICAgIGlmIChmbGF0dGVuT3B0aW9uID09PSBGbGF0dGVuT3B0aW9uLm5vRmxhdHRlbiB8fCB0aGlzLnNob3VsZFVuZmxhdHRlbiA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFwcGx5VGVtcG9yYWxDb252ZXJzaW9uc0ZvclJlYWQobyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdW5mbGF0dGVuZWQgPSB1bmZsYXR0ZW4obyk7XG4gICAgICAgIGlmIChmbGF0dGVuT3B0aW9uID09PSB1bmRlZmluZWQgfHwgZmxhdHRlbk9wdGlvbiA9PT0gRmxhdHRlbk9wdGlvbi5mbGF0dGVuKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hcHBseVRlbXBvcmFsQ29udmVyc2lvbnNGb3JSZWFkKHVuZmxhdHRlbmVkKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5hcHBseVRlbXBvcmFsQ29udmVyc2lvbnNGb3JSZWFkKHNldFRvTnVsbCh1bmZsYXR0ZW5lZCkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgam9pblRhYmxlT25GdW5jdGlvbihxdWVyeUJ1aWxkZXJKb2luOiBLbmV4LkpvaW4sIG5ld1Byb3BlcnR5S2V5OiBhbnksIG5ld1Byb3BlcnR5VHlwZTogYW55LCBncmFudWxhcml0eTogR3JhbnVsYXJpdHkgfCB1bmRlZmluZWQsIG9uRnVuY3Rpb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxhbnksIGFueT4pID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMucHVzaCh7XG4gICAgICAgICAgICBuYW1lOiBuZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgICAgIHByb3BlcnR5VHlwZTogbmV3UHJvcGVydHlUeXBlLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkNsYXNzID0gbmV3UHJvcGVydHlUeXBlO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXMgPSBuZXdQcm9wZXJ0eUtleTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHlRdWVyeSA9ICFncmFudWxhcml0eSA/IFwiXCIgOiBgIFdJVEggKCR7Z3JhbnVsYXJpdHl9KWA7XG5cbiAgICAgICAgbGV0IGtuZXhPbk9iamVjdDogYW55O1xuICAgICAgICBjb25zdCB0YWJsZU5hbWVSYXcgPSB0aGlzLmtuZXgucmF3KGA/PyBhcyA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGFibGVUb0pvaW5OYW1lLCB0YWJsZVRvSm9pbkFsaWFzXSk7XG4gICAgICAgIHF1ZXJ5QnVpbGRlckpvaW4odGFibGVOYW1lUmF3LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBrbmV4T25PYmplY3QgPSB0aGlzO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBvbk9iamVjdCA9IHRoaXMuZ2V0VHlwZWRLbmV4T25PYmplY3QobmV3UHJvcGVydHlLZXksIHRhYmxlVG9Kb2luQWxpYXMsIGtuZXhPbk9iamVjdCk7XG4gICAgICAgIG9uRnVuY3Rpb24ob25PYmplY3QgYXMgYW55KTtcblxuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRUeXBlZEtuZXhPbk9iamVjdChuZXdQcm9wZXJ0eUtleTogYW55LCB0YWJsZVRvSm9pbkFsaWFzOiBhbnksIGtuZXhPbk9iamVjdDogYW55KSB7XG4gICAgICAgIGNvbnN0IG9uV2l0aEpvaW5lZENvbHVtbk9wZXJhdG9yQ29sdW1uID0gKGpvaW5lZENvbHVtbjogYW55LCBvcGVyYXRvcjogYW55LCBtb2RlbENvbHVtbjogYW55LCBmdW5jdGlvbk5hbWU6IGtleW9mIEtuZXguSm9pbkNsYXVzZSkgPT4ge1xuICAgICAgICAgICAgbGV0IGNvbHVtbjFBcmd1bWVudHM7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgbW9kZWxDb2x1bW4gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICBjb2x1bW4xQXJndW1lbnRzID0gbW9kZWxDb2x1bW4uc3BsaXQoXCIuXCIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2x1bW4xQXJndW1lbnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24obW9kZWxDb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29sdW1uMk5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXMobmV3UHJvcGVydHlLZXksIGpvaW5lZENvbHVtbik7XG5cbiAgICAgICAgICAgIGtuZXhPbk9iamVjdFtmdW5jdGlvbk5hbWVdKHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW4xQXJndW1lbnRzKSwgb3BlcmF0b3IsIGNvbHVtbjJOYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBvbldpdGhDb2x1bW5PcGVyYXRvclZhbHVlID0gKGpvaW5lZE1vZGVsQ29sdW1uOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnksIGZ1bmN0aW9uTmFtZToga2V5b2YgS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb2x1bW4yTmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyhuZXdQcm9wZXJ0eUtleSwgam9pbmVkTW9kZWxDb2x1bW4pO1xuICAgICAgICAgICAga25leE9uT2JqZWN0W2Z1bmN0aW9uTmFtZV0oY29sdW1uMk5hbWUsIG9wZXJhdG9yLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKHZhbHVlKSk7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IG9uV2l0aE1vZGVsQ29sdW1uT3BlcmF0b3JWYWx1ZSA9IChtb2RlbENvbHVtbjogYW55LCBvcGVyYXRvcjogYW55LCB2YWx1ZTogYW55LCBmdW5jdGlvbk5hbWU6IGtleW9mIEtuZXguSm9pbkNsYXVzZSkgPT4ge1xuICAgICAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50cztcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbW9kZWxDb2x1bW4gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHMgPSBtb2RlbENvbHVtbi5zcGxpdChcIi5cIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKG1vZGVsQ29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGtuZXhPbk9iamVjdFtmdW5jdGlvbk5hbWVdKHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpLCBvcGVyYXRvciwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbSh2YWx1ZSkpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG9uTnVsbFZhbHVlID0gKGpvaW5lZE1vZGVsQ29sdW1uOiBhbnksIGZ1bmN0aW9uTmFtZToga2V5b2YgS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb2x1bW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihqb2luZWRNb2RlbENvbHVtbik7XG4gICAgICAgICAgICBjb25zdCBjb2x1bW5Bcmd1bWVudHNXaXRoSm9pbmVkVGFibGUgPSBbdGFibGVUb0pvaW5BbGlhcywgLi4uY29sdW1uQXJndW1lbnRzXTtcblxuICAgICAgICAgICAga25leE9uT2JqZWN0W2Z1bmN0aW9uTmFtZV0oY29sdW1uQXJndW1lbnRzV2l0aEpvaW5lZFRhYmxlLmpvaW4oXCIuXCIpKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3Qgb25OdWxsTW9kZWxWYWx1ZSA9IChtb2RlbENvbHVtbjogYW55LCBmdW5jdGlvbk5hbWU6IGtleW9mIEtuZXguSm9pbkNsYXVzZSkgPT4ge1xuICAgICAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50cztcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbW9kZWxDb2x1bW4gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHMgPSBtb2RlbENvbHVtbi5zcGxpdChcIi5cIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKG1vZGVsQ29sdW1uKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAga25leE9uT2JqZWN0W2Z1bmN0aW9uTmFtZV0odGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG9uT2JqZWN0ID0ge1xuICAgICAgICAgICAgb25Db2x1bW5zOiAoY29sdW1uMTogYW55LCBvcGVyYXRvcjogYW55LCBjb2x1bW4yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhKb2luZWRDb2x1bW5PcGVyYXRvckNvbHVtbihjb2x1bW4yLCBvcGVyYXRvciwgY29sdW1uMSwgXCJvblwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb246IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIGNvbHVtbjI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aEpvaW5lZENvbHVtbk9wZXJhdG9yQ29sdW1uKGNvbHVtbjEsIG9wZXJhdG9yLCBjb2x1bW4yLCBcIm9uXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhbmRPbjogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgY29sdW1uMjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4oY29sdW1uMSwgb3BlcmF0b3IsIGNvbHVtbjIsIFwiYW5kT25cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9yT246IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIGNvbHVtbjI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aEpvaW5lZENvbHVtbk9wZXJhdG9yQ29sdW1uKGNvbHVtbjEsIG9wZXJhdG9yLCBjb2x1bW4yLCBcIm9yT25cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uVmFsOiAoY29sdW1uMTogYW55LCBvcGVyYXRvcjogYW55LCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoQ29sdW1uT3BlcmF0b3JWYWx1ZShjb2x1bW4xLCBvcGVyYXRvciwgdmFsdWUsIFwib25WYWxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFuZE9uVmFsOiAoY29sdW1uMTogYW55LCBvcGVyYXRvcjogYW55LCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoQ29sdW1uT3BlcmF0b3JWYWx1ZShjb2x1bW4xLCBvcGVyYXRvciwgdmFsdWUsIFwiYW5kT25WYWxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9yT25WYWw6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhDb2x1bW5PcGVyYXRvclZhbHVlKGNvbHVtbjEsIG9wZXJhdG9yLCB2YWx1ZSwgXCJvck9uVmFsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbk51bGw6IChjb2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uTnVsbFZhbHVlKGNvbHVtbiwgXCJvbk51bGxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uTm90TnVsbDogKGNvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsVmFsdWUoY29sdW1uLCBcIm9uTm90TnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPbk51bGw6IChjb2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uTnVsbFZhbHVlKGNvbHVtbiwgXCJvck9uTnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPbk5vdE51bGw6IChjb2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uTnVsbFZhbHVlKGNvbHVtbiwgXCJvck9uTm90TnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYW5kT25OdWxsOiAoY29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxWYWx1ZShjb2x1bW4sIFwiYW5kT25OdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhbmRPbk5vdE51bGw6IChjb2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uTnVsbFZhbHVlKGNvbHVtbiwgXCJhbmRPbk5vdE51bGxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uUGFyZW50aGVzZXM6IChvblBhcmVudGhlc2VzRnVuY3Rpb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxhbnksIGFueT4pID0+IHZvaWQpID0+IHtcbiAgICAgICAgICAgICAgICBrbmV4T25PYmplY3Qub24oKG9uOiBLbmV4LkpvaW5DbGF1c2UpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFyZW50aGVzZXNPbk9iamVjdCA9IHRoaXMuZ2V0VHlwZWRLbmV4T25PYmplY3QobmV3UHJvcGVydHlLZXksIHRhYmxlVG9Kb2luQWxpYXMsIG9uKTtcbiAgICAgICAgICAgICAgICAgICAgb25QYXJlbnRoZXNlc0Z1bmN0aW9uKHBhcmVudGhlc2VzT25PYmplY3QpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhbmRPblBhcmVudGhlc2VzOiAob25QYXJlbnRoZXNlc0Z1bmN0aW9uOiAoam9pbjogSUpvaW5PbkNsYXVzZTI8YW55LCBhbnk+KSA9PiB2b2lkKSA9PiB7XG4gICAgICAgICAgICAgICAga25leE9uT2JqZWN0LmFuZE9uKChvbjogS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudGhlc2VzT25PYmplY3QgPSB0aGlzLmdldFR5cGVkS25leE9uT2JqZWN0KG5ld1Byb3BlcnR5S2V5LCB0YWJsZVRvSm9pbkFsaWFzLCBvbik7XG4gICAgICAgICAgICAgICAgICAgIG9uUGFyZW50aGVzZXNGdW5jdGlvbihwYXJlbnRoZXNlc09uT2JqZWN0KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblBhcmVudGhlc2VzOiAob25QYXJlbnRoZXNlc0Z1bmN0aW9uOiAoam9pbjogSUpvaW5PbkNsYXVzZTI8YW55LCBhbnk+KSA9PiB2b2lkKSA9PiB7XG4gICAgICAgICAgICAgICAga25leE9uT2JqZWN0Lm9yT24oKG9uOiBLbmV4LkpvaW5DbGF1c2UpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFyZW50aGVzZXNPbk9iamVjdCA9IHRoaXMuZ2V0VHlwZWRLbmV4T25PYmplY3QobmV3UHJvcGVydHlLZXksIHRhYmxlVG9Kb2luQWxpYXMsIG9uKTtcbiAgICAgICAgICAgICAgICAgICAgb25QYXJlbnRoZXNlc0Z1bmN0aW9uKHBhcmVudGhlc2VzT25PYmplY3QpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblF1ZXJ5VmFsOiAobW9kZWxDb2x1bW46IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aE1vZGVsQ29sdW1uT3BlcmF0b3JWYWx1ZShtb2RlbENvbHVtbiwgb3BlcmF0b3IsIHZhbHVlLCBcIm9uVmFsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uUXVlcnlWYWw6IChtb2RlbENvbHVtbjogYW55LCBvcGVyYXRvcjogYW55LCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoTW9kZWxDb2x1bW5PcGVyYXRvclZhbHVlKG1vZGVsQ29sdW1uLCBvcGVyYXRvciwgdmFsdWUsIFwib3JPblZhbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25RdWVyeU51bGw6IChtb2RlbENvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsTW9kZWxWYWx1ZShtb2RlbENvbHVtbiwgXCJvbk51bGxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9yT25RdWVyeU51bGw6IChtb2RlbENvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsTW9kZWxWYWx1ZShtb2RlbENvbHVtbiwgXCJvck9uTnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25RdWVyeU5vdE51bGw6IChtb2RlbENvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsTW9kZWxWYWx1ZShtb2RlbENvbHVtbiwgXCJvbk5vdE51bGxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9yT25RdWVyeU5vdE51bGw6IChtb2RlbENvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsTW9kZWxWYWx1ZShtb2RlbENvbHVtbiwgXCJvck9uTm90TnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25SYXc6IChyYXc6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKSA9PiB7XG4gICAgICAgICAgICAgICAga25leE9uT2JqZWN0Lm9uKChvbjogS25leC5Kb2luQ2xhdXNlKSA9PiBvbi5vbih0aGlzLmtuZXgucmF3KHJhdywgYmluZGluZ3MpKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9yT25SYXc6IChyYXc6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKSA9PiB7XG4gICAgICAgICAgICAgICAga25leE9uT2JqZWN0Lm9yT24oKG9uOiBLbmV4LkpvaW5DbGF1c2UpID0+IG9uLm9uKHRoaXMua25leC5yYXcocmF3LCBiaW5kaW5ncykpKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9IGFzIGFueTtcblxuICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgfVxuXG4gICAgLy8gb25jZSBhbGwgZW52aXJvbm1lbnRzIGNhbiB1c2UgbmF0aXZlIFRlbXBvcmFsLCB0aGlzIHByb2Nlc3Mgc2hvdWxkIGJlIHNpbXBsaWZpZWRcbiAgICBwcml2YXRlIFRFTVBPUkFMX0NMQVNTX05BTUVTOiBSZWFkb25seTxTZXQ8c3RyaW5nPj4gPSBuZXcgU2V0KFtcIlBsYWluRGF0ZVwiLCBcIlBsYWluRGF0ZVRpbWVcIiwgXCJQbGFpbk1vbnRoRGF5XCIsIFwiUGxhaW5UaW1lXCIsIFwiUGxhaW5ZZWFyTW9udGhcIiwgXCJab25lZERhdGVUaW1lXCJdKTtcbiAgICBwcml2YXRlIGlzVGVtcG9yYWxDbGFzcyhcbiAgICAgICAgZGVzaWduVHlwZTogYW55XG4gICAgKTogZGVzaWduVHlwZSBpcyB0eXBlb2YgVGVtcG9yYWwuUGxhaW5EYXRlIHwgdHlwZW9mIFRlbXBvcmFsLlBsYWluRGF0ZVRpbWUgfCB0eXBlb2YgVGVtcG9yYWwuUGxhaW5Nb250aERheSB8IHR5cGVvZiBUZW1wb3JhbC5QbGFpblRpbWUgfCB0eXBlb2YgVGVtcG9yYWwuUGxhaW5ZZWFyTW9udGggfCB0eXBlb2YgVGVtcG9yYWwuWm9uZWREYXRlVGltZSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICBkZXNpZ25UeXBlID09PSBUZW1wb3JhbC5QbGFpbkRhdGUgfHxcbiAgICAgICAgICAgIGRlc2lnblR5cGUgPT09IFRlbXBvcmFsLlBsYWluRGF0ZVRpbWUgfHxcbiAgICAgICAgICAgIGRlc2lnblR5cGUgPT09IFRlbXBvcmFsLlBsYWluTW9udGhEYXkgfHxcbiAgICAgICAgICAgIGRlc2lnblR5cGUgPT09IFRlbXBvcmFsLlBsYWluVGltZSB8fFxuICAgICAgICAgICAgZGVzaWduVHlwZSA9PT0gVGVtcG9yYWwuUGxhaW5ZZWFyTW9udGggfHxcbiAgICAgICAgICAgIGRlc2lnblR5cGUgPT09IFRlbXBvcmFsLlpvbmVkRGF0ZVRpbWUgfHxcbiAgICAgICAgICAgIC8vIGZhbGxiYWNrIGZvciBlbnZpcm9ubWVudHMgd2hlcmUgVGVtcG9yYWwgY2xhc3MgZGVmaW5pdGlvbnMgbWF5IGRpZmZlclxuICAgICAgICAgICAgKGRlc2lnblR5cGUgJiYgdGhpcy5URU1QT1JBTF9DTEFTU19OQU1FUy5oYXMoZGVzaWduVHlwZS5uYW1lKSAmJiB0eXBlb2YgZGVzaWduVHlwZS5mcm9tID09PSBcImZ1bmN0aW9uXCIpXG4gICAgICAgICk7XG4gICAgfVxuICAgIHByaXZhdGUgaXNUZW1wb3JhbFZhbHVlKHZhbHVlOiBhbnkpOiB2YWx1ZSBpcyBUZW1wb3JhbC5QbGFpbkRhdGUgfCBUZW1wb3JhbC5QbGFpbkRhdGVUaW1lIHwgVGVtcG9yYWwuUGxhaW5Nb250aERheSB8IFRlbXBvcmFsLlBsYWluVGltZSB8IFRlbXBvcmFsLlBsYWluWWVhck1vbnRoIHwgVGVtcG9yYWwuWm9uZWREYXRlVGltZSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICB2YWx1ZSBpbnN0YW5jZW9mIFRlbXBvcmFsLlBsYWluRGF0ZSB8fFxuICAgICAgICAgICAgdmFsdWUgaW5zdGFuY2VvZiBUZW1wb3JhbC5QbGFpbkRhdGVUaW1lIHx8XG4gICAgICAgICAgICB2YWx1ZSBpbnN0YW5jZW9mIFRlbXBvcmFsLlBsYWluTW9udGhEYXkgfHxcbiAgICAgICAgICAgIHZhbHVlIGluc3RhbmNlb2YgVGVtcG9yYWwuUGxhaW5UaW1lIHx8XG4gICAgICAgICAgICB2YWx1ZSBpbnN0YW5jZW9mIFRlbXBvcmFsLlBsYWluWWVhck1vbnRoIHx8XG4gICAgICAgICAgICB2YWx1ZSBpbnN0YW5jZW9mIFRlbXBvcmFsLlpvbmVkRGF0ZVRpbWUgfHxcbiAgICAgICAgICAgIC8vIGZhbGxiYWNrIGZvciBlbnZpcm9ubWVudHMgd2hlcmUgVGVtcG9yYWwgY2xhc3MgZGVmaW5pdGlvbnMgbWF5IGRpZmZlclxuICAgICAgICAgICAgISEodmFsdWUgJiYgdmFsdWUuY29uc3RydWN0b3IgJiYgdGhpcy5URU1QT1JBTF9DTEFTU19OQU1FUy5oYXModmFsdWUuY29uc3RydWN0b3IubmFtZSkgJiYgdHlwZW9mIHZhbHVlLnRvU3RyaW5nID09PSBcImZ1bmN0aW9uXCIpXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjb252ZXJ0VGVtcG9yYWxQYXJhbSh2YWx1ZTogYW55KTogYW55IHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUubWFwKCh2KSA9PiB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKHYpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5pc1RlbXBvcmFsVmFsdWUodmFsdWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUudG9TdHJpbmcoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKGtuZXhGdW5jdGlvbjogYW55LCAuLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3NbMF0gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29uY2F0S2V5Q29sdW1uKGtuZXhGdW5jdGlvbiwgLi4uYXJncyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29sdW1uQXJndW1lbnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oYXJnc1swXSk7XG5cbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgICBrbmV4RnVuY3Rpb24odGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cyksIGFyZ3NbMV0sIHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0oYXJnc1syXSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAga25leEZ1bmN0aW9uKHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKGFyZ3NbMV0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgY2FsbEtuZXhGdW5jdGlvbldpdGhDb25jYXRLZXlDb2x1bW4oa25leEZ1bmN0aW9uOiBhbnksIC4uLmFyZ3M6IGFueVtdKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50cyA9IGFyZ3NbMF0uc3BsaXQoXCIuXCIpO1xuICAgICAgICBjb25zdCBjb2x1bW5OYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cyk7XG5cbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgICBrbmV4RnVuY3Rpb24oY29sdW1uTmFtZSwgYXJnc1sxXSwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShhcmdzWzJdKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBrbmV4RnVuY3Rpb24oY29sdW1uTmFtZSwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShhcmdzWzFdKSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIHNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpIHtcbiAgICAgICAgY29uc3QgcHJvcGVydGllcyA9IGdldENvbHVtblByb3BlcnRpZXModGhpcy50YWJsZUNsYXNzKTtcbiAgICAgICAgZm9yIChjb25zdCBwcm9wZXJ0eSBvZiBwcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5zZWxlY3QoYCR7cHJvcGVydHkubmFtZX0gYXMgJHtwcm9wZXJ0eS5wcm9wZXJ0eUtleX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgam9pbihqb2luRnVuY3Rpb25OYW1lOiBzdHJpbmcsIHRhYmxlVG9Kb2luQWxpYXM6IGFueSwgdGFibGVUb0pvaW5DbGFzczogYW55LCBncmFudWxhcml0eTogR3JhbnVsYXJpdHkgfCB1bmRlZmluZWQsIGpvaW5UYWJsZUNvbHVtblN0cmluZzogYW55LCBvcGVyYXRvcjogYW55LCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nOiBhbnkpIHtcbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMucHVzaCh7XG4gICAgICAgICAgICBuYW1lOiB0YWJsZVRvSm9pbkFsaWFzLFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiB0YWJsZVRvSm9pbkNsYXNzLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkFsaWFzV2l0aFVuZGVyc2NvcmVzID0gdGFibGVUb0pvaW5BbGlhcy5zcGxpdChcIi5cIikuam9pbihcIl9cIik7XG5cbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5OYW1lID0gZ2V0VGFibGVOYW1lKHRhYmxlVG9Kb2luQ2xhc3MpO1xuXG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtbkluZm9ybWF0aW9uID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGFibGVUb0pvaW5DbGFzcywgam9pblRhYmxlQ29sdW1uU3RyaW5nKTtcblxuICAgICAgICBjb25zdCBqb2luVGFibGVDb2x1bW5Bcmd1bWVudHMgPSBgJHt0YWJsZVRvSm9pbkFsaWFzV2l0aFVuZGVyc2NvcmVzfS4ke2pvaW5UYWJsZUNvbHVtbkluZm9ybWF0aW9uLm5hbWV9YDtcblxuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlQ29sdW1uTmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5leGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nLnNwbGl0KFwiLlwiKSk7XG5cbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHlRdWVyeSA9ICFncmFudWxhcml0eSA/IFwiXCIgOiBgIFdJVEggKCR7Z3JhbnVsYXJpdHl9KWA7XG4gICAgICAgIGNvbnN0IHRhYmxlTmFtZVJhdyA9IHRoaXMua25leC5yYXcoYD8/IGFzID8/JHtncmFudWxhcml0eVF1ZXJ5fWAsIFt0YWJsZVRvSm9pbk5hbWUsIHRhYmxlVG9Kb2luQWxpYXNXaXRoVW5kZXJzY29yZXNdKTtcblxuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KVtqb2luRnVuY3Rpb25OYW1lXSh0YWJsZU5hbWVSYXcsIGpvaW5UYWJsZUNvbHVtbkFyZ3VtZW50cywgb3BlcmF0b3IsIGV4aXN0aW5nVGFibGVDb2x1bW5OYW1lKTtcblxuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIG1hcFByb3BlcnR5TmFtZVRvQ29sdW1uTmFtZShwcm9wZXJ0eU5hbWU6IHN0cmluZykge1xuICAgICAgICBjb25zdCBjb2x1bW5JbmZvID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBwcm9wZXJ0eU5hbWUpO1xuICAgICAgICByZXR1cm4gY29sdW1uSW5mby5uYW1lO1xuICAgIH1cbiAgICBwdWJsaWMgbWFwQ29sdW1uTmFtZVRvUHJvcGVydHlOYW1lKGNvbHVtbk5hbWU6IHN0cmluZykge1xuICAgICAgICBjb25zdCBjb2x1bW5Qcm9wZXJ0aWVzID0gZ2V0Q29sdW1uUHJvcGVydGllcyh0aGlzLnRhYmxlQ2xhc3MpO1xuICAgICAgICBjb25zdCBjb2x1bW5Qcm9wZXJ0eSA9IGNvbHVtblByb3BlcnRpZXMuZmluZCgoaSkgPT4gaS5uYW1lID09PSBjb2x1bW5OYW1lKTtcbiAgICAgICAgaWYgKGNvbHVtblByb3BlcnR5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGZpbmQgY29sdW1uIHdpdGggbmFtZSBcIiR7Y29sdW1uTmFtZX1cImApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb2x1bW5Qcm9wZXJ0eS5wcm9wZXJ0eUtleTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbWFwQ29sdW1uc1RvUHJvcGVydGllcyhpdGVtOiBhbnkpIHtcbiAgICAgICAgY29uc3QgY29sdW1uTmFtZXMgPSBPYmplY3Qua2V5cyhpdGVtKTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNvbHVtbk5hbWUgb2YgY29sdW1uTmFtZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5TmFtZSA9IHRoaXMubWFwQ29sdW1uTmFtZVRvUHJvcGVydHlOYW1lKGNvbHVtbk5hbWUpO1xuXG4gICAgICAgICAgICBpZiAoY29sdW1uTmFtZSAhPT0gcHJvcGVydHlOYW1lKSB7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGl0ZW0sIHByb3BlcnR5TmFtZSwgT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihpdGVtLCBjb2x1bW5OYW1lKSEpO1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBpdGVtW2NvbHVtbk5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIG1hcFByb3BlcnRpZXNUb0NvbHVtbnMoaXRlbTogYW55KSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbnNCeVByb3BlcnR5S2V5ID0gbmV3IE1hcChnZXRDb2x1bW5Qcm9wZXJ0aWVzKHRoaXMudGFibGVDbGFzcykubWFwKChjKSA9PiBbYy5wcm9wZXJ0eUtleSwgY10pKTtcbiAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lcyA9IE9iamVjdC5rZXlzKGl0ZW0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgcHJvcGVydHlOYW1lIG9mIHByb3BlcnR5TmFtZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbCA9IGNvbHVtbnNCeVByb3BlcnR5S2V5LmdldChwcm9wZXJ0eU5hbWUpO1xuICAgICAgICAgICAgY29uc3QgdmFsID0gaXRlbVtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICAgICAgaWYgKHZhbCAmJiAodGhpcy5pc1RlbXBvcmFsQ2xhc3MoY29sPy5kZXNpZ25UeXBlKSB8fCB0aGlzLmlzVGVtcG9yYWxWYWx1ZSh2YWwpKSkge1xuICAgICAgICAgICAgICAgIGl0ZW1bcHJvcGVydHlOYW1lXSA9IHZhbC50b1N0cmluZygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjb2x1bW5OYW1lID0gdGhpcy5tYXBQcm9wZXJ0eU5hbWVUb0NvbHVtbk5hbWUocHJvcGVydHlOYW1lKTtcbiAgICAgICAgICAgIGlmIChjb2x1bW5OYW1lICE9PSBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoaXRlbSwgY29sdW1uTmFtZSwgT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihpdGVtLCBwcm9wZXJ0eU5hbWUpISk7XG4gICAgICAgICAgICAgICAgZGVsZXRlIGl0ZW1bcHJvcGVydHlOYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==
