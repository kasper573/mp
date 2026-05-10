import {
  bench,
  boxplot,
  compact,
  do_not_optimize,
  group,
  run,
  summary,
} from "mitata";
import {
  array,
  bitflags,
  bool,
  bytes,
  enumOf,
  f32,
  f64,
  i32,
  object,
  optional,
  Reader,
  string,
  transform,
  tuple,
  u32,
  u64,
  u8,
  union,
  Writer,
} from "../src/index";

const u32Ty = u32();
const f32Ty = f32();
const stringTy = string();
const boolTy = bool();

const posTy = object({ x: f32(), y: f32(), z: f32() });
const entityTy = object({
  pos: object({ x: f32(), y: f32(), z: f32() }),
  velocity: object({ dx: f32(), dy: f32() }),
  name: string(),
  exists: bool(),
  hp: i32(),
});
const arr100Ty = array(posTy);
const tupleTy = tuple(u8(), string(), f32());
const optionalTy = optional(string());
const colorTy = enumOf("red", "green", "blue", "yellow");
const flags8Ty = bitflags("a", "b", "c", "d");
const flag33Names: readonly string[] = Array.from(
  { length: 33 },
  (_, i) => `f${i}`,
);
const flags33Ty = bitflags(...flag33Names);
const unionTy = union({
  move: object({ dx: i32(), dy: i32() }),
  jump: object({ h: u32() }),
});
const transformTy = transform(
  u32(),
  (n) => `id:${n}`,
  (s) => Number(s.slice(3)),
);

const posValue = { x: 1.5, y: 2.5, z: 3.5 };
const entityValue = {
  pos: posValue,
  velocity: { dx: 0.1, dy: 0.2 },
  name: "player_001",
  exists: true,
  hp: 100,
};
const arr100Value = Array.from({ length: 100 }, (_, i) => ({
  x: i,
  y: i * 2,
  z: i * 3,
}));
const tupleValue: [number, string, number] = [7, "hi", 1.25];
const flags33Value: Record<string, boolean> = (() => {
  const v: Record<string, boolean> = {};
  for (const f of flag33Names) {
    v[f] = Number(f.slice(1)) % 2 === 0;
  }
  return v;
})();

function encoded<T>(
  ty: { encode: (w: Writer, v: T) => void },
  v: T,
  cap = 256,
): Uint8Array {
  const w = new Writer(cap);
  ty.encode(w, v);
  return w.finish();
}

const encodedPos = encoded(posTy, posValue, 32);
const encodedEntity = encoded(entityTy, entityValue, 128);
const encodedArr100 = encoded(arr100Ty, arr100Value, 2048);
const encodedTuple = encoded(tupleTy, tupleValue, 32);
const encodedOptionalPresent = encoded(optionalTy, "hello", 32);
const encodedOptionalAbsent = encoded(optionalTy, undefined, 8);
const encodedUnion = encoded(unionTy, { tag: "jump", value: { h: 5 } }, 32);
const encodedColor = encoded(colorTy, "green", 16);
const encodedFlags8 = encoded(
  flags8Ty,
  { a: true, b: false, c: true, d: false },
  8,
);
const encodedFlags33 = encoded(flags33Ty, flags33Value, 16);
const encodedTransform = encoded(transformTy, "id:42", 16);

boxplot(() => {
  summary(() => {
    group("writer: primitives x1000", () => {
      bench("writeU8", () => {
        const w = new Writer(1024);
        for (let i = 0; i < 1000; i++) {
          w.writeU8(i & 0xff);
        }
        do_not_optimize(w.finish());
      });
      bench("writeU32", () => {
        const w = new Writer(4096);
        for (let i = 0; i < 1000; i++) {
          w.writeU32(i);
        }
        do_not_optimize(w.finish());
      });
      bench("writeU64", () => {
        const w = new Writer(8192);
        for (let i = 0; i < 1000; i++) {
          w.writeU64(BigInt(i));
        }
        do_not_optimize(w.finish());
      });
      bench("writeF32", () => {
        const w = new Writer(4096);
        for (let i = 0; i < 1000; i++) {
          w.writeF32(i * 0.5);
        }
        do_not_optimize(w.finish());
      });
      bench("writeF64", () => {
        const w = new Writer(8192);
        for (let i = 0; i < 1000; i++) {
          w.writeF64(i * 0.5);
        }
        do_not_optimize(w.finish());
      });
      bench("writeBool", () => {
        const w = new Writer(1024);
        for (let i = 0; i < 1000; i++) {
          w.writeBool((i & 1) === 0);
        }
        do_not_optimize(w.finish());
      });
      bench("writeString", () => {
        const w = new Writer(32768);
        for (let i = 0; i < 1000; i++) {
          w.writeString("player_001");
        }
        do_not_optimize(w.finish());
      });
      bench("writeVarU32", () => {
        const w = new Writer(8192);
        for (let i = 0; i < 1000; i++) {
          w.writeVarU32(i * 1009);
        }
        do_not_optimize(w.finish());
      });
    });
  });
});

