import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

export function isDirectory(filePath: string) {
    return fs.existsSync(filePath) && fs.lstatSync(filePath).isDirectory();
}

export function getTsConfig(filePath: string) {
    let dir = path.dirname(filePath);
    let prevDir = filePath;
    while (dir != prevDir) {
        const tsConfigPaths = [dir + '/tsconfig.build.json', dir + '/tsconfig.json'];
        const tsConfigPath = tsConfigPaths.find(p => fs.existsSync(p));
        if (tsConfigPath) {
            const config: any = ts.parseConfigFileTextToJson(tsConfigPath, fs.readFileSync(tsConfigPath).toString());
            config.path = tsConfigPath;
            return config;
        }
        prevDir = dir;
        dir = path.dirname(dir);
    }
    return false;
}

export function resolveImport(importSpecifier: string, filePath: string): string {
    const config = getTsConfig(filePath);
    if (importSpecifier.startsWith('.')) {
        return path.resolve(path.dirname(filePath), importSpecifier) + '.ts';
    }
    // if (config && config.config.compilerOptions && config.config.compilerOptions.paths) {
    //     for (let p in config.config.compilerOptions.paths) {
    //         if (p.endsWith('*') && importSpecifier.startsWith(p.replace('*', ''))) {
    //             if (config.config.compilerOptions.paths[p].length == 1) {
    //                 const mapped = config.config.compilerOptions.paths[p][0].replace('*', '');
    //                 const mappedDir = path.resolve(path.dirname(config.path), mapped);

    //                 const dirCheck = mappedDir + '/' + importSpecifier.substr(p.replace('*', '').length);
    //                 const isIndex = isDirectory(dirCheck);

    //                 return isIndex ? dirCheck : dirCheck + '.ts';
    //             }
    //         }
    //     }
    // }
    if (config && config.path) {
        const maybeDir = path.resolve(path.dirname(config.path), importSpecifier);
        const isIndex = isDirectory(maybeDir);

        if (isIndex) {
            if (fs.existsSync(path.join(maybeDir, 'index.ts'))) {
                return maybeDir;
            }
        } else {
            const relativeFromConfig = maybeDir + '.ts';
            if (fs.existsSync(relativeFromConfig)) {
                return relativeFromConfig;
            }
        }
    }
    return importSpecifier;
}

export function isInDir(dir: string, p: string) {
    const relative = path.relative(dir, p);
    return !relative.startsWith('../');
}

export function getRelativePath(fromPath: string, specifier: string): string {
    // const config = getTsConfig(fromPath);
    // if (config && config.config && config.config.compilerOptions && config.config.compilerOptions.paths) {
    //     for (let p in config.config.compilerOptions.paths) {
    //         if (config.config.compilerOptions.paths[p].length == 1) {
    //             const mapped = config.config.compilerOptions.paths[p][0].replace('*', '');
    //             const mappedDir = path.resolve(path.dirname(config.path), mapped);
    //             if (isInDir(mappedDir, specifier)) {
    //                 return p.replace('*', '') + path.relative(mappedDir, specifier);
    //             }
    //         }
    //     }
    // }

    if (!specifier.startsWith('/')) {
        return specifier;
    }

    let relative = path.relative(path.dirname(fromPath), specifier);
    relative = relative.replace(/\\/g, '/');
    if (!relative.startsWith('.')) {
        relative = './' + relative;
    }
    return relative;
}

export function removeExtension(filePath: string): string {
    let ext = path.extname(filePath);
    const extensions = ['.ts', '.tsx'];
    if (ext == '.ts' && filePath.endsWith('.d.ts')) {
        ext = '.d.ts';
    }
    if (extensions.indexOf(ext) >= 0) {
        return filePath.slice(0, -ext.length);
    }
    return filePath;
}

export function removeTrailingSlash(filePath: string): string {
    if (filePath.endsWith('/') || filePath.endsWith('\\')) {
        return filePath.slice(0, -1);
    }
    return filePath;
}
