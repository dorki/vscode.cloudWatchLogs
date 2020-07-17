import * as fs from 'fs'
import * as path from 'path'

export function getDirFileNames(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    return fs.readdirSync(dir);
}

export function createFile(dir: string, fileName: string) {
    fs.writeFileSync(path.join(dir, fileName), "");
}

export function deleteFile(dir: string, fileName: string) {
    fs.unlinkSync(path.join(dir, fileName));
}

export function renameFile(dir: string, oldFileName: string, newFileName: string) {
    fs.renameSync(path.join(dir, oldFileName), path.join(dir, newFileName));
}