boxplot(() => {
  summary(() => {
    group("reader: primitives x1000", () => {
      const bufU32 = (() => {
        const w = new Writer(4096);
        for (let i = 0; i < 1000; i++) {
          w.writeU32(i);
        }
        return w.finish();
      })();
      const bufU64 = (() => {
        const w = new Writer(8192);
        for (let i = 0; i < 1000; i++) {
          w.writeU64(BigInt(i));
        }
        return w.finish();
      })();
      const bufF64 = (() => {
        const w = new Writer(8192);
        for (let i = 0; i < 1000; i++) {
          w.writeF64(i * 0.5);
        }
        return w.finish();
      })();
      const bufString = (() => {
        const w = new Writer(32768);
        for (let i = 0; i < 1000; i++) {
          w.writeString("player_001");
        }
        return w.finish();
      })();
      bench("readU32", () => {
        const r = new Reader(bufU32);
        for (let i = 0; i < 1000; i++) {
          do_not_optimize(r.readU32());
        }
      });
      bench("readU64", () => {
        const r = new Reader(bufU64);
        for (let i = 0; i < 1000; i++) {
          do_not_optimize(r.readU64());
        }
      });
      bench("readF64", () => {
        const r = new Reader(bufF64);
        for (let i = 0; i < 1000; i++) {
          do_not_optimize(r.readF64());
        }
      });
      bench("readString", () => {
        const r = new Reader(bufString);
        for (let i = 0; i < 1000; i++) {
          do_not_optimize(r.readString());
        }
      });
      const bufVarU32 = (() => {
        const w = new Writer(8192);
        for (let i = 0; i < 1000; i++) {
          w.writeVarU32(i * 1009);
        }
        return w.finish();
      })();
      bench("readVarU32", () => {
        const r = new Reader(bufVarU32);
        for (let i = 0; i < 1000; i++) {
          do_not_optimize(r.readVarU32());
        }
      });
    });
  });
});

boxplot(() => {
  summary(() => {
    group("primitive types: encode/decode", () => {
      bench("u32 encode", () => {
        const w = new Writer(8);
        u32Ty.encode(w, 0xdeadbeef);
        do_not_optimize(w.finish());
      });
      bench("f32 encode", () => {
        const w = new Writer(8);
        f32Ty.encode(w, 1.5);
        do_not_optimize(w.finish());
      });
      bench("string encode", () => {
        const w = new Writer(32);
        stringTy.encode(w, "player_001");
        do_not_optimize(w.finish());
      });
      bench("bool encode", () => {
        const w = new Writer(4);
        boolTy.encode(w, true);
        do_not_optimize(w.finish());
      });
      bench("enumOf encode", () => {
        const w = new Writer(8);
        colorTy.encode(w, "green");
        do_not_optimize(w.finish());
      });
      bench("bitflags<=8 encode", () => {
        const w = new Writer(4);
        flags8Ty.encode(w, { a: true, b: false, c: true, d: false });
        do_not_optimize(w.finish());
      });
      bench("bitflags<=64 encode", () => {
        const w = new Writer(16);
        flags33Ty.encode(w, flags33Value);
        do_not_optimize(w.finish());
      });
      bench("enumOf decode", () => {
        do_not_optimize(colorTy.decode(new Reader(encodedColor)));
      });
      bench("bitflags<=8 decode", () => {
        do_not_optimize(flags8Ty.decode(new Reader(encodedFlags8)));
      });
      bench("bitflags<=64 decode", () => {
        do_not_optimize(flags33Ty.decode(new Reader(encodedFlags33)));
      });
    });
  });
});

