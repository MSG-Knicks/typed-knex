"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEntities = exports.validateTables = void 0;
const decorators_1 = require("./decorators");
async function validateTables(knex, tableNamesToValidate) {
    let tables = (0, decorators_1.getTables)();
    if (tableNamesToValidate) {
        tables = tables.filter((table) => tableNamesToValidate.includes(table.tableName));
    }
    for (const table of tables) {
        const doesTableExists = await knex.schema.hasTable(table.tableName);
        if (doesTableExists === false) {
            throw new Error(`Table "${table.tableName}" of class "${table.tableClass.name}" does not exist in database.`);
        }
        const columns = (0, decorators_1.getColumnProperties)(table.tableClass);
        for (const column of columns) {
            if (column.isForeignKey) {
                continue;
            }
            const doesColumnExists = await knex.schema.hasColumn(table.tableName, column.name);
            if (doesColumnExists === false) {
                throw new Error(`Column "${column.name}" of table "${table.tableName}" of class "${table.tableClass.name}" does not exist in database.`);
            }
        }
    }
}
exports.validateTables = validateTables;
/**
 * @deprecated use `validateTables`.
 */
exports.validateEntities = validateTables;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGVUYWJsZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvdmFsaWRhdGVUYWJsZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsNkNBQThEO0FBRXZELEtBQUssVUFBVSxjQUFjLENBQUMsSUFBVSxFQUFFLG9CQUErQjtJQUM1RSxJQUFJLE1BQU0sR0FBRyxJQUFBLHNCQUFTLEdBQUUsQ0FBQztJQUV6QixJQUFJLG9CQUFvQixFQUFFO1FBQ3RCLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7S0FDckY7SUFFRCxLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRTtRQUN4QixNQUFNLGVBQWUsR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVwRSxJQUFJLGVBQWUsS0FBSyxLQUFLLEVBQUU7WUFDM0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxVQUFVLEtBQUssQ0FBQyxTQUFTLGVBQWUsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLCtCQUErQixDQUFDLENBQUM7U0FDakg7UUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFBLGdDQUFtQixFQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUV0RCxLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sRUFBRTtZQUMxQixJQUFJLE1BQU0sQ0FBQyxZQUFZLEVBQUU7Z0JBQ3JCLFNBQVM7YUFDWjtZQUVELE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVuRixJQUFJLGdCQUFnQixLQUFLLEtBQUssRUFBRTtnQkFDNUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLE1BQU0sQ0FBQyxJQUFJLGVBQWUsS0FBSyxDQUFDLFNBQVMsZUFBZSxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksK0JBQStCLENBQUMsQ0FBQzthQUM1STtTQUNKO0tBQ0o7QUFDTCxDQUFDO0FBNUJELHdDQTRCQztBQUNEOztHQUVHO0FBQ1UsUUFBQSxnQkFBZ0IsR0FBRyxjQUFjLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBLbmV4IH0gZnJvbSBcImtuZXhcIjtcbmltcG9ydCB7IGdldENvbHVtblByb3BlcnRpZXMsIGdldFRhYmxlcyB9IGZyb20gXCIuL2RlY29yYXRvcnNcIjtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHZhbGlkYXRlVGFibGVzKGtuZXg6IEtuZXgsIHRhYmxlTmFtZXNUb1ZhbGlkYXRlPzogc3RyaW5nW10pIHtcbiAgICBsZXQgdGFibGVzID0gZ2V0VGFibGVzKCk7XG5cbiAgICBpZiAodGFibGVOYW1lc1RvVmFsaWRhdGUpIHtcbiAgICAgICAgdGFibGVzID0gdGFibGVzLmZpbHRlcigodGFibGUpID0+IHRhYmxlTmFtZXNUb1ZhbGlkYXRlLmluY2x1ZGVzKHRhYmxlLnRhYmxlTmFtZSkpO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgdGFibGUgb2YgdGFibGVzKSB7XG4gICAgICAgIGNvbnN0IGRvZXNUYWJsZUV4aXN0cyA9IGF3YWl0IGtuZXguc2NoZW1hLmhhc1RhYmxlKHRhYmxlLnRhYmxlTmFtZSk7XG5cbiAgICAgICAgaWYgKGRvZXNUYWJsZUV4aXN0cyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVGFibGUgXCIke3RhYmxlLnRhYmxlTmFtZX1cIiBvZiBjbGFzcyBcIiR7dGFibGUudGFibGVDbGFzcy5uYW1lfVwiIGRvZXMgbm90IGV4aXN0IGluIGRhdGFiYXNlLmApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29sdW1ucyA9IGdldENvbHVtblByb3BlcnRpZXModGFibGUudGFibGVDbGFzcyk7XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW4gb2YgY29sdW1ucykge1xuICAgICAgICAgICAgaWYgKGNvbHVtbi5pc0ZvcmVpZ25LZXkpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZG9lc0NvbHVtbkV4aXN0cyA9IGF3YWl0IGtuZXguc2NoZW1hLmhhc0NvbHVtbih0YWJsZS50YWJsZU5hbWUsIGNvbHVtbi5uYW1lKTtcblxuICAgICAgICAgICAgaWYgKGRvZXNDb2x1bW5FeGlzdHMgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb2x1bW4gXCIke2NvbHVtbi5uYW1lfVwiIG9mIHRhYmxlIFwiJHt0YWJsZS50YWJsZU5hbWV9XCIgb2YgY2xhc3MgXCIke3RhYmxlLnRhYmxlQ2xhc3MubmFtZX1cIiBkb2VzIG5vdCBleGlzdCBpbiBkYXRhYmFzZS5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbi8qKlxuICogQGRlcHJlY2F0ZWQgdXNlIGB2YWxpZGF0ZVRhYmxlc2AuXG4gKi9cbmV4cG9ydCBjb25zdCB2YWxpZGF0ZUVudGl0aWVzID0gdmFsaWRhdGVUYWJsZXM7XG4iXX0=
