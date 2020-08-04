import * as ts from 'typescript';

import {Replacement} from './common/replace';
import {walk} from './common/walk';

export function transform(file: ts.SourceFile): Replacement[] {
    const replacements: Replacement[] = [];

    const indexesOpen: number[] = [];
    const indexesClose: number[] = [];

    walk(file, (node) => {
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
                if (
                    elseStatement.statements.length == 1 &&
                    elseStatement.statements[0].kind == ts.SyntaxKind.IfStatement
                ) {
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

    const openLocations = indexesOpen.map((pos) => {
        return {
            start: pos,
            end: pos,
            value: '{',
        };
    });
    const closeLocations = indexesClose.map((pos) => {
        return {
            start: pos,
            end: pos,
            value: '}',
        };
    });

    const toReplace = [...replacements, ...openLocations, ...closeLocations];

    return toReplace;
}
