import * as ts from 'typescript';

import {Replacement} from './common/replace';
import {findParent, walk} from './common/walk';

function getImports(file: ts.SourceFile) {
    const importNames: string[] = [];

    for (let i = 0; i < file.statements.length; i++) {
        const node = file.statements[i];
        if (ts.isImportDeclaration(node)) {
            if (node.importClause) {
                if (node.importClause.name) {
                    importNames.push(node.importClause.name.getText());
                }
                if (node.importClause.namedBindings) {
                    const bindings = node.importClause.namedBindings;
                    if (bindings.kind == ts.SyntaxKind.NamedImports) {
                        const namedImports = bindings as ts.NamedImports;
                        namedImports.elements.forEach((a) => {
                            if (a.name.getText() != 'DontRemoveThisImport') {
                                importNames.push(a.name.getText());
                            }
                        });
                    } else if (bindings.kind == ts.SyntaxKind.NamespaceImport) {
                        importNames.push((bindings as ts.NamespaceImport).name.getText());
                    } else {
                        console.log('unexpected..');
                    }
                }
            }
        }
    }
    return importNames;
}

function removeImports(file: ts.SourceFile, imports: string[]): Replacement[] {
    const result: Replacement[] = [];
    const importSet = new Set(imports);
    for (let i = 0; i < file.statements.length; i++) {
        const node = file.statements[i];
        if (ts.isImportDeclaration(node)) {
            if (node.importClause) {
                if (node.importClause.name) {
                    if (importSet.has(node.importClause.name.getText())) {
                        result.push({
                            start: node.getStart(),
                            end: node.getEnd() + 1,
                            value: '',
                        });
                    }
                }
                if (node.importClause.namedBindings) {
                    const bindings = node.importClause.namedBindings;
                    if (bindings.kind == ts.SyntaxKind.NamedImports) {
                        const namedImports = bindings as ts.NamedImports;
                        const keep: ts.ImportSpecifier[] = [];
                        namedImports.elements.forEach((a, i) => {
                            if (!importSet.has(a.name.getText())) {
                                keep.push(a);
                            }
                        });
                        if (keep.length == 0) {
                            result.push({
                                start: node.getStart(),
                                end: node.getEnd() + 1,
                                value: '',
                            });
                        } else if (keep.length < namedImports.elements.length) {
                            result.push({
                                start: namedImports.getStart(),
                                end: namedImports.getEnd(),
                                value: '{' + keep.map((a) => a.getText()).join(', ') + '}',
                            });
                        }
                    } else if (bindings.kind == ts.SyntaxKind.NamespaceImport) {
                        if (importSet.has((bindings as ts.NamespaceImport).name.getText())) {
                            result.push({
                                start: node.getStart(),
                                end: node.getEnd() + 1,
                                value: '',
                            });
                        }
                    } else {
                        console.log('unexpected..');
                    }
                }
            }
        }
    }

    return result;
}

export function transform(file: ts.SourceFile): Replacement[] {
    const importNames = getImports(file);
    const used = new Set<string>();

    walk(file, (node) => {
        if (node.kind == ts.SyntaxKind.Identifier && !findParent(node, ts.SyntaxKind.ImportDeclaration)) {
            used.add(node.getText());
        }
    });

    const unused = importNames.filter((a) => !used.has(a));

    if (unused.length > 0) {
        return removeImports(file, unused);
    }
    return [];
}
