import * as vscode from 'vscode';
import cp = require('child_process');
import path = require('path');
import {getBinPath} from './clangpath';
import {getLucidEdits} from './lucidformat';
import {ISequence, LcsDiff} from './diff/diff';

export const outputChannel = vscode.window.createOutputChannel('Lucid-Format');

export class LucidDocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
    private defaultConfigure = {executable: 'clang-format', assumeFilename: 'file.ts'};

    public provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): Thenable<vscode.TextEdit[]> {
        return this.doFormatDocument(document, token);
    }

    private getEdits(document: vscode.TextDocument, finalContent: string): vscode.TextEdit[] {
        const modelLineSequence = new class implements ISequence {
            public getLength(): number {
                return document.lineCount;
            }
            public getElementHash(index: number): string {
                return document.lineAt(index).text;
            }
        };
        const finalLines = finalContent.split('\n');
        const textSourceLineSequence = new class implements ISequence {
            public getLength(): number {
                return finalLines.length;
            }
            public getElementHash(index: number): string {
                return finalLines[index];
            }
        };

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
                    edits.push(new vscode.TextEdit(
                        new vscode.Range(
                            document.lineAt(document.lineCount - 1).range.end,
                            document.lineAt(document.lineCount - 1).range.end
                        ),
                        '\n' + text
                    ));
                } else {
                    edits.push(new vscode.TextEdit(
                        new vscode.Range(
                            new vscode.Position(originalStart, 0),
                            new vscode.Position(originalStart, 0),
                        ),
                        text + '\n'
                    ));
                }
            } else if (modifiedLength === 0) {
                // deletion
                console.log('deletion');
                if (originalStart + originalLength >= modelLineCount) {
                    console.log('deletion at end');
                    // delete at end
                    edits.push(new vscode.TextEdit(
                        new vscode.Range(
                            document.lineAt(originalStart).range.end, document.lineAt(document.lineCount - 1).range.end
                        ),
                        ''
                    ));
                } else {
                    edits.push(new vscode.TextEdit(
                        new vscode.Range(
                            document.lineAt(originalStart).range.start,
                            document.lineAt(originalStart + originalLength).range.start
                        ),
                        ''
                    ));
                }
            } else {
                console.log('modify');
                edits.push(new vscode.TextEdit(
                    new vscode.Range(
                        document.lineAt(originalStart).range.start,
                        document.lineAt(originalStart + originalLength - 1).range.end
                    ),
                    text
                ));
            }
        }

        return edits;
    }

    // Get execute name in clang-format.executable, if not found, use default value
    // If configure has changed, it will get the new value
    private getExecutablePath() {
        const execPath = vscode.workspace.getConfiguration('lucid-format').get<string>('clang-format-executable');
        if (!execPath) {
            return this.defaultConfigure.executable;
        }

        // replace placeholders, if present
        return execPath.replace(/\${workspaceRoot}/g, vscode.workspace.rootPath)
            .replace(/\${cwd}/g, process.cwd())
            .replace(/\${env\.([^}]+)}/g, (sub: string, envName: string) => {
                return process.env[envName];
            });
    }

    private getAssumedFilename(document: vscode.TextDocument) {
        if (document.isUntitled) {
            return this.defaultConfigure.assumeFilename;
        }
        return document.fileName;
    }

    private doFormatDocument(document: vscode.TextDocument, token: vscode.CancellationToken):
        Thenable<vscode.TextEdit[]> {
        return new Promise((resolve, reject) => {
                   const filename = document.fileName;

                   const formatCommandBinPath = getBinPath(this.getExecutablePath());
                   const codeContent = getLucidEdits(document, this.getAssumedFilename(document));

                   const childCompleted = (err, stdout, stderr) => {
                       try {
                           if (err && (<any>err).code === 'ENOENT') {
                               vscode.window.showInformationMessage(
                                   'The \'' + formatCommandBinPath +
                                   '\' command is not available.  Please check your clang-format.executable user setting and ensure it is installed.'
                               );
                               return resolve(null);
                           }
                           if (stderr) {
                               outputChannel.show();
                               outputChannel.clear();
                               outputChannel.appendLine(stderr);
                               return reject('Cannot format due to syntax errors.');
                           }
                           if (err) {
                               return reject();
                           }
                           return resolve(this.getEdits(document, stdout));
                       } catch (e) {
                           reject(e);
                       }
                   };

                   const formatArgs = [`-assume-filename=${this.getAssumedFilename(document)}`];

                   let workingPath = vscode.workspace.rootPath;
                   if (!document.isUntitled) {
                       workingPath = path.dirname(document.fileName);
                   }

                   const child = cp.execFile(formatCommandBinPath, formatArgs, {cwd: workingPath}, childCompleted);
                   child.stdin.end(codeContent);

                   if (token) {
                       token.onCancellationRequested(() => {
                           child.kill();
                           reject(new Error('Cancelation requested'));
                       });
                   }
               })
            .catch(e => {
                console.log(e);
                return ([] as any);
            });
    }

    public formatDocument(document: vscode.TextDocument): Thenable<vscode.TextEdit[]> {
        return this.doFormatDocument(document, null);
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
