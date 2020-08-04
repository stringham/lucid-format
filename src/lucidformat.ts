import * as ts from 'typescript';
import * as vscode from 'vscode';

import {transform as combineImports} from './combineimports';
import {combineReplacements, doReplacements, Replacement} from './common/replace';
import {transform as initializeEnums} from './initializeenums';
import {transform as removeUnusedImports} from './unusedimports';
import {transform as enforceBraces} from './enforcebraces';

export function getLucidEdits(document: vscode.TextDocument, name: string): string {
    const contents = document.getText();
    const sourceFile = ts.createSourceFile(name, contents, ts.ScriptTarget.Latest, true);
    const transformFunctions = [
        combineImports,
        removeUnusedImports,
        initializeEnums,
        enforceBraces
    ];
    let replacements: Replacement[] = [];
    transformFunctions.forEach(f => replacements.push(...f(sourceFile)));
    replacements = combineReplacements(replacements);

    return doReplacements(contents, replacements);
}
