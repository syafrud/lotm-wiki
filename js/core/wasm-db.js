// A read-only database for the static site (GitHub Pages): the official SQLite WebAssembly
// build (@sqlite.org/sqlite-wasm, with FTS5 and JSON1) behind the small slice of the
// node:sqlite API that the query code uses — db.prepare(sql).all(...args) / .get(...args),
// rows as plain objects. Runs in the browser and in Node (scripts/check-static.mjs).

// openWasmDb(sqlite3, bytes): sqlite3 is the initialised module, bytes the .db file.
export function openWasmDb(sqlite3, bytes) {
  const { capi, wasm, oo1 } = sqlite3;
  const db = new oo1.DB();
  const p = wasm.allocFromTypedArray(bytes);
  const rc = capi.sqlite3_deserialize(db.pointer, 'main', p, bytes.byteLength, bytes.byteLength,
    capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_READONLY);
  db.checkRc(rc);
  return wrap(db);
}

function wrap(db) {
  const statements = new Map(); // sql -> oo1.Stmt, reused like node:sqlite callers expect
  const stmt = (sql) => {
    let s = statements.get(sql);
    if (!s) statements.set(sql, (s = db.prepare(sql)));
    return s;
  };
  const rows = (sql, args, first) => {
    const s = stmt(sql);
    try {
      if (args.length) s.bind(args);
      const out = [];
      while (s.step()) {
        out.push(s.get({}));
        if (first) break;
      }
      return out;
    } finally {
      s.reset(true);
    }
  };
  return {
    prepare(sql) {
      return {
        all: (...args) => rows(sql, args, false),
        get: (...args) => rows(sql, args, true)[0],
      };
    },
    close() {
      for (const s of statements.values()) s.finalize();
      statements.clear();
      db.close();
    },
  };
}
