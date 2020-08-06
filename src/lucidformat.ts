import * as ts from 'typescript';

import {transform as combineImports} from './combineimports';
import {combineReplacements, doReplacements, Replacement} from './common/replace';
import {transform as initializeEnums} from './initializeenums';
import {transform as removeUnusedImports} from './unusedimports';

export function getLucidEdits(contents: string, name: string): string {
    const sourceFile = ts.createSourceFile(name, contents, ts.ScriptTarget.Latest, true);
    const transformFunctions = [combineImports, removeUnusedImports, initializeEnums];
    let replacements: Replacement[] = [];
    transformFunctions.forEach((f) => replacements.push(...f(sourceFile)));
    replacements = combineReplacements(replacements);

    return doReplacements(contents, replacements);
}
