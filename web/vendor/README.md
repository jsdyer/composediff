# Bundled YAML parser

`yaml-2.9.1.mjs` is the browser ESM entry of the npm package **yaml 2.9.1**, bundled and minified with **esbuild 0.28.2**. It provides YAML parsing, safe bounded alias expansion and YAML serialization. The bundle contains no runtime CDN imports. License: ISC; see `YAML-LICENSE.txt`.

Upstream: https://github.com/eemeli/yaml

Package: https://registry.npmjs.org/yaml/-/yaml-2.9.1.tgz

Package archive SHA-256:

```
4ef6c54cf559b8a207b7b518378230805a1c84af239b14960e8c67c7d59de5d3
```

Bundled module SHA-256:

```
c63ef1b6ffb75c99c50206a440339617d53ead07f3d59e1f3bacdce30c5de392
```

To reproduce, extract that package archive to a temporary directory and run esbuild 0.28.2 on its `browser/index.js`:

```sh
esbuild /path/to/extracted/package/browser/index.js --bundle --format=esm --platform=browser --minify --outfile=web/vendor/yaml-2.9.1.mjs
```

Copy the package's `LICENSE` as `YAML-LICENSE.txt`. The application build copies this already bundled module; it does not download packages or require npm.