boxplot(() => {
  summary(() => {
    group("composites: encode/decode", () => {
      bench("encode pos", () => {
        const w = new Writer(32);
        posTy.encode(w, posValue);
        do_not_optimize(w.finish());
      });
      bench("decode pos", () => {
        do_not_optimize(posTy.decode(new Reader(encodedPos)));
      });
      bench("encode entity", () => {
        const w = new Writer(128);
        entityTy.encode(w, entityValue);
        do_not_optimize(w.finish());
      });
      bench("decode entity", () => {
        do_not_optimize(entityTy.decode(new Reader(encodedEntity)));
      });
      bench("encode array<pos>(100)", () => {
        const w = new Writer(2048);
        arr100Ty.encode(w, arr100Value);
        do_not_optimize(w.finish());
      });
      bench("decode array<pos>(100)", () => {
        do_not_optimize(arr100Ty.decode(new Reader(encodedArr100)));
      });
      bench("encode tuple", () => {
        const w = new Writer(32);
        tupleTy.encode(w, tupleValue);
        do_not_optimize(w.finish());
      });
      bench("decode tuple", () => {
        do_not_optimize(tupleTy.decode(new Reader(encodedTuple)));
      });
      bench("encode optional present", () => {
        const w = new Writer(32);
        optionalTy.encode(w, "hello");
        do_not_optimize(w.finish());
      });
      bench("decode optional present", () => {
        do_not_optimize(optionalTy.decode(new Reader(encodedOptionalPresent)));
      });
      bench("decode optional absent", () => {
        do_not_optimize(optionalTy.decode(new Reader(encodedOptionalAbsent)));
      });
      bench("encode union", () => {
        const w = new Writer(32);
        unionTy.encode(w, { tag: "jump", value: { h: 5 } });
        do_not_optimize(w.finish());
      });
      bench("decode union", () => {
        do_not_optimize(unionTy.decode(new Reader(encodedUnion)));
      });
      bench("encode transform", () => {
        const w = new Writer(16);
        transformTy.encode(w, "id:42");
        do_not_optimize(w.finish());
      });
      bench("decode transform", () => {
        do_not_optimize(transformTy.decode(new Reader(encodedTransform)));
      });
    });
  });
});

boxplot(() => {
  summary(() => {
    group("type meta", () => {
      bench("pos.inspect()", () => {
        do_not_optimize(posTy.inspect());
      });
      bench("entity.inspect()", () => {
        do_not_optimize(entityTy.inspect());
      });
      bench("entity.default()", () => {
        do_not_optimize(entityTy.default());
      });
      bench("arr100.default()", () => {
        do_not_optimize(arr100Ty.default());
      });
    });
  });
});

boxplot(() => {
  summary(() => {
    group("bytes + u64", () => {
      const data = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        data[i] = i;
      }
      const bytesTy = bytes();
      const u64Ty = u64();
      const encodedBytes = encoded(bytesTy, data, 512);
      const encodedU64 = (() => {
        const w = new Writer(16);
        u64Ty.encode(w, 0xffffffffffffffffn);
        return w.finish();
      })();
      const f64Ty = f64();
      bench("bytes encode (256B)", () => {
        const w = new Writer(512);
        bytesTy.encode(w, data);
        do_not_optimize(w.finish());
      });
      bench("bytes decode (256B)", () => {
        do_not_optimize(bytesTy.decode(new Reader(encodedBytes)));
      });
      bench("u64 encode/decode roundtrip", () => {
        const w = new Writer(16);
        u64Ty.encode(w, 0xffffffffffffffffn);
        do_not_optimize(u64Ty.decode(new Reader(w.finish())));
      });
      bench("u64 decode", () => {
        do_not_optimize(u64Ty.decode(new Reader(encodedU64)));
      });
      bench("f64 type encode", () => {
        const w = new Writer(16);
        f64Ty.encode(w, Math.PI);
        do_not_optimize(w.finish());
      });
    });
  });
});

compact(async () => {
  await run();
});
