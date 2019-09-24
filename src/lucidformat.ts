import * as ts from 'typescript';
import * as vscode from 'vscode';

import {transform as accessModifiers} from './accessmodifiers';
import {transform as combineImports} from './combineimports';
import {combineReplacements, doReplacements, Replacement} from './common/replace';
import {transform as initializeEnums} from './initializeenums';
import {transform as replaceVars} from './novars';
import {transform as missingSemicolons} from './semicolon';
import {transform as trailingComma} from './trailingcommainitializer';
import {transform as removeUnusedImports} from './unusedimports';
import {transform as variableDeclaration} from './variabledeclaration';

export function getLucidEdits(document: vscode.TextDocument, name: string): string {
    const contents = document.getText();
    const sourceFile = ts.createSourceFile(name, contents, ts.ScriptTarget.Latest, true);
    const addModifiers = vscode.workspace.getConfiguration('lucid-format').get<boolean>('add-missing-access-modifiers');
    const transformFunctions = [
        missingSemicolons,
        trailingComma,
        variableDeclaration,
        replaceVars,
        combineImports,
        removeUnusedImports,
        initializeEnums,
        ...(addModifiers ? [accessModifiers] : []),
    ];
    let replacements: Replacement[] = [];
    transformFunctions.forEach(f => replacements.push(...f(sourceFile)));
    replacements = combineReplacements(replacements);

    return doReplacements(contents, replacements);
}