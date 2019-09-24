import * as ts from 'typescript';

import {Replacement} from './common/replace';
import {walk} from './common/walk';

export function transform(file: ts.SourceFile): Replacement[] {
    const replacements: Replacement[] = [];

    if (file.fileName.endsWith('.d.ts')) {
        return [];
    }

    walk(file, node => {
        if (ts.isEnumDeclaration(node)) {
            if (node.members.some(m => !m.initializer)) {
                if (node.members.every(m => !m.initializer || ts.isNumericLiteral(m.initializer))) {
                    let last = -1;
                    node.members.forEach(m => {
                        const init = m.initializer;
                        if (init && ts.isNumericLiteral(init)) {
                            last = parseInt(init.text, 10);
                        } else {
                            const comments = ts.getLeadingCommentRanges(file.getText(), m.getFullStart());
                            if (comments && comments.length > 0 && comments.some(comment => {
                                    return file.getText().substring(comment.pos, comment.end) == '// UNINITIALIZED';
                                })) {
                                last++;
                            } else {
                                replacements.push(
                                    {start: m.name.getEnd(), end: m.name.getEnd(), value: ` = ${++last}`}
                                );
                            }
                        }
                    });
                }
            }
        }
    });

    return replacements;
}
