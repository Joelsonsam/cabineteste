const g = (typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : window) as typeof globalThis & Record<string, unknown>;

if (typeof (g as { globalThis?: unknown }).globalThis === 'undefined') (g as Record<string, unknown>).globalThis = g;

if (typeof g.queueMicrotask !== 'function') {
  g.queueMicrotask = (cb: VoidFunction) => {
    Promise.resolve().then(cb).catch((e) => setTimeout(() => { throw e; }));
  };
}

if (typeof g.structuredClone !== 'function') {
  g.structuredClone = (<T>(v: T): T => {
    if (v instanceof Date) return new Date(v.getTime()) as T;
    if (v === null || typeof v !== 'object' || v instanceof Blob) return v;
    return JSON.parse(JSON.stringify(v));
  }) as typeof structuredClone;
}

if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function (this: string, search: string | RegExp, replacement: string | ((s: string, ...a: unknown[]) => string)) {
    if (search instanceof RegExp) {
      const flags = search.flags.includes('g') ? search.flags : search.flags + 'g';
      return this.replace(new RegExp(search.source, flags), replacement as string);
    }
    return this.split(search).join(replacement as string);
  } as typeof String.prototype.replaceAll;
}

if (!Array.prototype.flatMap) {
  Array.prototype.flatMap = function <T, U>(this: T[], fn: (v: T, i: number, a: T[]) => U | U[]) {
    return this.reduce<U[]>((acc, v, i, a) => acc.concat(fn(v, i, a)), []);
  } as typeof Array.prototype.flatMap;
}

export {};
