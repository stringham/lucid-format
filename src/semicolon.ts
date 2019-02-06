import * as ts from 'typescript';

import {Replacement} from './common/replace';
import {walk} from './common/walk';

export function transform(file: ts.SourceFile): Replacement[] {
    const replacements: Replacement[] = [];

    let indexes: {[key: number]: true} = {};
    const replaceIndexes: {[key: number]: true} = {};
    const indexesOpen: number[] = [];
    const indexesClose: number[] = [];

    const kindsICareAbout: any = {
        [ts.SyntaxKind.VariableStatement]: true,
        [ts.SyntaxKind.ExpressionStatement]: true,
        [ts.SyntaxKind.ReturnStatement]: true,
        [ts.SyntaxKind.BreakStatement]: true,
        [ts.SyntaxKind.ContinueStatement]: true,
        [ts.SyntaxKind.ThrowStatement]: true,
        [ts.SyntaxKind.ImportEqualsDeclaration]: true,
        [ts.SyntaxKind.DoStatement]: true,
        [ts.SyntaxKind.ExportAssignment]: true,
        [ts.SyntaxKind.TypeAliasDeclaration]: true,
        [ts.SyntaxKind.ImportDeclaration]: true,
        [ts.SyntaxKind.ExportDeclaration]: true,
        [ts.SyntaxKind.DebuggerStatement]: true,
        [ts.SyntaxKind.PropertyDeclaration]: true,
    };

    walk(file, (node) => {

        if (kindsICareAbout[node.kind]) {
            if (node.getText().slice(-1) != ';') {
                indexes[node.getEnd()] = true;
            }
        } else if (
            (ts.isModuleDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) &&
            node.body === undefined
        ) {
            if (node.getText().slice(-1) != ';') {
                indexes[node.getEnd()] = true;
            }
        } else if (ts.isInterfaceDeclaration(node)) {
            node.members.forEach(member => {
                const lastChar = member.getText().slice(-1);
                if (lastChar != ';') {
                    if (lastChar == ',') {
                        replacements.push({start: member.getEnd() - 1, end: member.getEnd(), value: ';'});
                    } else {
                        indexes[member.getEnd()] = true;
                    }
                }
            });
        }

        if (ts.isIfStatement(node)) {
            const thenStatement = node.thenStatement;
            if (!ts.isBlock(thenStatement)) {
                indexesOpen.push(thenStatement.getStart());
                indexesClose.push(thenStatement.getEnd());
            }
            const elseStatement = node.elseStatement;
            if (elseStatement && !elseStatement.getText().startsWith('if')) {
                if (elseStatement.getText().slice(-1) != '}') {
                    indexesOpen.push(elseStatement.getStart());
                    indexesClose.push(elseStatement.getEnd());
                }
            }
            if (elseStatement && ts.isBlock(elseStatement)) {
                if (elseStatement.statements.length == 1 &&
                    elseStatement.statements[0].kind == ts.SyntaxKind.IfStatement) {
                    replacements.push({
                        start: elseStatement.getStart(),
                        end: elseStatement.getStart() + 1,
                        value: '',
                    });
                    replacements.push({
                        start: elseStatement.getEnd() - 1,
                        end: elseStatement.getEnd(),
                        value: '',
                    });
                }
            }
        }

        if (ts.isIterationStatement(node, false)) {
            const statement = node.statement;
            if (!ts.isBlock(statement)) {
                indexesOpen.push(statement.getStart());
                indexesClose.push(statement.getEnd());
            }
        }

    });

    const unique = Object.keys(indexes).map(a => parseInt(a, 10)).map(pos => {
        return {
            start: pos,
            end: pos,
            value: ';',
        };
    });

    const openLocations = indexesOpen.map(pos => {
        return {
            start: pos,
            end: pos,
            value: '{',
        };
    });
    const closeLocations = indexesClose.map(pos => {
        return {
            start: pos,
            end: pos,
            value: '}',
        };
    });

    const toReplace = [...replacements, ...unique, ...openLocations, ...closeLocations];

    return toReplace;
}
