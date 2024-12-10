
// Following globals types are required by the TS compiler and supported by the js-interpreter
interface Array<T> {
   length: number;
   toString(): string;
   toLocaleString(): string;
   pop(): T | undefined;
   push(...items: T[]): number;
   concat(...items: ConcatArray<T>[]): T[];
   concat(...items: (T | ConcatArray<T>)[]): T[];
   join(separator?: string): string;
   reverse(): T[];
   shift(): T | undefined;
   slice(start?: number, end?: number): T[];
   sort(compareFn?: (a: T, b: T) => number): this;
   splice(start: number, deleteCount?: number): T[];
   splice(start: number, deleteCount: number, ...items: T[]): T[];
   unshift(...items: T[]): number;
   indexOf(searchElement: T, fromIndex?: number): number;
   lastIndexOf(searchElement: T, fromIndex?: number): number;
   every<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): this is S[];
   every(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean;
   some(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean;
   forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void;
   map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];
   filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): S[];
   filter(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[];
   reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
   reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue: T): T;
   reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;
   reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
   reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue: T): T;
   reduceRight<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;
   [n: number]: T;
}
interface ConcatArray<T> {
   readonly length: number;
   join(separator?: string): string;
   slice(start?: number, end?: number): T[];
}
interface Boolean {}
interface Function {}
interface IArguments {}
interface Number {}
interface Object {}
interface String {
   toString(): string;
   charAt(pos: number): string;
   charCodeAt(index: number): number;
   concat(...strings: string[]): string;
   indexOf(searchString: string, position?: number): number;
   lastIndexOf(searchString: string, position?: number): number;
   localeCompare(that: string): number;
   match(regexp: string | RegExp): RegExpMatchArray | null;
   replace(searchValue: string | RegExp, replaceValue: string): string;
   replace(searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string;
   search(regexp: string | RegExp): number;
   slice(start?: number, end?: number): string;
   split(separator: string | RegExp, limit?: number): string[];
   substring(start: number, end?: number): string;
   toLowerCase(): string;
   toLocaleLowerCase(locales?: string | string[]): string;
   toUpperCase(): string;
   toLocaleUpperCase(locales?: string | string[]): string;
   trim(): string;
}
interface RegExp {}
interface RegExpMatchArray {
   groups?: {
       [key: string]: string;
   };
}