import * as ts from 'typescript';

import {Replacement} from './common/replace';
import {walk} from './common/walk';

export function transform(file: ts.SourceFile): Replacement[] {
    const replacements: Replacement[] = [];
    walk(file, node => {
        if (ts.isVariableDeclarationList(node) && !ts.isForStatement(node.parent)) {
            if (node.declarations.length > 1) {
                const newStatements: string[] = [];
                let replace = false;
                node.declarations.forEach(d => {
                    replace = replace || !!d.initializer;
                    let comments = ts.getLeadingCommentRanges(file.getText(), d.getFullStart());
                    if (comments) {
                        comments.forEach(comment => {
                            newStatements.push(file.getText().substring(comment.pos, comment.end));
                        });
                    }
                    newStatements.push(node.getFirstToken()!.getText() + ' ' + d.getText() + ';');
                    comments =
                        ts.getTrailingCommentRanges(file.getText(), d.getFullStart() + d.getFullText().length + 1);
                    if (comments) {
                        comments.forEach(comment => {
                            newStatements.push(file.getText().substring(comment.pos, comment.end));
                        });
                    }
                });
                if (replace) {
                    const hasSemicolon = node.parent.getText().slice(-1) == ';';
                    replacements.push({
                        start: node.getStart(),
                        end: node.getEnd() + (hasSemicolon ? 1 : 0),
                        value: newStatements.join('\n'),
                    });
                }
            }
        }
    });

    return replacements;
}
