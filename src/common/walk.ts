import * as ts from 'typescript';

export function walk(node: ts.Node, fn: (node: ts.Node) => any): boolean {
    if (fn(node)) {
        return true;
    }
    const children = node.getChildren();
    for (let i = 0; i < children.length; i++) {
        if (walk(children[i], fn)) {
            return true;
        }
    }
    return false;
};

export function findParent(child: ts.Node, kind: ts.SyntaxKind) {
    if (!child.parent) {
        return undefined;
    }
    let result: ts.Node = child.parent;
    while (result.kind != kind && result.parent) {
        result = result.parent;
    }
    if (result.kind == kind) {
        return result;
    }
    return undefined;
}

export function findFirstAncestor(child: ts.Node, f: (n: ts.Node) => boolean) {
    let result: ts.Node = child;
    while (!f(result) && result.parent) {
        result = result.parent;
    }
    if (f(result)) {
        return result;
    }
    return undefined;
}

export function findDescendents(parent: ts.Node, f: (n: ts.Node) => boolean): ts.Node[] {
    const result: ts.Node[] = [];

    walk(parent, n => {
        if (f(n)) {
            result.push(n);
        }
    });

    return result;
}

export function isAncestor(node: ts.Node, child: ts.Node): boolean {
    let current = child;
    while (current.parent && current != node) {
        current = current.parent;
    }

    return current == node;
}
