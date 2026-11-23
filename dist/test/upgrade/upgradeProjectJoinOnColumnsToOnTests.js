"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const ts_morph_1 = require("ts-morph");
const upgradeRunner_1 = require("../../src/upgrade/upgradeRunner");
describe("upgradeProjectJoinOnColumnsToOn", function () {
    this.timeout(1000000);
    it("should upgrade where", async () => {
        const project = new ts_morph_1.Project({
            tsConfigFilePath: "./upgradeTestProjects/v2-v3-stringParameters/tsconfig.json",
        });
        const code = `
            import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.onColumns(i => i.name, 'op', i => i.other.id);
        `;
        const sourceFile = project.createSourceFile("./upgradeTestProjects/v2-v3-stringParameters/src/test.ts", code);
        chai_1.assert.equal(project.getPreEmitDiagnostics().length, 0);
        (0, upgradeRunner_1.upgradeProjectJoinOnColumnsToOn)(project);
        chai_1.assert.equal(
            sourceFile.getText(),
            `import { ITypedQueryBuilder } from './typedKnexTypes';

            const a = {} as ITypedQueryBuilder<{}, {}, {}>;
            a.on(i => i.other.id, 'op', i => i.name);
        `
        );
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBncmFkZVByb2plY3RKb2luT25Db2x1bW5zVG9PblRlc3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vdGVzdC91cGdyYWRlL3VwZ3JhZGVQcm9qZWN0Sm9pbk9uQ29sdW1uc1RvT25UZXN0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLCtCQUE4QjtBQUM5Qix1Q0FBbUM7QUFDbkMsbUVBQWtGO0FBRWxGLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRTtJQUN4QyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3RCLEVBQUUsQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNsQyxNQUFNLE9BQU8sR0FBRyxJQUFJLGtCQUFPLENBQUM7WUFDeEIsZ0JBQWdCLEVBQUUsNERBQTREO1NBQ2pGLENBQUMsQ0FBQztRQUVILE1BQU0sSUFBSSxHQUFHOzs7OztTQUtaLENBQUM7UUFFRixNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsMERBQTBELEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFOUcsYUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFeEQsSUFBQSwrQ0FBK0IsRUFBQyxPQUFPLENBQUMsQ0FBQztRQUV6QyxhQUFNLENBQUMsS0FBSyxDQUNSLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFDcEI7Ozs7U0FJSCxDQUNBLENBQUM7SUFDTixDQUFDLENBQUMsQ0FBQztBQUNQLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcImNoYWlcIjtcbmltcG9ydCB7IFByb2plY3QgfSBmcm9tIFwidHMtbW9ycGhcIjtcbmltcG9ydCB7IHVwZ3JhZGVQcm9qZWN0Sm9pbk9uQ29sdW1uc1RvT24gfSBmcm9tIFwiLi4vLi4vc3JjL3VwZ3JhZGUvdXBncmFkZVJ1bm5lclwiO1xuXG5kZXNjcmliZShcInVwZ3JhZGVQcm9qZWN0Sm9pbk9uQ29sdW1uc1RvT25cIiwgZnVuY3Rpb24gKCkge1xuICAgIHRoaXMudGltZW91dCgxMDAwMDAwKTtcbiAgICBpdChcInNob3VsZCB1cGdyYWRlIHdoZXJlXCIsIGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgcHJvamVjdCA9IG5ldyBQcm9qZWN0KHtcbiAgICAgICAgICAgIHRzQ29uZmlnRmlsZVBhdGg6IFwiLi91cGdyYWRlVGVzdFByb2plY3RzL3YyLXYzLXN0cmluZ1BhcmFtZXRlcnMvdHNjb25maWcuanNvblwiLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBjb2RlID0gYFxuICAgICAgICAgICAgaW1wb3J0IHsgSVR5cGVkUXVlcnlCdWlsZGVyIH0gZnJvbSAnLi90eXBlZEtuZXhUeXBlcyc7XG5cbiAgICAgICAgICAgIGNvbnN0IGEgPSB7fSBhcyBJVHlwZWRRdWVyeUJ1aWxkZXI8e30sIHt9LCB7fT47XG4gICAgICAgICAgICBhLm9uQ29sdW1ucyhpID0+IGkubmFtZSwgJ29wJywgaSA9PiBpLm90aGVyLmlkKTtcbiAgICAgICAgYDtcblxuICAgICAgICBjb25zdCBzb3VyY2VGaWxlID0gcHJvamVjdC5jcmVhdGVTb3VyY2VGaWxlKFwiLi91cGdyYWRlVGVzdFByb2plY3RzL3YyLXYzLXN0cmluZ1BhcmFtZXRlcnMvc3JjL3Rlc3QudHNcIiwgY29kZSk7XG5cbiAgICAgICAgYXNzZXJ0LmVxdWFsKHByb2plY3QuZ2V0UHJlRW1pdERpYWdub3N0aWNzKCkubGVuZ3RoLCAwKTtcblxuICAgICAgICB1cGdyYWRlUHJvamVjdEpvaW5PbkNvbHVtbnNUb09uKHByb2plY3QpO1xuXG4gICAgICAgIGFzc2VydC5lcXVhbChcbiAgICAgICAgICAgIHNvdXJjZUZpbGUuZ2V0VGV4dCgpLFxuICAgICAgICAgICAgYGltcG9ydCB7IElUeXBlZFF1ZXJ5QnVpbGRlciB9IGZyb20gJy4vdHlwZWRLbmV4VHlwZXMnO1xuXG4gICAgICAgICAgICBjb25zdCBhID0ge30gYXMgSVR5cGVkUXVlcnlCdWlsZGVyPHt9LCB7fSwge30+O1xuICAgICAgICAgICAgYS5vbihpID0+IGkub3RoZXIuaWQsICdvcCcsIGkgPT4gaS5uYW1lKTtcbiAgICAgICAgYFxuICAgICAgICApO1xuICAgIH0pO1xufSk7XG4iXX0=
