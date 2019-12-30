import * as fs from 'fs';
import * as ts from 'typescript';

import {doReplacements, Replacement} from './common/replace';
import {walk} from './common/walk';

export function transform(file: ts.SourceFile): Replacement[] {
    const indexes: {[key: number]: true} = {};

    walk(file, (node) => {
        if (ts.isConstructorDeclaration(node)) {
            let hasModifier = false;
            if (node.parameters.length < 4) {
                node.parameters.forEach(param => {
                    if (param.modifiers) {
                        hasModifier = true;
                    }
                });
            }
            if (hasModifier || node.parameters.length >= 4) {
                const last = node.parameters[node.parameters.length - 1];
                if (!last.dotDotDotToken && file.getFullText()[last.getEnd()] != ',') {
                    indexes[last.getEnd()] = true;
                }
            }
        }
    });

    return Object.keys(indexes).map(a => parseInt(a, 10)).map(pos => {
        return {
            start: pos,
            end: pos,
            value: ',',
        };
    });
}

function processFile(src: string, filePath: string) {
    const file = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true);

    const replacements = transform(file);
    if (replacements.length > 0) {
        const result = doReplacements(src, replacements);
        fs.writeFileSync(filePath, result);
    }
}