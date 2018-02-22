import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import {doReplacements, Replacement, replaceNode} from './common/replace';
import {getRelativePath, removeExtension, resolveImport} from './common/util';
import {walk} from './common/walk';

function canonicalizeImport(filePath: string, importSpecifier: string): string {
    const resolved = resolveImport(importSpecifier, filePath);
    if (resolved == importSpecifier) {
        return resolved;
    }
    const relative = getRelativePath(filePath, resolved);
    return removeExtension(relative);
}

export function transform(file: ts.SourceFile): Replacement[] {
    const replacements: Replacement[] = [];

    let imports: {[key: string]: ts.ImportDeclaration[]} = {};
    const rename = new Set<string>();

    for (let i = 0; i < file.statements.length; i++) {
        const node = file.statements[i];
        if (ts.isImportDeclaration(node)) {
            if (node.importClause) {
                let namedImports = false;
                if (node.importClause.namedBindings) {
                    if (ts.isNamedImports(node.importClause.namedBindings)) {
                        namedImports = true;
                        if (ts.isStringLiteral(node.moduleSpecifier)) {
                            const module = node.moduleSpecifier.text;
                            let canonical = canonicalizeImport(file.fileName, module);
                            if (canonical != module) {
                                rename.add(canonical);
                            }
                            if (!imports.hasOwnProperty(canonical)) {
                                imports[canonical] = [];
                            }
                            imports[canonical].push(node);
                        }
                    }
                }
                if (!namedImports) {
                    if (ts.isStringLiteral(node.moduleSpecifier)) {
                        const module = node.moduleSpecifier.text;
                        const canonical = canonicalizeImport(file.fileName, module);
                        if (canonical != module) {
                            replacements.push(replaceNode(node.moduleSpecifier, `'${canonical}'`));
                        }
                    }
                }
            }
        }
    }

    for (let module in imports) {
        if (imports[module].length > 1 || rename.has(module)) {
            const names: ts.ImportSpecifier[] = [];
            imports[module].forEach((importDeclaration, i) => {
                const namedImports = importDeclaration.importClause!.namedBindings as ts.NamedImports;
                names.push(...namedImports.elements);
                if (i > 0) {
                    replacements.push({
                        start: importDeclaration.getStart(),
                        end: importDeclaration.getEnd() + 1,
                        value: '',
                    });
                }
            });
            const first = imports[module][0];
            replacements.push({
                start: first.importClause!.namedBindings!.getStart(),
                end: first.importClause!.namedBindings!.getEnd(),
                value: '{' + names.map(n => n.getText()).join(', ') + '}',
            });
            replacements.push({
                start: first.moduleSpecifier.getStart(),
                end: first.moduleSpecifier.getEnd(),
                value: `'${module}'`,
            });
        }
    }

    return replacements;
}

function processFile(src: string, filePath: string) {
    const file = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true);

    const replacements = transform(file);
    if (replacements.length > 0) {
        const result = doReplacements(src, replacements);

        fs.writeFileSync(filePath, result);
    }
}