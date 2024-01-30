"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypedQueryBuilder = exports.registerBeforeUpdateTransform = exports.registerBeforeInsertTransform = exports.TypedKnex = void 0;
const decorators_1 = require("./decorators");
const unflatten_1 = require("./unflatten");
class TypedKnex {
    constructor(knex) {
        this.knex = knex;
    }
    query(tableClass, granularity) {
        return new TypedQueryBuilder(tableClass, granularity, this.knex);
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
        await this.queryBuilder.del().where(primaryKeyColumnInfo.name, value);
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
        const query = this.queryBuilder.update(item).where(primaryKeyColumnInfo.name, primaryKeyValue);
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
                sql += query.where(primaryKeyColumnInfo.name, item.primaryKeyValue).toString().replace("?", "\\?") + ";\n";
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
        const granularity = callIncludesGranularity ? arguments[2] : undefined;
        const joinTableColumnString = callIncludesGranularity ? arguments[3] : arguments[2];
        const operator = callIncludesGranularity ? arguments[4] : arguments[3];
        const existingTableColumnString = callIncludesGranularity ? arguments[5] : arguments[4];
        return this.join("innerJoin", arguments[0], arguments[1], granularity, joinTableColumnString, operator, existingTableColumnString);
    }
    leftOuterJoin() {
        const callIncludesGranularity = this.granularitySet.has(arguments[2]);
        const granularity = callIncludesGranularity ? arguments[2] : undefined;
        const joinTableColumnString = callIncludesGranularity ? arguments[3] : arguments[2];
        const operator = callIncludesGranularity ? arguments[4] : arguments[3];
        const existingTableColumnString = callIncludesGranularity ? arguments[5] : arguments[4];
        return this.join("leftOuterJoin", arguments[0], arguments[1], granularity, joinTableColumnString, operator, existingTableColumnString);
    }
    innerJoinTableOnFunction() {
        const granularity = typeof arguments[2] === "string" ? arguments[2] : undefined;
        const on = typeof arguments[2] === "string" ? arguments[3] : arguments[2];
        return this.joinTableOnFunction(this.queryBuilder.innerJoin.bind(this.queryBuilder), arguments[0], arguments[1], granularity, on);
    }
    leftOuterJoinTableOnFunction() {
        const granularity = typeof arguments[2] === "string" ? arguments[2] : undefined;
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
        this.queryBuilder.where(primaryKeyColumnInfo.name, primaryKeyValue);
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
        this.queryBuilder.whereNot(this.getColumnName(...columnArguments), arguments[1]);
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
        this.hasSelectClause = true;
        const name = arguments[0];
        const typeOfSubQuery = arguments[2];
        const functionToCall = arguments[3];
        const granularity = arguments[4];
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
        const granularity = typeof arguments[1] === "string" ? arguments[1] : undefined;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("whereExists", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    orWhereExists() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : undefined;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("orWhereExists", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    whereNotExists() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : undefined;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("whereNotExists", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    orWhereNotExists() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : undefined;
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
        const value = arguments[2];
        this.queryBuilder.having(this.getColumnNameFromFunctionOrString(arguments[0]), operator, value);
        return this;
    }
    havingIn() {
        const value = arguments[1];
        this.queryBuilder.havingIn(this.getColumnNameFromFunctionOrString(arguments[0]), value);
        return this;
    }
    havingNotIn() {
        const value = arguments[1];
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
        const granularity = typeof arguments[1] === "string" ? arguments[1] : undefined;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("havingExists", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    havingNotExists() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : undefined;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("havingNotExists", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    havingRaw(sql, ...bindings) {
        this.queryBuilder.havingRaw(sql, bindings);
        return this;
    }
    havingBetween() {
        const value = arguments[1];
        this.queryBuilder.havingBetween(this.getColumnNameFromFunctionOrString(arguments[0]), value);
        return this;
    }
    havingNotBetween() {
        const value = arguments[1];
        this.queryBuilder.havingNotBetween(this.getColumnNameFromFunctionOrString(arguments[0]), value);
        return this;
    }
    orderByRaw(sql, ...bindings) {
        this.queryBuilder.orderByRaw(sql, bindings);
        return this;
    }
    union() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : undefined;
        const functionToCall = typeof arguments[1] === "string" ? arguments[2] : arguments[1];
        this.callQueryCallbackFunction("union", typeOfSubQuery, functionToCall, granularity);
        return this;
    }
    unionAll() {
        const typeOfSubQuery = arguments[0];
        const granularity = typeof arguments[1] === "string" ? arguments[1] : undefined;
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
        const granularityQuery = !granularity ? "" : ` WITH (${granularity})`;
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
    flattenByOption(o, flattenOption) {
        if (flattenOption === unflatten_1.FlattenOption.noFlatten || this.shouldUnflatten === false) {
            return o;
        }
        const unflattened = (0, unflatten_1.unflatten)(o);
        if (flattenOption === undefined || flattenOption === unflatten_1.FlattenOption.flatten) {
            return unflattened;
        }
        return (0, unflatten_1.setToNull)(unflattened);
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
        const onWithColumnOperatorValue = (joinedColumn, operator, value, functionName) => {
            const column2Name = this.getColumnNameWithoutAlias(newPropertyKey, joinedColumn);
            knexOnObject[functionName](column2Name, operator, value);
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
            onNull: (f) => {
                const column2Arguments = this.getArgumentsFromColumnFunction(f);
                const column2ArgumentsWithJoinedTable = [tableToJoinAlias, ...column2Arguments];
                knexOnObject.onNull(column2ArgumentsWithJoinedTable.join("."));
                return onObject;
            },
        };
        onFunction(onObject);
        return this;
    }
    callKnexFunctionWithColumnFunction(knexFunction, ...args) {
        if (typeof args[0] === "string") {
            return this.callKnexFunctionWithConcatKeyColumn(knexFunction, ...args);
        }
        const columnArguments = this.getArgumentsFromColumnFunction(args[0]);
        if (args.length === 3) {
            knexFunction(this.getColumnName(...columnArguments), args[1], args[2]);
        } else {
            knexFunction(this.getColumnName(...columnArguments), args[1]);
        }
        return this;
    }
    callKnexFunctionWithConcatKeyColumn(knexFunction, ...args) {
        const columnName = this.getColumnName(...args[0].split("."));
        if (args.length === 3) {
            knexFunction(columnName, args[1], args[2]);
        } else {
            knexFunction(columnName, args[1]);
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
        const propertyNames = Object.keys(item);
        for (const propertyName of propertyNames) {
            const columnName = this.mapPropertyNameToColumnName(propertyName);
            if (columnName !== propertyName) {
                Object.defineProperty(item, columnName, Object.getOwnPropertyDescriptor(item, propertyName));
                delete item[propertyName];
            }
        }
    }
}
exports.TypedQueryBuilder = TypedQueryBuilder;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZWRLbmV4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3R5cGVkS25leC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSw2Q0FBNEc7QUFRNUcsMkNBQWtFO0FBRWxFLE1BQWEsU0FBUztJQUNsQixZQUFvQixJQUFVO1FBQVYsU0FBSSxHQUFKLElBQUksQ0FBTTtJQUFHLENBQUM7SUFFM0IsS0FBSyxDQUFJLFVBQXVCLEVBQUUsV0FBeUI7UUFDOUQsT0FBTyxJQUFJLGlCQUFpQixDQUFVLFVBQVUsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzlFLENBQUM7SUFFTSxnQkFBZ0I7UUFDbkIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLElBQUksQ0FBQyxJQUFJO2lCQUNKLFdBQVcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNqQyxzRkFBc0Y7aUJBQ3JGLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0IsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0o7QUFmRCw4QkFlQztBQUVELElBQUkscUJBQXFCLEdBQUcsU0FBcUUsQ0FBQztBQUVsRyxTQUFnQiw2QkFBNkIsQ0FBSSxDQUFvRTtJQUNqSCxxQkFBcUIsR0FBRyxDQUFDLENBQUM7QUFDOUIsQ0FBQztBQUZELHNFQUVDO0FBRUQsSUFBSSxxQkFBcUIsR0FBRyxTQUFxRSxDQUFDO0FBRWxHLFNBQWdCLDZCQUE2QixDQUFJLENBQW9FO0lBQ2pILHFCQUFxQixHQUFHLENBQUMsQ0FBQztBQUM5QixDQUFDO0FBRkQsc0VBRUM7QUFFRCxNQUFNLG1CQUFvQixTQUFRLEtBQUs7SUFDbkM7UUFDSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUM3QixDQUFDO0NBQ0o7QUFFRCxN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LENBQUM7UUFFeEMsS0FBSyxNQUFNLFlBQVksSUFBSSxhQUFhLEVBQUU7WUFDdEMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLFlBQVksQ0FBQyxDQUFDO1lBRWxFLElBQUksVUFBVSxLQUFLLFlBQVksRUFBRTtnQkFDN0IsTUFBTSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsWUFBWSxDQUFFLENBQUMsQ0FBQztnQkFDOUYsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7YUFDN0I7U0FDSjtJQUNMLENBQUM7Q0FDSjtBQTF6Q0QsOENBMHpDQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIGVzbGludC1kaXNhYmxlIHByZWZlci1yZXN0LXBhcmFtcywgbm8tdW51c2VkLXZhcnMgKi9cbmltcG9ydCB7IEtuZXggfSBmcm9tIFwia25leFwiO1xuaW1wb3J0IHsgZ2V0Q29sdW1uSW5mb3JtYXRpb24sIGdldENvbHVtblByb3BlcnRpZXMsIGdldFByaW1hcnlLZXlDb2x1bW4sIGdldFRhYmxlTmFtZSB9IGZyb20gXCIuL2RlY29yYXRvcnNcIjtcbmltcG9ydCB7IE5lc3RlZEZvcmVpZ25LZXlLZXlzT2YsIE5lc3RlZEtleXNPZiB9IGZyb20gXCIuL05lc3RlZEtleXNPZlwiO1xuaW1wb3J0IHsgTmVzdGVkUmVjb3JkIH0gZnJvbSBcIi4vTmVzdGVkUmVjb3JkXCI7XG5pbXBvcnQgeyBOb25Gb3JlaWduS2V5T2JqZWN0cyB9IGZyb20gXCIuL05vbkZvcmVpZ25LZXlPYmplY3RzXCI7XG5pbXBvcnQgeyBOb25OdWxsYWJsZVJlY3Vyc2l2ZSB9IGZyb20gXCIuL05vbk51bGxhYmxlUmVjdXJzaXZlXCI7XG5pbXBvcnQgeyBQYXJ0aWFsQW5kVW5kZWZpbmVkIH0gZnJvbSBcIi4vUGFydGlhbEFuZFVuZGVmaW5lZFwiO1xuaW1wb3J0IHsgR2V0TmVzdGVkUHJvcGVydHksIEdldE5lc3RlZFByb3BlcnR5VHlwZSB9IGZyb20gXCIuL1Byb3BlcnR5VHlwZXNcIjtcbmltcG9ydCB7IFNlbGVjdGFibGVDb2x1bW5UeXBlcyB9IGZyb20gXCIuL1NlbGVjdGFibGVDb2x1bW5UeXBlc1wiO1xuaW1wb3J0IHsgRmxhdHRlbk9wdGlvbiwgc2V0VG9OdWxsLCB1bmZsYXR0ZW4gfSBmcm9tIFwiLi91bmZsYXR0ZW5cIjtcblxuZXhwb3J0IGNsYXNzIFR5cGVkS25leCB7XG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBrbmV4OiBLbmV4KSB7fVxuXG4gICAgcHVibGljIHF1ZXJ5PFQ+KHRhYmxlQ2xhc3M6IG5ldyAoKSA9PiBULCBncmFudWxhcml0eT86IEdyYW51bGFyaXR5KTogSVR5cGVkUXVlcnlCdWlsZGVyPFQsIFQsIFQ+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBUeXBlZFF1ZXJ5QnVpbGRlcjxULCBULCBUPih0YWJsZUNsYXNzLCBncmFudWxhcml0eSwgdGhpcy5rbmV4KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYmVnaW5UcmFuc2FjdGlvbigpOiBQcm9taXNlPEtuZXguVHJhbnNhY3Rpb24+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmtuZXhcbiAgICAgICAgICAgICAgICAudHJhbnNhY3Rpb24oKHRyKSA9PiByZXNvbHZlKHRyKSlcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGlzIGVycm9yIGlzIG5vdCBjYXVnaHQgaGVyZSwgaXQgd2lsbCB0aHJvdywgcmVzdWx0aW5nIGluIGFuIHVuaGFuZGxlZFJlamVjdGlvblxuICAgICAgICAgICAgICAgIC5jYXRjaCgoX2UpID0+IHt9KTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5sZXQgYmVmb3JlSW5zZXJ0VHJhbnNmb3JtID0gdW5kZWZpbmVkIGFzIHVuZGVmaW5lZCB8ICgoaXRlbTogYW55LCB0eXBlZFF1ZXJ5QnVpbGRlcjogYW55KSA9PiBhbnkpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJCZWZvcmVJbnNlcnRUcmFuc2Zvcm08VD4oZjogKGl0ZW06IFQsIHR5cGVkUXVlcnlCdWlsZGVyOiBJVHlwZWRRdWVyeUJ1aWxkZXI8e30sIHt9LCB7fT4pID0+IFQpIHtcbiAgICBiZWZvcmVJbnNlcnRUcmFuc2Zvcm0gPSBmO1xufVxuXG5sZXQgYmVmb3JlVXBkYXRlVHJhbnNmb3JtID0gdW5kZWZpbmVkIGFzIHVuZGVmaW5lZCB8ICgoaXRlbTogYW55LCB0eXBlZFF1ZXJ5QnVpbGRlcjogYW55KSA9PiBhbnkpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJCZWZvcmVVcGRhdGVUcmFuc2Zvcm08VD4oZjogKGl0ZW06IFQsIHR5cGVkUXVlcnlCdWlsZGVyOiBJVHlwZWRRdWVyeUJ1aWxkZXI8e30sIHt9LCB7fT4pID0+IFQpIHtcbiAgICBiZWZvcmVVcGRhdGVUcmFuc2Zvcm0gPSBmO1xufVxuXG5jbGFzcyBOb3RJbXBsZW1lbnRlZEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlcihcIk5vdCBpbXBsZW1lbnRlZFwiKTtcbiAgICB9XG59XG5cbmNsYXNzIENvbHVtbkZyb21RdWVyeSB7XG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBhbGlhczogc3RyaW5nKSB7fVxuXG4gICAgcHVibGljIHRvU3RyaW5nKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5hbGlhcztcbiAgICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIGNvbHVtbnM6IHsgbmFtZTogc3RyaW5nIH1bXTtcblxuICAgIHdoZXJlOiBJV2hlcmVXaXRoT3BlcmF0b3I8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBhbmRXaGVyZTogSVdoZXJlV2l0aE9wZXJhdG9yPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZTogSVdoZXJlV2l0aE9wZXJhdG9yPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgd2hlcmVOb3Q6IElXaGVyZTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIHNlbGVjdDogSVNlbGVjdFdpdGhGdW5jdGlvbkNvbHVtbnMzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgc2VsZWN0UXVlcnk6IElTZWxlY3RRdWVyeTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgb3JkZXJCeTogSU9yZGVyQnk8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBpbm5lckpvaW5Db2x1bW46IElLZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgbGVmdE91dGVySm9pbkNvbHVtbjogSUtleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHdoZXJlQ29sdW1uOiBJV2hlcmVDb21wYXJlVHdvQ29sdW1uczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgd2hlcmVOdWxsOiBJQ29sdW1uUGFyYW1ldGVyTm9Sb3dUcmFuc2Zvcm1hdGlvbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIHdoZXJlTm90TnVsbDogSUNvbHVtblBhcmFtZXRlck5vUm93VHJhbnNmb3JtYXRpb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlTnVsbDogSUNvbHVtblBhcmFtZXRlck5vUm93VHJhbnNmb3JtYXRpb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlTm90TnVsbDogSUNvbHVtblBhcmFtZXRlck5vUm93VHJhbnNmb3JtYXRpb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGxlZnRPdXRlckpvaW5UYWJsZU9uRnVuY3Rpb246IElKb2luVGFibGVNdWx0aXBsZU9uQ2xhdXNlczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBpbm5lckpvaW5UYWJsZU9uRnVuY3Rpb246IElKb2luVGFibGVNdWx0aXBsZU9uQ2xhdXNlczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIGlubmVySm9pbjogSUpvaW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgbGVmdE91dGVySm9pbjogSUpvaW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBzZWxlY3RSYXc6IElTZWxlY3RSYXc8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBmaW5kQnlQcmltYXJ5S2V5OiBJRmluZEJ5UHJpbWFyeUtleTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIHdoZXJlSW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgd2hlcmVOb3RJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIG9yV2hlcmVJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlTm90SW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZUJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdEJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlQmV0d2VlbjogSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVOb3RCZXR3ZWVuOiBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZUV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBvcldoZXJlRXhpc3RzOiBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdEV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU5vdEV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZVBhcmVudGhlc2VzOiBJV2hlcmVQYXJlbnRoZXNlczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVQYXJlbnRoZXNlczogSVdoZXJlUGFyZW50aGVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGdyb3VwQnk6IElTZWxlY3RhYmxlQ29sdW1uS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nOiBJSGF2aW5nPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBoYXZpbmdOdWxsOiBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3ROdWxsOiBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGhhdmluZ0luOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGhhdmluZ05vdEluOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nRXhpc3RzOiBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3RFeGlzdHM6IElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nQmV0d2VlbjogSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGhhdmluZ05vdEJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHVuaW9uOiBJVW5pb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB1bmlvbkFsbDogSVVuaW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBtaW46IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgY291bnQ6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIGNvdW50RGlzdGluY3Q6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIG1heDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgc3VtOiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBzdW1EaXN0aW5jdDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgYXZnOiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBhdmdEaXN0aW5jdDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBpbnNlcnRTZWxlY3Q6IElJbnNlcnRTZWxlY3Q7XG5cbiAgICBpbnNlcnRJdGVtV2l0aFJldHVybmluZzogSUluc2VydEl0ZW1XaXRoUmV0dXJuaW5nPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgdXBkYXRlSXRlbVdpdGhSZXR1cm5pbmc6IElJbnNlcnRJdGVtV2l0aFJldHVybmluZzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgZ2V0Q29sdW1uQWxpYXMobmFtZTogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPik6IHN0cmluZztcbiAgICBnZXRDb2x1bW4obmFtZTogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPik6IENvbHVtbkZyb21RdWVyeTtcblxuICAgIGRpc3RpbmN0T24oY29sdW1uTmFtZXM6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj5bXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgY2xlYXJTZWxlY3QoKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIE1vZGVsPjtcbiAgICBjbGVhcldoZXJlKCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGNsZWFyT3JkZXIoKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBsaW1pdCh2YWx1ZTogbnVtYmVyKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb2Zmc2V0KHZhbHVlOiBudW1iZXIpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHVzZUtuZXhRdWVyeUJ1aWxkZXIoZjogKHF1ZXJ5OiBLbmV4LlF1ZXJ5QnVpbGRlcikgPT4gdm9pZCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGdldEtuZXhRdWVyeUJ1aWxkZXIoKTogS25leC5RdWVyeUJ1aWxkZXI7XG4gICAgdG9RdWVyeSgpOiBzdHJpbmc7XG5cbiAgICBnZXRGaXJzdE9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8KFJvdyBleHRlbmRzIE1vZGVsID8gUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+IDogUm93KSB8IG51bGw+O1xuICAgIGdldEZpcnN0T3JVbmRlZmluZWQoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdykgfCB1bmRlZmluZWQ+O1xuICAgIGdldEZpcnN0KGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTxSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdz47XG4gICAgZ2V0U2luZ2xlT3JOdWxsKGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTwoUm93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3cpIHwgbnVsbD47XG4gICAgZ2V0U2luZ2xlT3JVbmRlZmluZWQoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdykgfCB1bmRlZmluZWQ+O1xuICAgIGdldFNpbmdsZShmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8Um93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3c+O1xuICAgIGdldE1hbnkoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdylbXT47XG4gICAgZ2V0Q291bnQoKTogUHJvbWlzZTxudW1iZXIgfCBzdHJpbmc+O1xuICAgIGluc2VydEl0ZW0obmV3T2JqZWN0OiBQYXJ0aWFsQW5kVW5kZWZpbmVkPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4pOiBQcm9taXNlPHZvaWQ+O1xuICAgIGluc2VydEl0ZW1zKGl0ZW1zOiBQYXJ0aWFsQW5kVW5kZWZpbmVkPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj5bXSk6IFByb21pc2U8dm9pZD47XG4gICAgZGVsKCk6IFByb21pc2U8dm9pZD47XG4gICAgZGVsQnlQcmltYXJ5S2V5KHByaW1hcnlLZXlWYWx1ZTogYW55KTogUHJvbWlzZTx2b2lkPjtcbiAgICB1cGRhdGVJdGVtKGl0ZW06IFBhcnRpYWxBbmRVbmRlZmluZWQ8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+Pik6IFByb21pc2U8dm9pZD47XG4gICAgdXBkYXRlSXRlbUJ5UHJpbWFyeUtleShwcmltYXJ5S2V5VmFsdWU6IGFueSwgaXRlbTogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+KTogUHJvbWlzZTx2b2lkPjtcbiAgICB1cGRhdGVJdGVtc0J5UHJpbWFyeUtleShcbiAgICAgICAgaXRlbXM6IHtcbiAgICAgICAgICAgIHByaW1hcnlLZXlWYWx1ZTogYW55O1xuICAgICAgICAgICAgZGF0YTogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+O1xuICAgICAgICB9W11cbiAgICApOiBQcm9taXNlPHZvaWQ+O1xuICAgIGV4ZWN1dGUoKTogUHJvbWlzZTx2b2lkPjtcbiAgICB3aGVyZVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgaGF2aW5nUmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHRyYW5zYWN0aW5nKHRyeDogS25leC5UcmFuc2FjdGlvbik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgdHJ1bmNhdGUoKTogUHJvbWlzZTx2b2lkPjtcbiAgICBkaXN0aW5jdCgpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGNsb25lKCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgZ3JvdXBCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBvcmRlckJ5UmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGtlZXBGbGF0KCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBhbnk+O1xufVxuXG50eXBlIFJldHVybk5vbk9iamVjdHNOYW1lc09ubHk8VD4gPSB7IFtLIGluIGtleW9mIFRdOiBUW0tdIGV4dGVuZHMgU2VsZWN0YWJsZUNvbHVtblR5cGVzID8gSyA6IG5ldmVyIH1ba2V5b2YgVF07XG5cbnR5cGUgUmVtb3ZlT2JqZWN0c0Zyb208VD4gPSB7IFtQIGluIFJldHVybk5vbk9iamVjdHNOYW1lc09ubHk8VD5dOiBUW1BdIH07XG5cbmV4cG9ydCB0eXBlIE9iamVjdFRvUHJpbWl0aXZlPFQ+ID0gVCBleHRlbmRzIFN0cmluZyA/IHN0cmluZyA6IFQgZXh0ZW5kcyBOdW1iZXIgPyBudW1iZXIgOiBUIGV4dGVuZHMgQm9vbGVhbiA/IGJvb2xlYW4gOiBuZXZlcjtcblxuZXhwb3J0IHR5cGUgT3BlcmF0b3IgPSBcIj1cIiB8IFwiIT1cIiB8IFwiPlwiIHwgXCI8XCIgfCBzdHJpbmc7XG5cbmludGVyZmFjZSBJQ29uc3RydWN0b3I8VD4ge1xuICAgIG5ldyAoLi4uYXJnczogYW55W10pOiBUO1xufVxuXG5leHBvcnQgdHlwZSBBZGRQcm9wZXJ0eVdpdGhUeXBlPE9yaWdpbmFsLCBOZXdLZXkgZXh0ZW5kcyBrZXlvZiBhbnksIE5ld0tleVR5cGU+ID0gT3JpZ2luYWwgJiBOZXN0ZWRSZWNvcmQ8TmV3S2V5LCBOZXdLZXlUeXBlPjtcblxuaW50ZXJmYWNlIElJbnNlcnRJdGVtV2l0aFJldHVybmluZzxNb2RlbCwgX1NlbGVjdGFibGVNb2RlbCwgX1Jvdz4ge1xuICAgIChuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+Pik6IFByb21pc2U8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+PjtcbiAgICA8S2V5cyBleHRlbmRzIGtleW9mIFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4obmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4sIGtleXM6IEtleXNbXSk6IFByb21pc2U8UGljazxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4sIEtleXM+Pjtcbn1cblxuaW50ZXJmYWNlIElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5PbjxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICA8Q29uY2F0S2V5MSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4sIENvbmNhdEtleTIgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihcbiAgICAgICAga2V5MTogQ29uY2F0S2V5MSxcbiAgICAgICAgb3BlcmF0b3I6IE9wZXJhdG9yLFxuICAgICAgICBrZXkyOiBDb25jYXRLZXkyXG4gICAgKTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElKb2luT25WYWw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBvcGVyYXRvcjogT3BlcmF0b3IsIHZhbHVlOiBhbnkpOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5Pbk51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5KTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD4ge1xuICAgIG9uOiBJSm9pbk9uPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPbjogSUpvaW5PbjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIGFuZE9uOiBJSm9pbk9uPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25WYWw6IElKb2luT25WYWw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBhbmRPblZhbDogSUpvaW5PblZhbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25WYWw6IElKb2luT25WYWw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvbk51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSW5zZXJ0U2VsZWN0IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TmV3UHJvcGVydHlUeXBlPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TmV3UHJvcGVydHlUeXBlPiwgXCJcIj4+KFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICAuLi5jb2x1bW5OYW1lczogQ29uY2F0S2V5W11cbiAgICApOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5UYWJsZU11bHRpcGxlT25DbGF1c2VzPE1vZGVsLCBfU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueT4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgTmV3UHJvcGVydHlUeXBlPikgPT4gdm9pZFxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgQWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIFJvdz47XG5cbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueT4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LFxuICAgICAgICBvbjogKGpvaW46IElKb2luT25DbGF1c2UyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBOZXdQcm9wZXJ0eVR5cGU+KSA9PiB2b2lkXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElKb2luPE1vZGVsLCBfU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueSwgQ29uY2F0S2V5MiBleHRlbmRzIGtleW9mIE5ld1Byb3BlcnR5VHlwZSwgQ29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAga2V5OiBDb25jYXRLZXkyLFxuICAgICAgICBvcGVyYXRvcjogT3BlcmF0b3IsXG4gICAgICAgIGtleTI6IENvbmNhdEtleVxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgQWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIFJvdz47XG5cbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueSwgQ29uY2F0S2V5MiBleHRlbmRzIGtleW9mIE5ld1Byb3BlcnR5VHlwZSwgQ29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LFxuICAgICAgICBrZXk6IENvbmNhdEtleTIsXG4gICAgICAgIG9wZXJhdG9yOiBPcGVyYXRvcixcbiAgICAgICAga2V5MjogQ29uY2F0S2V5XG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElTZWxlY3RSYXc8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPFRSZXR1cm4gZXh0ZW5kcyBCb29sZWFuIHwgU3RyaW5nIHwgTnVtYmVyLCBUTmFtZSBleHRlbmRzIGtleW9mIGFueT4obmFtZTogVE5hbWUsIHJldHVyblR5cGU6IElDb25zdHJ1Y3RvcjxUUmV0dXJuPiwgcXVlcnk6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPFxuICAgICAgICBNb2RlbCxcbiAgICAgICAgU2VsZWN0YWJsZU1vZGVsLFxuICAgICAgICBSZWNvcmQ8VE5hbWUsIE9iamVjdFRvUHJpbWl0aXZlPFRSZXR1cm4+PiAmIFJvd1xuICAgID47XG59XG5cbmludGVyZmFjZSBJU2VsZWN0UXVlcnk8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPFRSZXR1cm4gZXh0ZW5kcyBCb29sZWFuIHwgU3RyaW5nIHwgTnVtYmVyLCBUTmFtZSBleHRlbmRzIGtleW9mIGFueSwgU3ViUXVlcnlNb2RlbD4oXG4gICAgICAgIG5hbWU6IFROYW1lLFxuICAgICAgICByZXR1cm5UeXBlOiBJQ29uc3RydWN0b3I8VFJldHVybj4sXG4gICAgICAgIHN1YlF1ZXJ5TW9kZWw6IG5ldyAoKSA9PiBTdWJRdWVyeU1vZGVsLFxuICAgICAgICBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4sIHBhcmVudDogVHJhbnNmb3JtUHJvcHNUb0Z1bmN0aW9uc1JldHVyblByb3BlcnR5TmFtZTxNb2RlbD4pID0+IHZvaWQsXG4gICAgICAgIGdyYW51bGFyaXR5PzogR3JhbnVsYXJpdHlcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUmVjb3JkPFROYW1lLCBPYmplY3RUb1ByaW1pdGl2ZTxUUmV0dXJuPj4gJiBSb3c+O1xufVxuXG50eXBlIFRyYW5zZm9ybVByb3BzVG9GdW5jdGlvbnNSZXR1cm5Qcm9wZXJ0eU5hbWU8TW9kZWw+ID0ge1xuICAgIFtQIGluIGtleW9mIE1vZGVsXTogTW9kZWxbUF0gZXh0ZW5kcyBvYmplY3QgPyAoTW9kZWxbUF0gZXh0ZW5kcyBSZXF1aXJlZDxOb25Gb3JlaWduS2V5T2JqZWN0cz4gPyAoKSA9PiBQIDogVHJhbnNmb3JtUHJvcHNUb0Z1bmN0aW9uc1JldHVyblByb3BlcnR5TmFtZTxNb2RlbFtQXT4pIDogKCkgPT4gUDtcbn07XG5cbmludGVyZmFjZSBJT3JkZXJCeTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIFwiXCI+LCBUTmFtZSBleHRlbmRzIGtleW9mIGFueT4oXG4gICAgICAgIGNvbHVtbk5hbWVzOiBDb25jYXRLZXksXG4gICAgICAgIGRpcmVjdGlvbj86IFwiYXNjXCIgfCBcImRlc2NcIlxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgJiBSZWNvcmQ8VE5hbWUsIEdldE5lc3RlZFByb3BlcnR5VHlwZTxTZWxlY3RhYmxlTW9kZWwsIENvbmNhdEtleT4+Pjtcbn1cblxuaW50ZXJmYWNlIElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwgXCJcIj4sIFROYW1lIGV4dGVuZHMga2V5b2YgYW55Pihjb2x1bW5OYW1lczogQ29uY2F0S2V5LCBuYW1lOiBUTmFtZSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxcbiAgICAgICAgTW9kZWwsXG4gICAgICAgIFNlbGVjdGFibGVNb2RlbCxcbiAgICAgICAgUm93ICYgUmVjb3JkPFROYW1lLCBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8U2VsZWN0YWJsZU1vZGVsLCBDb25jYXRLZXk+PlxuICAgID47XG59XG5cbnR5cGUgVW5pb25Ub0ludGVyc2VjdGlvbjxVPiA9IChVIGV4dGVuZHMgYW55ID8gKGs6IFUpID0+IHZvaWQgOiBuZXZlcikgZXh0ZW5kcyAoazogaW5mZXIgSSkgPT4gdm9pZCA/IEkgOiBuZXZlcjtcblxuaW50ZXJmYWNlIElTZWxlY3RXaXRoRnVuY3Rpb25Db2x1bW5zMzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIFwiXCI+PiguLi5jb2x1bW5OYW1lczogQ29uY2F0S2V5W10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJvdyAmIFVuaW9uVG9JbnRlcnNlY3Rpb248R2V0TmVzdGVkUHJvcGVydHk8U2VsZWN0YWJsZU1vZGVsLCBDb25jYXRLZXk+PlxuICAgID47XG59XG5cbmludGVyZmFjZSBJRmluZEJ5UHJpbWFyeUtleTxfTW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBcIlwiPj4ocHJpbWFyeUtleVZhbHVlOiBhbnksIC4uLmNvbHVtbk5hbWVzOiBDb25jYXRLZXlbXSk6IFByb21pc2U8XG4gICAgICAgIChSb3cgJiBVbmlvblRvSW50ZXJzZWN0aW9uPEdldE5lc3RlZFByb3BlcnR5PFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj4pIHwgdW5kZWZpbmVkXG4gICAgPjtcbn1cblxuaW50ZXJmYWNlIElLZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRGb3JlaWduS2V5S2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXksIGdyYW51bGFyaXR5PzogR3JhbnVsYXJpdHkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElTZWxlY3RhYmxlQ29sdW1uS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXksIHZhbHVlOiBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT4pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZVdpdGhPcGVyYXRvcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXksIHZhbHVlOiBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT4pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgb3BlcmF0b3I6IE9wZXJhdG9yLCB2YWx1ZTogR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+KTogSVR5cGVkUXVlcnlCdWlsZGVyPFxuICAgICAgICBNb2RlbCxcbiAgICAgICAgU2VsZWN0YWJsZU1vZGVsLFxuICAgICAgICBSb3dcbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCB2YWx1ZTogR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+W10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4sIFByb3BlcnR5VHlwZSBleHRlbmRzIEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5Pj4oXG4gICAgICAgIGtleTogQ29uY2F0S2V5LFxuICAgICAgICB2YWx1ZTogW1Byb3BlcnR5VHlwZSwgUHJvcGVydHlUeXBlXVxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSUhhdmluZzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXksIG9wZXJhdG9yOiBPcGVyYXRvciwgdmFsdWU6IEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5Pik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxcbiAgICAgICAgTW9kZWwsXG4gICAgICAgIFNlbGVjdGFibGVNb2RlbCxcbiAgICAgICAgUm93XG4gICAgPjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZUNvbXBhcmVUd29Db2x1bW5zPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxfUHJvcGVydHlUeXBlMSwgX1Byb3BlcnR5VHlwZTIsIE1vZGVsMj4oXG4gICAgICAgIGtleTE6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4sXG4gICAgICAgIG9wZXJhdG9yOiBPcGVyYXRvcixcbiAgICAgICAga2V5MjogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsMj4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsMj4sIFwiXCI+XG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICAoa2V5MTogQ29sdW1uRnJvbVF1ZXJ5LCBvcGVyYXRvcjogT3BlcmF0b3IsIGtleTI6IENvbHVtbkZyb21RdWVyeSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxTdWJRdWVyeU1vZGVsPihcbiAgICAgICAgc3ViUXVlcnlNb2RlbDogbmV3ICgpID0+IFN1YlF1ZXJ5TW9kZWwsXG4gICAgICAgIGNvZGU6IChzdWJRdWVyeTogSVR5cGVkUXVlcnlCdWlsZGVyPFN1YlF1ZXJ5TW9kZWwsIFN1YlF1ZXJ5TW9kZWwsIHt9PiwgcGFyZW50OiBUcmFuc2Zvcm1Qcm9wc1RvRnVuY3Rpb25zUmV0dXJuUHJvcGVydHlOYW1lPFNlbGVjdGFibGVNb2RlbD4pID0+IHZvaWRcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIDxTdWJRdWVyeU1vZGVsPihcbiAgICAgICAgc3ViUXVlcnlNb2RlbDogbmV3ICgpID0+IFN1YlF1ZXJ5TW9kZWwsXG4gICAgICAgIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSxcbiAgICAgICAgY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8U3ViUXVlcnlNb2RlbCwgU3ViUXVlcnlNb2RlbCwge30+LCBwYXJlbnQ6IFRyYW5zZm9ybVByb3BzVG9GdW5jdGlvbnNSZXR1cm5Qcm9wZXJ0eU5hbWU8U2VsZWN0YWJsZU1vZGVsPikgPT4gdm9pZFxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVdoZXJlUGFyZW50aGVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgKGNvZGU6IChzdWJRdWVyeTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4pID0+IHZvaWQpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElVbmlvbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8U3ViUXVlcnlNb2RlbD4oc3ViUXVlcnlNb2RlbDogbmV3ICgpID0+IFN1YlF1ZXJ5TW9kZWwsIGNvZGU6IChzdWJRdWVyeTogSVR5cGVkUXVlcnlCdWlsZGVyPFN1YlF1ZXJ5TW9kZWwsIFN1YlF1ZXJ5TW9kZWwsIHt9PikgPT4gdm9pZCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgPFN1YlF1ZXJ5TW9kZWw+KHN1YlF1ZXJ5TW9kZWw6IG5ldyAoKSA9PiBTdWJRdWVyeU1vZGVsLCBncmFudWxhcml0eTogR3JhbnVsYXJpdHksIGNvZGU6IChzdWJRdWVyeTogSVR5cGVkUXVlcnlCdWlsZGVyPFN1YlF1ZXJ5TW9kZWwsIFN1YlF1ZXJ5TW9kZWwsIHt9PikgPT4gdm9pZCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG50eXBlIEdyYW51bGFyaXR5ID0gXCJQQUdMT0NLXCIgfCBcIk5PTE9DS1wiIHwgXCJSRUFEQ09NTUlUVEVETE9DS1wiIHwgXCJST1dMT0NLXCIgfCBcIlRBQkxPQ0tcIiB8IFwiVEFCTE9DS1hcIjtcblxuZnVuY3Rpb24gZ2V0UHJveHlBbmRNZW1vcmllczxNb2RlbFR5cGUsIFJvdz4odHlwZWRRdWVyeUJ1aWxkZXI/OiBUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbFR5cGUsIFJvdz4pIHtcbiAgICBjb25zdCBtZW1vcmllcyA9IFtdIGFzIHN0cmluZ1tdO1xuXG4gICAgZnVuY3Rpb24gYWxsR2V0KF90YXJnZXQ6IGFueSwgbmFtZTogYW55KTogYW55IHtcbiAgICAgICAgaWYgKG5hbWUgPT09IFwibWVtb3JpZXNcIikge1xuICAgICAgICAgICAgcmV0dXJuIG1lbW9yaWVzO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG5hbWUgPT09IFwiZ2V0Q29sdW1uTmFtZVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZWRRdWVyeUJ1aWxkZXIhLmdldENvbHVtbk5hbWUoLi4ubWVtb3JpZXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBtZW1vcmllcy5wdXNoKG5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJveHkoXG4gICAgICAgICAgICB7fSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCByb290ID0gbmV3IFByb3h5KFxuICAgICAgICB7fSxcbiAgICAgICAge1xuICAgICAgICAgICAgZ2V0OiBhbGxHZXQsXG4gICAgICAgIH1cbiAgICApO1xuXG4gICAgcmV0dXJuIHsgcm9vdCwgbWVtb3JpZXMgfTtcbn1cblxuZnVuY3Rpb24gZ2V0UHJveHlBbmRNZW1vcmllc0ZvckFycmF5PE1vZGVsVHlwZSwgUm93Pih0eXBlZFF1ZXJ5QnVpbGRlcj86IFR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsVHlwZSwgUm93Pikge1xuICAgIGNvbnN0IHJlc3VsdCA9IFtdIGFzIHN0cmluZ1tdW107XG5cbiAgICBsZXQgY291bnRlciA9IC0xO1xuXG4gICAgZnVuY3Rpb24gYWxsR2V0KF90YXJnZXQ6IGFueSwgbmFtZTogYW55KTogYW55IHtcbiAgICAgICAgaWYgKF90YXJnZXQubGV2ZWwgPT09IDApIHtcbiAgICAgICAgICAgIGNvdW50ZXIrKztcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKFtdKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobmFtZSA9PT0gXCJtZW1vcmllc1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0W2NvdW50ZXJdO1xuICAgICAgICB9XG4gICAgICAgIGlmIChuYW1lID09PSBcInJlc3VsdFwiKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChuYW1lID09PSBcImxldmVsXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBfdGFyZ2V0LmxldmVsO1xuICAgICAgICB9XG4gICAgICAgIGlmIChuYW1lID09PSBcImdldENvbHVtbk5hbWVcIikge1xuICAgICAgICAgICAgcmV0dXJuIHR5cGVkUXVlcnlCdWlsZGVyIS5nZXRDb2x1bW5OYW1lKC4uLnJlc3VsdFtjb3VudGVyXSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXN1bHRbY291bnRlcl0ucHVzaChuYW1lKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb3h5KFxuICAgICAgICAgICAge30sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZ2V0OiBhbGxHZXQsXG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgcm9vdCA9IG5ldyBQcm94eShcbiAgICAgICAgeyBsZXZlbDogMCB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICByZXR1cm4geyByb290LCByZXN1bHQgfTtcbn1cblxuZXhwb3J0IGNsYXNzIFR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsVHlwZSwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgPSB7fT4gaW1wbGVtZW50cyBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIHB1YmxpYyBjb2x1bW5zOiB7IG5hbWU6IHN0cmluZyB9W107XG5cbiAgICBwdWJsaWMgb25seUxvZ1F1ZXJ5ID0gZmFsc2U7XG4gICAgcHVibGljIHF1ZXJ5TG9nID0gXCJcIjtcbiAgICBwcml2YXRlIGhhc1NlbGVjdENsYXVzZSA9IGZhbHNlO1xuXG4gICAgcHJpdmF0ZSBxdWVyeUJ1aWxkZXI6IEtuZXguUXVlcnlCdWlsZGVyO1xuICAgIHByaXZhdGUgdGFibGVOYW1lOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBzaG91bGRVbmZsYXR0ZW46IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBleHRyYUpvaW5lZFByb3BlcnRpZXM6IHtcbiAgICAgICAgbmFtZTogc3RyaW5nO1xuICAgICAgICBwcm9wZXJ0eVR5cGU6IG5ldyAoKSA9PiBhbnk7XG4gICAgfVtdO1xuXG4gICAgcHJpdmF0ZSB0cmFuc2FjdGlvbj86IEtuZXguVHJhbnNhY3Rpb247XG5cbiAgICBwcml2YXRlIHN1YlF1ZXJ5Q291bnRlciA9IDA7XG5cbiAgICBwcml2YXRlIGdyYW51bGFyaXR5U2V0OiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8R3JhbnVsYXJpdHk+KFtcIk5PTE9DS1wiLCBcIlBBR0xPQ0tcIiwgXCJSRUFEQ09NTUlUVEVETE9DS1wiLCBcIlJPV0xPQ0tcIiwgXCJUQUJMT0NLXCIsIFwiVEFCTE9DS1hcIl0pO1xuXG4gICAgY29uc3RydWN0b3IoXG4gICAgICAgIHByaXZhdGUgdGFibGVDbGFzczogbmV3ICgpID0+IE1vZGVsVHlwZSxcbiAgICAgICAgcHJpdmF0ZSBncmFudWxhcml0eTogR3JhbnVsYXJpdHkgfCB1bmRlZmluZWQsXG4gICAgICAgIHByaXZhdGUga25leDogS25leCxcbiAgICAgICAgcXVlcnlCdWlsZGVyPzogS25leC5RdWVyeUJ1aWxkZXIsXG4gICAgICAgIHByaXZhdGUgcGFyZW50VHlwZWRRdWVyeUJ1aWxkZXI/OiBhbnksXG4gICAgICAgIHByaXZhdGUgc3ViUXVlcnlQcmVmaXg/OiBzdHJpbmdcbiAgICApIHtcbiAgICAgICAgdGhpcy50YWJsZU5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVDbGFzcyk7XG4gICAgICAgIHRoaXMuY29sdW1ucyA9IGdldENvbHVtblByb3BlcnRpZXModGFibGVDbGFzcyk7XG5cbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHlRdWVyeSA9ICFncmFudWxhcml0eSA/IFwiXCIgOiBgIFdJVEggKCR7Z3JhbnVsYXJpdHl9KWA7XG4gICAgICAgIGlmIChxdWVyeUJ1aWxkZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIgPSBxdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAodGhpcy5zdWJRdWVyeVByZWZpeCkge1xuICAgICAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmZyb20odGhpcy5rbmV4LnJhdyhgPz8gYXMgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RoaXMudGFibGVOYW1lLCBgJHt0aGlzLnN1YlF1ZXJ5UHJlZml4fSR7dGhpcy50YWJsZU5hbWV9YF0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZnJvbSh0aGlzLmtuZXgucmF3KGA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGhpcy50YWJsZU5hbWVdKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlciA9IHRoaXMua25leC5mcm9tKHRoaXMua25leC5yYXcoYD8/JHtncmFudWxhcml0eVF1ZXJ5fWAsIFt0aGlzLnRhYmxlTmFtZV0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZXh0cmFKb2luZWRQcm9wZXJ0aWVzID0gW107XG4gICAgICAgIHRoaXMuc2hvdWxkVW5mbGF0dGVuID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0TmV4dFN1YlF1ZXJ5UHJlZml4KCkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBgJHt0aGlzLnN1YlF1ZXJ5UHJlZml4ID8/IFwiXCJ9c3VicXVlcnkke3RoaXMuc3ViUXVlcnlDb3VudGVyfSRgO1xuICAgICAgICB0aGlzLnN1YlF1ZXJ5Q291bnRlcisrO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBrZWVwRmxhdCgpIHtcbiAgICAgICAgdGhpcy5zaG91bGRVbmZsYXR0ZW4gPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGdldENvbHVtbkFsaWFzKG5hbWU6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5rbmV4LnJhdyhcIj8/XCIsIHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5uYW1lLnNwbGl0KFwiLlwiKSkpLnRvUXVlcnkoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q29sdW1uKG5hbWU6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gbmV3IENvbHVtbkZyb21RdWVyeSh0aGlzLmdldENvbHVtbkFsaWFzKG5hbWUpKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZGlzdGluY3RPbihjb2x1bW5OYW1lczogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsVHlwZT4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsVHlwZT4sIFwiXCI+W10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgICAgICBjb25zdCBtYXBwZWRDb2x1bW5OYW1lcyA9IGNvbHVtbk5hbWVzLm1hcCgoY29sdW1uTmFtZSkgPT4gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbk5hbWUuc3BsaXQoXCIuXCIpKSk7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmRpc3RpbmN0T24obWFwcGVkQ29sdW1uTmFtZXMpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZGVsKCkge1xuICAgICAgICBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlci5kZWwoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZGVsQnlQcmltYXJ5S2V5KHZhbHVlOiBhbnkpIHtcbiAgICAgICAgY29uc3QgcHJpbWFyeUtleUNvbHVtbkluZm8gPSBnZXRQcmltYXJ5S2V5Q29sdW1uKHRoaXMudGFibGVDbGFzcyk7XG5cbiAgICAgICAgYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXIuZGVsKCkud2hlcmUocHJpbWFyeUtleUNvbHVtbkluZm8ubmFtZSwgdmFsdWUpO1xuICAgIH1cblxuICAgIHB1YmxpYyB1cGRhdGVJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pOiBQcm9taXNlPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+O1xuICAgIHB1YmxpYyB1cGRhdGVJdGVtV2l0aFJldHVybmluZzxLZXlzIGV4dGVuZHMga2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4obmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+LCBrZXlzOiBLZXlzW10pOiBQcm9taXNlPFBpY2s8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPiwgS2V5cz4+O1xuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4sIHJldHVyblByb3BlcnRpZXM/OiAoa2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPilbXSkge1xuICAgICAgICBsZXQgaXRlbSA9IG5ld09iamVjdDtcbiAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShuZXdPYmplY3QsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKTtcbiAgICAgICAgaWYgKHJldHVyblByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hcHBlZE5hbWVzID0gcmV0dXJuUHJvcGVydGllcy5tYXAoKGNvbHVtbk5hbWUpID0+IHRoaXMuZ2V0Q29sdW1uTmFtZShjb2x1bW5OYW1lIGFzIHN0cmluZykpO1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKG1hcHBlZE5hbWVzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHF1ZXJ5LnJldHVybmluZyhcIipcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gcXVlcnkudG9RdWVyeSgpICsgXCJcXG5cIjtcblxuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IChhd2FpdCBxdWVyeSkgYXMgYW55O1xuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHJvd3NbMF07XG5cbiAgICAgICAgICAgIHRoaXMubWFwQ29sdW1uc1RvUHJvcGVydGllcyhpdGVtKTtcblxuICAgICAgICAgICAgcmV0dXJuIGl0ZW07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgaW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmcobmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+KTogUHJvbWlzZTxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+PjtcbiAgICBwdWJsaWMgaW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmc8S2V5cyBleHRlbmRzIGtleW9mIFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+KG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+Piwga2V5czogS2V5c1tdKTogUHJvbWlzZTxQaWNrPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4sIEtleXM+PjtcbiAgICBwdWJsaWMgYXN5bmMgaW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmcobmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+LCByZXR1cm5Qcm9wZXJ0aWVzPzogKGtleW9mIFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4pW10pIHtcbiAgICAgICAgbGV0IGl0ZW0gPSBuZXdPYmplY3Q7XG4gICAgICAgIGlmIChiZWZvcmVJbnNlcnRUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGl0ZW0gPSBiZWZvcmVJbnNlcnRUcmFuc2Zvcm0obmV3T2JqZWN0LCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm1hcFByb3BlcnRpZXNUb0NvbHVtbnModGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLmluc2VydChpdGVtKTtcbiAgICAgICAgaWYgKHJldHVyblByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hcHBlZE5hbWVzID0gcmV0dXJuUHJvcGVydGllcy5tYXAoKGNvbHVtbk5hbWUpID0+IHRoaXMuZ2V0Q29sdW1uTmFtZShjb2x1bW5OYW1lIGFzIHN0cmluZykpO1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKG1hcHBlZE5hbWVzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHF1ZXJ5LnJldHVybmluZyhcIipcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gcXVlcnkudG9RdWVyeSgpICsgXCJcXG5cIjtcblxuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3Qgcm93cyA9IGF3YWl0IHF1ZXJ5O1xuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHJvd3NbMF07XG5cbiAgICAgICAgICAgIHRoaXMubWFwQ29sdW1uc1RvUHJvcGVydGllcyhpdGVtKTtcblxuICAgICAgICAgICAgcmV0dXJuIGl0ZW07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgaW5zZXJ0SXRlbShuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pIHtcbiAgICAgICAgYXdhaXQgdGhpcy5pbnNlcnRJdGVtcyhbbmV3T2JqZWN0XSk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGluc2VydEl0ZW1zKGl0ZW1zOiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+W10pIHtcbiAgICAgICAgaXRlbXMgPSBbLi4uaXRlbXNdO1xuXG4gICAgICAgIGlmIChiZWZvcmVJbnNlcnRUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGl0ZW1zID0gaXRlbXMubWFwKChpdGVtKSA9PiBiZWZvcmVJbnNlcnRUcmFuc2Zvcm0hKGl0ZW0sIHRoaXMpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKSk7XG5cbiAgICAgICAgd2hpbGUgKGl0ZW1zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IGNodW5rID0gaXRlbXMuc3BsaWNlKDAsIDUwMCk7XG4gICAgICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLmNsb25lKCkuaW5zZXJ0KGNodW5rKTtcbiAgICAgICAgICAgIGlmICh0aGlzLnRyYW5zYWN0aW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBxdWVyeS50cmFuc2FjdGluZyh0aGlzLnRyYW5zYWN0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gcXVlcnkudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgcXVlcnk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdXBkYXRlSXRlbShpdGVtOiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+KSB7XG4gICAgICAgIGlmIChiZWZvcmVVcGRhdGVUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGl0ZW0gPSBiZWZvcmVVcGRhdGVUcmFuc2Zvcm0oaXRlbSwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1hcFByb3BlcnRpZXNUb0NvbHVtbnMoaXRlbSk7XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci51cGRhdGUoaXRlbSkudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVJdGVtQnlQcmltYXJ5S2V5KHByaW1hcnlLZXlWYWx1ZTogYW55LCBpdGVtOiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+KSB7XG4gICAgICAgIGlmIChiZWZvcmVVcGRhdGVUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGl0ZW0gPSBiZWZvcmVVcGRhdGVUcmFuc2Zvcm0oaXRlbSwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1hcFByb3BlcnRpZXNUb0NvbHVtbnMoaXRlbSk7XG5cbiAgICAgICAgY29uc3QgcHJpbWFyeUtleUNvbHVtbkluZm8gPSBnZXRQcmltYXJ5S2V5Q29sdW1uKHRoaXMudGFibGVDbGFzcyk7XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJ5QnVpbGRlci51cGRhdGUoaXRlbSkud2hlcmUocHJpbWFyeUtleUNvbHVtbkluZm8ubmFtZSwgcHJpbWFyeUtleVZhbHVlKTtcblxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gcXVlcnkudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGF3YWl0IHF1ZXJ5O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZUl0ZW1zQnlQcmltYXJ5S2V5KFxuICAgICAgICBpdGVtczoge1xuICAgICAgICAgICAgcHJpbWFyeUtleVZhbHVlOiBhbnk7XG4gICAgICAgICAgICBkYXRhOiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+O1xuICAgICAgICB9W11cbiAgICApIHtcbiAgICAgICAgY29uc3QgcHJpbWFyeUtleUNvbHVtbkluZm8gPSBnZXRQcmltYXJ5S2V5Q29sdW1uKHRoaXMudGFibGVDbGFzcyk7XG5cbiAgICAgICAgaXRlbXMgPSBbLi4uaXRlbXNdO1xuICAgICAgICB3aGlsZSAoaXRlbXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgY2h1bmsgPSBpdGVtcy5zcGxpY2UoMCwgNTAwKTtcblxuICAgICAgICAgICAgbGV0IHNxbCA9IFwiXCI7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgY2h1bmspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLmNsb25lKCk7XG4gICAgICAgICAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgICAgICBpdGVtLmRhdGEgPSBiZWZvcmVVcGRhdGVUcmFuc2Zvcm0oaXRlbS5kYXRhLCB0aGlzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5tYXBQcm9wZXJ0aWVzVG9Db2x1bW5zKGl0ZW0uZGF0YSk7XG5cbiAgICAgICAgICAgICAgICBxdWVyeS51cGRhdGUoaXRlbS5kYXRhKTtcbiAgICAgICAgICAgICAgICBzcWwgKz0gcXVlcnkud2hlcmUocHJpbWFyeUtleUNvbHVtbkluZm8ubmFtZSwgaXRlbS5wcmltYXJ5S2V5VmFsdWUpLnRvU3RyaW5nKCkucmVwbGFjZShcIj9cIiwgXCJcXFxcP1wiKSArIFwiO1xcblwiO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBmaW5hbFF1ZXJ5ID0gdGhpcy5rbmV4LnJhdyhzcWwpO1xuICAgICAgICAgICAgaWYgKHRoaXMudHJhbnNhY3Rpb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGZpbmFsUXVlcnkudHJhbnNhY3RpbmcodGhpcy50cmFuc2FjdGlvbik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gZmluYWxRdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBmaW5hbFF1ZXJ5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGUoKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyO1xuICAgIH1cblxuICAgIHB1YmxpYyBsaW1pdCh2YWx1ZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmxpbWl0KHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBvZmZzZXQodmFsdWU6IG51bWJlcikge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5vZmZzZXQodmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGZpbmRCeUlkKGlkOiBzdHJpbmcsIGNvbHVtbnM6IChrZXlvZiBNb2RlbFR5cGUpW10pIHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyXG4gICAgICAgICAgICAuc2VsZWN0KGNvbHVtbnMgYXMgYW55KVxuICAgICAgICAgICAgLndoZXJlKHRoaXMudGFibGVOYW1lICsgXCIuaWRcIiwgaWQpXG4gICAgICAgICAgICAuZmlyc3QoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0Q291bnQoKSB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuY291bnQoeyBjb3VudDogXCIqXCIgfSk7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1ZXJ5O1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFswXS5jb3VudDtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0Rmlyc3RPck51bGwoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAoIWl0ZW1zIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXNbMF0sIGZsYXR0ZW5PcHRpb24pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHB1YmxpYyBhc3luYyBnZXRGaXJzdE9yVW5kZWZpbmVkKCkge1xuICAgICAgICBjb25zdCBmaXJzdE9yTnVsbFJlc3VsdCA9IGF3YWl0IHRoaXMuZ2V0Rmlyc3RPck51bGwoKTtcbiAgICAgICAgaWYgKGZpcnN0T3JOdWxsUmVzdWx0ID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmaXJzdE9yTnVsbFJlc3VsdDtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0Rmlyc3QoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAoIWl0ZW1zIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkl0ZW0gbm90IGZvdW5kLlwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmxhdHRlbkJ5T3B0aW9uKGl0ZW1zWzBdLCBmbGF0dGVuT3B0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRTaW5nbGVPck51bGwoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAoIWl0ZW1zIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpdGVtcy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNb3JlIHRoYW4gb25lIGl0ZW0gZm91bmQ6ICR7aXRlbXMubGVuZ3RofS5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZsYXR0ZW5CeU9wdGlvbihpdGVtc1swXSwgZmxhdHRlbk9wdGlvbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0U2luZ2xlT3JVbmRlZmluZWQoKSB7XG4gICAgICAgIGNvbnN0IHNpbmdsZU9yTnVsbFJlc3VsdCA9IGF3YWl0IHRoaXMuZ2V0U2luZ2xlT3JOdWxsKCk7XG4gICAgICAgIGlmIChzaW5nbGVPck51bGxSZXN1bHQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNpbmdsZU9yTnVsbFJlc3VsdDtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0U2luZ2xlKGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKSB7XG4gICAgICAgIGlmICh0aGlzLmhhc1NlbGVjdENsYXVzZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0QWxsTW9kZWxQcm9wZXJ0aWVzKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5TG9nICs9IHRoaXMucXVlcnlCdWlsZGVyLnRvUXVlcnkoKSArIFwiXFxuXCI7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBpdGVtcyA9IGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyO1xuICAgICAgICAgICAgaWYgKCFpdGVtcyB8fCBpdGVtcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJdGVtIG5vdCBmb3VuZC5cIik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGl0ZW1zLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1vcmUgdGhhbiBvbmUgaXRlbSBmb3VuZDogJHtpdGVtcy5sZW5ndGh9LmApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmxhdHRlbkJ5T3B0aW9uKGl0ZW1zWzBdLCBmbGF0dGVuT3B0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3RDb2x1bW4oKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgbGV0IGNhbGxlZEFyZ3VtZW50cyA9IFtdIGFzIHN0cmluZ1tdO1xuXG4gICAgICAgIGZ1bmN0aW9uIHNhdmVBcmd1bWVudHMoLi4uYXJnczogc3RyaW5nW10pIHtcbiAgICAgICAgICAgIGNhbGxlZEFyZ3VtZW50cyA9IGFyZ3M7XG4gICAgICAgIH1cblxuICAgICAgICBhcmd1bWVudHNbMF0oc2F2ZUFyZ3VtZW50cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jYWxsZWRBcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNhbGxlZEFyZ3VtZW50cykpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uMyhmOiBhbnkpIHtcbiAgICAgICAgY29uc3QgeyByb290LCByZXN1bHQgfSA9IGdldFByb3h5QW5kTWVtb3JpZXNGb3JBcnJheSgpO1xuXG4gICAgICAgIGYocm9vdCk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2VsZWN0MigpIHtcbiAgICAgICAgdGhpcy5oYXNTZWxlY3RDbGF1c2UgPSB0cnVlO1xuICAgICAgICBjb25zdCBmID0gYXJndW1lbnRzWzBdO1xuXG4gICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50c0xpc3QgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbjMoZik7XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5Bcmd1bWVudHMgb2YgY29sdW1uQXJndW1lbnRzTGlzdCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2VsZWN0KCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGxldCBjb2x1bW5Bcmd1bWVudHNMaXN0OiBzdHJpbmdbXVtdO1xuXG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzBdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gWy4uLmFyZ3VtZW50c10ubWFwKChjb25jYXRLZXk6IHN0cmluZykgPT4gY29uY2F0S2V5LnNwbGl0KFwiLlwiKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBmID0gYXJndW1lbnRzWzBdO1xuICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzTGlzdCA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uMyhmKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgY29sdW1uQXJndW1lbnRzIG9mIGNvbHVtbkFyZ3VtZW50c0xpc3QpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnNlbGVjdCh0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSArIFwiIGFzIFwiICsgdGhpcy5nZXRDb2x1bW5TZWxlY3RBbGlhcyguLi5jb2x1bW5Bcmd1bWVudHMpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yZGVyQnkoKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLm9yZGVyQnkodGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgYXJndW1lbnRzWzFdKTtcblxuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGdldE1hbnkoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbFR5cGUgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+IDogUm93KVtdPiB7XG4gICAgICAgIGlmICh0aGlzLmhhc1NlbGVjdENsYXVzZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0QWxsTW9kZWxQcm9wZXJ0aWVzKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5TG9nICs9IHRoaXMucXVlcnlCdWlsZGVyLnRvUXVlcnkoKSArIFwiXFxuXCI7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBpdGVtcyA9IGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmxhdHRlbkJ5T3B0aW9uKGl0ZW1zLCBmbGF0dGVuT3B0aW9uKSBhcyAoUm93IGV4dGVuZHMgTW9kZWxUeXBlID8gUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPiA6IFJvdylbXTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3RSYXcoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgW25hbWUsIF8sIHF1ZXJ5LCAuLi5iaW5kaW5nc10gPSBBcnJheS5mcm9tKGFyZ3VtZW50cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMua25leC5yYXcoYCgke3F1ZXJ5fSkgYXMgXCIke25hbWV9XCJgLCBiaW5kaW5ncykpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pbkNvbHVtbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbkNvbHVtbihcImlubmVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuICAgIHB1YmxpYyBsZWZ0T3V0ZXJKb2luQ29sdW1uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5qb2luQ29sdW1uKFwibGVmdE91dGVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pblRhYmxlKCkge1xuICAgICAgICBjb25zdCBuZXdQcm9wZXJ0eUtleSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgbmV3UHJvcGVydHlUeXBlID0gYXJndW1lbnRzWzFdO1xuICAgICAgICBjb25zdCBjb2x1bW4xUGFydHMgPSBhcmd1bWVudHNbMl07XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBjb2x1bW4yUGFydHMgPSBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMucHVzaCh7XG4gICAgICAgICAgICBuYW1lOiBuZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgICAgIHByb3BlcnR5VHlwZTogbmV3UHJvcGVydHlUeXBlLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkNsYXNzID0gbmV3UHJvcGVydHlUeXBlO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXMgPSBuZXdQcm9wZXJ0eUtleTtcblxuICAgICAgICBjb25zdCB0YWJsZTFDb2x1bW4gPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMVBhcnRzKTtcbiAgICAgICAgY29uc3QgdGFibGUyQ29sdW1uID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbjJQYXJ0cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luKGAke3RhYmxlVG9Kb2luTmFtZX0gYXMgJHt0YWJsZVRvSm9pbkFsaWFzfWAsIHRhYmxlMUNvbHVtbiwgb3BlcmF0b3IsIHRhYmxlMkNvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pbigpIHtcbiAgICAgICAgY29uc3QgY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPSB0aGlzLmdyYW51bGFyaXR5U2V0Lmhhcyhhcmd1bWVudHNbMl0pO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzRdIDogYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nID0gY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPyBhcmd1bWVudHNbNV0gOiBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcImlubmVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgZ3JhbnVsYXJpdHksIGpvaW5UYWJsZUNvbHVtblN0cmluZywgb3BlcmF0b3IsIGV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmcpO1xuICAgIH1cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pbigpIHtcbiAgICAgICAgY29uc3QgY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPSB0aGlzLmdyYW51bGFyaXR5U2V0Lmhhcyhhcmd1bWVudHNbMl0pO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzRdIDogYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nID0gY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPyBhcmd1bWVudHNbNV0gOiBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcImxlZnRPdXRlckpvaW5cIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0sIGdyYW51bGFyaXR5LCBqb2luVGFibGVDb2x1bW5TdHJpbmcsIG9wZXJhdG9yLCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5uZXJKb2luVGFibGVPbkZ1bmN0aW9uKCkge1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMl0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzJdIGFzIEdyYW51bGFyaXR5KSA6IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3Qgb24gPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmpvaW5UYWJsZU9uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgZ3JhbnVsYXJpdHksIG9uKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pblRhYmxlT25GdW5jdGlvbigpIHtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IG9uID0gdHlwZW9mIGFyZ3VtZW50c1syXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1szXSA6IGFyZ3VtZW50c1syXTtcblxuICAgICAgICByZXR1cm4gdGhpcy5qb2luVGFibGVPbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLmxlZnRPdXRlckpvaW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdLCBncmFudWxhcml0eSwgb24pO1xuICAgIH1cblxuICAgIHB1YmxpYyBsZWZ0T3V0ZXJKb2luVGFibGUoKSB7XG4gICAgICAgIGNvbnN0IG5ld1Byb3BlcnR5S2V5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBuZXdQcm9wZXJ0eVR5cGUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgIGNvbnN0IGNvbHVtbjFQYXJ0cyA9IGFyZ3VtZW50c1syXTtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBhcmd1bWVudHNbM107XG4gICAgICAgIGNvbnN0IGNvbHVtbjJQYXJ0cyA9IGFyZ3VtZW50c1s0XTtcblxuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IG5ld1Byb3BlcnR5S2V5LFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBuZXdQcm9wZXJ0eVR5cGUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQ2xhc3MgPSBuZXdQcm9wZXJ0eVR5cGU7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZVRvSm9pbkNsYXNzKTtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5BbGlhcyA9IG5ld1Byb3BlcnR5S2V5O1xuXG4gICAgICAgIGNvbnN0IHRhYmxlMUNvbHVtbiA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW4xUGFydHMpO1xuICAgICAgICBjb25zdCB0YWJsZTJDb2x1bW4gPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMlBhcnRzKTtcblxuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5sZWZ0T3V0ZXJKb2luKGAke3RhYmxlVG9Kb2luTmFtZX0gYXMgJHt0YWJsZVRvSm9pbkFsaWFzfWAsIHRhYmxlMUNvbHVtbiwgb3BlcmF0b3IsIHRhYmxlMkNvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlQ29sdW1uKCkge1xuICAgICAgICAvLyBUaGlzIGlzIGNhbGxlZCBmcm9tIHRoZSBzdWItcXVlcnlcbiAgICAgICAgLy8gVGhlIGZpcnN0IGNvbHVtbiBpcyBmcm9tIHRoZSBzdWItcXVlcnlcbiAgICAgICAgLy8gVGhlIHNlY29uZCBjb2x1bW4gaXMgZnJvbSB0aGUgcGFyZW50IHF1ZXJ5XG4gICAgICAgIGxldCBjb2x1bW4xTmFtZTtcbiAgICAgICAgbGV0IGNvbHVtbjJOYW1lO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICBpZiAoYXJndW1lbnRzWzBdIGluc3RhbmNlb2YgQ29sdW1uRnJvbVF1ZXJ5KSB7XG4gICAgICAgICAgICBjb2x1bW4xTmFtZSA9IChhcmd1bWVudHNbMF0gYXMgQ29sdW1uRnJvbVF1ZXJ5KS50b1N0cmluZygpO1xuICAgICAgICAgICAgY29sdW1uMk5hbWUgPSAoYXJndW1lbnRzWzJdIGFzIENvbHVtbkZyb21RdWVyeSkudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlUmF3KGAke2NvbHVtbjFOYW1lfSAke29wZXJhdG9yfSAke2NvbHVtbjJOYW1lfWApO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uMU5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uYXJndW1lbnRzWzBdLnNwbGl0KFwiLlwiKSk7XG4gICAgICAgICAgICBpZiAoIXRoaXMucGFyZW50VHlwZWRRdWVyeUJ1aWxkZXIpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BhcmVudCBxdWVyeSBidWlsZGVyIGlzIG1pc3NpbmcsIFwid2hlcmVDb2x1bW5cIiBjYW4gb25seSBiZSB1c2VkIGluIHN1Yi1xdWVyeS4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbHVtbjJOYW1lID0gdGhpcy5wYXJlbnRUeXBlZFF1ZXJ5QnVpbGRlci5nZXRDb2x1bW5OYW1lKC4uLmFyZ3VtZW50c1syXS5zcGxpdChcIi5cIikpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sdW1uMU5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4udGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oYXJndW1lbnRzWzBdKSk7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMk5hbWUgPSBhcmd1bWVudHNbMl07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGFyZ3VtZW50c1syXS5tZW1vcmllcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMk5hbWUgPSBhcmd1bWVudHNbMl0uZ2V0Q29sdW1uTmFtZTsgLy8gcGFyZW50IHRoaXMgbmVlZGVkIC4uLlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2x1bW4yTmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi50aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmd1bWVudHNbMl0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlUmF3KGA/PyAke29wZXJhdG9yfSA/P2AsIFtjb2x1bW4xTmFtZSwgY29sdW1uMk5hbWVdKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9RdWVyeSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlCdWlsZGVyLnRvUXVlcnkoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTnVsbC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3ROdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90TnVsbC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JXaGVyZU51bGwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZU51bGwuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmVOb3ROdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVOb3ROdWxsLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oZjogYW55KSB7XG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIGYuc3BsaXQoXCIuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgeyByb290LCBtZW1vcmllcyB9ID0gZ2V0UHJveHlBbmRNZW1vcmllcygpO1xuXG4gICAgICAgIGYocm9vdCk7XG5cbiAgICAgICAgcmV0dXJuIG1lbW9yaWVzO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBmaW5kQnlQcmltYXJ5S2V5KCkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBwcmltYXJ5S2V5VmFsdWUgPSBhcmd1bWVudHNbMF07XG5cbiAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50c0xpc3Q7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb25zdCBbLCAuLi5jb2x1bW5Bcmd1bWVudHNdID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzTGlzdCA9IGNvbHVtbkFyZ3VtZW50cy5tYXAoKGNvbmNhdEtleTogc3RyaW5nKSA9PiBjb25jYXRLZXkuc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5Bcmd1bWVudHMgb2YgY29sdW1uQXJndW1lbnRzTGlzdCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIud2hlcmUocHJpbWFyeUtleUNvbHVtbkluZm8ubmFtZSwgcHJpbWFyeUtleVZhbHVlKTtcblxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5QnVpbGRlci5maXJzdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlKCkge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb25jYXRLZXlDb2x1bW4odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmUuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZS5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3QoKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzBdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbmNhdEtleUNvbHVtbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjb2x1bW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmd1bWVudHNbMF0pO1xuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpLCBhcmd1bWVudHNbMV0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgYW5kV2hlcmUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIuYW5kV2hlcmUuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZS5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVJbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZUluLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZU5vdEluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90SW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuICAgIHB1YmxpYyBvcldoZXJlSW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZUluLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZU5vdEluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVOb3RJbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVCZXR3ZWVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlQmV0d2Vlbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG4gICAgcHVibGljIHdoZXJlTm90QmV0d2VlbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdEJldHdlZW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmVCZXR3ZWVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVCZXR3ZWVuLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZU5vdEJldHdlZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZU5vdEJldHdlZW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIGNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oZnVuY3Rpb25OYW1lOiBzdHJpbmcsIHR5cGVPZlN1YlF1ZXJ5OiBhbnksIGZ1bmN0aW9uVG9DYWxsOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCB0aGF0ID0gdGhpcyBhcyBhbnk7XG4gICAgICAgIGxldCBzdWJRdWVyeVByZWZpeDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBpZiAoW1wid2hlcmVFeGlzdHNcIiwgXCJvcldoZXJlRXhpc3RzXCIsIFwid2hlcmVOb3RFeGlzdHNcIiwgXCJvcldoZXJlTm90RXhpc3RzXCIsIFwiaGF2aW5nRXhpc3RzXCIsIFwiaGF2aW5nTm90RXhpc3RzXCJdLmluY2x1ZGVzKGZ1bmN0aW9uTmFtZSkpIHtcbiAgICAgICAgICAgIHN1YlF1ZXJ5UHJlZml4ID0gdGhpcy5nZXROZXh0U3ViUXVlcnlQcmVmaXgoKTtcbiAgICAgICAgfVxuICAgICAgICAoKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSlbZnVuY3Rpb25OYW1lXSBhcyAoY2FsbGJhY2s6IEtuZXguUXVlcnlDYWxsYmFjaykgPT4gS25leC5RdWVyeUJ1aWxkZXIpKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGNvbnN0IHN1YlF1ZXJ5ID0gdGhpcztcbiAgICAgICAgICAgIGNvbnN0IHsgcm9vdCwgbWVtb3JpZXMgfSA9IGdldFByb3h5QW5kTWVtb3JpZXModGhhdCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHN1YlFCID0gbmV3IFR5cGVkUXVlcnlCdWlsZGVyKHR5cGVPZlN1YlF1ZXJ5LCBncmFudWxhcml0eSwgdGhhdC5rbmV4LCBzdWJRdWVyeSwgdGhhdCwgc3ViUXVlcnlQcmVmaXgpO1xuICAgICAgICAgICAgc3ViUUIuZXh0cmFKb2luZWRQcm9wZXJ0aWVzID0gdGhhdC5leHRyYUpvaW5lZFByb3BlcnRpZXM7XG4gICAgICAgICAgICBmdW5jdGlvblRvQ2FsbChzdWJRQiwgcm9vdCwgbWVtb3JpZXMpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2VsZWN0UXVlcnkoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgbmFtZSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMl07XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGFyZ3VtZW50c1s0XTtcblxuICAgICAgICBjb25zdCB7IHJvb3QsIG1lbW9yaWVzIH0gPSBnZXRQcm94eUFuZE1lbW9yaWVzKHRoaXMgYXMgYW55KTtcblxuICAgICAgICBjb25zdCBzdWJRdWVyeUJ1aWxkZXIgPSBuZXcgVHlwZWRRdWVyeUJ1aWxkZXIodHlwZU9mU3ViUXVlcnksIGdyYW51bGFyaXR5LCB0aGlzLmtuZXgsIHVuZGVmaW5lZCwgdGhpcyk7XG4gICAgICAgIGZ1bmN0aW9uVG9DYWxsKHN1YlF1ZXJ5QnVpbGRlciwgcm9vdCwgbWVtb3JpZXMpO1xuXG4gICAgICAgICh0aGlzLnNlbGVjdFJhdyBhcyBhbnkpKG5hbWUsIHVuZGVmaW5lZCwgc3ViUXVlcnlCdWlsZGVyLnRvUXVlcnkoKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZVBhcmVudGhlc2VzKCkge1xuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJ3aGVyZVwiLCB0aGlzLnRhYmxlQ2xhc3MsIGFyZ3VtZW50c1swXSwgdW5kZWZpbmVkKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVQYXJlbnRoZXNlcygpIHtcbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwib3JXaGVyZVwiLCB0aGlzLnRhYmxlQ2xhc3MsIGFyZ3VtZW50c1swXSwgdW5kZWZpbmVkKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIndoZXJlRXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZUV4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwib3JXaGVyZUV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3RFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIndoZXJlTm90RXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZU5vdEV4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwib3JXaGVyZU5vdEV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZVJhdyhzcWwsIGJpbmRpbmdzKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZygpIHtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBhcmd1bWVudHNbMV07XG4gICAgICAgIGNvbnN0IHZhbHVlID0gYXJndW1lbnRzWzJdO1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5oYXZpbmcodGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgb3BlcmF0b3IsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ0luKCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGFyZ3VtZW50c1sxXTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaGF2aW5nSW4odGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTm90SW4oKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gYXJndW1lbnRzWzFdO1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5oYXZpbmdOb3RJbih0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdOdWxsKCkge1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5oYXZpbmdOdWxsKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTm90TnVsbCgpIHtcbiAgICAgICAgKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSkuaGF2aW5nTm90TnVsbCh0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ0V4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwiaGF2aW5nRXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdOb3RFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcImhhdmluZ05vdEV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nUmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaGF2aW5nUmF3KHNxbCwgYmluZGluZ3MpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nQmV0d2VlbigpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmhhdmluZ0JldHdlZW4odGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTm90QmV0d2VlbigpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmhhdmluZ05vdEJldHdlZW4odGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JkZXJCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLm9yZGVyQnlSYXcoc3FsLCBiaW5kaW5ncyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB1bmlvbigpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwidW5pb25cIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHVuaW9uQWxsKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJ1bmlvbkFsbFwiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgcmV0dXJuaW5nQ29sdW1uKCkge1xuICAgICAgICB0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcigpO1xuICAgIH1cblxuICAgIHB1YmxpYyByZXR1cm5pbmdDb2x1bW5zKCkge1xuICAgICAgICB0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcigpO1xuICAgIH1cblxuICAgIHB1YmxpYyB0cmFuc2FjdGluZyh0cng6IEtuZXguVHJhbnNhY3Rpb24pIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIudHJhbnNhY3RpbmcodHJ4KTtcblxuICAgICAgICB0aGlzLnRyYW5zYWN0aW9uID0gdHJ4O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBtaW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwibWluXCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgY291bnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwiY291bnRcIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBjb3VudERpc3RpbmN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcImNvdW50RGlzdGluY3RcIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBtYXgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwibWF4XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3VtKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcInN1bVwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIHN1bURpc3RpbmN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcInN1bURpc3RpbmN0XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXZnKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcImF2Z1wiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGF2Z0Rpc3RpbmN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcImF2Z0Rpc3RpbmN0XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5jcmVtZW50KCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV07XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmluY3JlbWVudCh0aGlzLmdldENvbHVtbk5hbWVGcm9tQXJndW1lbnRzSWdub3JpbmdMYXN0UGFyYW1ldGVyKC4uLmFyZ3VtZW50cyksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIHB1YmxpYyBkZWNyZW1lbnQoKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gYXJndW1lbnRzW2FyZ3VtZW50cy5sZW5ndGggLSAxXTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZGVjcmVtZW50KHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21Bcmd1bWVudHNJZ25vcmluZ0xhc3RQYXJhbWV0ZXIoLi4uYXJndW1lbnRzKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdHJ1bmNhdGUoKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyLnRydW5jYXRlKCk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGluc2VydFNlbGVjdCgpIHtcbiAgICAgICAgY29uc3QgdGFibGVOYW1lID0gZ2V0VGFibGVOYW1lKGFyZ3VtZW50c1swXSk7XG5cbiAgICAgICAgY29uc3QgdHlwZWRRdWVyeUJ1aWxkZXJGb3JJbnNlcnQgPSBuZXcgVHlwZWRRdWVyeUJ1aWxkZXI8YW55LCBhbnk+KGFyZ3VtZW50c1swXSwgdW5kZWZpbmVkLCB0aGlzLmtuZXgpO1xuICAgICAgICBsZXQgY29sdW1uQXJndW1lbnRzTGlzdDtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbnN0IFssIC4uLmNvbHVtbkFyZ3VtZW50c10gPSBhcmd1bWVudHM7XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gY29sdW1uQXJndW1lbnRzLm1hcCgoY29uY2F0S2V5OiBzdHJpbmcpID0+IGNvbmNhdEtleS5zcGxpdChcIi5cIikpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgZiA9IGFyZ3VtZW50c1sxXTtcbiAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50c0xpc3QgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbjMoZik7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpbnNlcnRDb2x1bW5zID0gY29sdW1uQXJndW1lbnRzTGlzdC5tYXAoKGkpID0+IHR5cGVkUXVlcnlCdWlsZGVyRm9ySW5zZXJ0LmdldENvbHVtbk5hbWUoLi4uaSkpO1xuXG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9rbmV4L2tuZXgvaXNzdWVzLzEwNTZcbiAgICAgICAgY29uc3QgcWIgPSB0aGlzLmtuZXguZnJvbSh0aGlzLmtuZXgucmF3KGA/PyAoJHtpbnNlcnRDb2x1bW5zLm1hcCgoKSA9PiBcIj8/XCIpLmpvaW4oXCIsXCIpfSlgLCBbdGFibGVOYW1lLCAuLi5pbnNlcnRDb2x1bW5zXSkpLmluc2VydCh0aGlzLmtuZXgucmF3KHRoaXMudG9RdWVyeSgpKSk7XG5cbiAgICAgICAgY29uc3QgZmluYWxRdWVyeSA9IHFiLnRvU3RyaW5nKCk7XG4gICAgICAgIHRoaXMudG9RdWVyeSA9ICgpID0+IGZpbmFsUXVlcnk7XG5cbiAgICAgICAgYXdhaXQgcWI7XG4gICAgfVxuXG4gICAgcHVibGljIGNsZWFyU2VsZWN0KCkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5jbGVhclNlbGVjdCgpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuICAgIHB1YmxpYyBjbGVhcldoZXJlKCkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5jbGVhcldoZXJlKCk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG4gICAgcHVibGljIGNsZWFyT3JkZXIoKSB7XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmNsZWFyT3JkZXIoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBkaXN0aW5jdCgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZGlzdGluY3QoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBjbG9uZSgpIHtcbiAgICAgICAgY29uc3QgcXVlcnlCdWlsZGVyQ2xvbmUgPSB0aGlzLnF1ZXJ5QnVpbGRlci5jbG9uZSgpO1xuXG4gICAgICAgIGNvbnN0IHR5cGVkUXVlcnlCdWlsZGVyQ2xvbmUgPSBuZXcgVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBSb3c+KHRoaXMudGFibGVDbGFzcywgdGhpcy5ncmFudWxhcml0eSwgdGhpcy5rbmV4LCBxdWVyeUJ1aWxkZXJDbG9uZSk7XG5cbiAgICAgICAgcmV0dXJuIHR5cGVkUXVlcnlCdWlsZGVyQ2xvbmUgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBncm91cEJ5KCkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5ncm91cEJ5KHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZ3JvdXBCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmdyb3VwQnlSYXcoc3FsLCBiaW5kaW5ncyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB1c2VLbmV4UXVlcnlCdWlsZGVyKGY6IChxdWVyeTogS25leC5RdWVyeUJ1aWxkZXIpID0+IHZvaWQpIHtcbiAgICAgICAgZih0aGlzLnF1ZXJ5QnVpbGRlcik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRLbmV4UXVlcnlCdWlsZGVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgfVxuXG4gICAgcHVibGljIGdldENvbHVtbk5hbWUoLi4ua2V5czogc3RyaW5nW10pOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBmaXJzdFBhcnROYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKGtleXNbMF0pO1xuXG4gICAgICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGZpcnN0UGFydE5hbWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgY29sdW1uTmFtZSA9IFwiXCI7XG4gICAgICAgICAgICBsZXQgY29sdW1uQWxpYXM7XG4gICAgICAgICAgICBsZXQgY3VycmVudENsYXNzO1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDb2x1bW5QYXJ0O1xuICAgICAgICAgICAgY29uc3QgcHJlZml4ID0ga2V5cy5zbGljZSgwLCAtMSkuam9pbihcIi5cIik7XG4gICAgICAgICAgICBjb25zdCBleHRyYUpvaW5lZFByb3BlcnR5ID0gdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMuZmluZCgoaSkgPT4gaS5uYW1lID09PSBwcmVmaXgpO1xuICAgICAgICAgICAgaWYgKGV4dHJhSm9pbmVkUHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyA9IGV4dHJhSm9pbmVkUHJvcGVydHkubmFtZTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2xhc3MgPSBleHRyYUpvaW5lZFByb3BlcnR5LnByb3BlcnR5VHlwZTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKGN1cnJlbnRDbGFzcywga2V5c1trZXlzLmxlbmd0aCAtIDFdKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5OYW1lID0ga2V5cy5zbGljZSgwLCAtMSkuam9pbihcIl9cIikgKyBcIi5cIiArIGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBrZXlzWzBdKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKGN1cnJlbnRDbGFzcywga2V5c1tpXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29sdW1uTmFtZSA9IGNvbHVtbkFsaWFzICsgXCIuXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uQWxpYXMgKz0gXCJfXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudENsYXNzID0gY3VycmVudENvbHVtblBhcnQuY29sdW1uQ2xhc3M7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gYCR7dGhpcy5zdWJRdWVyeVByZWZpeCA/PyBcIlwifSR7Y29sdW1uTmFtZX1gO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGdldENvbHVtbk5hbWVXaXRoRGlmZmVyZW50Um9vdChfcm9vdEtleTogc3RyaW5nLCAuLi5rZXlzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGZpcnN0UGFydE5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXMoa2V5c1swXSk7XG5cbiAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gZmlyc3RQYXJ0TmFtZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKHRoaXMudGFibGVDbGFzcywga2V5c1swXSk7XG5cbiAgICAgICAgICAgIGxldCBjb2x1bW5OYW1lID0gXCJcIjtcbiAgICAgICAgICAgIGxldCBjb2x1bW5BbGlhcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihjdXJyZW50Q2xhc3MsIGtleXNbaV0pO1xuXG4gICAgICAgICAgICAgICAgY29sdW1uTmFtZSA9IGNvbHVtbkFsaWFzICsgXCIuXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyArPSBcIl9cIiArIChrZXlzLmxlbmd0aCAtIDEgPT09IGkgPyBjdXJyZW50Q29sdW1uUGFydC5uYW1lIDogY3VycmVudENvbHVtblBhcnQucHJvcGVydHlLZXkpO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvbHVtbk5hbWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGZ1bmN0aW9uV2l0aEFsaWFzKGtuZXhGdW5jdGlvbk5hbWU6IHN0cmluZywgZjogYW55LCBhbGlhc05hbWU6IHN0cmluZykge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpW2tuZXhGdW5jdGlvbk5hbWVdKGAke3RoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhc0Zyb21GdW5jdGlvbk9yU3RyaW5nKGYpfSBhcyAke2FsaWFzTmFtZX1gKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGY6IGFueSkge1xuICAgICAgICBsZXQgY29sdW1uUGFydHM7XG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uUGFydHMgPSBmLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbHVtblBhcnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oZik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtblBhcnRzKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtbk5hbWVXaXRob3V0QWxpYXNGcm9tRnVuY3Rpb25PclN0cmluZyhmOiBhbnkpIHtcbiAgICAgICAgbGV0IGNvbHVtblBhcnRzO1xuICAgICAgICBpZiAodHlwZW9mIGYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtblBhcnRzID0gZi5zcGxpdChcIi5cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2x1bW5QYXJ0cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyguLi5jb2x1bW5QYXJ0cyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBqb2luQ29sdW1uKGpvaW5UeXBlOiBcImlubmVySm9pblwiIHwgXCJsZWZ0T3V0ZXJKb2luXCIsIGY6IGFueSwgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5IHwgdW5kZWZpbmVkKSB7XG4gICAgICAgIGxldCBjb2x1bW5Ub0pvaW5Bcmd1bWVudHM6IHN0cmluZ1tdO1xuXG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uVG9Kb2luQXJndW1lbnRzID0gZi5zcGxpdChcIi5cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2x1bW5Ub0pvaW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihmKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbHVtblRvSm9pbk5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uVG9Kb2luQXJndW1lbnRzKTtcblxuICAgICAgICBsZXQgc2Vjb25kQ29sdW1uTmFtZSA9IGNvbHVtblRvSm9pbkFyZ3VtZW50c1swXTtcbiAgICAgICAgbGV0IHNlY29uZENvbHVtbkFsaWFzID0gY29sdW1uVG9Kb2luQXJndW1lbnRzWzBdO1xuICAgICAgICBsZXQgc2Vjb25kQ29sdW1uQ2xhc3MgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIHNlY29uZENvbHVtbk5hbWUpLmNvbHVtbkNsYXNzO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgY29sdW1uVG9Kb2luQXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBiZWZvcmVTZWNvbmRDb2x1bW5BbGlhcyA9IHNlY29uZENvbHVtbkFsaWFzO1xuICAgICAgICAgICAgY29uc3QgYmVmb3JlU2Vjb25kQ29sdW1uQ2xhc3MgPSBzZWNvbmRDb2x1bW5DbGFzcztcblxuICAgICAgICAgICAgY29uc3QgY29sdW1uSW5mbyA9IGdldENvbHVtbkluZm9ybWF0aW9uKGJlZm9yZVNlY29uZENvbHVtbkNsYXNzLCBjb2x1bW5Ub0pvaW5Bcmd1bWVudHNbaV0pO1xuICAgICAgICAgICAgc2Vjb25kQ29sdW1uTmFtZSA9IGNvbHVtbkluZm8ubmFtZTtcbiAgICAgICAgICAgIHNlY29uZENvbHVtbkFsaWFzID0gYmVmb3JlU2Vjb25kQ29sdW1uQWxpYXMgKyBcIl9cIiArIGNvbHVtbkluZm8ucHJvcGVydHlLZXk7XG4gICAgICAgICAgICBzZWNvbmRDb2x1bW5DbGFzcyA9IGNvbHVtbkluZm8uY29sdW1uQ2xhc3M7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUoc2Vjb25kQ29sdW1uQ2xhc3MpO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkFsaWFzID0gYCR7dGhpcy5zdWJRdWVyeVByZWZpeCA/PyBcIlwifSR7c2Vjb25kQ29sdW1uQWxpYXN9YDtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5Kb2luQ29sdW1uTmFtZSA9IGAke3RhYmxlVG9Kb2luQWxpYXN9LiR7Z2V0UHJpbWFyeUtleUNvbHVtbihzZWNvbmRDb2x1bW5DbGFzcykubmFtZX1gO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcblxuICAgICAgICBjb25zdCB0YWJsZU5hbWVSYXcgPSB0aGlzLmtuZXgucmF3KGA/PyBhcyA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGFibGVUb0pvaW5OYW1lLCB0YWJsZVRvSm9pbkFsaWFzXSk7XG4gICAgICAgIGlmIChqb2luVHlwZSA9PT0gXCJpbm5lckpvaW5cIikge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luKHRhYmxlTmFtZVJhdywgdGFibGVUb0pvaW5Kb2luQ29sdW1uTmFtZSwgY29sdW1uVG9Kb2luTmFtZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoam9pblR5cGUgPT09IFwibGVmdE91dGVySm9pblwiKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5sZWZ0T3V0ZXJKb2luKHRhYmxlTmFtZVJhdywgdGFibGVUb0pvaW5Kb2luQ29sdW1uTmFtZSwgY29sdW1uVG9Kb2luTmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtbk5hbWVGcm9tQXJndW1lbnRzSWdub3JpbmdMYXN0UGFyYW1ldGVyKC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgYXJndW1lbnRzRXhjZXB0TGFzdCA9IGtleXMuc2xpY2UoMCwgLTEpO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmFyZ3VtZW50c0V4Y2VwdExhc3QpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyguLi5rZXlzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGV4dHJhSm9pbmVkUHJvcGVydHkgPSB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5maW5kKChpKSA9PiBpLm5hbWUgPT09IGtleXNbMF0pO1xuICAgICAgICBpZiAoZXh0cmFKb2luZWRQcm9wZXJ0eSkge1xuICAgICAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGV4dHJhSm9pbmVkUHJvcGVydHkubmFtZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihleHRyYUpvaW5lZFByb3BlcnR5LnByb3BlcnR5VHlwZSwga2V5c1sxXSk7XG4gICAgICAgICAgICByZXR1cm4gZXh0cmFKb2luZWRQcm9wZXJ0eS5uYW1lICsgXCIuXCIgKyBjb2x1bW5JbmZvLm5hbWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoa2V5cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIGtleXNbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn0ke3RoaXMudGFibGVOYW1lfS4ke2NvbHVtbkluZm8ubmFtZX1gO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBrZXlzWzBdKTtcblxuICAgICAgICAgICAgbGV0IHJlc3VsdCA9IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKGN1cnJlbnRDbGFzcywga2V5c1tpXSk7XG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IFwiLlwiICsgKGtleXMubGVuZ3RoIC0gMSA9PT0gaSA/IGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWUgOiBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleSk7XG4gICAgICAgICAgICAgICAgY3VycmVudENsYXNzID0gY3VycmVudENvbHVtblBhcnQuY29sdW1uQ2xhc3M7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtblNlbGVjdEFsaWFzKC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4ga2V5c1swXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBjb2x1bW5BbGlhcyA9IGtleXNbMF07XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyArPSBcIi5cIiArIGtleXNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY29sdW1uQWxpYXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGZsYXR0ZW5CeU9wdGlvbihvOiBhbnksIGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKSB7XG4gICAgICAgIGlmIChmbGF0dGVuT3B0aW9uID09PSBGbGF0dGVuT3B0aW9uLm5vRmxhdHRlbiB8fCB0aGlzLnNob3VsZFVuZmxhdHRlbiA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHJldHVybiBvO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVuZmxhdHRlbmVkID0gdW5mbGF0dGVuKG8pO1xuICAgICAgICBpZiAoZmxhdHRlbk9wdGlvbiA9PT0gdW5kZWZpbmVkIHx8IGZsYXR0ZW5PcHRpb24gPT09IEZsYXR0ZW5PcHRpb24uZmxhdHRlbikge1xuICAgICAgICAgICAgcmV0dXJuIHVuZmxhdHRlbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZXRUb051bGwodW5mbGF0dGVuZWQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgam9pblRhYmxlT25GdW5jdGlvbihxdWVyeUJ1aWxkZXJKb2luOiBLbmV4LkpvaW4sIG5ld1Byb3BlcnR5S2V5OiBhbnksIG5ld1Byb3BlcnR5VHlwZTogYW55LCBncmFudWxhcml0eTogR3JhbnVsYXJpdHkgfCB1bmRlZmluZWQsIG9uRnVuY3Rpb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxhbnksIGFueT4pID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMucHVzaCh7XG4gICAgICAgICAgICBuYW1lOiBuZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgICAgIHByb3BlcnR5VHlwZTogbmV3UHJvcGVydHlUeXBlLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkNsYXNzID0gbmV3UHJvcGVydHlUeXBlO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXMgPSBuZXdQcm9wZXJ0eUtleTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHlRdWVyeSA9ICFncmFudWxhcml0eSA/IFwiXCIgOiBgIFdJVEggKCR7Z3JhbnVsYXJpdHl9KWA7XG5cbiAgICAgICAgbGV0IGtuZXhPbk9iamVjdDogYW55O1xuICAgICAgICBjb25zdCB0YWJsZU5hbWVSYXcgPSB0aGlzLmtuZXgucmF3KGA/PyBhcyA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGFibGVUb0pvaW5OYW1lLCB0YWJsZVRvSm9pbkFsaWFzXSk7XG4gICAgICAgIHF1ZXJ5QnVpbGRlckpvaW4odGFibGVOYW1lUmF3LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBrbmV4T25PYmplY3QgPSB0aGlzO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBvbldpdGhKb2luZWRDb2x1bW5PcGVyYXRvckNvbHVtbiA9IChqb2luZWRDb2x1bW46IGFueSwgb3BlcmF0b3I6IGFueSwgbW9kZWxDb2x1bW46IGFueSwgZnVuY3Rpb25OYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGxldCBjb2x1bW4xQXJndW1lbnRzO1xuXG4gICAgICAgICAgICBpZiAodHlwZW9mIG1vZGVsQ29sdW1uID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMUFyZ3VtZW50cyA9IG1vZGVsQ29sdW1uLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMUFyZ3VtZW50cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKG1vZGVsQ29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbjJOYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKG5ld1Byb3BlcnR5S2V5LCBqb2luZWRDb2x1bW4pO1xuXG4gICAgICAgICAgICBrbmV4T25PYmplY3RbZnVuY3Rpb25OYW1lXSh0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMUFyZ3VtZW50cyksIG9wZXJhdG9yLCBjb2x1bW4yTmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgb25XaXRoQ29sdW1uT3BlcmF0b3JWYWx1ZSA9IChqb2luZWRDb2x1bW46IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSwgZnVuY3Rpb25OYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbjJOYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKG5ld1Byb3BlcnR5S2V5LCBqb2luZWRDb2x1bW4pO1xuICAgICAgICAgICAga25leE9uT2JqZWN0W2Z1bmN0aW9uTmFtZV0oY29sdW1uMk5hbWUsIG9wZXJhdG9yLCB2YWx1ZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgb25PYmplY3QgPSB7XG4gICAgICAgICAgICBvbkNvbHVtbnM6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIGNvbHVtbjI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aEpvaW5lZENvbHVtbk9wZXJhdG9yQ29sdW1uKGNvbHVtbjIsIG9wZXJhdG9yLCBjb2x1bW4xLCBcIm9uXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbjogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgY29sdW1uMjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4oY29sdW1uMSwgb3BlcmF0b3IsIGNvbHVtbjIsIFwib25cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFuZE9uOiAoY29sdW1uMTogYW55LCBvcGVyYXRvcjogYW55LCBjb2x1bW4yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhKb2luZWRDb2x1bW5PcGVyYXRvckNvbHVtbihjb2x1bW4xLCBvcGVyYXRvciwgY29sdW1uMiwgXCJhbmRPblwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPbjogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgY29sdW1uMjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4oY29sdW1uMSwgb3BlcmF0b3IsIGNvbHVtbjIsIFwib3JPblwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25WYWw6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhDb2x1bW5PcGVyYXRvclZhbHVlKGNvbHVtbjEsIG9wZXJhdG9yLCB2YWx1ZSwgXCJvblZhbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYW5kT25WYWw6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhDb2x1bW5PcGVyYXRvclZhbHVlKGNvbHVtbjEsIG9wZXJhdG9yLCB2YWx1ZSwgXCJhbmRPblZhbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblZhbDogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aENvbHVtbk9wZXJhdG9yVmFsdWUoY29sdW1uMSwgb3BlcmF0b3IsIHZhbHVlLCBcIm9yT25WYWxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uTnVsbDogKGY6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbHVtbjJBcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihmKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2x1bW4yQXJndW1lbnRzV2l0aEpvaW5lZFRhYmxlID0gW3RhYmxlVG9Kb2luQWxpYXMsIC4uLmNvbHVtbjJBcmd1bWVudHNdO1xuXG4gICAgICAgICAgICAgICAga25leE9uT2JqZWN0Lm9uTnVsbChjb2x1bW4yQXJndW1lbnRzV2l0aEpvaW5lZFRhYmxlLmpvaW4oXCIuXCIpKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9IGFzIGFueTtcblxuICAgICAgICBvbkZ1bmN0aW9uKG9uT2JqZWN0IGFzIGFueSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHByaXZhdGUgY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbihrbmV4RnVuY3Rpb246IGFueSwgLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmdzWzBdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbmNhdEtleUNvbHVtbihrbmV4RnVuY3Rpb24sIC4uLmFyZ3MpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGFyZ3NbMF0pO1xuXG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgICAga25leEZ1bmN0aW9uKHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpLCBhcmdzWzFdLCBhcmdzWzJdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbih0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSwgYXJnc1sxXSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGNhbGxLbmV4RnVuY3Rpb25XaXRoQ29uY2F0S2V5Q29sdW1uKGtuZXhGdW5jdGlvbjogYW55LCAuLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICBjb25zdCBjb2x1bW5OYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmFyZ3NbMF0uc3BsaXQoXCIuXCIpKTtcblxuICAgICAgICBpZiAoYXJncy5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbihjb2x1bW5OYW1lLCBhcmdzWzFdLCBhcmdzWzJdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbihjb2x1bW5OYW1lLCBhcmdzWzFdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VsZWN0QWxsTW9kZWxQcm9wZXJ0aWVzKCkge1xuICAgICAgICBjb25zdCBwcm9wZXJ0aWVzID0gZ2V0Q29sdW1uUHJvcGVydGllcyh0aGlzLnRhYmxlQ2xhc3MpO1xuICAgICAgICBmb3IgKGNvbnN0IHByb3BlcnR5IG9mIHByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnNlbGVjdChgJHtwcm9wZXJ0eS5uYW1lfSBhcyAke3Byb3BlcnR5LnByb3BlcnR5S2V5fWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBqb2luKGpvaW5GdW5jdGlvbk5hbWU6IHN0cmluZywgdGFibGVUb0pvaW5BbGlhczogYW55LCB0YWJsZVRvSm9pbkNsYXNzOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCwgam9pblRhYmxlQ29sdW1uU3RyaW5nOiBhbnksIG9wZXJhdG9yOiBhbnksIGV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmc6IGFueSkge1xuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IHRhYmxlVG9Kb2luQWxpYXMsXG4gICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHRhYmxlVG9Kb2luQ2xhc3MsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXNXaXRoVW5kZXJzY29yZXMgPSB0YWJsZVRvSm9pbkFsaWFzLnNwbGl0KFwiLlwiKS5qb2luKFwiX1wiKTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG5cbiAgICAgICAgY29uc3Qgam9pblRhYmxlQ29sdW1uSW5mb3JtYXRpb24gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0YWJsZVRvSm9pbkNsYXNzLCBqb2luVGFibGVDb2x1bW5TdHJpbmcpO1xuXG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtbkFyZ3VtZW50cyA9IGAke3RhYmxlVG9Kb2luQWxpYXNXaXRoVW5kZXJzY29yZXN9LiR7am9pblRhYmxlQ29sdW1uSW5mb3JtYXRpb24ubmFtZX1gO1xuXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nVGFibGVDb2x1bW5OYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmcuc3BsaXQoXCIuXCIpKTtcblxuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcbiAgICAgICAgY29uc3QgdGFibGVOYW1lUmF3ID0gdGhpcy5rbmV4LnJhdyhgPz8gYXMgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RhYmxlVG9Kb2luTmFtZSwgdGFibGVUb0pvaW5BbGlhc1dpdGhVbmRlcnNjb3Jlc10pO1xuXG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpW2pvaW5GdW5jdGlvbk5hbWVdKHRhYmxlTmFtZVJhdywgam9pblRhYmxlQ29sdW1uQXJndW1lbnRzLCBvcGVyYXRvciwgZXhpc3RpbmdUYWJsZUNvbHVtbk5hbWUpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbWFwUHJvcGVydHlOYW1lVG9Db2x1bW5OYW1lKHByb3BlcnR5TmFtZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIHByb3BlcnR5TmFtZSk7XG4gICAgICAgIHJldHVybiBjb2x1bW5JbmZvLm5hbWU7XG4gICAgfVxuICAgIHB1YmxpYyBtYXBDb2x1bW5OYW1lVG9Qcm9wZXJ0eU5hbWUoY29sdW1uTmFtZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtblByb3BlcnRpZXMgPSBnZXRDb2x1bW5Qcm9wZXJ0aWVzKHRoaXMudGFibGVDbGFzcyk7XG4gICAgICAgIGNvbnN0IGNvbHVtblByb3BlcnR5ID0gY29sdW1uUHJvcGVydGllcy5maW5kKChpKSA9PiBpLm5hbWUgPT09IGNvbHVtbk5hbWUpO1xuICAgICAgICBpZiAoY29sdW1uUHJvcGVydHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZmluZCBjb2x1bW4gd2l0aCBuYW1lIFwiJHtjb2x1bW5OYW1lfVwiYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbHVtblByb3BlcnR5LnByb3BlcnR5S2V5O1xuICAgIH1cblxuICAgIHB1YmxpYyBtYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW06IGFueSkge1xuICAgICAgICBjb25zdCBjb2x1bW5OYW1lcyA9IE9iamVjdC5rZXlzKGl0ZW0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lID0gdGhpcy5tYXBDb2x1bW5OYW1lVG9Qcm9wZXJ0eU5hbWUoY29sdW1uTmFtZSk7XG5cbiAgICAgICAgICAgIGlmIChjb2x1bW5OYW1lICE9PSBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoaXRlbSwgcHJvcGVydHlOYW1lLCBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGl0ZW0sIGNvbHVtbk5hbWUpISk7XG4gICAgICAgICAgICAgICAgZGVsZXRlIGl0ZW1bY29sdW1uTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgbWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtOiBhbnkpIHtcbiAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lcyA9IE9iamVjdC5rZXlzKGl0ZW0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgcHJvcGVydHlOYW1lIG9mIHByb3BlcnR5TmFtZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbk5hbWUgPSB0aGlzLm1hcFByb3BlcnR5TmFtZVRvQ29sdW1uTmFtZShwcm9wZXJ0eU5hbWUpO1xuXG4gICAgICAgICAgICBpZiAoY29sdW1uTmFtZSAhPT0gcHJvcGVydHlOYW1lKSB7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGl0ZW0sIGNvbHVtbk5hbWUsIE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoaXRlbSwgcHJvcGVydHlOYW1lKSEpO1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBpdGVtW3Byb3BlcnR5TmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=
