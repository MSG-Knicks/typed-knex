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
exports.runUpgrade = exports.upgradeProjectJoinOnColumnsToOn = exports.upgradeProjectStringParameters = void 0;
const path = __importStar(require("path"));
const ts_morph_1 = require("ts-morph");
function changeArgumentsFromFunctionToString(callExpression) {
    var _a, _b, _c;
    const args = callExpression.getArguments();
    if (((_a = args[0]) === null || _a === void 0 ? void 0 : _a.getKind()) === ts_morph_1.SyntaxKind.ArrowFunction) {
        changeArgumentFromFunctionToString(args[0], callExpression, 0);
    }
    if (((_b = args[1]) === null || _b === void 0 ? void 0 : _b.getKind()) === ts_morph_1.SyntaxKind.ArrowFunction) {
        changeArgumentFromFunctionToString(args[1], callExpression, 1);
    }
    if (((_c = args[2]) === null || _c === void 0 ? void 0 : _c.getKind()) === ts_morph_1.SyntaxKind.ArrowFunction) {
        changeArgumentFromFunctionToString(args[2], callExpression, 2);
    }
}
function changeArgumentFromFunctionToString(argumentToReplace, callExpression, argumentIndex) {
    if (argumentToReplace.getBody().getKind() === ts_morph_1.SyntaxKind.PropertyAccessExpression) {
        const body = argumentToReplace.getBody();
        const indexOfFirstPeriod = body.getText().indexOf(".");
        const name = body.getText().substring(indexOfFirstPeriod + 1);
        callExpression.removeArgument(argumentIndex);
        callExpression.insertArgument(argumentIndex, `'${name}'`);
    } else if (argumentToReplace.getBody().getKind() === ts_morph_1.SyntaxKind.ArrayLiteralExpression) {
        const body = argumentToReplace.getBody();
        const parameters = [];
        const propertyAccessExpressions = body.getChildren()[1].getChildrenOfKind(ts_morph_1.SyntaxKind.PropertyAccessExpression);
        for (const propertyAccessExpression of propertyAccessExpressions) {
            const indexOfFirstPeriod = propertyAccessExpression.getText().indexOf(".");
            const name = propertyAccessExpression.getText().substring(indexOfFirstPeriod + 1);
            parameters.push(`'${name}'`);
        }
        callExpression.removeArgument(argumentIndex);
        callExpression.insertArgument(argumentIndex, parameters.join());
    }
}
function changeArgumentFromObjectToString(argumentToReplace, callExpression, argumentIndex) {
    const indexOfFirstPeriod = argumentToReplace.getText().indexOf(".");
    const name = argumentToReplace.getText().substring(indexOfFirstPeriod + 1);
    callExpression.removeArgument(argumentIndex);
    callExpression.insertArgument(argumentIndex, `'${name}'`);
}
function changeIWhereCompareTwoColumns(callExpression) {
    const args = callExpression.getArguments();
    if (args[0].getKind() === ts_morph_1.SyntaxKind.ArrowFunction && args[2].getKind() === ts_morph_1.SyntaxKind.PropertyAccessExpression) {
        changeArgumentFromFunctionToString(args[0], callExpression, 0);
        changeArgumentFromObjectToString(args[2], callExpression, 2);
    }
}
function changeIWhereExists(callExpression) {
    const args = callExpression.getArguments();
    const subqueryFunction = args[1];
    const parameters = subqueryFunction.getParameters();
    if (parameters.length === 2) {
        parameters[1].remove();
    }
}
function printProgress(progress) {
    const percentage = (progress * 100).toFixed(0) + "%";
    if (process.stdout && process.stdout.cursorTo) {
        process.stdout.cursorTo(0);
        process.stdout.write(percentage);
    } else {
        console.log(percentage);
    }
}
function upgradeProjectStringParameters(project) {
    const sourceFiles = project.getSourceFiles();
    let fileCounter = 0;
    for (const sourceFile of sourceFiles) {
        printProgress(fileCounter / sourceFiles.length);
        sourceFile.forEachDescendant((node) => {
            if (node.getKind() === ts_morph_1.SyntaxKind.PropertyAccessExpression) {
                const typeString = node.getType().getText();
                if (
                    typeString.includes("IJoinOn<") ||
                    typeString.includes("IFindByPrimaryKey") ||
                    typeString.includes("IInsertSelect") ||
                    typeString.includes("IColumnParameterNoRowTransformation") ||
                    typeString.includes("IJoinOnVal<") ||
                    typeString.includes("IJoinOnNull<") ||
                    typeString.includes("IOrderBy<") ||
                    typeString.includes("IDbFunctionWithAlias<") ||
                    typeString.includes("IKeyFunctionAsParametersReturnQueryBuider<") ||
                    typeString.includes("ISelectableColumnKeyFunctionAsParametersReturnQueryBuider<") ||
                    typeString.includes("IWhere<") ||
                    typeString.includes("IWhereIn<") ||
                    typeString.includes("IWhereBetween<") ||
                    typeString.includes("IHaving<") ||
                    typeString.includes("ISelectWithFunctionColumns3<") ||
                    typeString.includes("IWhereWithOperator<")
                ) {
                    const callExpression = node.getParentIfKind(ts_morph_1.SyntaxKind.CallExpression);
                    if (callExpression) {
                        changeArgumentsFromFunctionToString(callExpression);
                    }
                } else if (typeString.startsWith("IWhereCompareTwoColumns<")) {
                    const callExpression = node.getParentIfKind(ts_morph_1.SyntaxKind.CallExpression);
                    if (callExpression) {
                        changeIWhereCompareTwoColumns(callExpression);
                    }
                } else if (typeString.startsWith("IWhereExists<")) {
                    const callExpression = node.getParentIfKind(ts_morph_1.SyntaxKind.CallExpression);
                    if (callExpression) {
                        changeIWhereExists(callExpression);
                    }
                }
            }
        });
        fileCounter++;
    }
    printProgress(1);
}
exports.upgradeProjectStringParameters = upgradeProjectStringParameters;
function upgradeProjectJoinOnColumnsToOn(project) {
    const sourceFiles = project.getSourceFiles();
    let fileCounter = 0;
    for (const sourceFile of sourceFiles) {
        printProgress(fileCounter / sourceFiles.length);
        sourceFile.forEachDescendant((node) => {
            if (node.getKind() === ts_morph_1.SyntaxKind.PropertyAccessExpression) {
                const typeString = node.getType().getText();
                if (typeString.includes("IJoinOnColumns<")) {
                    const callExpression = node.getParentIfKind(ts_morph_1.SyntaxKind.CallExpression);
                    if (callExpression) {
                        callExpression.getFirstChild().getChildren()[2].replaceWithText("on");
                        const args = callExpression.getArguments();
                        if (args.length === 3) {
                            const arg0Text = args[0].getText();
                            const arg2Text = args[2].getText();
                            callExpression.removeArgument(0);
                            callExpression.insertArgument(0, arg2Text);
                            callExpression.removeArgument(2);
                            callExpression.insertArgument(2, arg0Text);
                        }
                    }
                }
            }
        });
        fileCounter++;
    }
}
exports.upgradeProjectJoinOnColumnsToOn = upgradeProjectJoinOnColumnsToOn;
async function runUpgrade(actions, configFilename) {
    let tsConfigFilePath;
    if (!configFilename) {
        tsConfigFilePath = "tsconfig.json";
    } else {
        tsConfigFilePath = configFilename;
    }
    const tsConfigFileFullPath = path.resolve(tsConfigFilePath);
    console.log(`Loading "${tsConfigFileFullPath}"`);
    const project = new ts_morph_1.Project({
        tsConfigFilePath: tsConfigFileFullPath,
    });
    let remainingActions = [...actions];
    if (actions.includes("string-parameters")) {
        console.log('Running "string-parameters"');
        upgradeProjectStringParameters(project);
        remainingActions = remainingActions.filter((action) => action !== "string-parameters");
    }
    if (actions.includes("join-on-columns-to-on")) {
        console.log('Running "join-on-columns-to-on"');
        upgradeProjectJoinOnColumnsToOn(project);
        remainingActions = remainingActions.filter((action) => action !== "join-on-columns-to-on");
    }
    if (remainingActions.length > 0) {
        console.log(`Unknown actions: ${remainingActions.join()}`);
    }
    await project.save();
}
exports.runUpgrade = runUpgrade;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBncmFkZVJ1bm5lci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy91cGdyYWRlL3VwZ3JhZGVSdW5uZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBNkI7QUFDN0IsdUNBQWdJO0FBRWhJLFNBQVMsbUNBQW1DLENBQUMsY0FBOEI7O0lBQ3ZFLE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxZQUFZLEVBQUUsQ0FBQztJQUUzQyxJQUFJLENBQUEsTUFBQSxJQUFJLENBQUMsQ0FBQyxDQUFDLDBDQUFFLE9BQU8sRUFBRSxNQUFLLHFCQUFVLENBQUMsYUFBYSxFQUFFO1FBQ2pELGtDQUFrQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQWtCLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO0tBQ25GO0lBRUQsSUFBSSxDQUFBLE1BQUEsSUFBSSxDQUFDLENBQUMsQ0FBQywwQ0FBRSxPQUFPLEVBQUUsTUFBSyxxQkFBVSxDQUFDLGFBQWEsRUFBRTtRQUNqRCxrQ0FBa0MsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFrQixFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztLQUNuRjtJQUVELElBQUksQ0FBQSxNQUFBLElBQUksQ0FBQyxDQUFDLENBQUMsMENBQUUsT0FBTyxFQUFFLE1BQUsscUJBQVUsQ0FBQyxhQUFhLEVBQUU7UUFDakQsa0NBQWtDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBa0IsRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUM7S0FDbkY7QUFDTCxDQUFDO0FBRUQsU0FBUyxrQ0FBa0MsQ0FBQyxpQkFBZ0MsRUFBRSxjQUE4QixFQUFFLGFBQXFCO0lBQy9ILElBQUksaUJBQWlCLENBQUMsT0FBTyxFQUFFLENBQUMsT0FBTyxFQUFFLEtBQUsscUJBQVUsQ0FBQyx3QkFBd0IsRUFBRTtRQUMvRSxNQUFNLElBQUksR0FBRyxpQkFBaUIsQ0FBQyxP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T0FBTyxDQUFDLENBQUM7UUFDeEMsZ0JBQWdCLEdBQUcsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxNQUFNLEtBQUssbUJBQW1CLENBQUMsQ0FBQztLQUMxRjtJQUNELElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFO1FBQzNDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUMvQywrQkFBK0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN6QyxnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sS0FBSyx1QkFBdUIsQ0FBQyxDQUFDO0tBQzlGO0lBRUQsSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1FBQzdCLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLGdCQUFnQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztLQUM5RDtJQUVELE1BQU0sT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ3pCLENBQUM7QUFsQ0QsZ0NBa0NDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgQXJyYXlMaXRlcmFsRXhwcmVzc2lvbiwgQXJyb3dGdW5jdGlvbiwgQ2FsbEV4cHJlc3Npb24sIFByb2plY3QsIFByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbiwgU3ludGF4S2luZCB9IGZyb20gXCJ0cy1tb3JwaFwiO1xuXG5mdW5jdGlvbiBjaGFuZ2VBcmd1bWVudHNGcm9tRnVuY3Rpb25Ub1N0cmluZyhjYWxsRXhwcmVzc2lvbjogQ2FsbEV4cHJlc3Npb24pIHtcbiAgICBjb25zdCBhcmdzID0gY2FsbEV4cHJlc3Npb24uZ2V0QXJndW1lbnRzKCk7XG5cbiAgICBpZiAoYXJnc1swXT8uZ2V0S2luZCgpID09PSBTeW50YXhLaW5kLkFycm93RnVuY3Rpb24pIHtcbiAgICAgICAgY2hhbmdlQXJndW1lbnRGcm9tRnVuY3Rpb25Ub1N0cmluZyhhcmdzWzBdIGFzIEFycm93RnVuY3Rpb24sIGNhbGxFeHByZXNzaW9uLCAwKTtcbiAgICB9XG5cbiAgICBpZiAoYXJnc1sxXT8uZ2V0S2luZCgpID09PSBTeW50YXhLaW5kLkFycm93RnVuY3Rpb24pIHtcbiAgICAgICAgY2hhbmdlQXJndW1lbnRGcm9tRnVuY3Rpb25Ub1N0cmluZyhhcmdzWzFdIGFzIEFycm93RnVuY3Rpb24sIGNhbGxFeHByZXNzaW9uLCAxKTtcbiAgICB9XG5cbiAgICBpZiAoYXJnc1syXT8uZ2V0S2luZCgpID09PSBTeW50YXhLaW5kLkFycm93RnVuY3Rpb24pIHtcbiAgICAgICAgY2hhbmdlQXJndW1lbnRGcm9tRnVuY3Rpb25Ub1N0cmluZyhhcmdzWzJdIGFzIEFycm93RnVuY3Rpb24sIGNhbGxFeHByZXNzaW9uLCAyKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNoYW5nZUFyZ3VtZW50RnJvbUZ1bmN0aW9uVG9TdHJpbmcoYXJndW1lbnRUb1JlcGxhY2U6IEFycm93RnVuY3Rpb24sIGNhbGxFeHByZXNzaW9uOiBDYWxsRXhwcmVzc2lvbiwgYXJndW1lbnRJbmRleDogbnVtYmVyKSB7XG4gICAgaWYgKGFyZ3VtZW50VG9SZXBsYWNlLmdldEJvZHkoKS5nZXRLaW5kKCkgPT09IFN5bnRheEtpbmQuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKSB7XG4gICAgICAgIGNvbnN0IGJvZHkgPSBhcmd1bWVudFRvUmVwbGFjZS5nZXRCb2R5KCkgYXMgUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uO1xuICAgICAgICBjb25zdCBpbmRleE9mRmlyc3RQZXJpb2QgPSBib2R5LmdldFRleHQoKS5pbmRleE9mKFwiLlwiKTtcblxuICAgICAgICBjb25zdCBuYW1lID0gYm9keS5nZXRUZXh0KCkuc3Vic3RyaW5nKGluZGV4T2ZGaXJzdFBlcmlvZCArIDEpO1xuXG4gICAgICAgIGNhbGxFeHByZXNzaW9uLnJlbW92ZUFyZ3VtZW50KGFyZ3VtZW50SW5kZXgpO1xuICAgICAgICBjYWxsRXhwcmVzc2lvbi5pbnNlcnRBcmd1bWVudChhcmd1bWVudEluZGV4LCBgJyR7bmFtZX0nYCk7XG4gICAgfSBlbHNlIGlmIChhcmd1bWVudFRvUmVwbGFjZS5nZXRCb2R5KCkuZ2V0S2luZCgpID09PSBTeW50YXhLaW5kLkFycmF5TGl0ZXJhbEV4cHJlc3Npb24pIHtcbiAgICAgICAgY29uc3QgYm9keSA9IGFyZ3VtZW50VG9SZXBsYWNlLmdldEJvZHkoKSBhcyBBcnJheUxpdGVyYWxFeHByZXNzaW9uO1xuICAgICAgICBjb25zdCBwYXJhbWV0ZXJzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICAgIGNvbnN0IHByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbnMgPSBib2R5LmdldENoaWxkcmVuKClbMV0uZ2V0Q2hpbGRyZW5PZktpbmQoU3ludGF4S2luZC5Qcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24pO1xuICAgICAgICBmb3IgKGNvbnN0IHByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbiBvZiBwcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb25zKSB7XG4gICAgICAgICAgICBjb25zdCBpbmRleE9mRmlyc3RQZXJpb2QgPSBwcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24uZ2V0VGV4dCgpLmluZGV4T2YoXCIuXCIpO1xuXG4gICAgICAgICAgICBjb25zdCBuYW1lID0gcHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uLmdldFRleHQoKS5zdWJzdHJpbmcoaW5kZXhPZkZpcnN0UGVyaW9kICsgMSk7XG5cbiAgICAgICAgICAgIHBhcmFtZXRlcnMucHVzaChgJyR7bmFtZX0nYCk7XG4gICAgICAgIH1cblxuICAgICAgICBjYWxsRXhwcmVzc2lvbi5yZW1vdmVBcmd1bWVudChhcmd1bWVudEluZGV4KTtcbiAgICAgICAgY2FsbEV4cHJlc3Npb24uaW5zZXJ0QXJndW1lbnQoYXJndW1lbnRJbmRleCwgcGFyYW1ldGVycy5qb2luKCkpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gY2hhbmdlQXJndW1lbnRGcm9tT2JqZWN0VG9TdHJpbmcoYXJndW1lbnRUb1JlcGxhY2U6IFByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbiwgY2FsbEV4cHJlc3Npb246IENhbGxFeHByZXNzaW9uLCBhcmd1bWVudEluZGV4OiBudW1iZXIpIHtcbiAgICBjb25zdCBpbmRleE9mRmlyc3RQZXJpb2QgPSBhcmd1bWVudFRvUmVwbGFjZS5nZXRUZXh0KCkuaW5kZXhPZihcIi5cIik7XG4gICAgY29uc3QgbmFtZSA9IGFyZ3VtZW50VG9SZXBsYWNlLmdldFRleHQoKS5zdWJzdHJpbmcoaW5kZXhPZkZpcnN0UGVyaW9kICsgMSk7XG4gICAgY2FsbEV4cHJlc3Npb24ucmVtb3ZlQXJndW1lbnQoYXJndW1lbnRJbmRleCk7XG4gICAgY2FsbEV4cHJlc3Npb24uaW5zZXJ0QXJndW1lbnQoYXJndW1lbnRJbmRleCwgYCcke25hbWV9J2ApO1xufVxuXG5mdW5jdGlvbiBjaGFuZ2VJV2hlcmVDb21wYXJlVHdvQ29sdW1ucyhjYWxsRXhwcmVzc2lvbjogQ2FsbEV4cHJlc3Npb24pIHtcbiAgICBjb25zdCBhcmdzID0gY2FsbEV4cHJlc3Npb24uZ2V0QXJndW1lbnRzKCk7XG4gICAgaWYgKGFyZ3NbMF0uZ2V0S2luZCgpID09PSBTeW50YXhLaW5kLkFycm93RnVuY3Rpb24gJiYgYXJnc1syXS5nZXRLaW5kKCkgPT09IFN5bnRheEtpbmQuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKSB7XG4gICAgICAgIGNoYW5nZUFyZ3VtZW50RnJvbUZ1bmN0aW9uVG9TdHJpbmcoYXJnc1swXSBhcyBBcnJvd0Z1bmN0aW9uLCBjYWxsRXhwcmVzc2lvbiwgMCk7XG4gICAgICAgIGNoYW5nZUFyZ3VtZW50RnJvbU9iamVjdFRvU3RyaW5nKGFyZ3NbMl0gYXMgUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uLCBjYWxsRXhwcmVzc2lvbiwgMik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjaGFuZ2VJV2hlcmVFeGlzdHMoY2FsbEV4cHJlc3Npb246IENhbGxFeHByZXNzaW9uKSB7XG4gICAgY29uc3QgYXJncyA9IGNhbGxFeHByZXNzaW9uLmdldEFyZ3VtZW50cygpO1xuICAgIGNvbnN0IHN1YnF1ZXJ5RnVuY3Rpb24gPSBhcmdzWzFdIGFzIEFycm93RnVuY3Rpb247XG4gICAgY29uc3QgcGFyYW1ldGVycyA9IHN1YnF1ZXJ5RnVuY3Rpb24uZ2V0UGFyYW1ldGVycygpO1xuICAgIGlmIChwYXJhbWV0ZXJzLmxlbmd0aCA9PT0gMikge1xuICAgICAgICBwYXJhbWV0ZXJzWzFdLnJlbW92ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcHJpbnRQcm9ncmVzcyhwcm9ncmVzczogbnVtYmVyKSB7XG4gICAgY29uc3QgcGVyY2VudGFnZSA9IChwcm9ncmVzcyAqIDEwMCkudG9GaXhlZCgwKSArIFwiJVwiO1xuICAgIGlmIChwcm9jZXNzLnN0ZG91dCAmJiBwcm9jZXNzLnN0ZG91dC5jdXJzb3JUbykge1xuICAgICAgICBwcm9jZXNzLnN0ZG91dC5jdXJzb3JUbygwKTtcbiAgICAgICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUocGVyY2VudGFnZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2cocGVyY2VudGFnZSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBncmFkZVByb2plY3RTdHJpbmdQYXJhbWV0ZXJzKHByb2plY3Q6IFByb2plY3QpIHtcbiAgICBjb25zdCBzb3VyY2VGaWxlcyA9IHByb2plY3QuZ2V0U291cmNlRmlsZXMoKTtcblxuICAgIGxldCBmaWxlQ291bnRlciA9IDA7XG5cbiAgICBmb3IgKGNvbnN0IHNvdXJjZUZpbGUgb2Ygc291cmNlRmlsZXMpIHtcbiAgICAgICAgcHJpbnRQcm9ncmVzcyhmaWxlQ291bnRlciAvIHNvdXJjZUZpbGVzLmxlbmd0aCk7XG4gICAgICAgIHNvdXJjZUZpbGUuZm9yRWFjaERlc2NlbmRhbnQoKG5vZGUpID0+IHtcbiAgICAgICAgICAgIGlmIChub2RlLmdldEtpbmQoKSA9PT0gU3ludGF4S2luZC5Qcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24pIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlU3RyaW5nID0gbm9kZS5nZXRUeXBlKCkuZ2V0VGV4dCgpO1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICAgdHlwZVN0cmluZy5pbmNsdWRlcyhcIklKb2luT248XCIpIHx8XG4gICAgICAgICAgICAgICAgICAgIHR5cGVTdHJpbmcuaW5jbHVkZXMoXCJJRmluZEJ5UHJpbWFyeUtleVwiKSB8fFxuICAgICAgICAgICAgICAgICAgICB0eXBlU3RyaW5nLmluY2x1ZGVzKFwiSUluc2VydFNlbGVjdFwiKSB8fFxuICAgICAgICAgICAgICAgICAgICB0eXBlU3RyaW5nLmluY2x1ZGVzKFwiSUNvbHVtblBhcmFtZXRlck5vUm93VHJhbnNmb3JtYXRpb25cIikgfHxcbiAgICAgICAgICAgICAgICAgICAgdHlwZVN0cmluZy5pbmNsdWRlcyhcIklKb2luT25WYWw8XCIpIHx8XG4gICAgICAgICAgICAgICAgICAgIHR5cGVTdHJpbmcuaW5jbHVkZXMoXCJJSm9pbk9uTnVsbDxcIikgfHxcbiAgICAgICAgICAgICAgICAgICAgdHlwZVN0cmluZy5pbmNsdWRlcyhcIklPcmRlckJ5PFwiKSB8fFxuICAgICAgICAgICAgICAgICAgICB0eXBlU3RyaW5nLmluY2x1ZGVzKFwiSURiRnVuY3Rpb25XaXRoQWxpYXM8XCIpIHx8XG4gICAgICAgICAgICAgICAgICAgIHR5cGVTdHJpbmcuaW5jbHVkZXMoXCJJS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxcIikgfHxcbiAgICAgICAgICAgICAgICAgICAgdHlwZVN0cmluZy5pbmNsdWRlcyhcIklTZWxlY3RhYmxlQ29sdW1uS2V5RnVuY3Rpb25Bc1BhcmFtZXRlcnNSZXR1cm5RdWVyeUJ1aWRlcjxcIikgfHxcbiAgICAgICAgICAgICAgICAgICAgdHlwZVN0cmluZy5pbmNsdWRlcyhcIklXaGVyZTxcIikgfHxcbiAgICAgICAgICAgICAgICAgICAgdHlwZVN0cmluZy5pbmNsdWRlcyhcIklXaGVyZUluPFwiKSB8fFxuICAgICAgICAgICAgICAgICAgICB0eXBlU3RyaW5nLmluY2x1ZGVzKFwiSVdoZXJlQmV0d2VlbjxcIikgfHxcbiAgICAgICAgICAgICAgICAgICAgdHlwZVN0cmluZy5pbmNsdWRlcyhcIklIYXZpbmc8XCIpIHx8XG4gICAgICAgICAgICAgICAgICAgIHR5cGVTdHJpbmcuaW5jbHVkZXMoXCJJU2VsZWN0V2l0aEZ1bmN0aW9uQ29sdW1uczM8XCIpIHx8XG4gICAgICAgICAgICAgICAgICAgIHR5cGVTdHJpbmcuaW5jbHVkZXMoXCJJV2hlcmVXaXRoT3BlcmF0b3I8XCIpXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNhbGxFeHByZXNzaW9uID0gbm9kZS5nZXRQYXJlbnRJZktpbmQoU3ludGF4S2luZC5DYWxsRXhwcmVzc2lvbik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjYWxsRXhwcmVzc2lvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hhbmdlQXJndW1lbnRzRnJvbUZ1bmN0aW9uVG9TdHJpbmcoY2FsbEV4cHJlc3Npb24pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlU3RyaW5nLnN0YXJ0c1dpdGgoXCJJV2hlcmVDb21wYXJlVHdvQ29sdW1uczxcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FsbEV4cHJlc3Npb24gPSBub2RlLmdldFBhcmVudElmS2luZChTeW50YXhLaW5kLkNhbGxFeHByZXNzaW9uKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhbGxFeHByZXNzaW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFuZ2VJV2hlcmVDb21wYXJlVHdvQ29sdW1ucyhjYWxsRXhwcmVzc2lvbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVTdHJpbmcuc3RhcnRzV2l0aChcIklXaGVyZUV4aXN0czxcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FsbEV4cHJlc3Npb24gPSBub2RlLmdldFBhcmVudElmS2luZChTeW50YXhLaW5kLkNhbGxFeHByZXNzaW9uKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhbGxFeHByZXNzaW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFuZ2VJV2hlcmVFeGlzdHMoY2FsbEV4cHJlc3Npb24pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBmaWxlQ291bnRlcisrO1xuICAgIH1cbiAgICBwcmludFByb2dyZXNzKDEpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHVwZ3JhZGVQcm9qZWN0Sm9pbk9uQ29sdW1uc1RvT24ocHJvamVjdDogUHJvamVjdCkge1xuICAgIGNvbnN0IHNvdXJjZUZpbGVzID0gcHJvamVjdC5nZXRTb3VyY2VGaWxlcygpO1xuXG4gICAgbGV0IGZpbGVDb3VudGVyID0gMDtcblxuICAgIGZvciAoY29uc3Qgc291cmNlRmlsZSBvZiBzb3VyY2VGaWxlcykge1xuICAgICAgICBwcmludFByb2dyZXNzKGZpbGVDb3VudGVyIC8gc291cmNlRmlsZXMubGVuZ3RoKTtcbiAgICAgICAgc291cmNlRmlsZS5mb3JFYWNoRGVzY2VuZGFudCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgaWYgKG5vZGUuZ2V0S2luZCgpID09PSBTeW50YXhLaW5kLlByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGVTdHJpbmcgPSBub2RlLmdldFR5cGUoKS5nZXRUZXh0KCk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVTdHJpbmcuaW5jbHVkZXMoXCJJSm9pbk9uQ29sdW1uczxcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FsbEV4cHJlc3Npb24gPSBub2RlLmdldFBhcmVudElmS2luZChTeW50YXhLaW5kLkNhbGxFeHByZXNzaW9uKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhbGxFeHByZXNzaW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsRXhwcmVzc2lvbi5nZXRGaXJzdENoaWxkKCkhLmdldENoaWxkcmVuKClbMl0ucmVwbGFjZVdpdGhUZXh0KFwib25cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmdzID0gY2FsbEV4cHJlc3Npb24uZ2V0QXJndW1lbnRzKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZzBUZXh0ID0gYXJnc1swXS5nZXRUZXh0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJnMlRleHQgPSBhcmdzWzJdLmdldFRleHQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsRXhwcmVzc2lvbi5yZW1vdmVBcmd1bWVudCgwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsRXhwcmVzc2lvbi5pbnNlcnRBcmd1bWVudCgwLCBhcmcyVGV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbEV4cHJlc3Npb24ucmVtb3ZlQXJndW1lbnQoMik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbEV4cHJlc3Npb24uaW5zZXJ0QXJndW1lbnQoMiwgYXJnMFRleHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBmaWxlQ291bnRlcisrO1xuICAgIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blVwZ3JhZGUoYWN0aW9uczogc3RyaW5nW10sIGNvbmZpZ0ZpbGVuYW1lPzogc3RyaW5nKSB7XG4gICAgbGV0IHRzQ29uZmlnRmlsZVBhdGg7XG4gICAgaWYgKCFjb25maWdGaWxlbmFtZSkge1xuICAgICAgICB0c0NvbmZpZ0ZpbGVQYXRoID0gXCJ0c2NvbmZpZy5qc29uXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdHNDb25maWdGaWxlUGF0aCA9IGNvbmZpZ0ZpbGVuYW1lO1xuICAgIH1cblxuICAgIGNvbnN0IHRzQ29uZmlnRmlsZUZ1bGxQYXRoID0gcGF0aC5yZXNvbHZlKHRzQ29uZmlnRmlsZVBhdGgpO1xuXG4gICAgY29uc29sZS5sb2coYExvYWRpbmcgXCIke3RzQ29uZmlnRmlsZUZ1bGxQYXRofVwiYCk7XG5cbiAgICBjb25zdCBwcm9qZWN0ID0gbmV3IFByb2plY3Qoe1xuICAgICAgICB0c0NvbmZpZ0ZpbGVQYXRoOiB0c0NvbmZpZ0ZpbGVGdWxsUGF0aCxcbiAgICB9KTtcblxuICAgIGxldCByZW1haW5pbmdBY3Rpb25zID0gWy4uLmFjdGlvbnNdO1xuXG4gICAgaWYgKGFjdGlvbnMuaW5jbHVkZXMoXCJzdHJpbmctcGFyYW1ldGVyc1wiKSkge1xuICAgICAgICBjb25zb2xlLmxvZygnUnVubmluZyBcInN0cmluZy1wYXJhbWV0ZXJzXCInKTtcbiAgICAgICAgdXBncmFkZVByb2plY3RTdHJpbmdQYXJhbWV0ZXJzKHByb2plY3QpO1xuICAgICAgICByZW1haW5pbmdBY3Rpb25zID0gcmVtYWluaW5nQWN0aW9ucy5maWx0ZXIoKGFjdGlvbikgPT4gYWN0aW9uICE9PSBcInN0cmluZy1wYXJhbWV0ZXJzXCIpO1xuICAgIH1cbiAgICBpZiAoYWN0aW9ucy5pbmNsdWRlcyhcImpvaW4tb24tY29sdW1ucy10by1vblwiKSkge1xuICAgICAgICBjb25zb2xlLmxvZygnUnVubmluZyBcImpvaW4tb24tY29sdW1ucy10by1vblwiJyk7XG4gICAgICAgIHVwZ3JhZGVQcm9qZWN0Sm9pbk9uQ29sdW1uc1RvT24ocHJvamVjdCk7XG4gICAgICAgIHJlbWFpbmluZ0FjdGlvbnMgPSByZW1haW5pbmdBY3Rpb25zLmZpbHRlcigoYWN0aW9uKSA9PiBhY3Rpb24gIT09IFwiam9pbi1vbi1jb2x1bW5zLXRvLW9uXCIpO1xuICAgIH1cblxuICAgIGlmIChyZW1haW5pbmdBY3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc29sZS5sb2coYFVua25vd24gYWN0aW9uczogJHtyZW1haW5pbmdBY3Rpb25zLmpvaW4oKX1gKTtcbiAgICB9XG5cbiAgICBhd2FpdCBwcm9qZWN0LnNhdmUoKTtcbn1cbiJdfQ==
