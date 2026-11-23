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
    coalesce() {
        this.hasSelectClause = true;
        const [alias, ...keys] = Array.from(arguments);
        const columnNames = keys.map((key) => this.getColumnName(...key.split(".")));
        const placeholders = columnNames.map(() => "??").join(", ");
        // The object alias form is used on purpose: a `??` binding would split a dotted alias into separate identifiers.
        this.queryBuilder.select({ [alias]: this.knex.raw(`coalesce(${placeholders})`, columnNames) });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZWRLbmV4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3R5cGVkS25leC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSx5REFBNkM7QUFDN0MsNkNBQWtKO0FBUWxKLDJDQUFrRTtBQUVsRSxNQUFhLFNBQVM7SUFDbEIsWUFBb0IsSUFBVTtRQUFWLFNBQUksR0FBSixJQUFJLENBQU07SUFBRyxDQUFDO0lBRTNCLEtBQUssQ0FBSSxVQUF1QixFQUFFLFdBQXlCO1FBQzlELE1BQU0sZ0JBQWdCLEdBQUcsV0FBVyxhQUFYLFdBQVcsY0FBWCxXQUFXLEdBQUksSUFBQSw2QkFBZ0IsRUFBQyxVQUFVLENBQUMsQ0FBQyxXQUFXLENBQUM7UUFDakYsT0FBTyxJQUFJLGlCQUFpQixDQUFVLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbkYsQ0FBQztJQUVNLElBQUksQ0FBVSxhQUEwQixFQUFFLFFBQWlGO1FBQzlILE1BQU0sS0FBSyxHQUFHLElBQUEseUJBQVksRUFBQyxhQUFhLENBQUMsQ0FBQztRQUMxQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLHdCQUF3QixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLE9BQU8sSUFBSSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFTSxnQkFBZ0I7UUFDbkIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzNCLElBQUksQ0FBQyxJQUFJO2lCQUNKLFdBQVcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNq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QyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDbkQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQy9CLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLGFBQUgsR0FBRyx1QkFBSCxHQUFHLENBQUUsVUFBVSxDQUFDLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFO2dCQUM3RSxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO2FBQ3ZDO1lBRUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ2xFLElBQUksVUFBVSxLQUFLLFlBQVksRUFBRTtnQkFDN0IsTUFBTSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsWUFBWSxDQUFFLENBQUMsQ0FBQztnQkFDOUYsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7YUFDN0I7U0FDSjtJQUNMLENBQUM7Q0FDSjtBQTNoREQsOENBMmhEQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIGVzbGludC1kaXNhYmxlIHByZWZlci1yZXN0LXBhcmFtcywgbm8tdW51c2VkLXZhcnMgKi9cbmltcG9ydCB7IEtuZXggfSBmcm9tIFwia25leFwiO1xuaW1wb3J0IHsgVGVtcG9yYWwgfSBmcm9tIFwidGVtcG9yYWwtcG9seWZpbGxcIjtcbmltcG9ydCB7IGdldENvbHVtbkluZm9ybWF0aW9uLCBnZXRDb2x1bW5Qcm9wZXJ0aWVzLCBnZXRQcmltYXJ5S2V5Q29sdW1uLCBnZXRUYWJsZU1ldGFkYXRhLCBnZXRUYWJsZU5hbWUsIFRlbXBvcmFsQ29sdW1uVHlwZSB9IGZyb20gXCIuL2RlY29yYXRvcnNcIjtcbmltcG9ydCB7IE5lc3RlZEZvcmVpZ25LZXlLZXlzT2YsIE5lc3RlZEtleXNPZiB9IGZyb20gXCIuL05lc3RlZEtleXNPZlwiO1xuaW1wb3J0IHsgTmVzdGVkUmVjb3JkIH0gZnJvbSBcIi4vTmVzdGVkUmVjb3JkXCI7XG5pbXBvcnQgeyBOb25Gb3JlaWduS2V5T2JqZWN0cyB9IGZyb20gXCIuL05vbkZvcmVpZ25LZXlPYmplY3RzXCI7XG5pbXBvcnQgeyBOb25OdWxsYWJsZVJlY3Vyc2l2ZSB9IGZyb20gXCIuL05vbk51bGxhYmxlUmVjdXJzaXZlXCI7XG5pbXBvcnQgeyBQYXJ0aWFsQW5kVW5kZWZpbmVkIH0gZnJvbSBcIi4vUGFydGlhbEFuZFVuZGVmaW5lZFwiO1xuaW1wb3J0IHsgR2V0TmVzdGVkUHJvcGVydHksIEdldE5lc3RlZFByb3BlcnR5VHlwZSB9IGZyb20gXCIuL1Byb3BlcnR5VHlwZXNcIjtcbmltcG9ydCB7IFNlbGVjdGFibGVDb2x1bW5UeXBlcyB9IGZyb20gXCIuL1NlbGVjdGFibGVDb2x1bW5UeXBlc1wiO1xuaW1wb3J0IHsgRmxhdHRlbk9wdGlvbiwgc2V0VG9OdWxsLCB1bmZsYXR0ZW4gfSBmcm9tIFwiLi91bmZsYXR0ZW5cIjtcblxuZXhwb3J0IGNsYXNzIFR5cGVkS25leCB7XG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBrbmV4OiBLbmV4KSB7fVxuXG4gICAgcHVibGljIHF1ZXJ5PFQ+KHRhYmxlQ2xhc3M6IG5ldyAoKSA9PiBULCBncmFudWxhcml0eT86IEdyYW51bGFyaXR5KTogSVR5cGVkUXVlcnlCdWlsZGVyPFQsIFQsIFQ+IHtcbiAgICAgICAgY29uc3QgcXVlcnlHcmFudWxhcml0eSA9IGdyYW51bGFyaXR5ID8/IGdldFRhYmxlTWV0YWRhdGEodGFibGVDbGFzcykuZGVmYXVsdExvY2s7XG4gICAgICAgIHJldHVybiBuZXcgVHlwZWRRdWVyeUJ1aWxkZXI8VCwgVCwgVD4odGFibGVDbGFzcywgcXVlcnlHcmFudWxhcml0eSwgdGhpcy5rbmV4KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2l0aDxULCBVLCBWPihjdGVUYWJsZUNsYXNzOiBuZXcgKCkgPT4gVCwgY3RlUXVlcnk6IChxdWVyeUJ1aWxkZXI6IFR5cGVkS25leENURVF1ZXJ5QnVpbGRlcikgPT4gSVR5cGVkUXVlcnlCdWlsZGVyPFUsIFYsIFQ+KTogVHlwZWRLbmV4UXVlcnlCdWlsZGVyIHtcbiAgICAgICAgY29uc3QgYWxpYXMgPSBnZXRUYWJsZU5hbWUoY3RlVGFibGVDbGFzcyk7XG4gICAgICAgIGNvbnN0IHFiID0gdGhpcy5rbmV4LndpdGgoYWxpYXMsICh3KSA9PiBjdGVRdWVyeShuZXcgVHlwZWRLbmV4Q1RFUXVlcnlCdWlsZGVyKHRoaXMua25leCwgdykpKTtcbiAgICAgICAgcmV0dXJuIG5ldyBUeXBlZEtuZXhRdWVyeUJ1aWxkZXIodGhpcy5rbmV4LCBxYik7XG4gICAgfVxuXG4gICAgcHVibGljIGJlZ2luVHJhbnNhY3Rpb24oKTogUHJvbWlzZTxLbmV4LlRyYW5zYWN0aW9uPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5rbmV4XG4gICAgICAgICAgICAgICAgLnRyYW5zYWN0aW9uKCh0cikgPT4gcmVzb2x2ZSh0cikpXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhpcyBlcnJvciBpcyBub3QgY2F1Z2h0IGhlcmUsIGl0IHdpbGwgdGhyb3csIHJlc3VsdGluZyBpbiBhbiB1bmhhbmRsZWRSZWplY3Rpb25cbiAgICAgICAgICAgICAgICAuY2F0Y2goKF9lKSA9PiB7fSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuY2xhc3MgVHlwZWRLbmV4Q1RFUXVlcnlCdWlsZGVyIHtcbiAgICBjb25zdHJ1Y3Rvcihwcm90ZWN0ZWQga25leDogS25leCwgcHJvdGVjdGVkIHF1ZXJ5QnVpbGRlcjogS25leC5RdWVyeUJ1aWxkZXIpIHt9XG5cbiAgICBwdWJsaWMgcXVlcnk8VD4odGFibGVDbGFzczogbmV3ICgpID0+IFQsIGdyYW51bGFyaXR5PzogR3JhbnVsYXJpdHkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8VCwgVCwgVD4ge1xuICAgICAgICByZXR1cm4gbmV3IFR5cGVkUXVlcnlCdWlsZGVyPFQsIFQsIFQ+KHRhYmxlQ2xhc3MsIGdyYW51bGFyaXR5LCB0aGlzLmtuZXgsIHRoaXMucXVlcnlCdWlsZGVyKTtcbiAgICB9XG59XG5cbmNsYXNzIFR5cGVkS25leFF1ZXJ5QnVpbGRlciBleHRlbmRzIFR5cGVkS25leENURVF1ZXJ5QnVpbGRlciB7XG4gICAgcHVibGljIHdpdGg8VCwgVSwgVj4oY3RlVGFibGVDbGFzczogbmV3ICgpID0+IFQsIGN0ZVF1ZXJ5OiAocXVlcnlCdWlsZGVyOiBUeXBlZEtuZXhDVEVRdWVyeUJ1aWxkZXIpID0+IElUeXBlZFF1ZXJ5QnVpbGRlcjxVLCBWLCBUPik6IFR5cGVkS25leFF1ZXJ5QnVpbGRlciB7XG4gICAgICAgIGNvbnN0IGFsaWFzID0gZ2V0VGFibGVOYW1lKGN0ZVRhYmxlQ2xhc3MpO1xuICAgICAgICBjb25zdCBxYiA9IHRoaXMucXVlcnlCdWlsZGVyLndpdGgoYWxpYXMsICh3KSA9PiBjdGVRdWVyeShuZXcgVHlwZWRLbmV4Q1RFUXVlcnlCdWlsZGVyKHRoaXMua25leCwgdykpKTtcbiAgICAgICAgcmV0dXJuIG5ldyBUeXBlZEtuZXhRdWVyeUJ1aWxkZXIodGhpcy5rbmV4LCBxYik7XG4gICAgfVxufVxuXG5sZXQgYmVmb3JlSW5zZXJ0VHJhbnNmb3JtID0gdW5kZWZpbmVkIGFzIHVuZGVmaW5lZCB8ICgoaXRlbTogYW55LCB0eXBlZFF1ZXJ5QnVpbGRlcjogYW55KSA9PiBhbnkpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJCZWZvcmVJbnNlcnRUcmFuc2Zvcm08VD4oZjogKGl0ZW06IFQsIHR5cGVkUXVlcnlCdWlsZGVyOiBJVHlwZWRRdWVyeUJ1aWxkZXI8e30sIHt9LCB7fT4pID0+IFQpIHtcbiAgICBiZWZvcmVJbnNlcnRUcmFuc2Zvcm0gPSBmO1xufVxuXG5sZXQgYmVmb3JlVXBkYXRlVHJhbnNmb3JtID0gdW5kZWZpbmVkIGFzIHVuZGVmaW5lZCB8ICgoaXRlbTogYW55LCB0eXBlZFF1ZXJ5QnVpbGRlcjogYW55KSA9PiBhbnkpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJCZWZvcmVVcGRhdGVUcmFuc2Zvcm08VD4oZjogKGl0ZW06IFQsIHR5cGVkUXVlcnlCdWlsZGVyOiBJVHlwZWRRdWVyeUJ1aWxkZXI8e30sIHt9LCB7fT4pID0+IFQpIHtcbiAgICBiZWZvcmVVcGRhdGVUcmFuc2Zvcm0gPSBmO1xufVxuXG5jbGFzcyBOb3RJbXBsZW1lbnRlZEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlcihcIk5vdCBpbXBsZW1lbnRlZFwiKTtcbiAgICB9XG59XG5cbmNsYXNzIENvbHVtbkZyb21RdWVyeSB7XG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBhbGlhczogc3RyaW5nKSB7fVxuXG4gICAgcHVibGljIHRvU3RyaW5nKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5hbGlhcztcbiAgICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIGNvbHVtbnM6IHsgbmFtZTogc3RyaW5nIH1bXTtcblxuICAgIHdoZXJlOiBJV2hlcmVXaXRoT3BlcmF0b3I8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBhbmRXaGVyZTogSVdoZXJlV2l0aE9wZXJhdG9yPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZTogSVdoZXJlV2l0aE9wZXJhdG9yPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgd2hlcmVOb3Q6IElXaGVyZTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIHNlbGVjdDogSVNlbGVjdFdpdGhGdW5jdGlvbkNvbHVtbnMzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgc2VsZWN0UXVlcnk6IElTZWxlY3RRdWVyeTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgb3JkZXJCeTogSU9yZGVyQnk8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBpbm5lckpvaW5Db2x1bW46IElLZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgbGVmdE91dGVySm9pbkNvbHVtbjogSUtleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHdoZXJlQ29sdW1uOiBJV2hlcmVDb21wYXJlVHdvQ29sdW1uczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgd2hlcmVOdWxsOiBJQ29sdW1uUGFyYW1ldGVyTm9Sb3dUcmFuc2Zvcm1hdGlvbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIHdoZXJlTm90TnVsbDogSUNvbHVtblBhcmFtZXRlck5vUm93VHJhbnNmb3JtYXRpb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlTnVsbDogSUNvbHVtblBhcmFtZXRlck5vUm93VHJhbnNmb3JtYXRpb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlTm90TnVsbDogSUNvbHVtblBhcmFtZXRlck5vUm93VHJhbnNmb3JtYXRpb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGxlZnRPdXRlckpvaW5UYWJsZU9uRnVuY3Rpb246IElKb2luVGFibGVNdWx0aXBsZU9uQ2xhdXNlczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBpbm5lckpvaW5UYWJsZU9uRnVuY3Rpb246IElKb2luVGFibGVNdWx0aXBsZU9uQ2xhdXNlczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIGlubmVySm9pbjogSUpvaW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgbGVmdE91dGVySm9pbjogSUpvaW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICBzZWxlY3RBbGlhczogSVNlbGVjdEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIHNlbGVjdFJhdzogSVNlbGVjdFJhdzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBjb2FsZXNjZTogSUNvYWxlc2NlPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgZmluZEJ5UHJpbWFyeUtleTogSUZpbmRCeVByaW1hcnlLZXk8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG5cbiAgICB3aGVyZUluOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIHdoZXJlTm90SW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBvcldoZXJlSW46IElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZU5vdEluOiBJV2hlcmVJbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgd2hlcmVCZXR3ZWVuOiBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgd2hlcmVOb3RCZXR3ZWVuOiBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgb3JXaGVyZUJldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlTm90QmV0d2VlbjogSVdoZXJlQmV0d2VlbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgd2hlcmVFeGlzdHM6IElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgb3JXaGVyZUV4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgd2hlcmVOb3RFeGlzdHM6IElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9yV2hlcmVOb3RFeGlzdHM6IElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgd2hlcmVQYXJlbnRoZXNlczogSVdoZXJlUGFyZW50aGVzZXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBvcldoZXJlUGFyZW50aGVzZXM6IElXaGVyZVBhcmVudGhlc2VzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBncm91cEJ5OiBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGhhdmluZzogSUhhdmluZzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgaGF2aW5nTnVsbDogSVNlbGVjdGFibGVDb2x1bW5LZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgaGF2aW5nTm90TnVsbDogSVNlbGVjdGFibGVDb2x1bW5LZXlGdW5jdGlvbkFzUGFyYW1ldGVyc1JldHVyblF1ZXJ5QnVpZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBoYXZpbmdJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3RJbjogSVdoZXJlSW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGhhdmluZ0V4aXN0czogSVdoZXJlRXhpc3RzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgaGF2aW5nTm90RXhpc3RzOiBJV2hlcmVFeGlzdHM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGhhdmluZ0JldHdlZW46IElXaGVyZUJldHdlZW48TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBoYXZpbmdOb3RCZXR3ZWVuOiBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB1bmlvbjogSVVuaW9uPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG4gICAgdW5pb25BbGw6IElVbmlvbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgbWluOiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcblxuICAgIGNvdW50OiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBjb3VudERpc3RpbmN0OiBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3cgZXh0ZW5kcyBNb2RlbCA/IHt9IDogUm93PjtcbiAgICBtYXg6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIHN1bTogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgc3VtRGlzdGluY3Q6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuICAgIGF2ZzogSURiRnVuY3Rpb25XaXRoQWxpYXM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93IGV4dGVuZHMgTW9kZWwgPyB7fSA6IFJvdz47XG4gICAgYXZnRGlzdGluY3Q6IElEYkZ1bmN0aW9uV2l0aEFsaWFzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyBleHRlbmRzIE1vZGVsID8ge30gOiBSb3c+O1xuXG4gICAgaW5zZXJ0U2VsZWN0OiBJSW5zZXJ0U2VsZWN0O1xuXG4gICAgaW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmc6IElJbnNlcnRJdGVtV2l0aFJldHVybmluZzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nOiBJSW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmc8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGdldENvbHVtbkFsaWFzKG5hbWU6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4pOiBzdHJpbmc7XG4gICAgZ2V0Q29sdW1uKG5hbWU6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4pOiBDb2x1bW5Gcm9tUXVlcnk7XG5cbiAgICBkaXN0aW5jdE9uKGNvbHVtbk5hbWVzOiBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+W10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGNsZWFyU2VsZWN0KCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBNb2RlbD47XG4gICAgY2xlYXJXaGVyZSgpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBjbGVhck9yZGVyKCk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgbGltaXQodmFsdWU6IG51bWJlcik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIG9mZnNldCh2YWx1ZTogbnVtYmVyKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB1c2VLbmV4UXVlcnlCdWlsZGVyKGY6IChxdWVyeTogS25leC5RdWVyeUJ1aWxkZXIpID0+IHZvaWQpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcbiAgICBnZXRLbmV4UXVlcnlCdWlsZGVyKCk6IEtuZXguUXVlcnlCdWlsZGVyO1xuICAgIHRvUXVlcnkoKTogc3RyaW5nO1xuXG4gICAgZ2V0Rmlyc3RPck51bGwoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPChSb3cgZXh0ZW5kcyBNb2RlbCA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPiA6IFJvdykgfCBudWxsPjtcbiAgICBnZXRGaXJzdE9yVW5kZWZpbmVkKGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTwoUm93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3cpIHwgdW5kZWZpbmVkPjtcbiAgICBnZXRGaXJzdChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8Um93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3c+O1xuICAgIGdldFNpbmdsZU9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8KFJvdyBleHRlbmRzIE1vZGVsID8gUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+IDogUm93KSB8IG51bGw+O1xuICAgIGdldFNpbmdsZU9yVW5kZWZpbmVkKGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTwoUm93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3cpIHwgdW5kZWZpbmVkPjtcbiAgICBnZXRTaW5nbGUoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pOiBQcm9taXNlPFJvdyBleHRlbmRzIE1vZGVsID8gUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+IDogUm93PjtcbiAgICBnZXRNYW55KGZsYXR0ZW5PcHRpb24/OiBGbGF0dGVuT3B0aW9uKTogUHJvbWlzZTwoUm93IGV4dGVuZHMgTW9kZWwgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4gOiBSb3cpW10+O1xuICAgIGdldENvdW50KCk6IFByb21pc2U8bnVtYmVyIHwgc3RyaW5nPjtcbiAgICBpbnNlcnRJdGVtKG5ld09iamVjdDogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+KTogUHJvbWlzZTx2b2lkPjtcbiAgICBpbnNlcnRJdGVtcyhpdGVtczogUGFydGlhbEFuZFVuZGVmaW5lZDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+W10pOiBQcm9taXNlPHZvaWQ+O1xuICAgIGRlbCgpOiBQcm9taXNlPHZvaWQ+O1xuICAgIGRlbEJ5UHJpbWFyeUtleShwcmltYXJ5S2V5VmFsdWU6IGFueSk6IFByb21pc2U8dm9pZD47XG4gICAgdXBkYXRlSXRlbShpdGVtOiBQYXJ0aWFsQW5kVW5kZWZpbmVkPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4pOiBQcm9taXNlPHZvaWQ+O1xuICAgIHVwZGF0ZUl0ZW1CeVByaW1hcnlLZXkocHJpbWFyeUtleVZhbHVlOiBhbnksIGl0ZW06IFBhcnRpYWxBbmRVbmRlZmluZWQ8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+Pik6IFByb21pc2U8dm9pZD47XG4gICAgdXBkYXRlSXRlbXNCeVByaW1hcnlLZXkoXG4gICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICBwcmltYXJ5S2V5VmFsdWU6IGFueTtcbiAgICAgICAgICAgIGRhdGE6IFBhcnRpYWxBbmRVbmRlZmluZWQ8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+PjtcbiAgICAgICAgfVtdXG4gICAgKTogUHJvbWlzZTx2b2lkPjtcbiAgICBleGVjdXRlKCk6IFByb21pc2U8dm9pZD47XG4gICAgd2hlcmVSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuICAgIGhhdmluZ1JhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICB0cmFuc2FjdGluZyh0cng6IEtuZXguVHJhbnNhY3Rpb24pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIHRydW5jYXRlKCk6IFByb21pc2U8dm9pZD47XG4gICAgZGlzdGluY3QoKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBjbG9uZSgpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIGdyb3VwQnlSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgb3JkZXJCeVJhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICBrZWVwRmxhdCgpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgYW55Pjtcbn1cblxudHlwZSBSZXR1cm5Ob25PYmplY3RzTmFtZXNPbmx5PFQ+ID0geyBbSyBpbiBrZXlvZiBUXTogVFtLXSBleHRlbmRzIFNlbGVjdGFibGVDb2x1bW5UeXBlcyA/IEsgOiBuZXZlciB9W2tleW9mIFRdO1xuXG50eXBlIFJlbW92ZU9iamVjdHNGcm9tPFQ+ID0geyBbUCBpbiBSZXR1cm5Ob25PYmplY3RzTmFtZXNPbmx5PFQ+XTogVFtQXSB9O1xuXG5leHBvcnQgdHlwZSBPYmplY3RUb1ByaW1pdGl2ZTxUPiA9IFQgZXh0ZW5kcyBTdHJpbmcgPyBzdHJpbmcgOiBUIGV4dGVuZHMgTnVtYmVyID8gbnVtYmVyIDogVCBleHRlbmRzIEJvb2xlYW4gPyBib29sZWFuIDogbmV2ZXI7XG5cbmV4cG9ydCB0eXBlIE9wZXJhdG9yID0gXCI9XCIgfCBcIiE9XCIgfCBcIj5cIiB8IFwiPFwiIHwgc3RyaW5nO1xuXG5pbnRlcmZhY2UgSUNvbnN0cnVjdG9yPFQ+IHtcbiAgICBuZXcgKC4uLmFyZ3M6IGFueVtdKTogVDtcbn1cblxuZXhwb3J0IHR5cGUgQWRkUHJvcGVydHlXaXRoVHlwZTxPcmlnaW5hbCwgTmV3S2V5IGV4dGVuZHMga2V5b2YgYW55LCBOZXdLZXlUeXBlPiA9IE9yaWdpbmFsICYgTmVzdGVkUmVjb3JkPE5ld0tleSwgTmV3S2V5VHlwZT47XG5cbmludGVyZmFjZSBJSW5zZXJ0SXRlbVdpdGhSZXR1cm5pbmc8TW9kZWwsIF9TZWxlY3RhYmxlTW9kZWwsIF9Sb3c+IHtcbiAgICAobmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj4pOiBQcm9taXNlPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsPj47XG4gICAgPEtleXMgZXh0ZW5kcyBrZXlvZiBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+KG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbD4+LCBrZXlzOiBLZXlzW10pOiBQcm9taXNlPFBpY2s8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWw+LCBLZXlzPj47XG59XG5cbmludGVyZmFjZSBJQ29sdW1uUGFyYW1ldGVyTm9Sb3dUcmFuc2Zvcm1hdGlvbjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElKb2luT248TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleTEgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8Sm9pbmVkTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIFwiXCI+LCBDb25jYXRLZXkyIGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oXG4gICAgICAgIGtleTE6IENvbmNhdEtleTEsXG4gICAgICAgIG9wZXJhdG9yOiBPcGVyYXRvcixcbiAgICAgICAga2V5MjogQ29uY2F0S2V5MlxuICAgICk6IElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSm9pbk9uVmFsPE1vZGVsLCBKb2luZWRNb2RlbD4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8Sm9pbmVkTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgb3BlcmF0b3I6IE9wZXJhdG9yLCB2YWx1ZTogYW55KTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cbmludGVyZmFjZSBJSm9pbk9uTW9kZWxWYWw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBvcGVyYXRvcjogT3BlcmF0b3IsIHZhbHVlOiBhbnkpOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5Pbk51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxKb2luZWRNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPEpvaW5lZE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5KTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cbmludGVyZmFjZSBJSm9pbk9uTW9kZWxOdWxsPE1vZGVsLCBKb2luZWRNb2RlbD4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSk6IElKb2luT25DbGF1c2UyPE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSm9pbk9uUGFyZW50aGVzZXM8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgKG9uRnVuY3Rpb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+KSA9PiB2b2lkKTogSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIElKb2luT25SYXc8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgKHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJSm9pbk9uQ2xhdXNlMjxNb2RlbCwgSm9pbmVkTW9kZWw+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5PbkNsYXVzZTI8TW9kZWwsIEpvaW5lZE1vZGVsPiB7XG4gICAgb246IElKb2luT248TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvck9uOiBJSm9pbk9uPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgYW5kT246IElKb2luT248TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvblZhbDogSUpvaW5PblZhbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIGFuZE9uVmFsOiBJSm9pbk9uVmFsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25RdWVyeVZhbDogSUpvaW5Pbk1vZGVsVmFsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPblZhbDogSUpvaW5PblZhbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25RdWVyeVZhbDogSUpvaW5Pbk1vZGVsVmFsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25OdWxsOiBJSm9pbk9uTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9uUXVlcnlOdWxsOiBJSm9pbk9uTW9kZWxOdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPbk51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb3JPblF1ZXJ5TnVsbDogSUpvaW5Pbk1vZGVsTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9uTm90TnVsbDogSUpvaW5Pbk51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvblF1ZXJ5Tm90TnVsbDogSUpvaW5Pbk1vZGVsTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25Ob3ROdWxsOiBJSm9pbk9uTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25RdWVyeU5vdE51bGw6IElKb2luT25Nb2RlbE51bGw8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBhbmRPbk5vdE51bGw6IElKb2luT25OdWxsPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgYW5kT25OdWxsOiBJSm9pbk9uTnVsbDxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9uUGFyZW50aGVzZXM6IElKb2luT25QYXJlbnRoZXNlczxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIGFuZE9uUGFyZW50aGVzZXM6IElKb2luT25QYXJlbnRoZXNlczxNb2RlbCwgSm9pbmVkTW9kZWw+O1xuICAgIG9yT25QYXJlbnRoZXNlczogSUpvaW5PblBhcmVudGhlc2VzPE1vZGVsLCBKb2luZWRNb2RlbD47XG4gICAgb25SYXc6IElKb2luT25SYXc8TW9kZWwsIEpvaW5lZE1vZGVsPjtcbiAgICBvck9uUmF3OiBJSm9pbk9uUmF3PE1vZGVsLCBKb2luZWRNb2RlbD47XG59XG5cbmludGVyZmFjZSBJSW5zZXJ0U2VsZWN0IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TmV3UHJvcGVydHlUeXBlPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TmV3UHJvcGVydHlUeXBlPiwgXCJcIj4+KFxuICAgICAgICBuZXdQcm9wZXJ0eUNsYXNzOiBuZXcgKCkgPT4gTmV3UHJvcGVydHlUeXBlLFxuICAgICAgICAuLi5jb2x1bW5OYW1lczogQ29uY2F0S2V5W11cbiAgICApOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgSUpvaW5UYWJsZU11bHRpcGxlT25DbGF1c2VzPE1vZGVsLCBfU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueT4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgTmV3UHJvcGVydHlUeXBlPikgPT4gdm9pZFxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgQWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIFJvdz47XG5cbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueT4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LFxuICAgICAgICBvbjogKGpvaW46IElKb2luT25DbGF1c2UyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBOZXdQcm9wZXJ0eVR5cGU+KSA9PiB2b2lkXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElKb2luPE1vZGVsLCBfU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueSwgQ29uY2F0S2V5MiBleHRlbmRzIGtleW9mIE5ld1Byb3BlcnR5VHlwZSwgQ29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAga2V5OiBDb25jYXRLZXkyLFxuICAgICAgICBvcGVyYXRvcjogT3BlcmF0b3IsXG4gICAgICAgIGtleTI6IENvbmNhdEtleVxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgQWRkUHJvcGVydHlXaXRoVHlwZTxNb2RlbCwgTmV3UHJvcGVydHlLZXksIE5ld1Byb3BlcnR5VHlwZT4sIFJvdz47XG5cbiAgICA8TmV3UHJvcGVydHlUeXBlLCBOZXdQcm9wZXJ0eUtleSBleHRlbmRzIGtleW9mIGFueSwgQ29uY2F0S2V5MiBleHRlbmRzIGtleW9mIE5ld1Byb3BlcnR5VHlwZSwgQ29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oXG4gICAgICAgIG5ld1Byb3BlcnR5S2V5OiBOZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgbmV3UHJvcGVydHlDbGFzczogbmV3ICgpID0+IE5ld1Byb3BlcnR5VHlwZSxcbiAgICAgICAgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LFxuICAgICAgICBrZXk6IENvbmNhdEtleTIsXG4gICAgICAgIG9wZXJhdG9yOiBPcGVyYXRvcixcbiAgICAgICAga2V5MjogQ29uY2F0S2V5XG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPEFkZFByb3BlcnR5V2l0aFR5cGU8TW9kZWwsIE5ld1Byb3BlcnR5S2V5LCBOZXdQcm9wZXJ0eVR5cGU+LCBBZGRQcm9wZXJ0eVdpdGhUeXBlPE1vZGVsLCBOZXdQcm9wZXJ0eUtleSwgTmV3UHJvcGVydHlUeXBlPiwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElTZWxlY3RBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIFwiXCI+LCBUTmFtZSBleHRlbmRzIGtleW9mIGFueT4oYWxpYXM6IFROYW1lLCBjb2x1bW5OYW1lOiBDb25jYXRLZXkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJlY29yZDxUTmFtZSwgR2V0TmVzdGVkUHJvcGVydHlUeXBlPFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj4gJiBSb3dcbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSVNlbGVjdFJhdzxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8VFJldHVybiBleHRlbmRzIEJvb2xlYW4gfCBTdHJpbmcgfCBOdW1iZXIsIFROYW1lIGV4dGVuZHMga2V5b2YgYW55PihuYW1lOiBUTmFtZSwgcmV0dXJuVHlwZTogSUNvbnN0cnVjdG9yPFRSZXR1cm4+LCBxdWVyeTogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJlY29yZDxUTmFtZSwgT2JqZWN0VG9QcmltaXRpdmU8VFJldHVybj4+ICYgUm93XG4gICAgPjtcbn1cblxuaW50ZXJmYWNlIElDb2FsZXNjZTxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIFwiXCI+LCBUTmFtZSBleHRlbmRzIGtleW9mIGFueT4oXG4gICAgICAgIGFsaWFzOiBUTmFtZSxcbiAgICAgICAgZmlyc3Q6IENvbmNhdEtleSxcbiAgICAgICAgc2Vjb25kOiBDb25jYXRLZXksXG4gICAgICAgIC4uLnJlc3Q6IENvbmNhdEtleVtdXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyAmIFJlY29yZDxUTmFtZSwgR2V0TmVzdGVkUHJvcGVydHlUeXBlPFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj4+O1xufVxuXG5pbnRlcmZhY2UgSVNlbGVjdFF1ZXJ5PE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxUUmV0dXJuIGV4dGVuZHMgQm9vbGVhbiB8IFN0cmluZyB8IE51bWJlciwgVE5hbWUgZXh0ZW5kcyBrZXlvZiBhbnksIFN1YlF1ZXJ5TW9kZWw+KFxuICAgICAgICBuYW1lOiBUTmFtZSxcbiAgICAgICAgcmV0dXJuVHlwZTogSUNvbnN0cnVjdG9yPFRSZXR1cm4+LFxuICAgICAgICBzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCxcbiAgICAgICAgY29kZTogKHN1YlF1ZXJ5OiBJVHlwZWRRdWVyeUJ1aWxkZXI8U3ViUXVlcnlNb2RlbCwgU3ViUXVlcnlNb2RlbCwge30+LCBwYXJlbnQ6IFRyYW5zZm9ybVByb3BzVG9GdW5jdGlvbnNSZXR1cm5Qcm9wZXJ0eU5hbWU8TW9kZWw+KSA9PiB2b2lkLFxuICAgICAgICBncmFudWxhcml0eT86IEdyYW51bGFyaXR5XG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJlY29yZDxUTmFtZSwgT2JqZWN0VG9QcmltaXRpdmU8VFJldHVybj4+ICYgUm93Pjtcbn1cblxudHlwZSBUcmFuc2Zvcm1Qcm9wc1RvRnVuY3Rpb25zUmV0dXJuUHJvcGVydHlOYW1lPE1vZGVsPiA9IHtcbiAgICBbUCBpbiBrZXlvZiBNb2RlbF06IE1vZGVsW1BdIGV4dGVuZHMgb2JqZWN0ID8gKE1vZGVsW1BdIGV4dGVuZHMgUmVxdWlyZWQ8Tm9uRm9yZWlnbktleU9iamVjdHM+ID8gKCkgPT4gUCA6IFRyYW5zZm9ybVByb3BzVG9GdW5jdGlvbnNSZXR1cm5Qcm9wZXJ0eU5hbWU8TW9kZWxbUF0+KSA6ICgpID0+IFA7XG59O1xuXG5pbnRlcmZhY2UgSU9yZGVyQnk8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBcIlwiPiwgVE5hbWUgZXh0ZW5kcyBrZXlvZiBhbnk+KFxuICAgICAgICBjb2x1bW5OYW1lczogQ29uY2F0S2V5LFxuICAgICAgICBkaXJlY3Rpb24/OiBcImFzY1wiIHwgXCJkZXNjXCJcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93ICYgUmVjb3JkPFROYW1lLCBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8U2VsZWN0YWJsZU1vZGVsLCBDb25jYXRLZXk+Pj47XG59XG5cbmludGVyZmFjZSBJRGJGdW5jdGlvbldpdGhBbGlhczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPFNlbGVjdGFibGVNb2RlbD4sIFwiXCI+LCBUTmFtZSBleHRlbmRzIGtleW9mIGFueT4oY29sdW1uTmFtZXM6IENvbmNhdEtleSwgbmFtZTogVE5hbWUpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJvdyAmIFJlY29yZDxUTmFtZSwgR2V0TmVzdGVkUHJvcGVydHlUeXBlPFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj5cbiAgICA+O1xufVxuXG50eXBlIFVuaW9uVG9JbnRlcnNlY3Rpb248VT4gPSAoVSBleHRlbmRzIGFueSA/IChrOiBVKSA9PiB2b2lkIDogbmV2ZXIpIGV4dGVuZHMgKGs6IGluZmVyIEkpID0+IHZvaWQgPyBJIDogbmV2ZXI7XG5cbmludGVyZmFjZSBJU2VsZWN0V2l0aEZ1bmN0aW9uQ29sdW1uczM8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxTZWxlY3RhYmxlTW9kZWw+LCBcIlwiPj4oLi4uY29sdW1uTmFtZXM6IENvbmNhdEtleVtdKTogSVR5cGVkUXVlcnlCdWlsZGVyPFxuICAgICAgICBNb2RlbCxcbiAgICAgICAgU2VsZWN0YWJsZU1vZGVsLFxuICAgICAgICBSb3cgJiBVbmlvblRvSW50ZXJzZWN0aW9uPEdldE5lc3RlZFByb3BlcnR5PFNlbGVjdGFibGVNb2RlbCwgQ29uY2F0S2V5Pj5cbiAgICA+O1xufVxuXG5pbnRlcmZhY2UgSUZpbmRCeVByaW1hcnlLZXk8X01vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8U2VsZWN0YWJsZU1vZGVsPiwgXCJcIj4+KHByaW1hcnlLZXlWYWx1ZTogYW55LCAuLi5jb2x1bW5OYW1lczogQ29uY2F0S2V5W10pOiBQcm9taXNlPFxuICAgICAgICAoUm93ICYgVW5pb25Ub0ludGVyc2VjdGlvbjxHZXROZXN0ZWRQcm9wZXJ0eTxTZWxlY3RhYmxlTW9kZWwsIENvbmNhdEtleT4+KSB8IHVuZGVmaW5lZFxuICAgID47XG59XG5cbmludGVyZmFjZSBJS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkRm9yZWlnbktleUtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBncmFudWxhcml0eT86IEdyYW51bGFyaXR5KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJU2VsZWN0YWJsZUNvbHVtbktleUZ1bmN0aW9uQXNQYXJhbWV0ZXJzUmV0dXJuUXVlcnlCdWlkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmU8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCB2YWx1ZTogR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmVXaXRoT3BlcmF0b3I8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCB2YWx1ZTogR2V0TmVzdGVkUHJvcGVydHlUeXBlPE1vZGVsLCBDb25jYXRLZXk+KTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICA8Q29uY2F0S2V5IGV4dGVuZHMgTmVzdGVkS2V5c09mPE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBcIlwiPj4oa2V5OiBDb25jYXRLZXksIG9wZXJhdG9yOiBPcGVyYXRvciwgdmFsdWU6IEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5Pik6IElUeXBlZFF1ZXJ5QnVpbGRlcjxcbiAgICAgICAgTW9kZWwsXG4gICAgICAgIFNlbGVjdGFibGVNb2RlbCxcbiAgICAgICAgUm93XG4gICAgPjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZUluPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+PihrZXk6IENvbmNhdEtleSwgdmFsdWU6IEdldE5lc3RlZFByb3BlcnR5VHlwZTxNb2RlbCwgQ29uY2F0S2V5PltdKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJV2hlcmVCZXR3ZWVuPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIDxDb25jYXRLZXkgZXh0ZW5kcyBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+LCBQcm9wZXJ0eVR5cGUgZXh0ZW5kcyBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT4+KFxuICAgICAgICBrZXk6IENvbmNhdEtleSxcbiAgICAgICAgdmFsdWU6IFtQcm9wZXJ0eVR5cGUsIFByb3BlcnR5VHlwZV1cbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElIYXZpbmc8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPENvbmNhdEtleSBleHRlbmRzIE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIGtleW9mIE5vbk51bGxhYmxlUmVjdXJzaXZlPE1vZGVsPiwgXCJcIj4+KGtleTogQ29uY2F0S2V5LCBvcGVyYXRvcjogT3BlcmF0b3IsIHZhbHVlOiBHZXROZXN0ZWRQcm9wZXJ0eVR5cGU8TW9kZWwsIENvbmNhdEtleT4pOiBJVHlwZWRRdWVyeUJ1aWxkZXI8XG4gICAgICAgIE1vZGVsLFxuICAgICAgICBTZWxlY3RhYmxlTW9kZWwsXG4gICAgICAgIFJvd1xuICAgID47XG59XG5cbmludGVyZmFjZSBJV2hlcmVDb21wYXJlVHdvQ29sdW1uczxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8X1Byb3BlcnR5VHlwZTEsIF9Qcm9wZXJ0eVR5cGUyLCBNb2RlbDI+KFxuICAgICAgICBrZXkxOiBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWw+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbD4sIFwiXCI+LFxuICAgICAgICBvcGVyYXRvcjogT3BlcmF0b3IsXG4gICAgICAgIGtleTI6IE5lc3RlZEtleXNPZjxOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbDI+LCBrZXlvZiBOb25OdWxsYWJsZVJlY3Vyc2l2ZTxNb2RlbDI+LCBcIlwiPlxuICAgICk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+O1xuXG4gICAgKGtleTE6IENvbHVtbkZyb21RdWVyeSwgb3BlcmF0b3I6IE9wZXJhdG9yLCBrZXkyOiBDb2x1bW5Gcm9tUXVlcnkpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZUV4aXN0czxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+IHtcbiAgICA8U3ViUXVlcnlNb2RlbD4oXG4gICAgICAgIHN1YlF1ZXJ5TW9kZWw6IG5ldyAoKSA9PiBTdWJRdWVyeU1vZGVsLFxuICAgICAgICBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4sIHBhcmVudDogVHJhbnNmb3JtUHJvcHNUb0Z1bmN0aW9uc1JldHVyblByb3BlcnR5TmFtZTxTZWxlY3RhYmxlTW9kZWw+KSA9PiB2b2lkXG4gICAgKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG5cbiAgICA8U3ViUXVlcnlNb2RlbD4oXG4gICAgICAgIHN1YlF1ZXJ5TW9kZWw6IG5ldyAoKSA9PiBTdWJRdWVyeU1vZGVsLFxuICAgICAgICBncmFudWxhcml0eTogR3JhbnVsYXJpdHksXG4gICAgICAgIGNvZGU6IChzdWJRdWVyeTogSVR5cGVkUXVlcnlCdWlsZGVyPFN1YlF1ZXJ5TW9kZWwsIFN1YlF1ZXJ5TW9kZWwsIHt9PiwgcGFyZW50OiBUcmFuc2Zvcm1Qcm9wc1RvRnVuY3Rpb25zUmV0dXJuUHJvcGVydHlOYW1lPFNlbGVjdGFibGVNb2RlbD4pID0+IHZvaWRcbiAgICApOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuaW50ZXJmYWNlIElXaGVyZVBhcmVudGhlc2VzPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz4ge1xuICAgIChjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbCwgU2VsZWN0YWJsZU1vZGVsLCBSb3c+KSA9PiB2b2lkKTogSVR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsLCBTZWxlY3RhYmxlTW9kZWwsIFJvdz47XG59XG5cbmludGVyZmFjZSBJVW5pb248TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgPFN1YlF1ZXJ5TW9kZWw+KHN1YlF1ZXJ5TW9kZWw6IG5ldyAoKSA9PiBTdWJRdWVyeU1vZGVsLCBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4pID0+IHZvaWQpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93PjtcblxuICAgIDxTdWJRdWVyeU1vZGVsPihzdWJRdWVyeU1vZGVsOiBuZXcgKCkgPT4gU3ViUXVlcnlNb2RlbCwgZ3JhbnVsYXJpdHk6IEdyYW51bGFyaXR5LCBjb2RlOiAoc3ViUXVlcnk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxTdWJRdWVyeU1vZGVsLCBTdWJRdWVyeU1vZGVsLCB7fT4pID0+IHZvaWQpOiBJVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWwsIFNlbGVjdGFibGVNb2RlbCwgUm93Pjtcbn1cblxuZXhwb3J0IHR5cGUgR3JhbnVsYXJpdHkgPSBcIlBBR0xPQ0tcIiB8IFwiTk9MT0NLXCIgfCBcIlJFQURDT01NSVRURURMT0NLXCIgfCBcIlJPV0xPQ0tcIiB8IFwiVEFCTE9DS1wiIHwgXCJUQUJMT0NLWFwiO1xuXG5mdW5jdGlvbiBnZXRQcm94eUFuZE1lbW9yaWVzPE1vZGVsVHlwZSwgUm93Pih0eXBlZFF1ZXJ5QnVpbGRlcj86IFR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsVHlwZSwgUm93Pikge1xuICAgIGNvbnN0IG1lbW9yaWVzID0gW10gYXMgc3RyaW5nW107XG5cbiAgICBmdW5jdGlvbiBhbGxHZXQoX3RhcmdldDogYW55LCBuYW1lOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAobmFtZSA9PT0gXCJtZW1vcmllc1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gbWVtb3JpZXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmFtZSA9PT0gXCJnZXRDb2x1bW5OYW1lXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0eXBlZFF1ZXJ5QnVpbGRlciEuZ2V0Q29sdW1uTmFtZSguLi5tZW1vcmllcyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIG1lbW9yaWVzLnB1c2gobmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm94eShcbiAgICAgICAgICAgIHt9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGdldDogYWxsR2V0LFxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHJvb3QgPSBuZXcgUHJveHkoXG4gICAgICAgIHt9LFxuICAgICAgICB7XG4gICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICByZXR1cm4geyByb290LCBtZW1vcmllcyB9O1xufVxuXG5mdW5jdGlvbiBnZXRQcm94eUFuZE1lbW9yaWVzRm9yQXJyYXk8TW9kZWxUeXBlLCBSb3c+KHR5cGVkUXVlcnlCdWlsZGVyPzogVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBSb3c+KSB7XG4gICAgY29uc3QgcmVzdWx0ID0gW10gYXMgc3RyaW5nW11bXTtcblxuICAgIGxldCBjb3VudGVyID0gLTE7XG5cbiAgICBmdW5jdGlvbiBhbGxHZXQoX3RhcmdldDogYW55LCBuYW1lOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAoX3RhcmdldC5sZXZlbCA9PT0gMCkge1xuICAgICAgICAgICAgY291bnRlcisrO1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goW10pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChuYW1lID09PSBcIm1lbW9yaWVzXCIpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRbY291bnRlcl07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwicmVzdWx0XCIpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwibGV2ZWxcIikge1xuICAgICAgICAgICAgcmV0dXJuIF90YXJnZXQubGV2ZWw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hbWUgPT09IFwiZ2V0Q29sdW1uTmFtZVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZWRRdWVyeUJ1aWxkZXIhLmdldENvbHVtbk5hbWUoLi4ucmVzdWx0W2NvdW50ZXJdKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJlc3VsdFtjb3VudGVyXS5wdXNoKG5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgUHJveHkoXG4gICAgICAgICAgICB7fSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBnZXQ6IGFsbEdldCxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCByb290ID0gbmV3IFByb3h5KFxuICAgICAgICB7IGxldmVsOiAwIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIGdldDogYWxsR2V0LFxuICAgICAgICB9XG4gICAgKTtcblxuICAgIHJldHVybiB7IHJvb3QsIHJlc3VsdCB9O1xufVxuXG5leHBvcnQgY2xhc3MgVHlwZWRRdWVyeUJ1aWxkZXI8TW9kZWxUeXBlLCBTZWxlY3RhYmxlTW9kZWwsIFJvdyA9IHt9PiBpbXBsZW1lbnRzIElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbFR5cGUsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgcHVibGljIGNvbHVtbnM6IHsgbmFtZTogc3RyaW5nIH1bXTtcblxuICAgIHB1YmxpYyBvbmx5TG9nUXVlcnkgPSBmYWxzZTtcbiAgICBwdWJsaWMgcXVlcnlMb2cgPSBcIlwiO1xuICAgIHByaXZhdGUgaGFzU2VsZWN0Q2xhdXNlID0gZmFsc2U7XG5cbiAgICBwcml2YXRlIHF1ZXJ5QnVpbGRlcjogS25leC5RdWVyeUJ1aWxkZXI7XG4gICAgcHJpdmF0ZSB0YWJsZU5hbWU6IHN0cmluZztcbiAgICBwcml2YXRlIHNob3VsZFVuZmxhdHRlbjogYm9vbGVhbjtcbiAgICBwcml2YXRlIGV4dHJhSm9pbmVkUHJvcGVydGllczoge1xuICAgICAgICBuYW1lOiBzdHJpbmc7XG4gICAgICAgIHByb3BlcnR5VHlwZTogbmV3ICgpID0+IGFueTtcbiAgICB9W107XG5cbiAgICBwcml2YXRlIHRyYW5zYWN0aW9uPzogS25leC5UcmFuc2FjdGlvbjtcblxuICAgIHByaXZhdGUgc3ViUXVlcnlDb3VudGVyID0gMDtcblxuICAgIHByaXZhdGUgZ3JhbnVsYXJpdHlTZXQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxHcmFudWxhcml0eT4oW1wiTk9MT0NLXCIsIFwiUEFHTE9DS1wiLCBcIlJFQURDT01NSVRURURMT0NLXCIsIFwiUk9XTE9DS1wiLCBcIlRBQkxPQ0tcIiwgXCJUQUJMT0NLWFwiXSk7XG5cbiAgICBjb25zdHJ1Y3RvcihcbiAgICAgICAgcHJpdmF0ZSB0YWJsZUNsYXNzOiBuZXcgKCkgPT4gTW9kZWxUeXBlLFxuICAgICAgICBwcml2YXRlIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCxcbiAgICAgICAgcHJpdmF0ZSBrbmV4OiBLbmV4LFxuICAgICAgICBxdWVyeUJ1aWxkZXI/OiBLbmV4LlF1ZXJ5QnVpbGRlcixcbiAgICAgICAgcHJpdmF0ZSBwYXJlbnRUeXBlZFF1ZXJ5QnVpbGRlcj86IGFueSxcbiAgICAgICAgcHJpdmF0ZSBzdWJRdWVyeVByZWZpeD86IHN0cmluZ1xuICAgICkge1xuICAgICAgICB0aGlzLnRhYmxlTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZUNsYXNzKTtcbiAgICAgICAgdGhpcy5jb2x1bW5zID0gZ2V0Q29sdW1uUHJvcGVydGllcyh0YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcbiAgICAgICAgaWYgKHF1ZXJ5QnVpbGRlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlciA9IHF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICh0aGlzLnN1YlF1ZXJ5UHJlZml4KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZnJvbSh0aGlzLmtuZXgucmF3KGA/PyBhcyA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGhpcy50YWJsZU5hbWUsIGAke3RoaXMuc3ViUXVlcnlQcmVmaXh9JHt0aGlzLnRhYmxlTmFtZX1gXSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5mcm9tKHRoaXMua25leC5yYXcoYD8/JHtncmFudWxhcml0eVF1ZXJ5fWAsIFt0aGlzLnRhYmxlTmFtZV0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyID0gdGhpcy5rbmV4LmZyb20odGhpcy5rbmV4LnJhdyhgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RoaXMudGFibGVOYW1lXSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMgPSBbXTtcbiAgICAgICAgdGhpcy5zaG91bGRVbmZsYXR0ZW4gPSB0cnVlO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXROZXh0U3ViUXVlcnlQcmVmaXgoKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn1zdWJxdWVyeSR7dGhpcy5zdWJRdWVyeUNvdW50ZXJ9JGA7XG4gICAgICAgIHRoaXMuc3ViUXVlcnlDb3VudGVyKys7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgcHVibGljIGtlZXBGbGF0KCkge1xuICAgICAgICB0aGlzLnNob3VsZFVuZmxhdHRlbiA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q29sdW1uQWxpYXMobmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmtuZXgucmF3KFwiPz9cIiwgdGhpcy5nZXRDb2x1bW5OYW1lKC4uLm5hbWUuc3BsaXQoXCIuXCIpKSkudG9RdWVyeSgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRDb2x1bW4obmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiBuZXcgQ29sdW1uRnJvbVF1ZXJ5KHRoaXMuZ2V0Q29sdW1uQWxpYXMobmFtZSkpO1xuICAgIH1cblxuICAgIHB1YmxpYyBkaXN0aW5jdE9uKGNvbHVtbk5hbWVzOiBOZXN0ZWRLZXlzT2Y8Tm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWxUeXBlPiwga2V5b2YgTm9uTnVsbGFibGVSZWN1cnNpdmU8TW9kZWxUeXBlPiwgXCJcIj5bXSk6IElUeXBlZFF1ZXJ5QnVpbGRlcjxNb2RlbFR5cGUsIFNlbGVjdGFibGVNb2RlbCwgUm93PiB7XG4gICAgICAgIGNvbnN0IG1hcHBlZENvbHVtbk5hbWVzID0gY29sdW1uTmFtZXMubWFwKChjb2x1bW5OYW1lKSA9PiB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uTmFtZS5zcGxpdChcIi5cIikpKTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZGlzdGluY3RPbihtYXBwZWRDb2x1bW5OYW1lcyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBkZWwoKSB7XG4gICAgICAgIGF3YWl0IHRoaXMucXVlcnlCdWlsZGVyLmRlbCgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBkZWxCeVByaW1hcnlLZXkodmFsdWU6IGFueSkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlci5kZWwoKS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKHZhbHVlKSk7XG4gICAgfVxuXG4gICAgcHVibGljIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+Pik6IFByb21pc2U8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj47XG4gICAgcHVibGljIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nPEtleXMgZXh0ZW5kcyBrZXlvZiBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+PihuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4sIGtleXM6IEtleXNbXSk6IFByb21pc2U8UGljazxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+LCBLZXlzPj47XG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZUl0ZW1XaXRoUmV0dXJuaW5nKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+PiwgcmV0dXJuUHJvcGVydGllcz86IChrZXlvZiBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+KVtdKSB7XG4gICAgICAgIGxldCBpdGVtID0gbmV3T2JqZWN0O1xuICAgICAgICBpZiAoYmVmb3JlVXBkYXRlVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICBpdGVtID0gYmVmb3JlVXBkYXRlVHJhbnNmb3JtKG5ld09iamVjdCwgdGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tYXBQcm9wZXJ0aWVzVG9Db2x1bW5zKGl0ZW0pO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIudXBkYXRlKGl0ZW0pO1xuICAgICAgICBpZiAocmV0dXJuUHJvcGVydGllcykge1xuICAgICAgICAgICAgY29uc3QgbWFwcGVkTmFtZXMgPSByZXR1cm5Qcm9wZXJ0aWVzLm1hcCgoY29sdW1uTmFtZSkgPT4gdGhpcy5nZXRDb2x1bW5OYW1lKGNvbHVtbk5hbWUgYXMgc3RyaW5nKSk7XG4gICAgICAgICAgICBxdWVyeS5yZXR1cm5pbmcobWFwcGVkTmFtZXMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKFwiKlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuXG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gKGF3YWl0IHF1ZXJ5KSBhcyBhbnk7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gcm93c1swXTtcblxuICAgICAgICAgICAgdGhpcy5tYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW0pO1xuICAgICAgICAgICAgdGhpcy5hcHBseVRlbXBvcmFsQ29udmVyc2lvbnNGb3JSZWFkKGl0ZW0pO1xuXG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pOiBQcm9taXNlPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+O1xuICAgIHB1YmxpYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZzxLZXlzIGV4dGVuZHMga2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4obmV3T2JqZWN0OiBQYXJ0aWFsPFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4+LCBrZXlzOiBLZXlzW10pOiBQcm9taXNlPFBpY2s8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPiwgS2V5cz4+O1xuICAgIHB1YmxpYyBhc3luYyBpbnNlcnRJdGVtV2l0aFJldHVybmluZyhuZXdPYmplY3Q6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4sIHJldHVyblByb3BlcnRpZXM/OiAoa2V5b2YgUmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPilbXSkge1xuICAgICAgICBsZXQgaXRlbSA9IG5ld09iamVjdDtcbiAgICAgICAgaWYgKGJlZm9yZUluc2VydFRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZUluc2VydFRyYW5zZm9ybShuZXdPYmplY3QsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyh0aGlzLnRhYmxlQ2xhc3MpO1xuXG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuaW5zZXJ0KGl0ZW0pO1xuICAgICAgICBpZiAocmV0dXJuUHJvcGVydGllcykge1xuICAgICAgICAgICAgY29uc3QgbWFwcGVkTmFtZXMgPSByZXR1cm5Qcm9wZXJ0aWVzLm1hcCgoY29sdW1uTmFtZSkgPT4gdGhpcy5nZXRDb2x1bW5OYW1lKGNvbHVtbk5hbWUgYXMgc3RyaW5nKSk7XG4gICAgICAgICAgICBxdWVyeS5yZXR1cm5pbmcobWFwcGVkTmFtZXMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcXVlcnkucmV0dXJuaW5nKFwiKlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuXG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gYXdhaXQgcXVlcnk7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gcm93c1swXTtcblxuICAgICAgICAgICAgdGhpcy5tYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW0pO1xuICAgICAgICAgICAgdGhpcy5hcHBseVRlbXBvcmFsQ29udmVyc2lvbnNGb3JSZWFkKGl0ZW0pO1xuXG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBpbnNlcnRJdGVtKG5ld09iamVjdDogUGFydGlhbDxSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+Pikge1xuICAgICAgICBhd2FpdCB0aGlzLmluc2VydEl0ZW1zKFtuZXdPYmplY3RdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgaW5zZXJ0SXRlbXMoaXRlbXM6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj5bXSkge1xuICAgICAgICBpdGVtcyA9IFsuLi5pdGVtc107XG5cbiAgICAgICAgaWYgKGJlZm9yZUluc2VydFRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbXMgPSBpdGVtcy5tYXAoKGl0ZW0pID0+IGJlZm9yZUluc2VydFRyYW5zZm9ybSEoaXRlbSwgdGhpcykpO1xuICAgICAgICB9XG5cbiAgICAgICAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4gdGhpcy5tYXBQcm9wZXJ0aWVzVG9Db2x1bW5zKGl0ZW0pKTtcblxuICAgICAgICB3aGlsZSAoaXRlbXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgY2h1bmsgPSBpdGVtcy5zcGxpY2UoMCwgNTAwKTtcbiAgICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuY2xvbmUoKS5pbnNlcnQoY2h1bmspO1xuICAgICAgICAgICAgaWYgKHRoaXMudHJhbnNhY3Rpb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHF1ZXJ5LnRyYW5zYWN0aW5nKHRoaXMudHJhbnNhY3Rpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBxdWVyeTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyB1cGRhdGVJdGVtKGl0ZW06IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pIHtcbiAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKTtcbiAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5TG9nICs9IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXIudXBkYXRlKGl0ZW0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHVwZGF0ZUl0ZW1CeVByaW1hcnlLZXkocHJpbWFyeUtleVZhbHVlOiBhbnksIGl0ZW06IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj4pIHtcbiAgICAgICAgaWYgKGJlZm9yZVVwZGF0ZVRyYW5zZm9ybSkge1xuICAgICAgICAgICAgaXRlbSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtKTtcblxuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLnVwZGF0ZShpdGVtKS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKHByaW1hcnlLZXlWYWx1ZSkpO1xuXG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBxdWVyeS50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXdhaXQgcXVlcnk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgdXBkYXRlSXRlbXNCeVByaW1hcnlLZXkoXG4gICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICBwcmltYXJ5S2V5VmFsdWU6IGFueTtcbiAgICAgICAgICAgIGRhdGE6IFBhcnRpYWw8UmVtb3ZlT2JqZWN0c0Zyb208TW9kZWxUeXBlPj47XG4gICAgICAgIH1bXVxuICAgICkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBpdGVtcyA9IFsuLi5pdGVtc107XG4gICAgICAgIHdoaWxlIChpdGVtcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBjaHVuayA9IGl0ZW1zLnNwbGljZSgwLCA1MDApO1xuXG4gICAgICAgICAgICBsZXQgc3FsID0gXCJcIjtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBjaHVuaykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWVyeUJ1aWxkZXIuY2xvbmUoKTtcbiAgICAgICAgICAgICAgICBpZiAoYmVmb3JlVXBkYXRlVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgICAgIGl0ZW0uZGF0YSA9IGJlZm9yZVVwZGF0ZVRyYW5zZm9ybShpdGVtLmRhdGEsIHRoaXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLm1hcFByb3BlcnRpZXNUb0NvbHVtbnMoaXRlbS5kYXRhKTtcblxuICAgICAgICAgICAgICAgIHF1ZXJ5LnVwZGF0ZShpdGVtLmRhdGEpO1xuICAgICAgICAgICAgICAgIHNxbCArPSBxdWVyeS53aGVyZShwcmltYXJ5S2V5Q29sdW1uSW5mby5uYW1lLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKGl0ZW0ucHJpbWFyeUtleVZhbHVlKSkudG9TdHJpbmcoKS5yZXBsYWNlKFwiP1wiLCBcIlxcXFw/XCIpICsgXCI7XFxuXCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGZpbmFsUXVlcnkgPSB0aGlzLmtuZXgucmF3KHNxbCk7XG4gICAgICAgICAgICBpZiAodGhpcy50cmFuc2FjdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgZmluYWxRdWVyeS50cmFuc2FjdGluZyh0aGlzLnRyYW5zYWN0aW9uKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMub25seUxvZ1F1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSBmaW5hbFF1ZXJ5LnRvUXVlcnkoKSArIFwiXFxuXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGF3YWl0IGZpbmFsUXVlcnk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZXhlY3V0ZSgpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgfVxuXG4gICAgcHVibGljIGxpbWl0KHZhbHVlOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIubGltaXQodmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIG9mZnNldCh2YWx1ZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLm9mZnNldCh2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZmluZEJ5SWQoaWQ6IHN0cmluZywgY29sdW1uczogKGtleW9mIE1vZGVsVHlwZSlbXSkge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXJcbiAgICAgICAgICAgIC5zZWxlY3QoY29sdW1ucyBhcyBhbnkpXG4gICAgICAgICAgICAud2hlcmUodGhpcy50YWJsZU5hbWUgKyBcIi5pZFwiLCBpZClcbiAgICAgICAgICAgIC5maXJzdCgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRDb3VudCgpIHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXJ5QnVpbGRlci5jb3VudCh7IGNvdW50OiBcIipcIiB9KTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcXVlcnk7XG4gICAgICAgIGlmIChyZXN1bHQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLmNvdW50O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRGaXJzdE9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZsYXR0ZW5CeU9wdGlvbihpdGVtc1swXSwgZmxhdHRlbk9wdGlvbik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHVibGljIGFzeW5jIGdldEZpcnN0T3JVbmRlZmluZWQoKSB7XG4gICAgICAgIGNvbnN0IGZpcnN0T3JOdWxsUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRGaXJzdE9yTnVsbCgpO1xuICAgICAgICBpZiAoZmlyc3RPck51bGxSZXN1bHQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZpcnN0T3JOdWxsUmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRGaXJzdChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSXRlbSBub3QgZm91bmQuXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXNbMF0sIGZsYXR0ZW5PcHRpb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGdldFNpbmdsZU9yTnVsbChmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbikge1xuICAgICAgICBpZiAodGhpcy5oYXNTZWxlY3RDbGF1c2UgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbE1vZGVsUHJvcGVydGllcygpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9ubHlMb2dRdWVyeSkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUxvZyArPSB0aGlzLnF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlcjtcbiAgICAgICAgICAgIGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGl0ZW1zLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1vcmUgdGhhbiBvbmUgaXRlbSBmb3VuZDogJHtpdGVtcy5sZW5ndGh9LmApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmxhdHRlbkJ5T3B0aW9uKGl0ZW1zWzBdLCBmbGF0dGVuT3B0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRTaW5nbGVPclVuZGVmaW5lZCgpIHtcbiAgICAgICAgY29uc3Qgc2luZ2xlT3JOdWxsUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRTaW5nbGVPck51bGwoKTtcbiAgICAgICAgaWYgKHNpbmdsZU9yTnVsbFJlc3VsdCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2luZ2xlT3JOdWxsUmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBnZXRTaW5nbGUoZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICBpZiAoIWl0ZW1zIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkl0ZW0gbm90IGZvdW5kLlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXRlbXMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTW9yZSB0aGFuIG9uZSBpdGVtIGZvdW5kOiAke2l0ZW1zLmxlbmd0aH0uYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXNbMF0sIGZsYXR0ZW5PcHRpb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHNlbGVjdENvbHVtbigpIHtcbiAgICAgICAgdGhpcy5oYXNTZWxlY3RDbGF1c2UgPSB0cnVlO1xuICAgICAgICBsZXQgY2FsbGVkQXJndW1lbnRzID0gW10gYXMgc3RyaW5nW107XG5cbiAgICAgICAgZnVuY3Rpb24gc2F2ZUFyZ3VtZW50cyguLi5hcmdzOiBzdHJpbmdbXSkge1xuICAgICAgICAgICAgY2FsbGVkQXJndW1lbnRzID0gYXJncztcbiAgICAgICAgfVxuXG4gICAgICAgIGFyZ3VtZW50c1swXShzYXZlQXJndW1lbnRzKTtcblxuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5zZWxlY3QodGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNhbGxlZEFyZ3VtZW50cykgKyBcIiBhcyBcIiArIHRoaXMuZ2V0Q29sdW1uU2VsZWN0QWxpYXMoLi4uY2FsbGVkQXJndW1lbnRzKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGY6IGFueSkge1xuICAgICAgICBjb25zdCB7IHJvb3QsIHJlc3VsdCB9ID0gZ2V0UHJveHlBbmRNZW1vcmllc0ZvckFycmF5KCk7XG5cbiAgICAgICAgZihyb290KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3QyKCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMF07XG5cbiAgICAgICAgY29uc3QgY29sdW1uQXJndW1lbnRzTGlzdCA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uMyhmKTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNvbHVtbkFyZ3VtZW50cyBvZiBjb2x1bW5Bcmd1bWVudHNMaXN0KSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5zZWxlY3QodGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cykgKyBcIiBhcyBcIiArIHRoaXMuZ2V0Q29sdW1uU2VsZWN0QWxpYXMoLi4uY29sdW1uQXJndW1lbnRzKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3QoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50c0xpc3Q6IHN0cmluZ1tdW107XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhcmd1bWVudHNbMF0gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50c0xpc3QgPSBbLi4uYXJndW1lbnRzXS5tYXAoKGNvbmNhdEtleTogc3RyaW5nKSA9PiBjb25jYXRLZXkuc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMF07XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5Bcmd1bWVudHMgb2YgY29sdW1uQXJndW1lbnRzTGlzdCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JkZXJCeSgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIub3JkZXJCeSh0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXNGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pLCBhcmd1bWVudHNbMV0pO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZ2V0TWFueShmbGF0dGVuT3B0aW9uPzogRmxhdHRlbk9wdGlvbik6IFByb21pc2U8KFJvdyBleHRlbmRzIE1vZGVsVHlwZSA/IFJlbW92ZU9iamVjdHNGcm9tPE1vZGVsVHlwZT4gOiBSb3cpW10+IHtcbiAgICAgICAgLy8gYXR0YWNoIGFueSBkZWZhdWx0IGxvY2tzIHRvIHRoZSBxdWVyeSBpZiB0aGV5IGFyZSBub3Qgc3BlY2lmaWVkXG5cbiAgICAgICAgaWYgKHRoaXMuaGFzU2VsZWN0Q2xhdXNlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGxNb2RlbFByb3BlcnRpZXMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5xdWVyeUJ1aWxkZXI7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuQnlPcHRpb24oaXRlbXMsIGZsYXR0ZW5PcHRpb24pIGFzIChSb3cgZXh0ZW5kcyBNb2RlbFR5cGUgPyBSZW1vdmVPYmplY3RzRnJvbTxNb2RlbFR5cGU+IDogUm93KVtdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHNlbGVjdEFsaWFzKCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50cyA9IGFyZ3VtZW50c1sxXS5zcGxpdChcIi5cIik7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KGAke3RoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpfSBhcyAke2FyZ3VtZW50c1swXX1gKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cblxuICAgIHB1YmxpYyBzZWxlY3RSYXcoKSB7XG4gICAgICAgIHRoaXMuaGFzU2VsZWN0Q2xhdXNlID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgW25hbWUsIF8sIHF1ZXJ5LCAuLi5iaW5kaW5nc10gPSBBcnJheS5mcm9tKGFyZ3VtZW50cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMua25leC5yYXcoYCgke3F1ZXJ5fSkgYXMgXCIke25hbWV9XCJgLCBiaW5kaW5ncykpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGNvYWxlc2NlKCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IFthbGlhcywgLi4ua2V5c10gPSBBcnJheS5mcm9tKGFyZ3VtZW50cykgYXMgc3RyaW5nW107XG4gICAgICAgIGNvbnN0IGNvbHVtbk5hbWVzID0ga2V5cy5tYXAoKGtleSkgPT4gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmtleS5zcGxpdChcIi5cIikpKTtcbiAgICAgICAgY29uc3QgcGxhY2Vob2xkZXJzID0gY29sdW1uTmFtZXMubWFwKCgpID0+IFwiPz9cIikuam9pbihcIiwgXCIpO1xuXG4gICAgICAgIC8vIFRoZSBvYmplY3QgYWxpYXMgZm9ybSBpcyB1c2VkIG9uIHB1cnBvc2U6IGEgYD8/YCBiaW5kaW5nIHdvdWxkIHNwbGl0IGEgZG90dGVkIGFsaWFzIGludG8gc2VwYXJhdGUgaWRlbnRpZmllcnMuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnNlbGVjdCh7IFthbGlhc106IHRoaXMua25leC5yYXcoYGNvYWxlc2NlKCR7cGxhY2Vob2xkZXJzfSlgLCBjb2x1bW5OYW1lcykgfSBhcyBhbnkpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pbkNvbHVtbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbkNvbHVtbihcImlubmVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuICAgIHB1YmxpYyBsZWZ0T3V0ZXJKb2luQ29sdW1uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5qb2luQ29sdW1uKFwibGVmdE91dGVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pblRhYmxlKCkge1xuICAgICAgICBjb25zdCBuZXdQcm9wZXJ0eUtleSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgbmV3UHJvcGVydHlUeXBlID0gYXJndW1lbnRzWzFdO1xuICAgICAgICBjb25zdCBjb2x1bW4xUGFydHMgPSBhcmd1bWVudHNbMl07XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBjb2x1bW4yUGFydHMgPSBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgdGhpcy5leHRyYUpvaW5lZFByb3BlcnRpZXMucHVzaCh7XG4gICAgICAgICAgICBuYW1lOiBuZXdQcm9wZXJ0eUtleSxcbiAgICAgICAgICAgIHByb3BlcnR5VHlwZTogbmV3UHJvcGVydHlUeXBlLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbkNsYXNzID0gbmV3UHJvcGVydHlUeXBlO1xuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXMgPSBuZXdQcm9wZXJ0eUtleTtcblxuICAgICAgICBjb25zdCB0YWJsZTFDb2x1bW4gPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMVBhcnRzKTtcbiAgICAgICAgY29uc3QgdGFibGUyQ29sdW1uID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbjJQYXJ0cyk7XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luKGAke3RhYmxlVG9Kb2luTmFtZX0gYXMgJHt0YWJsZVRvSm9pbkFsaWFzfWAsIHRhYmxlMUNvbHVtbiwgb3BlcmF0b3IsIHRhYmxlMkNvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGlubmVySm9pbigpIHtcbiAgICAgICAgY29uc3QgY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPSB0aGlzLmdyYW51bGFyaXR5U2V0Lmhhcyhhcmd1bWVudHNbMl0pO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1sxXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzRdIDogYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nID0gY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPyBhcmd1bWVudHNbNV0gOiBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcImlubmVySm9pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgZ3JhbnVsYXJpdHksIGpvaW5UYWJsZUNvbHVtblN0cmluZywgb3BlcmF0b3IsIGV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmcpO1xuICAgIH1cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pbigpIHtcbiAgICAgICAgY29uc3QgY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPSB0aGlzLmdyYW51bGFyaXR5U2V0Lmhhcyhhcmd1bWVudHNbMl0pO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1sxXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtblN0cmluZyA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGNhbGxJbmNsdWRlc0dyYW51bGFyaXR5ID8gYXJndW1lbnRzWzRdIDogYXJndW1lbnRzWzNdO1xuICAgICAgICBjb25zdCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nID0gY2FsbEluY2x1ZGVzR3JhbnVsYXJpdHkgPyBhcmd1bWVudHNbNV0gOiBhcmd1bWVudHNbNF07XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcImxlZnRPdXRlckpvaW5cIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0sIGdyYW51bGFyaXR5LCBqb2luVGFibGVDb2x1bW5TdHJpbmcsIG9wZXJhdG9yLCBleGlzdGluZ1RhYmxlQ29sdW1uU3RyaW5nKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5uZXJKb2luVGFibGVPbkZ1bmN0aW9uKCkge1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMl0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzJdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzFdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3Qgb24gPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzNdIDogYXJndW1lbnRzWzJdO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmpvaW5UYWJsZU9uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgZ3JhbnVsYXJpdHksIG9uKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbGVmdE91dGVySm9pblRhYmxlT25GdW5jdGlvbigpIHtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1syXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1sxXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IG9uID0gdHlwZW9mIGFyZ3VtZW50c1syXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1szXSA6IGFyZ3VtZW50c1syXTtcblxuICAgICAgICByZXR1cm4gdGhpcy5qb2luVGFibGVPbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLmxlZnRPdXRlckpvaW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdLCBncmFudWxhcml0eSwgb24pO1xuICAgIH1cblxuICAgIHB1YmxpYyBsZWZ0T3V0ZXJKb2luVGFibGUoKSB7XG4gICAgICAgIGNvbnN0IG5ld1Byb3BlcnR5S2V5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBuZXdQcm9wZXJ0eVR5cGUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgIGNvbnN0IGNvbHVtbjFQYXJ0cyA9IGFyZ3VtZW50c1syXTtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSBhcmd1bWVudHNbM107XG4gICAgICAgIGNvbnN0IGNvbHVtbjJQYXJ0cyA9IGFyZ3VtZW50c1s0XTtcblxuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IG5ld1Byb3BlcnR5S2V5LFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBuZXdQcm9wZXJ0eVR5cGUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQ2xhc3MgPSBuZXdQcm9wZXJ0eVR5cGU7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZVRvSm9pbkNsYXNzKTtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5BbGlhcyA9IG5ld1Byb3BlcnR5S2V5O1xuXG4gICAgICAgIGNvbnN0IHRhYmxlMUNvbHVtbiA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW4xUGFydHMpO1xuICAgICAgICBjb25zdCB0YWJsZTJDb2x1bW4gPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uMlBhcnRzKTtcblxuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5sZWZ0T3V0ZXJKb2luKGAke3RhYmxlVG9Kb2luTmFtZX0gYXMgJHt0YWJsZVRvSm9pbkFsaWFzfWAsIHRhYmxlMUNvbHVtbiwgb3BlcmF0b3IsIHRhYmxlMkNvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlQ29sdW1uKCkge1xuICAgICAgICAvLyBUaGlzIGlzIGNhbGxlZCBmcm9tIHRoZSBzdWItcXVlcnlcbiAgICAgICAgLy8gVGhlIGZpcnN0IGNvbHVtbiBpcyBmcm9tIHRoZSBzdWItcXVlcnlcbiAgICAgICAgLy8gVGhlIHNlY29uZCBjb2x1bW4gaXMgZnJvbSB0aGUgcGFyZW50IHF1ZXJ5XG4gICAgICAgIGxldCBjb2x1bW4xTmFtZTtcbiAgICAgICAgbGV0IGNvbHVtbjJOYW1lO1xuICAgICAgICBjb25zdCBvcGVyYXRvciA9IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICBpZiAoYXJndW1lbnRzWzBdIGluc3RhbmNlb2YgQ29sdW1uRnJvbVF1ZXJ5KSB7XG4gICAgICAgICAgICBjb2x1bW4xTmFtZSA9IChhcmd1bWVudHNbMF0gYXMgQ29sdW1uRnJvbVF1ZXJ5KS50b1N0cmluZygpO1xuICAgICAgICAgICAgY29sdW1uMk5hbWUgPSAoYXJndW1lbnRzWzJdIGFzIENvbHVtbkZyb21RdWVyeSkudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlUmF3KGAke2NvbHVtbjFOYW1lfSAke29wZXJhdG9yfSAke2NvbHVtbjJOYW1lfWApO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29sdW1uMU5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uYXJndW1lbnRzWzBdLnNwbGl0KFwiLlwiKSk7XG4gICAgICAgICAgICBpZiAoIXRoaXMucGFyZW50VHlwZWRRdWVyeUJ1aWxkZXIpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BhcmVudCBxdWVyeSBidWlsZGVyIGlzIG1pc3NpbmcsIFwid2hlcmVDb2x1bW5cIiBjYW4gb25seSBiZSB1c2VkIGluIHN1Yi1xdWVyeS4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbHVtbjJOYW1lID0gdGhpcy5wYXJlbnRUeXBlZFF1ZXJ5QnVpbGRlci5nZXRDb2x1bW5OYW1lKC4uLmFyZ3VtZW50c1syXS5zcGxpdChcIi5cIikpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sdW1uMU5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4udGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oYXJndW1lbnRzWzBdKSk7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzJdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMk5hbWUgPSBhcmd1bWVudHNbMl07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGFyZ3VtZW50c1syXS5tZW1vcmllcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29sdW1uMk5hbWUgPSBhcmd1bWVudHNbMl0uZ2V0Q29sdW1uTmFtZTsgLy8gcGFyZW50IHRoaXMgbmVlZGVkIC4uLlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2x1bW4yTmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZSguLi50aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmd1bWVudHNbMl0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLndoZXJlUmF3KGA/PyAke29wZXJhdG9yfSA/P2AsIFtjb2x1bW4xTmFtZSwgY29sdW1uMk5hbWVdKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgdG9RdWVyeSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlCdWlsZGVyLnRvUXVlcnkoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTnVsbC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3ROdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLndoZXJlTm90TnVsbC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgb3JXaGVyZU51bGwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIub3JXaGVyZU51bGwuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIG9yV2hlcmVOb3ROdWxsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVOb3ROdWxsLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oZjogYW55KSB7XG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIGYuc3BsaXQoXCIuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgeyByb290LCBtZW1vcmllcyB9ID0gZ2V0UHJveHlBbmRNZW1vcmllcygpO1xuXG4gICAgICAgIGYocm9vdCk7XG5cbiAgICAgICAgcmV0dXJuIG1lbW9yaWVzO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBmaW5kQnlQcmltYXJ5S2V5KCkge1xuICAgICAgICBjb25zdCBwcmltYXJ5S2V5Q29sdW1uSW5mbyA9IGdldFByaW1hcnlLZXlDb2x1bW4odGhpcy50YWJsZUNsYXNzKTtcblxuICAgICAgICBjb25zdCBwcmltYXJ5S2V5VmFsdWUgPSBhcmd1bWVudHNbMF07XG5cbiAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50c0xpc3Q7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb25zdCBbLCAuLi5jb2x1bW5Bcmd1bWVudHNdID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzTGlzdCA9IGNvbHVtbkFyZ3VtZW50cy5tYXAoKGNvbmNhdEtleTogc3RyaW5nKSA9PiBjb25jYXRLZXkuc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5Bcmd1bWVudHMgb2YgY29sdW1uQXJndW1lbnRzTGlzdCkge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuc2VsZWN0KHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5Bcmd1bWVudHMpICsgXCIgYXMgXCIgKyB0aGlzLmdldENvbHVtblNlbGVjdEFsaWFzKC4uLmNvbHVtbkFyZ3VtZW50cykpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIud2hlcmUocHJpbWFyeUtleUNvbHVtbkluZm8ubmFtZSwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShwcmltYXJ5S2V5VmFsdWUpKTtcblxuICAgICAgICBpZiAodGhpcy5vbmx5TG9nUXVlcnkpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlMb2cgKz0gdGhpcy5xdWVyeUJ1aWxkZXIudG9RdWVyeSgpICsgXCJcXG5cIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5QnVpbGRlci5maXJzdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlKCkge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb25jYXRLZXlDb2x1bW4odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmUuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZS5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3QoKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzBdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbmNhdEtleUNvbHVtbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdC5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjb2x1bW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmd1bWVudHNbMF0pO1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdCh0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShhcmd1bWVudHNbMV0pKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGFuZFdoZXJlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLmFuZFdoZXJlLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBvcldoZXJlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmUuYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlSW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmVJbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVOb3RJbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZU5vdEluLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cbiAgICBwdWJsaWMgb3JXaGVyZUluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVJbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVOb3RJbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci5vcldoZXJlTm90SW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlQmV0d2VlbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci53aGVyZUJldHdlZW4uYmluZCh0aGlzLnF1ZXJ5QnVpbGRlciksIC4uLmFyZ3VtZW50cyk7XG4gICAgfVxuICAgIHB1YmxpYyB3aGVyZU5vdEJldHdlZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24odGhpcy5xdWVyeUJ1aWxkZXIud2hlcmVOb3RCZXR3ZWVuLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBvcldoZXJlQmV0d2VlbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb2x1bW5GdW5jdGlvbih0aGlzLnF1ZXJ5QnVpbGRlci5vcldoZXJlQmV0d2Vlbi5iaW5kKHRoaXMucXVlcnlCdWlsZGVyKSwgLi4uYXJndW1lbnRzKTtcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVOb3RCZXR3ZWVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWxsS25leEZ1bmN0aW9uV2l0aENvbHVtbkZ1bmN0aW9uKHRoaXMucXVlcnlCdWlsZGVyLm9yV2hlcmVOb3RCZXR3ZWVuLmJpbmQodGhpcy5xdWVyeUJ1aWxkZXIpLCAuLi5hcmd1bWVudHMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBjYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKGZ1bmN0aW9uTmFtZTogc3RyaW5nLCB0eXBlT2ZTdWJRdWVyeTogYW55LCBmdW5jdGlvblRvQ2FsbDogYW55LCBncmFudWxhcml0eTogR3JhbnVsYXJpdHkgfCB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgdGhhdCA9IHRoaXMgYXMgYW55O1xuICAgICAgICBsZXQgc3ViUXVlcnlQcmVmaXg6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKFtcIndoZXJlRXhpc3RzXCIsIFwib3JXaGVyZUV4aXN0c1wiLCBcIndoZXJlTm90RXhpc3RzXCIsIFwib3JXaGVyZU5vdEV4aXN0c1wiLCBcImhhdmluZ0V4aXN0c1wiLCBcImhhdmluZ05vdEV4aXN0c1wiXS5pbmNsdWRlcyhmdW5jdGlvbk5hbWUpKSB7XG4gICAgICAgICAgICBzdWJRdWVyeVByZWZpeCA9IHRoaXMuZ2V0TmV4dFN1YlF1ZXJ5UHJlZml4KCk7XG4gICAgICAgIH1cbiAgICAgICAgKCh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpW2Z1bmN0aW9uTmFtZV0gYXMgKGNhbGxiYWNrOiBLbmV4LlF1ZXJ5Q2FsbGJhY2spID0+IEtuZXguUXVlcnlCdWlsZGVyKShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zdCBzdWJRdWVyeSA9IHRoaXM7XG4gICAgICAgICAgICBjb25zdCB7IHJvb3QsIG1lbW9yaWVzIH0gPSBnZXRQcm94eUFuZE1lbW9yaWVzKHRoYXQpO1xuXG4gICAgICAgICAgICBjb25zdCBzdWJRQiA9IG5ldyBUeXBlZFF1ZXJ5QnVpbGRlcih0eXBlT2ZTdWJRdWVyeSwgZ3JhbnVsYXJpdHksIHRoYXQua25leCwgc3ViUXVlcnksIHRoYXQsIHN1YlF1ZXJ5UHJlZml4KTtcbiAgICAgICAgICAgIHN1YlFCLmV4dHJhSm9pbmVkUHJvcGVydGllcyA9IHRoYXQuZXh0cmFKb2luZWRQcm9wZXJ0aWVzO1xuICAgICAgICAgICAgZnVuY3Rpb25Ub0NhbGwoc3ViUUIsIHJvb3QsIG1lbW9yaWVzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHVibGljIHNlbGVjdFF1ZXJ5KCkge1xuICAgICAgICB0aGlzLmhhc1NlbGVjdENsYXVzZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzJdO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IGFyZ3VtZW50c1szXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSBhcmd1bWVudHNbNF0gPz8gZ2V0VGFibGVNZXRhZGF0YSh0eXBlT2ZTdWJRdWVyeSkuZGVmYXVsdExvY2s7XG5cbiAgICAgICAgY29uc3QgeyByb290LCBtZW1vcmllcyB9ID0gZ2V0UHJveHlBbmRNZW1vcmllcyh0aGlzIGFzIGFueSk7XG5cbiAgICAgICAgY29uc3Qgc3ViUXVlcnlCdWlsZGVyID0gbmV3IFR5cGVkUXVlcnlCdWlsZGVyKHR5cGVPZlN1YlF1ZXJ5LCBncmFudWxhcml0eSwgdGhpcy5rbmV4LCB1bmRlZmluZWQsIHRoaXMpO1xuICAgICAgICBmdW5jdGlvblRvQ2FsbChzdWJRdWVyeUJ1aWxkZXIsIHJvb3QsIG1lbW9yaWVzKTtcblxuICAgICAgICAodGhpcy5zZWxlY3RSYXcgYXMgYW55KShuYW1lLCB1bmRlZmluZWQsIHN1YlF1ZXJ5QnVpbGRlci50b1F1ZXJ5KCkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgd2hlcmVQYXJlbnRoZXNlcygpIHtcbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwid2hlcmVcIiwgdGhpcy50YWJsZUNsYXNzLCBhcmd1bWVudHNbMF0sIHVuZGVmaW5lZCk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIHB1YmxpYyBvcldoZXJlUGFyZW50aGVzZXMoKSB7XG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIm9yV2hlcmVcIiwgdGhpcy50YWJsZUNsYXNzLCBhcmd1bWVudHNbMF0sIHVuZGVmaW5lZCk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlRXhpc3RzKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1swXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJ3aGVyZUV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIm9yV2hlcmVFeGlzdHNcIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlTm90RXhpc3RzKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1swXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJ3aGVyZU5vdEV4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgcHVibGljIG9yV2hlcmVOb3RFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcIm9yV2hlcmVOb3RFeGlzdHNcIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHdoZXJlUmF3KHNxbDogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIud2hlcmVSYXcoc3FsLCBiaW5kaW5ncyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmcoKSB7XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yID0gYXJndW1lbnRzWzFdO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0oYXJndW1lbnRzWzJdKTtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaGF2aW5nKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSksIG9wZXJhdG9yLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdJbigpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmhhdmluZ0luKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ05vdEluKCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0oYXJndW1lbnRzWzFdKTtcbiAgICAgICAgKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSkuaGF2aW5nTm90SW4odGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTnVsbCgpIHtcbiAgICAgICAgKHRoaXMucXVlcnlCdWlsZGVyIGFzIGFueSkuaGF2aW5nTnVsbCh0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ05vdE51bGwoKSB7XG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpLmhhdmluZ05vdE51bGwodGhpcy5nZXRDb2x1bW5OYW1lRnJvbUZ1bmN0aW9uT3JTdHJpbmcoYXJndW1lbnRzWzBdKSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXZpbmdFeGlzdHMoKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcImhhdmluZ0V4aXN0c1wiLCB0eXBlT2ZTdWJRdWVyeSwgZnVuY3Rpb25Ub0NhbGwsIGdyYW51bGFyaXR5KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGF2aW5nTm90RXhpc3RzKCkge1xuICAgICAgICBjb25zdCB0eXBlT2ZTdWJRdWVyeSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgY29uc3QgZ3JhbnVsYXJpdHkgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gKGFyZ3VtZW50c1sxXSBhcyBHcmFudWxhcml0eSkgOiBnZXRUYWJsZU1ldGFkYXRhKGFyZ3VtZW50c1swXSkuZGVmYXVsdExvY2s7XG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uVG9DYWxsID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcblxuICAgICAgICB0aGlzLmNhbGxRdWVyeUNhbGxiYWNrRnVuY3Rpb24oXCJoYXZpbmdOb3RFeGlzdHNcIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ1JhdyhzcWw6IHN0cmluZywgLi4uYmluZGluZ3M6IHN0cmluZ1tdKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmhhdmluZ1JhdyhzcWwsIGJpbmRpbmdzKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ0JldHdlZW4oKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShhcmd1bWVudHNbMV0pO1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5oYXZpbmdCZXR3ZWVuKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGhhdmluZ05vdEJldHdlZW4oKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShhcmd1bWVudHNbMV0pO1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5oYXZpbmdOb3RCZXR3ZWVuKHRoaXMuZ2V0Q29sdW1uTmFtZUZyb21GdW5jdGlvbk9yU3RyaW5nKGFyZ3VtZW50c1swXSksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIG9yZGVyQnlSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5vcmRlckJ5UmF3KHNxbCwgYmluZGluZ3MpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgdW5pb24oKSB7XG4gICAgICAgIGNvbnN0IHR5cGVPZlN1YlF1ZXJ5ID0gYXJndW1lbnRzWzBdO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eSA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyAoYXJndW1lbnRzWzFdIGFzIEdyYW51bGFyaXR5KSA6IGdldFRhYmxlTWV0YWRhdGEoYXJndW1lbnRzWzBdKS5kZWZhdWx0TG9jaztcbiAgICAgICAgY29uc3QgZnVuY3Rpb25Ub0NhbGwgPSB0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xuXG4gICAgICAgIHRoaXMuY2FsbFF1ZXJ5Q2FsbGJhY2tGdW5jdGlvbihcInVuaW9uXCIsIHR5cGVPZlN1YlF1ZXJ5LCBmdW5jdGlvblRvQ2FsbCwgZ3JhbnVsYXJpdHkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyB1bmlvbkFsbCgpIHtcbiAgICAgICAgY29uc3QgdHlwZU9mU3ViUXVlcnkgPSBhcmd1bWVudHNbMF07XG4gICAgICAgIGNvbnN0IGdyYW51bGFyaXR5ID0gdHlwZW9mIGFyZ3VtZW50c1sxXSA9PT0gXCJzdHJpbmdcIiA/IChhcmd1bWVudHNbMV0gYXMgR3JhbnVsYXJpdHkpIDogZ2V0VGFibGVNZXRhZGF0YShhcmd1bWVudHNbMF0pLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBmdW5jdGlvblRvQ2FsbCA9IHR5cGVvZiBhcmd1bWVudHNbMV0gPT09IFwic3RyaW5nXCIgPyBhcmd1bWVudHNbMl0gOiBhcmd1bWVudHNbMV07XG5cbiAgICAgICAgdGhpcy5jYWxsUXVlcnlDYWxsYmFja0Z1bmN0aW9uKFwidW5pb25BbGxcIiwgdHlwZU9mU3ViUXVlcnksIGZ1bmN0aW9uVG9DYWxsLCBncmFudWxhcml0eSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIHJldHVybmluZ0NvbHVtbigpIHtcbiAgICAgICAgdGhyb3cgbmV3IE5vdEltcGxlbWVudGVkRXJyb3IoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgcmV0dXJuaW5nQ29sdW1ucygpIHtcbiAgICAgICAgdGhyb3cgbmV3IE5vdEltcGxlbWVudGVkRXJyb3IoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgdHJhbnNhY3RpbmcodHJ4OiBLbmV4LlRyYW5zYWN0aW9uKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnRyYW5zYWN0aW5nKHRyeCk7XG5cbiAgICAgICAgdGhpcy50cmFuc2FjdGlvbiA9IHRyeDtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgbWluKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcIm1pblwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGNvdW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcImNvdW50XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgY291bnREaXN0aW5jdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJjb3VudERpc3RpbmN0XCIsIGFyZ3VtZW50c1swXSwgYXJndW1lbnRzWzFdKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbWF4KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mdW5jdGlvbldpdGhBbGlhcyhcIm1heFwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIHN1bSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJzdW1cIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBzdW1EaXN0aW5jdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJzdW1EaXN0aW5jdFwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGF2ZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJhdmdcIiwgYXJndW1lbnRzWzBdLCBhcmd1bWVudHNbMV0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBhdmdEaXN0aW5jdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZnVuY3Rpb25XaXRoQWxpYXMoXCJhdmdEaXN0aW5jdFwiLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSk7XG4gICAgfVxuXG4gICAgcHVibGljIGluY3JlbWVudCgpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5pbmNyZW1lbnQodGhpcy5nZXRDb2x1bW5OYW1lRnJvbUFyZ3VtZW50c0lnbm9yaW5nTGFzdFBhcmFtZXRlciguLi5hcmd1bWVudHMpLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBwdWJsaWMgZGVjcmVtZW50KCkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV07XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmRlY3JlbWVudCh0aGlzLmdldENvbHVtbk5hbWVGcm9tQXJndW1lbnRzSWdub3JpbmdMYXN0UGFyYW1ldGVyKC4uLmFyZ3VtZW50cyksIHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIHRydW5jYXRlKCkge1xuICAgICAgICBhd2FpdCB0aGlzLnF1ZXJ5QnVpbGRlci50cnVuY2F0ZSgpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBpbnNlcnRTZWxlY3QoKSB7XG4gICAgICAgIGNvbnN0IHRhYmxlTmFtZSA9IGdldFRhYmxlTmFtZShhcmd1bWVudHNbMF0pO1xuXG4gICAgICAgIGNvbnN0IHR5cGVkUXVlcnlCdWlsZGVyRm9ySW5zZXJ0ID0gbmV3IFR5cGVkUXVlcnlCdWlsZGVyPGFueSwgYW55Pihhcmd1bWVudHNbMF0sIHVuZGVmaW5lZCwgdGhpcy5rbmV4KTtcbiAgICAgICAgbGV0IGNvbHVtbkFyZ3VtZW50c0xpc3Q7XG4gICAgICAgIGlmICh0eXBlb2YgYXJndW1lbnRzWzFdID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb25zdCBbLCAuLi5jb2x1bW5Bcmd1bWVudHNdID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzTGlzdCA9IGNvbHVtbkFyZ3VtZW50cy5tYXAoKGNvbmNhdEtleTogc3RyaW5nKSA9PiBjb25jYXRLZXkuc3BsaXQoXCIuXCIpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGYgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICAgICBjb2x1bW5Bcmd1bWVudHNMaXN0ID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24zKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgaW5zZXJ0Q29sdW1ucyA9IGNvbHVtbkFyZ3VtZW50c0xpc3QubWFwKChpKSA9PiB0eXBlZFF1ZXJ5QnVpbGRlckZvckluc2VydC5nZXRDb2x1bW5OYW1lKC4uLmkpKTtcblxuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20va25leC9rbmV4L2lzc3Vlcy8xMDU2XG4gICAgICAgIGNvbnN0IHFiID0gdGhpcy5rbmV4LmZyb20odGhpcy5rbmV4LnJhdyhgPz8gKCR7aW5zZXJ0Q29sdW1ucy5tYXAoKCkgPT4gXCI/P1wiKS5qb2luKFwiLFwiKX0pYCwgW3RhYmxlTmFtZSwgLi4uaW5zZXJ0Q29sdW1uc10pKS5pbnNlcnQodGhpcy5rbmV4LnJhdyh0aGlzLnRvUXVlcnkoKSkpO1xuXG4gICAgICAgIGNvbnN0IGZpbmFsUXVlcnkgPSBxYi50b1N0cmluZygpO1xuICAgICAgICB0aGlzLnRvUXVlcnkgPSAoKSA9PiBmaW5hbFF1ZXJ5O1xuXG4gICAgICAgIGF3YWl0IHFiO1xuICAgIH1cblxuICAgIHB1YmxpYyBjbGVhclNlbGVjdCgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuY2xlYXJTZWxlY3QoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMgYXMgYW55O1xuICAgIH1cbiAgICBwdWJsaWMgY2xlYXJXaGVyZSgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuY2xlYXJXaGVyZSgpO1xuICAgICAgICByZXR1cm4gdGhpcyBhcyBhbnk7XG4gICAgfVxuICAgIHB1YmxpYyBjbGVhck9yZGVyKCkge1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KS5jbGVhck9yZGVyKCk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZGlzdGluY3QoKSB7XG4gICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLmRpc3RpbmN0KCk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgY2xvbmUoKSB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5QnVpbGRlckNsb25lID0gdGhpcy5xdWVyeUJ1aWxkZXIuY2xvbmUoKTtcblxuICAgICAgICBjb25zdCB0eXBlZFF1ZXJ5QnVpbGRlckNsb25lID0gbmV3IFR5cGVkUXVlcnlCdWlsZGVyPE1vZGVsVHlwZSwgUm93Pih0aGlzLnRhYmxlQ2xhc3MsIHRoaXMuZ3JhbnVsYXJpdHksIHRoaXMua25leCwgcXVlcnlCdWlsZGVyQ2xvbmUpO1xuXG4gICAgICAgIHJldHVybiB0eXBlZFF1ZXJ5QnVpbGRlckNsb25lIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ3JvdXBCeSgpIHtcbiAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuZ3JvdXBCeSh0aGlzLmdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhhcmd1bWVudHNbMF0pKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHVibGljIGdyb3VwQnlSYXcoc3FsOiBzdHJpbmcsIC4uLmJpbmRpbmdzOiBzdHJpbmdbXSkge1xuICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5ncm91cEJ5UmF3KHNxbCwgYmluZGluZ3MpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgdXNlS25leFF1ZXJ5QnVpbGRlcihmOiAocXVlcnk6IEtuZXguUXVlcnlCdWlsZGVyKSA9PiB2b2lkKSB7XG4gICAgICAgIGYodGhpcy5xdWVyeUJ1aWxkZXIpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0S25leFF1ZXJ5QnVpbGRlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucXVlcnlCdWlsZGVyO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRDb2x1bW5OYW1lKC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgZmlyc3RQYXJ0TmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyhrZXlzWzBdKTtcblxuICAgICAgICBpZiAoa2V5cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBmaXJzdFBhcnROYW1lO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IGNvbHVtbk5hbWUgPSBcIlwiO1xuICAgICAgICAgICAgbGV0IGNvbHVtbkFsaWFzO1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDbGFzcztcbiAgICAgICAgICAgIGxldCBjdXJyZW50Q29sdW1uUGFydDtcbiAgICAgICAgICAgIGNvbnN0IHByZWZpeCA9IGtleXMuc2xpY2UoMCwgLTEpLmpvaW4oXCIuXCIpO1xuICAgICAgICAgICAgY29uc3QgZXh0cmFKb2luZWRQcm9wZXJ0eSA9IHRoaXMuZXh0cmFKb2luZWRQcm9wZXJ0aWVzLmZpbmQoKGkpID0+IGkubmFtZSA9PT0gcHJlZml4KTtcbiAgICAgICAgICAgIGlmIChleHRyYUpvaW5lZFByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgY29sdW1uQWxpYXMgPSBleHRyYUpvaW5lZFByb3BlcnR5Lm5hbWU7XG4gICAgICAgICAgICAgICAgY3VycmVudENsYXNzID0gZXh0cmFKb2luZWRQcm9wZXJ0eS5wcm9wZXJ0eVR5cGU7XG4gICAgICAgICAgICAgICAgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihjdXJyZW50Q2xhc3MsIGtleXNba2V5cy5sZW5ndGggLSAxXSk7XG4gICAgICAgICAgICAgICAgY29sdW1uTmFtZSA9IGtleXMuc2xpY2UoMCwgLTEpLmpvaW4oXCJfXCIpICsgXCIuXCIgKyBjdXJyZW50Q29sdW1uUGFydC5uYW1lO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKHRoaXMudGFibGVDbGFzcywga2V5c1swXSk7XG4gICAgICAgICAgICAgICAgY29sdW1uQWxpYXMgPSBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2xhc3MgPSBjdXJyZW50Q29sdW1uUGFydC5jb2x1bW5DbGFzcztcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihjdXJyZW50Q2xhc3MsIGtleXNbaV0pO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbk5hbWUgPSBjb2x1bW5BbGlhcyArIFwiLlwiICsgKGtleXMubGVuZ3RoIC0gMSA9PT0gaSA/IGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWUgOiBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbkFsaWFzICs9IFwiX1wiICsgKGtleXMubGVuZ3RoIC0gMSA9PT0gaSA/IGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWUgOiBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleSk7XG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn0ke2NvbHVtbk5hbWV9YDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRDb2x1bW5OYW1lV2l0aERpZmZlcmVudFJvb3QoX3Jvb3RLZXk6IHN0cmluZywgLi4ua2V5czogc3RyaW5nW10pOiBzdHJpbmcge1xuICAgICAgICBjb25zdCBmaXJzdFBhcnROYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKGtleXNbMF0pO1xuXG4gICAgICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGZpcnN0UGFydE5hbWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgY3VycmVudENvbHVtblBhcnQgPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIGtleXNbMF0pO1xuXG4gICAgICAgICAgICBsZXQgY29sdW1uTmFtZSA9IFwiXCI7XG4gICAgICAgICAgICBsZXQgY29sdW1uQWxpYXMgPSBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleTtcbiAgICAgICAgICAgIGxldCBjdXJyZW50Q2xhc3MgPSBjdXJyZW50Q29sdW1uUGFydC5jb2x1bW5DbGFzcztcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24oY3VycmVudENsYXNzLCBrZXlzW2ldKTtcblxuICAgICAgICAgICAgICAgIGNvbHVtbk5hbWUgPSBjb2x1bW5BbGlhcyArIFwiLlwiICsgKGtleXMubGVuZ3RoIC0gMSA9PT0gaSA/IGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWUgOiBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleSk7XG4gICAgICAgICAgICAgICAgY29sdW1uQWxpYXMgKz0gXCJfXCIgKyAoa2V5cy5sZW5ndGggLSAxID09PSBpID8gY3VycmVudENvbHVtblBhcnQubmFtZSA6IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5KTtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q2xhc3MgPSBjdXJyZW50Q29sdW1uUGFydC5jb2x1bW5DbGFzcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjb2x1bW5OYW1lO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBmdW5jdGlvbldpdGhBbGlhcyhrbmV4RnVuY3Rpb25OYW1lOiBzdHJpbmcsIGY6IGFueSwgYWxpYXNOYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5oYXNTZWxlY3RDbGF1c2UgPSB0cnVlO1xuICAgICAgICAodGhpcy5xdWVyeUJ1aWxkZXIgYXMgYW55KVtrbmV4RnVuY3Rpb25OYW1lXShgJHt0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXNGcm9tRnVuY3Rpb25PclN0cmluZyhmKX0gYXMgJHthbGlhc05hbWV9YCk7XG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtbk5hbWVGcm9tRnVuY3Rpb25PclN0cmluZyhmOiBhbnkpIHtcbiAgICAgICAgbGV0IGNvbHVtblBhcnRzO1xuICAgICAgICBpZiAodHlwZW9mIGYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtblBhcnRzID0gZi5zcGxpdChcIi5cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2x1bW5QYXJ0cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGYpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Q29sdW1uTmFtZSguLi5jb2x1bW5QYXJ0cyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzRnJvbUZ1bmN0aW9uT3JTdHJpbmcoZjogYW55KSB7XG4gICAgICAgIGxldCBjb2x1bW5QYXJ0cztcbiAgICAgICAgaWYgKHR5cGVvZiBmID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb2x1bW5QYXJ0cyA9IGYuc3BsaXQoXCIuXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sdW1uUGFydHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihmKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLmdldENvbHVtbk5hbWVXaXRob3V0QWxpYXMoLi4uY29sdW1uUGFydHMpO1xuICAgIH1cblxuICAgIHByaXZhdGUgam9pbkNvbHVtbihqb2luVHlwZTogXCJpbm5lckpvaW5cIiB8IFwibGVmdE91dGVySm9pblwiLCBmOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCkge1xuICAgICAgICBsZXQgY29sdW1uVG9Kb2luQXJndW1lbnRzOiBzdHJpbmdbXTtcblxuICAgICAgICBpZiAodHlwZW9mIGYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbHVtblRvSm9pbkFyZ3VtZW50cyA9IGYuc3BsaXQoXCIuXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29sdW1uVG9Kb2luQXJndW1lbnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24oZik7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb2x1bW5Ub0pvaW5OYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtblRvSm9pbkFyZ3VtZW50cyk7XG5cbiAgICAgICAgbGV0IHNlY29uZENvbHVtbk5hbWUgPSBjb2x1bW5Ub0pvaW5Bcmd1bWVudHNbMF07XG4gICAgICAgIGxldCBzZWNvbmRDb2x1bW5BbGlhcyA9IGNvbHVtblRvSm9pbkFyZ3VtZW50c1swXTtcbiAgICAgICAgbGV0IHNlY29uZENvbHVtbkNsYXNzID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBzZWNvbmRDb2x1bW5OYW1lKS5jb2x1bW5DbGFzcztcblxuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGNvbHVtblRvSm9pbkFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgYmVmb3JlU2Vjb25kQ29sdW1uQWxpYXMgPSBzZWNvbmRDb2x1bW5BbGlhcztcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZVNlY29uZENvbHVtbkNsYXNzID0gc2Vjb25kQ29sdW1uQ2xhc3M7XG5cbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihiZWZvcmVTZWNvbmRDb2x1bW5DbGFzcywgY29sdW1uVG9Kb2luQXJndW1lbnRzW2ldKTtcbiAgICAgICAgICAgIHNlY29uZENvbHVtbk5hbWUgPSBjb2x1bW5JbmZvLm5hbWU7XG4gICAgICAgICAgICBzZWNvbmRDb2x1bW5BbGlhcyA9IGJlZm9yZVNlY29uZENvbHVtbkFsaWFzICsgXCJfXCIgKyBjb2x1bW5JbmZvLnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgc2Vjb25kQ29sdW1uQ2xhc3MgPSBjb2x1bW5JbmZvLmNvbHVtbkNsYXNzO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5OYW1lID0gZ2V0VGFibGVOYW1lKHNlY29uZENvbHVtbkNsYXNzKTtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5BbGlhcyA9IGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn0ke3NlY29uZENvbHVtbkFsaWFzfWA7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luSm9pbkNvbHVtbk5hbWUgPSBgJHt0YWJsZVRvSm9pbkFsaWFzfS4ke2dldFByaW1hcnlLZXlDb2x1bW4oc2Vjb25kQ29sdW1uQ2xhc3MpLm5hbWV9YDtcblxuICAgICAgICBjb25zdCBqb2luVGFibGVHcmFudWxhcml0eSA9IGdyYW51bGFyaXR5ID8/IGdldFRhYmxlTWV0YWRhdGEoc2Vjb25kQ29sdW1uQ2xhc3MpLmRlZmF1bHRMb2NrO1xuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWpvaW5UYWJsZUdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtqb2luVGFibGVHcmFudWxhcml0eX0pYDtcblxuICAgICAgICBjb25zdCB0YWJsZU5hbWVSYXcgPSB0aGlzLmtuZXgucmF3KGA/PyBhcyA/PyR7Z3JhbnVsYXJpdHlRdWVyeX1gLCBbdGFibGVUb0pvaW5OYW1lLCB0YWJsZVRvSm9pbkFsaWFzXSk7XG4gICAgICAgIGlmIChqb2luVHlwZSA9PT0gXCJpbm5lckpvaW5cIikge1xuICAgICAgICAgICAgdGhpcy5xdWVyeUJ1aWxkZXIuaW5uZXJKb2luKHRhYmxlTmFtZVJhdywgdGFibGVUb0pvaW5Kb2luQ29sdW1uTmFtZSwgY29sdW1uVG9Kb2luTmFtZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoam9pblR5cGUgPT09IFwibGVmdE91dGVySm9pblwiKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXJ5QnVpbGRlci5sZWZ0T3V0ZXJKb2luKHRhYmxlTmFtZVJhdywgdGFibGVUb0pvaW5Kb2luQ29sdW1uTmFtZSwgY29sdW1uVG9Kb2luTmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtbk5hbWVGcm9tQXJndW1lbnRzSWdub3JpbmdMYXN0UGFyYW1ldGVyKC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3QgYXJndW1lbnRzRXhjZXB0TGFzdCA9IGtleXMuc2xpY2UoMCwgLTEpO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmFyZ3VtZW50c0V4Y2VwdExhc3QpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyguLi5rZXlzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IGV4dHJhSm9pbmVkUHJvcGVydHkgPSB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5maW5kKChpKSA9PiBpLm5hbWUgPT09IGtleXNbMF0pO1xuICAgICAgICBpZiAoZXh0cmFKb2luZWRQcm9wZXJ0eSkge1xuICAgICAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGV4dHJhSm9pbmVkUHJvcGVydHkubmFtZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbihleHRyYUpvaW5lZFByb3BlcnR5LnByb3BlcnR5VHlwZSwga2V5c1sxXSk7XG4gICAgICAgICAgICByZXR1cm4gZXh0cmFKb2luZWRQcm9wZXJ0eS5uYW1lICsgXCIuXCIgKyBjb2x1bW5JbmZvLm5hbWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoa2V5cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIGtleXNbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAke3RoaXMuc3ViUXVlcnlQcmVmaXggPz8gXCJcIn0ke3RoaXMudGFibGVOYW1lfS4ke2NvbHVtbkluZm8ubmFtZX1gO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDb2x1bW5QYXJ0ID0gZ2V0Q29sdW1uSW5mb3JtYXRpb24odGhpcy50YWJsZUNsYXNzLCBrZXlzWzBdKTtcblxuICAgICAgICAgICAgbGV0IHJlc3VsdCA9IGN1cnJlbnRDb2x1bW5QYXJ0LnByb3BlcnR5S2V5O1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRDbGFzcyA9IGN1cnJlbnRDb2x1bW5QYXJ0LmNvbHVtbkNsYXNzO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50Q29sdW1uUGFydCA9IGdldENvbHVtbkluZm9ybWF0aW9uKGN1cnJlbnRDbGFzcywga2V5c1tpXSk7XG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IFwiLlwiICsgKGtleXMubGVuZ3RoIC0gMSA9PT0gaSA/IGN1cnJlbnRDb2x1bW5QYXJ0Lm5hbWUgOiBjdXJyZW50Q29sdW1uUGFydC5wcm9wZXJ0eUtleSk7XG4gICAgICAgICAgICAgICAgY3VycmVudENsYXNzID0gY3VycmVudENvbHVtblBhcnQuY29sdW1uQ2xhc3M7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENvbHVtblNlbGVjdEFsaWFzKC4uLmtleXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKGtleXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4ga2V5c1swXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBjb2x1bW5BbGlhcyA9IGtleXNbMF07XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5BbGlhcyArPSBcIi5cIiArIGtleXNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY29sdW1uQWxpYXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFwcGx5VGVtcG9yYWxDb252ZXJzaW9uc0ZvclJlYWQoaXRlbTogYW55KTogYW55IHtcbiAgICAgICAgaWYgKGl0ZW0gPT09IG51bGwgfHwgaXRlbSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShpdGVtKSkge1xuICAgICAgICAgICAgcmV0dXJuIGl0ZW0ubWFwKChpKSA9PiB0aGlzLmFwcGx5VGVtcG9yYWxDb252ZXJzaW9uc0ZvclJlYWQoaSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgcm9vdENvbHVtbnMgPSBnZXRDb2x1bW5Qcm9wZXJ0aWVzKHRoaXMudGFibGVDbGFzcyk7XG4gICAgICAgIGZvciAoY29uc3QgY29sIG9mIHJvb3RDb2x1bW5zKSB7XG4gICAgICAgICAgICB0aGlzLmNvbnZlcnRUZW1wb3JhbENvbHVtbkZvclJlYWQoaXRlbSwgY29sKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3Qgam9pbmVkIG9mIHRoaXMuZXh0cmFKb2luZWRQcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICBjb25zdCBuZXN0ZWRJdGVtID0gaXRlbVtqb2luZWQubmFtZV07XG4gICAgICAgICAgICBpZiAobmVzdGVkSXRlbSA9PT0gbnVsbCB8fCBuZXN0ZWRJdGVtID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgam9pbmVkQ29sdW1ucyA9IGdldENvbHVtblByb3BlcnRpZXMoam9pbmVkLnByb3BlcnR5VHlwZSk7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjb2wgb2Ygam9pbmVkQ29sdW1ucykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbnZlcnRUZW1wb3JhbENvbHVtbkZvclJlYWQobmVzdGVkSXRlbSwgY29sKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAvLyBqb2luZWQgdHlwZSBtYXkgbm90IGhhdmUgQENvbHVtbiBkZWNvcmF0b3JzIChlLmcuIENURXMpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaXRlbTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbnZlcnRUZW1wb3JhbENvbHVtbkZvclJlYWQoY29udGFpbmVyOiBhbnksIGNvbDogeyBwcm9wZXJ0eUtleTogc3RyaW5nOyBjb2x1bW5UeXBlOiBUZW1wb3JhbENvbHVtblR5cGUgfCBhbnkgfSB8IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoIWNvbCB8fCAhdGhpcy5pc1RlbXBvcmFsQ2xhc3MoY29sLmNvbHVtblR5cGUpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29sdW1uVHlwZTogVGVtcG9yYWxDb2x1bW5UeXBlID0gY29sLmNvbHVtblR5cGU7XG4gICAgICAgIGNvbnN0IHZhbCA9IGNvbnRhaW5lcltjb2wucHJvcGVydHlLZXldO1xuICAgICAgICBpZiAodmFsID09PSBudWxsIHx8IHZhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmFsIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAgICAgbGV0IGRhdGVTdHJpbmcgPSB2YWwudG9JU09TdHJpbmcoKTtcbiAgICAgICAgICAgIGlmIChjb2x1bW5UeXBlLm5hbWUgPT09IFwiUGxhaW5EYXRlXCIgfHwgY29sdW1uVHlwZS5uYW1lID09PSBcIlBsYWluTW9udGhEYXlcIiB8fCBjb2x1bW5UeXBlLm5hbWUgPT09IFwiUGxhaW5ZZWFyTW9udGhcIikge1xuICAgICAgICAgICAgICAgIGRhdGVTdHJpbmcgPSBkYXRlU3RyaW5nLnN1YnN0cmluZygwLCAxMCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNvbHVtblR5cGUubmFtZSA9PT0gXCJQbGFpbkRhdGVUaW1lXCIpIHtcbiAgICAgICAgICAgICAgICBkYXRlU3RyaW5nID0gZGF0ZVN0cmluZy5zdWJzdHJpbmcoMCwgMjMpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjb2x1bW5UeXBlLm5hbWUgPT09IFwiUGxhaW5UaW1lXCIpIHtcbiAgICAgICAgICAgICAgICBkYXRlU3RyaW5nID0gZGF0ZVN0cmluZy5zdWJzdHJpbmcoMTEsIDIzKS5wYWRFbmQoMTgsIFwiMFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRhaW5lcltjb2wucHJvcGVydHlLZXldID0gY29sdW1uVHlwZS5mcm9tKGRhdGVTdHJpbmcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29udGFpbmVyW2NvbC5wcm9wZXJ0eUtleV0gPSBjb2x1bW5UeXBlLmZyb20odmFsKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZmxhdHRlbkJ5T3B0aW9uKG86IGFueSwgZmxhdHRlbk9wdGlvbj86IEZsYXR0ZW5PcHRpb24pIHtcbiAgICAgICAgaWYgKGZsYXR0ZW5PcHRpb24gPT09IEZsYXR0ZW5PcHRpb24ubm9GbGF0dGVuIHx8IHRoaXMuc2hvdWxkVW5mbGF0dGVuID09PSBmYWxzZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYXBwbHlUZW1wb3JhbENvbnZlcnNpb25zRm9yUmVhZChvKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB1bmZsYXR0ZW5lZCA9IHVuZmxhdHRlbihvKTtcbiAgICAgICAgaWYgKGZsYXR0ZW5PcHRpb24gPT09IHVuZGVmaW5lZCB8fCBmbGF0dGVuT3B0aW9uID09PSBGbGF0dGVuT3B0aW9uLmZsYXR0ZW4pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFwcGx5VGVtcG9yYWxDb252ZXJzaW9uc0ZvclJlYWQodW5mbGF0dGVuZWQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmFwcGx5VGVtcG9yYWxDb252ZXJzaW9uc0ZvclJlYWQoc2V0VG9OdWxsKHVuZmxhdHRlbmVkKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBqb2luVGFibGVPbkZ1bmN0aW9uKHF1ZXJ5QnVpbGRlckpvaW46IEtuZXguSm9pbiwgbmV3UHJvcGVydHlLZXk6IGFueSwgbmV3UHJvcGVydHlUeXBlOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCwgb25GdW5jdGlvbjogKGpvaW46IElKb2luT25DbGF1c2UyPGFueSwgYW55PikgPT4gdm9pZCkge1xuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IG5ld1Byb3BlcnR5S2V5LFxuICAgICAgICAgICAgcHJvcGVydHlUeXBlOiBuZXdQcm9wZXJ0eVR5cGUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQ2xhc3MgPSBuZXdQcm9wZXJ0eVR5cGU7XG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luTmFtZSA9IGdldFRhYmxlTmFtZSh0YWJsZVRvSm9pbkNsYXNzKTtcbiAgICAgICAgY29uc3QgdGFibGVUb0pvaW5BbGlhcyA9IG5ld1Byb3BlcnR5S2V5O1xuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcblxuICAgICAgICBsZXQga25leE9uT2JqZWN0OiBhbnk7XG4gICAgICAgIGNvbnN0IHRhYmxlTmFtZVJhdyA9IHRoaXMua25leC5yYXcoYD8/IGFzID8/JHtncmFudWxhcml0eVF1ZXJ5fWAsIFt0YWJsZVRvSm9pbk5hbWUsIHRhYmxlVG9Kb2luQWxpYXNdKTtcbiAgICAgICAgcXVlcnlCdWlsZGVySm9pbih0YWJsZU5hbWVSYXcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGtuZXhPbk9iamVjdCA9IHRoaXM7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IG9uT2JqZWN0ID0gdGhpcy5nZXRUeXBlZEtuZXhPbk9iamVjdChuZXdQcm9wZXJ0eUtleSwgdGFibGVUb0pvaW5BbGlhcywga25leE9uT2JqZWN0KTtcbiAgICAgICAgb25GdW5jdGlvbihvbk9iamVjdCBhcyBhbnkpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFR5cGVkS25leE9uT2JqZWN0KG5ld1Byb3BlcnR5S2V5OiBhbnksIHRhYmxlVG9Kb2luQWxpYXM6IGFueSwga25leE9uT2JqZWN0OiBhbnkpIHtcbiAgICAgICAgY29uc3Qgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4gPSAoam9pbmVkQ29sdW1uOiBhbnksIG9wZXJhdG9yOiBhbnksIG1vZGVsQ29sdW1uOiBhbnksIGZ1bmN0aW9uTmFtZToga2V5b2YgS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICBsZXQgY29sdW1uMUFyZ3VtZW50cztcblxuICAgICAgICAgICAgaWYgKHR5cGVvZiBtb2RlbENvbHVtbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGNvbHVtbjFBcmd1bWVudHMgPSBtb2RlbENvbHVtbi5zcGxpdChcIi5cIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbHVtbjFBcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihtb2RlbENvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjb2x1bW4yTmFtZSA9IHRoaXMuZ2V0Q29sdW1uTmFtZVdpdGhvdXRBbGlhcyhuZXdQcm9wZXJ0eUtleSwgam9pbmVkQ29sdW1uKTtcblxuICAgICAgICAgICAga25leE9uT2JqZWN0W2Z1bmN0aW9uTmFtZV0odGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbjFBcmd1bWVudHMpLCBvcGVyYXRvciwgY29sdW1uMk5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG9uV2l0aENvbHVtbk9wZXJhdG9yVmFsdWUgPSAoam9pbmVkTW9kZWxDb2x1bW46IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSwgZnVuY3Rpb25OYW1lOiBrZXlvZiBLbmV4LkpvaW5DbGF1c2UpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbjJOYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lV2l0aG91dEFsaWFzKG5ld1Byb3BlcnR5S2V5LCBqb2luZWRNb2RlbENvbHVtbik7XG4gICAgICAgICAgICBrbmV4T25PYmplY3RbZnVuY3Rpb25OYW1lXShjb2x1bW4yTmFtZSwgb3BlcmF0b3IsIHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0odmFsdWUpKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3Qgb25XaXRoTW9kZWxDb2x1bW5PcGVyYXRvclZhbHVlID0gKG1vZGVsQ29sdW1uOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnksIGZ1bmN0aW9uTmFtZToga2V5b2YgS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICBsZXQgY29sdW1uQXJndW1lbnRzO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBtb2RlbENvbHVtbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50cyA9IG1vZGVsQ29sdW1uLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24obW9kZWxDb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAga25leE9uT2JqZWN0W2Z1bmN0aW9uTmFtZV0odGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cyksIG9wZXJhdG9yLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKHZhbHVlKSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgb25OdWxsVmFsdWUgPSAoam9pbmVkTW9kZWxDb2x1bW46IGFueSwgZnVuY3Rpb25OYW1lOiBrZXlvZiBLbmV4LkpvaW5DbGF1c2UpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50cyA9IHRoaXMuZ2V0QXJndW1lbnRzRnJvbUNvbHVtbkZ1bmN0aW9uKGpvaW5lZE1vZGVsQ29sdW1uKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbkFyZ3VtZW50c1dpdGhKb2luZWRUYWJsZSA9IFt0YWJsZVRvSm9pbkFsaWFzLCAuLi5jb2x1bW5Bcmd1bWVudHNdO1xuXG4gICAgICAgICAgICBrbmV4T25PYmplY3RbZnVuY3Rpb25OYW1lXShjb2x1bW5Bcmd1bWVudHNXaXRoSm9pbmVkVGFibGUuam9pbihcIi5cIikpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBvbk51bGxNb2RlbFZhbHVlID0gKG1vZGVsQ29sdW1uOiBhbnksIGZ1bmN0aW9uTmFtZToga2V5b2YgS25leC5Kb2luQ2xhdXNlKSA9PiB7XG4gICAgICAgICAgICBsZXQgY29sdW1uQXJndW1lbnRzO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBtb2RlbENvbHVtbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGNvbHVtbkFyZ3VtZW50cyA9IG1vZGVsQ29sdW1uLnNwbGl0KFwiLlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sdW1uQXJndW1lbnRzID0gdGhpcy5nZXRBcmd1bWVudHNGcm9tQ29sdW1uRnVuY3Rpb24obW9kZWxDb2x1bW4pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBrbmV4T25PYmplY3RbZnVuY3Rpb25OYW1lXSh0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgb25PYmplY3QgPSB7XG4gICAgICAgICAgICBvbkNvbHVtbnM6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIGNvbHVtbjI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aEpvaW5lZENvbHVtbk9wZXJhdG9yQ29sdW1uKGNvbHVtbjIsIG9wZXJhdG9yLCBjb2x1bW4xLCBcIm9uXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbjogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgY29sdW1uMjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4oY29sdW1uMSwgb3BlcmF0b3IsIGNvbHVtbjIsIFwib25cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFuZE9uOiAoY29sdW1uMTogYW55LCBvcGVyYXRvcjogYW55LCBjb2x1bW4yOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhKb2luZWRDb2x1bW5PcGVyYXRvckNvbHVtbihjb2x1bW4xLCBvcGVyYXRvciwgY29sdW1uMiwgXCJhbmRPblwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPbjogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgY29sdW1uMjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoSm9pbmVkQ29sdW1uT3BlcmF0b3JDb2x1bW4oY29sdW1uMSwgb3BlcmF0b3IsIGNvbHVtbjIsIFwib3JPblwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25WYWw6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhDb2x1bW5PcGVyYXRvclZhbHVlKGNvbHVtbjEsIG9wZXJhdG9yLCB2YWx1ZSwgXCJvblZhbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYW5kT25WYWw6IChjb2x1bW4xOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhDb2x1bW5PcGVyYXRvclZhbHVlKGNvbHVtbjEsIG9wZXJhdG9yLCB2YWx1ZSwgXCJhbmRPblZhbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblZhbDogKGNvbHVtbjE6IGFueSwgb3BlcmF0b3I6IGFueSwgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uV2l0aENvbHVtbk9wZXJhdG9yVmFsdWUoY29sdW1uMSwgb3BlcmF0b3IsIHZhbHVlLCBcIm9yT25WYWxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uTnVsbDogKGNvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsVmFsdWUoY29sdW1uLCBcIm9uTnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25Ob3ROdWxsOiAoY29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxWYWx1ZShjb2x1bW4sIFwib25Ob3ROdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uTnVsbDogKGNvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsVmFsdWUoY29sdW1uLCBcIm9yT25OdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uTm90TnVsbDogKGNvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsVmFsdWUoY29sdW1uLCBcIm9yT25Ob3ROdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhbmRPbk51bGw6IChjb2x1bW46IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIG9uTnVsbFZhbHVlKGNvbHVtbiwgXCJhbmRPbk51bGxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFuZE9uTm90TnVsbDogKGNvbHVtbjogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25OdWxsVmFsdWUoY29sdW1uLCBcImFuZE9uTm90TnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25QYXJlbnRoZXNlczogKG9uUGFyZW50aGVzZXNGdW5jdGlvbjogKGpvaW46IElKb2luT25DbGF1c2UyPGFueSwgYW55PikgPT4gdm9pZCkgPT4ge1xuICAgICAgICAgICAgICAgIGtuZXhPbk9iamVjdC5vbigob246IEtuZXguSm9pbkNsYXVzZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRoZXNlc09uT2JqZWN0ID0gdGhpcy5nZXRUeXBlZEtuZXhPbk9iamVjdChuZXdQcm9wZXJ0eUtleSwgdGFibGVUb0pvaW5BbGlhcywgb24pO1xuICAgICAgICAgICAgICAgICAgICBvblBhcmVudGhlc2VzRnVuY3Rpb24ocGFyZW50aGVzZXNPbk9iamVjdCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFuZE9uUGFyZW50aGVzZXM6IChvblBhcmVudGhlc2VzRnVuY3Rpb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxhbnksIGFueT4pID0+IHZvaWQpID0+IHtcbiAgICAgICAgICAgICAgICBrbmV4T25PYmplY3QuYW5kT24oKG9uOiBLbmV4LkpvaW5DbGF1c2UpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFyZW50aGVzZXNPbk9iamVjdCA9IHRoaXMuZ2V0VHlwZWRLbmV4T25PYmplY3QobmV3UHJvcGVydHlLZXksIHRhYmxlVG9Kb2luQWxpYXMsIG9uKTtcbiAgICAgICAgICAgICAgICAgICAgb25QYXJlbnRoZXNlc0Z1bmN0aW9uKHBhcmVudGhlc2VzT25PYmplY3QpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvck9uUGFyZW50aGVzZXM6IChvblBhcmVudGhlc2VzRnVuY3Rpb246IChqb2luOiBJSm9pbk9uQ2xhdXNlMjxhbnksIGFueT4pID0+IHZvaWQpID0+IHtcbiAgICAgICAgICAgICAgICBrbmV4T25PYmplY3Qub3JPbigob246IEtuZXguSm9pbkNsYXVzZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRoZXNlc09uT2JqZWN0ID0gdGhpcy5nZXRUeXBlZEtuZXhPbk9iamVjdChuZXdQcm9wZXJ0eUtleSwgdGFibGVUb0pvaW5BbGlhcywgb24pO1xuICAgICAgICAgICAgICAgICAgICBvblBhcmVudGhlc2VzRnVuY3Rpb24ocGFyZW50aGVzZXNPbk9iamVjdCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uUXVlcnlWYWw6IChtb2RlbENvbHVtbjogYW55LCBvcGVyYXRvcjogYW55LCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgb25XaXRoTW9kZWxDb2x1bW5PcGVyYXRvclZhbHVlKG1vZGVsQ29sdW1uLCBvcGVyYXRvciwgdmFsdWUsIFwib25WYWxcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uT2JqZWN0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9yT25RdWVyeVZhbDogKG1vZGVsQ29sdW1uOiBhbnksIG9wZXJhdG9yOiBhbnksIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbldpdGhNb2RlbENvbHVtbk9wZXJhdG9yVmFsdWUobW9kZWxDb2x1bW4sIG9wZXJhdG9yLCB2YWx1ZSwgXCJvck9uVmFsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblF1ZXJ5TnVsbDogKG1vZGVsQ29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxNb2RlbFZhbHVlKG1vZGVsQ29sdW1uLCBcIm9uTnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblF1ZXJ5TnVsbDogKG1vZGVsQ29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxNb2RlbFZhbHVlKG1vZGVsQ29sdW1uLCBcIm9yT25OdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblF1ZXJ5Tm90TnVsbDogKG1vZGVsQ29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxNb2RlbFZhbHVlKG1vZGVsQ29sdW1uLCBcIm9uTm90TnVsbFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblF1ZXJ5Tm90TnVsbDogKG1vZGVsQ29sdW1uOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBvbk51bGxNb2RlbFZhbHVlKG1vZGVsQ29sdW1uLCBcIm9yT25Ob3ROdWxsXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblJhdzogKHJhdzogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pID0+IHtcbiAgICAgICAgICAgICAgICBrbmV4T25PYmplY3Qub24oKG9uOiBLbmV4LkpvaW5DbGF1c2UpID0+IG9uLm9uKHRoaXMua25leC5yYXcocmF3LCBiaW5kaW5ncykpKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb25PYmplY3Q7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3JPblJhdzogKHJhdzogc3RyaW5nLCAuLi5iaW5kaW5nczogc3RyaW5nW10pID0+IHtcbiAgICAgICAgICAgICAgICBrbmV4T25PYmplY3Qub3JPbigob246IEtuZXguSm9pbkNsYXVzZSkgPT4gb24ub24odGhpcy5rbmV4LnJhdyhyYXcsIGJpbmRpbmdzKSkpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgYW55O1xuXG4gICAgICAgIHJldHVybiBvbk9iamVjdDtcbiAgICB9XG5cbiAgICAvLyBvbmNlIGFsbCBlbnZpcm9ubWVudHMgY2FuIHVzZSBuYXRpdmUgVGVtcG9yYWwsIHRoaXMgcHJvY2VzcyBzaG91bGQgYmUgc2ltcGxpZmllZFxuICAgIHByaXZhdGUgVEVNUE9SQUxfQ0xBU1NfTkFNRVM6IFJlYWRvbmx5PFNldDxzdHJpbmc+PiA9IG5ldyBTZXQoW1wiUGxhaW5EYXRlXCIsIFwiUGxhaW5EYXRlVGltZVwiLCBcIlBsYWluTW9udGhEYXlcIiwgXCJQbGFpblRpbWVcIiwgXCJQbGFpblllYXJNb250aFwiLCBcIlpvbmVkRGF0ZVRpbWVcIl0pO1xuICAgIHByaXZhdGUgaXNUZW1wb3JhbENsYXNzKGRlc2lnblR5cGU6IGFueSk6IGRlc2lnblR5cGUgaXMgVGVtcG9yYWxDb2x1bW5UeXBlIHtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIGRlc2lnblR5cGUgPT09IFRlbXBvcmFsLlBsYWluRGF0ZSB8fFxuICAgICAgICAgICAgZGVzaWduVHlwZSA9PT0gVGVtcG9yYWwuUGxhaW5EYXRlVGltZSB8fFxuICAgICAgICAgICAgZGVzaWduVHlwZSA9PT0gVGVtcG9yYWwuUGxhaW5Nb250aERheSB8fFxuICAgICAgICAgICAgZGVzaWduVHlwZSA9PT0gVGVtcG9yYWwuUGxhaW5UaW1lIHx8XG4gICAgICAgICAgICBkZXNpZ25UeXBlID09PSBUZW1wb3JhbC5QbGFpblllYXJNb250aCB8fFxuICAgICAgICAgICAgZGVzaWduVHlwZSA9PT0gVGVtcG9yYWwuWm9uZWREYXRlVGltZSB8fFxuICAgICAgICAgICAgLy8gZmFsbGJhY2sgZm9yIGVudmlyb25tZW50cyB3aGVyZSBUZW1wb3JhbCBjbGFzcyBkZWZpbml0aW9ucyBtYXkgZGlmZmVyXG4gICAgICAgICAgICAoZGVzaWduVHlwZSAmJiB0aGlzLlRFTVBPUkFMX0NMQVNTX05BTUVTLmhhcyhkZXNpZ25UeXBlLm5hbWUpICYmIHR5cGVvZiBkZXNpZ25UeXBlLmZyb20gPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgKTtcbiAgICB9XG4gICAgcHJpdmF0ZSBpc1RlbXBvcmFsVmFsdWUodmFsdWU6IGFueSk6IHZhbHVlIGlzIEluc3RhbmNlVHlwZTxUZW1wb3JhbENvbHVtblR5cGU+IHtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIHZhbHVlIGluc3RhbmNlb2YgVGVtcG9yYWwuUGxhaW5EYXRlIHx8XG4gICAgICAgICAgICB2YWx1ZSBpbnN0YW5jZW9mIFRlbXBvcmFsLlBsYWluRGF0ZVRpbWUgfHxcbiAgICAgICAgICAgIHZhbHVlIGluc3RhbmNlb2YgVGVtcG9yYWwuUGxhaW5Nb250aERheSB8fFxuICAgICAgICAgICAgdmFsdWUgaW5zdGFuY2VvZiBUZW1wb3JhbC5QbGFpblRpbWUgfHxcbiAgICAgICAgICAgIHZhbHVlIGluc3RhbmNlb2YgVGVtcG9yYWwuUGxhaW5ZZWFyTW9udGggfHxcbiAgICAgICAgICAgIHZhbHVlIGluc3RhbmNlb2YgVGVtcG9yYWwuWm9uZWREYXRlVGltZSB8fFxuICAgICAgICAgICAgLy8gZmFsbGJhY2sgZm9yIGVudmlyb25tZW50cyB3aGVyZSBUZW1wb3JhbCBjbGFzcyBkZWZpbml0aW9ucyBtYXkgZGlmZmVyXG4gICAgICAgICAgICAhISh2YWx1ZSAmJiB2YWx1ZS5jb25zdHJ1Y3RvciAmJiB0aGlzLlRFTVBPUkFMX0NMQVNTX05BTUVTLmhhcyh2YWx1ZS5jb25zdHJ1Y3Rvci5uYW1lKSAmJiB0eXBlb2YgdmFsdWUudG9TdHJpbmcgPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNvbnZlcnRUZW1wb3JhbFBhcmFtKHZhbHVlOiBhbnkpOiBhbnkge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoKHYpID0+IHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0odikpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmlzVGVtcG9yYWxWYWx1ZSh2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNhbGxLbmV4RnVuY3Rpb25XaXRoQ29sdW1uRnVuY3Rpb24oa25leEZ1bmN0aW9uOiBhbnksIC4uLmFyZ3M6IGFueVtdKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FsbEtuZXhGdW5jdGlvbldpdGhDb25jYXRLZXlDb2x1bW4oa25leEZ1bmN0aW9uLCAuLi5hcmdzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjb2x1bW5Bcmd1bWVudHMgPSB0aGlzLmdldEFyZ3VtZW50c0Zyb21Db2x1bW5GdW5jdGlvbihhcmdzWzBdKTtcblxuICAgICAgICBpZiAoYXJncy5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbih0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKSwgYXJnc1sxXSwgdGhpcy5jb252ZXJ0VGVtcG9yYWxQYXJhbShhcmdzWzJdKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBrbmV4RnVuY3Rpb24odGhpcy5nZXRDb2x1bW5OYW1lKC4uLmNvbHVtbkFyZ3VtZW50cyksIHRoaXMuY29udmVydFRlbXBvcmFsUGFyYW0oYXJnc1sxXSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBjYWxsS25leEZ1bmN0aW9uV2l0aENvbmNhdEtleUNvbHVtbihrbmV4RnVuY3Rpb246IGFueSwgLi4uYXJnczogYW55W10pIHtcbiAgICAgICAgY29uc3QgY29sdW1uQXJndW1lbnRzID0gYXJnc1swXS5zcGxpdChcIi5cIik7XG4gICAgICAgIGNvbnN0IGNvbHVtbk5hbWUgPSB0aGlzLmdldENvbHVtbk5hbWUoLi4uY29sdW1uQXJndW1lbnRzKTtcblxuICAgICAgICBpZiAoYXJncy5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbihjb2x1bW5OYW1lLCBhcmdzWzFdLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKGFyZ3NbMl0pKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGtuZXhGdW5jdGlvbihjb2x1bW5OYW1lLCB0aGlzLmNvbnZlcnRUZW1wb3JhbFBhcmFtKGFyZ3NbMV0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VsZWN0QWxsTW9kZWxQcm9wZXJ0aWVzKCkge1xuICAgICAgICBjb25zdCBwcm9wZXJ0aWVzID0gZ2V0Q29sdW1uUHJvcGVydGllcyh0aGlzLnRhYmxlQ2xhc3MpO1xuICAgICAgICBmb3IgKGNvbnN0IHByb3BlcnR5IG9mIHByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgIHRoaXMucXVlcnlCdWlsZGVyLnNlbGVjdChgJHtwcm9wZXJ0eS5uYW1lfSBhcyAke3Byb3BlcnR5LnByb3BlcnR5S2V5fWApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBqb2luKGpvaW5GdW5jdGlvbk5hbWU6IHN0cmluZywgdGFibGVUb0pvaW5BbGlhczogYW55LCB0YWJsZVRvSm9pbkNsYXNzOiBhbnksIGdyYW51bGFyaXR5OiBHcmFudWxhcml0eSB8IHVuZGVmaW5lZCwgam9pblRhYmxlQ29sdW1uU3RyaW5nOiBhbnksIG9wZXJhdG9yOiBhbnksIGV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmc6IGFueSkge1xuICAgICAgICB0aGlzLmV4dHJhSm9pbmVkUHJvcGVydGllcy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IHRhYmxlVG9Kb2luQWxpYXMsXG4gICAgICAgICAgICBwcm9wZXJ0eVR5cGU6IHRhYmxlVG9Kb2luQ2xhc3MsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlVG9Kb2luQWxpYXNXaXRoVW5kZXJzY29yZXMgPSB0YWJsZVRvSm9pbkFsaWFzLnNwbGl0KFwiLlwiKS5qb2luKFwiX1wiKTtcblxuICAgICAgICBjb25zdCB0YWJsZVRvSm9pbk5hbWUgPSBnZXRUYWJsZU5hbWUodGFibGVUb0pvaW5DbGFzcyk7XG5cbiAgICAgICAgY29uc3Qgam9pblRhYmxlQ29sdW1uSW5mb3JtYXRpb24gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0YWJsZVRvSm9pbkNsYXNzLCBqb2luVGFibGVDb2x1bW5TdHJpbmcpO1xuXG4gICAgICAgIGNvbnN0IGpvaW5UYWJsZUNvbHVtbkFyZ3VtZW50cyA9IGAke3RhYmxlVG9Kb2luQWxpYXNXaXRoVW5kZXJzY29yZXN9LiR7am9pblRhYmxlQ29sdW1uSW5mb3JtYXRpb24ubmFtZX1gO1xuXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nVGFibGVDb2x1bW5OYW1lID0gdGhpcy5nZXRDb2x1bW5OYW1lKC4uLmV4aXN0aW5nVGFibGVDb2x1bW5TdHJpbmcuc3BsaXQoXCIuXCIpKTtcblxuICAgICAgICBjb25zdCBncmFudWxhcml0eVF1ZXJ5ID0gIWdyYW51bGFyaXR5ID8gXCJcIiA6IGAgV0lUSCAoJHtncmFudWxhcml0eX0pYDtcbiAgICAgICAgY29uc3QgdGFibGVOYW1lUmF3ID0gdGhpcy5rbmV4LnJhdyhgPz8gYXMgPz8ke2dyYW51bGFyaXR5UXVlcnl9YCwgW3RhYmxlVG9Kb2luTmFtZSwgdGFibGVUb0pvaW5BbGlhc1dpdGhVbmRlcnNjb3Jlc10pO1xuXG4gICAgICAgICh0aGlzLnF1ZXJ5QnVpbGRlciBhcyBhbnkpW2pvaW5GdW5jdGlvbk5hbWVdKHRhYmxlTmFtZVJhdywgam9pblRhYmxlQ29sdW1uQXJndW1lbnRzLCBvcGVyYXRvciwgZXhpc3RpbmdUYWJsZUNvbHVtbk5hbWUpO1xuXG4gICAgICAgIHJldHVybiB0aGlzIGFzIGFueTtcbiAgICB9XG5cbiAgICBwdWJsaWMgbWFwUHJvcGVydHlOYW1lVG9Db2x1bW5OYW1lKHByb3BlcnR5TmFtZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbkluZm8gPSBnZXRDb2x1bW5JbmZvcm1hdGlvbih0aGlzLnRhYmxlQ2xhc3MsIHByb3BlcnR5TmFtZSk7XG4gICAgICAgIHJldHVybiBjb2x1bW5JbmZvLm5hbWU7XG4gICAgfVxuICAgIHB1YmxpYyBtYXBDb2x1bW5OYW1lVG9Qcm9wZXJ0eU5hbWUoY29sdW1uTmFtZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGNvbHVtblByb3BlcnRpZXMgPSBnZXRDb2x1bW5Qcm9wZXJ0aWVzKHRoaXMudGFibGVDbGFzcyk7XG4gICAgICAgIGNvbnN0IGNvbHVtblByb3BlcnR5ID0gY29sdW1uUHJvcGVydGllcy5maW5kKChpKSA9PiBpLm5hbWUgPT09IGNvbHVtbk5hbWUpO1xuICAgICAgICBpZiAoY29sdW1uUHJvcGVydHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZmluZCBjb2x1bW4gd2l0aCBuYW1lIFwiJHtjb2x1bW5OYW1lfVwiYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbHVtblByb3BlcnR5LnByb3BlcnR5S2V5O1xuICAgIH1cblxuICAgIHB1YmxpYyBtYXBDb2x1bW5zVG9Qcm9wZXJ0aWVzKGl0ZW06IGFueSkge1xuICAgICAgICBjb25zdCBjb2x1bW5OYW1lcyA9IE9iamVjdC5rZXlzKGl0ZW0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgY29sdW1uTmFtZSBvZiBjb2x1bW5OYW1lcykge1xuICAgICAgICAgICAgY29uc3QgcHJvcGVydHlOYW1lID0gdGhpcy5tYXBDb2x1bW5OYW1lVG9Qcm9wZXJ0eU5hbWUoY29sdW1uTmFtZSk7XG5cbiAgICAgICAgICAgIGlmIChjb2x1bW5OYW1lICE9PSBwcm9wZXJ0eU5hbWUpIHtcbiAgICAgICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoaXRlbSwgcHJvcGVydHlOYW1lLCBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGl0ZW0sIGNvbHVtbk5hbWUpISk7XG4gICAgICAgICAgICAgICAgZGVsZXRlIGl0ZW1bY29sdW1uTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgbWFwUHJvcGVydGllc1RvQ29sdW1ucyhpdGVtOiBhbnkpIHtcbiAgICAgICAgY29uc3QgY29sdW1uc0J5UHJvcGVydHlLZXkgPSBuZXcgTWFwKGdldENvbHVtblByb3BlcnRpZXModGhpcy50YWJsZUNsYXNzKS5tYXAoKGMpID0+IFtjLnByb3BlcnR5S2V5LCBjXSkpO1xuICAgICAgICBjb25zdCBwcm9wZXJ0eU5hbWVzID0gT2JqZWN0LmtleXMoaXRlbSk7XG5cbiAgICAgICAgZm9yIChjb25zdCBwcm9wZXJ0eU5hbWUgb2YgcHJvcGVydHlOYW1lcykge1xuICAgICAgICAgICAgY29uc3QgY29sID0gY29sdW1uc0J5UHJvcGVydHlLZXkuZ2V0KHByb3BlcnR5TmFtZSk7XG4gICAgICAgICAgICBjb25zdCB2YWwgPSBpdGVtW3Byb3BlcnR5TmFtZV07XG4gICAgICAgICAgICBpZiAodmFsICYmICh0aGlzLmlzVGVtcG9yYWxDbGFzcyhjb2w/LmNvbHVtblR5cGUpIHx8IHRoaXMuaXNUZW1wb3JhbFZhbHVlKHZhbCkpKSB7XG4gICAgICAgICAgICAgICAgaXRlbVtwcm9wZXJ0eU5hbWVdID0gdmFsLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbk5hbWUgPSB0aGlzLm1hcFByb3BlcnR5TmFtZVRvQ29sdW1uTmFtZShwcm9wZXJ0eU5hbWUpO1xuICAgICAgICAgICAgaWYgKGNvbHVtbk5hbWUgIT09IHByb3BlcnR5TmFtZSkge1xuICAgICAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShpdGVtLCBjb2x1bW5OYW1lLCBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGl0ZW0sIHByb3BlcnR5TmFtZSkhKTtcbiAgICAgICAgICAgICAgICBkZWxldGUgaXRlbVtwcm9wZXJ0eU5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuIl19
