import { Knex } from "knex";
export declare function validateTables(knex: Knex, tableNamesToValidate?: string[]): Promise<void>;
/**
 * @deprecated use `validateTables`.
 */
export declare const validateEntities: typeof validateTables;
