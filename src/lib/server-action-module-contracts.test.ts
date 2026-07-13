import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

function isTypeOnlyExport(symbol: ts.Symbol, source: ts.SourceFile): boolean {
  const declarations = symbol.declarations ?? [];
  const isTypeOnly = (declaration: ts.Declaration) =>
    ts.isExportSpecifier(declaration)
      ? declaration.isTypeOnly || declaration.parent.parent.isTypeOnly
      : ts.isExportDeclaration(declaration) && declaration.isTypeOnly;
  if (declarations.length && declarations.every(isTypeOnly)) return true;
  if (declarations.some((declaration) => declaration.getSourceFile() === source)) return false;
  return !source.statements.some((statement) =>
    ts.isExportDeclaration(statement) && !statement.isTypeOnly && !statement.exportClause);
}

function isAsyncFunction(symbol: ts.Symbol, checker: ts.TypeChecker): boolean {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!declaration) return false;
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
  return signatures.length > 0 && signatures.every((signature) => {
    const returnType = signature.getReturnType();
    return (returnType.isUnion() ? returnType.types : [returnType]).every((member) => {
      const target = (member as ts.TypeReference).target;
      return !!target && /^Promise(<.+>)?$/.test(checker.typeToString(target));
    });
  });
}

test('file-level "use server" modules export only async functions and types', () => {
  const violations: string[] = [];
  const configFile = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  assert.equal(configFile.error, undefined);
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ".");
  const files = config.fileNames.filter((file) => !file.endsWith(".d.ts"));
  assert.ok(files.includes("next.config.ts"));
  const program = ts.createProgram(config.fileNames, config.options);
  const checker = program.getTypeChecker();

  for (const file of files) {
    const source = program.getSourceFile(file);
    assert.ok(source, `TypeScript did not load ${file}`);
    if (!source.statements.some((statement) => ts.isExpressionStatement(statement)
      && ts.isStringLiteral(statement.expression)
      && statement.expression.text === "use server")) continue;

    const moduleSymbol = checker.getSymbolAtLocation(source);
    assert.ok(moduleSymbol, `TypeScript did not resolve ${file}`);
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      if (isTypeOnlyExport(exported, source)) continue;
      const symbol = exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
      if (!(symbol.flags & ts.SymbolFlags.Value) || isAsyncFunction(symbol, checker)) continue;
      const declaration = exported.declarations?.find((item) => item.getSourceFile() === source);
      const position = declaration?.getStart(source) ?? 0;
      violations.push(`${file}:${source.getLineAndCharacterOfPosition(position).line + 1}`);
    }
  }

  assert.deepEqual(violations, []);
});
