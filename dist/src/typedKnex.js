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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZWRLbmV4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3R5cGVkS25leC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSw2Q0FBNEc7QUFRNUcsMkNBQWtFO0FBRWxFLE1BQWEsU0FBUztJQUNsQixZQUFvQixJQUFVO1FBQVYsU0FBSSxHQUFKLElBQUksQ0FBTTtJQUFHLENBQUM7SUFFM0IsS0FBSyxDQUFJLFVBQXVCLEVBQUUsV0FBeUI7UUFDOUQsT0FBTyxJQUFJLGlCQUFpQixDQUFVLFVBQVUsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzlFLENBQUM7SUFFTSxJQUFJLENBQVUsYUFBMEIsRUFBRSxRQUFpRjtRQUM5SCxNQUFNLEtBQUssR0FBRyxJQUFBLHlCQUFZLEVBQUMsYUFBYSxDQUFDLENBQUM7UUFDMUMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RixPQUFPLElBQUkscUJBQXFCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRU0sZ0JBQWdCO1FBQ25CLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUMzQixJQUFJLENBQUMsSUFBSTtpQkFDSixXQUFXLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDakMsc0ZBQXNGO2lCQUNyRixLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxHQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNCLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKO0FBckJELDhC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Q0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUM7SUFDcEgsQ0FBQztJQUVNLE9BQU87UUFDVixPQUFPLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUM7SUFDcEgsQ0FBQztJQUVNLFVBQVU7UUFDYixPQUFPLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUM7SUFDdkgsQ0FBQztJQUNNLFNBQVM7UUFDWixPQUFPLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUM7SUFDdEgsQ0FBQztJQUNNLFlBQVk7UUFDZixPQUFPLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUM7SUFDekgsQ0FBQztJQUVNLFlBQVk7UUFDZixPQUFPLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUM7SUFDekgsQ0FBQztJQUNNLGVBQWU7UUFDbEIsT0FBTyxJQUFJLENBQUMsa0NBQWtDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZ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MkIsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUVsRSxJQUFJLFVBQVUsS0FBSyxZQUFZLEVBQUU7Z0JBQzdCLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRSxNQUFNLENBQUMsd0JBQXdCLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBRSxDQUFDLENBQUM7Z0JBQzlGLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2FBQzNCO1NBQ0o7SUFDTCxDQUFDO0lBRU0sc0JBQXNCLENBQUMsSUFBUztRQUNuQyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXhDLEtBQUssTUFBTSxZQUFZLElBQUksYUFBYSxFQUFFO1lBQ3RDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUVsRSxJQUFJLFVBQVUsS0FBSyxZQUFZLEVBQUU7Z0JBQzdCLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsd0JBQXdCLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBRSxDQUFDLENBQUM7Z0JBQzlGLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO2FBQzdCO1NBQ0o7SUFDTCxDQUFDO0NBQ0o7QUFsMENELDhDQWswQ0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSBwcmVmZXItcmVzdC1wYXJhbXMsIG5vLXVudXNlZC12YXJzICovXG5pbXBvcnQgeyBLbmV4IH0gZnJvbSBcImtuZXhcIjtcbmltcG9ydCB7IGdldENvbHVtbkluZm9ybWF0aW9uLCBnZXRDb2x1bW5Qcm9wZXJ0aWVzLCBnZXRQcmltYXJ5S2V5Q29sdW1uLCBnZXRUYWJsZU5hbWUgfSBmcm9tIFwiLi9kZWNvcmF0b3JzXCI7XG5pbXBvcnQgeyBOZXN0ZWRGb3JlaWduS2V5S2V5c09mLCBOZXN0ZWRLZXlzT2YgfSBmcm9tIFwiLi9OZXN0ZWRLZXlzT2ZcIjtcbmltcG9ydCB7IE5lc3RlZFJlY29yZCB9IGZyb20gXCIuL05lc3RlZFJlY29yZFwiO1xuaW1wb3J0IHsgTm9uRm9yZWlnbktleU9iamVjdHMgfSBmcm9tIFwiLi9Ob25Gb3JlaWduS2V5T2JqZWN0c1wiO1xuaW1wb3J0IHsgTm9uTnVsbGFibGVSZWN1cnNpdmUgfSBmcm9tIFwiLi9Ob25OdWxsYWJsZVJlY3Vyc2l2ZVwiO1xuaW1wb3J0IHsgUGFydGlhbEFuZFVuZGVmaW5lZCB9IGZyb20gXCIuL1BhcnRpYWxBbmRVbmRlZmluZWRcIjtcbmltcG9ydCB7IEdldE5lc3RlZFByb3BlcnR5LCBHZXROZXN0ZWRQcm9wZXJ0eVR5cGUgfSBmcm9tIFwiLi9Qcm9wZXJ0eVR5cGVzXCI7XG5pbXBvcnQgeyBTZWxlY3RhYmxlQ29sdW1uVHlwZXMgfSBmcm9tIFwiLi9TZWxlY3RhYmxlQ29sdW1uVHlwZXNcIjtcbmltcG9ydCB7IEZsYXR0ZW5PcHRpb24sIHNldFRvTnVsbCwgdW5mbGF0dGVuIH0gZnJvbSBcIi4vdW5mbGF0dGVuXCI7XG5cbmV4cG9ydCBjbGFzcyBUeXBlZEtuZXgge1xuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUga25leDogS25leCkge31cblxuICAgIHB1YmxpYyBxdWVyeTxUPih0YWJsZUNsYXNzOiBuZXcgKCkgPT4gVCwgZ3JhbnVsYXJpdHk/OiBHcmFudWxhcml0eSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxULCBULCBUPiB7XG4gICAgICAgIHJldHVybiBuZXcgVHlwZWRRdWVyeUJ1aWxkZXI8VCwgVCwgVD4odGFibGVDbGFzcywgZ3JhbnVsYXJpdHksIHRoaXMua25leCk7XG4gICAgfVxuXG4gICAgcHVibGljIHdpdGg8VCwgVSwgVj4oY3RlVGFibGVDbGFzczogbmV3ICgpID0+IFQsIGN0ZVF1ZXJ5OiAocXVlcnlCdWlsZGVyOiBUeXBlZEtuZXhDVEVRdWVyeUJ1aWxkZXIpID0+IElUeXBlZFF1ZXJ5QnVpbGRlcjxVLCBWLCBUPik6IFR5cGVkS25leFF1ZXJ5QnVpbGRlciB7XG4gICAgICAgIGNvbnN0IGFsaWFzID0gZ2V0VGFibGVOYW1lKGN0ZVRhYmxlQ2xhc3MpO1xuICAgICAgICBjb25zdCBxYiA9IHRoaXMua25leC53aXRoKGFsaWFzLCAodykgPT4gY3RlUXVlcnkobmV3IFR5cGVkS25leENURVF1ZXJ5QnVpbGRlcih0aGlzLmtuZXgsIHcpKSk7XG4gICAgICAgIHJldHVybiBuZXcgVHlwZWRLbmV4UXVlcnlCdWlsZGVyKHRoaXMua25leCwgcWIpO1xuICAgIH1cblxuICAgIHB1YmxpYyBiZWdpblRyYW5zYWN0aW9uKCk6IFByb21pc2U8S25leC5UcmFuc2FjdGlvbj4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIHRoaXMua25leFxuICAgICAgICAgICAgICAgIC50cmFuc2FjdGlvbigodHIpID0+IHJlc29sdmUodHIpKVxuICAgICAgICAgICAgICAgIC8vIElmIHRoaXMgZXJyb3IgaXMgbm90IGNhdWdodCBoZXJlLCBpdCB3aWxsIHRocm93LCByZXN1bHRpbmcgaW4gYW4gdW5oYW5kbGVkUmVqZWN0aW9uXG4gICAgICAgICAgICAgICAgLmNhdGNoKChfZSkgPT4ge30pO1xuICAgICAgICB9KTtcbiAgICB9XG59XG5cbmNsYXNzIFR5cGVkS25leENURVF1ZXJ5QnVpbGRlciB7XG4gICAgY29uc3RydWN0b3IocHJvdGVjdGVkIGtuZXg6IEtuZXgsIHByb3RlY3RlZCBxdWVyeUJ1aWxkZXI6IEtuZXguUXVlcnlCdWlsZGVyKSB7fVxuXG4gICAgcHVibGljIHF1ZXJ5PFQ+KHRhYmxlQ2xhc3M6IG5ldyAoKSA9PiBULCBncmFudWxhcml0eT86IEdyYW51bGFyaXR5KTogSVR5cGVkUXVlcnlCdWlsZGVyPFQsIFQsIFQ+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBUeXBlZFF1ZXJ5QnVpbGRlcjxULCBULCBUPih0YWJsZUNsYXNzLCBncmFudWxhcml0eSwgdGhpcy5rbmV4LCB0aGlzLnF1ZXJ5QnVpbGRlcik7XG4gICAgfVxufVxuXG5jbGFzcyBUeXBlZEtuZXhRdWVyeUJ1aWxkZXIgZXh0ZW5kcyBUeXBlZEtuZXhDVEVRdWVyeUJ1aWxkZXIge1xuICAgIHB1YmxpYyB3aXRoPFQsIFUsIFY+KGN0ZVRhYmxlQ2xhc3M6IG5ldyAoKSA9PiBULCBjdGVRdWVyeTogKHF1ZXJ5QnVpbGRlcjogVHlwZWRLbmV4Q1RFUXVlcnlCdWlsZGVyKSA9PiBJVHlwZWRRdWVyeUJ1aWxkZXI8VSwgViwgVD4pOiBUeXBlZEtuZXhRdWVyeUJ1aWxkZXIge1xuICAgICAgICBjb25zdCBhbGlhcyA9IGdldFRhYmxlTmFtZShjdGVUYWJsZUNsYXNzKTtcbiAgICAgICAgY29uc3QgcWIgPSB0aGlzLnF1ZXJ5QnVpbGRlci53aXRoKGFsaWFzLCAodykgPT4gY3RlUXVlcnkobmV3IFR5cGVkS25leENURVF1ZXJ5QnVpbGRlcih0aGlzLmtuZXgsIHcpKSk7XG4gICAgICAgIHJldHVybiBuZXcgVHlwZWRLbmV4UXVlcnlCdWlsZGVyKHRoaXMua25leCwgcWIpO1xuICAgIH1cbn1cblxubGV0IGJlZm9yZUluc2VydFRyYW5zZm9ybSA9IHVuZGVmaW5lZCBhcyB1bmRlZmluZWQgfCAoKGl0ZW06IGFueSwgdHlwZWRRdWVyeUJ1aWxkZXI6IGFueSkgPT4gYW55KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQmVmb3JlSW5zZXJ0VHJhbnNmb3JtPFQ+KGY6IChpdGVtOiBULCB0eXBlZFF1ZXJ5QnVpbGRlcjogSVR5cGVkUXVlcnlCdWlsZGVyPHt9LCB7fSwge30+KSA9PiBUKSB7XG4gICAgYmVmb3JlSW5zZXJ0VHJhbnNmb3JtID0gZjtcbn1cblxubGV0IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSA9IHVuZGVmaW5lZCBhcyB1bmRlZmluZWQgfCAoKGl0ZW06IGFueSwgdHlwZWRRdWVyeUJ1aWxkZXI6IGFueSkgPT4gYW55KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQmVmb3JlVXBkYXRlVHJhbnNmb3JtPFQ+KGY6IChpdGVtOiBULCB0eXBlZFF1ZXJ5QnVpbGRlcjogSVR5cGVkUXVlcnlCdWlsZGVyPHt9LCB7fSwge30+KSA9PiBUKSB7XG4gICAgYmVmb3JlVXBkYXRlVHJhbnNmb3JtID0gZjtcbn1cblxuY2xhc3MgTm90SW1wbGVtZW50ZWRFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoXCJOb3QgaW1wbGVtZW50ZWRcIik7XG4gICAgfVxufVxuXG5jbGFzcyBDb2x1bW5Gcm9tUXVlcnkge1xuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgYWxpYXM6IHN0cmluZykge31cblxuICAgIHB1YmxpYyB0b1N0cmluZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYWxpYXM7XG4gICAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICBjb2x1bW5zOiB7IG5hbWU6IHN0cmluZyB9W107XG5cbiAgICB3aGVyZTogSVdoZXJlV2l0aE9wZXJhdG9yPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgYW5kV2hlcmU6IElXaGVyZVdpdGhPcGVyYXRvcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmU6IElXaGVyZVdpdGhPcGVyYXRvcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIHdoZXJlTm90OiBJV2hlcmU8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBzZWxlY3Q6IElTZWxlY3RXaXRoRnVuY3Rpb25Db2x1bW5zMzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIHNlbGVjdFF1ZXJ5OiBJU2VsZWN0UXVlcnk8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIG9yZGVyQnk6IElPcmRlckJ5PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgaW5uZXJKb2luQ29sdW1uOiBJS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGxlZnRPdXRlckpvaW5Db2x1bW46IElLZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZUNvbHVtbjogSVdoZXJlQ29tcGFyZVR3b0NvbHVtbnM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHdoZXJlTnVsbDogSUNvbHVtblBhcmFtZXRlck5vUm93VHJhbnNmb3JtYXRpb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdE51bGw6IElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU51bGw6IElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU5vdE51bGw6IElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBsZWZ0T3V0ZXJKb2luVGFibGVPbkZ1bmN0aW9uOiBJSm9pblRhYmxlTXVsdGlwbGVPbkNsYXVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgaW5uZXJKb2luVGFibGVPbkZ1bmN0aW9uOiBJSm9pblRhYmxlTXVsdGlwbGVPbkNsYXVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBpbm5lckpvaW46IElKb2luPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIGxlZnRPdXRlckpvaW46IElKb2luPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgc2VsZWN0QWxpYXM6IElTZWxlY3RBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBzZWxlY3RSYXc6IElTZWxlY3RSYXc8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBmaW5kQnlQcmltYXJ5S2V5OiBJRmluZEJ5UHJpbWFyeUtleTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIHdoZXJlSW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgd2hlcmVOb3RJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIG9yV2hlcmVJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlTm90SW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZUJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdEJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlQmV0d2VlbjogSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVOb3RCZXR3ZWVuOiBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZUV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBvcldoZXJlRXhpc3RzOiBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB3aGVyZU5vdEV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU5vdEV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB3aGVyZVBhcmVudGhlc2VzOiBJV2hlcmVQYXJlbnRoZXNlczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVQYXJlbnRoZXNlczogSVdoZXJlUGFyZW50aGVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGdyb3VwQnk6IElTZWxlY3RhYmxlQ29sdW1uS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nOiBJSGF2aW5nPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBoYXZpbmdOdWxsOiBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3ROdWxsOiBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGhhdmluZ0luOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGhhdmluZ05vdEluOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nRXhpc3RzOiBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3RFeGlzdHM6IElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nQmV0d2VlbjogSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGhhdmluZ05vdEJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHVuaW9uOiBJVW5pb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICB1bmlvbkFsbDogSVVuaW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBtaW46IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgY291bnQ6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIGNvdW50RGlzdGluY3Q6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIG1heDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgc3VtOiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBzdW1EaXN0aW5jdDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgYXZnOiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBhdmdEaXN0aW5jdDogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBpbnNlcnRTZWxlY3Q6IElJbnNlcnRTZWxlY3Q7XG5cbiAgICBpbnNlcnRJdGVtV2l0aFJldHVybmluZzogSUluc2VydEl0ZW1XaXRoUmV0dXJuaW5nPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgdXBkYXRlSXRlbVdpdGhSZXR1cm5pbmc6IElJbnNlcnRJdGVtV2l0aFJldHVybmluZzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgZ2V0Q29sdW1uQWxpYXMobmFtZTogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPik6IHN0cmluZztcbiAgICBnZXRDb2x1bW4obmFtZTogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPik6IENvbHVtbkZyb21RdWVyeTtcblxuICAgIGRpc3RpbmN0T24oY29sdW1uTmFtZXM6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj5bXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgY2xlYXJTZWxlY3QoKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIE1vZGVsPjtcbiAgICBjbGVhcldoZXJlKCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGNsZWFyT3JkZXIoKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBsaW1pdCh2YWx1ZTogbnVtYmVyKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb2Zmc2V0KHZhbHVlOiBudW1iZXIpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHVzZUtuZXhRdWVyeUJ1aWxkZXIoZjogKHF1ZXJ5OiBLbmV4LlF1ZXJ5QnVpbGRlcikgPT4gdm9pZCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGdldEtuZXhRdWVyeUJ1aWxkZXIoKTogS25leC5RdWVyeUJ1aWxkZXI7XG4gICAgdG9RdWVyeSgpOiBzdHJpbmc7XG5cbiAgICBnZXRGaXJzdE9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8KFJvdyBleHRlbmRzIE1vZGVsID8gUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+IDogUm93KSB8IG51bGw+O1xuICAgIGdldEZpcnN0T3JVbmRlZmluZWQoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdykgfCB1bmRlZmluZWQ+O1xuICAgIGdldEZpcnN0KGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTxSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdz47XG4gICAgZ2V0U2luZ2xlT3JOdWxsKGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTwoUm93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3cpIHwgbnVsbD47XG4gICAgZ2V0U2luZ2xlT3JVbmRlZmluZWQoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdykgfCB1bmRlZmluZWQ+O1xuICAgIGdldFNpbmdsZShmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8Um93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3c+O1xuICAgIGdldE1hbnkoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdylbXT47XG4gICAgZ2V0Q291bnQoKTogUHJvbWlzZTxudW1iZXIgfCBzdHJpbmc+O1xuICAgIGluc2VydEl0ZW0obmV3T2JqZWN0OiBQYXJ0aWFsQW5kVW5kZWZpbmVkPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4pOiBQcm9taXNlPHZvaWQ+O1xuICAgIGluc2VydEl0ZW1zKGl0ZW1zOiBQYXJ0aWFsQW5kVW5kZWZpbmVkPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj5bXSk6IFByb21pc2U8dm9pZD47XG4gICAgZGVsKCk6IFByb21pc2U8dm9pZD47XG4gICAgZGVsQnlQcmltYXJ5S2V5KHByaW1hcnlLZXlWYWx1ZTogYW55KTogUHJvbWlzZTx2b2lkPjtcbiAgICB1cGRhdGVJdGVtKGl0ZW06IFBhcnRpYWxBbmRVbmRlZmluZWQ8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+Pik6IFByb21pc2U8dm9pZD47XG4gICAgdXBkYXRlSXRlbUJ5UHJpbWFyeUtleShwcmltYXJ5S2V5VmFsdWU6IGFueSwgaXRlbTogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+KTogUHJvbWlzZTx2b2lkPjtcbiAgICB1cGRhdGVJdGVtc0J5UHJpbWFyeUtleShcbiAgICAgICAgaXRlbXM6IHtcbiAgICAgICAgICAgIHByaW1hcnlLZXlWYWx1ZTogYW55O1xuICAgICAgICAgICAgZGF0YTogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+O1xuICAgICAgICB9W11cbiAgICApOiBQcm9taXNlPHZvaWQ+O1xuICAgIGV4ZWN1dGUoKTogUHJvbWlzZTx2b2lkPjtcbiAgICB3aGVyZVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgaGF2aW5nUmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHRyYW5zYWN0aW5nKHRyeDogS25leC5UcmFuc2FjdGlvbik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgdHJ1bmNhdGUoKTogUHJvbWlzZTx2b2lkPjtcbiAgICBkaXN0aW5jdCgpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGNsb25lKCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgZ3JvdXBCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBvcmRlckJ5UmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGtlZXBGbGF0KCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBhbnk+O1xufVxuXG50eXBlIFJldHVybk5vbk9iamVjdHNOYW1lc09ubHk8VD4gPSB7IFtLIGluIGtleW9mIFRdOiBUW0tdIGV4dGVuZHMgU2VsZWN0YWJsZUNvbHVtblR5cGVzID8gSyA6IG5ldmVyIH1ba2V5b2YgVF07XG5cbnR5cGUgUmVtb3ZlT2JqZWN0c0Zyb208VD4gPSB7IFtQIGluIFJldHVybk5vbk9iamVjdHNOYW1lc09ubHk8VD5dOiBUW1BdIH07XG5cbmV4cG9ydCB0eXBlIE9iamVjdFRvUHJpbWl0aXZlPFQ+ID0gVCBleHRlbmRzIFN0cmluZyA/IHN0cmluZyA6IFQgZXh0ZW5kcyBOdW1iZXIgPyBudW1iZXIgOiBUIGV4dGVuZHMgQm9vbGVhbiA/IGJvb2xlYW4gOiBuZXZlcjtcblxuZXhwb3J0IHR5cGUgT3BlcmF0b3IgPSBcIj1cIiB8IFwiIT1cIiB8IFwiPlwiIHwgXCI8XCIgfCBzdHJpbmc7XG5cbmludGVyZmFjZSBJQ29uc3RydWN0b3I8VD4ge1xuICAgIG5ldyAoLi4uYXJnczogYW55W10pOiBUO1xufVxuXG5leHBvcnQgdHlwZSBBZGRQcm9wZXJ0eVdpdGhUeXBlPE9yaWdpbmFsLCBOZXdLZXkgZXh0ZW5kcyBrZXlvZiBhbnksIE5ld0tleVR5cGU+ID0gT3JpZ2luYWwgJiBOZXN0ZWRSZWNvcmQ8TmV3S2V5LCBOZXdLZXlUeXBlPjtcblxuaW50ZXJmYWNlIElJbnNlcnRJdGVtV2l0aFJldHVybmluZzxNb2RlbCwgX1NlbGVjdGFibGVNb2RlbCwgX1Jvdz4ge1xuICAgIChuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+Pik6IFByb21pc2U8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+PjtcbiAgICA8S2V5cyBleHRlbmRzIGtleW9mIFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4obmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4sIGtleXM6IEtleXNbXSk6IFByb21pc2U8UGljazxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4sIEtleXM+Pjtcbn1cblxuaW50ZXJmYWNlIElDb2x1bW5QYXJhbWV0ZXJOb1Jvd1RyYW5zZm9ybWF0aW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5PbjxNb2RlbCwgSm9pbmVkTW9kZWw+IHtcbiAgICA8Q29uY2F0S2V5MSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4sIENvbmNhdEtleTIgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihcbiAgICAgICAga2V5MTogQ29uY2F0S2V5MSxcbiAgICAgICAgb3BlcmF0b3I6IE9wZXJhdG9yLFxuICAgICAgICBrZXkyOiBDb25jYXRLZXkyXG4gICAgKTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElKb2luT25WYWw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBvcGVyYXRvcjogT3BlcmF0b3IsIHZhbHVlOiBhbnkpOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5Pbk51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5KTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD4ge1xuICAgIG9uOiBJSm9pbk9uPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPbjogSUpvaW5PbjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIGFuZE9uOiBJSm9pbk9uPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25WYWw6IElKb2luT25WYWw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBhbmRPblZhbDogSUpvaW5PblZhbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25WYWw6IElKb2luT25WYWw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvbk51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSW5zZXJ0U2VsZWN0IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TmV3UHJvcGVydHlUeXBlPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TmV3UHJvcGVydHlUeXBlPiwgXCJcIj4+KFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICAuLi5jb2x1bW5OYW1lczogQ29uY2F0S2V5W11cbiAgICApOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5UYWJsZU11bHRpcGxlT25DbGF1c2VzPE1vZGVsLCBfU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueT4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgTmV3UHJvcGVydHlUeXBlPikgPT4gdm9pZFxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgQWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIFJvdz47XG5cbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueT4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LFxuICAgICAgICBvbjogKGpvaW46IElKb2luT25DbGF1c2UyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBOZXdQcm9wZXJ0eVR5cGU+KSA9PiB2b2lkXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElKb2luPE1vZGVsLCBfU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueSwgQ29uY2F0S2V5MiBleHRlbmRzIGtleW9mIE5ld1Byb3BlcnR5VHlwZSwgQ29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAga2V5OiBDb25jYXRLZXkyLFxuICAgICAgICBvcGVyYXRvcjogT3BlcmF0b3IsXG4gICAgICAgIGtleTI6IENvbmNhdEtleVxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgQWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIFJvdz47XG5cbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueSwgQ29uY2F0S2V5MiBleHRlbmRzIGtleW9mIE5ld1Byb3BlcnR5VHlwZSwgQ29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LFxuICAgICAgICBrZXk6IENvbmNhdEtleTIsXG4gICAgICAgIG9wZXJhdG9yOiBPcGVyYXRvcixcbiAgICAgICAga2V5MjogQ29uY2F0S2V5XG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElTZWxlY3RBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIFwiXCI+LCBUTmFtZSBleHRlbmRzIGtleW9mIGFueT4oYWxpYXM6IFROYW1lLCBjb2x1bW5OYW1lOiBDb25jYXRLZXkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJlY29yZDxUTmFtZSwgR2V0TmVzdGVkUHJvcGVydHlUeXBlPFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj4gJiBSb3dcbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSVNlbGVjdFJhdzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8VFJldHVybiBleHRlbmRzIEJvb2xlYW4gfCBTdHJpbmcgfCBOdW1iZXIsIFROYW1lIGV4dGVuZHMga2V5b2YgYW55PihuYW1lOiBUTmFtZSwgcmV0dXJuVHlwZTogSUNvbnN0cnVjdG9yPFRSZXR1cm4+LCBxdWVyeTogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJlY29yZDxUTmFtZSwgT2JqZWN0VG9QcmltaXRpdmU8VFJldHVybj4+ICYgUm93XG4gICAgPjtcbn1cblxuaW50ZXJmYWNlIElTZWxlY3RRdWVyeTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8VFJldHVybiBleHRlbmRzIEJvb2xlYW4gfCBTdHJpbmcgfCBOdW1iZXIsIFROYW1lIGV4dGVuZHMga2V5b2YgYW55LCBTdWJRdWVyeU1vZGVsPihcbiAgICAgICAgbmFtZTogVE5hbWUsXG4gICAgICAgIHJldHVyblR5cGU6IElDb25zdHJ1Y3RvcjxUUmV0dXJuPixcbiAgICAgICAgc3ViUXVlcnlNb2RlbDogbmV3ICgpID0+IFN1YlF1ZXJ5TW9kZWwsXG4gICAgICAgIGNvZGU6IChzdWJRdWVyeTogSVR5cGVkUXVlcnlCdWlsZGVyPFN1YlF1ZXJ5TW9kZWwsIFN1YlF1ZXJ5TW9kZWwsIHt9PiwgcGFyZW50OiBUcmFuc2Zvcm1Qcm9wc1RvRnVuY3Rpb25zUmV0dXJuUHJvcGVydHlOYW1lPE1vZGVsPikgPT4gdm9pZCxcbiAgICAgICAgZ3JhbnVsYXJpdHk/OiBHcmFudWxhcml0eVxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSZWNvcmQ8VE5hbWUsIE9iamVjdFRvUHJpbWl0aXZlPFRSZXR1cm4+PiAmIFJvdz47XG59XG5cbnR5cGUgVHJhbnNmb3JtUHJvcHNUb0Z1bmN0aW9uc1JldHVyblByb3BlcnR5TmFtZTxNb2RlbD4gPSB7XG4gICAgW1AgaW4ga2V5b2YgTW9kZWxdOiBNb2RlbFtQXSBleHRlbmRzIG9iamVjdCA/IChNb2RlbFtQXSBleHRlbmRzIFJlcXVpcmVkPE5vbkZvcmVpZ25LZXlPYmplY3RzPiA/ICgpID0+IFAgOiBUcmFuc2Zvcm1Qcm9wc1RvRnVuY3Rpb25zUmV0dXJuUHJvcGVydHlOYW1lPE1vZGVsW1BdPikgOiAoKSA9PiBQO1xufTtcblxuaW50ZXJmYWNlIElPcmRlckJ5PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwgXCJcIj4sIFROYW1lIGV4dGVuZHMga2V5b2YgYW55PihcbiAgICAgICAgY29sdW1uTmFtZXM6IENvbmNhdEtleSxcbiAgICAgICAgZGlyZWN0aW9uPzogXCJhc2NcIiB8IFwiZGVzY1wiXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyAmIFJlY29yZDxUTmFtZSwgR2V0TmVzdGVkUHJvcGVydHlUeXBlPFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj4+O1xufVxuXG5pbnRlcmZhY2UgSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBcIlwiPiwgVE5hbWUgZXh0ZW5kcyBrZXlvZiBhbnk+KGNvbHVtbk5hbWVzOiBDb25jYXRLZXksIG5hbWU6IFROYW1lKTogSVR5cGVkUXVlcnlCdWlsZGVyPFxuICAgICAgICBNb2RlbCxcbiAgICAgICAgU2VsZWN0YWJsZU1vZGVsLFxuICAgICAgICBSb3cgJiBSZWNvcmQ8VE5hbWUsIEdldE5lc3RlZFByb3BlcnR5VHlwZTxTZWxlY3RhYmxlTW9kZWwsIENvbmNhdEtleT4+XG4gICAgPjtcbn1cblxudHlwZSBVbmlvblRvSW50ZXJzZWN0aW9uPFU+ID0gKFUgZXh0ZW5kcyBhbnkgPyAoazogVSkgPT4gdm9pZCA6IG5ldmVyKSBleHRlbmRzIChrOiBpbmZlciBJKSA9PiB2b2lkID8gSSA6IG5ldmVyO1xuXG5pbnRlcmZhY2UgSVNlbGVjdFdpdGhGdW5jdGlvbkNvbHVtbnMzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwgXCJcIj4+KC4uLmNvbHVtbk5hbWVzOiBDb25jYXRLZXlbXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxcbiAgICAgICAgTW9kZWwsXG4gICAgICAgIFNlbGVjdGFibGVNb2RlbCxcbiAgICAgICAgUm93ICYgVW5pb25Ub0ludGVyc2VjdGlvbjxHZXROZXN0ZWRQcm9wZXJ0eTxTZWxlY3RhYmxlTW9kZWwsIENvbmNhdEtleT4+XG4gICAgPjtcbn1cblxuaW50ZXJmYWNlIElGaW5kQnlQcmltYXJ5S2V5PF9Nb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIFwiXCI+PihwcmltYXJ5S2V5VmFsdWU6IGFueSwgLi4uY29sdW1uTmFtZXM6IENvbmNhdEtleVtdKTogUHJvbWlzZTxcbiAgICAgICAgKFJvdyAmIFVuaW9uVG9JbnRlcnNlY3Rpb248R2V0TmVzdGVkUHJvcGVydHk8U2VsZWN0YWJsZU1vZGVsLCBDb25jYXRLZXk+PikgfCB1bmRlZmluZWRcbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSUtleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEZvcmVpZ25LZXlLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgZ3JhbnVsYXJpdHk/OiBHcmFudWxhcml0eSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVNlbGVjdGFibGVDb2x1bW5LZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVdoZXJlPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgdmFsdWU6IEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5Pik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVdoZXJlV2l0aE9wZXJhdG9yPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgdmFsdWU6IEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5Pik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBvcGVyYXRvcjogT3BlcmF0b3IsIHZhbHVlOiBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT4pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJvd1xuICAgID47XG59XG5cbmludGVyZmFjZSBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXksIHZhbHVlOiBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT5bXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPiwgUHJvcGVydHlUeXBlIGV4dGVuZHMgR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+PihcbiAgICAgICAga2V5OiBDb25jYXRLZXksXG4gICAgICAgIHZhbHVlOiBbUHJvcGVydHlUeXBlLCBQcm9wZXJ0eVR5cGVdXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJSGF2aW5nPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgb3BlcmF0b3I6IE9wZXJhdG9yLCB2YWx1ZTogR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+KTogSVR5cGVkUXVlcnlCdWlsZGVyPFxuICAgICAgICBNb2RlbCxcbiAgICAgICAgU2VsZWN0YWJsZU1vZGVsLFxuICAgICAgICBSb3dcbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSVdoZXJlQ29tcGFyZVR3b0NvbHVtbnM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPF9Qcm9wZXJ0eVR5cGUxLCBfUHJvcGVydHlUeXBlMiwgTW9kZWwyPihcbiAgICAgICAga2V5MTogTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPixcbiAgICAgICAgb3BlcmF0b3I6IE9wZXJhdG9yLFxuICAgICAgICBrZXkyOiBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWwyPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWwyPiwgXCJcIj5cbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIChrZXkxOiBDb2x1bW5Gcm9tUXVlcnksIG9wZXJhdG9yOiBPcGVyYXRvciwga2V5MjogQ29sdW1uRnJvbVF1ZXJ5KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPFN1YlF1ZXJ5TW9kZWw+KFxuICAgICAgICBzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCxcbiAgICAgICAgY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8U3ViUXVlcnlNb2RlbCwgU3ViUXVlcnlNb2RlbCwge30+LCBwYXJlbnQ6IFRyYW5zZm9ybVByb3BzVG9GdW5jdGlvbnNSZXR1cm5Qcm9wZXJ0eU5hbWU8U2VsZWN0YWJsZU1vZGVsPikgPT4gdm9pZFxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgPFN1YlF1ZXJ5TW9kZWw+KFxuICAgICAgICBzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCxcbiAgICAgICAgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LFxuICAgICAgICBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4sIHBhcmVudDogVHJhbnNmb3JtUHJvcHNUb0Z1bmN0aW9uc1JldHVyblByb3BlcnR5TmFtZTxTZWxlY3RhYmxlTW9kZWw+KSA9PiB2b2lkXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmVQYXJlbnRoZXNlczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICAoY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PikgPT4gdm9pZCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xufVxuXG5pbnRlcmZhY2UgSVVuaW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxTdWJRdWVyeU1vZGVsPihzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCwgY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8U3ViUXVlcnlNb2RlbCwgU3ViUXVlcnlNb2RlbCwge30+KSA9PiB2b2lkKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICA8U3ViUXVlcnlNb2RlbD4oc3ViUXVlcnlNb2RlbDogbmV3ICgpID0+IFN1YlF1ZXJ5TW9kZWwsIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSwgY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8U3ViUXVlcnlNb2RlbCwgU3ViUXVlcnlNb2RlbCwge30+KSA9PiB2b2lkKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbnR5cGUgR3JhbnVsYXJpdHkgPSBcIlBBR0xPQ0tcIiB8IFwiTk9MT0NLXCIgfCBcIlJFQURDT01NSVRURURMT0NLXCIgfCBcIlJPV0xPQ0tcIiB8IFwiVEFCTE9DS1wiIHwgXCJUQUJMT0NLWFwiO1xuXG5mdW5jdGlvbiBnZXRQcm94eUFuZE1lbW9yaWVzPE1vZGVsVHlwZSwgUm93Pih0eXBlZFF1ZXJ5QnVpbGRlcj86IFR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsVHlwZSwgUm93Pikge1xuICAgIGNvbnN0IG1lbW9yaWVzID0gW10gYXMgc3RyaW5nW107XG5cbiAgICBmdW5jdGlvbiBhbGxHZXQoX3RhcmdldDogYW55LCBuYW1lOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAobmFtZSA9PT0gXCJtZW1vcmllc1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gbWVtb3JpZXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmFtZSA9PT0gXCJnZXRDb2x1bW5OYW1lXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0eXBlZFF1ZXJ5QnVpbGRlciEuZ2V0Q29sdW1uTmFtZSguLi5tZW1vcmllcyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIG1lbW9yaWVzLnB1c2gobmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm94eShcbiAgICAgICAgICAgIHt9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGdldDogYWxsR2V0LFxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHJvb3QgPSBuZXcgUHJveHkoXG4gICAgICAgIHt9LFxuICAgICAgICB7XG4gICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICByZXR1cm4geyByb290LCBtZW1vcmllcyB9O1xufVxuXG5mdW5jdGlvbiBnZXRQcm94eUFuZE1lbW9yaWVzRm9yQXJyYXk8TW9kZWxUeXBlLCBSb3c+KHR5cGVkUXVlcnlCdWlsZGVyPzogVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBSb3c+KSB7XG4gICAgY29uc3QgcmVzdWx0ID0gW10gYXMgc3RyaW5nW11bXTtcblxuICAgIGxldCBjb3VudGVyID0gLTE7XG5cbiAgICBmdW5jdGlvbiBhbGxHZXQoX3RhcmdldDogYW55LCBuYW1lOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAoX3RhcmdldC5sZXZlbCA9PT0gMCkge1xuICAgICAgICAgICAgY291bnRlcisrO1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goW10pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChuYW1lID09PSBcIm1lbW9yaWVzXCIpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRbY291bnRlcl07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwicmVzdWx0XCIpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwibGV2ZWxcIikge1xuICAgICAgICAgICAgcmV0dXJuIF90YXJnZXQubGV2ZWw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwiZ2V0Q29sdW1uTmFtZVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZWRRdWVyeUJ1aWxkZXIhLmdldENvbHVtbk5hbWUoLi4ucmVzdWx0W2NvdW50ZXJdKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJlc3VsdFtjb3VudGVyXS5wdXNoKG5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJveHkoXG4gICAgICAgICAgICB7fSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCByb290ID0gbmV3IFByb3h5KFxuICAgICAgICB7IGxldmVsOiAwIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIGdldDogYWxsR2V0LFxuICAgICAgICB9XG4gICAgKTtcblxuICAgIHJldHVybiB7IHJvb3QsIHJlc3VsdCB9O1xufVxuXG5leHBvcnQgY2xhc3MgVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyA9IHt9PiBpbXBsZW1lbnRzIElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbFR5cGUsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgcHVibGljIGNvbHVtbnM6IHsgbmFtZTogc3RyaW5nIH1bXTtcblxuICAgIHB1YmxpYyBvbmx5TG9nUXVlcnkgPSBmYWxzZTtcbiAgICBwdWJsaWMgcXVlcnlMb2cgPSBcIlwiO1xuICAgIHByaXZhdGUgaGFzU2VsZWN0Q2xhdXNlID0gZmFsc2U7XG5cbiAgICBwcml2YXRlIHF1ZXJ5QnVpbGRlcjogS25leC5RdWVyeUJ1aWxkZXI7XG4gICAgcHJpdmF0ZSB0YWJsZU5hbWU6IHN0cmluZztcbiAgICBwcml2YXRlIHNob3VsZFVuZmxhdHRlbjogYm9vbGVhbjtcbiAgICBwcml2YXRlIGV4dHJhSm9pbmVkUHJvcGVydGllczoge1xuICAgICAgICBuYW1lOiBzdHJpbmc7XG4gICAgICAgIHByb3BlcnR5VHlwZTogbmV3ICgpID0+IGFueTtcbiAgICB9W107XG5cbiAgICBwcml2YXRlIHRyYW5zYWN0aW9uPzogS25leC5UcmFuc2FjdGlvbjtcblxuICAgIHByaXZhdGUgc3ViUXVlcnlDb3VudGVyID0gMDtcblxuICAgIHByaXZhdGUgZ3JhbnVsYXJpdHlTZXQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxHcmFudWxhcml0eT4oW1wiTk9MT0NLXCIsIFwiUEFHTE9DS1wiLCBcIlJFQURDT01NSVRURURMT0NLXCIsIFwiUk9XTE9DS1wiLCBcIlRBQkxPQ0tcIiwgXCJUQUJMT0NLWFwiXSk7XG5cbiAgICBjb25zdHJ1Y3RvcihcbiAgICAgICAgcHJpdmF0ZSB0YWJsZUNsYXNzOiBuZXcgKCkgPT4gTW9kZWxUeXBlLFxuICAgICAgICBwcml2YXRlIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCxcbiAgICAgICAgcHJpdmF0ZSBrbmV4OiBLbmV4LFxuICAgICAgICBxdWVyeUJ1aWxkZXI/OiBLbmV4LlF1ZXJ5QnVpbGRlcixcbiAgICAgICAgcHJpdmF0ZSBwYXJlbnRUeXBlZFF1ZXJ5QnVpbGRlcj86IGFueSxcbiAgICAgICAgcHJpdmF0ZSBzdWJRdWVyeVByZWZpeD86IHN0cmluZ1xuICAgICkge1xuICAgICAgICB0aGlzLnRhYmxlTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZUNsYXNzKTtcbiAgICAgICAgdGhpcy5jb2x1bW5zID0gZ2V0Q29sdW1uUHJvcGVydGllcyh0YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcbiAgICAgICAgaWYgKHF1ZXJ5QnVpbGRlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlciA9IHF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICh0aGlzLnN1YlF1ZXJ5UHJlZml4KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZnJvbSh0aGlzLmtuZXgucmF3KGA/PyBhcyA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGhpcy50YWJsZU5hbWUsIGAke3RoaXMuc3ViUXVlcnlQcmVmaXh9JHt0aGlzLnRhYmxlTmFtZX1gXSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5mcm9tKHRoaXMua25leC5yYXcoYD8/JHtncmFudWxhcml0eVF1ZXJ5fWAsIFt0aGlzLnRhYmxlTmFtZV0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyID0gdGhpcy5rbmV4LmZyb20odGhpcy5rbmV4LnJhdyhgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RoaXMudGFibGVOYW1lXSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMgPSBbXTtcbiAgICAgICAgdGhpcy5zaG91bGRVbmZsYXR0ZW4gPSB0cnVlO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXROZXh0U3ViUXVlcnlQcmVmaXgoKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn1zdWJxdWVyeSR7dGhpcy5zdWJRdWVyeUNvdW50ZXJ9JGA7XG4gICAgICAgIHRoaXMuc3ViUXVlcnlDb3VudGVyKys7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgcHVibGljIGtlZXBGbGF0KCkge1xuICAgICAgICB0aGlzLnNob3VsZFVuZmxhdHRlbiA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q29sdW1uQWxpYXMobmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmtuZXgucmF3KFwiPz9cIiwgdGhpcy5nZXRDb2x1bW5OYW1lKC4uLm5hbWUuc3BsaXQoXCIuXCIpKSkudG9RdWVyeSgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRDb2x1bW4obmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ29sdW1uRnJvbVF1ZXJ5KHRoaXMuZ2V0Q29sdW1uQWxpYXMobmFtZSkpO1xuICAgIH1cblxuICAgIHB1YmxpYyBkaXN0aW5jdE9uKGNvbHVtbk5hbWVzOiBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWxUeXBlPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWxUeXBlPiwgXCJcIj5bXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbFR5cGUsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgICAgIGNvbnN0IG1hcHBlZENvbHVtbk5hbWVzID0gY29sdW1uTmFtZXMubWFwKChjb2x1bW5OYW1lKSA9PiB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uTmFtZS5zcGxpdChcIi5cIikpKTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZGlzdGluY3RPbihtYXBwZWRDb2x1bW5OYW1lcyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBkZWwoKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyLmRlbCgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBkZWxCeVByaW1hcnlLZXkodmFsdWU6IGFueSkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlci5kZWwoKS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCB2YWx1ZSk7XG4gICAgfVxuXG4gICAgcHVibGljIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+Pik6IFByb21pc2U8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj47XG4gICAgcHVibGljIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nPEtleXMgZXh0ZW5kcyBrZXlvZiBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+PihuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4sIGtleXM6IEtleXNbXSk6IFByb21pc2U8UGljazxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+LCBLZXlzPj47XG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+PiwgcmV0dXJuUHJvcGVydGllcz86IChrZXlvZiBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+KVtdKSB7XG4gICAgICAgIGxldCBpdGVtID0gbmV3T2JqZWN0O1xuICAgICAgICBpZiAoYmVmb3JlVXBkYXRlVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICBpdGVtID0gYmVmb3JlVXBkYXRlVHJhbnNmb3JtKG5ld09iamVjdCwgdGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tYXBQcm9wZXJ0aWVzVG9Db2x1bW5zKGl0ZW0pO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIudXBkYXRlKGl0ZW0pO1xuICAgICAgICBpZiAocmV0dXJuUHJvcGVydGllcykge1xuICAgICAgICAgICAgY29uc3QgbWFwcGVkTmFtZXMgPSByZXR1cm5Qcm9wZXJ0aWVzLm1hcCgoY29sdW1uTmFtZSkgPT4gdGhpcy5nZXRDb2x1bW5OYW1lKGNvbHVtbk5hbWUgYXMgc3RyaW5nKSk7XG4gICAgICAgICAgICBxdWVyeS5yZXR1cm5pbmcobWFwcGVkTmFtZXMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKFwiKlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuXG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gKGF3YWl0IHF1ZXJ5KSBhcyBhbnk7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gcm93c1swXTtcblxuICAgICAgICAgICAgdGhpcy5tYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW0pO1xuXG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pOiBQcm9taXNlPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+O1xuICAgIHB1YmxpYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZzxLZXlzIGV4dGVuZHMga2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4obmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+LCBrZXlzOiBLZXlzW10pOiBQcm9taXNlPFBpY2s8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPiwgS2V5cz4+O1xuICAgIHB1YmxpYyBhc3luYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4sIHJldHVyblByb3BlcnRpZXM/OiAoa2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPilbXSkge1xuICAgICAgICBsZXQgaXRlbSA9IG5ld09iamVjdDtcbiAgICAgICAgaWYgKGJlZm9yZUluc2VydFRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZUluc2VydFRyYW5zZm9ybShuZXdPYmplY3QsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyh0aGlzLnRhYmxlQ2xhc3MpO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuaW5zZXJ0KGl0ZW0pO1xuICAgICAgICBpZiAocmV0dXJuUHJvcGVydGllcykge1xuICAgICAgICAgICAgY29uc3QgbWFwcGVkTmFtZXMgPSByZXR1cm5Qcm9wZXJ0aWVzLm1hcCgoY29sdW1uTmFtZSkgPT4gdGhpcy5nZXRDb2x1bW5OYW1lKGNvbHVtbk5hbWUgYXMgc3RyaW5nKSk7XG4gICAgICAgICAgICBxdWVyeS5yZXR1cm5pbmcobWFwcGVkTmFtZXMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKFwiKlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuXG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgcXVlcnk7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gcm93c1swXTtcblxuICAgICAgICAgICAgdGhpcy5tYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW0pO1xuXG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBpbnNlcnRJdGVtKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+Pikge1xuICAgICAgICBhd2FpdCB0aGlzLmluc2VydEl0ZW1zKFtuZXdPYmplY3RdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgaW5zZXJ0SXRlbXMoaXRlbXM6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj5bXSkge1xuICAgICAgICBpdGVtcyA9IFsuLi5pdGVtc107XG5cbiAgICAgICAgaWYgKGJlZm9yZUluc2VydFRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbXMgPSBpdGVtcy5tYXAoKGl0ZW0pID0+IGJlZm9yZUluc2VydFRyYW5zZm9ybSEoaXRlbSwgdGhpcykpO1xuICAgICAgICB9XG5cbiAgICAgICAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4gdGhpcy5tYXBQcm9wZXJ0aWVzVG9Db2x1bW5zKGl0ZW0pKTtcblxuICAgICAgICB3aGlsZSAoaXRlbXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgY2h1bmsgPSBpdGVtcy5zcGxpY2UoMCwgNTAwKTtcbiAgICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuY2xvbmUoKS5pbnNlcnQoY2h1bmspO1xuICAgICAgICAgICAgaWYgKHRoaXMudHJhbnNhY3Rpb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHF1ZXJ5LnRyYW5zYWN0aW5nKHRoaXMudHJhbnNhY3Rpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBxdWVyeTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVJdGVtKGl0ZW06IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pIHtcbiAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKTtcbiAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5TG9nICs9IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXIudXBkYXRlKGl0ZW0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZUl0ZW1CeVByaW1hcnlLZXkocHJpbWFyeUtleVZhbHVlOiBhbnksIGl0ZW06IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pIHtcbiAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKTtcblxuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCBwcmltYXJ5S2V5VmFsdWUpO1xuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgcXVlcnk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdXBkYXRlSXRlbXNCeVByaW1hcnlLZXkoXG4gICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICBwcmltYXJ5S2V5VmFsdWU6IGFueTtcbiAgICAgICAgICAgIGRhdGE6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj47XG4gICAgICAgIH1bXVxuICAgICkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBpdGVtcyA9IFsuLi5pdGVtc107XG4gICAgICAgIHdoaWxlIChpdGVtcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBjaHVuayA9IGl0ZW1zLnNwbGljZSgwLCA1MDApO1xuXG4gICAgICAgICAgICBsZXQgc3FsID0gXCJcIjtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBjaHVuaykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuY2xvbmUoKTtcbiAgICAgICAgICAgICAgICBpZiAoYmVmb3JlVXBkYXRlVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgICAgIGl0ZW0uZGF0YSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLmRhdGEsIHRoaXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLm1hcFByb3BlcnRpZXNUb0NvbHVtbnMoaXRlbS5kYXRhKTtcblxuICAgICAgICAgICAgICAgIHF1ZXJ5LnVwZGF0ZShpdGVtLmRhdGEpO1xuICAgICAgICAgICAgICAgIHNxbCArPSBxdWVyeS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCBpdGVtLnByaW1hcnlLZXlWYWx1ZSkudG9TdHJpbmcoKS5yZXBsYWNlKFwiP1wiLCBcIlxcXFw/XCIpICsgXCI7XFxuXCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGZpbmFsUXVlcnkgPSB0aGlzLmtuZXgucmF3KHNxbCk7XG4gICAgICAgICAgICBpZiAodGhpcy50cmFuc2FjdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgZmluYWxRdWVyeS50cmFuc2FjdGluZyh0aGlzLnRyYW5zYWN0aW9uKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBmaW5hbFF1ZXJ5LnRvUXVlcnkoKSArIFwiXFxuXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGF3YWl0IGZpbmFsUXVlcnk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZXhlY3V0ZSgpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgfVxuXG4gICAgcHVibGljIGxpbWl0KHZhbHVlOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIubGltaXQodmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIG9mZnNldCh2YWx1ZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLm9mZnNldCh2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZmluZEJ5SWQoaWQ6IHN0cmluZywgY29sdW1uczogKGtleW9mIE1vZGVsVHlwZSlbXSkge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXJcbiAgICAgICAgICAgIC5zZWxlY3QoY29sdW1ucyBhcyBhbnkpXG4gICAgICAgICAgICAud2hlcmUodGhpcy50YWJsZU5hbWUgKyBcIi5pZFwiLCBpZClcbiAgICAgICAgICAgIC5maXJzdCgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRDb3VudCgpIHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJ5QnVpbGRlci5jb3VudCh7IGNvdW50OiBcIipcIiB9KTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcXVlcnk7XG4gICAgICAgIGlmIChyZXN1bHQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLmNvdW50O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRGaXJzdE9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZsYXR0ZW5CeU9wdGlvbihpdGVtc1swXSwgZmxhdHRlbk9wdGlvbik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHVibGljIGFzeW5jIGdldEZpcnN0T3JVbmRlZmluZWQoKSB7XG4gICAgICAgIGNvbnN0IGZpcnN0T3JOdWxsUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRGaXJzdE9yTnVsbCgpO1xuICAgICAgICBpZiAoZmlyc3RPck51bGxSZXN1bHQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpcnN0T3JOdWxsUmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRGaXJzdChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSXRlbSBub3QgZm91bmQuXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXNbMF0sIGZsYXR0ZW5PcHRpb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGdldFNpbmdsZU9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGl0ZW1zLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1vcmUgdGhhbiBvbmUgaXRlbSBmb3VuZDogJHtpdGVtcy5sZW5ndGh9LmApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmxhdHRlbkJ5T3B0aW9uKGl0ZW1zWzBdLCBmbGF0dGVuT3B0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRTaW5nbGVPclVuZGVmaW5lZCgpIHtcbiAgICAgICAgY29uc3Qgc2luZ2xlT3JOdWxsUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRTaW5nbGVPck51bGwoKTtcbiAgICAgICAgaWYgKHNpbmdsZU9yTnVsbFJlc3VsdCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2luZ2xlT3JOdWxsUmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRTaW5nbGUoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAoIWl0ZW1zIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkl0ZW0gbm90IGZvdW5kLlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXRlbXMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTW9yZSB0aGFuIG9uZSBpdGVtIGZvdW5kOiAke2l0ZW1zLmxlbmd0aH0uYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXNbMF0sIGZsYXR0ZW5PcHRpb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHNlbGVjdENvbHVtbigpIHtcbiAgICAgICAgdGhpcy5oYXNTZWxlY3RDbGF1c2UgPSB0cnVlO1xuICAgICAgICBsZXQgY2FsbGVkQXJndW1lbnRzID0gW10gYXMgc3RyaW5nW107XG5cbiAgICAgICAgZnVuY3Rpb24gc2F2ZUFyZ3VtZW50cyguLi5hcmdzOiBzdHJpbmdbXSkge1xuICAgICAgICAgICAgY2FsbGVkQXJndW1lbnRzID0gYXJncztcbiAgICAgICAgfVxuXG4gICAgICAgIGFyZ3VtZW50c1swXShzYXZlQXJndW1lbnRzKTtcblxuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5zZWxlY3QodGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNhbGxlZEFyZ3VtZW50cykgKyBcIiBhcyBcIiArIHRoaXMuZ2V0Q29sdW1uU2VsZWN0QWxpYXMoLi4uY2FsbGVkQXJndW1lbnRzKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGY6IGFueSkge1xuICAgICAgICBjb25zdCB7IHJvb3QsIHJlc3VsdCB9ID0gZ2V0UHJveHlBbmRNZW1vcmllc0ZvckFycmF5KCk7XG5cbiAgICAgICAgZihyb290KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3QyKCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMF07XG5cbiAgICAgICAgY29uc3QgY29sdW1uQXJndW1lbnRzTGlzdCA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uMyhmKTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNvbHVtbkFyZ3VtZW50cyBvZiBjb2x1bW5Bcmd1bWVudHNMaXN0KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5zZWxlY3QodGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cykgKyBcIiBhcyBcIiArIHRoaXMuZ2V0Q29sdW1uU2VsZWN0QWxpYXMoLi4uY29sdW1uQXJndW1lbnRzKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3QoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50c0xpc3Q6IHN0cmluZ1tdW107XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhcmd1bWVudHNbMF0gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50c0xpc3QgPSBbLi4uYXJndW1lbnRzXS5tYXAoKGNvbmNhdEtleTogc3RyaW5nKSA9PiBjb25jYXRLZXkuc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMF07XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5Bcmd1bWVudHMgb2YgY29sdW1uQXJndW1lbnRzTGlzdCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JkZXJCeSgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIub3JkZXJCeSh0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXNGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pLCBhcmd1bWVudHNbMV0pO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0TWFueShmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8KFJvdyBleHRlbmRzIE1vZGVsVHlwZSA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4gOiBSb3cpW10+IHtcbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXMsIGZsYXR0ZW5PcHRpb24pIGFzIChSb3cgZXh0ZW5kcyBNb2RlbFR5cGUgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+IDogUm93KVtdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHNlbGVjdEFsaWFzKCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50cyA9IGFyZ3VtZW50c1sxXS5zcGxpdChcIi5cIik7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KGAke3RoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpfSBhcyAke2FyZ3VtZW50c1swXX1gKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3RSYXcoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgW25hbWUsIF8sIHF1ZXJ5LCAuLi5iaW5kaW5nc10gPSBBcnJheS5mcm9tKGFyZ3VtZW50cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMua25leC5yYXcoYCgke3F1ZXJ5fSkgYXMgXCIke25hbWV9XCJgLCBiaW5kaW5ncykpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pbkNvbHVtbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbkNvbHVtbihcImlubmVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuICAgIHB1YmxpYyBsZWZ0T3V0ZXJKb2luQ29sdW1uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5qb2luQ29sdW1uKFwibGVmdE91dGVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pblRhYmxlKCkge1xuICAgICAgICBjb25zdCBuZXdQcm9wZXJ0eUtleSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgbmV3UHJvcGVydHlUeXBlID0gYXJndW1lbnRzWzFdO1xuICAgICAgICBjb25zdCBjb2x1bW4xUGFydHMgPSBhcmd1bWVudHNbMl07XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBjb2x1bW4yUGFydHMgPSBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMucHVzaCh7XG4gICAgICAgICAgICBuYW1lOiBuZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgICAgIHByb3BlcnR5VHlwZTogbmV3UHJvcGVydHlUeXBlLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkNsYXNzID0gbmV3UHJvcGVydHlUeXBlO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXMgPSBuZXdQcm9wZXJ0eUtleTtcblxuICAgICAgICBjb25zdCB0YWJsZTFDb2x1bW4gPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMVBhcnRzKTtcbiAgICAgICAgY29uc3QgdGFibGUyQ29sdW1uID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbjJQYXJ0cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luKGAke3RhYmxlVG9Kb2luTmFtZX0gYXMgJHt0YWJsZVRvSm9pbkFsaWFzfWAsIHRhYmxlMUNvbHVtbiwgb3BlcmF0b3IsIHRhYmxlMkNvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pbigpIHtcbiAgICAgICAgY29uc3QgY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPSB0aGlzLmdyYW51bGFyaXR5U2V0Lmhhcyhhcmd1bWVudHNbMl0pO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzRdIDogYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nID0gY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPyBhcmd1bWVudHNbNV0gOiBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcImlubmVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgZ3JhbnVsYXJpdHksIGpvaW5UYWJsZUNvbHVtblN0cmluZywgb3BlcmF0b3IsIGV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmcpO1xuICAgIH1cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pbigpIHtcbiAgICAgICAgY29uc3QgY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPSB0aGlzLmdyYW51bGFyaXR5U2V0Lmhhcyhhcmd1bWVudHNbMl0pO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzRdIDogYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nID0gY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPyBhcmd1bWVudHNbNV0gOiBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcImxlZnRPdXRlckpvaW5cIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0sIGdyYW51bGFyaXR5LCBqb2luVGFibGVDb2x1bW5TdHJpbmcsIG9wZXJhdG9yLCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5uZXJKb2luVGFibGVPbkZ1bmN0aW9uKCkge1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMl0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzJdIGFzIEdyYW51bGFyaXR5KSA6IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3Qgb24gPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmpvaW5UYWJsZU9uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgZ3JhbnVsYXJpdHksIG9uKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pblRhYmxlT25GdW5jdGlvbigpIHtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IG9uID0gdHlwZW9mIGFyZ3VtZW50c1syXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1szXSA6IGFyZ3VtZW50c1syXTtcblxuICAgICAgICByZXR1cm4gdGhpcy5qb2luVGFibGVPbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLmxlZnRPdXRlckpvaW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdLCBncmFudWxhcml0eSwgb24pO1xuICAgIH1cblxuICAgIHB1YmxpYyBsZWZ0T3V0ZXJKb2luVGFibGUoKSB7XG4gICAgICAgIGNvbnN0IG5ld1Byb3BlcnR5S2V5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBuZXdQcm9wZXJ0eVR5cGUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgIGNvbnN0IGNvbHVtbjFQYXJ0cyA9IGFyZ3VtZW50c1syXTtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBhcmd1bWVudHNbM107XG4gICAgICAgIGNvbnN0IGNvbHVtbjJQYXJ0cyA9IGFyZ3VtZW50c1s0XTtcblxuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IG5ld1Byb3BlcnR5S2V5LFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBuZXdQcm9wZXJ0eVR5cGUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQ2xhc3MgPSBuZXdQcm9wZXJ0eVR5cGU7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZVRvSm9pbkNsYXNzKTtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5BbGlhcyA9IG5ld1Byb3BlcnR5S2V5O1xuXG4gICAgICAgIGNvbnN0IHRhYmxlMUNvbHVtbiA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW4xUGFydHMpO1xuICAgICAgICBjb25zdCB0YWJsZTJDb2x1bW4gPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMlBhcnRzKTtcblxuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5sZWZ0T3V0ZXJKb2luKGAke3RhYmxlVG9Kb2luTmFtZX0gYXMgJHt0YWJsZVRvSm9pbkFsaWFzfWAsIHRhYmxlMUNvbHVtbiwgb3BlcmF0b3IsIHRhYmxlMkNvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlQ29sdW1uKCkge1xuICAgICAgICAvLyBUaGlzIGlzIGNhbGxlZCBmcm9tIHRoZSBzdWItcXVlcnlcbiAgICAgICAgLy8gVGhlIGZpcnN0IGNvbHVtbiBpcyBmcm9tIHRoZSBzdWItcXVlcnlcbiAgICAgICAgLy8gVGhlIHNlY29uZCBjb2x1bW4gaXMgZnJvbSB0aGUgcGFyZW50IHF1ZXJ5XG4gICAgICAgIGxldCBjb2x1bW4xTmFtZTtcbiAgICAgICAgbGV0IGNvbHVtbjJOYW1lO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICBpZiAoYXJndW1lbnRzWzBdIGluc3RhbmNlb2YgQ29sdW1uRnJvbVF1ZXJ5KSB7XG4gICAgICAgICAgICBjb2x1bW4xTmFtZSA9IChhcmd1bWVudHNbMF0gYXMgQ29sdW1uRnJvbVF1ZXJ5KS50b1N0cmluZygpO1xuICAgICAgICAgICAgY29sdW1uMk5hbWUgPSAoYXJndW1lbnRzWzJdIGFzIENvbHVtbkZyb21RdWVyeSkudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlUmF3KGAke2NvbHVtbjFOYW1lfSAke29wZXJhdG9yfSAke2NvbHVtbjJOYW1lfWApO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uMU5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uYXJndW1lbnRzWzBdLnNwbGl0KFwiLlwiKSk7XG4gICAgICAgICAgICBpZiAoIXRoaXMucGFyZW50VHlwZWRRdWVyeUJ1aWxkZXIpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BhcmVudCBxdWVyeSBidWlsZGVyIGlzIG1pc3NpbmcsIFwid2hlcmVDb2x1bW5cIiBjYW4gb25seSBiZSB1c2VkIGluIHN1Yi1xdWVyeS4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbHVtbjJOYW1lID0gdGhpcy5wYXJlbnRUeXBlZFF1ZXJ5QnVpbGRlci5nZXRDb2x1bW5OYW1lKC4uLmFyZ3VtZW50c1syXS5zcGxpdChcIi5cIikpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sdW1uMU5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4udGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oYXJndW1lbnRzWzBdKSk7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMk5hbWUgPSBhcmd1bWVudHNbMl07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGFyZ3VtZW50c1syXS5tZW1vcmllcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMk5hbWUgPSBhcmd1bWVudHNbMl0uZ2V0Q29sdW1uTmFtZTsgLy8gcGFyZW50IHRoaXMgbmVlZGVkIC4uLlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2x1bW4yTmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi50aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmd1bWVudHNbMl0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlUmF3KGA/PyAke29wZXJhdG9yfSA/P2AsIFtjb2x1bW4xTmFtZSwgY29sdW1uMk5hbWVdKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9RdWVyeSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlCdWlsZGVyLnRvUXVlcnkoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTnVsbC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3ROdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90TnVsbC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JXaGVyZU51bGwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZU51bGwuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmVOb3ROdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVOb3ROdWxsLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oZjogYW55KSB7XG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIGYuc3BsaXQoXCIuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgeyByb290LCBtZW1vcmllcyB9ID0gZ2V0UHJveHlBbmRNZW1vcmllcygpO1xuXG4gICAgICAgIGYocm9vdCk7XG5cbiAgICAgICAgcmV0dXJuIG1lbW9yaWVzO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBmaW5kQnlQcmltYXJ5S2V5KCkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBwcmltYXJ5S2V5VmFsdWUgPSBhcmd1bWVudHNbMF07XG5cbiAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50c0xpc3Q7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb25zdCBbLCAuLi5jb2x1bW5Bcmd1bWVudHNdID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzTGlzdCA9IGNvbHVtbkFyZ3VtZW50cy5tYXAoKGNvbmNhdEtleTogc3RyaW5nKSA9PiBjb25jYXRLZXkuc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5Bcmd1bWVudHMgb2YgY29sdW1uQXJndW1lbnRzTGlzdCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIud2hlcmUocHJpbWFyeUtleUNvbHVtbkluZm8ubmFtZSwgcHJpbWFyeUtleVZhbHVlKTtcblxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5QnVpbGRlci5maXJzdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlKCkge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb25jYXRLZXlDb2x1bW4odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmUuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZS5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3QoKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzBdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbmNhdEtleUNvbHVtbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjb2x1bW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmd1bWVudHNbMF0pO1xuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpLCBhcmd1bWVudHNbMV0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgYW5kV2hlcmUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIuYW5kV2hlcmUuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZS5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVJbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZUluLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZU5vdEluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90SW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuICAgIHB1YmxpYyBvcldoZXJlSW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZUluLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZU5vdEluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVOb3RJbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVCZXR3ZWVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlQmV0d2Vlbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG4gICAgcHVibGljIHdoZXJlTm90QmV0d2VlbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdEJldHdlZW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmVCZXR3ZWVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVCZXR3ZWVuLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZU5vdEJldHdlZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZU5vdEJldHdlZW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIGNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oZnVuY3Rpb25OYW1lOiBzdHJpbmcsIHR5cGVPZlN1YlF1ZXJ5OiBhbnksIGZ1bmN0aW9uVG9DYWxsOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCB0aGF0ID0gdGhpcyBhcyBhbnk7XG4gICAgICAgIGxldCBzdWJRdWVyeVByZWZpeDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBpZiAoW1wid2hlcmVFeGlzdHNcIiwgXCJvcldoZXJlRXhpc3RzXCIsIFwid2hlcmVOb3RFeGlzdHNcIiwgXCJvcldoZXJlTm90RXhpc3RzXCIsIFwiaGF2aW5nRXhpc3RzXCIsIFwiaGF2aW5nTm90RXhpc3RzXCJdLmluY2x1ZGVzKGZ1bmN0aW9uTmFtZSkpIHtcbiAgICAgICAgICAgIHN1YlF1ZXJ5UHJlZml4ID0gdGhpcy5nZXROZXh0U3ViUXVlcnlQcmVmaXgoKTtcbiAgICAgICAgfVxuICAgICAgICAoKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSlbZnVuY3Rpb25OYW1lXSBhcyAoY2FsbGJhY2s6IEtuZXguUXVlcnlDYWxsYmFjaykgPT4gS25leC5RdWVyeUJ1aWxkZXIpKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGNvbnN0IHN1YlF1ZXJ5ID0gdGhpcztcbiAgICAgICAgICAgIGNvbnN0IHsgcm9vdCwgbWVtb3JpZXMgfSA9IGdldFByb3h5QW5kTWVtb3JpZXModGhhdCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHN1YlFCID0gbmV3IFR5cGVkUXVlcnlCdWlsZGVyKHR5cGVPZlN1YlF1ZXJ5LCBncmFudWxhcml0eSwgdGhhdC5rbmV4LCBzdWJRdWVyeSwgdGhhdCwgc3ViUXVlcnlQcmVmaXgpO1xuICAgICAgICAgICAgc3ViUUIuZXh0cmFKb2luZWRQcm9wZXJ0aWVzID0gdGhhdC5leHRyYUpvaW5lZFByb3BlcnRpZXM7XG4gICAgICAgICAgICBmdW5jdGlvblRvQ2FsbChzdWJRQiwgcm9vdCwgbWVtb3JpZXMpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2VsZWN0UXVlcnkoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgbmFtZSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMl07XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGFyZ3VtZW50c1s0XTtcblxuICAgICAgICBjb25zdCB7IHJvb3QsIG1lbW9yaWVzIH0gPSBnZXRQcm94eUFuZE1lbW9yaWVzKHRoaXMgYXMgYW55KTtcblxuICAgICAgICBjb25zdCBzdWJRdWVyeUJ1aWxkZXIgPSBuZXcgVHlwZWRRdWVyeUJ1aWxkZXIodHlwZU9mU3ViUXVlcnksIGdyYW51bGFyaXR5LCB0aGlzLmtuZXgsIHVuZGVmaW5lZCwgdGhpcyk7XG4gICAgICAgIGZ1bmN0aW9uVG9DYWxsKHN1YlF1ZXJ5QnVpbGRlciwgcm9vdCwgbWVtb3JpZXMpO1xuXG4gICAgICAgICh0aGlzLnNlbGVjdFJhdyBhcyBhbnkpKG5hbWUsIHVuZGVmaW5lZCwgc3ViUXVlcnlCdWlsZGVyLnRvUXVlcnkoKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyB3aGVyZVBhcmVudGhlc2VzKCkge1xuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJ3aGVyZVwiLCB0aGlzLnRhYmxlQ2xhc3MsIGFyZ3VtZW50c1swXSwgdW5kZWZpbmVkKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVQYXJlbnRoZXNlcygpIHtcbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwib3JXaGVyZVwiLCB0aGlzLnRhYmxlQ2xhc3MsIGFyZ3VtZW50c1swXSwgdW5kZWZpbmVkKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIndoZXJlRXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZUV4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwib3JXaGVyZUV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3RFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIndoZXJlTm90RXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZU5vdEV4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwib3JXaGVyZU5vdEV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZVJhdyhzcWwsIGJpbmRpbmdzKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZygpIHtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBhcmd1bWVudHNbMV07XG4gICAgICAgIGNvbnN0IHZhbHVlID0gYXJndW1lbnRzWzJdO1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5oYXZpbmcodGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgb3BlcmF0b3IsIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ0luKCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGFyZ3VtZW50c1sxXTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaGF2aW5nSW4odGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTm90SW4oKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gYXJndW1lbnRzWzFdO1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5oYXZpbmdOb3RJbih0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdOdWxsKCkge1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5oYXZpbmdOdWxsKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTm90TnVsbCgpIHtcbiAgICAgICAgKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSkuaGF2aW5nTm90TnVsbCh0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ0V4aXN0cygpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwiaGF2aW5nRXhpc3RzXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdOb3RFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcImhhdmluZ05vdEV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nUmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaGF2aW5nUmF3KHNxbCwgYmluZGluZ3MpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nQmV0d2VlbigpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmhhdmluZ0JldHdlZW4odGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTm90QmV0d2VlbigpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmhhdmluZ05vdEJldHdlZW4odGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JkZXJCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLm9yZGVyQnlSYXcoc3FsLCBiaW5kaW5ncyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB1bmlvbigpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwidW5pb25cIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHVuaW9uQWxsKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJ1bmlvbkFsbFwiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgcmV0dXJuaW5nQ29sdW1uKCkge1xuICAgICAgICB0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcigpO1xuICAgIH1cblxuICAgIHB1YmxpYyByZXR1cm5pbmdDb2x1bW5zKCkge1xuICAgICAgICB0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcigpO1xuICAgIH1cblxuICAgIHB1YmxpYyB0cmFuc2FjdGluZyh0cng6IEtuZXguVHJhbnNhY3Rpb24pIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIudHJhbnNhY3RpbmcodHJ4KTtcblxuICAgICAgICB0aGlzLnRyYW5zYWN0aW9uID0gdHJ4O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBtaW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwibWluXCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgY291bnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwiY291bnRcIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBjb3VudERpc3RpbmN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcImNvdW50RGlzdGluY3RcIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBtYXgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZ1bmN0aW9uV2l0aEFsaWFzKFwibWF4XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3VtKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcInN1bVwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIHN1bURpc3RpbmN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcInN1bURpc3RpbmN0XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXZnKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcImF2Z1wiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGF2Z0Rpc3RpbmN0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcImF2Z0Rpc3RpbmN0XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5jcmVtZW50KCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV07XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmluY3JlbWVudCh0aGlzLmdldENvbHVtbk5hbWVGcm9tQXJndW1lbnRzSWdub3JpbmdMYXN0UGFyYW1ldGVyKC4uLmFyZ3VtZW50cyksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIHB1YmxpYyBkZWNyZW1lbnQoKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gYXJndW1lbnRzW2FyZ3VtZW50cy5sZW5ndGggLSAxXTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZGVjcmVtZW50KHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21Bcmd1bWVudHNJZ25vcmluZ0xhc3RQYXJhbWV0ZXIoLi4uYXJndW1lbnRzKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdHJ1bmNhdGUoKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyLnRydW5jYXRlKCk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGluc2VydFNlbGVjdCgpIHtcbiAgICAgICAgY29uc3QgdGFibGVOYW1lID0gZ2V0VGFibGVOYW1lKGFyZ3VtZW50c1swXSk7XG5cbiAgICAgICAgY29uc3QgdHlwZWRRdWVyeUJ1aWxkZXJGb3JJbnNlcnQgPSBuZXcgVHlwZWRRdWVyeUJ1aWxkZXI8YW55LCBhbnk+KGFyZ3VtZW50c1swXSwgdW5kZWZpbmVkLCB0aGlzLmtuZXgpO1xuICAgICAgICBsZXQgY29sdW1uQXJndW1lbnRzTGlzdDtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbnN0IFssIC4uLmNvbHVtbkFyZ3VtZW50c10gPSBhcmd1bWVudHM7XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gY29sdW1uQXJndW1lbnRzLm1hcCgoY29uY2F0S2V5OiBzdHJpbmcpID0+IGNvbmNhdEtleS5zcGxpdChcIi5cIikpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgZiA9IGFyZ3VtZW50c1sxXTtcbiAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50c0xpc3QgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbjMoZik7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpbnNlcnRDb2x1bW5zID0gY29sdW1uQXJndW1lbnRzTGlzdC5tYXAoKGkpID0+IHR5cGVkUXVlcnlCdWlsZGVyRm9ySW5zZXJ0LmdldENvbHVtbk5hbWUoLi4uaSkpO1xuXG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9rbmV4L2tuZXgvaXNzdWVzLzEwNTZcbiAgICAgICAgY29uc3QgcWIgPSB0aGlzLmtuZXguZnJvbSh0aGlzLmtuZXgucmF3KGA/PyAoJHtpbnNlcnRDb2x1bW5zLm1hcCgoKSA9PiBcIj8/XCIpLmpvaW4oXCIsXCIpfSlgLCBbdGFibGVOYW1lLCAuLi5pbnNlcnRDb2x1bW5zXSkpLmluc2VydCh0aGlzLmtuZXgucmF3KHRoaXMudG9RdWVyeSgpKSk7XG5cbiAgICAgICAgY29uc3QgZmluYWxRdWVyeSA9IHFiLnRvU3RyaW5nKCk7XG4gICAgICAgIHRoaXMudG9RdWVyeSA9ICgpID0+IGZpbmFsUXVlcnk7XG5cbiAgICAgICAgYXdhaXQgcWI7XG4gICAgfVxuXG4gICAgcHVibGljIGNsZWFyU2VsZWN0KCkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5jbGVhclNlbGVjdCgpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuICAgIHB1YmxpYyBjbGVhcldoZXJlKCkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5jbGVhcldoZXJlKCk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG4gICAgcHVibGljIGNsZWFyT3JkZXIoKSB7XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmNsZWFyT3JkZXIoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBkaXN0aW5jdCgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZGlzdGluY3QoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBjbG9uZSgpIHtcbiAgICAgICAgY29uc3QgcXVlcnlCdWlsZGVyQ2xvbmUgPSB0aGlzLnF1ZXJ5QnVpbGRlci5jbG9uZSgpO1xuXG4gICAgICAgIGNvbnN0IHR5cGVkUXVlcnlCdWlsZGVyQ2xvbmUgPSBuZXcgVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBSb3c+KHRoaXMudGFibGVDbGFzcywgdGhpcy5ncmFudWxhcml0eSwgdGhpcy5rbmV4LCBxdWVyeUJ1aWxkZXJDbG9uZSk7XG5cbiAgICAgICAgcmV0dXJuIHR5cGVkUXVlcnlCdWlsZGVyQ2xvbmUgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBncm91cEJ5KCkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5ncm91cEJ5KHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSkpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZ3JvdXBCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmdyb3VwQnlSYXcoc3FsLCBiaW5kaW5ncyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB1c2VLbmV4UXVlcnlCdWlsZGVyKGY6IChxdWVyeTogS25leC5RdWVyeUJ1aWxkZXIpID0+IHZvaWQpIHtcbiAgICAgICAgZih0aGlzLnF1ZXJ5QnVpbGRlcik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRLbmV4UXVlcnlCdWlsZGVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgfVxuXG4gICAgcHVibGljIGdldENvbHVtbk5hbWUoLi4ua2V5czogc3RyaW5nW10pOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBmaXJzdFBhcnROYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKGtleXNbMF0pO1xuXG4gICAgICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGZpcnN0UGFydE5hbWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgY29sdW1uTmFtZSA9IFwiXCI7XG4gICAgICAgICAgICBsZXQgY29sdW1uQWxpYXM7XG4gICAgICAgICAgICBsZXQgY3VycmVudENsYXNzO1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDb2x1bW5QYXJ0O1xuICAgICAgICAgICAgY29uc3QgcHJlZml4ID0ga2V5cy5zbGljZSgwLCAtMSkuam9pbihcIi5cIik7XG4gICAgICAgICAgICBjb25zdCBleHRyYUpvaW5lZFByb3BlcnR5ID0gdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMuZmluZCgoaSkgPT4gaS5uYW1lID09PSBwcmVmaXgpO1xuICAgICAgICAgICAgaWYgKGV4dHJhSm9pbmVkUHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyA9IGV4dHJhSm9pbmVkUHJvcGVydHkubmFtZTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2xhc3MgPSBleHRyYUpvaW5lZFByb3BlcnR5LnByb3BlcnR5VHlwZTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKGN1cnJlbnRDbGFzcywga2V5c1trZXlzLmxlbmd0aCAtIDFdKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5OYW1lID0ga2V5cy5zbGljZSgwLCAtMSkuam9pbihcIl9cIikgKyBcIi5cIiArIGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBrZXlzWzBdKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKGN1cnJlbnRDbGFzcywga2V5c1tpXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29sdW1uTmFtZSA9IGNvbHVtbkFsaWFzICsgXCIuXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uQWxpYXMgKz0gXCJfXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudENsYXNzID0gY3VycmVudENvbHVtblBhcnQuY29sdW1uQ2xhc3M7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gYCR7dGhpcy5zdWJRdWVyeVByZWZpeCA/PyBcIlwifSR7Y29sdW1uTmFtZX1gO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGdldENvbHVtbk5hbWVXaXRoRGlmZmVyZW50Um9vdChfcm9vdEtleTogc3RyaW5nLCAuLi5rZXlzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGZpcnN0UGFydE5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXMoa2V5c1swXSk7XG5cbiAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gZmlyc3RQYXJ0TmFtZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKHRoaXMudGFibGVDbGFzcywga2V5c1swXSk7XG5cbiAgICAgICAgICAgIGxldCBjb2x1bW5OYW1lID0gXCJcIjtcbiAgICAgICAgICAgIGxldCBjb2x1bW5BbGlhcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihjdXJyZW50Q2xhc3MsIGtleXNbaV0pO1xuXG4gICAgICAgICAgICAgICAgY29sdW1uTmFtZSA9IGNvbHVtbkFsaWFzICsgXCIuXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyArPSBcIl9cIiArIChrZXlzLmxlbmd0aCAtIDEgPT09IGkgPyBjdXJyZW50Q29sdW1uUGFydC5uYW1lIDogY3VycmVudENvbHVtblBhcnQucHJvcGVydHlLZXkpO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvbHVtbk5hbWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGZ1bmN0aW9uV2l0aEFsaWFzKGtuZXhGdW5jdGlvbk5hbWU6IHN0cmluZywgZjogYW55LCBhbGlhc05hbWU6IHN0cmluZykge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpW2tuZXhGdW5jdGlvbk5hbWVdKGAke3RoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhc0Zyb21GdW5jdGlvbk9yU3RyaW5nKGYpfSBhcyAke2FsaWFzTmFtZX1gKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGY6IGFueSkge1xuICAgICAgICBsZXQgY29sdW1uUGFydHM7XG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uUGFydHMgPSBmLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbHVtblBhcnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oZik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtblBhcnRzKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtbk5hbWVXaXRob3V0QWxpYXNGcm9tRnVuY3Rpb25PclN0cmluZyhmOiBhbnkpIHtcbiAgICAgICAgbGV0IGNvbHVtblBhcnRzO1xuICAgICAgICBpZiAodHlwZW9mIGYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtblBhcnRzID0gZi5zcGxpdChcIi5cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2x1bW5QYXJ0cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyguLi5jb2x1bW5QYXJ0cyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBqb2luQ29sdW1uKGpvaW5UeXBlOiBcImlubmVySm9pblwiIHwgXCJsZWZ0T3V0ZXJKb2luXCIsIGY6IGFueSwgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5IHwgdW5kZWZpbmVkKSB7XG4gICAgICAgIGxldCBjb2x1bW5Ub0pvaW5Bcmd1bWVudHM6IHN0cmluZ1tdO1xuXG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uVG9Kb2luQXJndW1lbnRzID0gZi5zcGxpdChcIi5cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2x1bW5Ub0pvaW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihmKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbHVtblRvSm9pbk5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uVG9Kb2luQXJndW1lbnRzKTtcblxuICAgICAgICBsZXQgc2Vjb25kQ29sdW1uTmFtZSA9IGNvbHVtblRvSm9pbkFyZ3VtZW50c1swXTtcbiAgICAgICAgbGV0IHNlY29uZENvbHVtbkFsaWFzID0gY29sdW1uVG9Kb2luQXJndW1lbnRzWzBdO1xuICAgICAgICBsZXQgc2Vjb25kQ29sdW1uQ2xhc3MgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIHNlY29uZENvbHVtbk5hbWUpLmNvbHVtbkNsYXNzO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgY29sdW1uVG9Kb2luQXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBiZWZvcmVTZWNvbmRDb2x1bW5BbGlhcyA9IHNlY29uZENvbHVtbkFsaWFzO1xuICAgICAgICAgICAgY29uc3QgYmVmb3JlU2Vjb25kQ29sdW1uQ2xhc3MgPSBzZWNvbmRDb2x1bW5DbGFzcztcblxuICAgICAgICAgICAgY29uc3QgY29sdW1uSW5mbyA9IGdldENvbHVtbkluZm9ybWF0aW9uKGJlZm9yZVNlY29uZENvbHVtbkNsYXNzLCBjb2x1bW5Ub0pvaW5Bcmd1bWVudHNbaV0pO1xuICAgICAgICAgICAgc2Vjb25kQ29sdW1uTmFtZSA9IGNvbHVtbkluZm8ubmFtZTtcbiAgICAgICAgICAgIHNlY29uZENvbHVtbkFsaWFzID0gYmVmb3JlU2Vjb25kQ29sdW1uQWxpYXMgKyBcIl9cIiArIGNvbHVtbkluZm8ucHJvcGVydHlLZXk7XG4gICAgICAgICAgICBzZWNvbmRDb2x1bW5DbGFzcyA9IGNvbHVtbkluZm8uY29sdW1uQ2xhc3M7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUoc2Vjb25kQ29sdW1uQ2xhc3MpO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkFsaWFzID0gYCR7dGhpcy5zdWJRdWVyeVByZWZpeCA/PyBcIlwifSR7c2Vjb25kQ29sdW1uQWxpYXN9YDtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5Kb2luQ29sdW1uTmFtZSA9IGAke3RhYmxlVG9Kb2luQWxpYXN9LiR7Z2V0UHJpbWFyeUtleUNvbHVtbihzZWNvbmRDb2x1bW5DbGFzcykubmFtZX1gO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcblxuICAgICAgICBjb25zdCB0YWJsZU5hbWVSYXcgPSB0aGlzLmtuZXgucmF3KGA/PyBhcyA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGFibGVUb0pvaW5OYW1lLCB0YWJsZVRvSm9pbkFsaWFzXSk7XG4gICAgICAgIGlmIChqb2luVHlwZSA9PT0gXCJpbm5lckpvaW5cIikge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luKHRhYmxlTmFtZVJhdywgdGFibGVUb0pvaW5Kb2luQ29sdW1uTmFtZSwgY29sdW1uVG9Kb2luTmFtZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoam9pblR5cGUgPT09IFwibGVmdE91dGVySm9pblwiKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5sZWZ0T3V0ZXJKb2luKHRhYmxlTmFtZVJhdywgdGFibGVUb0pvaW5Kb2luQ29sdW1uTmFtZSwgY29sdW1uVG9Kb2luTmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtbk5hbWVGcm9tQXJndW1lbnRzSWdub3JpbmdMYXN0UGFyYW1ldGVyKC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgYXJndW1lbnRzRXhjZXB0TGFzdCA9IGtleXMuc2xpY2UoMCwgLTEpO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmFyZ3VtZW50c0V4Y2VwdExhc3QpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyguLi5rZXlzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGV4dHJhSm9pbmVkUHJvcGVydHkgPSB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5maW5kKChpKSA9PiBpLm5hbWUgPT09IGtleXNbMF0pO1xuICAgICAgICBpZiAoZXh0cmFKb2luZWRQcm9wZXJ0eSkge1xuICAgICAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGV4dHJhSm9pbmVkUHJvcGVydHkubmFtZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihleHRyYUpvaW5lZFByb3BlcnR5LnByb3BlcnR5VHlwZSwga2V5c1sxXSk7XG4gICAgICAgICAgICByZXR1cm4gZXh0cmFKb2luZWRQcm9wZXJ0eS5uYW1lICsgXCIuXCIgKyBjb2x1bW5JbmZvLm5hbWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoa2V5cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIGtleXNbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn0ke3RoaXMudGFibGVOYW1lfS4ke2NvbHVtbkluZm8ubmFtZX1gO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBrZXlzWzBdKTtcblxuICAgICAgICAgICAgbGV0IHJlc3VsdCA9IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKGN1cnJlbnRDbGFzcywga2V5c1tpXSk7XG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IFwiLlwiICsgKGtleXMubGVuZ3RoIC0gMSA9PT0gaSA/IGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWUgOiBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleSk7XG4gICAgICAgICAgICAgICAgY3VycmVudENsYXNzID0gY3VycmVudENvbHVtblBhcnQuY29sdW1uQ2xhc3M7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtblNlbGVjdEFsaWFzKC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4ga2V5c1swXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBjb2x1bW5BbGlhcyA9IGtleXNbMF07XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyArPSBcIi5cIiArIGtleXNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY29sdW1uQWxpYXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGZsYXR0ZW5CeU9wdGlvbihvOiBhbnksIGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKSB7XG4gICAgICAgIGlmIChmbGF0dGVuT3B0aW9uID09PSBGbGF0dGVuT3B0aW9uLm5vRmxhdHRlbiB8fCB0aGlzLnNob3VsZFVuZmxhdHRlbiA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHJldHVybiBvO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVuZmxhdHRlbmVkID0gdW5mbGF0dGVuKG8pO1xuICAgICAgICBpZiAoZmxhdHRlbk9wdGlvbiA9PT0gdW5kZWZpbmVkIHx8IGZsYXR0ZW5PcHRpb24gPT09IEZsYXR0ZW5PcHRpb24uZmxhdHRlbikge1xuICAgICAgICAgICAgcmV0dXJuIHVuZmxhdHRlbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZXRUb051bGwodW5mbGF0dGVuZWQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgam9pblRhYmxlT25GdW5jdGlvbihxdWVyeUJ1aWxkZXJKb2luOiBLbmV4LkpvaW4sIG5ld1Byb3BlcnR5S2V5OiBhbnksIG5ld1Byb3BlcnR5VHlwZTogYW55LCBncmFudWxhcml0eTogR3JhbnVsYXJpdHkgfCB1bmRlZmluZWQsIG9uRnVuY3Rpb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxhbnksIGFueT4pID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMucHVzaCh7XG4gICAgICAgICAgICBuYW1lOiBuZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgICAgIHByb3BlcnR5VHlwZTogbmV3UHJvcGVydHlUeXBlLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkNsYXNzID0gbmV3UHJvcGVydHlUeXBlO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXMgPSBuZXdQcm9wZXJ0eUtleTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHlRdWVyeSA9ICFncmFudWxhcml0eSA/IFwiXCIgOiBgIFdJVEggKCR7Z3JhbnVsYXJpdHl9KWA7XG5cbiAgICAgICAgbGV0IGtuZXhPbk9iamVjdDogYW55O1xuICAgICAgICBjb25zdCB0YWJsZU5hbWVSYXcgPSB0aGlzLmtuZXgucmF3KGA/PyBhcyA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGFibGVUb0pvaW5OYW1lLCB0YWJsZVRvSm9pbkFsaWFzXSk7XG4gICAgICAgIHF1ZXJ5QnVpbGRlckpvaW4odGFibGVOYW1lUmF3LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBrbmV4T25PYmplY3QgPSB0aGlzO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBvbldpdGhKb2luZWRDb2x1bW5PcGVyYXRvckNvbHVtbiA9IChqb2luZWRDb2x1bW46IGFueSwgb3BlcmF0b3I6IGFueSwgbW9kZWxDb2x1bW46IGFueSwgZnVuY3Rpb25OYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGxldCBjb2x1bW4xQXJndW1lbnRzO1xuXG4gICAgICAgICAgICBpZiAodHlwZW9mIG1vZGVsQ29sdW1uID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMUFyZ3VtZW50cyA9IG1vZGVsQ29sdW1uLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMUFyZ3VtZW50cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKG1vZGVsQ29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbjJOYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKG5ld1Byb3BlcnR5S2V5LCBqb2luZWRDb2x1bW4pO1xuXG4gICAgICAgICAgICBrbmV4T25PYmplY3RbZnVuY3Rpb25OYW1lXSh0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMUFyZ3VtZW50cyksIG9wZXJhdG9yLCBjb2x1bW4yTmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgb25XaXRoQ29sdW1uT3BlcmF0b3JWYWx1ZSA9IChqb2luZWRDb2x1bW46IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSwgZnVuY3Rpb25OYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbjJOYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKG5ld1Byb3BlcnR5S2V5LCBqb2luZWRDb2x1bW4pO1xuICAgICAgICAgICAga25leE9uT2JqZWN0W2Z1bmN0aW9uTmFtZV0oY29sdW1uMk5hbWUsIG9wZXJhdG9yLCB2YWx1ZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgb25PYmplY3QgPSB7XG4gICAgICAgICAgICBvbkNvbHVtbnM6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIGNvbHVtbjI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aEpvaW5lZENvbHVtbk9wZXJhdG9yQ29sdW1uKGNvbHVtbjIsIG9wZXJhdG9yLCBjb2x1bW4xLCBcIm9uXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbjogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgY29sdW1uMjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4oY29sdW1uMSwgb3BlcmF0b3IsIGNvbHVtbjIsIFwib25cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFuZE9uOiAoY29sdW1uMTogYW55LCBvcGVyYXRvcjogYW55LCBjb2x1bW4yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhKb2luZWRDb2x1bW5PcGVyYXRvckNvbHVtbihjb2x1bW4xLCBvcGVyYXRvciwgY29sdW1uMiwgXCJhbmRPblwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPbjogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgY29sdW1uMjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4oY29sdW1uMSwgb3BlcmF0b3IsIGNvbHVtbjIsIFwib3JPblwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25WYWw6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhDb2x1bW5PcGVyYXRvclZhbHVlKGNvbHVtbjEsIG9wZXJhdG9yLCB2YWx1ZSwgXCJvblZhbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYW5kT25WYWw6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhDb2x1bW5PcGVyYXRvclZhbHVlKGNvbHVtbjEsIG9wZXJhdG9yLCB2YWx1ZSwgXCJhbmRPblZhbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblZhbDogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aENvbHVtbk9wZXJhdG9yVmFsdWUoY29sdW1uMSwgb3BlcmF0b3IsIHZhbHVlLCBcIm9yT25WYWxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uTnVsbDogKGY6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbHVtbjJBcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihmKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2x1bW4yQXJndW1lbnRzV2l0aEpvaW5lZFRhYmxlID0gW3RhYmxlVG9Kb2luQWxpYXMsIC4uLmNvbHVtbjJBcmd1bWVudHNdO1xuXG4gICAgICAgICAgICAgICAga25leE9uT2JqZWN0Lm9uTnVsbChjb2x1bW4yQXJndW1lbnRzV2l0aEpvaW5lZFRhYmxlLmpvaW4oXCIuXCIpKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9IGFzIGFueTtcblxuICAgICAgICBvbkZ1bmN0aW9uKG9uT2JqZWN0IGFzIGFueSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHByaXZhdGUgY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbihrbmV4RnVuY3Rpb246IGFueSwgLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmdzWzBdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbmNhdEtleUNvbHVtbihrbmV4RnVuY3Rpb24sIC4uLmFyZ3MpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGFyZ3NbMF0pO1xuXG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgICAga25leEZ1bmN0aW9uKHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpLCBhcmdzWzFdLCBhcmdzWzJdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbih0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSwgYXJnc1sxXSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGNhbGxLbmV4RnVuY3Rpb25XaXRoQ29uY2F0S2V5Q29sdW1uKGtuZXhGdW5jdGlvbjogYW55LCAuLi5hcmdzOiBhbnlbXSkge1xuICAgICAgICBjb25zdCBjb2x1bW5OYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmFyZ3NbMF0uc3BsaXQoXCIuXCIpKTtcblxuICAgICAgICBpZiAoYXJncy5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbihjb2x1bW5OYW1lLCBhcmdzWzFdLCBhcmdzWzJdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbihjb2x1bW5OYW1lLCBhcmdzWzFdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VsZWN0QWxsTW9kZWxQcm9wZXJ0aWVzKCkge1xuICAgICAgICBjb25zdCBwcm9wZXJ0aWVzID0gZ2V0Q29sdW1uUHJvcGVydGllcyh0aGlzLnRhYmxlQ2xhc3MpO1xuICAgICAgICBmb3IgKGNvbnN0IHByb3BlcnR5IG9mIHByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnNlbGVjdChgJHtwcm9wZXJ0eS5uYW1lfSBhcyAke3Byb3BlcnR5LnByb3BlcnR5S2V5fWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBqb2luKGpvaW5GdW5jdGlvbk5hbWU6IHN0cmluZywgdGFibGVUb0pvaW5BbGlhczogYW55LCB0YWJsZVRvSm9pbkNsYXNzOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCwgam9pblRhYmxlQ29sdW1uU3RyaW5nOiBhbnksIG9wZXJhdG9yOiBhbnksIGV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmc6IGFueSkge1xuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IHRhYmxlVG9Kb2luQWxpYXMsXG4gICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHRhYmxlVG9Kb2luQ2xhc3MsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXNXaXRoVW5kZXJzY29yZXMgPSB0YWJsZVRvSm9pbkFsaWFzLnNwbGl0KFwiLlwiKS5qb2luKFwiX1wiKTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG5cbiAgICAgICAgY29uc3Qgam9pblRhYmxlQ29sdW1uSW5mb3JtYXRpb24gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0YWJsZVRvSm9pbkNsYXNzLCBqb2luVGFibGVDb2x1bW5TdHJpbmcpO1xuXG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtbkFyZ3VtZW50cyA9IGAke3RhYmxlVG9Kb2luQWxpYXNXaXRoVW5kZXJzY29yZXN9LiR7am9pblRhYmxlQ29sdW1uSW5mb3JtYXRpb24ubmFtZX1gO1xuXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nVGFibGVDb2x1bW5OYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmcuc3BsaXQoXCIuXCIpKTtcblxuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcbiAgICAgICAgY29uc3QgdGFibGVOYW1lUmF3ID0gdGhpcy5rbmV4LnJhdyhgPz8gYXMgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RhYmxlVG9Kb2luTmFtZSwgdGFibGVUb0pvaW5BbGlhc1dpdGhVbmRlcnNjb3Jlc10pO1xuXG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpW2pvaW5GdW5jdGlvbk5hbWVdKHRhYmxlTmFtZVJhdywgam9pblRhYmxlQ29sdW1uQXJndW1lbnRzLCBvcGVyYXRvciwgZXhpc3RpbmdUYWJsZUNvbHVtbk5hbWUpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbWFwUHJvcGVydHlOYW1lVG9Db2x1bW5OYW1lKHByb3BlcnR5TmFtZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIHByb3BlcnR5TmFtZSk7XG4gICAgICAgIHJldHVybiBjb2x1bW5JbmZvLm5hbWU7XG4gICAgfVxuICAgIHB1YmxpYyBtYXBDb2x1bW5OYW1lVG9Qcm9wZXJ0eU5hbWUoY29sdW1uTmFtZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtblByb3BlcnRpZXMgPSBnZXRDb2x1bW5Qcm9wZXJ0aWVzKHRoaXMudGFibGVDbGFzcyk7XG4gICAgICAgIGNvbnN0IGNvbHVtblByb3BlcnR5ID0gY29sdW1uUHJvcGVydGllcy5maW5kKChpKSA9PiBpLm5hbWUgPT09IGNvbHVtbk5hbWUpO1xuICAgICAgICBpZiAoY29sdW1uUHJvcGVydHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZmluZCBjb2x1bW4gd2l0aCBuYW1lIFwiJHtjb2x1bW5OYW1lfVwiYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbHVtblByb3BlcnR5LnByb3BlcnR5S2V5O1xuICAgIH1cblxuICAgIHB1YmxpYyBtYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW06IGFueSkge1xuICAgICAgICBjb25zdCBjb2x1bW5OYW1lcyA9IE9iamVjdC5rZXlzKGl0ZW0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lID0gdGhpcy5tYXBDb2x1bW5OYW1lVG9Qcm9wZXJ0eU5hbWUoY29sdW1uTmFtZSk7XG5cbiAgICAgICAgICAgIGlmIChjb2x1bW5OYW1lICE9PSBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoaXRlbSwgcHJvcGVydHlOYW1lLCBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGl0ZW0sIGNvbHVtbk5hbWUpISk7XG4gICAgICAgICAgICAgICAgZGVsZXRlIGl0ZW1bY29sdW1uTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgbWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtOiBhbnkpIHtcbiAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lcyA9IE9iamVjdC5rZXlzKGl0ZW0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgcHJvcGVydHlOYW1lIG9mIHByb3BlcnR5TmFtZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbk5hbWUgPSB0aGlzLm1hcFByb3BlcnR5TmFtZVRvQ29sdW1uTmFtZShwcm9wZXJ0eU5hbWUpO1xuXG4gICAgICAgICAgICBpZiAoY29sdW1uTmFtZSAhPT0gcHJvcGVydHlOYW1lKSB7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGl0ZW0sIGNvbHVtbk5hbWUsIE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoaXRlbSwgcHJvcGVydHlOYW1lKSEpO1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBpdGVtW3Byb3BlcnR5TmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=
