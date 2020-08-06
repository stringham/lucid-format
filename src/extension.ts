import * as vscode from 'vscode';
import {ESLint} from 'eslint';
import {format, resolveConfig, resolveConfigFile} from 'prettier';
import path = require('path');
import {getLucidEdits} from './lucidformat';
import {ISequence, LcsDiff} from './diff/diff';

export const outputChannel = vscode.window.createOutputChannel('Lucid-Format');

export class LucidDocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
    public async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): Promise<vscode.TextEdit[]> {
        return await this.formatDocument(document);
    }

    private getEdits(document: vscode.TextDocument, finalContent: string): vscode.TextEdit[] {
        const modelLineSequence = new (class implements ISequence {
            public getLength(): number {
                return document.lineCount;
            }
            public getElementHash(index: number): string {
                return document.lineAt(index).text;
            }
        })();
        const finalLines = finalContent.split('\n');
        const textSourceLineSequence = new (class implements ISequence {
            public getLength(): number {
                return finalLines.length;
            }
            public getElementHash(index: number): string {
                return finalLines[index];
            }
        })();

        const diffResult = new LcsDiff(modelLineSequence, textSourceLineSequence).ComputeDiff(false);

        const edits: vscode.TextEdit[] = [];
        const modelLineCount = document.lineCount;

        for (let i = 0; i < diffResult.length; i++) {
            const diff = diffResult[i];
            const originalStart = diff.originalStart;
            const originalLength = diff.originalLength;
            const modifiedStart = diff.modifiedStart;
            const modifiedLength = diff.modifiedLength;

            let lines: string[] = [];
            for (let j = 0; j < modifiedLength; j++) {
                lines[j] = finalLines[modifiedStart + j];
            }
            const text = lines.join('\n');

            if (originalLength == 0) {
                console.log('insertion');
                // insertion
                if (originalStart == modelLineCount) {
                    console.log('insertion at end');
                    // insert at end
                    edits.push(
                        new vscode.TextEdit(
                            new vscode.Range(
                                document.lineAt(document.lineCount - 1).range.end,
                                document.lineAt(document.lineCount - 1).range.end,
                            ),
                            '\n' + text,
                        ),
                    );
                } else {
                    edits.push(
                        new vscode.TextEdit(
                            new vscode.Range(
                                new vscode.Position(originalStart, 0),
                                new vscode.Position(originalStart, 0),
                            ),
                            text + '\n',
                        ),
                    );
                }
            } else if (modifiedLength === 0) {
                // deletion
                console.log('deletion');
                if (originalStart + originalLength >= modelLineCount) {
                    console.log('deletion at end');
                    // delete at end
                    edits.push(
                        new vscode.TextEdit(
                            new vscode.Range(
                                document.lineAt(originalStart).range.end,
                                document.lineAt(document.lineCount - 1).range.end,
                            ),
                            '',
                        ),
                    );
                } else {
                    edits.push(
                        new vscode.TextEdit(
                            new vscode.Range(
                                document.lineAt(originalStart).range.start,
                                document.lineAt(originalStart + originalLength).range.start,
                            ),
                            '',
                        ),
                    );
                }
            } else {
                console.log('modify');
                edits.push(
                    new vscode.TextEdit(
                        new vscode.Range(
                            document.lineAt(originalStart).range.start,
                            document.lineAt(originalStart + originalLength - 1).range.end,
                        ),
                        text,
                    ),
                );
            }
        }

        return edits;
    }

    private getAssumedFilename(document: vscode.TextDocument) {
        if (document.isUntitled) {
            return 'file.ts';
        }
        return document.fileName;
    }

    private async formatDocument(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
        const filename = this.getAssumedFilename(document);
        const eslint = new ESLint({
            useEslintrc: true,
            fix: true,
        });
        const prettierSettingsFile = await resolveConfigFile(filename);
        const prettierSettings = prettierSettingsFile && (await resolveConfig(prettierSettingsFile));
        if (!prettierSettings) {
            throw new Error('No valid Prettier settings found.');
        }

        const fileContents = document.getText();
        const lintResults = await eslint.lintText(fileContents, {filePath: filename});
        const lintOutput = (lintResults[0] && lintResults[0].output) || fileContents;
        const codeContent = getLucidEdits(lintOutput, filename);

        const prettierOutput = format(codeContent, {
            ...prettierSettings,
            filepath: filename,
        });
        return this.getEdits(document, prettierOutput);
    }
}

export function activate(ctx: vscode.ExtensionContext): void {
    const formatter = new LucidDocumentFormattingEditProvider();

    console.log('lucid format active');

    const ts = {
        language: 'typescript',
        scheme: 'file',
    };
    const js = {
        language: 'javascript',
        scheme: 'file',
    };
    ctx.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(ts, formatter));
    ctx.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(js, formatter));
}
