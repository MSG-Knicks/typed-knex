"use strict";
var __createBinding =
    (this && this.__createBinding) ||
    (Object.create
        ? function (o, m, k, k2) {
              if (k2 === undefined) k2 = k;
              var desc = Object.getOwnPropertyDescriptor(m, k);
              if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                  desc = {
                      enumerable: true,
                      get: function () {
                          return m[k];
                      },
                  };
              }
              Object.defineProperty(o, k2, desc);
          }
        : function (o, m, k, k2) {
              if (k2 === undefined) k2 = k;
              o[k2] = m[k];
          });
var __setModuleDefault =
    (this && this.__setModuleDefault) ||
    (Object.create
        ? function (o, v) {
              Object.defineProperty(o, "default", { enumerable: true, value: v });
          }
        : function (o, v) {
              o["default"] = v;
          });
var __importStar =
    (this && this.__importStar) ||
    function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
        __setModuleDefault(result, mod);
        return result;
    };
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ts = __importStar(require("typescript"));
const testFilename = path.join(__dirname, "..", "test.ts");
function getDiagnostics(code) {
    fs.writeFileSync(testFilename, code);
    const options = {
        module: ts.ModuleKind.CommonJS,
        sourceMap: false,
        target: ts.ScriptTarget.ES2017,
        experimentalDecorators: true,
        strict: true,
        strictPropertyInitialization: false,
        noUnusedLocals: true,
        emitDecoratorMetadata: true,
        skipLibCheck: true,
        outDir: "build",
        noUnusedParameters: true,
        inlineSourceMap: true,
        inlineSources: true,
        noImplicitReturns: true,
        noImplicitThis: true,
        declaration: true,
    };
    const program = ts.createProgram([testFilename], options);
    const emitResult = program.emit();
    const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
    return allDiagnostics;
}
describe("compile time typed-knex string column parameters", function () {
    this.timeout(1000000);
    afterEach(() => {
        try {
            fs.unlinkSync(testFilename);
        } catch (_e) {}
    });
    it("should return type with properties from the selectColumn method", (done) => {
        const allDiagnostics = getDiagnostics(`
        import { knex} from 'knex';

        import { TypedKnex } from '../src/typedKnex';
        import { User } from './testTables';


        (async () => {

            const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
            const result = await typedKnex
                .query(User)
                .select('id')
                .getFirst();

            console.log(result.id);

        })();
    `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should error on calling property not used in selectColumn method", (done) => {
        const allDiagnostics = getDiagnostics(`
        import { knex} from 'knex';

        import { TypedKnex } from '../src/typedKnex';
        import { User } from './testTables';


        (async () => {

            const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
            const result = await typedKnex
                .query(User)
                .select('id')
                .getFirst();

            console.log(result.name);

        })();
    `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should return type with properties from the select method", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const result = await typedKnex
                    .query(User)
                    .select('id')
                    .getFirst();

                console.log(result.id);

            })();
            `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should error on calling property not used in select method", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const result = await typedKnex
                    .query(User)
                    .select('id')
                    .getFirst();

                console.log(result.name);

            })();
            `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should allow to call whereIn with type of property", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const query = typedKnex
                .query(User)
                .whereIn('name', ['user1', 'user2']);


            })();
            `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should error on calling whereIn with different type", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const query = typedKnex
                .query(User)
                .whereIn('name', [1]);

            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should allow to call whereBetween with type of property", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const query = typedKnex
                .query(User)
                .whereBetween('numericValue', [1,10]);


            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should error on calling whereBetween with different type", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const query = typedKnex
                .query(User)
                .whereBetween('numericValue', ['','']);

            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should error on calling whereBetween with array of more than 2", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const query = typedKnex
                .query(User)
                .whereBetween('numericValue', [1,2,3]);

            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should allow property of parent query in where exists", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User, UserSetting } from './testTables';


            (async () => {

                const query = typedKnex
                .query(User)
                .whereExists(UserSetting, (subQuery) => {

                    subQuery.whereColumns('user.id', '=', 'someValue');
                });


            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should not allow unknown property of parent query in where exists", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User, UserSetting } from './testTables';


            (async () => {

                const query = typedKnex
                .query(User)
                .whereExists(UserSetting, (subQuery) => {

                    subQuery.whereColumns('user.id', '=', 'unknown');
                });


            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should return type with properties from the min method", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const result = await typedKnex
                    .query(User)
                    .min('numericValue', 'minNumericValue')
                    .getFirst();

                console.log(result.minNumericValue);

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should error on calling property not used in min method", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const result = await typedKnex
                    .query(User)
                    .min('numericValue', 'minNumericValue')
                    .getFirst();

                console.log(result.id);

            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should return all Model properties after clearSelect", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const result = await typedKnex
                    .query(User)
                    .select('id')
                    .clearSelect()
                    .getFirst();

                    console.log(result.id);
                    console.log(result.name);

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    // it('should return correct type from findByColumn', done => {
    //     file = project.createSourceFile(
    //         'test/test4.ts',
    //         `
    //         import { knex} from 'knex';
    //         import { TypedKnex } from '../src/typedKnex';
    //         import { User } from './testTables';
    //         (async () => {
    //             const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
    //             const item = await typedKnex
    //             .query(User)
    //             .findByColumn('numericValue', 1, 'name');
    //             if (item !== undefined) {
    //                 console.log(item.name);
    //             }
    //         })();
    //     `
    //     );
    //     assert.equal(allDiagnostics.length, 0);
    //     done();
    // });
    it("should return correct type from findByPrimaryKey", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(User)
                .findByPrimaryKey("id", 'name');

                if (item !== undefined) {
                    console.log(item.name);
                }

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should findByPrimaryKey not accept objects in select", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(User)
                .findByPrimaryKey("id", 'category');

                if (item !== undefined) {
                    console.log(item.category);
                }

            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should findByPrimaryKey not accept optional objects in select", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(User)
                .findByPrimaryKey("id", 'optionalCategory');

                if (item !== undefined) {
                    console.log(item.optionalCategory);
                }

            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should findByPrimaryKey not accept nullable objects in select", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(User)
                .findByPrimaryKey("id", 'nullableCategory');

                if (item !== undefined) {
                    console.log(item.nullableCategory);
                }

            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should findByPrimaryKey accept Date objects in select", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(User)
                .findByPrimaryKey("id", 'birthDate');

                if (item !== undefined) {
                    console.log(item.birthDate);
                }

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should findByPrimaryKey accept unknown objects in select", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(User)
                .findByPrimaryKey("id", 'extraData');

                if (item !== undefined) {
                    console.log(item.extraData);
                }

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should findByPrimaryKey accept nullable Date objects in select", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(User)
                .findByPrimaryKey("id", 'deathDate');

                if (item !== undefined) {
                    console.log(item.deathDate);
                }

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should findByPrimaryKey accept nullable string objects in select", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(User)
                .findByPrimaryKey("id", 'someNullableValue');

                if (item !== undefined) {
                    console.log(item.someNullableValue);
                }

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should findByPrimaryKey accept optional string objects in select", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(User)
                .findByPrimaryKey("id", 'someOptionalValue');

                if (item !== undefined) {
                    console.log(item.someOptionalValue);
                }

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should return correct type from leftOuterJoinTableOnFunction", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User, UserSetting } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(UserSetting)
                .leftOuterJoinTableOnFunction('otherUser', User, join => {
                    join.on('id', '=', 'user2Id');
                })
                .select('otherUser.name', 'user2.numericValue')
                .getFirst();

                if (item !== undefined) {
                    console.log(item.user2.numericValue);
                    console.log(item.otherUser.name);
                }

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should not return type from leftOuterJoinTableOnFunction with not selected from joined table", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User, UserSetting } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(UserSetting)
                .leftOuterJoinTableOnFunction('otherUser', User, join => {
                    join.on('id', '=', 'user2Id');
                })
                .select('otherUser.name', 'user2.numericValue')
                .getFirst();

                if (item !== undefined) {
                    console.log(item.otherUser.id);
                }

            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should not return type from leftOuterJoinTableOnFunction with not selected from main table", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User, UserSetting } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(UserSetting)
                .leftOuterJoinTableOnFunction('otherUser', User, join => {
                    join.on('id', '=', 'user2Id');
                })
                .select('otherUser.name', 'user2.numericValue')
                .getFirst();

                if (item !== undefined) {
                    console.log(item.id);
                }

            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should  return any when keepFlat() is used", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User, UserSetting } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(UserSetting)
                .leftOuterJoinTableOnFunction('otherUser', User, join => {
                    join.on('id', '=', 'user2Id');
                })
                .select('otherUser.name', 'user2.numericValue')
                .keepFlat()
                .getSingle();


                console.log(item.doesNotExist);


            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should accept string column in orderBy", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const result = await typedKnex
                    .query(User)
                    .orderBy('id')
                    .getMany();

                console.log(result.length);

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should accept Date column in orderBy", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const result = await typedKnex
                    .query(User)
                    .orderBy('birthDate')
                    .getMany();

                console.log(result.length);

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should accept nullable Date column in orderBy", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const result = await typedKnex
                    .query(User)
                    .orderBy('deathDate')
                    .getMany();

                console.log(result.length);

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should not accept foreign key column in orderBy", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const result = await typedKnex
                    .query(User)
                    .orderBy(c=>c.category)
                    .getMany();

                console.log(result.length);

            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should return correct type from nested left outer join", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex} from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User, UserSetting } from './testTables';


            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                .query(UserSetting)
                .leftOuterJoin('otherUser', User, 'status', '=', 'otherValue')
                .leftOuterJoin('otherUser.otherOtherUser', User, 'status', '=', 'otherUser.status')
                .select('otherUser.otherOtherUser.name')
                .getFirst();

                if (item !== undefined) {
                    console.log(item.otherUser.otherOtherUser.name);
                }

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should fail if result of getSingleOrNull of query without select is used as object", (done) => {
        const allDiagnostics = getDiagnostics(`
        import { knex} from 'knex';

        import { TypedKnex } from '../src/typedKnex';
        import { User } from './testTables';


        (async () => {

            const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
            const result = await typedKnex
                .query(User)
                .getSingleOrNull();

            // result is User|null and this should fail
            console.log(result.id);

        })();
    `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should fail if result of getSingleOrUndefined of query without select is used as object", (done) => {
        const allDiagnostics = getDiagnostics(`
        import { knex} from 'knex';

        import { TypedKnex } from '../src/typedKnex';
        import { User } from './testTables';


        (async () => {

            const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
            const result = await typedKnex
                .query(User)
                .getSingleOrUndefined();

            // result is User|undefined and this should fail
            console.log(result.id);

        })();
    `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
    it("should accept granularity property in query", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex } from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User } from './testTables';

            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));
                const result = await typedKnex
                    .query(User, 'NOLOCK')
                    .select('id')
                    .getFirst();

                console.log(result.id);

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should accept granularity property in leftOuterJoinTableOnFunction", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex } from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User, UserSetting } from './testTables';

            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                    .query(UserSetting)
                    .leftOuterJoinTableOnFunction('otherUser', User, 'NOLOCK', join => {
                        join.on('id', '=', 'user2Id');
                    })
                    .select('otherUser.name', 'user2.numericValue')
                    .getFirst();

                if (item !== undefined) {
                    console.log(item.user2.numericValue);
                    console.log(item.otherUser.name);
                }

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should accept granularity property in leftOuterJoin", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex } from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User, UserSetting } from './testTables';

            (async () => {

                const typedKnex = new TypedKnex(knex({ client: 'postgresql' }));

                const item = await typedKnex
                    .query(UserSetting)
                    .leftOuterJoin('otherUser', User, 'NOLOCK', 'status', '=', 'otherValue')
                    .leftOuterJoin('otherUser.otherOtherUser', User, 'status', '=', 'otherUser.status')
                    .select('otherUser.otherOtherUser.name')
                    .getFirst();

                if (item !== undefined) {
                    console.log(item.otherUser.otherOtherUser.name);
                }

            })();
        `);
        chai_1.assert.equal(allDiagnostics.length, 0);
        done();
    });
    it("should accept granularity property in whereExists", (done) => {
        const allDiagnostics = getDiagnostics(`
            import { knex } from 'knex';

            import { TypedKnex } from '../src/typedKnex';
            import { User, UserSetting } from './testTables';

            (async () => {

                const query = typedKnex
                    .query(User)
                    .whereExists(UserSetting, 'NOLOCK', (subQuery) => {
                        subQuery.whereColumns('user.id', '=', 'someValue');
                    });
            })();
        `);
        chai_1.assert.notEqual(allDiagnostics.length, 0);
        done();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGlsYXRpb25UZXN0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3Rlc3QvY29tcGlsYXRpb24vY29tcGlsYXRpb25UZXN0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsK0JBQThCO0FBQzlCLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0IsK0NBQWlDO0FBRWpDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztBQUUzRCxTQUFTLGNBQWMsQ0FBQyxJQUFZO0lBQ2hDLEVBQUUsQ0FBQyxhQUFhLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBRXJDLE1BQU0sT0FBTyxHQUF1QjtRQUNoQyxNQUFNLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRO1FBQzlCLFNBQVMsRUFBRSxLQUFLO1FBQ2hCLE1BQU0sRUFBRSxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU07UUFDOUIsc0JBQXNCLEVBQUUsSUFBSTtRQUM1QixNQUFNLEVBQUUsSUFBSTtRQUNaLDRCQUE0QixFQUFFLEtBQUs7UUFDbkMsY0FBYyxFQUFFLElBQUk7UUFDcEIscUJBQXFCLEVBQUUsSUFBSTtRQUMzQixZQUFZLEVBQUUsSUFBSTtRQUNsQixNQUFNLEVBQUUsT0FBTztRQUNmLGtCQUFrQixFQUFFLElBQUk7UUFDeEIsZUFBZSxFQUFFLElBQUk7UUFDckIsYUFBYSxFQUFFLElBQUk7UUFDbkIsaUJBQWlCLEVBQUUsSUFBSTtRQUN2QixjQUFjLEVBQUUsSUFBSTtRQUNwQixXQUFXLEVBQUUsSUFBSTtLQUNwQixDQUFDO0lBRUYsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFlBQVksQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzFELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUVsQyxNQUFNLGNBQWMsR0FBRyxFQUFFLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUV4RixPQUFPLGNBQWMsQ0FBQztBQUMxQixDQUFDO0FBRUQsUUFBUSxDQUFDLGtEQUFrRCxFQUFFO0lBQ3pELElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFFdEIsU0FBUyxDQUFDLEdBQUcsRUFBRTtRQUNYLElBQUk7WUFDQSxFQUFFLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDO1NBQy9CO1FBQUMsT0FBTyxFQUFFLEVBQUUsR0FBRTtJQUNuQixDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxpRUFBaUUsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQzNFLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0tBa0J6QyxDQUFDLENBQUM7UUFFQyxhQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxrRUFBa0UsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQzVFLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0tBa0J6QyxDQUFDLENBQUM7UUFFQyxhQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFMUMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQywyREFBMkQsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ3JFLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7O2FBa0JqQyxDQUFDLENBQUM7UUFFUCxhQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyw0REFBNEQsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ3RFLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7O2FBa0JqQyxDQUFDLENBQUM7UUFFUCxhQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFMUMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxvREFBb0QsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQzlELE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7OzthQWdCakMsQ0FBQyxDQUFDO1FBRVAsYUFBTSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTFDLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMscURBQXFELEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUMvRCxNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUM7Ozs7Ozs7Ozs7Ozs7O1NBY3JDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUxQyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHlEQUF5RCxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDbkUsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7O1NBZ0JyQyxDQUFDLENBQUM7UUFDSCxhQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFMUMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQywwREFBMEQsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ3BFLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7U0FjckMsQ0FBQyxDQUFDO1FBQ0gsYUFBTSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTFDLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsZ0VBQWdFLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUMxRSxNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUM7Ozs7Ozs7Ozs7Ozs7O1NBY3JDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUxQyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHVEQUF1RCxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDakUsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FrQnJDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUxQyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLG1FQUFtRSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDN0UsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FrQnJDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUxQyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHdEQUF3RCxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDbEUsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FrQnJDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2QyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHlEQUF5RCxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDbkUsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FrQnJDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUxQyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHNEQUFzRCxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDaEUsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztTQW9CckMsQ0FBQyxDQUFDO1FBQ0gsYUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXZDLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFDLENBQUM7SUFFSCwrREFBK0Q7SUFDL0QsdUNBQXVDO0lBQ3ZDLDJCQUEyQjtJQUMzQixZQUFZO0lBQ1osc0NBQXNDO0lBRXRDLHdEQUF3RDtJQUN4RCwrQ0FBK0M7SUFFL0MseUJBQXlCO0lBRXpCLCtFQUErRTtJQUUvRSwyQ0FBMkM7SUFDM0MsMkJBQTJCO0lBQzNCLHdEQUF3RDtJQUV4RCx3Q0FBd0M7SUFDeEMsMENBQTBDO0lBQzFDLGdCQUFnQjtJQUVoQixnQkFBZ0I7SUFDaEIsUUFBUTtJQUNSLFNBQVM7SUFFVCw4Q0FBOEM7SUFFOUMsY0FBYztJQUNkLE1BQU07SUFFTixFQUFFLENBQUMsa0RBQWtELEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUM1RCxNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBb0JyQyxDQUFDLENBQUM7UUFDSCxhQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxzREFBc0QsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ2hFLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FvQnJDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUxQyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLCtEQUErRCxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDekUsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztTQW9CckMsQ0FBQyxDQUFDO1FBQ0gsYUFBTSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTFDLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsK0RBQStELEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUN6RSxNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBb0JyQyxDQUFDLENBQUM7UUFDSCxhQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFMUMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyx1REFBdUQsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ2pFLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FvQnJDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2QyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLDBEQUEwRCxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDcEUsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztTQW9CckMsQ0FBQyxDQUFDO1FBQ0gsYUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXZDLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsZ0VBQWdFLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUMxRSxNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBb0JyQyxDQUFDLENBQUM7UUFDSCxhQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxrRUFBa0UsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQzVFLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FvQnJDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2QyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLGtFQUFrRSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDNUUsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztTQW9CckMsQ0FBQyxDQUFDO1FBQ0gsYUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXZDLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsOERBQThELEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUN4RSxNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0F5QnJDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2QyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLDhGQUE4RixFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDeEcsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0F3QnJDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUxQyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLDRGQUE0RixFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDdEcsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0F3QnJDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUxQyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLDRDQUE0QyxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDdEQsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBeUJyQyxDQUFDLENBQUM7UUFDSCxhQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyx3Q0FBd0MsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ2xELE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBa0JyQyxDQUFDLENBQUM7UUFDSCxhQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxzQ0FBc0MsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ2hELE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBa0JyQyxDQUFDLENBQUM7UUFDSCxhQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQywrQ0FBK0MsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ3pELE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBa0JyQyxDQUFDLENBQUM7UUFDSCxhQUFNLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxpREFBaUQsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQzNELE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBa0JyQyxDQUFDLENBQUM7UUFDSCxhQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFMUMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyx3REFBd0QsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ2xFLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0F1QnJDLENBQUMsQ0FBQztRQUNILGFBQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2QyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLG9GQUFvRixFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDOUYsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7S0FrQnpDLENBQUMsQ0FBQztRQUVDLGFBQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUxQyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHlGQUF5RixFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDbkcsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7S0FrQnpDLENBQUMsQ0FBQztRQUVDLGFBQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUxQyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLDZDQUE2QyxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDdkQsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7OztTQWlCckMsQ0FBQyxDQUFDO1FBRUgsYUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXZDLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsb0VBQW9FLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUM5RSxNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztTQXdCckMsQ0FBQyxDQUFDO1FBQ0gsYUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXZDLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMscURBQXFELEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUMvRCxNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FzQnJDLENBQUMsQ0FBQztRQUVILGFBQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2QyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLG1EQUFtRCxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDN0QsTUFBTSxjQUFjLEdBQUcsY0FBYyxDQUFDOzs7Ozs7Ozs7Ozs7OztTQWNyQyxDQUFDLENBQUM7UUFFSCxhQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFMUMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcImNoYWlcIjtcbmltcG9ydCAqIGFzIGZzIGZyb20gXCJmc1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0ICogYXMgdHMgZnJvbSBcInR5cGVzY3JpcHRcIjtcblxuY29uc3QgdGVzdEZpbGVuYW1lID0gcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLlwiLCBcInRlc3QudHNcIik7XG5cbmZ1bmN0aW9uIGdldERpYWdub3N0aWNzKGNvZGU6IHN0cmluZykge1xuICAgIGZzLndyaXRlRmlsZVN5bmModGVzdEZpbGVuYW1lLCBjb2RlKTtcblxuICAgIGNvbnN0IG9wdGlvbnM6IHRzLkNvbXBpbGVyT3B0aW9ucyA9IHtcbiAgICAgICAgbW9kdWxlOiB0cy5Nb2R1bGVLaW5kLkNvbW1vbkpTLFxuICAgICAgICBzb3VyY2VNYXA6IGZhbHNlLFxuICAgICAgICB0YXJnZXQ6IHRzLlNjcmlwdFRhcmdldC5FUzIwMTcsXG4gICAgICAgIGV4cGVyaW1lbnRhbERlY29yYXRvcnM6IHRydWUsXG4gICAgICAgIHN0cmljdDogdHJ1ZSxcbiAgICAgICAgc3RyaWN0UHJvcGVydHlJbml0aWFsaXphdGlvbjogZmFsc2UsXG4gICAgICAgIG5vVW51c2VkTG9jYWxzOiB0cnVlLFxuICAgICAgICBlbWl0RGVjb3JhdG9yTWV0YWRhdGE6IHRydWUsXG4gICAgICAgIHNraXBMaWJDaGVjazogdHJ1ZSxcbiAgICAgICAgb3V0RGlyOiBcImJ1aWxkXCIsXG4gICAgICAgIG5vVW51c2VkUGFyYW1ldGVyczogdHJ1ZSxcbiAgICAgICAgaW5saW5lU291cmNlTWFwOiB0cnVlLFxuICAgICAgICBpbmxpbmVTb3VyY2VzOiB0cnVlLFxuICAgICAgICBub0ltcGxpY2l0UmV0dXJuczogdHJ1ZSxcbiAgICAgICAgbm9JbXBsaWNpdFRoaXM6IHRydWUsXG4gICAgICAgIGRlY2xhcmF0aW9uOiB0cnVlLFxuICAgIH07XG5cbiAgICBjb25zdCBwcm9ncmFtID0gdHMuY3JlYXRlUHJvZ3JhbShbdGVzdEZpbGVuYW1lXSwgb3B0aW9ucyk7XG4gICAgY29uc3QgZW1pdFJlc3VsdCA9IHByb2dyYW0uZW1pdCgpO1xuXG4gICAgY29uc3QgYWxsRGlhZ25vc3RpY3MgPSB0cy5nZXRQcmVFbWl0RGlhZ25vc3RpY3MocHJvZ3JhbSkuY29uY2F0KGVtaXRSZXN1bHQuZGlhZ25vc3RpY3MpO1xuXG4gICAgcmV0dXJuIGFsbERpYWdub3N0aWNzO1xufVxuXG5kZXNjcmliZShcImNvbXBpbGUgdGltZSB0eXBlZC1rbmV4IHN0cmluZyBjb2x1bW4gcGFyYW1ldGVyc1wiLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy50aW1lb3V0KDEwMDAwMDApO1xuXG4gICAgYWZ0ZXJFYWNoKCgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZzLnVubGlua1N5bmModGVzdEZpbGVuYW1lKTtcbiAgICAgICAgfSBjYXRjaCAoX2UpIHt9XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCByZXR1cm4gdHlwZSB3aXRoIHByb3BlcnRpZXMgZnJvbSB0aGUgc2VsZWN0Q29sdW1uIG1ldGhvZFwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgaW1wb3J0IHsgVHlwZWRLbmV4IH0gZnJvbSAnLi4vc3JjL3R5cGVkS25leCc7XG4gICAgICAgIGltcG9ydCB7IFVzZXIgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG5cbiAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgY29uc3QgdHlwZWRLbmV4ID0gbmV3IFR5cGVkS25leChrbmV4KHsgY2xpZW50OiAncG9zdGdyZXNxbCcgfSkpO1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgLnF1ZXJ5KFVzZXIpXG4gICAgICAgICAgICAgICAgLnNlbGVjdCgnaWQnKVxuICAgICAgICAgICAgICAgIC5nZXRGaXJzdCgpO1xuXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhyZXN1bHQuaWQpO1xuXG4gICAgICAgIH0pKCk7XG4gICAgYCk7XG5cbiAgICAgICAgYXNzZXJ0LmVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgZXJyb3Igb24gY2FsbGluZyBwcm9wZXJ0eSBub3QgdXNlZCBpbiBzZWxlY3RDb2x1bW4gbWV0aG9kXCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICBpbXBvcnQgeyBrbmV4fSBmcm9tICdrbmV4JztcblxuICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICBjb25zdCB0eXBlZEtuZXggPSBuZXcgVHlwZWRLbmV4KGtuZXgoeyBjbGllbnQ6ICdwb3N0Z3Jlc3FsJyB9KSk7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAucXVlcnkoVXNlcilcbiAgICAgICAgICAgICAgICAuc2VsZWN0KCdpZCcpXG4gICAgICAgICAgICAgICAgLmdldEZpcnN0KCk7XG5cbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHJlc3VsdC5uYW1lKTtcblxuICAgICAgICB9KSgpO1xuICAgIGApO1xuXG4gICAgICAgIGFzc2VydC5ub3RFcXVhbChhbGxEaWFnbm9zdGljcy5sZW5ndGgsIDApO1xuXG4gICAgICAgIGRvbmUoKTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIHJldHVybiB0eXBlIHdpdGggcHJvcGVydGllcyBmcm9tIHRoZSBzZWxlY3QgbWV0aG9kXCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICAgICAgaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAgICAgLnF1ZXJ5KFVzZXIpXG4gICAgICAgICAgICAgICAgICAgIC5zZWxlY3QoJ2lkJylcbiAgICAgICAgICAgICAgICAgICAgLmdldEZpcnN0KCk7XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXN1bHQuaWQpO1xuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICAgICAgYCk7XG5cbiAgICAgICAgYXNzZXJ0LmVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgZXJyb3Igb24gY2FsbGluZyBwcm9wZXJ0eSBub3QgdXNlZCBpbiBzZWxlY3QgbWV0aG9kXCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICAgICAgaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAgICAgLnF1ZXJ5KFVzZXIpXG4gICAgICAgICAgICAgICAgICAgIC5zZWxlY3QoJ2lkJylcbiAgICAgICAgICAgICAgICAgICAgLmdldEZpcnN0KCk7XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXN1bHQubmFtZSk7XG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgICAgICBgKTtcblxuICAgICAgICBhc3NlcnQubm90RXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBhbGxvdyB0byBjYWxsIHdoZXJlSW4gd2l0aCB0eXBlIG9mIHByb3BlcnR5XCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICAgICAgaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcbiAgICAgICAgICAgICAgICBjb25zdCBxdWVyeSA9IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgIC53aGVyZUluKCduYW1lJywgWyd1c2VyMScsICd1c2VyMiddKTtcblxuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICAgICAgYCk7XG5cbiAgICAgICAgYXNzZXJ0Lm5vdEVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgZXJyb3Igb24gY2FsbGluZyB3aGVyZUluIHdpdGggZGlmZmVyZW50IHR5cGVcIiwgKGRvbmUpID0+IHtcbiAgICAgICAgY29uc3QgYWxsRGlhZ25vc3RpY3MgPSBnZXREaWFnbm9zdGljcyhgXG4gICAgICAgICAgICBpbXBvcnQgeyBrbmV4fSBmcm9tICdrbmV4JztcblxuICAgICAgICAgICAgaW1wb3J0IHsgVHlwZWRLbmV4IH0gZnJvbSAnLi4vc3JjL3R5cGVkS25leCc7XG4gICAgICAgICAgICBpbXBvcnQgeyBVc2VyIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuXG4gICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgcXVlcnkgPSB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAucXVlcnkoVXNlcilcbiAgICAgICAgICAgICAgICAud2hlcmVJbignbmFtZScsIFsxXSk7XG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQubm90RXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBhbGxvdyB0byBjYWxsIHdoZXJlQmV0d2VlbiB3aXRoIHR5cGUgb2YgcHJvcGVydHlcIiwgKGRvbmUpID0+IHtcbiAgICAgICAgY29uc3QgYWxsRGlhZ25vc3RpY3MgPSBnZXREaWFnbm9zdGljcyhgXG4gICAgICAgICAgICBpbXBvcnQgeyBrbmV4fSBmcm9tICdrbmV4JztcblxuICAgICAgICAgICAgaW1wb3J0IHsgVHlwZWRLbmV4IH0gZnJvbSAnLi4vc3JjL3R5cGVkS25leCc7XG4gICAgICAgICAgICBpbXBvcnQgeyBVc2VyIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuXG4gICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZWRLbmV4ID0gbmV3IFR5cGVkS25leChrbmV4KHsgY2xpZW50OiAncG9zdGdyZXNxbCcgfSkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0gdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgLnF1ZXJ5KFVzZXIpXG4gICAgICAgICAgICAgICAgLndoZXJlQmV0d2VlbignbnVtZXJpY1ZhbHVlJywgWzEsMTBdKTtcblxuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICBgKTtcbiAgICAgICAgYXNzZXJ0Lm5vdEVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgZXJyb3Igb24gY2FsbGluZyB3aGVyZUJldHdlZW4gd2l0aCBkaWZmZXJlbnQgdHlwZVwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBxdWVyeSA9IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgIC53aGVyZUJldHdlZW4oJ251bWVyaWNWYWx1ZScsIFsnJywnJ10pO1xuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICBgKTtcbiAgICAgICAgYXNzZXJ0Lm5vdEVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgZXJyb3Igb24gY2FsbGluZyB3aGVyZUJldHdlZW4gd2l0aCBhcnJheSBvZiBtb3JlIHRoYW4gMlwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBxdWVyeSA9IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgIC53aGVyZUJldHdlZW4oJ251bWVyaWNWYWx1ZScsIFsxLDIsM10pO1xuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICBgKTtcbiAgICAgICAgYXNzZXJ0Lm5vdEVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgYWxsb3cgcHJvcGVydHkgb2YgcGFyZW50IHF1ZXJ5IGluIHdoZXJlIGV4aXN0c1wiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIsIFVzZXJTZXR0aW5nIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuXG4gICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgcXVlcnkgPSB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAucXVlcnkoVXNlcilcbiAgICAgICAgICAgICAgICAud2hlcmVFeGlzdHMoVXNlclNldHRpbmcsIChzdWJRdWVyeSkgPT4ge1xuXG4gICAgICAgICAgICAgICAgICAgIHN1YlF1ZXJ5LndoZXJlQ29sdW1ucygndXNlci5pZCcsICc9JywgJ3NvbWVWYWx1ZScpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQubm90RXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBub3QgYWxsb3cgdW5rbm93biBwcm9wZXJ0eSBvZiBwYXJlbnQgcXVlcnkgaW4gd2hlcmUgZXhpc3RzXCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICAgICAgaW1wb3J0IHsgVXNlciwgVXNlclNldHRpbmcgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBxdWVyeSA9IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgIC53aGVyZUV4aXN0cyhVc2VyU2V0dGluZywgKHN1YlF1ZXJ5KSA9PiB7XG5cbiAgICAgICAgICAgICAgICAgICAgc3ViUXVlcnkud2hlcmVDb2x1bW5zKCd1c2VyLmlkJywgJz0nLCAndW5rbm93bicpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQubm90RXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCByZXR1cm4gdHlwZSB3aXRoIHByb3BlcnRpZXMgZnJvbSB0aGUgbWluIG1ldGhvZFwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlZEtuZXggPSBuZXcgVHlwZWRLbmV4KGtuZXgoeyBjbGllbnQ6ICdwb3N0Z3Jlc3FsJyB9KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgICAgICAubWluKCdudW1lcmljVmFsdWUnLCAnbWluTnVtZXJpY1ZhbHVlJylcbiAgICAgICAgICAgICAgICAgICAgLmdldEZpcnN0KCk7XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXN1bHQubWluTnVtZXJpY1ZhbHVlKTtcblxuICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgYCk7XG4gICAgICAgIGFzc2VydC5lcXVhbChhbGxEaWFnbm9zdGljcy5sZW5ndGgsIDApO1xuXG4gICAgICAgIGRvbmUoKTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGVycm9yIG9uIGNhbGxpbmcgcHJvcGVydHkgbm90IHVzZWQgaW4gbWluIG1ldGhvZFwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlZEtuZXggPSBuZXcgVHlwZWRLbmV4KGtuZXgoeyBjbGllbnQ6ICdwb3N0Z3Jlc3FsJyB9KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgICAgICAubWluKCdudW1lcmljVmFsdWUnLCAnbWluTnVtZXJpY1ZhbHVlJylcbiAgICAgICAgICAgICAgICAgICAgLmdldEZpcnN0KCk7XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXN1bHQuaWQpO1xuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICBgKTtcbiAgICAgICAgYXNzZXJ0Lm5vdEVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgcmV0dXJuIGFsbCBNb2RlbCBwcm9wZXJ0aWVzIGFmdGVyIGNsZWFyU2VsZWN0XCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICAgICAgaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAgICAgLnF1ZXJ5KFVzZXIpXG4gICAgICAgICAgICAgICAgICAgIC5zZWxlY3QoJ2lkJylcbiAgICAgICAgICAgICAgICAgICAgLmNsZWFyU2VsZWN0KClcbiAgICAgICAgICAgICAgICAgICAgLmdldEZpcnN0KCk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2cocmVzdWx0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2cocmVzdWx0Lm5hbWUpO1xuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICBgKTtcbiAgICAgICAgYXNzZXJ0LmVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgLy8gaXQoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCB0eXBlIGZyb20gZmluZEJ5Q29sdW1uJywgZG9uZSA9PiB7XG4gICAgLy8gICAgIGZpbGUgPSBwcm9qZWN0LmNyZWF0ZVNvdXJjZUZpbGUoXG4gICAgLy8gICAgICAgICAndGVzdC90ZXN0NC50cycsXG4gICAgLy8gICAgICAgICBgXG4gICAgLy8gICAgICAgICBpbXBvcnQgeyBrbmV4fSBmcm9tICdrbmV4JztcblxuICAgIC8vICAgICAgICAgaW1wb3J0IHsgVHlwZWRLbmV4IH0gZnJvbSAnLi4vc3JjL3R5cGVkS25leCc7XG4gICAgLy8gICAgICAgICBpbXBvcnQgeyBVc2VyIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuICAgIC8vICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgIC8vICAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcblxuICAgIC8vICAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAvLyAgICAgICAgICAgICAucXVlcnkoVXNlcilcbiAgICAvLyAgICAgICAgICAgICAuZmluZEJ5Q29sdW1uKCdudW1lcmljVmFsdWUnLCAxLCAnbmFtZScpO1xuXG4gICAgLy8gICAgICAgICAgICAgaWYgKGl0ZW0gIT09IHVuZGVmaW5lZCkge1xuICAgIC8vICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhpdGVtLm5hbWUpO1xuICAgIC8vICAgICAgICAgICAgIH1cblxuICAgIC8vICAgICAgICAgfSkoKTtcbiAgICAvLyAgICAgYFxuICAgIC8vICAgICApO1xuXG4gICAgLy8gICAgIGFzc2VydC5lcXVhbChhbGxEaWFnbm9zdGljcy5sZW5ndGgsIDApO1xuXG4gICAgLy8gICAgIGRvbmUoKTtcbiAgICAvLyB9KTtcblxuICAgIGl0KFwic2hvdWxkIHJldHVybiBjb3JyZWN0IHR5cGUgZnJvbSBmaW5kQnlQcmltYXJ5S2V5XCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICAgICAgaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAucXVlcnkoVXNlcilcbiAgICAgICAgICAgICAgICAuZmluZEJ5UHJpbWFyeUtleShcImlkXCIsICduYW1lJyk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXRlbSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGl0ZW0ubmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICBgKTtcbiAgICAgICAgYXNzZXJ0LmVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgZmluZEJ5UHJpbWFyeUtleSBub3QgYWNjZXB0IG9iamVjdHMgaW4gc2VsZWN0XCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICAgICAgaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAucXVlcnkoVXNlcilcbiAgICAgICAgICAgICAgICAuZmluZEJ5UHJpbWFyeUtleShcImlkXCIsICdjYXRlZ29yeScpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhpdGVtLmNhdGVnb3J5KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQubm90RXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBmaW5kQnlQcmltYXJ5S2V5IG5vdCBhY2NlcHQgb3B0aW9uYWwgb2JqZWN0cyBpbiBzZWxlY3RcIiwgKGRvbmUpID0+IHtcbiAgICAgICAgY29uc3QgYWxsRGlhZ25vc3RpY3MgPSBnZXREaWFnbm9zdGljcyhgXG4gICAgICAgICAgICBpbXBvcnQgeyBrbmV4fSBmcm9tICdrbmV4JztcblxuICAgICAgICAgICAgaW1wb3J0IHsgVHlwZWRLbmV4IH0gZnJvbSAnLi4vc3JjL3R5cGVkS25leCc7XG4gICAgICAgICAgICBpbXBvcnQgeyBVc2VyIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuXG4gICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZWRLbmV4ID0gbmV3IFR5cGVkS25leChrbmV4KHsgY2xpZW50OiAncG9zdGdyZXNxbCcgfSkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgaXRlbSA9IGF3YWl0IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgIC5maW5kQnlQcmltYXJ5S2V5KFwiaWRcIiwgJ29wdGlvbmFsQ2F0ZWdvcnknKTtcblxuICAgICAgICAgICAgICAgIGlmIChpdGVtICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coaXRlbS5vcHRpb25hbENhdGVnb3J5KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQubm90RXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBmaW5kQnlQcmltYXJ5S2V5IG5vdCBhY2NlcHQgbnVsbGFibGUgb2JqZWN0cyBpbiBzZWxlY3RcIiwgKGRvbmUpID0+IHtcbiAgICAgICAgY29uc3QgYWxsRGlhZ25vc3RpY3MgPSBnZXREaWFnbm9zdGljcyhgXG4gICAgICAgICAgICBpbXBvcnQgeyBrbmV4fSBmcm9tICdrbmV4JztcblxuICAgICAgICAgICAgaW1wb3J0IHsgVHlwZWRLbmV4IH0gZnJvbSAnLi4vc3JjL3R5cGVkS25leCc7XG4gICAgICAgICAgICBpbXBvcnQgeyBVc2VyIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuXG4gICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZWRLbmV4ID0gbmV3IFR5cGVkS25leChrbmV4KHsgY2xpZW50OiAncG9zdGdyZXNxbCcgfSkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgaXRlbSA9IGF3YWl0IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgIC5maW5kQnlQcmltYXJ5S2V5KFwiaWRcIiwgJ251bGxhYmxlQ2F0ZWdvcnknKTtcblxuICAgICAgICAgICAgICAgIGlmIChpdGVtICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coaXRlbS5udWxsYWJsZUNhdGVnb3J5KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQubm90RXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBmaW5kQnlQcmltYXJ5S2V5IGFjY2VwdCBEYXRlIG9iamVjdHMgaW4gc2VsZWN0XCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICAgICAgaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAucXVlcnkoVXNlcilcbiAgICAgICAgICAgICAgICAuZmluZEJ5UHJpbWFyeUtleShcImlkXCIsICdiaXJ0aERhdGUnKTtcblxuICAgICAgICAgICAgICAgIGlmIChpdGVtICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coaXRlbS5iaXJ0aERhdGUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgYCk7XG4gICAgICAgIGFzc2VydC5lcXVhbChhbGxEaWFnbm9zdGljcy5sZW5ndGgsIDApO1xuXG4gICAgICAgIGRvbmUoKTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGZpbmRCeVByaW1hcnlLZXkgYWNjZXB0IHVua25vd24gb2JqZWN0cyBpbiBzZWxlY3RcIiwgKGRvbmUpID0+IHtcbiAgICAgICAgY29uc3QgYWxsRGlhZ25vc3RpY3MgPSBnZXREaWFnbm9zdGljcyhgXG4gICAgICAgICAgICBpbXBvcnQgeyBrbmV4fSBmcm9tICdrbmV4JztcblxuICAgICAgICAgICAgaW1wb3J0IHsgVHlwZWRLbmV4IH0gZnJvbSAnLi4vc3JjL3R5cGVkS25leCc7XG4gICAgICAgICAgICBpbXBvcnQgeyBVc2VyIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuXG4gICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZWRLbmV4ID0gbmV3IFR5cGVkS25leChrbmV4KHsgY2xpZW50OiAncG9zdGdyZXNxbCcgfSkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgaXRlbSA9IGF3YWl0IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgIC5maW5kQnlQcmltYXJ5S2V5KFwiaWRcIiwgJ2V4dHJhRGF0YScpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhpdGVtLmV4dHJhRGF0YSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICBgKTtcbiAgICAgICAgYXNzZXJ0LmVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgZmluZEJ5UHJpbWFyeUtleSBhY2NlcHQgbnVsbGFibGUgRGF0ZSBvYmplY3RzIGluIHNlbGVjdFwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlZEtuZXggPSBuZXcgVHlwZWRLbmV4KGtuZXgoeyBjbGllbnQ6ICdwb3N0Z3Jlc3FsJyB9KSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpdGVtID0gYXdhaXQgdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgLnF1ZXJ5KFVzZXIpXG4gICAgICAgICAgICAgICAgLmZpbmRCeVByaW1hcnlLZXkoXCJpZFwiLCAnZGVhdGhEYXRlJyk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXRlbSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGl0ZW0uZGVhdGhEYXRlKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQuZXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBmaW5kQnlQcmltYXJ5S2V5IGFjY2VwdCBudWxsYWJsZSBzdHJpbmcgb2JqZWN0cyBpbiBzZWxlY3RcIiwgKGRvbmUpID0+IHtcbiAgICAgICAgY29uc3QgYWxsRGlhZ25vc3RpY3MgPSBnZXREaWFnbm9zdGljcyhgXG4gICAgICAgICAgICBpbXBvcnQgeyBrbmV4fSBmcm9tICdrbmV4JztcblxuICAgICAgICAgICAgaW1wb3J0IHsgVHlwZWRLbmV4IH0gZnJvbSAnLi4vc3JjL3R5cGVkS25leCc7XG4gICAgICAgICAgICBpbXBvcnQgeyBVc2VyIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuXG4gICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZWRLbmV4ID0gbmV3IFR5cGVkS25leChrbmV4KHsgY2xpZW50OiAncG9zdGdyZXNxbCcgfSkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgaXRlbSA9IGF3YWl0IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgIC5maW5kQnlQcmltYXJ5S2V5KFwiaWRcIiwgJ3NvbWVOdWxsYWJsZVZhbHVlJyk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXRlbSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGl0ZW0uc29tZU51bGxhYmxlVmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgYCk7XG4gICAgICAgIGFzc2VydC5lcXVhbChhbGxEaWFnbm9zdGljcy5sZW5ndGgsIDApO1xuXG4gICAgICAgIGRvbmUoKTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGZpbmRCeVByaW1hcnlLZXkgYWNjZXB0IG9wdGlvbmFsIHN0cmluZyBvYmplY3RzIGluIHNlbGVjdFwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlZEtuZXggPSBuZXcgVHlwZWRLbmV4KGtuZXgoeyBjbGllbnQ6ICdwb3N0Z3Jlc3FsJyB9KSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpdGVtID0gYXdhaXQgdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgLnF1ZXJ5KFVzZXIpXG4gICAgICAgICAgICAgICAgLmZpbmRCeVByaW1hcnlLZXkoXCJpZFwiLCAnc29tZU9wdGlvbmFsVmFsdWUnKTtcblxuICAgICAgICAgICAgICAgIGlmIChpdGVtICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coaXRlbS5zb21lT3B0aW9uYWxWYWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICBgKTtcbiAgICAgICAgYXNzZXJ0LmVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgcmV0dXJuIGNvcnJlY3QgdHlwZSBmcm9tIGxlZnRPdXRlckpvaW5UYWJsZU9uRnVuY3Rpb25cIiwgKGRvbmUpID0+IHtcbiAgICAgICAgY29uc3QgYWxsRGlhZ25vc3RpY3MgPSBnZXREaWFnbm9zdGljcyhgXG4gICAgICAgICAgICBpbXBvcnQgeyBrbmV4fSBmcm9tICdrbmV4JztcblxuICAgICAgICAgICAgaW1wb3J0IHsgVHlwZWRLbmV4IH0gZnJvbSAnLi4vc3JjL3R5cGVkS25leCc7XG4gICAgICAgICAgICBpbXBvcnQgeyBVc2VyLCBVc2VyU2V0dGluZyB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAucXVlcnkoVXNlclNldHRpbmcpXG4gICAgICAgICAgICAgICAgLmxlZnRPdXRlckpvaW5UYWJsZU9uRnVuY3Rpb24oJ290aGVyVXNlcicsIFVzZXIsIGpvaW4gPT4ge1xuICAgICAgICAgICAgICAgICAgICBqb2luLm9uKCdpZCcsICc9JywgJ3VzZXIySWQnKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5zZWxlY3QoJ290aGVyVXNlci5uYW1lJywgJ3VzZXIyLm51bWVyaWNWYWx1ZScpXG4gICAgICAgICAgICAgICAgLmdldEZpcnN0KCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXRlbSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGl0ZW0udXNlcjIubnVtZXJpY1ZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coaXRlbS5vdGhlclVzZXIubmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICBgKTtcbiAgICAgICAgYXNzZXJ0LmVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgbm90IHJldHVybiB0eXBlIGZyb20gbGVmdE91dGVySm9pblRhYmxlT25GdW5jdGlvbiB3aXRoIG5vdCBzZWxlY3RlZCBmcm9tIGpvaW5lZCB0YWJsZVwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIsIFVzZXJTZXR0aW5nIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuXG4gICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZWRLbmV4ID0gbmV3IFR5cGVkS25leChrbmV4KHsgY2xpZW50OiAncG9zdGdyZXNxbCcgfSkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgaXRlbSA9IGF3YWl0IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyU2V0dGluZylcbiAgICAgICAgICAgICAgICAubGVmdE91dGVySm9pblRhYmxlT25GdW5jdGlvbignb3RoZXJVc2VyJywgVXNlciwgam9pbiA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGpvaW4ub24oJ2lkJywgJz0nLCAndXNlcjJJZCcpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnNlbGVjdCgnb3RoZXJVc2VyLm5hbWUnLCAndXNlcjIubnVtZXJpY1ZhbHVlJylcbiAgICAgICAgICAgICAgICAuZ2V0Rmlyc3QoKTtcblxuICAgICAgICAgICAgICAgIGlmIChpdGVtICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coaXRlbS5vdGhlclVzZXIuaWQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgYCk7XG4gICAgICAgIGFzc2VydC5ub3RFcXVhbChhbGxEaWFnbm9zdGljcy5sZW5ndGgsIDApO1xuXG4gICAgICAgIGRvbmUoKTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIG5vdCByZXR1cm4gdHlwZSBmcm9tIGxlZnRPdXRlckpvaW5UYWJsZU9uRnVuY3Rpb24gd2l0aCBub3Qgc2VsZWN0ZWQgZnJvbSBtYWluIHRhYmxlXCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICAgICAgaW1wb3J0IHsgVXNlciwgVXNlclNldHRpbmcgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlZEtuZXggPSBuZXcgVHlwZWRLbmV4KGtuZXgoeyBjbGllbnQ6ICdwb3N0Z3Jlc3FsJyB9KSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpdGVtID0gYXdhaXQgdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgLnF1ZXJ5KFVzZXJTZXR0aW5nKVxuICAgICAgICAgICAgICAgIC5sZWZ0T3V0ZXJKb2luVGFibGVPbkZ1bmN0aW9uKCdvdGhlclVzZXInLCBVc2VyLCBqb2luID0+IHtcbiAgICAgICAgICAgICAgICAgICAgam9pbi5vbignaWQnLCAnPScsICd1c2VyMklkJyk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuc2VsZWN0KCdvdGhlclVzZXIubmFtZScsICd1c2VyMi5udW1lcmljVmFsdWUnKVxuICAgICAgICAgICAgICAgIC5nZXRGaXJzdCgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhpdGVtLmlkKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQubm90RXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCAgcmV0dXJuIGFueSB3aGVuIGtlZXBGbGF0KCkgaXMgdXNlZFwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIsIFVzZXJTZXR0aW5nIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuXG4gICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZWRLbmV4ID0gbmV3IFR5cGVkS25leChrbmV4KHsgY2xpZW50OiAncG9zdGdyZXNxbCcgfSkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgaXRlbSA9IGF3YWl0IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyU2V0dGluZylcbiAgICAgICAgICAgICAgICAubGVmdE91dGVySm9pblRhYmxlT25GdW5jdGlvbignb3RoZXJVc2VyJywgVXNlciwgam9pbiA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGpvaW4ub24oJ2lkJywgJz0nLCAndXNlcjJJZCcpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnNlbGVjdCgnb3RoZXJVc2VyLm5hbWUnLCAndXNlcjIubnVtZXJpY1ZhbHVlJylcbiAgICAgICAgICAgICAgICAua2VlcEZsYXQoKVxuICAgICAgICAgICAgICAgIC5nZXRTaW5nbGUoKTtcblxuXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coaXRlbS5kb2VzTm90RXhpc3QpO1xuXG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQuZXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBhY2NlcHQgc3RyaW5nIGNvbHVtbiBpbiBvcmRlckJ5XCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICAgICAgaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAgICAgLnF1ZXJ5KFVzZXIpXG4gICAgICAgICAgICAgICAgICAgIC5vcmRlckJ5KCdpZCcpXG4gICAgICAgICAgICAgICAgICAgIC5nZXRNYW55KCk7XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXN1bHQubGVuZ3RoKTtcblxuICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgYCk7XG4gICAgICAgIGFzc2VydC5lcXVhbChhbGxEaWFnbm9zdGljcy5sZW5ndGgsIDApO1xuXG4gICAgICAgIGRvbmUoKTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGFjY2VwdCBEYXRlIGNvbHVtbiBpbiBvcmRlckJ5XCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leH0gZnJvbSAna25leCc7XG5cbiAgICAgICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICAgICAgaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAgICAgLnF1ZXJ5KFVzZXIpXG4gICAgICAgICAgICAgICAgICAgIC5vcmRlckJ5KCdiaXJ0aERhdGUnKVxuICAgICAgICAgICAgICAgICAgICAuZ2V0TWFueSgpO1xuXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2cocmVzdWx0Lmxlbmd0aCk7XG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQuZXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBhY2NlcHQgbnVsbGFibGUgRGF0ZSBjb2x1bW4gaW4gb3JkZXJCeVwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlZEtuZXggPSBuZXcgVHlwZWRLbmV4KGtuZXgoeyBjbGllbnQ6ICdwb3N0Z3Jlc3FsJyB9KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgICAgICAub3JkZXJCeSgnZGVhdGhEYXRlJylcbiAgICAgICAgICAgICAgICAgICAgLmdldE1hbnkoKTtcblxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHJlc3VsdC5sZW5ndGgpO1xuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICBgKTtcbiAgICAgICAgYXNzZXJ0LmVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgbm90IGFjY2VwdCBmb3JlaWduIGtleSBjb2x1bW4gaW4gb3JkZXJCeVwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlZEtuZXggPSBuZXcgVHlwZWRLbmV4KGtuZXgoeyBjbGllbnQ6ICdwb3N0Z3Jlc3FsJyB9KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgICAgICAub3JkZXJCeShjPT5jLmNhdGVnb3J5KVxuICAgICAgICAgICAgICAgICAgICAuZ2V0TWFueSgpO1xuXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2cocmVzdWx0Lmxlbmd0aCk7XG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQubm90RXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCByZXR1cm4gY29ycmVjdCB0eXBlIGZyb20gbmVzdGVkIGxlZnQgb3V0ZXIgam9pblwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIsIFVzZXJTZXR0aW5nIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuXG4gICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZWRLbmV4ID0gbmV3IFR5cGVkS25leChrbmV4KHsgY2xpZW50OiAncG9zdGdyZXNxbCcgfSkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgaXRlbSA9IGF3YWl0IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyU2V0dGluZylcbiAgICAgICAgICAgICAgICAubGVmdE91dGVySm9pbignb3RoZXJVc2VyJywgVXNlciwgJ3N0YXR1cycsICc9JywgJ290aGVyVmFsdWUnKVxuICAgICAgICAgICAgICAgIC5sZWZ0T3V0ZXJKb2luKCdvdGhlclVzZXIub3RoZXJPdGhlclVzZXInLCBVc2VyLCAnc3RhdHVzJywgJz0nLCAnb3RoZXJVc2VyLnN0YXR1cycpXG4gICAgICAgICAgICAgICAgLnNlbGVjdCgnb3RoZXJVc2VyLm90aGVyT3RoZXJVc2VyLm5hbWUnKVxuICAgICAgICAgICAgICAgIC5nZXRGaXJzdCgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhpdGVtLm90aGVyVXNlci5vdGhlck90aGVyVXNlci5uYW1lKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQuZXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBmYWlsIGlmIHJlc3VsdCBvZiBnZXRTaW5nbGVPck51bGwgb2YgcXVlcnkgd2l0aG91dCBzZWxlY3QgaXMgdXNlZCBhcyBvYmplY3RcIiwgKGRvbmUpID0+IHtcbiAgICAgICAgY29uc3QgYWxsRGlhZ25vc3RpY3MgPSBnZXREaWFnbm9zdGljcyhgXG4gICAgICAgIGltcG9ydCB7IGtuZXh9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgIGltcG9ydCB7IFR5cGVkS25leCB9IGZyb20gJy4uL3NyYy90eXBlZEtuZXgnO1xuICAgICAgICBpbXBvcnQgeyBVc2VyIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuXG4gICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgIGNvbnN0IHR5cGVkS25leCA9IG5ldyBUeXBlZEtuZXgoa25leCh7IGNsaWVudDogJ3Bvc3RncmVzcWwnIH0pKTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHR5cGVkS25leFxuICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgIC5nZXRTaW5nbGVPck51bGwoKTtcblxuICAgICAgICAgICAgLy8gcmVzdWx0IGlzIFVzZXJ8bnVsbCBhbmQgdGhpcyBzaG91bGQgZmFpbFxuICAgICAgICAgICAgY29uc29sZS5sb2cocmVzdWx0LmlkKTtcblxuICAgICAgICB9KSgpO1xuICAgIGApO1xuXG4gICAgICAgIGFzc2VydC5ub3RFcXVhbChhbGxEaWFnbm9zdGljcy5sZW5ndGgsIDApO1xuXG4gICAgICAgIGRvbmUoKTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGZhaWwgaWYgcmVzdWx0IG9mIGdldFNpbmdsZU9yVW5kZWZpbmVkIG9mIHF1ZXJ5IHdpdGhvdXQgc2VsZWN0IGlzIHVzZWQgYXMgb2JqZWN0XCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICBpbXBvcnQgeyBrbmV4fSBmcm9tICdrbmV4JztcblxuICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgaW1wb3J0IHsgVXNlciB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cblxuICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICBjb25zdCB0eXBlZEtuZXggPSBuZXcgVHlwZWRLbmV4KGtuZXgoeyBjbGllbnQ6ICdwb3N0Z3Jlc3FsJyB9KSk7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0eXBlZEtuZXhcbiAgICAgICAgICAgICAgICAucXVlcnkoVXNlcilcbiAgICAgICAgICAgICAgICAuZ2V0U2luZ2xlT3JVbmRlZmluZWQoKTtcblxuICAgICAgICAgICAgLy8gcmVzdWx0IGlzIFVzZXJ8dW5kZWZpbmVkIGFuZCB0aGlzIHNob3VsZCBmYWlsXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhyZXN1bHQuaWQpO1xuXG4gICAgICAgIH0pKCk7XG4gICAgYCk7XG5cbiAgICAgICAgYXNzZXJ0Lm5vdEVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgYWNjZXB0IGdyYW51bGFyaXR5IHByb3BlcnR5IGluIHF1ZXJ5XCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leCB9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIgfSBmcm9tICcuL3Rlc3RUYWJsZXMnO1xuXG4gICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuXG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZWRLbmV4ID0gbmV3IFR5cGVkS25leChrbmV4KHsgY2xpZW50OiAncG9zdGdyZXNxbCcgfSkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHR5cGVkS25leFxuICAgICAgICAgICAgICAgICAgICAucXVlcnkoVXNlciwgJ05PTE9DSycpXG4gICAgICAgICAgICAgICAgICAgIC5zZWxlY3QoJ2lkJylcbiAgICAgICAgICAgICAgICAgICAgLmdldEZpcnN0KCk7XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhyZXN1bHQuaWQpO1xuXG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICBgKTtcblxuICAgICAgICBhc3NlcnQuZXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBhY2NlcHQgZ3JhbnVsYXJpdHkgcHJvcGVydHkgaW4gbGVmdE91dGVySm9pblRhYmxlT25GdW5jdGlvblwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXggfSBmcm9tICdrbmV4JztcblxuICAgICAgICAgICAgaW1wb3J0IHsgVHlwZWRLbmV4IH0gZnJvbSAnLi4vc3JjL3R5cGVkS25leCc7XG4gICAgICAgICAgICBpbXBvcnQgeyBVc2VyLCBVc2VyU2V0dGluZyB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlZEtuZXggPSBuZXcgVHlwZWRLbmV4KGtuZXgoeyBjbGllbnQ6ICdwb3N0Z3Jlc3FsJyB9KSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpdGVtID0gYXdhaXQgdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyU2V0dGluZylcbiAgICAgICAgICAgICAgICAgICAgLmxlZnRPdXRlckpvaW5UYWJsZU9uRnVuY3Rpb24oJ290aGVyVXNlcicsIFVzZXIsICdOT0xPQ0snLCBqb2luID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGpvaW4ub24oJ2lkJywgJz0nLCAndXNlcjJJZCcpO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAuc2VsZWN0KCdvdGhlclVzZXIubmFtZScsICd1c2VyMi5udW1lcmljVmFsdWUnKVxuICAgICAgICAgICAgICAgICAgICAuZ2V0Rmlyc3QoKTtcblxuICAgICAgICAgICAgICAgIGlmIChpdGVtICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coaXRlbS51c2VyMi5udW1lcmljVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhpdGVtLm90aGVyVXNlci5uYW1lKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuICAgICAgICBhc3NlcnQuZXF1YWwoYWxsRGlhZ25vc3RpY3MubGVuZ3RoLCAwKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCBhY2NlcHQgZ3JhbnVsYXJpdHkgcHJvcGVydHkgaW4gbGVmdE91dGVySm9pblwiLCAoZG9uZSkgPT4ge1xuICAgICAgICBjb25zdCBhbGxEaWFnbm9zdGljcyA9IGdldERpYWdub3N0aWNzKGBcbiAgICAgICAgICAgIGltcG9ydCB7IGtuZXggfSBmcm9tICdrbmV4JztcblxuICAgICAgICAgICAgaW1wb3J0IHsgVHlwZWRLbmV4IH0gZnJvbSAnLi4vc3JjL3R5cGVkS25leCc7XG4gICAgICAgICAgICBpbXBvcnQgeyBVc2VyLCBVc2VyU2V0dGluZyB9IGZyb20gJy4vdGVzdFRhYmxlcyc7XG5cbiAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlZEtuZXggPSBuZXcgVHlwZWRLbmV4KGtuZXgoeyBjbGllbnQ6ICdwb3N0Z3Jlc3FsJyB9KSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpdGVtID0gYXdhaXQgdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyU2V0dGluZylcbiAgICAgICAgICAgICAgICAgICAgLmxlZnRPdXRlckpvaW4oJ290aGVyVXNlcicsIFVzZXIsICdOT0xPQ0snLCAnc3RhdHVzJywgJz0nLCAnb3RoZXJWYWx1ZScpXG4gICAgICAgICAgICAgICAgICAgIC5sZWZ0T3V0ZXJKb2luKCdvdGhlclVzZXIub3RoZXJPdGhlclVzZXInLCBVc2VyLCAnc3RhdHVzJywgJz0nLCAnb3RoZXJVc2VyLnN0YXR1cycpXG4gICAgICAgICAgICAgICAgICAgIC5zZWxlY3QoJ290aGVyVXNlci5vdGhlck90aGVyVXNlci5uYW1lJylcbiAgICAgICAgICAgICAgICAgICAgLmdldEZpcnN0KCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXRlbSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGl0ZW0ub3RoZXJVc2VyLm90aGVyT3RoZXJVc2VyLm5hbWUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgYCk7XG5cbiAgICAgICAgYXNzZXJ0LmVxdWFsKGFsbERpYWdub3N0aWNzLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgYWNjZXB0IGdyYW51bGFyaXR5IHByb3BlcnR5IGluIHdoZXJlRXhpc3RzXCIsIChkb25lKSA9PiB7XG4gICAgICAgIGNvbnN0IGFsbERpYWdub3N0aWNzID0gZ2V0RGlhZ25vc3RpY3MoYFxuICAgICAgICAgICAgaW1wb3J0IHsga25leCB9IGZyb20gJ2tuZXgnO1xuXG4gICAgICAgICAgICBpbXBvcnQgeyBUeXBlZEtuZXggfSBmcm9tICcuLi9zcmMvdHlwZWRLbmV4JztcbiAgICAgICAgICAgIGltcG9ydCB7IFVzZXIsIFVzZXJTZXR0aW5nIH0gZnJvbSAnLi90ZXN0VGFibGVzJztcblxuICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHF1ZXJ5ID0gdHlwZWRLbmV4XG4gICAgICAgICAgICAgICAgICAgIC5xdWVyeShVc2VyKVxuICAgICAgICAgICAgICAgICAgICAud2hlcmVFeGlzdHMoVXNlclNldHRpbmcsICdOT0xPQ0snLCAoc3ViUXVlcnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1YlF1ZXJ5LndoZXJlQ29sdW1ucygndXNlci5pZCcsICc9JywgJ3NvbWVWYWx1ZScpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIGApO1xuXG4gICAgICAgIGFzc2VydC5ub3RFcXVhbChhbGxEaWFnbm9zdGljcy5sZW5ndGgsIDApO1xuXG4gICAgICAgIGRvbmUoKTtcbiAgICB9KTtcbn0pO1xuIl19
