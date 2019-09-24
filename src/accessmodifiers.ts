import * as ts from 'typescript';

import {Replacement} from './common/replace';
import {walk} from './common/walk';

export function transform(file: ts.SourceFile): Replacement[] {
    if (file.isDeclarationFile || file.fileName.endsWith('.d.ts')) {
        return [];
    }

    const replacements: Replacement[] = [];

    const accessKeywords = new Set([
        ts.SyntaxKind.PublicKeyword,
        ts.SyntaxKind.ProtectedKeyword,
        ts.SyntaxKind.PrivateKeyword,
    ]);

    function missingAccess(modifiers: ts.NodeArray<ts.Modifier>|undefined): boolean {
        // access modifiers have to be first.
        return !modifiers || modifiers.length == 0 || !accessKeywords.has(modifiers[0].kind);
    }
    walk(file, (node) => {
        if ((node.parent && ts.isClassDeclaration(node.parent)) &&
            (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node))) {
            if (missingAccess(node.modifiers)) {
                const idx = (ts.isMethodDeclaration(node) && node.asteriskToken) ?
                    node.asteriskToken.getStart() :
                    (node.modifiers ? node.modifiers[0].getStart() : node.name.getStart());
                replacements.push({
                    start: idx,
                    end: idx,
                    value: 'private ',
                });
            }
        }
    });

    return replacements;
}
