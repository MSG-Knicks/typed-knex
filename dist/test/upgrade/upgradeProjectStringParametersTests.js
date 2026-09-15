"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const ts_morph_1 = require("ts-morph");
const upgradeRunner_1 = require("../../src/upgrade/upgradeRunner");
describe("upgradeProjectStringParameters", function () {
    this.timeout(1000000);
    it("should upgrade where", async () => {
        const project = new ts_morph_1.Project({
            tsConfigFilePath: "./upgradeTestProjects/v2-v3-stringParameters/tsconfig.json",
        });
        const code = `
            import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.where(i => i.name, 'this name1');
            a.where(i => i.other.id, 'id1');
        `;
        const sourceFile = project.createSourceFile("./upgradeTestProjects/v2-v3-stringParameters/src/test.ts", code);
        chai_1.assert.equal(project.getPreEmitDiagnostics().length, 0);
        (0, upgradeRunner_1.upgradeProjectStringParameters)(project);
        chai_1.assert.equal(
            sourceFile.getText(),
            `import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.where('name', 'this name1');
            a.where('other.id', 'id1');
        `
        );
    });
    it("should upgrade select single column", async () => {
        const project = new ts_morph_1.Project({
            tsConfigFilePath: "./upgradeTestProjects/v2-v3-stringParameters/tsconfig.json",
        });
        const code = `
            import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.select(i => i.name);
        `;
        const sourceFile = project.createSourceFile("./upgradeTestProjects/v2-v3-stringParameters/src/test.ts", code);
        chai_1.assert.equal(project.getPreEmitDiagnostics().length, 0);
        (0, upgradeRunner_1.upgradeProjectStringParameters)(project);
        chai_1.assert.equal(
            sourceFile.getText(),
            `import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.select('name');
        `
        );
    });
    it("should upgrade select column array", async () => {
        const project = new ts_morph_1.Project({
            tsConfigFilePath: "./upgradeTestProjects/v2-v3-stringParameters/tsconfig.json",
        });
        const code = `
            import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.select(i => [i.name, i.other.id]);
        `;
        const sourceFile = project.createSourceFile("./upgradeTestProjects/v2-v3-stringParameters/src/test.ts", code);
        chai_1.assert.equal(project.getPreEmitDiagnostics().length, 0);
        (0, upgradeRunner_1.upgradeProjectStringParameters)(project);
        chai_1.assert.equal(
            sourceFile.getText(),
            `import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.select('name','other.id');
        `
        );
    });
    it("should upgrade both column parameters", async () => {
        const project = new ts_morph_1.Project({
            tsConfigFilePath: "./upgradeTestProjects/v2-v3-stringParameters/tsconfig.json",
        });
        const code = `
            import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.joinOn(i => i.name, 'op', i => i.other.id);
        `;
        const sourceFile = project.createSourceFile("./upgradeTestProjects/v2-v3-stringParameters/src/test.ts", code);
        chai_1.assert.equal(project.getPreEmitDiagnostics().length, 0);
        (0, upgradeRunner_1.upgradeProjectStringParameters)(project);
        chai_1.assert.equal(
            sourceFile.getText(),
            `import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.joinOn('name', 'op', 'other.id');
        `
        );
    });
    it("should upgrade whereColumn", async () => {
        const project = new ts_morph_1.Project({
            tsConfigFilePath: "./upgradeTestProjects/v2-v3-stringParameters/tsconfig.json",
        });
        const code = `
            import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            const parent = {id:1};
            a.whereColumn(i => i.name, '=', parent.id);
        `;
        const sourceFile = project.createSourceFile("./upgradeTestProjects/v2-v3-stringParameters/src/test.ts", code);
        chai_1.assert.equal(project.getPreEmitDiagnostics().length, 0);
        (0, upgradeRunner_1.upgradeProjectStringParameters)(project);
        chai_1.assert.equal(
            sourceFile.getText(),
            `import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            const parent = {id:1};
            a.whereColumn('name', '=', 'id');
        `
        );
    });
    it("should upgrade whereExists", async () => {
        const project = new ts_morph_1.Project({
            tsConfigFilePath: "./upgradeTestProjects/v2-v3-stringParameters/tsconfig.json",
        });
        const code = `
            import { ITypedQueryBuilder } from './typedKnexTypes';

            class TableClass {}
            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.whereExists(TableClass, (subQuery, _parent) => subQuery.select(i => i.id));
        `;
        const sourceFile = project.createSourceFile("./upgradeTestProjects/v2-v3-stringParameters/src/test.ts", code);
        chai_1.assert.equal(project.getPreEmitDiagnostics().length, 0);
        (0, upgradeRunner_1.upgradeProjectStringParameters)(project);
        chai_1.assert.equal(
            sourceFile.getText(),
            `import { ITypedQueryBuilder } from './typedKnexTypes';

            class TableClass {}
            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.whereExists(TableClass, (subQuery) => subQuery.select('id'));
        `
        );
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBncmFkZVByb2plY3RTdHJpbmdQYXJhbWV0ZXJzVGVzdHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi90ZXN0L3VwZ3JhZGUvdXBncmFkZVByb2plY3RTdHJpbmdQYXJhbWV0ZXJzVGVzdHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwrQkFBOEI7QUFDOUIsdUNBQW1DO0FBQ25DLG1FQUFpRjtBQUVqRixRQUFRLENBQUMsZ0NBQWdDLEVBQUU7SUFDdkMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN0QixFQUFFLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbEMsTUFBTSxPQUFPLEdBQUcsSUFBSSxrQkFBTyxDQUFDO1lBQ3hCLGdCQUFnQixFQUFFLDREQUE0RDtTQUNqRixDQUFDLENBQUM7UUFFSCxNQUFNLElBQUksR0FBRzs7Ozs7O1NBTVosQ0FBQztRQUVGLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQywwREFBMEQsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUU5RyxhQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV4RCxJQUFBLDhDQUE4QixFQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXhDLGFBQU0sQ0FBQyxLQUFLLENBQ1IsVUFBVSxDQUFDLE9BQU8sRUFBRSxFQUNwQjs7Ozs7U0FLSCxDQUNBLENBQUM7SUFDTixDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxxQ0FBcUMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNqRCxNQUFNLE9BQU8sR0FBRyxJQUFJLGtCQUFPLENBQUM7WUFDeEIsZ0JBQWdCLEVBQUUsNERBQTREO1NBQ2pGLENBQUMsQ0FBQztRQUVILE1BQU0sSUFBSSxHQUFHOzs7OztTQUtaLENBQUM7UUFFRixNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMs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LEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFeEQsSUFBQSw4Q0FBOEIsRUFBQyxPQUFPLENBQUMsQ0FBQztRQUV4QyxhQUFNLENBQUMsS0FBSyxDQUNSLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFDcEI7Ozs7O1NBS0gsQ0FDQSxDQUFDO0lBQ04sQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGFzc2VydCB9IGZyb20gXCJjaGFpXCI7XG5pbXBvcnQgeyBQcm9qZWN0IH0gZnJvbSBcInRzLW1vcnBoXCI7XG5pbXBvcnQgeyB1cGdyYWRlUHJvamVjdFN0cmluZ1BhcmFtZXRlcnMgfSBmcm9tIFwiLi4vLi4vc3JjL3VwZ3JhZGUvdXBncmFkZVJ1bm5lclwiO1xuXG5kZXNjcmliZShcInVwZ3JhZGVQcm9qZWN0U3RyaW5nUGFyYW1ldGVyc1wiLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy50aW1lb3V0KDEwMDAwMDApO1xuICAgIGl0KFwic2hvdWxkIHVwZ3JhZGUgd2hlcmVcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBwcm9qZWN0ID0gbmV3IFByb2plY3Qoe1xuICAgICAgICAgICAgdHNDb25maWdGaWxlUGF0aDogXCIuL3VwZ3JhZGVUZXN0UHJvamVjdHMvdjItdjMtc3RyaW5nUGFyYW1ldGVycy90c2NvbmZpZy5qc29uXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGNvZGUgPSBgXG4gICAgICAgICAgICBpbXBvcnQgeyBJVHlwZWRRdWVyeUJ1aWxkZXIgfSBmcm9tICcuL3R5cGVkS25leFR5cGVzJztcblxuICAgICAgICAgICAgY29uc3QgYSA9IHt9IGFzIElUeXBlZFF1ZXJ5QnVpbGRlcjx7fSwge30sIHt9PjtcbiAgICAgICAgICAgIGEud2hlcmUoaSA9PiBpLm5hbWUsICd0aGlzIG5hbWUxJyk7XG4gICAgICAgICAgICBhLndoZXJlKGkgPT4gaS5vdGhlci5pZCwgJ2lkMScpO1xuICAgICAgICBgO1xuXG4gICAgICAgIGNvbnN0IHNvdXJjZUZpbGUgPSBwcm9qZWN0LmNyZWF0ZVNvdXJjZUZpbGUoXCIuL3VwZ3JhZGVUZXN0UHJvamVjdHMvdjItdjMtc3RyaW5nUGFyYW1ldGVycy9zcmMvdGVzdC50c1wiLCBjb2RlKTtcblxuICAgICAgICBhc3NlcnQuZXF1YWwocHJvamVjdC5nZXRQcmVFbWl0RGlhZ25vc3RpY3MoKS5sZW5ndGgsIDApO1xuXG4gICAgICAgIHVwZ3JhZGVQcm9qZWN0U3RyaW5nUGFyYW1ldGVycyhwcm9qZWN0KTtcblxuICAgICAgICBhc3NlcnQuZXF1YWwoXG4gICAgICAgICAgICBzb3VyY2VGaWxlLmdldFRleHQoKSxcbiAgICAgICAgICAgIGBpbXBvcnQgeyBJVHlwZWRRdWVyeUJ1aWxkZXIgfSBmcm9tICcuL3R5cGVkS25leFR5cGVzJztcblxuICAgICAgICAgICAgY29uc3QgYSA9IHt9IGFzIElUeXBlZFF1ZXJ5QnVpbGRlcjx7fSwge30sIHt9PjtcbiAgICAgICAgICAgIGEud2hlcmUoJ25hbWUnLCAndGhpcyBuYW1lMScpO1xuICAgICAgICAgICAgYS53aGVyZSgnb3RoZXIuaWQnLCAnaWQxJyk7XG4gICAgICAgIGBcbiAgICAgICAgKTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIHVwZ3JhZGUgc2VsZWN0IHNpbmdsZSBjb2x1bW5cIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBwcm9qZWN0ID0gbmV3IFByb2plY3Qoe1xuICAgICAgICAgICAgdHNDb25maWdGaWxlUGF0aDogXCIuL3VwZ3JhZGVUZXN0UHJvamVjdHMvdjItdjMtc3RyaW5nUGFyYW1ldGVycy90c2NvbmZpZy5qc29uXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGNvZGUgPSBgXG4gICAgICAgICAgICBpbXBvcnQgeyBJVHlwZWRRdWVyeUJ1aWxkZXIgfSBmcm9tICcuL3R5cGVkS25leFR5cGVzJztcblxuICAgICAgICAgICAgY29uc3QgYSA9IHt9IGFzIElUeXBlZFF1ZXJ5QnVpbGRlcjx7fSwge30sIHt9PjtcbiAgICAgICAgICAgIGEuc2VsZWN0KGkgPT4gaS5uYW1lKTtcbiAgICAgICAgYDtcblxuICAgICAgICBjb25zdCBzb3VyY2VGaWxlID0gcHJvamVjdC5jcmVhdGVTb3VyY2VGaWxlKFwiLi91cGdyYWRlVGVzdFByb2plY3RzL3YyLXYzLXN0cmluZ1BhcmFtZXRlcnMvc3JjL3Rlc3QudHNcIiwgY29kZSk7XG5cbiAgICAgICAgYXNzZXJ0LmVxdWFsKHByb2plY3QuZ2V0UHJlRW1pdERpYWdub3N0aWNzKCkubGVuZ3RoLCAwKTtcblxuICAgICAgICB1cGdyYWRlUHJvamVjdFN0cmluZ1BhcmFtZXRlcnMocHJvamVjdCk7XG5cbiAgICAgICAgYXNzZXJ0LmVxdWFsKFxuICAgICAgICAgICAgc291cmNlRmlsZS5nZXRUZXh0KCksXG4gICAgICAgICAgICBgaW1wb3J0IHsgSVR5cGVkUXVlcnlCdWlsZGVyIH0gZnJvbSAnLi90eXBlZEtuZXhUeXBlcyc7XG5cbiAgICAgICAgICAgIGNvbnN0IGEgPSB7fSBhcyBJVHlwZWRRdWVyeUJ1aWxkZXI8e30sIHt9LCB7fT47XG4gICAgICAgICAgICBhLnNlbGVjdCgnbmFtZScpO1xuICAgICAgICBgXG4gICAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCB1cGdyYWRlIHNlbGVjdCBjb2x1bW4gYXJyYXlcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBwcm9qZWN0ID0gbmV3IFByb2plY3Qoe1xuICAgICAgICAgICAgdHNDb25maWdGaWxlUGF0aDogXCIuL3VwZ3JhZGVUZXN0UHJvamVjdHMvdjItdjMtc3RyaW5nUGFyYW1ldGVycy90c2NvbmZpZy5qc29uXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGNvZGUgPSBgXG4gICAgICAgICAgICBpbXBvcnQgeyBJVHlwZWRRdWVyeUJ1aWxkZXIgfSBmcm9tICcuL3R5cGVkS25leFR5cGVzJztcblxuICAgICAgICAgICAgY29uc3QgYSA9IHt9IGFzIElUeXBlZFF1ZXJ5QnVpbGRlcjx7fSwge30sIHt9PjtcbiAgICAgICAgICAgIGEuc2VsZWN0KGkgPT4gW2kubmFtZSwgaS5vdGhlci5pZF0pO1xuICAgICAgICBgO1xuXG4gICAgICAgIGNvbnN0IHNvdXJjZUZpbGUgPSBwcm9qZWN0LmNyZWF0ZVNvdXJjZUZpbGUoXCIuL3VwZ3JhZGVUZXN0UHJvamVjdHMvdjItdjMtc3RyaW5nUGFyYW1ldGVycy9zcmMvdGVzdC50c1wiLCBjb2RlKTtcblxuICAgICAgICBhc3NlcnQuZXF1YWwocHJvamVjdC5nZXRQcmVFbWl0RGlhZ25vc3RpY3MoKS5sZW5ndGgsIDApO1xuXG4gICAgICAgIHVwZ3JhZGVQcm9qZWN0U3RyaW5nUGFyYW1ldGVycyhwcm9qZWN0KTtcblxuICAgICAgICBhc3NlcnQuZXF1YWwoXG4gICAgICAgICAgICBzb3VyY2VGaWxlLmdldFRleHQoKSxcbiAgICAgICAgICAgIGBpbXBvcnQgeyBJVHlwZWRRdWVyeUJ1aWxkZXIgfSBmcm9tICcuL3R5cGVkS25leFR5cGVzJztcblxuICAgICAgICAgICAgY29uc3QgYSA9IHt9IGFzIElUeXBlZFF1ZXJ5QnVpbGRlcjx7fSwge30sIHt9PjtcbiAgICAgICAgICAgIGEuc2VsZWN0KCduYW1lJywnb3RoZXIuaWQnKTtcbiAgICAgICAgYFxuICAgICAgICApO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgdXBncmFkZSBib3RoIGNvbHVtbiBwYXJhbWV0ZXJzXCIsIGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgcHJvamVjdCA9IG5ldyBQcm9qZWN0KHtcbiAgICAgICAgICAgIHRzQ29uZmlnRmlsZVBhdGg6IFwiLi91cGdyYWRlVGVzdFByb2plY3RzL3YyLXYzLXN0cmluZ1BhcmFtZXRlcnMvdHNjb25maWcuanNvblwiLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBjb2RlID0gYFxuICAgICAgICAgICAgaW1wb3J0IHsgSVR5cGVkUXVlcnlCdWlsZGVyIH0gZnJvbSAnLi90eXBlZEtuZXhUeXBlcyc7XG5cbiAgICAgICAgICAgIGNvbnN0IGEgPSB7fSBhcyBJVHlwZWRRdWVyeUJ1aWxkZXI8e30sIHt9LCB7fT47XG4gICAgICAgICAgICBhLmpvaW5PbihpID0+IGkubmFtZSwgJ29wJywgaSA9PiBpLm90aGVyLmlkKTtcbiAgICAgICAgYDtcblxuICAgICAgICBjb25zdCBzb3VyY2VGaWxlID0gcHJvamVjdC5jcmVhdGVTb3VyY2VGaWxlKFwiLi91cGdyYWRlVGVzdFByb2plY3RzL3YyLXYzLXN0cmluZ1BhcmFtZXRlcnMvc3JjL3Rlc3QudHNcIiwgY29kZSk7XG5cbiAgICAgICAgYXNzZXJ0LmVxdWFsKHByb2plY3QuZ2V0UHJlRW1pdERpYWdub3N0aWNzKCkubGVuZ3RoLCAwKTtcblxuICAgICAgICB1cGdyYWRlUHJvamVjdFN0cmluZ1BhcmFtZXRlcnMocHJvamVjdCk7XG5cbiAgICAgICAgYXNzZXJ0LmVxdWFsKFxuICAgICAgICAgICAgc291cmNlRmlsZS5nZXRUZXh0KCksXG4gICAgICAgICAgICBgaW1wb3J0IHsgSVR5cGVkUXVlcnlCdWlsZGVyIH0gZnJvbSAnLi90eXBlZEtuZXhUeXBlcyc7XG5cbiAgICAgICAgICAgIGNvbnN0IGEgPSB7fSBhcyBJVHlwZWRRdWVyeUJ1aWxkZXI8e30sIHt9LCB7fT47XG4gICAgICAgICAgICBhLmpvaW5PbignbmFtZScsICdvcCcsICdvdGhlci5pZCcpO1xuICAgICAgICBgXG4gICAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpdChcInNob3VsZCB1cGdyYWRlIHdoZXJlQ29sdW1uXCIsIGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgcHJvamVjdCA9IG5ldyBQcm9qZWN0KHtcbiAgICAgICAgICAgIHRzQ29uZmlnRmlsZVBhdGg6IFwiLi91cGdyYWRlVGVzdFByb2plY3RzL3YyLXYzLXN0cmluZ1BhcmFtZXRlcnMvdHNjb25maWcuanNvblwiLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBjb2RlID0gYFxuICAgICAgICAgICAgaW1wb3J0IHsgSVR5cGVkUXVlcnlCdWlsZGVyIH0gZnJvbSAnLi90eXBlZEtuZXhUeXBlcyc7XG5cbiAgICAgICAgICAgIGNvbnN0IGEgPSB7fSBhcyBJVHlwZWRRdWVyeUJ1aWxkZXI8e30sIHt9LCB7fT47XG4gICAgICAgICAgICBjb25zdCBwYXJlbnQgPSB7aWQ6MX07XG4gICAgICAgICAgICBhLndoZXJlQ29sdW1uKGkgPT4gaS5uYW1lLCAnPScsIHBhcmVudC5pZCk7XG4gICAgICAgIGA7XG5cbiAgICAgICAgY29uc3Qgc291cmNlRmlsZSA9IHByb2plY3QuY3JlYXRlU291cmNlRmlsZShcIi4vdXBncmFkZVRlc3RQcm9qZWN0cy92Mi12My1zdHJpbmdQYXJhbWV0ZXJzL3NyYy90ZXN0LnRzXCIsIGNvZGUpO1xuXG4gICAgICAgIGFzc2VydC5lcXVhbChwcm9qZWN0LmdldFByZUVtaXREaWFnbm9zdGljcygpLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgdXBncmFkZVByb2plY3RTdHJpbmdQYXJhbWV0ZXJzKHByb2plY3QpO1xuXG4gICAgICAgIGFzc2VydC5lcXVhbChcbiAgICAgICAgICAgIHNvdXJjZUZpbGUuZ2V0VGV4dCgpLFxuICAgICAgICAgICAgYGltcG9ydCB7IElUeXBlZFF1ZXJ5QnVpbGRlciB9IGZyb20gJy4vdHlwZWRLbmV4VHlwZXMnO1xuXG4gICAgICAgICAgICBjb25zdCBhID0ge30gYXMgSVR5cGVkUXVlcnlCdWlsZGVyPHt9LCB7fSwge30+O1xuICAgICAgICAgICAgY29uc3QgcGFyZW50ID0ge2lkOjF9O1xuICAgICAgICAgICAgYS53aGVyZUNvbHVtbignbmFtZScsICc9JywgJ2lkJyk7XG4gICAgICAgIGBcbiAgICAgICAgKTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIHVwZ3JhZGUgd2hlcmVFeGlzdHNcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBwcm9qZWN0ID0gbmV3IFByb2plY3Qoe1xuICAgICAgICAgICAgdHNDb25maWdGaWxlUGF0aDogXCIuL3VwZ3JhZGVUZXN0UHJvamVjdHMvdjItdjMtc3RyaW5nUGFyYW1ldGVycy90c2NvbmZpZy5qc29uXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGNvZGUgPSBgXG4gICAgICAgICAgICBpbXBvcnQgeyBJVHlwZWRRdWVyeUJ1aWxkZXIgfSBmcm9tICcuL3R5cGVkS25leFR5cGVzJztcblxuICAgICAgICAgICAgY2xhc3MgVGFibGVDbGFzcyB7fVxuICAgICAgICAgICAgY29uc3QgYSA9IHt9IGFzIElUeXBlZFF1ZXJ5QnVpbGRlcjx7fSwge30sIHt9PjtcbiAgICAgICAgICAgIGEud2hlcmVFeGlzdHMoVGFibGVDbGFzcywgKHN1YlF1ZXJ5LCBfcGFyZW50KSA9PiBzdWJRdWVyeS5zZWxlY3QoaSA9PiBpLmlkKSk7XG4gICAgICAgIGA7XG5cbiAgICAgICAgY29uc3Qgc291cmNlRmlsZSA9IHByb2plY3QuY3JlYXRlU291cmNlRmlsZShcIi4vdXBncmFkZVRlc3RQcm9qZWN0cy92Mi12My1zdHJpbmdQYXJhbWV0ZXJzL3NyYy90ZXN0LnRzXCIsIGNvZGUpO1xuXG4gICAgICAgIGFzc2VydC5lcXVhbChwcm9qZWN0LmdldFByZUVtaXREaWFnbm9zdGljcygpLmxlbmd0aCwgMCk7XG5cbiAgICAgICAgdXBncmFkZVByb2plY3RTdHJpbmdQYXJhbWV0ZXJzKHByb2plY3QpO1xuXG4gICAgICAgIGFzc2VydC5lcXVhbChcbiAgICAgICAgICAgIHNvdXJjZUZpbGUuZ2V0VGV4dCgpLFxuICAgICAgICAgICAgYGltcG9ydCB7IElUeXBlZFF1ZXJ5QnVpbGRlciB9IGZyb20gJy4vdHlwZWRLbmV4VHlwZXMnO1xuXG4gICAgICAgICAgICBjbGFzcyBUYWJsZUNsYXNzIHt9XG4gICAgICAgICAgICBjb25zdCBhID0ge30gYXMgSVR5cGVkUXVlcnlCdWlsZGVyPHt9LCB7fSwge30+O1xuICAgICAgICAgICAgYS53aGVyZUV4aXN0cyhUYWJsZUNsYXNzLCAoc3ViUXVlcnkpID0+IHN1YlF1ZXJ5LnNlbGVjdCgnaWQnKSk7XG4gICAgICAgIGBcbiAgICAgICAgKTtcbiAgICB9KTtcbn0pO1xuIl19
