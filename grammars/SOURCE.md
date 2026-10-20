Prebuilt grammars, each MIT licensed by its tree-sitter-* project. They load under
`web-tree-sitter@0.25.10`; newer runtimes reject this ABI, so upgrade them together.

- bash: `@vscode/tree-sitter-wasm@0.3.1` (MIT). The `tree-sitter-wasms` build crashes its scanner on
  `[ "$a" != "1" ]`.
- the rest: `tree-sitter-wasms@0.1.13` (Unlicense packaging).

| file | sha256 |
|---|---|
| tree-sitter-bash.wasm | a14e9ed880b2c3f16cd00c796c38d237a3e9b028bdec5b4315c76976e67b01ca |
| tree-sitter-c_sharp.wasm | 6266a7e32d68a3459104d994dc848df15d5672b0ea8e86d327274b694f8e6991 |
| tree-sitter-dart.wasm | 7f5364e4256cf7e55efd01dd52421ef2663caa8061b82659b7e4bf61064545ec |
| tree-sitter-tsx.wasm | 6aa3b2c70e76f5d48eafef1093e9c4de383e13f2fdde2f4e9b98a378f6a8f1b6 |
| tree-sitter-typescript.wasm | 8515404dceed38e1ed86aa34b09fcf3379fff1b4ff9dd3967bcd6d1eb5ac3d8f |
