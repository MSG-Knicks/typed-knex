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
            this.convertTemporalColumnForRead(item, col);
        }
        for (const joined of this.extraJoinedProperties) {
            const nestedItem = item[joined.name];
            if (nestedItem === null || nestedItem === undefined) {
                continue;
            }
            try {
                const joinedColumns = (0, decorators_1.getColumnProperties)(joined.propertyType);
                for (const col of joinedColumns) {
                    this.convertTemporalColumnForRead(nestedItem, col);
                }
            } catch (_a) {
                // joined type may not have @Column decorators (e.g. CTEs)
            }
        }
        return item;
    }
    convertTemporalColumnForRead(container, col) {
        if (!col || !this.isTemporalClass(col.columnType)) {
            return;
        }
        const columnType = col.columnType;
        const val = container[col.propertyKey];
        if (val === null || val === undefined) {
            return;
        }
        if (val instanceof Date) {
            let dateString = val.toISOString();
            if (columnType.name === "PlainDate" || columnType.name === "PlainMonthDay" || columnType.name === "PlainYearMonth") {
                dateString = dateString.substring(0, 10);
            } else if (columnType.name === "PlainDateTime") {
                dateString = dateString.substring(0, 23);
            } else if (columnType.name === "PlainTime") {
                dateString = dateString.substring(11, 23).padEnd(18, "0");
            }
            container[col.propertyKey] = columnType.from(dateString);
        } else {
            container[col.propertyKey] = columnType.from(val);
        }
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
            if (val && (this.isTemporalClass(col === null || col === void 0 ? void 0 : col.columnType) || this.isTemporalValue(val))) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZWRLbmV4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3R5cGVkS25leC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSx5REFBNkM7QUFDN0MsNkNBQWtKO0FBUWxKLDJDQUFrRTtBQUVsRSxNQUFhLFNBQVM7SUFDbEIsWUFBb0IsSUFBVTtRQUFWLFNBQUksR0FBSixJQUFJLENBQU07SUFBRyxDQUFDO0lBRTNCLEtBQUssQ0FBSSxVQUF1QixFQUFFLFdBQXlCO1FBQzlELE1BQU0sZ0JBQWdCLEdBQUcsV0FBVyxhQUFYLFdBQVcsY0FBWCxXQUFXLEdBQUksSUFBQSw2QkFBZ0IsRUFBQyxVQUFVLENBQUMsQ0FBQyxXQUFXLENBQUM7UUFDakYsT0FBTyxJQUFJLGlCQUFpQixDQUFVLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbkYsQ0FBQztJQUVNLElBQUksQ0FBVSxhQUEwQixFQUFFLFFBQWlGO1FBQzlILE1BQU0sS0FBSyxHQUFHLElBQUEseUJBQVksRUFBQyxhQUFhLENBQUMsQ0FBQztRQUMxQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLHdCQUF3QixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLE9BQU8sSUFBSSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFTSxnQkFBZ0I7UUFDbkIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLElBQUksQ0FBQyxJQUFJO2lCQUNKLFdBQVcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNq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Y2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSBwcmVmZXItcmVzdC1wYXJhbXMsIG5vLXVudXNlZC12YXJzICovXG5pbXBvcnQgeyBLbmV4IH0gZnJvbSBcImtuZXhcIjtcbmltcG9ydCB7IFRlbXBvcmFsIH0gZnJvbSBcInRlbXBvcmFsLXBvbHlmaWxsXCI7XG5pbXBvcnQgeyBnZXRDb2x1bW5JbmZvcm1hdGlvbiwgZ2V0Q29sdW1uUHJvcGVydGllcywgZ2V0UHJpbWFyeUtleUNvbHVtbiwgZ2V0VGFibGVNZXRhZGF0YSwgZ2V0VGFibGVOYW1lLCBUZW1wb3JhbENvbHVtblR5cGUgfSBmcm9tIFwiLi9kZWNvcmF0b3JzXCI7XG5pbXBvcnQgeyBOZXN0ZWRGb3JlaWduS2V5S2V5c09mLCBOZXN0ZWRLZXlzT2YgfSBmcm9tIFwiLi9OZXN0ZWRLZXlzT2ZcIjtcbmltcG9ydCB7IE5lc3RlZFJlY29yZCB9IGZyb20gXCIuL05lc3RlZFJlY29yZFwiO1xuaW1wb3J0IHsgTm9uRm9yZWlnbktleU9iamVjdHMgfSBmcm9tIFwiLi9Ob25Gb3JlaWduS2V5T2JqZWN0c1wiO1xuaW1wb3J0IHsgTm9uTnVsbGFibGVSZWN1cnNpdmUgfSBmcm9tIFwiLi9Ob25OdWxsYWJsZVJlY3Vyc2l2ZVwiO1xuaW1wb3J0IHsgUGFydGlhbEFuZFVuZGVmaW5lZCB9IGZyb20gXCIuL1BhcnRpYWxBbmRVbmRlZmluZWRcIjtcbmltcG9ydCB7IEdldE5lc3RlZFByb3BlcnR5LCBHZXROZXN0ZWRQcm9wZXJ0eVR5cGUgfSBmcm9tIFwiLi9Qcm9wZXJ0eVR5cGVzXCI7XG5pbXBvcnQgeyBTZWxlY3RhYmxlQ29sdW1uVHlwZXMgfSBmcm9tIFwiLi9TZWxlY3RhYmxlQ29sdW1uVHlwZXNcIjtcbmltcG9ydCB7IEZsYXR0ZW5PcHRpb24sIHNldFRvTnVsbCwgdW5mbGF0dGVuIH0gZnJvbSBcIi4vdW5mbGF0dGVuXCI7XG5cbmV4cG9ydCBjbGFzcyBUeXBlZEtuZXgge1xuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUga25leDogS25leCkge31cblxuICAgIHB1YmxpYyBxdWVyeTxUPih0YWJsZUNsYXNzOiBuZXcgKCkgPT4gVCwgZ3JhbnVsYXJpdHk/OiBHcmFudWxhcml0eSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxULCBULCBUPiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5R3JhbnVsYXJpdHkgPSBncmFudWxhcml0eSA/PyBnZXRUYWJsZU1ldGFkYXRhKHRhYmxlQ2xhc3MpLmRlZmF1bHRMb2NrO1xuICAgICAgICByZXR1cm4gbmV3IFR5cGVkUXVlcnlCdWlsZGVyPFQsIFQsIFQ+KHRhYmxlQ2xhc3MsIHF1ZXJ5R3JhbnVsYXJpdHksIHRoaXMua25leCk7XG4gICAgfVxuXG4gICAgcHVibGljIHdpdGg8VCwgVSwgVj4oY3RlVGFibGVDbGFzczogbmV3ICgpID0+IFQsIGN0ZVF1ZXJ5OiAocXVlcnlCdWlsZGVyOiBUeXBlZEtuZXhDVEVRdWVyeUJ1aWxkZXIpID0+IElUeXBlZFF1ZXJ5QnVpbGRlcjxVLCBWLCBUPik6IFR5cGVkS25leFF1ZXJ5QnVpbGRlciB7XG4gICAgICAgIGNvbnN0IGFsaWFzID0gZ2V0VGFibGVOYW1lKGN0ZVRhYmxlQ2xhc3MpO1xuICAgICAgICBjb25zdCBxYiA9IHRoaXMua25leC53aXRoKGFsaWFzLCAodykgPT4gY3RlUXVlcnkobmV3IFR5cGVkS25leENURVF1ZXJ5QnVpbGRlcih0aGlzLmtuZXgsIHcpKSk7XG4gICAgICAgIHJldHVybiBuZXcgVHlwZWRLbmV4UXVlcnlCdWlsZGVyKHRoaXMua25leCwgcWIpO1xuICAgIH1cblxuICAgIHB1YmxpYyBiZWdpblRyYW5zYWN0aW9uKCk6IFByb21pc2U8S25leC5UcmFuc2FjdGlvbj4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRoaXMua25leFxuICAgICAgICAgICAgICAgIC50cmFuc2FjdGlvbigodHIpID0+IHJlc29sdmUodHIpKVxuICAgICAgICAgICAgICAgIC8vIElmIHRoaXMgZXJyb3IgaXMgbm90IGNhdWdodCBoZXJlLCBpdCB3aWxsIHRocm93LCByZXN1bHRpbmcgaW4gYW4gdW5oYW5kbGVkUmVqZWN0aW9uXG4gICAgICAgICAgICAgICAgLmNhdGNoKChfZSkgPT4ge30pO1xuICAgICAgICB9KTtcbiAgICB9XG59XG5cbmNsYXNzIFR5cGVkS25leENURVF1ZXJ5QnVpbGRlciB7XG4gICAgY29uc3RydWN0b3IocHJvdGVjdGVkIGtuZXg6IEtuZXgsIHByb3RlY3RlZCBxdWVyeUJ1aWxkZXI6IEtuZXguUXVlcnlCdWlsZGVyKSB7fVxuXG4gICAgcHVibGljIHF1ZXJ5PFQ+KHRhYmxlQ2xhc3M6IG5ldyAoKSA9PiBULCBncmFudWxhcml0eT86IEdyYW51bGFyaXR5KTogSVR5cGVkUXVlcnlCdWlsZGVyPFQsIFQsIFQ+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBUeXBlZFF1ZXJ5QnVpbGRlcjxULCBULCBUPih0YWJsZUNsYXNzLCBncmFudWxhcml0eSwgdGhpcy5rbmV4LCB0aGlzLnF1ZXJ5QnVpbGRlcik7XG4gICAgfVxufVxuXG5jbGFzcyBUeXBlZEtuZXhRdWVyeUJ1aWxkZXIgZXh0ZW5kcyBUeXBlZEtuZXhDVEVRdWVyeUJ1aWxkZXIge1xuICAgIHB1YmxpYyB3aXRoPFQsIFUsIFY+KGN0ZVRhYmxlQ2xhc3M6IG5ldyAoKSA9PiBULCBjdGVRdWVyeTogKHF1ZXJ5QnVpbGRlcjogVHlwZWRLbmV4Q1RFUXVlcnlCdWlsZGVyKSA9PiBJVHlwZWRRdWVyeUJ1aWxkZXI8VSwgViwgVD4pOiBUeXBlZEtuZXhRdWVyeUJ1aWxkZXIge1xuICAgICAgICBjb25zdCBhbGlhcyA9IGdldFRhYmxlTmFtZShjdGVUYWJsZUNsYXNzKTtcbiAgICAgICAgY29uc3QgcWIgPSB0aGlzLnF1ZXJ5QnVpbGRlci53aXRoKGFsaWFzLCAodykgPT4gY3RlUXVlcnkobmV3IFR5cGVkS25leENURVF1ZXJ5QnVpbGRlcih0aGlzLmtuZXgsIHcpKSk7XG4gICAgICAgIHJldHVybiBuZXcgVHlwZWRLbmV4UXVlcnlCdWlsZGVyKHRoaXMua25leCwgcWIpO1xuICAgIH1cbn1cblxubGV0IGJlZm9yZUluc2VydFRyYW5zZm9ybSA9IHVuZGVmaW5lZCBhcyB1bmRlZmluZWQgfCAoKGl0ZW06IGFueSwgdHlwZWRRdWVyeUJ1aWxkZXI6IGFueSkgPT4gYW55KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQmVmb3JlSW5zZXJ0VHJhbnNmb3JtPFQ+KGY6IChpdGVtOiBULCB0eXBlZFF1ZXJ5QnVpbGRlcjogSVR5cGVkUXVlcnlCdWlsZGVyPHt9LCB7fSwge30+KSA9PiBUKSB7XG4gICAgYmVmb3JlSW5zZXJ0VHJhbnNmb3JtID0gZjtcbn1cblxubGV0IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSA9IHVuZGVmaW5lZCBhcyB1bmRlZmluZWQgfCAoKGl0ZW06IGFueSwgdHlwZWRRdWVyeUJ1aWxkZXI6IGFueSkgPT4gYW55KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQmVmb3JlVXBkYXRlVHJhbnNmb3JtPFQ+KGY6IChpdGVtOiBULCB0eXBlZFF1ZXJ5QnVpbGRlcjogSVR5cGVkUXVlcnlCdWlsZGVyPHt9LCB7fSwge30+KSA9PiBUKSB7XG4gICAgYmVmb3JlVXBkYXRlVHJhbnNmb3JtID0gZjtcbn1cblxuY2xhc3MgTm90SW1wbGVtZW50ZWRFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoXCJOb3QgaW1wbGVtZW50ZWRcIik7XG4gICAgfVxufVxuXG5jbGFzcyBDb2x1bW5Gcm9tUXVlcnkge1xuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgYWxpYXM6IHN0cmluZykge31cblxuICAgIHB1YmxpYyB0b1N0cmluZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYWxpYXM7XG4gICAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICBjb2x1bW5zOiB7IG5hbWU6IHN0cmluZyB9W107XG5cbiAgICB3aGVyZTogSVdoZXJlV2l0aE9wZXJhdG9yPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgYW5kV2hlcmU6IElXaGVyZVdpdGhPcGVyYXRvcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmU6IElXaGVyZVdpdGhPcGVyYXRvcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIHdoZXJlTm90OiBJV2hlcmU8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBzZWxlY3Q6IElTZWxlY3RXaXRoRnVuY3Rpb25Db2x1bW5zMzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIHNlbGVjdFF1ZXJ5OiBJU2VsZWN0UXVlcnk8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIG9yZGVyQnk6IElPcmRlckJ5PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgaW5uZXJKb2luQ29sdW1uOiBJS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGxlZnRPdXRlckpvaW5Db2x1bW46IElLZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZUNvbHVtbjogSVdoZXJlQ29tcGFyZVR3b0NvbHVtbnM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHdoZXJlTnVsbDogSUNvbHVtblBhcmFtZXRlck5vUm93VHJhbnNmb3JtYXRpb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdE51bGw6IElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU51bGw6IElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU5vdE51bGw6IElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBsZWZ0T3V0ZXJKb2luVGFibGVPbkZ1bmN0aW9uOiBJSm9pblRhYmxlTXVsdGlwbGVPbkNsYXVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgaW5uZXJKb2luVGFibGVPbkZ1bmN0aW9uOiBJSm9pblRhYmxlTXVsdGlwbGVPbkNsYXVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBpbm5lckpvaW46IElKb2luPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIGxlZnRPdXRlckpvaW46IElKb2luPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgc2VsZWN0QWxpYXM6IElTZWxlY3RBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBzZWxlY3RSYXc6IElTZWxlY3RSYXc8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBmaW5kQnlQcmltYXJ5S2V5OiBJRmluZEJ5UHJpbWFyeUtleTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIHdoZXJlSW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgd2hlcmVOb3RJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIG9yV2hlcmVJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlTm90SW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZUJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdEJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlQmV0d2VlbjogSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVOb3RCZXR3ZWVuOiBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZUV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBvcldoZXJlRXhpc3RzOiBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdEV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU5vdEV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZVBhcmVudGhlc2VzOiBJV2hlcmVQYXJlbnRoZXNlczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVQYXJlbnRoZXNlczogSVdoZXJlUGFyZW50aGVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGdyb3VwQnk6IElTZWxlY3RhYmxlQ29sdW1uS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nOiBJSGF2aW5nPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBoYXZpbmdOdWxsOiBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3ROdWxsOiBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGhhdmluZ0luOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGhhdmluZ05vdEluOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nRXhpc3RzOiBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3RFeGlzdHM6IElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nQmV0d2VlbjogSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGhhdmluZ05vdEJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHVuaW9uOiBJVW5pb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB1bmlvbkFsbDogSVVuaW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBtaW46IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgY291bnQ6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIGNvdW50RGlzdGluY3Q6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIG1heDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgc3VtOiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBzdW1EaXN0aW5jdDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgYXZnOiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBhdmdEaXN0aW5jdDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBpbnNlcnRTZWxlY3Q6IElJbnNlcnRTZWxlY3Q7XG5cbiAgICBpbnNlcnRJdGVtV2l0aFJldHVybmluZzogSUluc2VydEl0ZW1XaXRoUmV0dXJuaW5nPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgdXBkYXRlSXRlbVdpdGhSZXR1cm5pbmc6IElJbnNlcnRJdGVtV2l0aFJldHVybmluZzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgZ2V0Q29sdW1uQWxpYXMobmFtZTogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPik6IHN0cmluZztcbiAgICBnZXRDb2x1bW4obmFtZTogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPik6IENvbHVtbkZyb21RdWVyeTtcblxuICAgIGRpc3RpbmN0T24oY29sdW1uTmFtZXM6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj5bXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgY2xlYXJTZWxlY3QoKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIE1vZGVsPjtcbiAgICBjbGVhcldoZXJlKCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGNsZWFyT3JkZXIoKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBsaW1pdCh2YWx1ZTogbnVtYmVyKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb2Zmc2V0KHZhbHVlOiBudW1iZXIpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHVzZUtuZXhRdWVyeUJ1aWxkZXIoZjogKHF1ZXJ5OiBLbmV4LlF1ZXJ5QnVpbGRlcikgPT4gdm9pZCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGdldEtuZXhRdWVyeUJ1aWxkZXIoKTogS25leC5RdWVyeUJ1aWxkZXI7XG4gICAgdG9RdWVyeSgpOiBzdHJpbmc7XG5cbiAgICBnZXRGaXJzdE9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8KFJvdyBleHRlbmRzIE1vZGVsID8gUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+IDogUm93KSB8IG51bGw+O1xuICAgIGdldEZpcnN0T3JVbmRlZmluZWQoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdykgfCB1bmRlZmluZWQ+O1xuICAgIGdldEZpcnN0KGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTxSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdz47XG4gICAgZ2V0U2luZ2xlT3JOdWxsKGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTwoUm93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3cpIHwgbnVsbD47XG4gICAgZ2V0U2luZ2xlT3JVbmRlZmluZWQoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdykgfCB1bmRlZmluZWQ+O1xuICAgIGdldFNpbmdsZShmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8Um93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3c+O1xuICAgIGdldE1hbnkoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdylbXT47XG4gICAgZ2V0Q291bnQoKTogUHJvbWlzZTxudW1iZXIgfCBzdHJpbmc+O1xuICAgIGluc2VydEl0ZW0obmV3T2JqZWN0OiBQYXJ0aWFsQW5kVW5kZWZpbmVkPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4pOiBQcm9taXNlPHZvaWQ+O1xuICAgIGluc2VydEl0ZW1zKGl0ZW1zOiBQYXJ0aWFsQW5kVW5kZWZpbmVkPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj5bXSk6IFByb21pc2U8dm9pZD47XG4gICAgZGVsKCk6IFByb21pc2U8dm9pZD47XG4gICAgZGVsQnlQcmltYXJ5S2V5KHByaW1hcnlLZXlWYWx1ZTogYW55KTogUHJvbWlzZTx2b2lkPjtcbiAgICB1cGRhdGVJdGVtKGl0ZW06IFBhcnRpYWxBbmRVbmRlZmluZWQ8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+Pik6IFByb21pc2U8dm9pZD47XG4gICAgdXBkYXRlSXRlbUJ5UHJpbWFyeUtleShwcmltYXJ5S2V5VmFsdWU6IGFueSwgaXRlbTogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+KTogUHJvbWlzZTx2b2lkPjtcbiAgICB1cGRhdGVJdGVtc0J5UHJpbWFyeUtleShcbiAgICAgICAgaXRlbXM6IHtcbiAgICAgICAgICAgIHByaW1hcnlLZXlWYWx1ZTogYW55O1xuICAgICAgICAgICAgZGF0YTogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+O1xuICAgICAgICB9W11cbiAgICApOiBQcm9taXNlPHZvaWQ+O1xuICAgIGV4ZWN1dGUoKTogUHJvbWlzZTx2b2lkPjtcbiAgICB3aGVyZVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgaGF2aW5nUmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHRyYW5zYWN0aW5nKHRyeDogS25leC5UcmFuc2FjdGlvbik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgdHJ1bmNhdGUoKTogUHJvbWlzZTx2b2lkPjtcbiAgICBkaXN0aW5jdCgpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGNsb25lKCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgZ3JvdXBCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBvcmRlckJ5UmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGtlZXBGbGF0KCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBhbnk+O1xufVxuXG50eXBlIFJldHVybk5vbk9iamVjdHNOYW1lc09ubHk8VD4gPSB7IFtLIGluIGtleW9mIFRdOiBUW0tdIGV4dGVuZHMgU2VsZWN0YWJsZUNvbHVtblR5cGVzID8gSyA6IG5ldmVyIH1ba2V5b2YgVF07XG5cbnR5cGUgUmVtb3ZlT2JqZWN0c0Zyb208VD4gPSB7IFtQIGluIFJldHVybk5vbk9iamVjdHNOYW1lc09ubHk8VD5dOiBUW1BdIH07XG5cbmV4cG9ydCB0eXBlIE9iamVjdFRvUHJpbWl0aXZlPFQ+ID0gVCBleHRlbmRzIFN0cmluZyA/IHN0cmluZyA6IFQgZXh0ZW5kcyBOdW1iZXIgPyBudW1iZXIgOiBUIGV4dGVuZHMgQm9vbGVhbiA/IGJvb2xlYW4gOiBuZXZlcjtcblxuZXhwb3J0IHR5cGUgT3BlcmF0b3IgPSBcIj1cIiB8IFwiIT1cIiB8IFwiPlwiIHwgXCI8XCIgfCBzdHJpbmc7XG5cbmludGVyZmFjZSBJQ29uc3RydWN0b3I8VD4ge1xuICAgIG5ldyAoLi4uYXJnczogYW55W10pOiBUO1xufVxuXG5leHBvcnQgdHlwZSBBZGRQcm9wZXJ0eVdpdGhUeXBlPE9yaWdpbmFsLCBOZXdLZXkgZXh0ZW5kcyBrZXlvZiBhbnksIE5ld0tleVR5cGU+ID0gT3JpZ2luYWwgJiBOZXN0ZWRSZWNvcmQ8TmV3S2V5LCBOZXdLZXlUeXBlPjtcblxuaW50ZXJmYWNlIElJbnNlcnRJdGVtV2l0aFJldHVybmluZzxNb2RlbCwgX1NlbGVjdGFibGVNb2RlbCwgX1Jvdz4ge1xuICAgIChuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+Pik6IFByb21pc2U8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+PjtcbiAgICA8S2V5cyBleHRlbmRzIGtleW9mIFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4obmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4sIGtleXM6IEtleXNbXSk6IFByb21pc2U8UGljazxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4sIEtleXM+Pjtcbn1cblxuaW50ZXJmYWNlIElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5PbjxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICA8Q29uY2F0S2V5MSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4sIENvbmNhdEtleTIgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihcbiAgICAgICAga2V5MTogQ29uY2F0S2V5MSxcbiAgICAgICAgb3BlcmF0b3I6IE9wZXJhdG9yLFxuICAgICAgICBrZXkyOiBDb25jYXRLZXkyXG4gICAgKTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElKb2luT25WYWw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBvcGVyYXRvcjogT3BlcmF0b3IsIHZhbHVlOiBhbnkpOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuaW50ZXJmYWNlIElKb2luT25Nb2RlbFZhbDxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXksIG9wZXJhdG9yOiBPcGVyYXRvciwgdmFsdWU6IGFueSk6IElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSm9pbk9uTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8Sm9pbmVkTW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXkpOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuaW50ZXJmYWNlIElKb2luT25Nb2RlbE51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5KTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElKb2luT25QYXJlbnRoZXNlczxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICAob25GdW5jdGlvbjogKGpvaW46IElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD4pID0+IHZvaWQpOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5PblJhdzxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICAoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSk6IElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICBvbjogSUpvaW5PbjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT246IElKb2luT248TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBhbmRPbjogSUpvaW5PbjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9uVmFsOiBJSm9pbk9uVmFsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgYW5kT25WYWw6IElKb2luT25WYWw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvblF1ZXJ5VmFsOiBJSm9pbk9uTW9kZWxWYWw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvck9uVmFsOiBJSm9pbk9uVmFsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPblF1ZXJ5VmFsOiBJSm9pbk9uTW9kZWxWYWw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvbk51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25RdWVyeU51bGw6IElKb2luT25Nb2RlbE51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvck9uTnVsbDogSUpvaW5Pbk51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvck9uUXVlcnlOdWxsOiBJSm9pbk9uTW9kZWxOdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25Ob3ROdWxsOiBJSm9pbk9uTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9uUXVlcnlOb3ROdWxsOiBJSm9pbk9uTW9kZWxOdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPbk5vdE51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPblF1ZXJ5Tm90TnVsbDogSUpvaW5Pbk1vZGVsTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIGFuZE9uTm90TnVsbDogSUpvaW5Pbk51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBhbmRPbk51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25QYXJlbnRoZXNlczogSUpvaW5PblBhcmVudGhlc2VzPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgYW5kT25QYXJlbnRoZXNlczogSUpvaW5PblBhcmVudGhlc2VzPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPblBhcmVudGhlc2VzOiBJSm9pbk9uUGFyZW50aGVzZXM8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvblJhdzogSUpvaW5PblJhdzxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25SYXc6IElKb2luT25SYXc8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElJbnNlcnRTZWxlY3Qge1xuICAgIDxOZXdQcm9wZXJ0eVR5cGUsIENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxOZXdQcm9wZXJ0eVR5cGU+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxOZXdQcm9wZXJ0eVR5cGU+LCBcIlwiPj4oXG4gICAgICAgIG5ld1Byb3BlcnR5Q2xhc3M6IG5ldyAoKSA9PiBOZXdQcm9wZXJ0eVR5cGUsXG4gICAgICAgIC4uLmNvbHVtbk5hbWVzOiBDb25jYXRLZXlbXVxuICAgICk6IFByb21pc2U8dm9pZD47XG59XG5cbmludGVyZmFjZSBJSm9pblRhYmxlTXVsdGlwbGVPbkNsYXVzZXM8TW9kZWwsIF9TZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxOZXdQcm9wZXJ0eVR5cGUsIE5ld1Byb3BlcnR5S2V5IGV4dGVuZHMga2V5b2YgYW55PihcbiAgICAgICAgbmV3UHJvcGVydHlLZXk6IE5ld1Byb3BlcnR5S2V5LFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICBvbjogKGpvaW46IElKb2luT25DbGF1c2UyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBOZXdQcm9wZXJ0eVR5cGU+KSA9PiB2b2lkXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93PjtcblxuICAgIDxOZXdQcm9wZXJ0eVR5cGUsIE5ld1Byb3BlcnR5S2V5IGV4dGVuZHMga2V5b2YgYW55PihcbiAgICAgICAgbmV3UHJvcGVydHlLZXk6IE5ld1Byb3BlcnR5S2V5LFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICBncmFudWxhcml0eTogR3JhbnVsYXJpdHksXG4gICAgICAgIG9uOiAoam9pbjogSUpvaW5PbkNsYXVzZTI8QWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIE5ld1Byb3BlcnR5VHlwZT4pID0+IHZvaWRcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8QWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW48TW9kZWwsIF9TZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxOZXdQcm9wZXJ0eVR5cGUsIE5ld1Byb3BlcnR5S2V5IGV4dGVuZHMga2V5b2YgYW55LCBDb25jYXRLZXkyIGV4dGVuZHMga2V5b2YgTmV3UHJvcGVydHlUeXBlLCBDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihcbiAgICAgICAgbmV3UHJvcGVydHlLZXk6IE5ld1Byb3BlcnR5S2V5LFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICBrZXk6IENvbmNhdEtleTIsXG4gICAgICAgIG9wZXJhdG9yOiBPcGVyYXRvcixcbiAgICAgICAga2V5MjogQ29uY2F0S2V5XG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93PjtcblxuICAgIDxOZXdQcm9wZXJ0eVR5cGUsIE5ld1Byb3BlcnR5S2V5IGV4dGVuZHMga2V5b2YgYW55LCBDb25jYXRLZXkyIGV4dGVuZHMga2V5b2YgTmV3UHJvcGVydHlUeXBlLCBDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihcbiAgICAgICAgbmV3UHJvcGVydHlLZXk6IE5ld1Byb3BlcnR5S2V5LFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICBncmFudWxhcml0eTogR3JhbnVsYXJpdHksXG4gICAgICAgIGtleTogQ29uY2F0S2V5MixcbiAgICAgICAgb3BlcmF0b3I6IE9wZXJhdG9yLFxuICAgICAgICBrZXkyOiBDb25jYXRLZXlcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8QWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVNlbGVjdEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwgXCJcIj4sIFROYW1lIGV4dGVuZHMga2V5b2YgYW55PihhbGlhczogVE5hbWUsIGNvbHVtbk5hbWU6IENvbmNhdEtleSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxcbiAgICAgICAgTW9kZWwsXG4gICAgICAgIFNlbGVjdGFibGVNb2RlbCxcbiAgICAgICAgUmVjb3JkPFROYW1lLCBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8U2VsZWN0YWJsZU1vZGVsLCBDb25jYXRLZXk+PiAmIFJvd1xuICAgID47XG59XG5cbmludGVyZmFjZSBJU2VsZWN0UmF3PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxUUmV0dXJuIGV4dGVuZHMgQm9vbGVhbiB8IFN0cmluZyB8IE51bWJlciwgVE5hbWUgZXh0ZW5kcyBrZXlvZiBhbnk+KG5hbWU6IFROYW1lLCByZXR1cm5UeXBlOiBJQ29uc3RydWN0b3I8VFJldHVybj4sIHF1ZXJ5OiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxcbiAgICAgICAgTW9kZWwsXG4gICAgICAgIFNlbGVjdGFibGVNb2RlbCxcbiAgICAgICAgUmVjb3JkPFROYW1lLCBPYmplY3RUb1ByaW1pdGl2ZTxUUmV0dXJuPj4gJiBSb3dcbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSVNlbGVjdFF1ZXJ5PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxUUmV0dXJuIGV4dGVuZHMgQm9vbGVhbiB8IFN0cmluZyB8IE51bWJlciwgVE5hbWUgZXh0ZW5kcyBrZXlvZiBhbnksIFN1YlF1ZXJ5TW9kZWw+KFxuICAgICAgICBuYW1lOiBUTmFtZSxcbiAgICAgICAgcmV0dXJuVHlwZTogSUNvbnN0cnVjdG9yPFRSZXR1cm4+LFxuICAgICAgICBzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCxcbiAgICAgICAgY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8U3ViUXVlcnlNb2RlbCwgU3ViUXVlcnlNb2RlbCwge30+LCBwYXJlbnQ6IFRyYW5zZm9ybVByb3BzVG9GdW5jdGlvbnNSZXR1cm5Qcm9wZXJ0eU5hbWU8TW9kZWw+KSA9PiB2b2lkLFxuICAgICAgICBncmFudWxhcml0eT86IEdyYW51bGFyaXR5XG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJlY29yZDxUTmFtZSwgT2JqZWN0VG9QcmltaXRpdmU8VFJldHVybj4+ICYgUm93Pjtcbn1cblxudHlwZSBUcmFuc2Zvcm1Qcm9wc1RvRnVuY3Rpb25zUmV0dXJuUHJvcGVydHlOYW1lPE1vZGVsPiA9IHtcbiAgICBbUCBpbiBrZXlvZiBNb2RlbF06IE1vZGVsW1BdIGV4dGVuZHMgb2JqZWN0ID8gKE1vZGVsW1BdIGV4dGVuZHMgUmVxdWlyZWQ8Tm9uRm9yZWlnbktleU9iamVjdHM+ID8gKCkgPT4gUCA6IFRyYW5zZm9ybVByb3BzVG9GdW5jdGlvbnNSZXR1cm5Qcm9wZXJ0eU5hbWU8TW9kZWxbUF0+KSA6ICgpID0+IFA7XG59O1xuXG5pbnRlcmZhY2UgSU9yZGVyQnk8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBcIlwiPiwgVE5hbWUgZXh0ZW5kcyBrZXlvZiBhbnk+KFxuICAgICAgICBjb2x1bW5OYW1lczogQ29uY2F0S2V5LFxuICAgICAgICBkaXJlY3Rpb24/OiBcImFzY1wiIHwgXCJkZXNjXCJcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93ICYgUmVjb3JkPFROYW1lLCBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8U2VsZWN0YWJsZU1vZGVsLCBDb25jYXRLZXk+Pj47XG59XG5cbmludGVyZmFjZSBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIFwiXCI+LCBUTmFtZSBleHRlbmRzIGtleW9mIGFueT4oY29sdW1uTmFtZXM6IENvbmNhdEtleSwgbmFtZTogVE5hbWUpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJvdyAmIFJlY29yZDxUTmFtZSwgR2V0TmVzdGVkUHJvcGVydHlUeXBlPFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj5cbiAgICA+O1xufVxuXG50eXBlIFVuaW9uVG9JbnRlcnNlY3Rpb248VT4gPSAoVSBleHRlbmRzIGFueSA/IChrOiBVKSA9PiB2b2lkIDogbmV2ZXIpIGV4dGVuZHMgKGs6IGluZmVyIEkpID0+IHZvaWQgPyBJIDogbmV2ZXI7XG5cbmludGVyZmFjZSBJU2VsZWN0V2l0aEZ1bmN0aW9uQ29sdW1uczM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBcIlwiPj4oLi4uY29sdW1uTmFtZXM6IENvbmNhdEtleVtdKTogSVR5cGVkUXVlcnlCdWlsZGVyPFxuICAgICAgICBNb2RlbCxcbiAgICAgICAgU2VsZWN0YWJsZU1vZGVsLFxuICAgICAgICBSb3cgJiBVbmlvblRvSW50ZXJzZWN0aW9uPEdldE5lc3RlZFByb3BlcnR5PFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj5cbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSUZpbmRCeVByaW1hcnlLZXk8X01vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwgXCJcIj4+KHByaW1hcnlLZXlWYWx1ZTogYW55LCAuLi5jb2x1bW5OYW1lczogQ29uY2F0S2V5W10pOiBQcm9taXNlPFxuICAgICAgICAoUm93ICYgVW5pb25Ub0ludGVyc2VjdGlvbjxHZXROZXN0ZWRQcm9wZXJ0eTxTZWxlY3RhYmxlTW9kZWwsIENvbmNhdEtleT4+KSB8IHVuZGVmaW5lZFxuICAgID47XG59XG5cbmludGVyZmFjZSBJS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkRm9yZWlnbktleUtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBncmFudWxhcml0eT86IEdyYW51bGFyaXR5KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmU8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCB2YWx1ZTogR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmVXaXRoT3BlcmF0b3I8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCB2YWx1ZTogR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXksIG9wZXJhdG9yOiBPcGVyYXRvciwgdmFsdWU6IEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5Pik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxcbiAgICAgICAgTW9kZWwsXG4gICAgICAgIFNlbGVjdGFibGVNb2RlbCxcbiAgICAgICAgUm93XG4gICAgPjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgdmFsdWU6IEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5PltdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+LCBQcm9wZXJ0eVR5cGUgZXh0ZW5kcyBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT4+KFxuICAgICAgICBrZXk6IENvbmNhdEtleSxcbiAgICAgICAgdmFsdWU6IFtQcm9wZXJ0eVR5cGUsIFByb3BlcnR5VHlwZV1cbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElIYXZpbmc8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBvcGVyYXRvcjogT3BlcmF0b3IsIHZhbHVlOiBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT4pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJvd1xuICAgID47XG59XG5cbmludGVyZmFjZSBJV2hlcmVDb21wYXJlVHdvQ29sdW1uczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8X1Byb3BlcnR5VHlwZTEsIF9Qcm9wZXJ0eVR5cGUyLCBNb2RlbDI+KFxuICAgICAgICBrZXkxOiBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+LFxuICAgICAgICBvcGVyYXRvcjogT3BlcmF0b3IsXG4gICAgICAgIGtleTI6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbDI+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbDI+LCBcIlwiPlxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgKGtleTE6IENvbHVtbkZyb21RdWVyeSwgb3BlcmF0b3I6IE9wZXJhdG9yLCBrZXkyOiBDb2x1bW5Gcm9tUXVlcnkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8U3ViUXVlcnlNb2RlbD4oXG4gICAgICAgIHN1YlF1ZXJ5TW9kZWw6IG5ldyAoKSA9PiBTdWJRdWVyeU1vZGVsLFxuICAgICAgICBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4sIHBhcmVudDogVHJhbnNmb3JtUHJvcHNUb0Z1bmN0aW9uc1JldHVyblByb3BlcnR5TmFtZTxTZWxlY3RhYmxlTW9kZWw+KSA9PiB2b2lkXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICA8U3ViUXVlcnlNb2RlbD4oXG4gICAgICAgIHN1YlF1ZXJ5TW9kZWw6IG5ldyAoKSA9PiBTdWJRdWVyeU1vZGVsLFxuICAgICAgICBncmFudWxhcml0eTogR3JhbnVsYXJpdHksXG4gICAgICAgIGNvZGU6IChzdWJRdWVyeTogSVR5cGVkUXVlcnlCdWlsZGVyPFN1YlF1ZXJ5TW9kZWwsIFN1YlF1ZXJ5TW9kZWwsIHt9PiwgcGFyZW50OiBUcmFuc2Zvcm1Qcm9wc1RvRnVuY3Rpb25zUmV0dXJuUHJvcGVydHlOYW1lPFNlbGVjdGFibGVNb2RlbD4pID0+IHZvaWRcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZVBhcmVudGhlc2VzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIChjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+KSA9PiB2b2lkKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJVW5pb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPFN1YlF1ZXJ5TW9kZWw+KHN1YlF1ZXJ5TW9kZWw6IG5ldyAoKSA9PiBTdWJRdWVyeU1vZGVsLCBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4pID0+IHZvaWQpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIDxTdWJRdWVyeU1vZGVsPihzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCwgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LCBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4pID0+IHZvaWQpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuZXhwb3J0IHR5cGUgR3JhbnVsYXJpdHkgPSBcIlBBR0xPQ0tcIiB8IFwiTk9MT0NLXCIgfCBcIlJFQURDT01NSVRURURMT0NLXCIgfCBcIlJPV0xPQ0tcIiB8IFwiVEFCTE9DS1wiIHwgXCJUQUJMT0NLWFwiO1xuXG5mdW5jdGlvbiBnZXRQcm94eUFuZE1lbW9yaWVzPE1vZGVsVHlwZSwgUm93Pih0eXBlZFF1ZXJ5QnVpbGRlcj86IFR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsVHlwZSwgUm93Pikge1xuICAgIGNvbnN0IG1lbW9yaWVzID0gW10gYXMgc3RyaW5nW107XG5cbiAgICBmdW5jdGlvbiBhbGxHZXQoX3RhcmdldDogYW55LCBuYW1lOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAobmFtZSA9PT0gXCJtZW1vcmllc1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gbWVtb3JpZXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmFtZSA9PT0gXCJnZXRDb2x1bW5OYW1lXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0eXBlZFF1ZXJ5QnVpbGRlciEuZ2V0Q29sdW1uTmFtZSguLi5tZW1vcmllcyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIG1lbW9yaWVzLnB1c2gobmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm94eShcbiAgICAgICAgICAgIHt9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGdldDogYWxsR2V0LFxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHJvb3QgPSBuZXcgUHJveHkoXG4gICAgICAgIHt9LFxuICAgICAgICB7XG4gICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICByZXR1cm4geyByb290LCBtZW1vcmllcyB9O1xufVxuXG5mdW5jdGlvbiBnZXRQcm94eUFuZE1lbW9yaWVzRm9yQXJyYXk8TW9kZWxUeXBlLCBSb3c+KHR5cGVkUXVlcnlCdWlsZGVyPzogVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBSb3c+KSB7XG4gICAgY29uc3QgcmVzdWx0ID0gW10gYXMgc3RyaW5nW11bXTtcblxuICAgIGxldCBjb3VudGVyID0gLTE7XG5cbiAgICBmdW5jdGlvbiBhbGxHZXQoX3RhcmdldDogYW55LCBuYW1lOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAoX3RhcmdldC5sZXZlbCA9PT0gMCkge1xuICAgICAgICAgICAgY291bnRlcisrO1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goW10pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChuYW1lID09PSBcIm1lbW9yaWVzXCIpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRbY291bnRlcl07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwicmVzdWx0XCIpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwibGV2ZWxcIikge1xuICAgICAgICAgICAgcmV0dXJuIF90YXJnZXQubGV2ZWw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwiZ2V0Q29sdW1uTmFtZVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZWRRdWVyeUJ1aWxkZXIhLmdldENvbHVtbk5hbWUoLi4ucmVzdWx0W2NvdW50ZXJdKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJlc3VsdFtjb3VudGVyXS5wdXNoKG5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJveHkoXG4gICAgICAgICAgICB7fSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCByb290ID0gbmV3IFByb3h5KFxuICAgICAgICB7IGxldmVsOiAwIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIGdldDogYWxsR2V0LFxuICAgICAgICB9XG4gICAgKTtcblxuICAgIHJldHVybiB7IHJvb3QsIHJlc3VsdCB9O1xufVxuXG5leHBvcnQgY2xhc3MgVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyA9IHt9PiBpbXBsZW1lbnRzIElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbFR5cGUsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgcHVibGljIGNvbHVtbnM6IHsgbmFtZTogc3RyaW5nIH1bXTtcblxuICAgIHB1YmxpYyBvbmx5TG9nUXVlcnkgPSBmYWxzZTtcbiAgICBwdWJsaWMgcXVlcnlMb2cgPSBcIlwiO1xuICAgIHByaXZhdGUgaGFzU2VsZWN0Q2xhdXNlID0gZmFsc2U7XG5cbiAgICBwcml2YXRlIHF1ZXJ5QnVpbGRlcjogS25leC5RdWVyeUJ1aWxkZXI7XG4gICAgcHJpdmF0ZSB0YWJsZU5hbWU6IHN0cmluZztcbiAgICBwcml2YXRlIHNob3VsZFVuZmxhdHRlbjogYm9vbGVhbjtcbiAgICBwcml2YXRlIGV4dHJhSm9pbmVkUHJvcGVydGllczoge1xuICAgICAgICBuYW1lOiBzdHJpbmc7XG4gICAgICAgIHByb3BlcnR5VHlwZTogbmV3ICgpID0+IGFueTtcbiAgICB9W107XG5cbiAgICBwcml2YXRlIHRyYW5zYWN0aW9uPzogS25leC5UcmFuc2FjdGlvbjtcblxuICAgIHByaXZhdGUgc3ViUXVlcnlDb3VudGVyID0gMDtcblxuICAgIHByaXZhdGUgZ3JhbnVsYXJpdHlTZXQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxHcmFudWxhcml0eT4oW1wiTk9MT0NLXCIsIFwiUEFHTE9DS1wiLCBcIlJFQURDT01NSVRURURMT0NLXCIsIFwiUk9XTE9DS1wiLCBcIlRBQkxPQ0tcIiwgXCJUQUJMT0NLWFwiXSk7XG5cbiAgICBjb25zdHJ1Y3RvcihcbiAgICAgICAgcHJpdmF0ZSB0YWJsZUNsYXNzOiBuZXcgKCkgPT4gTW9kZWxUeXBlLFxuICAgICAgICBwcml2YXRlIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCxcbiAgICAgICAgcHJpdmF0ZSBrbmV4OiBLbmV4LFxuICAgICAgICBxdWVyeUJ1aWxkZXI/OiBLbmV4LlF1ZXJ5QnVpbGRlcixcbiAgICAgICAgcHJpdmF0ZSBwYXJlbnRUeXBlZFF1ZXJ5QnVpbGRlcj86IGFueSxcbiAgICAgICAgcHJpdmF0ZSBzdWJRdWVyeVByZWZpeD86IHN0cmluZ1xuICAgICkge1xuICAgICAgICB0aGlzLnRhYmxlTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZUNsYXNzKTtcbiAgICAgICAgdGhpcy5jb2x1bW5zID0gZ2V0Q29sdW1uUHJvcGVydGllcyh0YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcbiAgICAgICAgaWYgKHF1ZXJ5QnVpbGRlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlciA9IHF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICh0aGlzLnN1YlF1ZXJ5UHJlZml4KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZnJvbSh0aGlzLmtuZXgucmF3KGA/PyBhcyA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGhpcy50YWJsZU5hbWUsIGAke3RoaXMuc3ViUXVlcnlQcmVmaXh9JHt0aGlzLnRhYmxlTmFtZX1gXSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5mcm9tKHRoaXMua25leC5yYXcoYD8/JHtncmFudWxhcml0eVF1ZXJ5fWAsIFt0aGlzLnRhYmxlTmFtZV0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyID0gdGhpcy5rbmV4LmZyb20odGhpcy5rbmV4LnJhdyhgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RoaXMudGFibGVOYW1lXSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMgPSBbXTtcbiAgICAgICAgdGhpcy5zaG91bGRVbmZsYXR0ZW4gPSB0cnVlO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXROZXh0U3ViUXVlcnlQcmVmaXgoKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn1zdWJxdWVyeSR7dGhpcy5zdWJRdWVyeUNvdW50ZXJ9JGA7XG4gICAgICAgIHRoaXMuc3ViUXVlcnlDb3VudGVyKys7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgcHVibGljIGtlZXBGbGF0KCkge1xuICAgICAgICB0aGlzLnNob3VsZFVuZmxhdHRlbiA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q29sdW1uQWxpYXMobmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmtuZXgucmF3KFwiPz9cIiwgdGhpcy5nZXRDb2x1bW5OYW1lKC4uLm5hbWUuc3BsaXQoXCIuXCIpKSkudG9RdWVyeSgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRDb2x1bW4obmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ29sdW1uRnJvbVF1ZXJ5KHRoaXMuZ2V0Q29sdW1uQWxpYXMobmFtZSkpO1xuICAgIH1cblxuICAgIHB1YmxpYyBkaXN0aW5jdE9uKGNvbHVtbk5hbWVzOiBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWxUeXBlPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWxUeXBlPiwgXCJcIj5bXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbFR5cGUsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgICAgIGNvbnN0IG1hcHBlZENvbHVtbk5hbWVzID0gY29sdW1uTmFtZXMubWFwKChjb2x1bW5OYW1lKSA9PiB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uTmFtZS5zcGxpdChcIi5cIikpKTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZGlzdGluY3RPbihtYXBwZWRDb2x1bW5OYW1lcyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBkZWwoKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyLmRlbCgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBkZWxCeVByaW1hcnlLZXkodmFsdWU6IGFueSkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlci5kZWwoKS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKHZhbHVlKSk7XG4gICAgfVxuXG4gICAgcHVibGljIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+Pik6IFByb21pc2U8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj47XG4gICAgcHVibGljIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nPEtleXMgZXh0ZW5kcyBrZXlvZiBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+PihuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4sIGtleXM6IEtleXNbXSk6IFByb21pc2U8UGljazxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+LCBLZXlzPj47XG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+PiwgcmV0dXJuUHJvcGVydGllcz86IChrZXlvZiBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+KVtdKSB7XG4gICAgICAgIGxldCBpdGVtID0gbmV3T2JqZWN0O1xuICAgICAgICBpZiAoYmVmb3JlVXBkYXRlVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICBpdGVtID0gYmVmb3JlVXBkYXRlVHJhbnNmb3JtKG5ld09iamVjdCwgdGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tYXBQcm9wZXJ0aWVzVG9Db2x1bW5zKGl0ZW0pO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIudXBkYXRlKGl0ZW0pO1xuICAgICAgICBpZiAocmV0dXJuUHJvcGVydGllcykge1xuICAgICAgICAgICAgY29uc3QgbWFwcGVkTmFtZXMgPSByZXR1cm5Qcm9wZXJ0aWVzLm1hcCgoY29sdW1uTmFtZSkgPT4gdGhpcy5nZXRDb2x1bW5OYW1lKGNvbHVtbk5hbWUgYXMgc3RyaW5nKSk7XG4gICAgICAgICAgICBxdWVyeS5yZXR1cm5pbmcobWFwcGVkTmFtZXMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKFwiKlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuXG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gKGF3YWl0IHF1ZXJ5KSBhcyBhbnk7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gcm93c1swXTtcblxuICAgICAgICAgICAgdGhpcy5tYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW0pO1xuICAgICAgICAgICAgdGhpcy5hcHBseVRlbXBvcmFsQ29udmVyc2lvbnNGb3JSZWFkKGl0ZW0pO1xuXG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pOiBQcm9taXNlPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+O1xuICAgIHB1YmxpYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZzxLZXlzIGV4dGVuZHMga2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4obmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+LCBrZXlzOiBLZXlzW10pOiBQcm9taXNlPFBpY2s8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPiwgS2V5cz4+O1xuICAgIHB1YmxpYyBhc3luYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4sIHJldHVyblByb3BlcnRpZXM/OiAoa2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPilbXSkge1xuICAgICAgICBsZXQgaXRlbSA9IG5ld09iamVjdDtcbiAgICAgICAgaWYgKGJlZm9yZUluc2VydFRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZUluc2VydFRyYW5zZm9ybShuZXdPYmplY3QsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyh0aGlzLnRhYmxlQ2xhc3MpO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuaW5zZXJ0KGl0ZW0pO1xuICAgICAgICBpZiAocmV0dXJuUHJvcGVydGllcykge1xuICAgICAgICAgICAgY29uc3QgbWFwcGVkTmFtZXMgPSByZXR1cm5Qcm9wZXJ0aWVzLm1hcCgoY29sdW1uTmFtZSkgPT4gdGhpcy5nZXRDb2x1bW5OYW1lKGNvbHVtbk5hbWUgYXMgc3RyaW5nKSk7XG4gICAgICAgICAgICBxdWVyeS5yZXR1cm5pbmcobWFwcGVkTmFtZXMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKFwiKlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuXG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgcXVlcnk7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gcm93c1swXTtcblxuICAgICAgICAgICAgdGhpcy5tYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW0pO1xuICAgICAgICAgICAgdGhpcy5hcHBseVRlbXBvcmFsQ29udmVyc2lvbnNGb3JSZWFkKGl0ZW0pO1xuXG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBpbnNlcnRJdGVtKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+Pikge1xuICAgICAgICBhd2FpdCB0aGlzLmluc2VydEl0ZW1zKFtuZXdPYmplY3RdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgaW5zZXJ0SXRlbXMoaXRlbXM6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj5bXSkge1xuICAgICAgICBpdGVtcyA9IFsuLi5pdGVtc107XG5cbiAgICAgICAgaWYgKGJlZm9yZUluc2VydFRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbXMgPSBpdGVtcy5tYXAoKGl0ZW0pID0+IGJlZm9yZUluc2VydFRyYW5zZm9ybSEoaXRlbSwgdGhpcykpO1xuICAgICAgICB9XG5cbiAgICAgICAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4gdGhpcy5tYXBQcm9wZXJ0aWVzVG9Db2x1bW5zKGl0ZW0pKTtcblxuICAgICAgICB3aGlsZSAoaXRlbXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgY2h1bmsgPSBpdGVtcy5zcGxpY2UoMCwgNTAwKTtcbiAgICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuY2xvbmUoKS5pbnNlcnQoY2h1bmspO1xuICAgICAgICAgICAgaWYgKHRoaXMudHJhbnNhY3Rpb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHF1ZXJ5LnRyYW5zYWN0aW5nKHRoaXMudHJhbnNhY3Rpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBxdWVyeTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVJdGVtKGl0ZW06IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pIHtcbiAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKTtcbiAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5TG9nICs9IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXIudXBkYXRlKGl0ZW0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZUl0ZW1CeVByaW1hcnlLZXkocHJpbWFyeUtleVZhbHVlOiBhbnksIGl0ZW06IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pIHtcbiAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKTtcblxuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKHByaW1hcnlLZXlWYWx1ZSkpO1xuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgcXVlcnk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdXBkYXRlSXRlbXNCeVByaW1hcnlLZXkoXG4gICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICBwcmltYXJ5S2V5VmFsdWU6IGFueTtcbiAgICAgICAgICAgIGRhdGE6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj47XG4gICAgICAgIH1bXVxuICAgICkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBpdGVtcyA9IFsuLi5pdGVtc107XG4gICAgICAgIHdoaWxlIChpdGVtcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBjaHVuayA9IGl0ZW1zLnNwbGljZSgwLCA1MDApO1xuXG4gICAgICAgICAgICBsZXQgc3FsID0gXCJcIjtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBjaHVuaykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuY2xvbmUoKTtcbiAgICAgICAgICAgICAgICBpZiAoYmVmb3JlVXBkYXRlVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgICAgIGl0ZW0uZGF0YSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLmRhdGEsIHRoaXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLm1hcFByb3BlcnRpZXNUb0NvbHVtbnMoaXRlbS5kYXRhKTtcblxuICAgICAgICAgICAgICAgIHF1ZXJ5LnVwZGF0ZShpdGVtLmRhdGEpO1xuICAgICAgICAgICAgICAgIHNxbCArPSBxdWVyeS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKGl0ZW0ucHJpbWFyeUtleVZhbHVlKSkudG9TdHJpbmcoKS5yZXBsYWNlKFwiP1wiLCBcIlxcXFw/XCIpICsgXCI7XFxuXCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGZpbmFsUXVlcnkgPSB0aGlzLmtuZXgucmF3KHNxbCk7XG4gICAgICAgICAgICBpZiAodGhpcy50cmFuc2FjdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgZmluYWxRdWVyeS50cmFuc2FjdGluZyh0aGlzLnRyYW5zYWN0aW9uKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBmaW5hbFF1ZXJ5LnRvUXVlcnkoKSArIFwiXFxuXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGF3YWl0IGZpbmFsUXVlcnk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZXhlY3V0ZSgpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgfVxuXG4gICAgcHVibGljIGxpbWl0KHZhbHVlOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIubGltaXQodmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIG9mZnNldCh2YWx1ZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLm9mZnNldCh2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZmluZEJ5SWQoaWQ6IHN0cmluZywgY29sdW1uczogKGtleW9mIE1vZGVsVHlwZSlbXSkge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXJcbiAgICAgICAgICAgIC5zZWxlY3QoY29sdW1ucyBhcyBhbnkpXG4gICAgICAgICAgICAud2hlcmUodGhpcy50YWJsZU5hbWUgKyBcIi5pZFwiLCBpZClcbiAgICAgICAgICAgIC5maXJzdCgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRDb3VudCgpIHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJ5QnVpbGRlci5jb3VudCh7IGNvdW50OiBcIipcIiB9KTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcXVlcnk7XG4gICAgICAgIGlmIChyZXN1bHQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLmNvdW50O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRGaXJzdE9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZsYXR0ZW5CeU9wdGlvbihpdGVtc1swXSwgZmxhdHRlbk9wdGlvbik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHVibGljIGFzeW5jIGdldEZpcnN0T3JVbmRlZmluZWQoKSB7XG4gICAgICAgIGNvbnN0IGZpcnN0T3JOdWxsUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRGaXJzdE9yTnVsbCgpO1xuICAgICAgICBpZiAoZmlyc3RPck51bGxSZXN1bHQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpcnN0T3JOdWxsUmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRGaXJzdChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSXRlbSBub3QgZm91bmQuXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXNbMF0sIGZsYXR0ZW5PcHRpb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGdldFNpbmdsZU9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGl0ZW1zLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1vcmUgdGhhbiBvbmUgaXRlbSBmb3VuZDogJHtpdGVtcy5sZW5ndGh9LmApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmxhdHRlbkJ5T3B0aW9uKGl0ZW1zWzBdLCBmbGF0dGVuT3B0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRTaW5nbGVPclVuZGVmaW5lZCgpIHtcbiAgICAgICAgY29uc3Qgc2luZ2xlT3JOdWxsUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRTaW5nbGVPck51bGwoKTtcbiAgICAgICAgaWYgKHNpbmdsZU9yTnVsbFJlc3VsdCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2luZ2xlT3JOdWxsUmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRTaW5nbGUoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAoIWl0ZW1zIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkl0ZW0gbm90IGZvdW5kLlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXRlbXMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTW9yZSB0aGFuIG9uZSBpdGVtIGZvdW5kOiAke2l0ZW1zLmxlbmd0aH0uYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXNbMF0sIGZsYXR0ZW5PcHRpb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHNlbGVjdENvbHVtbigpIHtcbiAgICAgICAgdGhpcy5oYXNTZWxlY3RDbGF1c2UgPSB0cnVlO1xuICAgICAgICBsZXQgY2FsbGVkQXJndW1lbnRzID0gW10gYXMgc3RyaW5nW107XG5cbiAgICAgICAgZnVuY3Rpb24gc2F2ZUFyZ3VtZW50cyguLi5hcmdzOiBzdHJpbmdbXSkge1xuICAgICAgICAgICAgY2FsbGVkQXJndW1lbnRzID0gYXJncztcbiAgICAgICAgfVxuXG4gICAgICAgIGFyZ3VtZW50c1swXShzYXZlQXJndW1lbnRzKTtcblxuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5zZWxlY3QodGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNhbGxlZEFyZ3VtZW50cykgKyBcIiBhcyBcIiArIHRoaXMuZ2V0Q29sdW1uU2VsZWN0QWxpYXMoLi4uY2FsbGVkQXJndW1lbnRzKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGY6IGFueSkge1xuICAgICAgICBjb25zdCB7IHJvb3QsIHJlc3VsdCB9ID0gZ2V0UHJveHlBbmRNZW1vcmllc0ZvckFycmF5KCk7XG5cbiAgICAgICAgZihyb290KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3QyKCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMF07XG5cbiAgICAgICAgY29uc3QgY29sdW1uQXJndW1lbnRzTGlzdCA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uMyhmKTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNvbHVtbkFyZ3VtZW50cyBvZiBjb2x1bW5Bcmd1bWVudHNMaXN0KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5zZWxlY3QodGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cykgKyBcIiBhcyBcIiArIHRoaXMuZ2V0Q29sdW1uU2VsZWN0QWxpYXMoLi4uY29sdW1uQXJndW1lbnRzKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3QoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50c0xpc3Q6IHN0cmluZ1tdW107XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhcmd1bWVudHNbMF0gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50c0xpc3QgPSBbLi4uYXJndW1lbnRzXS5tYXAoKGNvbmNhdEtleTogc3RyaW5nKSA9PiBjb25jYXRLZXkuc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMF07XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5Bcmd1bWVudHMgb2YgY29sdW1uQXJndW1lbnRzTGlzdCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JkZXJCeSgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIub3JkZXJCeSh0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXNGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pLCBhcmd1bWVudHNbMV0pO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0TWFueShmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8KFJvdyBleHRlbmRzIE1vZGVsVHlwZSA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4gOiBSb3cpW10+IHtcbiAgICAgICAgLy8gYXR0YWNoIGFueSBkZWZhdWx0IGxvY2tzIHRvIHRoZSBxdWVyeSBpZiB0aGV5IGFyZSBub3Qgc3BlY2lmaWVkXG5cbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXMsIGZsYXR0ZW5PcHRpb24pIGFzIChSb3cgZXh0ZW5kcyBNb2RlbFR5cGUgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+IDogUm93KVtdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHNlbGVjdEFsaWFzKCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50cyA9IGFyZ3VtZW50c1sxXS5zcGxpdChcIi5cIik7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KGAke3RoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpfSBhcyAke2FyZ3VtZW50c1swXX1gKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3RSYXcoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgW25hbWUsIF8sIHF1ZXJ5LCAuLi5iaW5kaW5nc10gPSBBcnJheS5mcm9tKGFyZ3VtZW50cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMua25leC5yYXcoYCgke3F1ZXJ5fSkgYXMgXCIke25hbWV9XCJgLCBiaW5kaW5ncykpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pbkNvbHVtbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbkNvbHVtbihcImlubmVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuICAgIHB1YmxpYyBsZWZ0T3V0ZXJKb2luQ29sdW1uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5qb2luQ29sdW1uKFwibGVmdE91dGVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pblRhYmxlKCkge1xuICAgICAgICBjb25zdCBuZXdQcm9wZXJ0eUtleSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgbmV3UHJvcGVydHlUeXBlID0gYXJndW1lbnRzWzFdO1xuICAgICAgICBjb25zdCBjb2x1bW4xUGFydHMgPSBhcmd1bWVudHNbMl07XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBjb2x1bW4yUGFydHMgPSBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMucHVzaCh7XG4gICAgICAgICAgICBuYW1lOiBuZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgICAgIHByb3BlcnR5VHlwZTogbmV3UHJvcGVydHlUeXBlLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkNsYXNzID0gbmV3UHJvcGVydHlUeXBlO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXMgPSBuZXdQcm9wZXJ0eUtleTtcblxuICAgICAgICBjb25zdCB0YWJsZTFDb2x1bW4gPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMVBhcnRzKTtcbiAgICAgICAgY29uc3QgdGFibGUyQ29sdW1uID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbjJQYXJ0cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luKGAke3RhYmxlVG9Kb2luTmFtZX0gYXMgJHt0YWJsZVRvSm9pbkFsaWFzfWAsIHRhYmxlMUNvbHVtbiwgb3BlcmF0b3IsIHRhYmxlMkNvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pbigpIHtcbiAgICAgICAgY29uc3QgY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPSB0aGlzLmdyYW51bGFyaXR5U2V0Lmhhcyhhcmd1bWVudHNbMl0pO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1sxXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzRdIDogYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nID0gY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPyBhcmd1bWVudHNbNV0gOiBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcImlubmVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgZ3JhbnVsYXJpdHksIGpvaW5UYWJsZUNvbHVtblN0cmluZywgb3BlcmF0b3IsIGV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmcpO1xuICAgIH1cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pbigpIHtcbiAgICAgICAgY29uc3QgY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPSB0aGlzLmdyYW51bGFyaXR5U2V0Lmhhcyhhcmd1bWVudHNbMl0pO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1sxXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzRdIDogYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nID0gY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPyBhcmd1bWVudHNbNV0gOiBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcImxlZnRPdXRlckpvaW5cIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0sIGdyYW51bGFyaXR5LCBqb2luVGFibGVDb2x1bW5TdHJpbmcsIG9wZXJhdG9yLCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5uZXJKb2luVGFibGVPbkZ1bmN0aW9uKCkge1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMl0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzJdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzFdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3Qgb24gPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmpvaW5UYWJsZU9uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgZ3JhbnVsYXJpdHksIG9uKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pblRhYmxlT25GdW5jdGlvbigpIHtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1sxXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IG9uID0gdHlwZW9mIGFyZ3VtZW50c1syXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1szXSA6IGFyZ3VtZW50c1syXTtcblxuICAgICAgICByZXR1cm4gdGhpcy5qb2luVGFibGVPbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLmxlZnRPdXRlckpvaW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdLCBncmFudWxhcml0eSwgb24pO1xuICAgIH1cblxuICAgIHB1YmxpYyBsZWZ0T3V0ZXJKb2luVGFibGUoKSB7XG4gICAgICAgIGNvbnN0IG5ld1Byb3BlcnR5S2V5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBuZXdQcm9wZXJ0eVR5cGUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgIGNvbnN0IGNvbHVtbjFQYXJ0cyA9IGFyZ3VtZW50c1syXTtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBhcmd1bWVudHNbM107XG4gICAgICAgIGNvbnN0IGNvbHVtbjJQYXJ0cyA9IGFyZ3VtZW50c1s0XTtcblxuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IG5ld1Byb3BlcnR5S2V5LFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBuZXdQcm9wZXJ0eVR5cGUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQ2xhc3MgPSBuZXdQcm9wZXJ0eVR5cGU7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZVRvSm9pbkNsYXNzKTtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5BbGlhcyA9IG5ld1Byb3BlcnR5S2V5O1xuXG4gICAgICAgIGNvbnN0IHRhYmxlMUNvbHVtbiA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW4xUGFydHMpO1xuICAgICAgICBjb25zdCB0YWJsZTJDb2x1bW4gPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMlBhcnRzKTtcblxuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5sZWZ0T3V0ZXJKb2luKGAke3RhYmxlVG9Kb2luTmFtZX0gYXMgJHt0YWJsZVRvSm9pbkFsaWFzfWAsIHRhYmxlMUNvbHVtbiwgb3BlcmF0b3IsIHRhYmxlMkNvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlQ29sdW1uKCkge1xuICAgICAgICAvLyBUaGlzIGlzIGNhbGxlZCBmcm9tIHRoZSBzdWItcXVlcnlcbiAgICAgICAgLy8gVGhlIGZpcnN0IGNvbHVtbiBpcyBmcm9tIHRoZSBzdWItcXVlcnlcbiAgICAgICAgLy8gVGhlIHNlY29uZCBjb2x1bW4gaXMgZnJvbSB0aGUgcGFyZW50IHF1ZXJ5XG4gICAgICAgIGxldCBjb2x1bW4xTmFtZTtcbiAgICAgICAgbGV0IGNvbHVtbjJOYW1lO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICBpZiAoYXJndW1lbnRzWzBdIGluc3RhbmNlb2YgQ29sdW1uRnJvbVF1ZXJ5KSB7XG4gICAgICAgICAgICBjb2x1bW4xTmFtZSA9IChhcmd1bWVudHNbMF0gYXMgQ29sdW1uRnJvbVF1ZXJ5KS50b1N0cmluZygpO1xuICAgICAgICAgICAgY29sdW1uMk5hbWUgPSAoYXJndW1lbnRzWzJdIGFzIENvbHVtbkZyb21RdWVyeSkudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlUmF3KGAke2NvbHVtbjFOYW1lfSAke29wZXJhdG9yfSAke2NvbHVtbjJOYW1lfWApO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uMU5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uYXJndW1lbnRzWzBdLnNwbGl0KFwiLlwiKSk7XG4gICAgICAgICAgICBpZiAoIXRoaXMucGFyZW50VHlwZWRRdWVyeUJ1aWxkZXIpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BhcmVudCBxdWVyeSBidWlsZGVyIGlzIG1pc3NpbmcsIFwid2hlcmVDb2x1bW5cIiBjYW4gb25seSBiZSB1c2VkIGluIHN1Yi1xdWVyeS4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbHVtbjJOYW1lID0gdGhpcy5wYXJlbnRUeXBlZFF1ZXJ5QnVpbGRlci5nZXRDb2x1bW5OYW1lKC4uLmFyZ3VtZW50c1syXS5zcGxpdChcIi5cIikpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sdW1uMU5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4udGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oYXJndW1lbnRzWzBdKSk7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMk5hbWUgPSBhcmd1bWVudHNbMl07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGFyZ3VtZW50c1syXS5tZW1vcmllcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMk5hbWUgPSBhcmd1bWVudHNbMl0uZ2V0Q29sdW1uTmFtZTsgLy8gcGFyZW50IHRoaXMgbmVlZGVkIC4uLlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2x1bW4yTmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi50aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmd1bWVudHNbMl0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlUmF3KGA/PyAke29wZXJhdG9yfSA/P2AsIFtjb2x1bW4xTmFtZSwgY29sdW1uMk5hbWVdKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9RdWVyeSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlCdWlsZGVyLnRvUXVlcnkoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTnVsbC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3ROdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90TnVsbC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JXaGVyZU51bGwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZU51bGwuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmVOb3ROdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVOb3ROdWxsLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oZjogYW55KSB7XG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIGYuc3BsaXQoXCIuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgeyByb290LCBtZW1vcmllcyB9ID0gZ2V0UHJveHlBbmRNZW1vcmllcygpO1xuXG4gICAgICAgIGYocm9vdCk7XG5cbiAgICAgICAgcmV0dXJuIG1lbW9yaWVzO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBmaW5kQnlQcmltYXJ5S2V5KCkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBwcmltYXJ5S2V5VmFsdWUgPSBhcmd1bWVudHNbMF07XG5cbiAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50c0xpc3Q7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb25zdCBbLCAuLi5jb2x1bW5Bcmd1bWVudHNdID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzTGlzdCA9IGNvbHVtbkFyZ3VtZW50cy5tYXAoKGNvbmNhdEtleTogc3RyaW5nKSA9PiBjb25jYXRLZXkuc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5Bcmd1bWVudHMgb2YgY29sdW1uQXJndW1lbnRzTGlzdCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIud2hlcmUocHJpbWFyeUtleUNvbHVtbkluZm8ubmFtZSwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShwcmltYXJ5S2V5VmFsdWUpKTtcblxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5QnVpbGRlci5maXJzdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlKCkge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb25jYXRLZXlDb2x1bW4odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmUuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZS5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3QoKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzBdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbmNhdEtleUNvbHVtbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjb2x1bW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmd1bWVudHNbMF0pO1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdCh0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShhcmd1bWVudHNbMV0pKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGFuZFdoZXJlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLmFuZFdoZXJlLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBvcldoZXJlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmUuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlSW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmVJbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3RJbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdEluLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZUluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVJbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVOb3RJbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci5vcldoZXJlTm90SW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlQmV0d2VlbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZUJldHdlZW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuICAgIHB1YmxpYyB3aGVyZU5vdEJldHdlZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmVOb3RCZXR3ZWVuLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBvcldoZXJlQmV0d2VlbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci5vcldoZXJlQmV0d2Vlbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVOb3RCZXR3ZWVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVOb3RCZXR3ZWVuLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBjYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKGZ1bmN0aW9uTmFtZTogc3RyaW5nLCB0eXBlT2ZTdWJRdWVyeTogYW55LCBmdW5jdGlvblRvQ2FsbDogYW55LCBncmFudWxhcml0eTogR3JhbnVsYXJpdHkgfCB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgdGhhdCA9IHRoaXMgYXMgYW55O1xuICAgICAgICBsZXQgc3ViUXVlcnlQcmVmaXg6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKFtcIndoZXJlRXhpc3RzXCIsIFwib3JXaGVyZUV4aXN0c1wiLCBcIndoZXJlTm90RXhpc3RzXCIsIFwib3JXaGVyZU5vdEV4aXN0c1wiLCBcImhhdmluZ0V4aXN0c1wiLCBcImhhdmluZ05vdEV4aXN0c1wiXS5pbmNsdWRlcyhmdW5jdGlvbk5hbWUpKSB7XG4gICAgICAgICAgICBzdWJRdWVyeVByZWZpeCA9IHRoaXMuZ2V0TmV4dFN1YlF1ZXJ5UHJlZml4KCk7XG4gICAgICAgIH1cbiAgICAgICAgKCh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpW2Z1bmN0aW9uTmFtZV0gYXMgKGNhbGxiYWNrOiBLbmV4LlF1ZXJ5Q2FsbGJhY2spID0+IEtuZXguUXVlcnlCdWlsZGVyKShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zdCBzdWJRdWVyeSA9IHRoaXM7XG4gICAgICAgICAgICBjb25zdCB7IHJvb3QsIG1lbW9yaWVzIH0gPSBnZXRQcm94eUFuZE1lbW9yaWVzKHRoYXQpO1xuXG4gICAgICAgICAgICBjb25zdCBzdWJRQiA9IG5ldyBUeXBlZFF1ZXJ5QnVpbGRlcih0eXBlT2ZTdWJRdWVyeSwgZ3JhbnVsYXJpdHksIHRoYXQua25leCwgc3ViUXVlcnksIHRoYXQsIHN1YlF1ZXJ5UHJlZml4KTtcbiAgICAgICAgICAgIHN1YlFCLmV4dHJhSm9pbmVkUHJvcGVydGllcyA9IHRoYXQuZXh0cmFKb2luZWRQcm9wZXJ0aWVzO1xuICAgICAgICAgICAgZnVuY3Rpb25Ub0NhbGwoc3ViUUIsIHJvb3QsIG1lbW9yaWVzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHVibGljIHNlbGVjdFF1ZXJ5KCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IGFyZ3VtZW50c1szXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSBhcmd1bWVudHNbNF0gPz8gZ2V0VGFibGVNZXRhZGF0YSh0eXBlT2ZTdWJRdWVyeSkuZGVmYXVsdExvY2s7XG5cbiAgICAgICAgY29uc3QgeyByb290LCBtZW1vcmllcyB9ID0gZ2V0UHJveHlBbmRNZW1vcmllcyh0aGlzIGFzIGFueSk7XG5cbiAgICAgICAgY29uc3Qgc3ViUXVlcnlCdWlsZGVyID0gbmV3IFR5cGVkUXVlcnlCdWlsZGVyKHR5cGVPZlN1YlF1ZXJ5LCBncmFudWxhcml0eSwgdGhpcy5rbmV4LCB1bmRlZmluZWQsIHRoaXMpO1xuICAgICAgICBmdW5jdGlvblRvQ2FsbChzdWJRdWVyeUJ1aWxkZXIsIHJvb3QsIG1lbW9yaWVzKTtcblxuICAgICAgICAodGhpcy5zZWxlY3RSYXcgYXMgYW55KShuYW1lLCB1bmRlZmluZWQsIHN1YlF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVQYXJlbnRoZXNlcygpIHtcbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwid2hlcmVcIiwgdGhpcy50YWJsZUNsYXNzLCBhcmd1bWVudHNbMF0sIHVuZGVmaW5lZCk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIHB1YmxpYyBvcldoZXJlUGFyZW50aGVzZXMoKSB7XG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIm9yV2hlcmVcIiwgdGhpcy50YWJsZUNsYXNzLCBhcmd1bWVudHNbMF0sIHVuZGVmaW5lZCk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlRXhpc3RzKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1swXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJ3aGVyZUV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIm9yV2hlcmVFeGlzdHNcIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlTm90RXhpc3RzKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1swXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJ3aGVyZU5vdEV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVOb3RFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIm9yV2hlcmVOb3RFeGlzdHNcIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlUmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIud2hlcmVSYXcoc3FsLCBiaW5kaW5ncyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmcoKSB7XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gYXJndW1lbnRzWzFdO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0oYXJndW1lbnRzWzJdKTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaGF2aW5nKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSksIG9wZXJhdG9yLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdJbigpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmhhdmluZ0luKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ05vdEluKCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0oYXJndW1lbnRzWzFdKTtcbiAgICAgICAgKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSkuaGF2aW5nTm90SW4odGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTnVsbCgpIHtcbiAgICAgICAgKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSkuaGF2aW5nTnVsbCh0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ05vdE51bGwoKSB7XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmhhdmluZ05vdE51bGwodGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcImhhdmluZ0V4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTm90RXhpc3RzKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1swXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJoYXZpbmdOb3RFeGlzdHNcIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ1JhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmhhdmluZ1JhdyhzcWwsIGJpbmRpbmdzKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ0JldHdlZW4oKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShhcmd1bWVudHNbMV0pO1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5oYXZpbmdCZXR3ZWVuKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ05vdEJldHdlZW4oKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShhcmd1bWVudHNbMV0pO1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5oYXZpbmdOb3RCZXR3ZWVuKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIG9yZGVyQnlSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5vcmRlckJ5UmF3KHNxbCwgYmluZGluZ3MpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgdW5pb24oKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcInVuaW9uXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB1bmlvbkFsbCgpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMF0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwidW5pb25BbGxcIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHJldHVybmluZ0NvbHVtbigpIHtcbiAgICAgICAgdGhyb3cgbmV3IE5vdEltcGxlbWVudGVkRXJyb3IoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgcmV0dXJuaW5nQ29sdW1ucygpIHtcbiAgICAgICAgdGhyb3cgbmV3IE5vdEltcGxlbWVudGVkRXJyb3IoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgdHJhbnNhY3RpbmcodHJ4OiBLbmV4LlRyYW5zYWN0aW9uKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnRyYW5zYWN0aW5nKHRyeCk7XG5cbiAgICAgICAgdGhpcy50cmFuc2FjdGlvbiA9IHRyeDtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgbWluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcIm1pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGNvdW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcImNvdW50XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgY291bnREaXN0aW5jdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJjb3VudERpc3RpbmN0XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbWF4KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcIm1heFwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIHN1bSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJzdW1cIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBzdW1EaXN0aW5jdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJzdW1EaXN0aW5jdFwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGF2ZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJhdmdcIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBhdmdEaXN0aW5jdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJhdmdEaXN0aW5jdFwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGluY3JlbWVudCgpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5pbmNyZW1lbnQodGhpcy5nZXRDb2x1bW5OYW1lRnJvbUFyZ3VtZW50c0lnbm9yaW5nTGFzdFBhcmFtZXRlciguLi5hcmd1bWVudHMpLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBwdWJsaWMgZGVjcmVtZW50KCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV07XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmRlY3JlbWVudCh0aGlzLmdldENvbHVtbk5hbWVGcm9tQXJndW1lbnRzSWdub3JpbmdMYXN0UGFyYW1ldGVyKC4uLmFyZ3VtZW50cyksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHRydW5jYXRlKCkge1xuICAgICAgICBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlci50cnVuY2F0ZSgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBpbnNlcnRTZWxlY3QoKSB7XG4gICAgICAgIGNvbnN0IHRhYmxlTmFtZSA9IGdldFRhYmxlTmFtZShhcmd1bWVudHNbMF0pO1xuXG4gICAgICAgIGNvbnN0IHR5cGVkUXVlcnlCdWlsZGVyRm9ySW5zZXJ0ID0gbmV3IFR5cGVkUXVlcnlCdWlsZGVyPGFueSwgYW55Pihhcmd1bWVudHNbMF0sIHVuZGVmaW5lZCwgdGhpcy5rbmV4KTtcbiAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50c0xpc3Q7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb25zdCBbLCAuLi5jb2x1bW5Bcmd1bWVudHNdID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzTGlzdCA9IGNvbHVtbkFyZ3VtZW50cy5tYXAoKGNvbmNhdEtleTogc3RyaW5nKSA9PiBjb25jYXRLZXkuc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgaW5zZXJ0Q29sdW1ucyA9IGNvbHVtbkFyZ3VtZW50c0xpc3QubWFwKChpKSA9PiB0eXBlZFF1ZXJ5QnVpbGRlckZvckluc2VydC5nZXRDb2x1bW5OYW1lKC4uLmkpKTtcblxuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20va25leC9rbmV4L2lzc3Vlcy8xMDU2XG4gICAgICAgIGNvbnN0IHFiID0gdGhpcy5rbmV4LmZyb20odGhpcy5rbmV4LnJhdyhgPz8gKCR7aW5zZXJ0Q29sdW1ucy5tYXAoKCkgPT4gXCI/P1wiKS5qb2luKFwiLFwiKX0pYCwgW3RhYmxlTmFtZSwgLi4uaW5zZXJ0Q29sdW1uc10pKS5pbnNlcnQodGhpcy5rbmV4LnJhdyh0aGlzLnRvUXVlcnkoKSkpO1xuXG4gICAgICAgIGNvbnN0IGZpbmFsUXVlcnkgPSBxYi50b1N0cmluZygpO1xuICAgICAgICB0aGlzLnRvUXVlcnkgPSAoKSA9PiBmaW5hbFF1ZXJ5O1xuXG4gICAgICAgIGF3YWl0IHFiO1xuICAgIH1cblxuICAgIHB1YmxpYyBjbGVhclNlbGVjdCgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuY2xlYXJTZWxlY3QoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cbiAgICBwdWJsaWMgY2xlYXJXaGVyZSgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuY2xlYXJXaGVyZSgpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuICAgIHB1YmxpYyBjbGVhck9yZGVyKCkge1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5jbGVhck9yZGVyKCk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZGlzdGluY3QoKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmRpc3RpbmN0KCk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgY2xvbmUoKSB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5QnVpbGRlckNsb25lID0gdGhpcy5xdWVyeUJ1aWxkZXIuY2xvbmUoKTtcblxuICAgICAgICBjb25zdCB0eXBlZFF1ZXJ5QnVpbGRlckNsb25lID0gbmV3IFR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsVHlwZSwgUm93Pih0aGlzLnRhYmxlQ2xhc3MsIHRoaXMuZ3JhbnVsYXJpdHksIHRoaXMua25leCwgcXVlcnlCdWlsZGVyQ2xvbmUpO1xuXG4gICAgICAgIHJldHVybiB0eXBlZFF1ZXJ5QnVpbGRlckNsb25lIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ3JvdXBCeSgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZ3JvdXBCeSh0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGdyb3VwQnlSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5ncm91cEJ5UmF3KHNxbCwgYmluZGluZ3MpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgdXNlS25leFF1ZXJ5QnVpbGRlcihmOiAocXVlcnk6IEtuZXguUXVlcnlCdWlsZGVyKSA9PiB2b2lkKSB7XG4gICAgICAgIGYodGhpcy5xdWVyeUJ1aWxkZXIpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0S25leFF1ZXJ5QnVpbGRlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlCdWlsZGVyO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRDb2x1bW5OYW1lKC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgZmlyc3RQYXJ0TmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyhrZXlzWzBdKTtcblxuICAgICAgICBpZiAoa2V5cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBmaXJzdFBhcnROYW1lO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IGNvbHVtbk5hbWUgPSBcIlwiO1xuICAgICAgICAgICAgbGV0IGNvbHVtbkFsaWFzO1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDbGFzcztcbiAgICAgICAgICAgIGxldCBjdXJyZW50Q29sdW1uUGFydDtcbiAgICAgICAgICAgIGNvbnN0IHByZWZpeCA9IGtleXMuc2xpY2UoMCwgLTEpLmpvaW4oXCIuXCIpO1xuICAgICAgICAgICAgY29uc3QgZXh0cmFKb2luZWRQcm9wZXJ0eSA9IHRoaXMuZXh0cmFKb2luZWRQcm9wZXJ0aWVzLmZpbmQoKGkpID0+IGkubmFtZSA9PT0gcHJlZml4KTtcbiAgICAgICAgICAgIGlmIChleHRyYUpvaW5lZFByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgY29sdW1uQWxpYXMgPSBleHRyYUpvaW5lZFByb3BlcnR5Lm5hbWU7XG4gICAgICAgICAgICAgICAgY3VycmVudENsYXNzID0gZXh0cmFKb2luZWRQcm9wZXJ0eS5wcm9wZXJ0eVR5cGU7XG4gICAgICAgICAgICAgICAgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihjdXJyZW50Q2xhc3MsIGtleXNba2V5cy5sZW5ndGggLSAxXSk7XG4gICAgICAgICAgICAgICAgY29sdW1uTmFtZSA9IGtleXMuc2xpY2UoMCwgLTEpLmpvaW4oXCJfXCIpICsgXCIuXCIgKyBjdXJyZW50Q29sdW1uUGFydC5uYW1lO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKHRoaXMudGFibGVDbGFzcywga2V5c1swXSk7XG4gICAgICAgICAgICAgICAgY29sdW1uQWxpYXMgPSBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2xhc3MgPSBjdXJyZW50Q29sdW1uUGFydC5jb2x1bW5DbGFzcztcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihjdXJyZW50Q2xhc3MsIGtleXNbaV0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbk5hbWUgPSBjb2x1bW5BbGlhcyArIFwiLlwiICsgKGtleXMubGVuZ3RoIC0gMSA9PT0gaSA/IGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWUgOiBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbkFsaWFzICs9IFwiX1wiICsgKGtleXMubGVuZ3RoIC0gMSA9PT0gaSA/IGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWUgOiBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleSk7XG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn0ke2NvbHVtbk5hbWV9YDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRDb2x1bW5OYW1lV2l0aERpZmZlcmVudFJvb3QoX3Jvb3RLZXk6IHN0cmluZywgLi4ua2V5czogc3RyaW5nW10pOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBmaXJzdFBhcnROYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKGtleXNbMF0pO1xuXG4gICAgICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGZpcnN0UGFydE5hbWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIGtleXNbMF0pO1xuXG4gICAgICAgICAgICBsZXQgY29sdW1uTmFtZSA9IFwiXCI7XG4gICAgICAgICAgICBsZXQgY29sdW1uQWxpYXMgPSBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleTtcbiAgICAgICAgICAgIGxldCBjdXJyZW50Q2xhc3MgPSBjdXJyZW50Q29sdW1uUGFydC5jb2x1bW5DbGFzcztcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24oY3VycmVudENsYXNzLCBrZXlzW2ldKTtcblxuICAgICAgICAgICAgICAgIGNvbHVtbk5hbWUgPSBjb2x1bW5BbGlhcyArIFwiLlwiICsgKGtleXMubGVuZ3RoIC0gMSA9PT0gaSA/IGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWUgOiBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleSk7XG4gICAgICAgICAgICAgICAgY29sdW1uQWxpYXMgKz0gXCJfXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2xhc3MgPSBjdXJyZW50Q29sdW1uUGFydC5jb2x1bW5DbGFzcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjb2x1bW5OYW1lO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBmdW5jdGlvbldpdGhBbGlhcyhrbmV4RnVuY3Rpb25OYW1lOiBzdHJpbmcsIGY6IGFueSwgYWxpYXNOYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5oYXNTZWxlY3RDbGF1c2UgPSB0cnVlO1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KVtrbmV4RnVuY3Rpb25OYW1lXShgJHt0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXNGcm9tRnVuY3Rpb25PclN0cmluZyhmKX0gYXMgJHthbGlhc05hbWV9YCk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhmOiBhbnkpIHtcbiAgICAgICAgbGV0IGNvbHVtblBhcnRzO1xuICAgICAgICBpZiAodHlwZW9mIGYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtblBhcnRzID0gZi5zcGxpdChcIi5cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2x1bW5QYXJ0cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5QYXJ0cyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzRnJvbUZ1bmN0aW9uT3JTdHJpbmcoZjogYW55KSB7XG4gICAgICAgIGxldCBjb2x1bW5QYXJ0cztcbiAgICAgICAgaWYgKHR5cGVvZiBmID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb2x1bW5QYXJ0cyA9IGYuc3BsaXQoXCIuXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sdW1uUGFydHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihmKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXMoLi4uY29sdW1uUGFydHMpO1xuICAgIH1cblxuICAgIHByaXZhdGUgam9pbkNvbHVtbihqb2luVHlwZTogXCJpbm5lckpvaW5cIiB8IFwibGVmdE91dGVySm9pblwiLCBmOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCkge1xuICAgICAgICBsZXQgY29sdW1uVG9Kb2luQXJndW1lbnRzOiBzdHJpbmdbXTtcblxuICAgICAgICBpZiAodHlwZW9mIGYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtblRvSm9pbkFyZ3VtZW50cyA9IGYuc3BsaXQoXCIuXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sdW1uVG9Kb2luQXJndW1lbnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oZik7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb2x1bW5Ub0pvaW5OYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtblRvSm9pbkFyZ3VtZW50cyk7XG5cbiAgICAgICAgbGV0IHNlY29uZENvbHVtbk5hbWUgPSBjb2x1bW5Ub0pvaW5Bcmd1bWVudHNbMF07XG4gICAgICAgIGxldCBzZWNvbmRDb2x1bW5BbGlhcyA9IGNvbHVtblRvSm9pbkFyZ3VtZW50c1swXTtcbiAgICAgICAgbGV0IHNlY29uZENvbHVtbkNsYXNzID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBzZWNvbmRDb2x1bW5OYW1lKS5jb2x1bW5DbGFzcztcblxuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGNvbHVtblRvSm9pbkFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgYmVmb3JlU2Vjb25kQ29sdW1uQWxpYXMgPSBzZWNvbmRDb2x1bW5BbGlhcztcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZVNlY29uZENvbHVtbkNsYXNzID0gc2Vjb25kQ29sdW1uQ2xhc3M7XG5cbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihiZWZvcmVTZWNvbmRDb2x1bW5DbGFzcywgY29sdW1uVG9Kb2luQXJndW1lbnRzW2ldKTtcbiAgICAgICAgICAgIHNlY29uZENvbHVtbk5hbWUgPSBjb2x1bW5JbmZvLm5hbWU7XG4gICAgICAgICAgICBzZWNvbmRDb2x1bW5BbGlhcyA9IGJlZm9yZVNlY29uZENvbHVtbkFsaWFzICsgXCJfXCIgKyBjb2x1bW5JbmZvLnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgc2Vjb25kQ29sdW1uQ2xhc3MgPSBjb2x1bW5JbmZvLmNvbHVtbkNsYXNzO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5OYW1lID0gZ2V0VGFibGVOYW1lKHNlY29uZENvbHVtbkNsYXNzKTtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5BbGlhcyA9IGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn0ke3NlY29uZENvbHVtbkFsaWFzfWA7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luSm9pbkNvbHVtbk5hbWUgPSBgJHt0YWJsZVRvSm9pbkFsaWFzfS4ke2dldFByaW1hcnlLZXlDb2x1bW4oc2Vjb25kQ29sdW1uQ2xhc3MpLm5hbWV9YDtcblxuICAgICAgICBjb25zdCBqb2luVGFibGVHcmFudWxhcml0eSA9IGdyYW51bGFyaXR5ID8/IGdldFRhYmxlTWV0YWRhdGEoc2Vjb25kQ29sdW1uQ2xhc3MpLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWpvaW5UYWJsZUdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtqb2luVGFibGVHcmFudWxhcml0eX0pYDtcblxuICAgICAgICBjb25zdCB0YWJsZU5hbWVSYXcgPSB0aGlzLmtuZXgucmF3KGA/PyBhcyA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGFibGVUb0pvaW5OYW1lLCB0YWJsZVRvSm9pbkFsaWFzXSk7XG4gICAgICAgIGlmIChqb2luVHlwZSA9PT0gXCJpbm5lckpvaW5cIikge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luKHRhYmxlTmFtZVJhdywgdGFibGVUb0pvaW5Kb2luQ29sdW1uTmFtZSwgY29sdW1uVG9Kb2luTmFtZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoam9pblR5cGUgPT09IFwibGVmdE91dGVySm9pblwiKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5sZWZ0T3V0ZXJKb2luKHRhYmxlTmFtZVJhdywgdGFibGVUb0pvaW5Kb2luQ29sdW1uTmFtZSwgY29sdW1uVG9Kb2luTmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtbk5hbWVGcm9tQXJndW1lbnRzSWdub3JpbmdMYXN0UGFyYW1ldGVyKC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgYXJndW1lbnRzRXhjZXB0TGFzdCA9IGtleXMuc2xpY2UoMCwgLTEpO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmFyZ3VtZW50c0V4Y2VwdExhc3QpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyguLi5rZXlzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGV4dHJhSm9pbmVkUHJvcGVydHkgPSB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5maW5kKChpKSA9PiBpLm5hbWUgPT09IGtleXNbMF0pO1xuICAgICAgICBpZiAoZXh0cmFKb2luZWRQcm9wZXJ0eSkge1xuICAgICAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGV4dHJhSm9pbmVkUHJvcGVydHkubmFtZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihleHRyYUpvaW5lZFByb3BlcnR5LnByb3BlcnR5VHlwZSwga2V5c1sxXSk7XG4gICAgICAgICAgICByZXR1cm4gZXh0cmFKb2luZWRQcm9wZXJ0eS5uYW1lICsgXCIuXCIgKyBjb2x1bW5JbmZvLm5hbWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoa2V5cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIGtleXNbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn0ke3RoaXMudGFibGVOYW1lfS4ke2NvbHVtbkluZm8ubmFtZX1gO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBrZXlzWzBdKTtcblxuICAgICAgICAgICAgbGV0IHJlc3VsdCA9IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKGN1cnJlbnRDbGFzcywga2V5c1tpXSk7XG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IFwiLlwiICsgKGtleXMubGVuZ3RoIC0gMSA9PT0gaSA/IGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWUgOiBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleSk7XG4gICAgICAgICAgICAgICAgY3VycmVudENsYXNzID0gY3VycmVudENvbHVtblBhcnQuY29sdW1uQ2xhc3M7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtblNlbGVjdEFsaWFzKC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4ga2V5c1swXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBjb2x1bW5BbGlhcyA9IGtleXNbMF07XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyArPSBcIi5cIiArIGtleXNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY29sdW1uQWxpYXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFwcGx5VGVtcG9yYWxDb252ZXJzaW9uc0ZvclJlYWQoaXRlbTogYW55KTogYW55IHtcbiAgICAgICAgaWYgKGl0ZW0gPT09IG51bGwgfHwgaXRlbSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpdGVtKSkge1xuICAgICAgICAgICAgcmV0dXJuIGl0ZW0ubWFwKChpKSA9PiB0aGlzLmFwcGx5VGVtcG9yYWxDb252ZXJzaW9uc0ZvclJlYWQoaSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgcm9vdENvbHVtbnMgPSBnZXRDb2x1bW5Qcm9wZXJ0aWVzKHRoaXMudGFibGVDbGFzcyk7XG4gICAgICAgIGZvciAoY29uc3QgY29sIG9mIHJvb3RDb2x1bW5zKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnZlcnRUZW1wb3JhbENvbHVtbkZvclJlYWQoaXRlbSwgY29sKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3Qgam9pbmVkIG9mIHRoaXMuZXh0cmFKb2luZWRQcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICBjb25zdCBuZXN0ZWRJdGVtID0gaXRlbVtqb2luZWQubmFtZV07XG4gICAgICAgICAgICBpZiAobmVzdGVkSXRlbSA9PT0gbnVsbCB8fCBuZXN0ZWRJdGVtID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgam9pbmVkQ29sdW1ucyA9IGdldENvbHVtblByb3BlcnRpZXMoam9pbmVkLnByb3BlcnR5VHlwZSk7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjb2wgb2Ygam9pbmVkQ29sdW1ucykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbnZlcnRUZW1wb3JhbENvbHVtbkZvclJlYWQobmVzdGVkSXRlbSwgY29sKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAvLyBqb2luZWQgdHlwZSBtYXkgbm90IGhhdmUgQENvbHVtbiBkZWNvcmF0b3JzIChlLmcuIENURXMpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaXRlbTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbnZlcnRUZW1wb3JhbENvbHVtbkZvclJlYWQoY29udGFpbmVyOiBhbnksIGNvbDogeyBwcm9wZXJ0eUtleTogc3RyaW5nOyBjb2x1bW5UeXBlOiBUZW1wb3JhbENvbHVtblR5cGUgfCBhbnkgfSB8IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoIWNvbCB8fCAhdGhpcy5pc1RlbXBvcmFsQ2xhc3MoY29sLmNvbHVtblR5cGUpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29sdW1uVHlwZTogVGVtcG9yYWxDb2x1bW5UeXBlID0gY29sLmNvbHVtblR5cGU7XG4gICAgICAgIGNvbnN0IHZhbCA9IGNvbnRhaW5lcltjb2wucHJvcGVydHlLZXldO1xuICAgICAgICBpZiAodmFsID09PSBudWxsIHx8IHZhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmFsIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAgICAgbGV0IGRhdGVTdHJpbmcgPSB2YWwudG9JU09TdHJpbmcoKTtcbiAgICAgICAgICAgIGlmIChjb2x1bW5UeXBlLm5hbWUgPT09IFwiUGxhaW5EYXRlXCIgfHwgY29sdW1uVHlwZS5uYW1lID09PSBcIlBsYWluTW9udGhEYXlcIiB8fCBjb2x1bW5UeXBlLm5hbWUgPT09IFwiUGxhaW5ZZWFyTW9udGhcIikge1xuICAgICAgICAgICAgICAgIGRhdGVTdHJpbmcgPSBkYXRlU3RyaW5nLnN1YnN0cmluZygwLCAxMCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNvbHVtblR5cGUubmFtZSA9PT0gXCJQbGFpbkRhdGVUaW1lXCIpIHtcbiAgICAgICAgICAgICAgICBkYXRlU3RyaW5nID0gZGF0ZVN0cmluZy5zdWJzdHJpbmcoMCwgMjMpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjb2x1bW5UeXBlLm5hbWUgPT09IFwiUGxhaW5UaW1lXCIpIHtcbiAgICAgICAgICAgICAgICBkYXRlU3RyaW5nID0gZGF0ZVN0cmluZy5zdWJzdHJpbmcoMTEsIDIzKS5wYWRFbmQoMTgsIFwiMFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRhaW5lcltjb2wucHJvcGVydHlLZXldID0gY29sdW1uVHlwZS5mcm9tKGRhdGVTdHJpbmcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29udGFpbmVyW2NvbC5wcm9wZXJ0eUtleV0gPSBjb2x1bW5UeXBlLmZyb20odmFsKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZmxhdHRlbkJ5T3B0aW9uKG86IGFueSwgZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKGZsYXR0ZW5PcHRpb24gPT09IEZsYXR0ZW5PcHRpb24ubm9GbGF0dGVuIHx8IHRoaXMuc2hvdWxkVW5mbGF0dGVuID09PSBmYWxzZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYXBwbHlUZW1wb3JhbENvbnZlcnNpb25zRm9yUmVhZChvKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB1bmZsYXR0ZW5lZCA9IHVuZmxhdHRlbihvKTtcbiAgICAgICAgaWYgKGZsYXR0ZW5PcHRpb24gPT09IHVuZGVmaW5lZCB8fCBmbGF0dGVuT3B0aW9uID09PSBGbGF0dGVuT3B0aW9uLmZsYXR0ZW4pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFwcGx5VGVtcG9yYWxDb252ZXJzaW9uc0ZvclJlYWQodW5mbGF0dGVuZWQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmFwcGx5VGVtcG9yYWxDb252ZXJzaW9uc0ZvclJlYWQoc2V0VG9OdWxsKHVuZmxhdHRlbmVkKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBqb2luVGFibGVPbkZ1bmN0aW9uKHF1ZXJ5QnVpbGRlckpvaW46IEtuZXguSm9pbiwgbmV3UHJvcGVydHlLZXk6IGFueSwgbmV3UHJvcGVydHlUeXBlOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCwgb25GdW5jdGlvbjogKGpvaW46IElKb2luT25DbGF1c2UyPGFueSwgYW55PikgPT4gdm9pZCkge1xuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IG5ld1Byb3BlcnR5S2V5LFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBuZXdQcm9wZXJ0eVR5cGUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQ2xhc3MgPSBuZXdQcm9wZXJ0eVR5cGU7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZVRvSm9pbkNsYXNzKTtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5BbGlhcyA9IG5ld1Byb3BlcnR5S2V5O1xuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcblxuICAgICAgICBsZXQga25leE9uT2JqZWN0OiBhbnk7XG4gICAgICAgIGNvbnN0IHRhYmxlTmFtZVJhdyA9IHRoaXMua25leC5yYXcoYD8/IGFzID8/JHtncmFudWxhcml0eVF1ZXJ5fWAsIFt0YWJsZVRvSm9pbk5hbWUsIHRhYmxlVG9Kb2luQWxpYXNdKTtcbiAgICAgICAgcXVlcnlCdWlsZGVySm9pbih0YWJsZU5hbWVSYXcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGtuZXhPbk9iamVjdCA9IHRoaXM7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IG9uT2JqZWN0ID0gdGhpcy5nZXRUeXBlZEtuZXhPbk9iamVjdChuZXdQcm9wZXJ0eUtleSwgdGFibGVUb0pvaW5BbGlhcywga25leE9uT2JqZWN0KTtcbiAgICAgICAgb25GdW5jdGlvbihvbk9iamVjdCBhcyBhbnkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFR5cGVkS25leE9uT2JqZWN0KG5ld1Byb3BlcnR5S2V5OiBhbnksIHRhYmxlVG9Kb2luQWxpYXM6IGFueSwga25leE9uT2JqZWN0OiBhbnkpIHtcbiAgICAgICAgY29uc3Qgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4gPSAoam9pbmVkQ29sdW1uOiBhbnksIG9wZXJhdG9yOiBhbnksIG1vZGVsQ29sdW1uOiBhbnksIGZ1bmN0aW9uTmFtZToga2V5b2YgS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICBsZXQgY29sdW1uMUFyZ3VtZW50cztcblxuICAgICAgICAgICAgaWYgKHR5cGVvZiBtb2RlbENvbHVtbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGNvbHVtbjFBcmd1bWVudHMgPSBtb2RlbENvbHVtbi5zcGxpdChcIi5cIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbHVtbjFBcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihtb2RlbENvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjb2x1bW4yTmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyhuZXdQcm9wZXJ0eUtleSwgam9pbmVkQ29sdW1uKTtcblxuICAgICAgICAgICAga25leE9uT2JqZWN0W2Z1bmN0aW9uTmFtZV0odGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbjFBcmd1bWVudHMpLCBvcGVyYXRvciwgY29sdW1uMk5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG9uV2l0aENvbHVtbk9wZXJhdG9yVmFsdWUgPSAoam9pbmVkTW9kZWxDb2x1bW46IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSwgZnVuY3Rpb25OYW1lOiBrZXlvZiBLbmV4LkpvaW5DbGF1c2UpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbjJOYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKG5ld1Byb3BlcnR5S2V5LCBqb2luZWRNb2RlbENvbHVtbik7XG4gICAgICAgICAgICBrbmV4T25PYmplY3RbZnVuY3Rpb25OYW1lXShjb2x1bW4yTmFtZSwgb3BlcmF0b3IsIHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0odmFsdWUpKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3Qgb25XaXRoTW9kZWxDb2x1bW5PcGVyYXRvclZhbHVlID0gKG1vZGVsQ29sdW1uOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnksIGZ1bmN0aW9uTmFtZToga2V5b2YgS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICBsZXQgY29sdW1uQXJndW1lbnRzO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBtb2RlbENvbHVtbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50cyA9IG1vZGVsQ29sdW1uLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24obW9kZWxDb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAga25leE9uT2JqZWN0W2Z1bmN0aW9uTmFtZV0odGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cyksIG9wZXJhdG9yLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKHZhbHVlKSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgb25OdWxsVmFsdWUgPSAoam9pbmVkTW9kZWxDb2x1bW46IGFueSwgZnVuY3Rpb25OYW1lOiBrZXlvZiBLbmV4LkpvaW5DbGF1c2UpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGpvaW5lZE1vZGVsQ29sdW1uKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50c1dpdGhKb2luZWRUYWJsZSA9IFt0YWJsZVRvSm9pbkFsaWFzLCAuLi5jb2x1bW5Bcmd1bWVudHNdO1xuXG4gICAgICAgICAgICBrbmV4T25PYmplY3RbZnVuY3Rpb25OYW1lXShjb2x1bW5Bcmd1bWVudHNXaXRoSm9pbmVkVGFibGUuam9pbihcIi5cIikpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBvbk51bGxNb2RlbFZhbHVlID0gKG1vZGVsQ29sdW1uOiBhbnksIGZ1bmN0aW9uTmFtZToga2V5b2YgS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICBsZXQgY29sdW1uQXJndW1lbnRzO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBtb2RlbENvbHVtbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50cyA9IG1vZGVsQ29sdW1uLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24obW9kZWxDb2x1bW4pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBrbmV4T25PYmplY3RbZnVuY3Rpb25OYW1lXSh0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgb25PYmplY3QgPSB7XG4gICAgICAgICAgICBvbkNvbHVtbnM6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIGNvbHVtbjI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aEpvaW5lZENvbHVtbk9wZXJhdG9yQ29sdW1uKGNvbHVtbjIsIG9wZXJhdG9yLCBjb2x1bW4xLCBcIm9uXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbjogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgY29sdW1uMjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4oY29sdW1uMSwgb3BlcmF0b3IsIGNvbHVtbjIsIFwib25cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFuZE9uOiAoY29sdW1uMTogYW55LCBvcGVyYXRvcjogYW55LCBjb2x1bW4yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhKb2luZWRDb2x1bW5PcGVyYXRvckNvbHVtbihjb2x1bW4xLCBvcGVyYXRvciwgY29sdW1uMiwgXCJhbmRPblwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPbjogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgY29sdW1uMjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4oY29sdW1uMSwgb3BlcmF0b3IsIGNvbHVtbjIsIFwib3JPblwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25WYWw6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhDb2x1bW5PcGVyYXRvclZhbHVlKGNvbHVtbjEsIG9wZXJhdG9yLCB2YWx1ZSwgXCJvblZhbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYW5kT25WYWw6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhDb2x1bW5PcGVyYXRvclZhbHVlKGNvbHVtbjEsIG9wZXJhdG9yLCB2YWx1ZSwgXCJhbmRPblZhbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblZhbDogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aENvbHVtbk9wZXJhdG9yVmFsdWUoY29sdW1uMSwgb3BlcmF0b3IsIHZhbHVlLCBcIm9yT25WYWxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uTnVsbDogKGNvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsVmFsdWUoY29sdW1uLCBcIm9uTnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25Ob3ROdWxsOiAoY29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxWYWx1ZShjb2x1bW4sIFwib25Ob3ROdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uTnVsbDogKGNvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsVmFsdWUoY29sdW1uLCBcIm9yT25OdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uTm90TnVsbDogKGNvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsVmFsdWUoY29sdW1uLCBcIm9yT25Ob3ROdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhbmRPbk51bGw6IChjb2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uTnVsbFZhbHVlKGNvbHVtbiwgXCJhbmRPbk51bGxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFuZE9uTm90TnVsbDogKGNvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsVmFsdWUoY29sdW1uLCBcImFuZE9uTm90TnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25QYXJlbnRoZXNlczogKG9uUGFyZW50aGVzZXNGdW5jdGlvbjogKGpvaW46IElKb2luT25DbGF1c2UyPGFueSwgYW55PikgPT4gdm9pZCkgPT4ge1xuICAgICAgICAgICAgICAgIGtuZXhPbk9iamVjdC5vbigob246IEtuZXguSm9pbkNsYXVzZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRoZXNlc09uT2JqZWN0ID0gdGhpcy5nZXRUeXBlZEtuZXhPbk9iamVjdChuZXdQcm9wZXJ0eUtleSwgdGFibGVUb0pvaW5BbGlhcywgb24pO1xuICAgICAgICAgICAgICAgICAgICBvblBhcmVudGhlc2VzRnVuY3Rpb24ocGFyZW50aGVzZXNPbk9iamVjdCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFuZE9uUGFyZW50aGVzZXM6IChvblBhcmVudGhlc2VzRnVuY3Rpb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxhbnksIGFueT4pID0+IHZvaWQpID0+IHtcbiAgICAgICAgICAgICAgICBrbmV4T25PYmplY3QuYW5kT24oKG9uOiBLbmV4LkpvaW5DbGF1c2UpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFyZW50aGVzZXNPbk9iamVjdCA9IHRoaXMuZ2V0VHlwZWRLbmV4T25PYmplY3QobmV3UHJvcGVydHlLZXksIHRhYmxlVG9Kb2luQWxpYXMsIG9uKTtcbiAgICAgICAgICAgICAgICAgICAgb25QYXJlbnRoZXNlc0Z1bmN0aW9uKHBhcmVudGhlc2VzT25PYmplY3QpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uUGFyZW50aGVzZXM6IChvblBhcmVudGhlc2VzRnVuY3Rpb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxhbnksIGFueT4pID0+IHZvaWQpID0+IHtcbiAgICAgICAgICAgICAgICBrbmV4T25PYmplY3Qub3JPbigob246IEtuZXguSm9pbkNsYXVzZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRoZXNlc09uT2JqZWN0ID0gdGhpcy5nZXRUeXBlZEtuZXhPbk9iamVjdChuZXdQcm9wZXJ0eUtleSwgdGFibGVUb0pvaW5BbGlhcywgb24pO1xuICAgICAgICAgICAgICAgICAgICBvblBhcmVudGhlc2VzRnVuY3Rpb24ocGFyZW50aGVzZXNPbk9iamVjdCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uUXVlcnlWYWw6IChtb2RlbENvbHVtbjogYW55LCBvcGVyYXRvcjogYW55LCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoTW9kZWxDb2x1bW5PcGVyYXRvclZhbHVlKG1vZGVsQ29sdW1uLCBvcGVyYXRvciwgdmFsdWUsIFwib25WYWxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9yT25RdWVyeVZhbDogKG1vZGVsQ29sdW1uOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhNb2RlbENvbHVtbk9wZXJhdG9yVmFsdWUobW9kZWxDb2x1bW4sIG9wZXJhdG9yLCB2YWx1ZSwgXCJvck9uVmFsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblF1ZXJ5TnVsbDogKG1vZGVsQ29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxNb2RlbFZhbHVlKG1vZGVsQ29sdW1uLCBcIm9uTnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblF1ZXJ5TnVsbDogKG1vZGVsQ29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxNb2RlbFZhbHVlKG1vZGVsQ29sdW1uLCBcIm9yT25OdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblF1ZXJ5Tm90TnVsbDogKG1vZGVsQ29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxNb2RlbFZhbHVlKG1vZGVsQ29sdW1uLCBcIm9uTm90TnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblF1ZXJ5Tm90TnVsbDogKG1vZGVsQ29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxNb2RlbFZhbHVlKG1vZGVsQ29sdW1uLCBcIm9yT25Ob3ROdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblJhdzogKHJhdzogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pID0+IHtcbiAgICAgICAgICAgICAgICBrbmV4T25PYmplY3Qub24oKG9uOiBLbmV4LkpvaW5DbGF1c2UpID0+IG9uLm9uKHRoaXMua25leC5yYXcocmF3LCBiaW5kaW5ncykpKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblJhdzogKHJhdzogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pID0+IHtcbiAgICAgICAgICAgICAgICBrbmV4T25PYmplY3Qub3JPbigob246IEtuZXguSm9pbkNsYXVzZSkgPT4gb24ub24odGhpcy5rbmV4LnJhdyhyYXcsIGJpbmRpbmdzKSkpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgYW55O1xuXG4gICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICB9XG5cbiAgICAvLyBvbmNlIGFsbCBlbnZpcm9ubWVudHMgY2FuIHVzZSBuYXRpdmUgVGVtcG9yYWwsIHRoaXMgcHJvY2VzcyBzaG91bGQgYmUgc2ltcGxpZmllZFxuICAgIHByaXZhdGUgVEVNUE9SQUxfQ0xBU1NfTkFNRVM6IFJlYWRvbmx5PFNldDxzdHJpbmc+PiA9IG5ldyBTZXQoW1wiUGxhaW5EYXRlXCIsIFwiUGxhaW5EYXRlVGltZVwiLCBcIlBsYWluTW9udGhEYXlcIiwgXCJQbGFpblRpbWVcIiwgXCJQbGFpblllYXJNb250aFwiLCBcIlpvbmVkRGF0ZVRpbWVcIl0pO1xuICAgIHByaXZhdGUgaXNUZW1wb3JhbENsYXNzKGRlc2lnblR5cGU6IGFueSk6IGRlc2lnblR5cGUgaXMgVGVtcG9yYWxDb2x1bW5UeXBlIHtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIGRlc2lnblR5cGUgPT09IFRlbXBvcmFsLlBsYWluRGF0ZSB8fFxuICAgICAgICAgICAgZGVzaWduVHlwZSA9PT0gVGVtcG9yYWwuUGxhaW5EYXRlVGltZSB8fFxuICAgICAgICAgICAgZGVzaWduVHlwZSA9PT0gVGVtcG9yYWwuUGxhaW5Nb250aERheSB8fFxuICAgICAgICAgICAgZGVzaWduVHlwZSA9PT0gVGVtcG9yYWwuUGxhaW5UaW1lIHx8XG4gICAgICAgICAgICBkZXNpZ25UeXBlID09PSBUZW1wb3JhbC5QbGFpblllYXJNb250aCB8fFxuICAgICAgICAgICAgZGVzaWduVHlwZSA9PT0gVGVtcG9yYWwuWm9uZWREYXRlVGltZSB8fFxuICAgICAgICAgICAgLy8gZmFsbGJhY2sgZm9yIGVudmlyb25tZW50cyB3aGVyZSBUZW1wb3JhbCBjbGFzcyBkZWZpbml0aW9ucyBtYXkgZGlmZmVyXG4gICAgICAgICAgICAoZGVzaWduVHlwZSAmJiB0aGlzLlRFTVBPUkFMX0NMQVNTX05BTUVTLmhhcyhkZXNpZ25UeXBlLm5hbWUpICYmIHR5cGVvZiBkZXNpZ25UeXBlLmZyb20gPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgKTtcbiAgICB9XG4gICAgcHJpdmF0ZSBpc1RlbXBvcmFsVmFsdWUodmFsdWU6IGFueSk6IHZhbHVlIGlzIEluc3RhbmNlVHlwZTxUZW1wb3JhbENvbHVtblR5cGU+IHtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIHZhbHVlIGluc3RhbmNlb2YgVGVtcG9yYWwuUGxhaW5EYXRlIHx8XG4gICAgICAgICAgICB2YWx1ZSBpbnN0YW5jZW9mIFRlbXBvcmFsLlBsYWluRGF0ZVRpbWUgfHxcbiAgICAgICAgICAgIHZhbHVlIGluc3RhbmNlb2YgVGVtcG9yYWwuUGxhaW5Nb250aERheSB8fFxuICAgICAgICAgICAgdmFsdWUgaW5zdGFuY2VvZiBUZW1wb3JhbC5QbGFpblRpbWUgfHxcbiAgICAgICAgICAgIHZhbHVlIGluc3RhbmNlb2YgVGVtcG9yYWwuUGxhaW5ZZWFyTW9udGggfHxcbiAgICAgICAgICAgIHZhbHVlIGluc3RhbmNlb2YgVGVtcG9yYWwuWm9uZWREYXRlVGltZSB8fFxuICAgICAgICAgICAgLy8gZmFsbGJhY2sgZm9yIGVudmlyb25tZW50cyB3aGVyZSBUZW1wb3JhbCBjbGFzcyBkZWZpbml0aW9ucyBtYXkgZGlmZmVyXG4gICAgICAgICAgICAhISh2YWx1ZSAmJiB2YWx1ZS5jb25zdHJ1Y3RvciAmJiB0aGlzLlRFTVBPUkFMX0NMQVNTX05BTUVTLmhhcyh2YWx1ZS5jb25zdHJ1Y3Rvci5uYW1lKSAmJiB0eXBlb2YgdmFsdWUudG9TdHJpbmcgPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbnZlcnRUZW1wb3JhbFBhcmFtKHZhbHVlOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoKHYpID0+IHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0odikpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmlzVGVtcG9yYWxWYWx1ZSh2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24oa25leEZ1bmN0aW9uOiBhbnksIC4uLmFyZ3M6IGFueVtdKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb25jYXRLZXlDb2x1bW4oa25leEZ1bmN0aW9uLCAuLi5hcmdzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjb2x1bW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmdzWzBdKTtcblxuICAgICAgICBpZiAoYXJncy5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbih0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSwgYXJnc1sxXSwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShhcmdzWzJdKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBrbmV4RnVuY3Rpb24odGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cyksIHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0oYXJnc1sxXSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjYWxsS25leEZ1bmN0aW9uV2l0aENvbmNhdEtleUNvbHVtbihrbmV4RnVuY3Rpb246IGFueSwgLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgY29uc3QgY29sdW1uQXJndW1lbnRzID0gYXJnc1swXS5zcGxpdChcIi5cIik7XG4gICAgICAgIGNvbnN0IGNvbHVtbk5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKTtcblxuICAgICAgICBpZiAoYXJncy5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbihjb2x1bW5OYW1lLCBhcmdzWzFdLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKGFyZ3NbMl0pKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbihjb2x1bW5OYW1lLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKGFyZ3NbMV0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VsZWN0QWxsTW9kZWxQcm9wZXJ0aWVzKCkge1xuICAgICAgICBjb25zdCBwcm9wZXJ0aWVzID0gZ2V0Q29sdW1uUHJvcGVydGllcyh0aGlzLnRhYmxlQ2xhc3MpO1xuICAgICAgICBmb3IgKGNvbnN0IHByb3BlcnR5IG9mIHByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnNlbGVjdChgJHtwcm9wZXJ0eS5uYW1lfSBhcyAke3Byb3BlcnR5LnByb3BlcnR5S2V5fWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBqb2luKGpvaW5GdW5jdGlvbk5hbWU6IHN0cmluZywgdGFibGVUb0pvaW5BbGlhczogYW55LCB0YWJsZVRvSm9pbkNsYXNzOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCwgam9pblRhYmxlQ29sdW1uU3RyaW5nOiBhbnksIG9wZXJhdG9yOiBhbnksIGV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmc6IGFueSkge1xuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IHRhYmxlVG9Kb2luQWxpYXMsXG4gICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHRhYmxlVG9Kb2luQ2xhc3MsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXNXaXRoVW5kZXJzY29yZXMgPSB0YWJsZVRvSm9pbkFsaWFzLnNwbGl0KFwiLlwiKS5qb2luKFwiX1wiKTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG5cbiAgICAgICAgY29uc3Qgam9pblRhYmxlQ29sdW1uSW5mb3JtYXRpb24gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0YWJsZVRvSm9pbkNsYXNzLCBqb2luVGFibGVDb2x1bW5TdHJpbmcpO1xuXG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtbkFyZ3VtZW50cyA9IGAke3RhYmxlVG9Kb2luQWxpYXNXaXRoVW5kZXJzY29yZXN9LiR7am9pblRhYmxlQ29sdW1uSW5mb3JtYXRpb24ubmFtZX1gO1xuXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nVGFibGVDb2x1bW5OYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmcuc3BsaXQoXCIuXCIpKTtcblxuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcbiAgICAgICAgY29uc3QgdGFibGVOYW1lUmF3ID0gdGhpcy5rbmV4LnJhdyhgPz8gYXMgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RhYmxlVG9Kb2luTmFtZSwgdGFibGVUb0pvaW5BbGlhc1dpdGhVbmRlcnNjb3Jlc10pO1xuXG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpW2pvaW5GdW5jdGlvbk5hbWVdKHRhYmxlTmFtZVJhdywgam9pblRhYmxlQ29sdW1uQXJndW1lbnRzLCBvcGVyYXRvciwgZXhpc3RpbmdUYWJsZUNvbHVtbk5hbWUpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbWFwUHJvcGVydHlOYW1lVG9Db2x1bW5OYW1lKHByb3BlcnR5TmFtZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIHByb3BlcnR5TmFtZSk7XG4gICAgICAgIHJldHVybiBjb2x1bW5JbmZvLm5hbWU7XG4gICAgfVxuICAgIHB1YmxpYyBtYXBDb2x1bW5OYW1lVG9Qcm9wZXJ0eU5hbWUoY29sdW1uTmFtZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtblByb3BlcnRpZXMgPSBnZXRDb2x1bW5Qcm9wZXJ0aWVzKHRoaXMudGFibGVDbGFzcyk7XG4gICAgICAgIGNvbnN0IGNvbHVtblByb3BlcnR5ID0gY29sdW1uUHJvcGVydGllcy5maW5kKChpKSA9PiBpLm5hbWUgPT09IGNvbHVtbk5hbWUpO1xuICAgICAgICBpZiAoY29sdW1uUHJvcGVydHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZmluZCBjb2x1bW4gd2l0aCBuYW1lIFwiJHtjb2x1bW5OYW1lfVwiYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbHVtblByb3BlcnR5LnByb3BlcnR5S2V5O1xuICAgIH1cblxuICAgIHB1YmxpYyBtYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW06IGFueSkge1xuICAgICAgICBjb25zdCBjb2x1bW5OYW1lcyA9IE9iamVjdC5rZXlzKGl0ZW0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lID0gdGhpcy5tYXBDb2x1bW5OYW1lVG9Qcm9wZXJ0eU5hbWUoY29sdW1uTmFtZSk7XG5cbiAgICAgICAgICAgIGlmIChjb2x1bW5OYW1lICE9PSBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoaXRlbSwgcHJvcGVydHlOYW1lLCBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGl0ZW0sIGNvbHVtbk5hbWUpISk7XG4gICAgICAgICAgICAgICAgZGVsZXRlIGl0ZW1bY29sdW1uTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgbWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtOiBhbnkpIHtcbiAgICAgICAgY29uc3QgY29sdW1uc0J5UHJvcGVydHlLZXkgPSBuZXcgTWFwKGdldENvbHVtblByb3BlcnRpZXModGhpcy50YWJsZUNsYXNzKS5tYXAoKGMpID0+IFtjLnByb3BlcnR5S2V5LCBjXSkpO1xuICAgICAgICBjb25zdCBwcm9wZXJ0eU5hbWVzID0gT2JqZWN0LmtleXMoaXRlbSk7XG5cbiAgICAgICAgZm9yIChjb25zdCBwcm9wZXJ0eU5hbWUgb2YgcHJvcGVydHlOYW1lcykge1xuICAgICAgICAgICAgY29uc3QgY29sID0gY29sdW1uc0J5UHJvcGVydHlLZXkuZ2V0KHByb3BlcnR5TmFtZSk7XG4gICAgICAgICAgICBjb25zdCB2YWwgPSBpdGVtW3Byb3BlcnR5TmFtZV07XG4gICAgICAgICAgICBpZiAodmFsICYmICh0aGlzLmlzVGVtcG9yYWxDbGFzcyhjb2w/LmNvbHVtblR5cGUpIHx8IHRoaXMuaXNUZW1wb3JhbFZhbHVlKHZhbCkpKSB7XG4gICAgICAgICAgICAgICAgaXRlbVtwcm9wZXJ0eU5hbWVdID0gdmFsLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbk5hbWUgPSB0aGlzLm1hcFByb3BlcnR5TmFtZVRvQ29sdW1uTmFtZShwcm9wZXJ0eU5hbWUpO1xuICAgICAgICAgICAgaWYgKGNvbHVtbk5hbWUgIT09IHByb3BlcnR5TmFtZSkge1xuICAgICAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShpdGVtLCBjb2x1bW5OYW1lLCBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGl0ZW0sIHByb3BlcnR5TmFtZSkhKTtcbiAgICAgICAgICAgICAgICBkZWxldGUgaXRlbVtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuIl19
