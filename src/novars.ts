import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import {doReplacements, Replacement as Replacement} from './common/replace';
import {findDescendents, findFirstAncestor, findParent, isAncestor, walk} from './common/walk';

function getVarScopeBlock(node: ts.Node) {
    const functionScope = findFirstAncestor(node, n => {
        return ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isFunctionExpression(n) ||
            ts.isArrowFunction(n) || ts.isConstructorDeclaration(n);
    });
    if (functionScope) {
        return (functionScope as (
                    ts.FunctionDeclaration | ts.FunctionExpression | ts.MethodDeclaration | ts.ArrowFunction |
                    ts.ConstructorDeclaration
                )).body as ts.Block;
    }
    return node.getSourceFile();
}

function getBlockScope(node: ts.Node) {
    return findFirstAncestor(node, n => {
        return ts.isForInStatement(n) || ts.isForOfStatement(n) || ts.isForStatement(n) || ts.isBlock(n) ||
            ts.isSourceFile(n);
    });
}

function flatten(arr: any[]): any[] {
    let i = 0;
    while (i < arr.length) {
        if (Array.isArray(arr[i])) {
            arr.splice(i, 1, ...arr[i]);
        } else {
            i++;
        }
    }
    return arr;
};

function getDeclarationNames(d: ts.BindingName): string[] {
    if (ts.isObjectBindingPattern(d)) {
        const r = flatten(d.elements.map(element => {
            return getDeclarationNames(element.name);
        }));
        return flatten(d.elements.map(element => {
            return getDeclarationNames(element.name);
        }));
    } else if (ts.isArrayBindingPattern(d)) {
        const elements: ts.BindingElement[] = d.elements.filter(a => !ts.isOmittedExpression(a)) as ts.BindingElement[];
        return flatten(elements.map(element => {
            return getDeclarationNames(element.name);
        }));
    } else {
        return [d.getText()];
    }
}

function canChangeToLet(v: ts.Node) {
    if (!v.parent || !ts.isVariableDeclarationList(v.parent)) {
        return false;
    }
    let scope = getVarScopeBlock(v);
    const vd = v.parent;
    let blockScope = getBlockScope(v);

    if (!scope || !blockScope) {
        return false;
    }

    const names = flatten(vd.declarations.map(d => getDeclarationNames(d.name)));

    return names.every(varName => {
        const references = findDescendents(scope!, node => {
            if (!ts.isIdentifier(node)) {
                return false;
            }
            if (node.getText() != varName) {
                return false;
            }
            if (node.parent && ts.isPropertyAccessExpression(node.parent)) {
                return node.parent.expression == node;
            }
            return true;
        });
        return references.every(ref => {
            const inScope = isAncestor(blockScope!, ref);
            const isAfter = ref.getStart() >= v.getStart();
            let declarationAncestor =
                findParent(ref, ts.SyntaxKind.VariableDeclaration) as (ts.VariableDeclaration | undefined);
            return inScope && isAfter &&
                (!declarationAncestor || declarationAncestor.parent == vd ||
                 declarationAncestor.name.getText() != varName);
        });
    });
}

function canBeConst(node: ts.Node) {
    if (!node.parent || !ts.isVariableDeclarationList(node.parent)) {
        return false;
    }

    let scope = getBlockScope(node);
    let vd = node.parent;

    if (!scope || !vd) {
        return false;
    }

    // if it is not initialized, it can't be const
    if (vd.declarations.some(d => {
            return !d.initializer;
        })) {
        return false;
    };

    // don't change exports to const
    if (vd.parent && vd.parent.modifiers && vd.parent.modifiers.some(m => m.kind == ts.SyntaxKind.ExportKeyword)) {
        return false;
    }

    const names = flatten(vd.declarations.map(d => getDeclarationNames(d.name)));

    const assignments = findDescendents(scope, n => {
        if (ts.isBinaryExpression(n)) {
            const assignmentTokens: {[key: number]: true} = {
                [ts.SyntaxKind.EqualsToken]: true,
                [ts.SyntaxKind.PlusEqualsToken]: true,
                [ts.SyntaxKind.MinusEqualsToken]: true,
                [ts.SyntaxKind.AsteriskAsteriskEqualsToken]: true,
                [ts.SyntaxKind.AsteriskEqualsToken]: true,
                [ts.SyntaxKind.SlashEqualsToken]: true,
                [ts.SyntaxKind.PercentEqualsToken]: true,
                [ts.SyntaxKind.AmpersandEqualsToken]: true,
                [ts.SyntaxKind.BarEqualsToken]: true,
                [ts.SyntaxKind.CaretEqualsToken]: true,
                [ts.SyntaxKind.FirstCompoundAssignment]: true,
                [ts.SyntaxKind.LessThanLessThanEqualsToken]: true,
                [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken]: true,
                [ts.SyntaxKind.GreaterThanGreaterThanEqualsToken]: true,
            };
            if (assignmentTokens[n.operatorToken.kind]) {
                return true;
            }
        }
        const mutatorOperator: {[key: number]: true} = {
            [ts.SyntaxKind.PlusPlusToken]: true,
            [ts.SyntaxKind.MinusMinusToken]: true,
        };
        if (ts.isPostfixUnaryExpression(n) && mutatorOperator[n.operator]) {
            return true;
        }
        if (ts.isPrefixUnaryExpression(n) && mutatorOperator[n.operator]) {
            return true;
        }
        return false;
    });

    if (assignments.some(a => {
            if (ts.isBinaryExpression(a)) {
                if (a.left.kind != ts.SyntaxKind.PropertyAccessExpression) {
                    return findDescendents(a.left, n => names.indexOf(n.getText()) >= 0).length > 0;
                }
            }
            if (ts.isPostfixUnaryExpression(a) || ts.isPrefixUnaryExpression(a)) {
                const name = a.operand.getText();
                return names.indexOf(name) >= 0;
            }
            return false;
        })) {
        return false;
    }

    return true;
}

let varsChanged = 0, varsSkipped = 0;
let changedToConst = 0, letChangedToConst = 0;
let changedToLet = 0, letsSkipped = 0;

export function transform(file: ts.SourceFile): Replacement[] {
    const replacements: Replacement[] = [];

    walk(file, node => {
        if (node.kind == ts.SyntaxKind.VarKeyword) {
            if (canChangeToLet(node)) {
                const type = canBeConst(node) ? 'const' : 'let';
                replacements.push({
                    start: node.getStart(),
                    end: node.getEnd(),
                    value: type,
                });
                varsChanged++;
                if (type == 'const') {
                    changedToConst++;
                } else {
                    changedToLet++;
                }
            } else {
                varsSkipped++;
            }
        }
        if (node.kind == ts.SyntaxKind.LetKeyword) {
            if (canBeConst(node)) {
                replacements.push({
                    start: node.getStart(),
                    end: node.getEnd(),
                    value: 'const',
                });
                letChangedToConst++;
            } else {
                letsSkipped++;
            }
        }
    });

    return replacements;
}
