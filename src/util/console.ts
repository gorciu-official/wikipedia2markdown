// deno-lint-ignore-file no-namespace
//  ^
//  ^ THIS is being used because it is cleaner
//    to make a namespace than to make a JSON object
//    which is exported

import * as readline from 'node:readline';
import process from "node:process";

export namespace out {
    function decorate(level: string, color: string, message: string): string {
        return `[ \x1b[1;${color}m${level}\x1b[0m ] ${message}`;
    };

    function input(message: string) {
        console.log(
            decorate('INPUT', '34', message)
        );
    }

    export function warn(message: string) {
        console.log(
            decorate('WARN', '33', message)
        );
    }

    export function log(message: string) {
        console.log(
            decorate('LOG', '37', message)
        );
    }

    export function success(message: string) {
        console.log(
            decorate('OK', '32', message)
        );
    }

    export function err(message: string) {
        console.log(
            decorate('ERROR', '31', message)
        );
    }

    export function askForInput(msg: string): Promise<string> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        input(msg);

        return new Promise((resolve) => {
            rl.question(decorate('INPUT', '34', '$ '), (r) => {
                rl.close();
                resolve(r);
            });
        });
    }

    export async function askForNumber(msg: string): Promise<number> {
        while (true) {
            const inputed = await askForInput(msg);
            const n = parseInt(inputed, 10);
            if (isNaN(n)) {
                warn('Sadly, that\'s not a number!');
                continue;
            }
            return n;
        }
    }
};