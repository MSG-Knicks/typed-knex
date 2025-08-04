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
            knexOnObject[functionName](column2Name, operator, value);
        };
        const onWithModelColumnOperatorValue = (modelColumn, operator, value, functionName) => {
            let columnArguments;
            if (typeof modelColumn === "string") {
                columnArguments = modelColumn.split(".");
            } else {
                columnArguments = this.getArgumentsFromColumnFunction(modelColumn);
            }
            knexOnObject[functionName](this.getColumnName(...columnArguments), operator, value);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZWRLbmV4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3R5cGVkS25leC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSw2Q0FBOEg7QUFROUgsMkNBQWtFO0FBRWxFLE1BQWEsU0FBUztJQUNsQixZQUFvQixJQUFVO1FBQVYsU0FBSSxHQUFKLElBQUksQ0FBTTtJQUFHLENBQUM7SUFFM0IsS0FBSyxDQUFJLFVBQXVCLEVBQUUsV0FBeUI7UUFDOUQsTUFBTSxnQkFBZ0IsR0FBRyxXQUFXLGFBQVgsV0FBVyxjQUFYLFdBQVcsR0FBSSxJQUFBLDZCQUFnQixFQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsQ0FBQztRQUNqRixPQUFPLElBQUksaUJBQWlCLENBQVUsVUFBVSxFQUFFLGdCQUFnQixFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBRU0sSUFBSSxDQUFVLGFBQTBCLEVBQUUsUUFBaUY7UUFDOUgsTUFBTSxLQUFLLEdBQUcsSUFBQSx5QkFBWSxFQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzFDLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksd0JBQXdCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUYsT0FBTyxJQUFJLHFCQUFxQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQUVNLGdCQUFnQjtRQUNuQixPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDM0IsSUFBSSxDQUFDLElBQUk7aUJBQ0osV0FBVyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2pDLHNGQUFzRjtpQkFD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QyxDQUFDO2FBQzNCO1NBQ0o7SUFDTCxDQUFDO0lBRU0sc0JBQXNCLENBQUMsSUFBUztRQUNuQyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXhDLEtBQUssTUFBTSxZQUFZLElBQUksYUFBYSxFQUFFO1lBQ3RDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUVsRSxJQUFJLFVBQVUsS0FBSyxZQUFZLEVBQUU7Z0JBQzdCLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsd0JBQXdCLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBRSxDQUFDLENBQUM7Z0JBQzlGLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO2FBQzdCO1NBQ0o7SUFDTCxDQUFDO0NBQ0o7QUE1NkNELDhDQTQ2Q0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSBwcmVmZXItcmVzdC1wYXJhbXMsIG5vLXVudXNlZC12YXJzICovXG5pbXBvcnQgeyBLbmV4IH0gZnJvbSBcImtuZXhcIjtcbmltcG9ydCB7IGdldENvbHVtbkluZm9ybWF0aW9uLCBnZXRDb2x1bW5Qcm9wZXJ0aWVzLCBnZXRQcmltYXJ5S2V5Q29sdW1uLCBnZXRUYWJsZU1ldGFkYXRhLCBnZXRUYWJsZU5hbWUgfSBmcm9tIFwiLi9kZWNvcmF0b3JzXCI7XG5pbXBvcnQgeyBOZXN0ZWRGb3JlaWduS2V5S2V5c09mLCBOZXN0ZWRLZXlzT2YgfSBmcm9tIFwiLi9OZXN0ZWRLZXlzT2ZcIjtcbmltcG9ydCB7IE5lc3RlZFJlY29yZCB9IGZyb20gXCIuL05lc3RlZFJlY29yZFwiO1xuaW1wb3J0IHsgTm9uRm9yZWlnbktleU9iamVjdHMgfSBmcm9tIFwiLi9Ob25Gb3JlaWduS2V5T2JqZWN0c1wiO1xuaW1wb3J0IHsgTm9uTnVsbGFibGVSZWN1cnNpdmUgfSBmcm9tIFwiLi9Ob25OdWxsYWJsZVJlY3Vyc2l2ZVwiO1xuaW1wb3J0IHsgUGFydGlhbEFuZFVuZGVmaW5lZCB9IGZyb20gXCIuL1BhcnRpYWxBbmRVbmRlZmluZWRcIjtcbmltcG9ydCB7IEdldE5lc3RlZFByb3BlcnR5LCBHZXROZXN0ZWRQcm9wZXJ0eVR5cGUgfSBmcm9tIFwiLi9Qcm9wZXJ0eVR5cGVzXCI7XG5pbXBvcnQgeyBTZWxlY3RhYmxlQ29sdW1uVHlwZXMgfSBmcm9tIFwiLi9TZWxlY3RhYmxlQ29sdW1uVHlwZXNcIjtcbmltcG9ydCB7IEZsYXR0ZW5PcHRpb24sIHNldFRvTnVsbCwgdW5mbGF0dGVuIH0gZnJvbSBcIi4vdW5mbGF0dGVuXCI7XG5cbmV4cG9ydCBjbGFzcyBUeXBlZEtuZXgge1xuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUga25leDogS25leCkge31cblxuICAgIHB1YmxpYyBxdWVyeTxUPih0YWJsZUNsYXNzOiBuZXcgKCkgPT4gVCwgZ3JhbnVsYXJpdHk/OiBHcmFudWxhcml0eSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxULCBULCBUPiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5R3JhbnVsYXJpdHkgPSBncmFudWxhcml0eSA/PyBnZXRUYWJsZU1ldGFkYXRhKHRhYmxlQ2xhc3MpLmRlZmF1bHRMb2NrO1xuICAgICAgICByZXR1cm4gbmV3IFR5cGVkUXVlcnlCdWlsZGVyPFQsIFQsIFQ+KHRhYmxlQ2xhc3MsIHF1ZXJ5R3JhbnVsYXJpdHksIHRoaXMua25leCk7XG4gICAgfVxuXG4gICAgcHVibGljIHdpdGg8VCwgVSwgVj4oY3RlVGFibGVDbGFzczogbmV3ICgpID0+IFQsIGN0ZVF1ZXJ5OiAocXVlcnlCdWlsZGVyOiBUeXBlZEtuZXhDVEVRdWVyeUJ1aWxkZXIpID0+IElUeXBlZFF1ZXJ5QnVpbGRlcjxVLCBWLCBUPik6IFR5cGVkS25leFF1ZXJ5QnVpbGRlciB7XG4gICAgICAgIGNvbnN0IGFsaWFzID0gZ2V0VGFibGVOYW1lKGN0ZVRhYmxlQ2xhc3MpO1xuICAgICAgICBjb25zdCBxYiA9IHRoaXMua25leC53aXRoKGFsaWFzLCAodykgPT4gY3RlUXVlcnkobmV3IFR5cGVkS25leENURVF1ZXJ5QnVpbGRlcih0aGlzLmtuZXgsIHcpKSk7XG4gICAgICAgIHJldHVybiBuZXcgVHlwZWRLbmV4UXVlcnlCdWlsZGVyKHRoaXMua25leCwgcWIpO1xuICAgIH1cblxuICAgIHB1YmxpYyBiZWdpblRyYW5zYWN0aW9uKCk6IFByb21pc2U8S25leC5UcmFuc2FjdGlvbj4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRoaXMua25leFxuICAgICAgICAgICAgICAgIC50cmFuc2FjdGlvbigodHIpID0+IHJlc29sdmUodHIpKVxuICAgICAgICAgICAgICAgIC8vIElmIHRoaXMgZXJyb3IgaXMgbm90IGNhdWdodCBoZXJlLCBpdCB3aWxsIHRocm93LCByZXN1bHRpbmcgaW4gYW4gdW5oYW5kbGVkUmVqZWN0aW9uXG4gICAgICAgICAgICAgICAgLmNhdGNoKChfZSkgPT4ge30pO1xuICAgICAgICB9KTtcbiAgICB9XG59XG5cbmNsYXNzIFR5cGVkS25leENURVF1ZXJ5QnVpbGRlciB7XG4gICAgY29uc3RydWN0b3IocHJvdGVjdGVkIGtuZXg6IEtuZXgsIHByb3RlY3RlZCBxdWVyeUJ1aWxkZXI6IEtuZXguUXVlcnlCdWlsZGVyKSB7fVxuXG4gICAgcHVibGljIHF1ZXJ5PFQ+KHRhYmxlQ2xhc3M6IG5ldyAoKSA9PiBULCBncmFudWxhcml0eT86IEdyYW51bGFyaXR5KTogSVR5cGVkUXVlcnlCdWlsZGVyPFQsIFQsIFQ+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBUeXBlZFF1ZXJ5QnVpbGRlcjxULCBULCBUPih0YWJsZUNsYXNzLCBncmFudWxhcml0eSwgdGhpcy5rbmV4LCB0aGlzLnF1ZXJ5QnVpbGRlcik7XG4gICAgfVxufVxuXG5jbGFzcyBUeXBlZEtuZXhRdWVyeUJ1aWxkZXIgZXh0ZW5kcyBUeXBlZEtuZXhDVEVRdWVyeUJ1aWxkZXIge1xuICAgIHB1YmxpYyB3aXRoPFQsIFUsIFY+KGN0ZVRhYmxlQ2xhc3M6IG5ldyAoKSA9PiBULCBjdGVRdWVyeTogKHF1ZXJ5QnVpbGRlcjogVHlwZWRLbmV4Q1RFUXVlcnlCdWlsZGVyKSA9PiBJVHlwZWRRdWVyeUJ1aWxkZXI8VSwgViwgVD4pOiBUeXBlZEtuZXhRdWVyeUJ1aWxkZXIge1xuICAgICAgICBjb25zdCBhbGlhcyA9IGdldFRhYmxlTmFtZShjdGVUYWJsZUNsYXNzKTtcbiAgICAgICAgY29uc3QgcWIgPSB0aGlzLnF1ZXJ5QnVpbGRlci53aXRoKGFsaWFzLCAodykgPT4gY3RlUXVlcnkobmV3IFR5cGVkS25leENURVF1ZXJ5QnVpbGRlcih0aGlzLmtuZXgsIHcpKSk7XG4gICAgICAgIHJldHVybiBuZXcgVHlwZWRLbmV4UXVlcnlCdWlsZGVyKHRoaXMua25leCwgcWIpO1xuICAgIH1cbn1cblxubGV0IGJlZm9yZUluc2VydFRyYW5zZm9ybSA9IHVuZGVmaW5lZCBhcyB1bmRlZmluZWQgfCAoKGl0ZW06IGFueSwgdHlwZWRRdWVyeUJ1aWxkZXI6IGFueSkgPT4gYW55KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQmVmb3JlSW5zZXJ0VHJhbnNmb3JtPFQ+KGY6IChpdGVtOiBULCB0eXBlZFF1ZXJ5QnVpbGRlcjogSVR5cGVkUXVlcnlCdWlsZGVyPHt9LCB7fSwge30+KSA9PiBUKSB7XG4gICAgYmVmb3JlSW5zZXJ0VHJhbnNmb3JtID0gZjtcbn1cblxubGV0IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSA9IHVuZGVmaW5lZCBhcyB1bmRlZmluZWQgfCAoKGl0ZW06IGFueSwgdHlwZWRRdWVyeUJ1aWxkZXI6IGFueSkgPT4gYW55KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQmVmb3JlVXBkYXRlVHJhbnNmb3JtPFQ+KGY6IChpdGVtOiBULCB0eXBlZFF1ZXJ5QnVpbGRlcjogSVR5cGVkUXVlcnlCdWlsZGVyPHt9LCB7fSwge30+KSA9PiBUKSB7XG4gICAgYmVmb3JlVXBkYXRlVHJhbnNmb3JtID0gZjtcbn1cblxuY2xhc3MgTm90SW1wbGVtZW50ZWRFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoXCJOb3QgaW1wbGVtZW50ZWRcIik7XG4gICAgfVxufVxuXG5jbGFzcyBDb2x1bW5Gcm9tUXVlcnkge1xuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgYWxpYXM6IHN0cmluZykge31cblxuICAgIHB1YmxpYyB0b1N0cmluZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYWxpYXM7XG4gICAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICBjb2x1bW5zOiB7IG5hbWU6IHN0cmluZyB9W107XG5cbiAgICB3aGVyZTogSVdoZXJlV2l0aE9wZXJhdG9yPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgYW5kV2hlcmU6IElXaGVyZVdpdGhPcGVyYXRvcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmU6IElXaGVyZVdpdGhPcGVyYXRvcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIHdoZXJlTm90OiBJV2hlcmU8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBzZWxlY3Q6IElTZWxlY3RXaXRoRnVuY3Rpb25Db2x1bW5zMzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIHNlbGVjdFF1ZXJ5OiBJU2VsZWN0UXVlcnk8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIG9yZGVyQnk6IElPcmRlckJ5PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgaW5uZXJKb2luQ29sdW1uOiBJS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGxlZnRPdXRlckpvaW5Db2x1bW46IElLZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZUNvbHVtbjogSVdoZXJlQ29tcGFyZVR3b0NvbHVtbnM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHdoZXJlTnVsbDogSUNvbHVtblBhcmFtZXRlck5vUm93VHJhbnNmb3JtYXRpb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdE51bGw6IElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU51bGw6IElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU5vdE51bGw6IElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBsZWZ0T3V0ZXJKb2luVGFibGVPbkZ1bmN0aW9uOiBJSm9pblRhYmxlTXVsdGlwbGVPbkNsYXVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgaW5uZXJKb2luVGFibGVPbkZ1bmN0aW9uOiBJSm9pblRhYmxlTXVsdGlwbGVPbkNsYXVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBpbm5lckpvaW46IElKb2luPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIGxlZnRPdXRlckpvaW46IElKb2luPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgc2VsZWN0QWxpYXM6IElTZWxlY3RBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBzZWxlY3RSYXc6IElTZWxlY3RSYXc8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBmaW5kQnlQcmltYXJ5S2V5OiBJRmluZEJ5UHJpbWFyeUtleTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIHdoZXJlSW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgd2hlcmVOb3RJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIG9yV2hlcmVJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlTm90SW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZUJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdEJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlQmV0d2VlbjogSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVOb3RCZXR3ZWVuOiBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZUV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBvcldoZXJlRXhpc3RzOiBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdEV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU5vdEV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZVBhcmVudGhlc2VzOiBJV2hlcmVQYXJlbnRoZXNlczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVQYXJlbnRoZXNlczogSVdoZXJlUGFyZW50aGVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGdyb3VwQnk6IElTZWxlY3RhYmxlQ29sdW1uS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nOiBJSGF2aW5nPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBoYXZpbmdOdWxsOiBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3ROdWxsOiBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGhhdmluZ0luOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGhhdmluZ05vdEluOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nRXhpc3RzOiBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3RFeGlzdHM6IElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nQmV0d2VlbjogSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGhhdmluZ05vdEJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHVuaW9uOiBJVW5pb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB1bmlvbkFsbDogSVVuaW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBtaW46IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgY291bnQ6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIGNvdW50RGlzdGluY3Q6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIG1heDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgc3VtOiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBzdW1EaXN0aW5jdDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgYXZnOiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBhdmdEaXN0aW5jdDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBpbnNlcnRTZWxlY3Q6IElJbnNlcnRTZWxlY3Q7XG5cbiAgICBpbnNlcnRJdGVtV2l0aFJldHVybmluZzogSUluc2VydEl0ZW1XaXRoUmV0dXJuaW5nPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgdXBkYXRlSXRlbVdpdGhSZXR1cm5pbmc6IElJbnNlcnRJdGVtV2l0aFJldHVybmluZzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgZ2V0Q29sdW1uQWxpYXMobmFtZTogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPik6IHN0cmluZztcbiAgICBnZXRDb2x1bW4obmFtZTogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPik6IENvbHVtbkZyb21RdWVyeTtcblxuICAgIGRpc3RpbmN0T24oY29sdW1uTmFtZXM6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj5bXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgY2xlYXJTZWxlY3QoKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIE1vZGVsPjtcbiAgICBjbGVhcldoZXJlKCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGNsZWFyT3JkZXIoKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBsaW1pdCh2YWx1ZTogbnVtYmVyKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb2Zmc2V0KHZhbHVlOiBudW1iZXIpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHVzZUtuZXhRdWVyeUJ1aWxkZXIoZjogKHF1ZXJ5OiBLbmV4LlF1ZXJ5QnVpbGRlcikgPT4gdm9pZCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGdldEtuZXhRdWVyeUJ1aWxkZXIoKTogS25leC5RdWVyeUJ1aWxkZXI7XG4gICAgdG9RdWVyeSgpOiBzdHJpbmc7XG5cbiAgICBnZXRGaXJzdE9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8KFJvdyBleHRlbmRzIE1vZGVsID8gUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+IDogUm93KSB8IG51bGw+O1xuICAgIGdldEZpcnN0T3JVbmRlZmluZWQoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdykgfCB1bmRlZmluZWQ+O1xuICAgIGdldEZpcnN0KGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTxSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdz47XG4gICAgZ2V0U2luZ2xlT3JOdWxsKGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTwoUm93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3cpIHwgbnVsbD47XG4gICAgZ2V0U2luZ2xlT3JVbmRlZmluZWQoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdykgfCB1bmRlZmluZWQ+O1xuICAgIGdldFNpbmdsZShmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8Um93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3c+O1xuICAgIGdldE1hbnkoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdylbXT47XG4gICAgZ2V0Q291bnQoKTogUHJvbWlzZTxudW1iZXIgfCBzdHJpbmc+O1xuICAgIGluc2VydEl0ZW0obmV3T2JqZWN0OiBQYXJ0aWFsQW5kVW5kZWZpbmVkPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4pOiBQcm9taXNlPHZvaWQ+O1xuICAgIGluc2VydEl0ZW1zKGl0ZW1zOiBQYXJ0aWFsQW5kVW5kZWZpbmVkPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj5bXSk6IFByb21pc2U8dm9pZD47XG4gICAgZGVsKCk6IFByb21pc2U8dm9pZD47XG4gICAgZGVsQnlQcmltYXJ5S2V5KHByaW1hcnlLZXlWYWx1ZTogYW55KTogUHJvbWlzZTx2b2lkPjtcbiAgICB1cGRhdGVJdGVtKGl0ZW06IFBhcnRpYWxBbmRVbmRlZmluZWQ8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+Pik6IFByb21pc2U8dm9pZD47XG4gICAgdXBkYXRlSXRlbUJ5UHJpbWFyeUtleShwcmltYXJ5S2V5VmFsdWU6IGFueSwgaXRlbTogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+KTogUHJvbWlzZTx2b2lkPjtcbiAgICB1cGRhdGVJdGVtc0J5UHJpbWFyeUtleShcbiAgICAgICAgaXRlbXM6IHtcbiAgICAgICAgICAgIHByaW1hcnlLZXlWYWx1ZTogYW55O1xuICAgICAgICAgICAgZGF0YTogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+O1xuICAgICAgICB9W11cbiAgICApOiBQcm9taXNlPHZvaWQ+O1xuICAgIGV4ZWN1dGUoKTogUHJvbWlzZTx2b2lkPjtcbiAgICB3aGVyZVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgaGF2aW5nUmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHRyYW5zYWN0aW5nKHRyeDogS25leC5UcmFuc2FjdGlvbik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgdHJ1bmNhdGUoKTogUHJvbWlzZTx2b2lkPjtcbiAgICBkaXN0aW5jdCgpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGNsb25lKCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgZ3JvdXBCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBvcmRlckJ5UmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGtlZXBGbGF0KCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBhbnk+O1xufVxuXG50eXBlIFJldHVybk5vbk9iamVjdHNOYW1lc09ubHk8VD4gPSB7IFtLIGluIGtleW9mIFRdOiBUW0tdIGV4dGVuZHMgU2VsZWN0YWJsZUNvbHVtblR5cGVzID8gSyA6IG5ldmVyIH1ba2V5b2YgVF07XG5cbnR5cGUgUmVtb3ZlT2JqZWN0c0Zyb208VD4gPSB7IFtQIGluIFJldHVybk5vbk9iamVjdHNOYW1lc09ubHk8VD5dOiBUW1BdIH07XG5cbmV4cG9ydCB0eXBlIE9iamVjdFRvUHJpbWl0aXZlPFQ+ID0gVCBleHRlbmRzIFN0cmluZyA/IHN0cmluZyA6IFQgZXh0ZW5kcyBOdW1iZXIgPyBudW1iZXIgOiBUIGV4dGVuZHMgQm9vbGVhbiA/IGJvb2xlYW4gOiBuZXZlcjtcblxuZXhwb3J0IHR5cGUgT3BlcmF0b3IgPSBcIj1cIiB8IFwiIT1cIiB8IFwiPlwiIHwgXCI8XCIgfCBzdHJpbmc7XG5cbmludGVyZmFjZSBJQ29uc3RydWN0b3I8VD4ge1xuICAgIG5ldyAoLi4uYXJnczogYW55W10pOiBUO1xufVxuXG5leHBvcnQgdHlwZSBBZGRQcm9wZXJ0eVdpdGhUeXBlPE9yaWdpbmFsLCBOZXdLZXkgZXh0ZW5kcyBrZXlvZiBhbnksIE5ld0tleVR5cGU+ID0gT3JpZ2luYWwgJiBOZXN0ZWRSZWNvcmQ8TmV3S2V5LCBOZXdLZXlUeXBlPjtcblxuaW50ZXJmYWNlIElJbnNlcnRJdGVtV2l0aFJldHVybmluZzxNb2RlbCwgX1NlbGVjdGFibGVNb2RlbCwgX1Jvdz4ge1xuICAgIChuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+Pik6IFByb21pc2U8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+PjtcbiAgICA8S2V5cyBleHRlbmRzIGtleW9mIFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4obmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4sIGtleXM6IEtleXNbXSk6IFByb21pc2U8UGljazxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4sIEtleXM+Pjtcbn1cblxuaW50ZXJmYWNlIElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5PbjxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICA8Q29uY2F0S2V5MSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4sIENvbmNhdEtleTIgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihcbiAgICAgICAga2V5MTogQ29uY2F0S2V5MSxcbiAgICAgICAgb3BlcmF0b3I6IE9wZXJhdG9yLFxuICAgICAgICBrZXkyOiBDb25jYXRLZXkyXG4gICAgKTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElKb2luT25WYWw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBvcGVyYXRvcjogT3BlcmF0b3IsIHZhbHVlOiBhbnkpOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuaW50ZXJmYWNlIElKb2luT25Nb2RlbFZhbDxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXksIG9wZXJhdG9yOiBPcGVyYXRvciwgdmFsdWU6IGFueSk6IElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSm9pbk9uTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8Sm9pbmVkTW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXkpOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuaW50ZXJmYWNlIElKb2luT25Nb2RlbE51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5KTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElKb2luT25QYXJlbnRoZXNlczxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICAob25GdW5jdGlvbjogKGpvaW46IElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD4pID0+IHZvaWQpOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5PblJhdzxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICAoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSk6IElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICBvbjogSUpvaW5PbjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT246IElKb2luT248TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBhbmRPbjogSUpvaW5PbjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9uVmFsOiBJSm9pbk9uVmFsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgYW5kT25WYWw6IElKb2luT25WYWw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvblF1ZXJ5VmFsOiBJSm9pbk9uTW9kZWxWYWw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvck9uVmFsOiBJSm9pbk9uVmFsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPblF1ZXJ5VmFsOiBJSm9pbk9uTW9kZWxWYWw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvbk51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25RdWVyeU51bGw6IElKb2luT25Nb2RlbE51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvck9uTnVsbDogSUpvaW5Pbk51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvck9uUXVlcnlOdWxsOiBJSm9pbk9uTW9kZWxOdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25Ob3ROdWxsOiBJSm9pbk9uTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9uUXVlcnlOb3ROdWxsOiBJSm9pbk9uTW9kZWxOdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPbk5vdE51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPblF1ZXJ5Tm90TnVsbDogSUpvaW5Pbk1vZGVsTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIGFuZE9uTm90TnVsbDogSUpvaW5Pbk51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBhbmRPbk51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25QYXJlbnRoZXNlczogSUpvaW5PblBhcmVudGhlc2VzPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgYW5kT25QYXJlbnRoZXNlczogSUpvaW5PblBhcmVudGhlc2VzPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPblBhcmVudGhlc2VzOiBJSm9pbk9uUGFyZW50aGVzZXM8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvblJhdzogSUpvaW5PblJhdzxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25SYXc6IElKb2luT25SYXc8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElJbnNlcnRTZWxlY3Qge1xuICAgIDxOZXdQcm9wZXJ0eVR5cGUsIENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxOZXdQcm9wZXJ0eVR5cGU+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxOZXdQcm9wZXJ0eVR5cGU+LCBcIlwiPj4oXG4gICAgICAgIG5ld1Byb3BlcnR5Q2xhc3M6IG5ldyAoKSA9PiBOZXdQcm9wZXJ0eVR5cGUsXG4gICAgICAgIC4uLmNvbHVtbk5hbWVzOiBDb25jYXRLZXlbXVxuICAgICk6IFByb21pc2U8dm9pZD47XG59XG5cbmludGVyZmFjZSBJSm9pblRhYmxlTXVsdGlwbGVPbkNsYXVzZXM8TW9kZWwsIF9TZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxOZXdQcm9wZXJ0eVR5cGUsIE5ld1Byb3BlcnR5S2V5IGV4dGVuZHMga2V5b2YgYW55PihcbiAgICAgICAgbmV3UHJvcGVydHlLZXk6IE5ld1Byb3BlcnR5S2V5LFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICBvbjogKGpvaW46IElKb2luT25DbGF1c2UyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBOZXdQcm9wZXJ0eVR5cGU+KSA9PiB2b2lkXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93PjtcblxuICAgIDxOZXdQcm9wZXJ0eVR5cGUsIE5ld1Byb3BlcnR5S2V5IGV4dGVuZHMga2V5b2YgYW55PihcbiAgICAgICAgbmV3UHJvcGVydHlLZXk6IE5ld1Byb3BlcnR5S2V5LFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICBncmFudWxhcml0eTogR3JhbnVsYXJpdHksXG4gICAgICAgIG9uOiAoam9pbjogSUpvaW5PbkNsYXVzZTI8QWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIE5ld1Byb3BlcnR5VHlwZT4pID0+IHZvaWRcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8QWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW48TW9kZWwsIF9TZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxOZXdQcm9wZXJ0eVR5cGUsIE5ld1Byb3BlcnR5S2V5IGV4dGVuZHMga2V5b2YgYW55LCBDb25jYXRLZXkyIGV4dGVuZHMga2V5b2YgTmV3UHJvcGVydHlUeXBlLCBDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihcbiAgICAgICAgbmV3UHJvcGVydHlLZXk6IE5ld1Byb3BlcnR5S2V5LFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICBrZXk6IENvbmNhdEtleTIsXG4gICAgICAgIG9wZXJhdG9yOiBPcGVyYXRvcixcbiAgICAgICAga2V5MjogQ29uY2F0S2V5XG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93PjtcblxuICAgIDxOZXdQcm9wZXJ0eVR5cGUsIE5ld1Byb3BlcnR5S2V5IGV4dGVuZHMga2V5b2YgYW55LCBDb25jYXRLZXkyIGV4dGVuZHMga2V5b2YgTmV3UHJvcGVydHlUeXBlLCBDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihcbiAgICAgICAgbmV3UHJvcGVydHlLZXk6IE5ld1Byb3BlcnR5S2V5LFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICBncmFudWxhcml0eTogR3JhbnVsYXJpdHksXG4gICAgICAgIGtleTogQ29uY2F0S2V5MixcbiAgICAgICAgb3BlcmF0b3I6IE9wZXJhdG9yLFxuICAgICAgICBrZXkyOiBDb25jYXRLZXlcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8QWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVNlbGVjdEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwgXCJcIj4sIFROYW1lIGV4dGVuZHMga2V5b2YgYW55PihhbGlhczogVE5hbWUsIGNvbHVtbk5hbWU6IENvbmNhdEtleSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxcbiAgICAgICAgTW9kZWwsXG4gICAgICAgIFNlbGVjdGFibGVNb2RlbCxcbiAgICAgICAgUmVjb3JkPFROYW1lLCBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8U2VsZWN0YWJsZU1vZGVsLCBDb25jYXRLZXk+PiAmIFJvd1xuICAgID47XG59XG5cbmludGVyZmFjZSBJU2VsZWN0UmF3PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxUUmV0dXJuIGV4dGVuZHMgQm9vbGVhbiB8IFN0cmluZyB8IE51bWJlciwgVE5hbWUgZXh0ZW5kcyBrZXlvZiBhbnk+KG5hbWU6IFROYW1lLCByZXR1cm5UeXBlOiBJQ29uc3RydWN0b3I8VFJldHVybj4sIHF1ZXJ5OiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxcbiAgICAgICAgTW9kZWwsXG4gICAgICAgIFNlbGVjdGFibGVNb2RlbCxcbiAgICAgICAgUmVjb3JkPFROYW1lLCBPYmplY3RUb1ByaW1pdGl2ZTxUUmV0dXJuPj4gJiBSb3dcbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSVNlbGVjdFF1ZXJ5PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxUUmV0dXJuIGV4dGVuZHMgQm9vbGVhbiB8IFN0cmluZyB8IE51bWJlciwgVE5hbWUgZXh0ZW5kcyBrZXlvZiBhbnksIFN1YlF1ZXJ5TW9kZWw+KFxuICAgICAgICBuYW1lOiBUTmFtZSxcbiAgICAgICAgcmV0dXJuVHlwZTogSUNvbnN0cnVjdG9yPFRSZXR1cm4+LFxuICAgICAgICBzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCxcbiAgICAgICAgY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8U3ViUXVlcnlNb2RlbCwgU3ViUXVlcnlNb2RlbCwge30+LCBwYXJlbnQ6IFRyYW5zZm9ybVByb3BzVG9GdW5jdGlvbnNSZXR1cm5Qcm9wZXJ0eU5hbWU8TW9kZWw+KSA9PiB2b2lkLFxuICAgICAgICBncmFudWxhcml0eT86IEdyYW51bGFyaXR5XG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJlY29yZDxUTmFtZSwgT2JqZWN0VG9QcmltaXRpdmU8VFJldHVybj4+ICYgUm93Pjtcbn1cblxudHlwZSBUcmFuc2Zvcm1Qcm9wc1RvRnVuY3Rpb25zUmV0dXJuUHJvcGVydHlOYW1lPE1vZGVsPiA9IHtcbiAgICBbUCBpbiBrZXlvZiBNb2RlbF06IE1vZGVsW1BdIGV4dGVuZHMgb2JqZWN0ID8gKE1vZGVsW1BdIGV4dGVuZHMgUmVxdWlyZWQ8Tm9uRm9yZWlnbktleU9iamVjdHM+ID8gKCkgPT4gUCA6IFRyYW5zZm9ybVByb3BzVG9GdW5jdGlvbnNSZXR1cm5Qcm9wZXJ0eU5hbWU8TW9kZWxbUF0+KSA6ICgpID0+IFA7XG59O1xuXG5pbnRlcmZhY2UgSU9yZGVyQnk8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBcIlwiPiwgVE5hbWUgZXh0ZW5kcyBrZXlvZiBhbnk+KFxuICAgICAgICBjb2x1bW5OYW1lczogQ29uY2F0S2V5LFxuICAgICAgICBkaXJlY3Rpb24/OiBcImFzY1wiIHwgXCJkZXNjXCJcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93ICYgUmVjb3JkPFROYW1lLCBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8U2VsZWN0YWJsZU1vZGVsLCBDb25jYXRLZXk+Pj47XG59XG5cbmludGVyZmFjZSBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIFwiXCI+LCBUTmFtZSBleHRlbmRzIGtleW9mIGFueT4oY29sdW1uTmFtZXM6IENvbmNhdEtleSwgbmFtZTogVE5hbWUpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJvdyAmIFJlY29yZDxUTmFtZSwgR2V0TmVzdGVkUHJvcGVydHlUeXBlPFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj5cbiAgICA+O1xufVxuXG50eXBlIFVuaW9uVG9JbnRlcnNlY3Rpb248VT4gPSAoVSBleHRlbmRzIGFueSA/IChrOiBVKSA9PiB2b2lkIDogbmV2ZXIpIGV4dGVuZHMgKGs6IGluZmVyIEkpID0+IHZvaWQgPyBJIDogbmV2ZXI7XG5cbmludGVyZmFjZSBJU2VsZWN0V2l0aEZ1bmN0aW9uQ29sdW1uczM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBcIlwiPj4oLi4uY29sdW1uTmFtZXM6IENvbmNhdEtleVtdKTogSVR5cGVkUXVlcnlCdWlsZGVyPFxuICAgICAgICBNb2RlbCxcbiAgICAgICAgU2VsZWN0YWJsZU1vZGVsLFxuICAgICAgICBSb3cgJiBVbmlvblRvSW50ZXJzZWN0aW9uPEdldE5lc3RlZFByb3BlcnR5PFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj5cbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSUZpbmRCeVByaW1hcnlLZXk8X01vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwgXCJcIj4+KHByaW1hcnlLZXlWYWx1ZTogYW55LCAuLi5jb2x1bW5OYW1lczogQ29uY2F0S2V5W10pOiBQcm9taXNlPFxuICAgICAgICAoUm93ICYgVW5pb25Ub0ludGVyc2VjdGlvbjxHZXROZXN0ZWRQcm9wZXJ0eTxTZWxlY3RhYmxlTW9kZWwsIENvbmNhdEtleT4+KSB8IHVuZGVmaW5lZFxuICAgID47XG59XG5cbmludGVyZmFjZSBJS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkRm9yZWlnbktleUtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBncmFudWxhcml0eT86IEdyYW51bGFyaXR5KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmU8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCB2YWx1ZTogR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmVXaXRoT3BlcmF0b3I8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCB2YWx1ZTogR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXksIG9wZXJhdG9yOiBPcGVyYXRvciwgdmFsdWU6IEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5Pik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxcbiAgICAgICAgTW9kZWwsXG4gICAgICAgIFNlbGVjdGFibGVNb2RlbCxcbiAgICAgICAgUm93XG4gICAgPjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgdmFsdWU6IEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5PltdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+LCBQcm9wZXJ0eVR5cGUgZXh0ZW5kcyBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT4+KFxuICAgICAgICBrZXk6IENvbmNhdEtleSxcbiAgICAgICAgdmFsdWU6IFtQcm9wZXJ0eVR5cGUsIFByb3BlcnR5VHlwZV1cbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElIYXZpbmc8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBvcGVyYXRvcjogT3BlcmF0b3IsIHZhbHVlOiBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT4pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJvd1xuICAgID47XG59XG5cbmludGVyZmFjZSBJV2hlcmVDb21wYXJlVHdvQ29sdW1uczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8X1Byb3BlcnR5VHlwZTEsIF9Qcm9wZXJ0eVR5cGUyLCBNb2RlbDI+KFxuICAgICAgICBrZXkxOiBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+LFxuICAgICAgICBvcGVyYXRvcjogT3BlcmF0b3IsXG4gICAgICAgIGtleTI6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbDI+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbDI+LCBcIlwiPlxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgKGtleTE6IENvbHVtbkZyb21RdWVyeSwgb3BlcmF0b3I6IE9wZXJhdG9yLCBrZXkyOiBDb2x1bW5Gcm9tUXVlcnkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8U3ViUXVlcnlNb2RlbD4oXG4gICAgICAgIHN1YlF1ZXJ5TW9kZWw6IG5ldyAoKSA9PiBTdWJRdWVyeU1vZGVsLFxuICAgICAgICBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4sIHBhcmVudDogVHJhbnNmb3JtUHJvcHNUb0Z1bmN0aW9uc1JldHVyblByb3BlcnR5TmFtZTxTZWxlY3RhYmxlTW9kZWw+KSA9PiB2b2lkXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICA8U3ViUXVlcnlNb2RlbD4oXG4gICAgICAgIHN1YlF1ZXJ5TW9kZWw6IG5ldyAoKSA9PiBTdWJRdWVyeU1vZGVsLFxuICAgICAgICBncmFudWxhcml0eTogR3JhbnVsYXJpdHksXG4gICAgICAgIGNvZGU6IChzdWJRdWVyeTogSVR5cGVkUXVlcnlCdWlsZGVyPFN1YlF1ZXJ5TW9kZWwsIFN1YlF1ZXJ5TW9kZWwsIHt9PiwgcGFyZW50OiBUcmFuc2Zvcm1Qcm9wc1RvRnVuY3Rpb25zUmV0dXJuUHJvcGVydHlOYW1lPFNlbGVjdGFibGVNb2RlbD4pID0+IHZvaWRcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZVBhcmVudGhlc2VzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIChjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+KSA9PiB2b2lkKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJVW5pb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPFN1YlF1ZXJ5TW9kZWw+KHN1YlF1ZXJ5TW9kZWw6IG5ldyAoKSA9PiBTdWJRdWVyeU1vZGVsLCBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4pID0+IHZvaWQpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIDxTdWJRdWVyeU1vZGVsPihzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCwgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LCBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4pID0+IHZvaWQpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuZXhwb3J0IHR5cGUgR3JhbnVsYXJpdHkgPSBcIlBBR0xPQ0tcIiB8IFwiTk9MT0NLXCIgfCBcIlJFQURDT01NSVRURURMT0NLXCIgfCBcIlJPV0xPQ0tcIiB8IFwiVEFCTE9DS1wiIHwgXCJUQUJMT0NLWFwiO1xuXG5mdW5jdGlvbiBnZXRQcm94eUFuZE1lbW9yaWVzPE1vZGVsVHlwZSwgUm93Pih0eXBlZFF1ZXJ5QnVpbGRlcj86IFR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsVHlwZSwgUm93Pikge1xuICAgIGNvbnN0IG1lbW9yaWVzID0gW10gYXMgc3RyaW5nW107XG5cbiAgICBmdW5jdGlvbiBhbGxHZXQoX3RhcmdldDogYW55LCBuYW1lOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAobmFtZSA9PT0gXCJtZW1vcmllc1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gbWVtb3JpZXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmFtZSA9PT0gXCJnZXRDb2x1bW5OYW1lXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0eXBlZFF1ZXJ5QnVpbGRlciEuZ2V0Q29sdW1uTmFtZSguLi5tZW1vcmllcyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIG1lbW9yaWVzLnB1c2gobmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm94eShcbiAgICAgICAgICAgIHt9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGdldDogYWxsR2V0LFxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHJvb3QgPSBuZXcgUHJveHkoXG4gICAgICAgIHt9LFxuICAgICAgICB7XG4gICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICByZXR1cm4geyByb290LCBtZW1vcmllcyB9O1xufVxuXG5mdW5jdGlvbiBnZXRQcm94eUFuZE1lbW9yaWVzRm9yQXJyYXk8TW9kZWxUeXBlLCBSb3c+KHR5cGVkUXVlcnlCdWlsZGVyPzogVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBSb3c+KSB7XG4gICAgY29uc3QgcmVzdWx0ID0gW10gYXMgc3RyaW5nW11bXTtcblxuICAgIGxldCBjb3VudGVyID0gLTE7XG5cbiAgICBmdW5jdGlvbiBhbGxHZXQoX3RhcmdldDogYW55LCBuYW1lOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAoX3RhcmdldC5sZXZlbCA9PT0gMCkge1xuICAgICAgICAgICAgY291bnRlcisrO1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goW10pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChuYW1lID09PSBcIm1lbW9yaWVzXCIpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRbY291bnRlcl07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwicmVzdWx0XCIpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwibGV2ZWxcIikge1xuICAgICAgICAgICAgcmV0dXJuIF90YXJnZXQubGV2ZWw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwiZ2V0Q29sdW1uTmFtZVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZWRRdWVyeUJ1aWxkZXIhLmdldENvbHVtbk5hbWUoLi4ucmVzdWx0W2NvdW50ZXJdKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJlc3VsdFtjb3VudGVyXS5wdXNoKG5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJveHkoXG4gICAgICAgICAgICB7fSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCByb290ID0gbmV3IFByb3h5KFxuICAgICAgICB7IGxldmVsOiAwIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIGdldDogYWxsR2V0LFxuICAgICAgICB9XG4gICAgKTtcblxuICAgIHJldHVybiB7IHJvb3QsIHJlc3VsdCB9O1xufVxuXG5leHBvcnQgY2xhc3MgVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyA9IHt9PiBpbXBsZW1lbnRzIElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbFR5cGUsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgcHVibGljIGNvbHVtbnM6IHsgbmFtZTogc3RyaW5nIH1bXTtcblxuICAgIHB1YmxpYyBvbmx5TG9nUXVlcnkgPSBmYWxzZTtcbiAgICBwdWJsaWMgcXVlcnlMb2cgPSBcIlwiO1xuICAgIHByaXZhdGUgaGFzU2VsZWN0Q2xhdXNlID0gZmFsc2U7XG5cbiAgICBwcml2YXRlIHF1ZXJ5QnVpbGRlcjogS25leC5RdWVyeUJ1aWxkZXI7XG4gICAgcHJpdmF0ZSB0YWJsZU5hbWU6IHN0cmluZztcbiAgICBwcml2YXRlIHNob3VsZFVuZmxhdHRlbjogYm9vbGVhbjtcbiAgICBwcml2YXRlIGV4dHJhSm9pbmVkUHJvcGVydGllczoge1xuICAgICAgICBuYW1lOiBzdHJpbmc7XG4gICAgICAgIHByb3BlcnR5VHlwZTogbmV3ICgpID0+IGFueTtcbiAgICB9W107XG5cbiAgICBwcml2YXRlIHRyYW5zYWN0aW9uPzogS25leC5UcmFuc2FjdGlvbjtcblxuICAgIHByaXZhdGUgc3ViUXVlcnlDb3VudGVyID0gMDtcblxuICAgIHByaXZhdGUgZ3JhbnVsYXJpdHlTZXQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxHcmFudWxhcml0eT4oW1wiTk9MT0NLXCIsIFwiUEFHTE9DS1wiLCBcIlJFQURDT01NSVRURURMT0NLXCIsIFwiUk9XTE9DS1wiLCBcIlRBQkxPQ0tcIiwgXCJUQUJMT0NLWFwiXSk7XG5cbiAgICBjb25zdHJ1Y3RvcihcbiAgICAgICAgcHJpdmF0ZSB0YWJsZUNsYXNzOiBuZXcgKCkgPT4gTW9kZWxUeXBlLFxuICAgICAgICBwcml2YXRlIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCxcbiAgICAgICAgcHJpdmF0ZSBrbmV4OiBLbmV4LFxuICAgICAgICBxdWVyeUJ1aWxkZXI/OiBLbmV4LlF1ZXJ5QnVpbGRlcixcbiAgICAgICAgcHJpdmF0ZSBwYXJlbnRUeXBlZFF1ZXJ5QnVpbGRlcj86IGFueSxcbiAgICAgICAgcHJpdmF0ZSBzdWJRdWVyeVByZWZpeD86IHN0cmluZ1xuICAgICkge1xuICAgICAgICB0aGlzLnRhYmxlTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZUNsYXNzKTtcbiAgICAgICAgdGhpcy5jb2x1bW5zID0gZ2V0Q29sdW1uUHJvcGVydGllcyh0YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcbiAgICAgICAgaWYgKHF1ZXJ5QnVpbGRlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlciA9IHF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICh0aGlzLnN1YlF1ZXJ5UHJlZml4KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZnJvbSh0aGlzLmtuZXgucmF3KGA/PyBhcyA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGhpcy50YWJsZU5hbWUsIGAke3RoaXMuc3ViUXVlcnlQcmVmaXh9JHt0aGlzLnRhYmxlTmFtZX1gXSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5mcm9tKHRoaXMua25leC5yYXcoYD8/JHtncmFudWxhcml0eVF1ZXJ5fWAsIFt0aGlzLnRhYmxlTmFtZV0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyID0gdGhpcy5rbmV4LmZyb20odGhpcy5rbmV4LnJhdyhgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RoaXMudGFibGVOYW1lXSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMgPSBbXTtcbiAgICAgICAgdGhpcy5zaG91bGRVbmZsYXR0ZW4gPSB0cnVlO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXROZXh0U3ViUXVlcnlQcmVmaXgoKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn1zdWJxdWVyeSR7dGhpcy5zdWJRdWVyeUNvdW50ZXJ9JGA7XG4gICAgICAgIHRoaXMuc3ViUXVlcnlDb3VudGVyKys7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgcHVibGljIGtlZXBGbGF0KCkge1xuICAgICAgICB0aGlzLnNob3VsZFVuZmxhdHRlbiA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q29sdW1uQWxpYXMobmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmtuZXgucmF3KFwiPz9cIiwgdGhpcy5nZXRDb2x1bW5OYW1lKC4uLm5hbWUuc3BsaXQoXCIuXCIpKSkudG9RdWVyeSgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRDb2x1bW4obmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ29sdW1uRnJvbVF1ZXJ5KHRoaXMuZ2V0Q29sdW1uQWxpYXMobmFtZSkpO1xuICAgIH1cblxuICAgIHB1YmxpYyBkaXN0aW5jdE9uKGNvbHVtbk5hbWVzOiBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWxUeXBlPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWxUeXBlPiwgXCJcIj5bXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbFR5cGUsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgICAgIGNvbnN0IG1hcHBlZENvbHVtbk5hbWVzID0gY29sdW1uTmFtZXMubWFwKChjb2x1bW5OYW1lKSA9PiB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uTmFtZS5zcGxpdChcIi5cIikpKTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZGlzdGluY3RPbihtYXBwZWRDb2x1bW5OYW1lcyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBkZWwoKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyLmRlbCgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBkZWxCeVByaW1hcnlLZXkodmFsdWU6IGFueSkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlci5kZWwoKS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCB2YWx1ZSk7XG4gICAgfVxuXG4gICAgcHVibGljIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+Pik6IFByb21pc2U8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj47XG4gICAgcHVibGljIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nPEtleXMgZXh0ZW5kcyBrZXlvZiBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+PihuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4sIGtleXM6IEtleXNbXSk6IFByb21pc2U8UGljazxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+LCBLZXlzPj47XG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+PiwgcmV0dXJuUHJvcGVydGllcz86IChrZXlvZiBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+KVtdKSB7XG4gICAgICAgIGxldCBpdGVtID0gbmV3T2JqZWN0O1xuICAgICAgICBpZiAoYmVmb3JlVXBkYXRlVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICBpdGVtID0gYmVmb3JlVXBkYXRlVHJhbnNmb3JtKG5ld09iamVjdCwgdGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tYXBQcm9wZXJ0aWVzVG9Db2x1bW5zKGl0ZW0pO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIudXBkYXRlKGl0ZW0pO1xuICAgICAgICBpZiAocmV0dXJuUHJvcGVydGllcykge1xuICAgICAgICAgICAgY29uc3QgbWFwcGVkTmFtZXMgPSByZXR1cm5Qcm9wZXJ0aWVzLm1hcCgoY29sdW1uTmFtZSkgPT4gdGhpcy5nZXRDb2x1bW5OYW1lKGNvbHVtbk5hbWUgYXMgc3RyaW5nKSk7XG4gICAgICAgICAgICBxdWVyeS5yZXR1cm5pbmcobWFwcGVkTmFtZXMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKFwiKlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuXG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gKGF3YWl0IHF1ZXJ5KSBhcyBhbnk7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gcm93c1swXTtcblxuICAgICAgICAgICAgdGhpcy5tYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW0pO1xuXG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pOiBQcm9taXNlPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+O1xuICAgIHB1YmxpYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZzxLZXlzIGV4dGVuZHMga2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4obmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+LCBrZXlzOiBLZXlzW10pOiBQcm9taXNlPFBpY2s8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPiwgS2V5cz4+O1xuICAgIHB1YmxpYyBhc3luYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4sIHJldHVyblByb3BlcnRpZXM/OiAoa2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPilbXSkge1xuICAgICAgICBsZXQgaXRlbSA9IG5ld09iamVjdDtcbiAgICAgICAgaWYgKGJlZm9yZUluc2VydFRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZUluc2VydFRyYW5zZm9ybShuZXdPYmplY3QsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyh0aGlzLnRhYmxlQ2xhc3MpO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuaW5zZXJ0KGl0ZW0pO1xuICAgICAgICBpZiAocmV0dXJuUHJvcGVydGllcykge1xuICAgICAgICAgICAgY29uc3QgbWFwcGVkTmFtZXMgPSByZXR1cm5Qcm9wZXJ0aWVzLm1hcCgoY29sdW1uTmFtZSkgPT4gdGhpcy5nZXRDb2x1bW5OYW1lKGNvbHVtbk5hbWUgYXMgc3RyaW5nKSk7XG4gICAgICAgICAgICBxdWVyeS5yZXR1cm5pbmcobWFwcGVkTmFtZXMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKFwiKlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuXG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgcXVlcnk7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gcm93c1swXTtcblxuICAgICAgICAgICAgdGhpcy5tYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW0pO1xuXG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBpbnNlcnRJdGVtKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+Pikge1xuICAgICAgICBhd2FpdCB0aGlzLmluc2VydEl0ZW1zKFtuZXdPYmplY3RdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgaW5zZXJ0SXRlbXMoaXRlbXM6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj5bXSkge1xuICAgICAgICBpdGVtcyA9IFsuLi5pdGVtc107XG5cbiAgICAgICAgaWYgKGJlZm9yZUluc2VydFRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbXMgPSBpdGVtcy5tYXAoKGl0ZW0pID0+IGJlZm9yZUluc2VydFRyYW5zZm9ybSEoaXRlbSwgdGhpcykpO1xuICAgICAgICB9XG5cbiAgICAgICAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4gdGhpcy5tYXBQcm9wZXJ0aWVzVG9Db2x1bW5zKGl0ZW0pKTtcblxuICAgICAgICB3aGlsZSAoaXRlbXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgY2h1bmsgPSBpdGVtcy5zcGxpY2UoMCwgNTAwKTtcbiAgICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuY2xvbmUoKS5pbnNlcnQoY2h1bmspO1xuICAgICAgICAgICAgaWYgKHRoaXMudHJhbnNhY3Rpb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHF1ZXJ5LnRyYW5zYWN0aW5nKHRoaXMudHJhbnNhY3Rpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBxdWVyeTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVJdGVtKGl0ZW06IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pIHtcbiAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKTtcbiAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5TG9nICs9IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXIudXBkYXRlKGl0ZW0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZUl0ZW1CeVByaW1hcnlLZXkocHJpbWFyeUtleVZhbHVlOiBhbnksIGl0ZW06IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pIHtcbiAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKTtcblxuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCBwcmltYXJ5S2V5VmFsdWUpO1xuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgcXVlcnk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdXBkYXRlSXRlbXNCeVByaW1hcnlLZXkoXG4gICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICBwcmltYXJ5S2V5VmFsdWU6IGFueTtcbiAgICAgICAgICAgIGRhdGE6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj47XG4gICAgICAgIH1bXVxuICAgICkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBpdGVtcyA9IFsuLi5pdGVtc107XG4gICAgICAgIHdoaWxlIChpdGVtcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBjaHVuayA9IGl0ZW1zLnNwbGljZSgwLCA1MDApO1xuXG4gICAgICAgICAgICBsZXQgc3FsID0gXCJcIjtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBjaHVuaykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuY2xvbmUoKTtcbiAgICAgICAgICAgICAgICBpZiAoYmVmb3JlVXBkYXRlVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgICAgIGl0ZW0uZGF0YSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLmRhdGEsIHRoaXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLm1hcFByb3BlcnRpZXNUb0NvbHVtbnMoaXRlbS5kYXRhKTtcblxuICAgICAgICAgICAgICAgIHF1ZXJ5LnVwZGF0ZShpdGVtLmRhdGEpO1xuICAgICAgICAgICAgICAgIHNxbCArPSBxdWVyeS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCBpdGVtLnByaW1hcnlLZXlWYWx1ZSkudG9TdHJpbmcoKS5yZXBsYWNlKFwiP1wiLCBcIlxcXFw/XCIpICsgXCI7XFxuXCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGZpbmFsUXVlcnkgPSB0aGlzLmtuZXgucmF3KHNxbCk7XG4gICAgICAgICAgICBpZiAodGhpcy50cmFuc2FjdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgZmluYWxRdWVyeS50cmFuc2FjdGluZyh0aGlzLnRyYW5zYWN0aW9uKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBmaW5hbFF1ZXJ5LnRvUXVlcnkoKSArIFwiXFxuXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGF3YWl0IGZpbmFsUXVlcnk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZXhlY3V0ZSgpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgfVxuXG4gICAgcHVibGljIGxpbWl0KHZhbHVlOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIubGltaXQodmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIG9mZnNldCh2YWx1ZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLm9mZnNldCh2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZmluZEJ5SWQoaWQ6IHN0cmluZywgY29sdW1uczogKGtleW9mIE1vZGVsVHlwZSlbXSkge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXJcbiAgICAgICAgICAgIC5zZWxlY3QoY29sdW1ucyBhcyBhbnkpXG4gICAgICAgICAgICAud2hlcmUodGhpcy50YWJsZU5hbWUgKyBcIi5pZFwiLCBpZClcbiAgICAgICAgICAgIC5maXJzdCgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRDb3VudCgpIHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJ5QnVpbGRlci5jb3VudCh7IGNvdW50OiBcIipcIiB9KTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcXVlcnk7XG4gICAgICAgIGlmIChyZXN1bHQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLmNvdW50O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRGaXJzdE9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZsYXR0ZW5CeU9wdGlvbihpdGVtc1swXSwgZmxhdHRlbk9wdGlvbik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHVibGljIGFzeW5jIGdldEZpcnN0T3JVbmRlZmluZWQoKSB7XG4gICAgICAgIGNvbnN0IGZpcnN0T3JOdWxsUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRGaXJzdE9yTnVsbCgpO1xuICAgICAgICBpZiAoZmlyc3RPck51bGxSZXN1bHQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpcnN0T3JOdWxsUmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRGaXJzdChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSXRlbSBub3QgZm91bmQuXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXNbMF0sIGZsYXR0ZW5PcHRpb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGdldFNpbmdsZU9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGl0ZW1zLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1vcmUgdGhhbiBvbmUgaXRlbSBmb3VuZDogJHtpdGVtcy5sZW5ndGh9LmApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmxhdHRlbkJ5T3B0aW9uKGl0ZW1zWzBdLCBmbGF0dGVuT3B0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRTaW5nbGVPclVuZGVmaW5lZCgpIHtcbiAgICAgICAgY29uc3Qgc2luZ2xlT3JOdWxsUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRTaW5nbGVPck51bGwoKTtcbiAgICAgICAgaWYgKHNpbmdsZU9yTnVsbFJlc3VsdCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2luZ2xlT3JOdWxsUmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRTaW5nbGUoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAoIWl0ZW1zIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkl0ZW0gbm90IGZvdW5kLlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXRlbXMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTW9yZSB0aGFuIG9uZSBpdGVtIGZvdW5kOiAke2l0ZW1zLmxlbmd0aH0uYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXNbMF0sIGZsYXR0ZW5PcHRpb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHNlbGVjdENvbHVtbigpIHtcbiAgICAgICAgdGhpcy5oYXNTZWxlY3RDbGF1c2UgPSB0cnVlO1xuICAgICAgICBsZXQgY2FsbGVkQXJndW1lbnRzID0gW10gYXMgc3RyaW5nW107XG5cbiAgICAgICAgZnVuY3Rpb24gc2F2ZUFyZ3VtZW50cyguLi5hcmdzOiBzdHJpbmdbXSkge1xuICAgICAgICAgICAgY2FsbGVkQXJndW1lbnRzID0gYXJncztcbiAgICAgICAgfVxuXG4gICAgICAgIGFyZ3VtZW50c1swXShzYXZlQXJndW1lbnRzKTtcblxuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5zZWxlY3QodGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNhbGxlZEFyZ3VtZW50cykgKyBcIiBhcyBcIiArIHRoaXMuZ2V0Q29sdW1uU2VsZWN0QWxpYXMoLi4uY2FsbGVkQXJndW1lbnRzKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGY6IGFueSkge1xuICAgICAgICBjb25zdCB7IHJvb3QsIHJlc3VsdCB9ID0gZ2V0UHJveHlBbmRNZW1vcmllc0ZvckFycmF5KCk7XG5cbiAgICAgICAgZihyb290KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3QyKCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMF07XG5cbiAgICAgICAgY29uc3QgY29sdW1uQXJndW1lbnRzTGlzdCA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uMyhmKTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNvbHVtbkFyZ3VtZW50cyBvZiBjb2x1bW5Bcmd1bWVudHNMaXN0KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5zZWxlY3QodGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cykgKyBcIiBhcyBcIiArIHRoaXMuZ2V0Q29sdW1uU2VsZWN0QWxpYXMoLi4uY29sdW1uQXJndW1lbnRzKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3QoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50c0xpc3Q6IHN0cmluZ1tdW107XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhcmd1bWVudHNbMF0gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50c0xpc3QgPSBbLi4uYXJndW1lbnRzXS5tYXAoKGNvbmNhdEtleTogc3RyaW5nKSA9PiBjb25jYXRLZXkuc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMF07XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5Bcmd1bWVudHMgb2YgY29sdW1uQXJndW1lbnRzTGlzdCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JkZXJCeSgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIub3JkZXJCeSh0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXNGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pLCBhcmd1bWVudHNbMV0pO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0TWFueShmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8KFJvdyBleHRlbmRzIE1vZGVsVHlwZSA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4gOiBSb3cpW10+IHtcbiAgICAgICAgLy8gYXR0YWNoIGFueSBkZWZhdWx0IGxvY2tzIHRvIHRoZSBxdWVyeSBpZiB0aGV5IGFyZSBub3Qgc3BlY2lmaWVkXG5cbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXMsIGZsYXR0ZW5PcHRpb24pIGFzIChSb3cgZXh0ZW5kcyBNb2RlbFR5cGUgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+IDogUm93KVtdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHNlbGVjdEFsaWFzKCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50cyA9IGFyZ3VtZW50c1sxXS5zcGxpdChcIi5cIik7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KGAke3RoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpfSBhcyAke2FyZ3VtZW50c1swXX1gKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3RSYXcoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgW25hbWUsIF8sIHF1ZXJ5LCAuLi5iaW5kaW5nc10gPSBBcnJheS5mcm9tKGFyZ3VtZW50cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMua25leC5yYXcoYCgke3F1ZXJ5fSkgYXMgXCIke25hbWV9XCJgLCBiaW5kaW5ncykpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pbkNvbHVtbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbkNvbHVtbihcImlubmVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuICAgIHB1YmxpYyBsZWZ0T3V0ZXJKb2luQ29sdW1uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5qb2luQ29sdW1uKFwibGVmdE91dGVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pblRhYmxlKCkge1xuICAgICAgICBjb25zdCBuZXdQcm9wZXJ0eUtleSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgbmV3UHJvcGVydHlUeXBlID0gYXJndW1lbnRzWzFdO1xuICAgICAgICBjb25zdCBjb2x1bW4xUGFydHMgPSBhcmd1bWVudHNbMl07XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBjb2x1bW4yUGFydHMgPSBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMucHVzaCh7XG4gICAgICAgICAgICBuYW1lOiBuZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgICAgIHByb3BlcnR5VHlwZTogbmV3UHJvcGVydHlUeXBlLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkNsYXNzID0gbmV3UHJvcGVydHlUeXBlO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXMgPSBuZXdQcm9wZXJ0eUtleTtcblxuICAgICAgICBjb25zdCB0YWJsZTFDb2x1bW4gPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMVBhcnRzKTtcbiAgICAgICAgY29uc3QgdGFibGUyQ29sdW1uID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbjJQYXJ0cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luKGAke3RhYmxlVG9Kb2luTmFtZX0gYXMgJHt0YWJsZVRvSm9pbkFsaWFzfWAsIHRhYmxlMUNvbHVtbiwgb3BlcmF0b3IsIHRhYmxlMkNvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pbigpIHtcbiAgICAgICAgY29uc3QgY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPSB0aGlzLmdyYW51bGFyaXR5U2V0Lmhhcyhhcmd1bWVudHNbMl0pO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1sxXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzRdIDogYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nID0gY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPyBhcmd1bWVudHNbNV0gOiBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcImlubmVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgZ3JhbnVsYXJpdHksIGpvaW5UYWJsZUNvbHVtblN0cmluZywgb3BlcmF0b3IsIGV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmcpO1xuICAgIH1cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pbigpIHtcbiAgICAgICAgY29uc3QgY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPSB0aGlzLmdyYW51bGFyaXR5U2V0Lmhhcyhhcmd1bWVudHNbMl0pO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1sxXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzRdIDogYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nID0gY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPyBhcmd1bWVudHNbNV0gOiBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcImxlZnRPdXRlckpvaW5cIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0sIGdyYW51bGFyaXR5LCBqb2luVGFibGVDb2x1bW5TdHJpbmcsIG9wZXJhdG9yLCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5uZXJKb2luVGFibGVPbkZ1bmN0aW9uKCkge1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMl0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzJdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzFdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3Qgb24gPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmpvaW5UYWJsZU9uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgZ3JhbnVsYXJpdHksIG9uKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pblRhYmxlT25GdW5jdGlvbigpIHtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1sxXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IG9uID0gdHlwZW9mIGFyZ3VtZW50c1syXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1szXSA6IGFyZ3VtZW50c1syXTtcblxuICAgICAgICByZXR1cm4gdGhpcy5qb2luVGFibGVPbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLmxlZnRPdXRlckpvaW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdLCBncmFudWxhcml0eSwgb24pO1xuICAgIH1cblxuICAgIHB1YmxpYyBsZWZ0T3V0ZXJKb2luVGFibGUoKSB7XG4gICAgICAgIGNvbnN0IG5ld1Byb3BlcnR5S2V5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBuZXdQcm9wZXJ0eVR5cGUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgIGNvbnN0IGNvbHVtbjFQYXJ0cyA9IGFyZ3VtZW50c1syXTtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBhcmd1bWVudHNbM107XG4gICAgICAgIGNvbnN0IGNvbHVtbjJQYXJ0cyA9IGFyZ3VtZW50c1s0XTtcblxuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IG5ld1Byb3BlcnR5S2V5LFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBuZXdQcm9wZXJ0eVR5cGUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQ2xhc3MgPSBuZXdQcm9wZXJ0eVR5cGU7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZVRvSm9pbkNsYXNzKTtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5BbGlhcyA9IG5ld1Byb3BlcnR5S2V5O1xuXG4gICAgICAgIGNvbnN0IHRhYmxlMUNvbHVtbiA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW4xUGFydHMpO1xuICAgICAgICBjb25zdCB0YWJsZTJDb2x1bW4gPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMlBhcnRzKTtcblxuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5sZWZ0T3V0ZXJKb2luKGAke3RhYmxlVG9Kb2luTmFtZX0gYXMgJHt0YWJsZVRvSm9pbkFsaWFzfWAsIHRhYmxlMUNvbHVtbiwgb3BlcmF0b3IsIHRhYmxlMkNvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlQ29sdW1uKCkge1xuICAgICAgICAvLyBUaGlzIGlzIGNhbGxlZCBmcm9tIHRoZSBzdWItcXVlcnlcbiAgICAgICAgLy8gVGhlIGZpcnN0IGNvbHVtbiBpcyBmcm9tIHRoZSBzdWItcXVlcnlcbiAgICAgICAgLy8gVGhlIHNlY29uZCBjb2x1bW4gaXMgZnJvbSB0aGUgcGFyZW50IHF1ZXJ5XG4gICAgICAgIGxldCBjb2x1bW4xTmFtZTtcbiAgICAgICAgbGV0IGNvbHVtbjJOYW1lO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICBpZiAoYXJndW1lbnRzWzBdIGluc3RhbmNlb2YgQ29sdW1uRnJvbVF1ZXJ5KSB7XG4gICAgICAgICAgICBjb2x1bW4xTmFtZSA9IChhcmd1bWVudHNbMF0gYXMgQ29sdW1uRnJvbVF1ZXJ5KS50b1N0cmluZygpO1xuICAgICAgICAgICAgY29sdW1uMk5hbWUgPSAoYXJndW1lbnRzWzJdIGFzIENvbHVtbkZyb21RdWVyeSkudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlUmF3KGAke2NvbHVtbjFOYW1lfSAke29wZXJhdG9yfSAke2NvbHVtbjJOYW1lfWApO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uMU5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uYXJndW1lbnRzWzBdLnNwbGl0KFwiLlwiKSk7XG4gICAgICAgICAgICBpZiAoIXRoaXMucGFyZW50VHlwZWRRdWVyeUJ1aWxkZXIpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BhcmVudCBxdWVyeSBidWlsZGVyIGlzIG1pc3NpbmcsIFwid2hlcmVDb2x1bW5cIiBjYW4gb25seSBiZSB1c2VkIGluIHN1Yi1xdWVyeS4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbHVtbjJOYW1lID0gdGhpcy5wYXJlbnRUeXBlZFF1ZXJ5QnVpbGRlci5nZXRDb2x1bW5OYW1lKC4uLmFyZ3VtZW50c1syXS5zcGxpdChcIi5cIikpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sdW1uMU5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4udGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oYXJndW1lbnRzWzBdKSk7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMk5hbWUgPSBhcmd1bWVudHNbMl07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGFyZ3VtZW50c1syXS5tZW1vcmllcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMk5hbWUgPSBhcmd1bWVudHNbMl0uZ2V0Q29sdW1uTmFtZTsgLy8gcGFyZW50IHRoaXMgbmVlZGVkIC4uLlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2x1bW4yTmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi50aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmd1bWVudHNbMl0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlUmF3KGA/PyAke29wZXJhdG9yfSA/P2AsIFtjb2x1bW4xTmFtZSwgY29sdW1uMk5hbWVdKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9RdWVyeSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlCdWlsZGVyLnRvUXVlcnkoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTnVsbC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3ROdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90TnVsbC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JXaGVyZU51bGwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZU51bGwuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmVOb3ROdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVOb3ROdWxsLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oZjogYW55KSB7XG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIGYuc3BsaXQoXCIuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgeyByb290LCBtZW1vcmllcyB9ID0gZ2V0UHJveHlBbmRNZW1vcmllcygpO1xuXG4gICAgICAgIGYocm9vdCk7XG5cbiAgICAgICAgcmV0dXJuIG1lbW9yaWVzO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBmaW5kQnlQcmltYXJ5S2V5KCkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBwcmltYXJ5S2V5VmFsdWUgPSBhcmd1bWVudHNbMF07XG5cbiAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50c0xpc3Q7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb25zdCBbLCAuLi5jb2x1bW5Bcmd1bWVudHNdID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzTGlzdCA9IGNvbHVtbkFyZ3VtZW50cy5tYXAoKGNvbmNhdEtleTogc3RyaW5nKSA9PiBjb25jYXRLZXkuc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5Bcmd1bWVudHMgb2YgY29sdW1uQXJndW1lbnRzTGlzdCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIud2hlcmUocHJpbWFyeUtleUNvbHVtbkluZm8ubmFtZSwgcHJpbWFyeUtleVZhbHVlKTtcblxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5QnVpbGRlci5maXJzdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlKCkge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb25jYXRLZXlDb2x1bW4odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmUuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZS5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3QoKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzBdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbmNhdEtleUNvbHVtbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjb2x1bW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmd1bWVudHNbMF0pO1xuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpLCBhcmd1bWVudHNbMV0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgYW5kV2hlcmUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIuYW5kV2hlcmUuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZS5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVJbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZUluLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZU5vdEluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90SW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuICAgIHB1YmxpYyBvcldoZXJlSW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZUluLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZU5vdEluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVOb3RJbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVCZXR3ZWVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlQmV0d2Vlbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG4gICAgcHVibGljIHdoZXJlTm90QmV0d2VlbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdEJldHdlZW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmVCZXR3ZWVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVCZXR3ZWVuLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZU5vdEJldHdlZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZU5vdEJldHdlZW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIGNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oZnVuY3Rpb25OYW1lOiBzdHJpbmcsIHR5cGVPZlN1YlF1ZXJ5OiBhbnksIGZ1bmN0aW9uVG9DYWxsOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCB0aGF0ID0gdGhpcyBhcyBhbnk7XG4gICAgICAgIGxldCBzdWJRdWVyeVByZWZpeDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBpZiAoW1wid2hlcmVFeGlzdHNcIiwgXCJvcldoZXJlRXhpc3RzXCIsIFwid2hlcmVOb3RFeGlzdHNcIiwgXCJvcldoZXJlTm90RXhpc3RzXCIsIFwiaGF2aW5nRXhpc3RzXCIsIFwiaGF2aW5nTm90RXhpc3RzXCJdLmluY2x1ZGVzKGZ1bmN0aW9uTmFtZSkpIHtcbiAgICAgICAgICAgIHN1YlF1ZXJ5UHJlZml4ID0gdGhpcy5nZXROZXh0U3ViUXVlcnlQcmVmaXgoKTtcbiAgICAgICAgfVxuICAgICAgICAoKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSlbZnVuY3Rpb25OYW1lXSBhcyAoY2FsbGJhY2s6IEtuZXguUXVlcnlDYWxsYmFjaykgPT4gS25leC5RdWVyeUJ1aWxkZXIpKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGNvbnN0IHN1YlF1ZXJ5ID0gdGhpcztcbiAgICAgICAgICAgIGNvbnN0IHsgcm9vdCwgbWVtb3JpZXMgfSA9IGdldFByb3h5QW5kTWVtb3JpZXModGhhdCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHN1YlFCID0gbmV3IFR5cGVkUXVlcnlCdWlsZGVyKHR5cGVPZlN1YlF1ZXJ5LCBncmFudWxhcml0eSwgdGhhdC5rbmV4LCBzdWJRdWVyeSwgdGhhdCwgc3ViUXVlcnlQcmVmaXgpO1xuICAgICAgICAgICAgc3ViUUIuZXh0cmFKb2luZWRQcm9wZXJ0aWVzID0gdGhhdC5leHRyYUpvaW5lZFByb3BlcnRpZXM7XG4gICAgICAgICAgICBmdW5jdGlvblRvQ2FsbChzdWJRQiwgcm9vdCwgbWVtb3JpZXMpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2VsZWN0UXVlcnkoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgbmFtZSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMl07XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGFyZ3VtZW50c1s0XSA/PyBnZXRUYWJsZU1ldGFkYXRhKHR5cGVPZlN1YlF1ZXJ5KS5kZWZhdWx0TG9jaztcblxuICAgICAgICBjb25zdCB7IHJvb3QsIG1lbW9yaWVzIH0gPSBnZXRQcm94eUFuZE1lbW9yaWVzKHRoaXMgYXMgYW55KTtcblxuICAgICAgICBjb25zdCBzdWJRdWVyeUJ1aWxkZXIgPSBuZXcgVHlwZWRRdWVyeUJ1aWxkZXIodHlwZU9mU3ViUXVlcnksIGdyYW51bGFyaXR5LCB0aGlzLmtuZXgsIHVuZGVmaW5lZCwgdGhpcyk7XG4gICAgICAgIGZ1bmN0aW9uVG9DYWxsKHN1YlF1ZXJ5QnVpbGRlciwgcm9vdCwgbWVtb3JpZXMpO1xuXG4gICAgICAgICh0aGlzLnNlbGVjdFJhdyBhcyBhbnkpKG5hbWUsIHVuZGVmaW5lZCwgc3ViUXVlcnlCdWlsZGVyLnRvUXVlcnkoKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZVBhcmVudGhlc2VzKCkge1xuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJ3aGVyZVwiLCB0aGlzLnRhYmxlQ2xhc3MsIGFyZ3VtZW50c1swXSwgdW5kZWZpbmVkKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVQYXJlbnRoZXNlcygpIHtcbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwib3JXaGVyZVwiLCB0aGlzLnRhYmxlQ2xhc3MsIGFyZ3VtZW50c1swXSwgdW5kZWZpbmVkKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIndoZXJlRXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZUV4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMF0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwib3JXaGVyZUV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3RFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIndoZXJlTm90RXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZU5vdEV4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMF0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwib3JXaGVyZU5vdEV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZVJhdyhzcWwsIGJpbmRpbmdzKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZygpIHtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBhcmd1bWVudHNbMV07XG4gICAgICAgIGNvbnN0IHZhbHVlID0gYXJndW1lbnRzWzJdO1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5oYXZpbmcodGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgb3BlcmF0b3IsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ0luKCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGFyZ3VtZW50c1sxXTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaGF2aW5nSW4odGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTm90SW4oKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gYXJndW1lbnRzWzFdO1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5oYXZpbmdOb3RJbih0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdOdWxsKCkge1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5oYXZpbmdOdWxsKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTm90TnVsbCgpIHtcbiAgICAgICAgKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSkuaGF2aW5nTm90TnVsbCh0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ0V4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMF0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwiaGF2aW5nRXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdOb3RFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcImhhdmluZ05vdEV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nUmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaGF2aW5nUmF3KHNxbCwgYmluZGluZ3MpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nQmV0d2VlbigpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmhhdmluZ0JldHdlZW4odGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTm90QmV0d2VlbigpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmhhdmluZ05vdEJldHdlZW4odGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JkZXJCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLm9yZGVyQnlSYXcoc3FsLCBiaW5kaW5ncyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB1bmlvbigpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMF0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwidW5pb25cIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHVuaW9uQWxsKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1swXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJ1bmlvbkFsbFwiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgcmV0dXJuaW5nQ29sdW1uKCkge1xuICAgICAgICB0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcigpO1xuICAgIH1cblxuICAgIHB1YmxpYyByZXR1cm5pbmdDb2x1bW5zKCkge1xuICAgICAgICB0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcigpO1xuICAgIH1cblxuICAgIHB1YmxpYyB0cmFuc2FjdGluZyh0cng6IEtuZXguVHJhbnNhY3Rpb24pIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIudHJhbnNhY3RpbmcodHJ4KTtcblxuICAgICAgICB0aGlzLnRyYW5zYWN0aW9uID0gdHJ4O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBtaW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwibWluXCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgY291bnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwiY291bnRcIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBjb3VudERpc3RpbmN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcImNvdW50RGlzdGluY3RcIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBtYXgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwibWF4XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3VtKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcInN1bVwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIHN1bURpc3RpbmN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcInN1bURpc3RpbmN0XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXZnKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcImF2Z1wiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGF2Z0Rpc3RpbmN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcImF2Z0Rpc3RpbmN0XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5jcmVtZW50KCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV07XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmluY3JlbWVudCh0aGlzLmdldENvbHVtbk5hbWVGcm9tQXJndW1lbnRzSWdub3JpbmdMYXN0UGFyYW1ldGVyKC4uLmFyZ3VtZW50cyksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIHB1YmxpYyBkZWNyZW1lbnQoKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gYXJndW1lbnRzW2FyZ3VtZW50cy5sZW5ndGggLSAxXTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZGVjcmVtZW50KHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21Bcmd1bWVudHNJZ25vcmluZ0xhc3RQYXJhbWV0ZXIoLi4uYXJndW1lbnRzKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdHJ1bmNhdGUoKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyLnRydW5jYXRlKCk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGluc2VydFNlbGVjdCgpIHtcbiAgICAgICAgY29uc3QgdGFibGVOYW1lID0gZ2V0VGFibGVOYW1lKGFyZ3VtZW50c1swXSk7XG5cbiAgICAgICAgY29uc3QgdHlwZWRRdWVyeUJ1aWxkZXJGb3JJbnNlcnQgPSBuZXcgVHlwZWRRdWVyeUJ1aWxkZXI8YW55LCBhbnk+KGFyZ3VtZW50c1swXSwgdW5kZWZpbmVkLCB0aGlzLmtuZXgpO1xuICAgICAgICBsZXQgY29sdW1uQXJndW1lbnRzTGlzdDtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbnN0IFssIC4uLmNvbHVtbkFyZ3VtZW50c10gPSBhcmd1bWVudHM7XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gY29sdW1uQXJndW1lbnRzLm1hcCgoY29uY2F0S2V5OiBzdHJpbmcpID0+IGNvbmNhdEtleS5zcGxpdChcIi5cIikpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgZiA9IGFyZ3VtZW50c1sxXTtcbiAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50c0xpc3QgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbjMoZik7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpbnNlcnRDb2x1bW5zID0gY29sdW1uQXJndW1lbnRzTGlzdC5tYXAoKGkpID0+IHR5cGVkUXVlcnlCdWlsZGVyRm9ySW5zZXJ0LmdldENvbHVtbk5hbWUoLi4uaSkpO1xuXG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9rbmV4L2tuZXgvaXNzdWVzLzEwNTZcbiAgICAgICAgY29uc3QgcWIgPSB0aGlzLmtuZXguZnJvbSh0aGlzLmtuZXgucmF3KGA/PyAoJHtpbnNlcnRDb2x1bW5zLm1hcCgoKSA9PiBcIj8/XCIpLmpvaW4oXCIsXCIpfSlgLCBbdGFibGVOYW1lLCAuLi5pbnNlcnRDb2x1bW5zXSkpLmluc2VydCh0aGlzLmtuZXgucmF3KHRoaXMudG9RdWVyeSgpKSk7XG5cbiAgICAgICAgY29uc3QgZmluYWxRdWVyeSA9IHFiLnRvU3RyaW5nKCk7XG4gICAgICAgIHRoaXMudG9RdWVyeSA9ICgpID0+IGZpbmFsUXVlcnk7XG5cbiAgICAgICAgYXdhaXQgcWI7XG4gICAgfVxuXG4gICAgcHVibGljIGNsZWFyU2VsZWN0KCkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5jbGVhclNlbGVjdCgpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuICAgIHB1YmxpYyBjbGVhcldoZXJlKCkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5jbGVhcldoZXJlKCk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG4gICAgcHVibGljIGNsZWFyT3JkZXIoKSB7XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmNsZWFyT3JkZXIoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBkaXN0aW5jdCgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZGlzdGluY3QoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBjbG9uZSgpIHtcbiAgICAgICAgY29uc3QgcXVlcnlCdWlsZGVyQ2xvbmUgPSB0aGlzLnF1ZXJ5QnVpbGRlci5jbG9uZSgpO1xuXG4gICAgICAgIGNvbnN0IHR5cGVkUXVlcnlCdWlsZGVyQ2xvbmUgPSBuZXcgVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBSb3c+KHRoaXMudGFibGVDbGFzcywgdGhpcy5ncmFudWxhcml0eSwgdGhpcy5rbmV4LCBxdWVyeUJ1aWxkZXJDbG9uZSk7XG5cbiAgICAgICAgcmV0dXJuIHR5cGVkUXVlcnlCdWlsZGVyQ2xvbmUgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBncm91cEJ5KCkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5ncm91cEJ5KHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZ3JvdXBCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmdyb3VwQnlSYXcoc3FsLCBiaW5kaW5ncyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB1c2VLbmV4UXVlcnlCdWlsZGVyKGY6IChxdWVyeTogS25leC5RdWVyeUJ1aWxkZXIpID0+IHZvaWQpIHtcbiAgICAgICAgZih0aGlzLnF1ZXJ5QnVpbGRlcik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRLbmV4UXVlcnlCdWlsZGVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgfVxuXG4gICAgcHVibGljIGdldENvbHVtbk5hbWUoLi4ua2V5czogc3RyaW5nW10pOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBmaXJzdFBhcnROYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKGtleXNbMF0pO1xuXG4gICAgICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGZpcnN0UGFydE5hbWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgY29sdW1uTmFtZSA9IFwiXCI7XG4gICAgICAgICAgICBsZXQgY29sdW1uQWxpYXM7XG4gICAgICAgICAgICBsZXQgY3VycmVudENsYXNzO1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDb2x1bW5QYXJ0O1xuICAgICAgICAgICAgY29uc3QgcHJlZml4ID0ga2V5cy5zbGljZSgwLCAtMSkuam9pbihcIi5cIik7XG4gICAgICAgICAgICBjb25zdCBleHRyYUpvaW5lZFByb3BlcnR5ID0gdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMuZmluZCgoaSkgPT4gaS5uYW1lID09PSBwcmVmaXgpO1xuICAgICAgICAgICAgaWYgKGV4dHJhSm9pbmVkUHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyA9IGV4dHJhSm9pbmVkUHJvcGVydHkubmFtZTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2xhc3MgPSBleHRyYUpvaW5lZFByb3BlcnR5LnByb3BlcnR5VHlwZTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKGN1cnJlbnRDbGFzcywga2V5c1trZXlzLmxlbmd0aCAtIDFdKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5OYW1lID0ga2V5cy5zbGljZSgwLCAtMSkuam9pbihcIl9cIikgKyBcIi5cIiArIGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBrZXlzWzBdKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKGN1cnJlbnRDbGFzcywga2V5c1tpXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29sdW1uTmFtZSA9IGNvbHVtbkFsaWFzICsgXCIuXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uQWxpYXMgKz0gXCJfXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudENsYXNzID0gY3VycmVudENvbHVtblBhcnQuY29sdW1uQ2xhc3M7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gYCR7dGhpcy5zdWJRdWVyeVByZWZpeCA/PyBcIlwifSR7Y29sdW1uTmFtZX1gO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGdldENvbHVtbk5hbWVXaXRoRGlmZmVyZW50Um9vdChfcm9vdEtleTogc3RyaW5nLCAuLi5rZXlzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGZpcnN0UGFydE5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXMoa2V5c1swXSk7XG5cbiAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gZmlyc3RQYXJ0TmFtZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKHRoaXMudGFibGVDbGFzcywga2V5c1swXSk7XG5cbiAgICAgICAgICAgIGxldCBjb2x1bW5OYW1lID0gXCJcIjtcbiAgICAgICAgICAgIGxldCBjb2x1bW5BbGlhcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihjdXJyZW50Q2xhc3MsIGtleXNbaV0pO1xuXG4gICAgICAgICAgICAgICAgY29sdW1uTmFtZSA9IGNvbHVtbkFsaWFzICsgXCIuXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyArPSBcIl9cIiArIChrZXlzLmxlbmd0aCAtIDEgPT09IGkgPyBjdXJyZW50Q29sdW1uUGFydC5uYW1lIDogY3VycmVudENvbHVtblBhcnQucHJvcGVydHlLZXkpO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvbHVtbk5hbWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGZ1bmN0aW9uV2l0aEFsaWFzKGtuZXhGdW5jdGlvbk5hbWU6IHN0cmluZywgZjogYW55LCBhbGlhc05hbWU6IHN0cmluZykge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpW2tuZXhGdW5jdGlvbk5hbWVdKGAke3RoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhc0Zyb21GdW5jdGlvbk9yU3RyaW5nKGYpfSBhcyAke2FsaWFzTmFtZX1gKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGY6IGFueSkge1xuICAgICAgICBsZXQgY29sdW1uUGFydHM7XG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uUGFydHMgPSBmLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbHVtblBhcnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oZik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtblBhcnRzKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtbk5hbWVXaXRob3V0QWxpYXNGcm9tRnVuY3Rpb25PclN0cmluZyhmOiBhbnkpIHtcbiAgICAgICAgbGV0IGNvbHVtblBhcnRzO1xuICAgICAgICBpZiAodHlwZW9mIGYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtblBhcnRzID0gZi5zcGxpdChcIi5cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2x1bW5QYXJ0cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyguLi5jb2x1bW5QYXJ0cyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBqb2luQ29sdW1uKGpvaW5UeXBlOiBcImlubmVySm9pblwiIHwgXCJsZWZ0T3V0ZXJKb2luXCIsIGY6IGFueSwgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5IHwgdW5kZWZpbmVkKSB7XG4gICAgICAgIGxldCBjb2x1bW5Ub0pvaW5Bcmd1bWVudHM6IHN0cmluZ1tdO1xuXG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uVG9Kb2luQXJndW1lbnRzID0gZi5zcGxpdChcIi5cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2x1bW5Ub0pvaW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihmKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbHVtblRvSm9pbk5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uVG9Kb2luQXJndW1lbnRzKTtcblxuICAgICAgICBsZXQgc2Vjb25kQ29sdW1uTmFtZSA9IGNvbHVtblRvSm9pbkFyZ3VtZW50c1swXTtcbiAgICAgICAgbGV0IHNlY29uZENvbHVtbkFsaWFzID0gY29sdW1uVG9Kb2luQXJndW1lbnRzWzBdO1xuICAgICAgICBsZXQgc2Vjb25kQ29sdW1uQ2xhc3MgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIHNlY29uZENvbHVtbk5hbWUpLmNvbHVtbkNsYXNzO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgY29sdW1uVG9Kb2luQXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBiZWZvcmVTZWNvbmRDb2x1bW5BbGlhcyA9IHNlY29uZENvbHVtbkFsaWFzO1xuICAgICAgICAgICAgY29uc3QgYmVmb3JlU2Vjb25kQ29sdW1uQ2xhc3MgPSBzZWNvbmRDb2x1bW5DbGFzcztcblxuICAgICAgICAgICAgY29uc3QgY29sdW1uSW5mbyA9IGdldENvbHVtbkluZm9ybWF0aW9uKGJlZm9yZVNlY29uZENvbHVtbkNsYXNzLCBjb2x1bW5Ub0pvaW5Bcmd1bWVudHNbaV0pO1xuICAgICAgICAgICAgc2Vjb25kQ29sdW1uTmFtZSA9IGNvbHVtbkluZm8ubmFtZTtcbiAgICAgICAgICAgIHNlY29uZENvbHVtbkFsaWFzID0gYmVmb3JlU2Vjb25kQ29sdW1uQWxpYXMgKyBcIl9cIiArIGNvbHVtbkluZm8ucHJvcGVydHlLZXk7XG4gICAgICAgICAgICBzZWNvbmRDb2x1bW5DbGFzcyA9IGNvbHVtbkluZm8uY29sdW1uQ2xhc3M7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUoc2Vjb25kQ29sdW1uQ2xhc3MpO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkFsaWFzID0gYCR7dGhpcy5zdWJRdWVyeVByZWZpeCA/PyBcIlwifSR7c2Vjb25kQ29sdW1uQWxpYXN9YDtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5Kb2luQ29sdW1uTmFtZSA9IGAke3RhYmxlVG9Kb2luQWxpYXN9LiR7Z2V0UHJpbWFyeUtleUNvbHVtbihzZWNvbmRDb2x1bW5DbGFzcykubmFtZX1gO1xuXG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUdyYW51bGFyaXR5ID0gZ3JhbnVsYXJpdHkgPz8gZ2V0VGFibGVNZXRhZGF0YShzZWNvbmRDb2x1bW5DbGFzcykuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5UXVlcnkgPSAham9pblRhYmxlR3JhbnVsYXJpdHkgPyBcIlwiIDogYCBXSVRIICgke2pvaW5UYWJsZUdyYW51bGFyaXR5fSlgO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlTmFtZVJhdyA9IHRoaXMua25leC5yYXcoYD8/IGFzID8/JHtncmFudWxhcml0eVF1ZXJ5fWAsIFt0YWJsZVRvSm9pbk5hbWUsIHRhYmxlVG9Kb2luQWxpYXNdKTtcbiAgICAgICAgaWYgKGpvaW5UeXBlID09PSBcImlubmVySm9pblwiKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5pbm5lckpvaW4odGFibGVOYW1lUmF3LCB0YWJsZVRvSm9pbkpvaW5Db2x1bW5OYW1lLCBjb2x1bW5Ub0pvaW5OYW1lKTtcbiAgICAgICAgfSBlbHNlIGlmIChqb2luVHlwZSA9PT0gXCJsZWZ0T3V0ZXJKb2luXCIpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmxlZnRPdXRlckpvaW4odGFibGVOYW1lUmF3LCB0YWJsZVRvSm9pbkpvaW5Db2x1bW5OYW1lLCBjb2x1bW5Ub0pvaW5OYW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29sdW1uTmFtZUZyb21Bcmd1bWVudHNJZ25vcmluZ0xhc3RQYXJhbWV0ZXIoLi4ua2V5czogc3RyaW5nW10pOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBhcmd1bWVudHNFeGNlcHRMYXN0ID0ga2V5cy5zbGljZSgwLCAtMSk7XG4gICAgICAgIHJldHVybiB0aGlzLmdldENvbHVtbk5hbWUoLi4uYXJndW1lbnRzRXhjZXB0TGFzdCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgZXh0cmFKb2luZWRQcm9wZXJ0eSA9IHRoaXMuZXh0cmFKb2luZWRQcm9wZXJ0aWVzLmZpbmQoKGkpID0+IGkubmFtZSA9PT0ga2V5c1swXSk7XG4gICAgICAgIGlmIChleHRyYUpvaW5lZFByb3BlcnR5KSB7XG4gICAgICAgICAgICBpZiAoa2V5cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZXh0cmFKb2luZWRQcm9wZXJ0eS5uYW1lO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29sdW1uSW5mbyA9IGdldENvbHVtbkluZm9ybWF0aW9uKGV4dHJhSm9pbmVkUHJvcGVydHkucHJvcGVydHlUeXBlLCBrZXlzWzFdKTtcbiAgICAgICAgICAgIHJldHVybiBleHRyYUpvaW5lZFByb3BlcnR5Lm5hbWUgKyBcIi5cIiArIGNvbHVtbkluZm8ubmFtZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgY29uc3QgY29sdW1uSW5mbyA9IGdldENvbHVtbkluZm9ybWF0aW9uKHRoaXMudGFibGVDbGFzcywga2V5c1swXSk7XG4gICAgICAgICAgICByZXR1cm4gYCR7dGhpcy5zdWJRdWVyeVByZWZpeCA/PyBcIlwifSR7dGhpcy50YWJsZU5hbWV9LiR7Y29sdW1uSW5mby5uYW1lfWA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIGtleXNbMF0pO1xuXG4gICAgICAgICAgICBsZXQgcmVzdWx0ID0gY3VycmVudENvbHVtblBhcnQucHJvcGVydHlLZXk7XG4gICAgICAgICAgICBsZXQgY3VycmVudENsYXNzID0gY3VycmVudENvbHVtblBhcnQuY29sdW1uQ2xhc3M7XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24oY3VycmVudENsYXNzLCBrZXlzW2ldKTtcbiAgICAgICAgICAgICAgICByZXN1bHQgKz0gXCIuXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2xhc3MgPSBjdXJyZW50Q29sdW1uUGFydC5jb2x1bW5DbGFzcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29sdW1uU2VsZWN0QWxpYXMoLi4ua2V5czogc3RyaW5nW10pOiBzdHJpbmcge1xuICAgICAgICBpZiAoa2V5cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBrZXlzWzBdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IGNvbHVtbkFsaWFzID0ga2V5c1swXTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbHVtbkFsaWFzICs9IFwiLlwiICsga2V5c1tpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjb2x1bW5BbGlhcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZmxhdHRlbkJ5T3B0aW9uKG86IGFueSwgZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKGZsYXR0ZW5PcHRpb24gPT09IEZsYXR0ZW5PcHRpb24ubm9GbGF0dGVuIHx8IHRoaXMuc2hvdWxkVW5mbGF0dGVuID09PSBmYWxzZSkge1xuICAgICAgICAgICAgcmV0dXJuIG87XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdW5mbGF0dGVuZWQgPSB1bmZsYXR0ZW4obyk7XG4gICAgICAgIGlmIChmbGF0dGVuT3B0aW9uID09PSB1bmRlZmluZWQgfHwgZmxhdHRlbk9wdGlvbiA9PT0gRmxhdHRlbk9wdGlvbi5mbGF0dGVuKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5mbGF0dGVuZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNldFRvTnVsbCh1bmZsYXR0ZW5lZCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBqb2luVGFibGVPbkZ1bmN0aW9uKHF1ZXJ5QnVpbGRlckpvaW46IEtuZXguSm9pbiwgbmV3UHJvcGVydHlLZXk6IGFueSwgbmV3UHJvcGVydHlUeXBlOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCwgb25GdW5jdGlvbjogKGpvaW46IElKb2luT25DbGF1c2UyPGFueSwgYW55PikgPT4gdm9pZCkge1xuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IG5ld1Byb3BlcnR5S2V5LFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBuZXdQcm9wZXJ0eVR5cGUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQ2xhc3MgPSBuZXdQcm9wZXJ0eVR5cGU7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZVRvSm9pbkNsYXNzKTtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5BbGlhcyA9IG5ld1Byb3BlcnR5S2V5O1xuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcblxuICAgICAgICBsZXQga25leE9uT2JqZWN0OiBhbnk7XG4gICAgICAgIGNvbnN0IHRhYmxlTmFtZVJhdyA9IHRoaXMua25leC5yYXcoYD8/IGFzID8/JHtncmFudWxhcml0eVF1ZXJ5fWAsIFt0YWJsZVRvSm9pbk5hbWUsIHRhYmxlVG9Kb2luQWxpYXNdKTtcbiAgICAgICAgcXVlcnlCdWlsZGVySm9pbih0YWJsZU5hbWVSYXcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGtuZXhPbk9iamVjdCA9IHRoaXM7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IG9uT2JqZWN0ID0gdGhpcy5nZXRUeXBlZEtuZXhPbk9iamVjdChuZXdQcm9wZXJ0eUtleSwgdGFibGVUb0pvaW5BbGlhcywga25leE9uT2JqZWN0KTtcbiAgICAgICAgb25GdW5jdGlvbihvbk9iamVjdCBhcyBhbnkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFR5cGVkS25leE9uT2JqZWN0KG5ld1Byb3BlcnR5S2V5OiBhbnksIHRhYmxlVG9Kb2luQWxpYXM6IGFueSwga25leE9uT2JqZWN0OiBhbnkpIHtcbiAgICAgICAgY29uc3Qgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4gPSAoam9pbmVkQ29sdW1uOiBhbnksIG9wZXJhdG9yOiBhbnksIG1vZGVsQ29sdW1uOiBhbnksIGZ1bmN0aW9uTmFtZToga2V5b2YgS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICBsZXQgY29sdW1uMUFyZ3VtZW50cztcblxuICAgICAgICAgICAgaWYgKHR5cGVvZiBtb2RlbENvbHVtbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGNvbHVtbjFBcmd1bWVudHMgPSBtb2RlbENvbHVtbi5zcGxpdChcIi5cIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbHVtbjFBcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihtb2RlbENvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjb2x1bW4yTmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyhuZXdQcm9wZXJ0eUtleSwgam9pbmVkQ29sdW1uKTtcblxuICAgICAgICAgICAga25leE9uT2JqZWN0W2Z1bmN0aW9uTmFtZV0odGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbjFBcmd1bWVudHMpLCBvcGVyYXRvciwgY29sdW1uMk5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG9uV2l0aENvbHVtbk9wZXJhdG9yVmFsdWUgPSAoam9pbmVkTW9kZWxDb2x1bW46IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSwgZnVuY3Rpb25OYW1lOiBrZXlvZiBLbmV4LkpvaW5DbGF1c2UpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbjJOYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKG5ld1Byb3BlcnR5S2V5LCBqb2luZWRNb2RlbENvbHVtbik7XG4gICAgICAgICAgICBrbmV4T25PYmplY3RbZnVuY3Rpb25OYW1lXShjb2x1bW4yTmFtZSwgb3BlcmF0b3IsIHZhbHVlKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3Qgb25XaXRoTW9kZWxDb2x1bW5PcGVyYXRvclZhbHVlID0gKG1vZGVsQ29sdW1uOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnksIGZ1bmN0aW9uTmFtZToga2V5b2YgS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICBsZXQgY29sdW1uQXJndW1lbnRzO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBtb2RlbENvbHVtbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50cyA9IG1vZGVsQ29sdW1uLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24obW9kZWxDb2x1bW4pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBrbmV4T25PYmplY3RbZnVuY3Rpb25OYW1lXSh0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSwgb3BlcmF0b3IsIHZhbHVlKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBvbk51bGxWYWx1ZSA9IChqb2luZWRNb2RlbENvbHVtbjogYW55LCBmdW5jdGlvbk5hbWU6IGtleW9mIEtuZXguSm9pbkNsYXVzZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY29sdW1uQXJndW1lbnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oam9pbmVkTW9kZWxDb2x1bW4pO1xuICAgICAgICAgICAgY29uc3QgY29sdW1uQXJndW1lbnRzV2l0aEpvaW5lZFRhYmxlID0gW3RhYmxlVG9Kb2luQWxpYXMsIC4uLmNvbHVtbkFyZ3VtZW50c107XG5cbiAgICAgICAgICAgIGtuZXhPbk9iamVjdFtmdW5jdGlvbk5hbWVdKGNvbHVtbkFyZ3VtZW50c1dpdGhKb2luZWRUYWJsZS5qb2luKFwiLlwiKSk7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IG9uTnVsbE1vZGVsVmFsdWUgPSAobW9kZWxDb2x1bW46IGFueSwgZnVuY3Rpb25OYW1lOiBrZXlvZiBLbmV4LkpvaW5DbGF1c2UpID0+IHtcbiAgICAgICAgICAgIGxldCBjb2x1bW5Bcmd1bWVudHM7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG1vZGVsQ29sdW1uID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzID0gbW9kZWxDb2x1bW4uc3BsaXQoXCIuXCIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihtb2RlbENvbHVtbik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGtuZXhPbk9iamVjdFtmdW5jdGlvbk5hbWVdKHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBvbk9iamVjdCA9IHtcbiAgICAgICAgICAgIG9uQ29sdW1uczogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgY29sdW1uMjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4oY29sdW1uMiwgb3BlcmF0b3IsIGNvbHVtbjEsIFwib25cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uOiAoY29sdW1uMTogYW55LCBvcGVyYXRvcjogYW55LCBjb2x1bW4yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhKb2luZWRDb2x1bW5PcGVyYXRvckNvbHVtbihjb2x1bW4xLCBvcGVyYXRvciwgY29sdW1uMiwgXCJvblwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYW5kT246IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIGNvbHVtbjI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aEpvaW5lZENvbHVtbk9wZXJhdG9yQ29sdW1uKGNvbHVtbjEsIG9wZXJhdG9yLCBjb2x1bW4yLCBcImFuZE9uXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uOiAoY29sdW1uMTogYW55LCBvcGVyYXRvcjogYW55LCBjb2x1bW4yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhKb2luZWRDb2x1bW5PcGVyYXRvckNvbHVtbihjb2x1bW4xLCBvcGVyYXRvciwgY29sdW1uMiwgXCJvck9uXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblZhbDogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aENvbHVtbk9wZXJhdG9yVmFsdWUoY29sdW1uMSwgb3BlcmF0b3IsIHZhbHVlLCBcIm9uVmFsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhbmRPblZhbDogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aENvbHVtbk9wZXJhdG9yVmFsdWUoY29sdW1uMSwgb3BlcmF0b3IsIHZhbHVlLCBcImFuZE9uVmFsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uVmFsOiAoY29sdW1uMTogYW55LCBvcGVyYXRvcjogYW55LCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoQ29sdW1uT3BlcmF0b3JWYWx1ZShjb2x1bW4xLCBvcGVyYXRvciwgdmFsdWUsIFwib3JPblZhbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25OdWxsOiAoY29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxWYWx1ZShjb2x1bW4sIFwib25OdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbk5vdE51bGw6IChjb2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uTnVsbFZhbHVlKGNvbHVtbiwgXCJvbk5vdE51bGxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9yT25OdWxsOiAoY29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxWYWx1ZShjb2x1bW4sIFwib3JPbk51bGxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9yT25Ob3ROdWxsOiAoY29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxWYWx1ZShjb2x1bW4sIFwib3JPbk5vdE51bGxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFuZE9uTnVsbDogKGNvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsVmFsdWUoY29sdW1uLCBcImFuZE9uTnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYW5kT25Ob3ROdWxsOiAoY29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxWYWx1ZShjb2x1bW4sIFwiYW5kT25Ob3ROdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblBhcmVudGhlc2VzOiAob25QYXJlbnRoZXNlc0Z1bmN0aW9uOiAoam9pbjogSUpvaW5PbkNsYXVzZTI8YW55LCBhbnk+KSA9PiB2b2lkKSA9PiB7XG4gICAgICAgICAgICAgICAga25leE9uT2JqZWN0Lm9uKChvbjogS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudGhlc2VzT25PYmplY3QgPSB0aGlzLmdldFR5cGVkS25leE9uT2JqZWN0KG5ld1Byb3BlcnR5S2V5LCB0YWJsZVRvSm9pbkFsaWFzLCBvbik7XG4gICAgICAgICAgICAgICAgICAgIG9uUGFyZW50aGVzZXNGdW5jdGlvbihwYXJlbnRoZXNlc09uT2JqZWN0KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYW5kT25QYXJlbnRoZXNlczogKG9uUGFyZW50aGVzZXNGdW5jdGlvbjogKGpvaW46IElKb2luT25DbGF1c2UyPGFueSwgYW55PikgPT4gdm9pZCkgPT4ge1xuICAgICAgICAgICAgICAgIGtuZXhPbk9iamVjdC5hbmRPbigob246IEtuZXguSm9pbkNsYXVzZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRoZXNlc09uT2JqZWN0ID0gdGhpcy5nZXRUeXBlZEtuZXhPbk9iamVjdChuZXdQcm9wZXJ0eUtleSwgdGFibGVUb0pvaW5BbGlhcywgb24pO1xuICAgICAgICAgICAgICAgICAgICBvblBhcmVudGhlc2VzRnVuY3Rpb24ocGFyZW50aGVzZXNPbk9iamVjdCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9yT25QYXJlbnRoZXNlczogKG9uUGFyZW50aGVzZXNGdW5jdGlvbjogKGpvaW46IElKb2luT25DbGF1c2UyPGFueSwgYW55PikgPT4gdm9pZCkgPT4ge1xuICAgICAgICAgICAgICAgIGtuZXhPbk9iamVjdC5vck9uKChvbjogS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudGhlc2VzT25PYmplY3QgPSB0aGlzLmdldFR5cGVkS25leE9uT2JqZWN0KG5ld1Byb3BlcnR5S2V5LCB0YWJsZVRvSm9pbkFsaWFzLCBvbik7XG4gICAgICAgICAgICAgICAgICAgIG9uUGFyZW50aGVzZXNGdW5jdGlvbihwYXJlbnRoZXNlc09uT2JqZWN0KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25RdWVyeVZhbDogKG1vZGVsQ29sdW1uOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhNb2RlbENvbHVtbk9wZXJhdG9yVmFsdWUobW9kZWxDb2x1bW4sIG9wZXJhdG9yLCB2YWx1ZSwgXCJvblZhbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblF1ZXJ5VmFsOiAobW9kZWxDb2x1bW46IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aE1vZGVsQ29sdW1uT3BlcmF0b3JWYWx1ZShtb2RlbENvbHVtbiwgb3BlcmF0b3IsIHZhbHVlLCBcIm9yT25WYWxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uUXVlcnlOdWxsOiAobW9kZWxDb2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uTnVsbE1vZGVsVmFsdWUobW9kZWxDb2x1bW4sIFwib25OdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uUXVlcnlOdWxsOiAobW9kZWxDb2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uTnVsbE1vZGVsVmFsdWUobW9kZWxDb2x1bW4sIFwib3JPbk51bGxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uUXVlcnlOb3ROdWxsOiAobW9kZWxDb2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uTnVsbE1vZGVsVmFsdWUobW9kZWxDb2x1bW4sIFwib25Ob3ROdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uUXVlcnlOb3ROdWxsOiAobW9kZWxDb2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uTnVsbE1vZGVsVmFsdWUobW9kZWxDb2x1bW4sIFwib3JPbk5vdE51bGxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uUmF3OiAocmF3OiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGtuZXhPbk9iamVjdC5vbigob246IEtuZXguSm9pbkNsYXVzZSkgPT4gb24ub24odGhpcy5rbmV4LnJhdyhyYXcsIGJpbmRpbmdzKSkpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uUmF3OiAocmF3OiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSkgPT4ge1xuICAgICAgICAgICAgICAgIGtuZXhPbk9iamVjdC5vck9uKChvbjogS25leC5Kb2luQ2xhdXNlKSA9PiBvbi5vbih0aGlzLmtuZXgucmF3KHJhdywgYmluZGluZ3MpKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSBhcyBhbnk7XG5cbiAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgIH1cblxuICAgIHByaXZhdGUgY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbihrbmV4RnVuY3Rpb246IGFueSwgLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmdzWzBdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbmNhdEtleUNvbHVtbihrbmV4RnVuY3Rpb24sIC4uLmFyZ3MpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGFyZ3NbMF0pO1xuXG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgICAga25leEZ1bmN0aW9uKHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpLCBhcmdzWzFdLCBhcmdzWzJdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbih0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSwgYXJnc1sxXSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGNhbGxLbmV4RnVuY3Rpb25XaXRoQ29uY2F0S2V5Q29sdW1uKGtuZXhGdW5jdGlvbjogYW55LCAuLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICBjb25zdCBjb2x1bW5OYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmFyZ3NbMF0uc3BsaXQoXCIuXCIpKTtcblxuICAgICAgICBpZiAoYXJncy5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbihjb2x1bW5OYW1lLCBhcmdzWzFdLCBhcmdzWzJdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbihjb2x1bW5OYW1lLCBhcmdzWzFdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VsZWN0QWxsTW9kZWxQcm9wZXJ0aWVzKCkge1xuICAgICAgICBjb25zdCBwcm9wZXJ0aWVzID0gZ2V0Q29sdW1uUHJvcGVydGllcyh0aGlzLnRhYmxlQ2xhc3MpO1xuICAgICAgICBmb3IgKGNvbnN0IHByb3BlcnR5IG9mIHByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnNlbGVjdChgJHtwcm9wZXJ0eS5uYW1lfSBhcyAke3Byb3BlcnR5LnByb3BlcnR5S2V5fWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBqb2luKGpvaW5GdW5jdGlvbk5hbWU6IHN0cmluZywgdGFibGVUb0pvaW5BbGlhczogYW55LCB0YWJsZVRvSm9pbkNsYXNzOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCwgam9pblRhYmxlQ29sdW1uU3RyaW5nOiBhbnksIG9wZXJhdG9yOiBhbnksIGV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmc6IGFueSkge1xuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IHRhYmxlVG9Kb2luQWxpYXMsXG4gICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHRhYmxlVG9Kb2luQ2xhc3MsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXNXaXRoVW5kZXJzY29yZXMgPSB0YWJsZVRvSm9pbkFsaWFzLnNwbGl0KFwiLlwiKS5qb2luKFwiX1wiKTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG5cbiAgICAgICAgY29uc3Qgam9pblRhYmxlQ29sdW1uSW5mb3JtYXRpb24gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0YWJsZVRvSm9pbkNsYXNzLCBqb2luVGFibGVDb2x1bW5TdHJpbmcpO1xuXG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtbkFyZ3VtZW50cyA9IGAke3RhYmxlVG9Kb2luQWxpYXNXaXRoVW5kZXJzY29yZXN9LiR7am9pblRhYmxlQ29sdW1uSW5mb3JtYXRpb24ubmFtZX1gO1xuXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nVGFibGVDb2x1bW5OYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmcuc3BsaXQoXCIuXCIpKTtcblxuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcbiAgICAgICAgY29uc3QgdGFibGVOYW1lUmF3ID0gdGhpcy5rbmV4LnJhdyhgPz8gYXMgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RhYmxlVG9Kb2luTmFtZSwgdGFibGVUb0pvaW5BbGlhc1dpdGhVbmRlcnNjb3Jlc10pO1xuXG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpW2pvaW5GdW5jdGlvbk5hbWVdKHRhYmxlTmFtZVJhdywgam9pblRhYmxlQ29sdW1uQXJndW1lbnRzLCBvcGVyYXRvciwgZXhpc3RpbmdUYWJsZUNvbHVtbk5hbWUpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbWFwUHJvcGVydHlOYW1lVG9Db2x1bW5OYW1lKHByb3BlcnR5TmFtZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIHByb3BlcnR5TmFtZSk7XG4gICAgICAgIHJldHVybiBjb2x1bW5JbmZvLm5hbWU7XG4gICAgfVxuICAgIHB1YmxpYyBtYXBDb2x1bW5OYW1lVG9Qcm9wZXJ0eU5hbWUoY29sdW1uTmFtZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtblByb3BlcnRpZXMgPSBnZXRDb2x1bW5Qcm9wZXJ0aWVzKHRoaXMudGFibGVDbGFzcyk7XG4gICAgICAgIGNvbnN0IGNvbHVtblByb3BlcnR5ID0gY29sdW1uUHJvcGVydGllcy5maW5kKChpKSA9PiBpLm5hbWUgPT09IGNvbHVtbk5hbWUpO1xuICAgICAgICBpZiAoY29sdW1uUHJvcGVydHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZmluZCBjb2x1bW4gd2l0aCBuYW1lIFwiJHtjb2x1bW5OYW1lfVwiYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbHVtblByb3BlcnR5LnByb3BlcnR5S2V5O1xuICAgIH1cblxuICAgIHB1YmxpYyBtYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW06IGFueSkge1xuICAgICAgICBjb25zdCBjb2x1bW5OYW1lcyA9IE9iamVjdC5rZXlzKGl0ZW0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lID0gdGhpcy5tYXBDb2x1bW5OYW1lVG9Qcm9wZXJ0eU5hbWUoY29sdW1uTmFtZSk7XG5cbiAgICAgICAgICAgIGlmIChjb2x1bW5OYW1lICE9PSBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoaXRlbSwgcHJvcGVydHlOYW1lLCBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGl0ZW0sIGNvbHVtbk5hbWUpISk7XG4gICAgICAgICAgICAgICAgZGVsZXRlIGl0ZW1bY29sdW1uTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgbWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtOiBhbnkpIHtcbiAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lcyA9IE9iamVjdC5rZXlzKGl0ZW0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgcHJvcGVydHlOYW1lIG9mIHByb3BlcnR5TmFtZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbk5hbWUgPSB0aGlzLm1hcFByb3BlcnR5TmFtZVRvQ29sdW1uTmFtZShwcm9wZXJ0eU5hbWUpO1xuXG4gICAgICAgICAgICBpZiAoY29sdW1uTmFtZSAhPT0gcHJvcGVydHlOYW1lKSB7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGl0ZW0sIGNvbHVtbk5hbWUsIE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoaXRlbSwgcHJvcGVydHlOYW1lKSEpO1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBpdGVtW3Byb3BlcnR5TmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=
