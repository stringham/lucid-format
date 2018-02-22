import * as ts from 'typescript';

export interface Replacement {
    start: number;
    end: number;
    value: string;
}

export function replaceNode(node: ts.Node, text: string): Replacement {
    return {
        start: node.getStart(),
        end: node.getEnd(),
        value: text,
    };
}

export function sortReplacements(replacements: Replacement[]): Replacement[] {
    return replacements.sort((a, b) => {
        if(a.start != b.start) {
            return a.start - b.start;
        }
        if(a.value == ';') {
            return -1;
        } else if(b.value == ';') {
            return 1;
        }
        return a.end - b.end;
    });
}

export function copy(r: Replacement): Replacement {
    return {
        start: r.start,
        end: r.end,
        value: r.value,
    };
}

export function combineReplacements(replacements: Replacement[]): Replacement[] {
    if (replacements.length == 0) {
        return replacements;
    }
    replacements = sortReplacements(replacements);
    let result: Replacement[] = [copy(replacements[0])];
    for (let i = 1; i < replacements.length; i++) {
        let last = result[result.length - 1];
        if (last.end == replacements[i].start) {
            last.end = replacements[i].end;
            last.value += replacements[i].value;
        } else {
            result.push(copy(replacements[i]));
        }
    }

    return result;
}

export function doReplacements(text: string, replacements: Replacement[]): string {
    let result = text;
    let offset = 0;

    replacements = sortReplacements(replacements);

    for (let i = 1; i < replacements.length; i++) {
        if (replacements[i].start < replacements[i - 1].end) {
            replacements.splice(i, 1);
            i--;
        }
    }

    const replaceBetween = (str: string, start: number, end: number, replacement: string) => {
        return str.substr(0, start) + replacement + str.substr(end);
    };
    for (let i = 0; i < replacements.length; i++) {
        const edit = replacements[i];
        result = replaceBetween(result, edit.start + offset, edit.end + offset, edit.value);
        offset += edit.value.length - (edit.end - edit.start);
    }

    return result;
}
