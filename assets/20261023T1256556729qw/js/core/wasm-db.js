// A database for the static site (GitHub Pages): the official SQLite WebAssembly build
// (@sqlite.org/sqlite-wasm, with FTS5 and JSON1) behind the small slice of the node:sqlite API
// that the query code uses — db.prepare(sql).all(...args) / .get(...args), rows as plain
// objects. Runs in the browser and in Node (scripts/check-static.mjs).
//
// The site ships a slim copy of the database (PLAN B2.0): no indexes and no full-text tables,
// which halves the download. prepareStaticDb() rebuilds the indexes right after opening it, and
// the full-text tables the first time a search needs them, from the statements export-site
// recorded in build.json — so every query runs on the same schema as the server's.

// openWasmDb(sqlite3, bytes): sqlite3 is the initialised module, bytes the .db file. The copy lives
// in memory and may be written to (indexes are added after loading); nothing is saved.
export function openWasmDb(sqlite3, bytes, { readonly = false } = {}) {
  const { capi, wasm, oo1 } = sqlite3;
  const db = new oo1.DB();
  const p = wasm.allocFromTypedArray(bytes);
  const rc = capi.sqlite3_deserialize(db.pointer, 'main', p, bytes.byteLength, bytes.byteLength,
    capi.SQLITE_DESERIALIZE_FREEONCLOSE | (readonly ? capi.SQLITE_DESERIALIZE_READONLY : capi.SQLITE_DESERIALIZE_RESIZEABLE));
  db.checkRc(rc);
  return wrap(db, capi);
}

// build: data/build.json ({ indexes: [sql…], fts: [{ name, create, rebuild }] }).
// Returns the database plus ensureFts(), which builds the full-text tables once.
export function prepareStaticDb(sqlite3, bytes, build) {
  const db = openWasmDb(sqlite3, bytes);
  db.exec('BEGIN');
  for (const sql of build.indexes ?? []) db.exec(sql);
  db.exec('COMMIT');
  let ftsReady = !(build.fts ?? []).length;
  db.ensureFts = () => {
    if (ftsReady) return;
    db.exec('BEGIN');
    for (const t of build.fts) { db.exec(t.create); db.exec(t.rebuild); }
    db.exec('COMMIT');
    ftsReady = true;
  };
  return db;
}

function wrap(db, capi) {
  const statements = new Map(); // sql -> { s: oo1.Stmt, names }, reused like node:sqlite callers expect
  const stmt = (sql) => {
    let e = statements.get(sql);
    if (!e) { const s = db.prepare(sql); statements.set(sql, (e = { s, names: s.getColumnNames() })); }
    return e;
  };
  // Columns are read through the C API (2–3× faster than Stmt.get({}) on thousands of rows).
  // Integers come back as plain numbers, as node:sqlite returns them (exact up to 2^53).
  const { SQLITE_INTEGER, SQLITE_FLOAT, SQLITE_TEXT, SQLITE_NULL } = capi;
  const rows = (sql, args, first) => {
    const { s, names } = stmt(sql);
    const ptr = s.pointer, n = names.length;
    try {
      if (args.length) s.bind(args);
      const out = [];
      while (s.step()) {
        const o = {};
        for (let i = 0; i < n; i++) {
          const t = capi.sqlite3_column_type(ptr, i);
          o[names[i]] = t === SQLITE_TEXT ? capi.sqlite3_column_text(ptr, i)
            : t === SQLITE_INTEGER || t === SQLITE_FLOAT ? capi.sqlite3_column_double(ptr, i)
            : t === SQLITE_NULL ? null : s.get(i);
        }
        out.push(o);
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
    exec(sql) { db.exec(sql); },
    close() {
      for (const e of statements.values()) e.s.finalize();
      statements.clear();
      db.close();
    },
  };
}
