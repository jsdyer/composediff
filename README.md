# Compose Diff

<!-- coolcode:guide -->
Compare before and after configurations, narrow the results by service or change type, and export a dated report. Values start hidden in results and exports; reveal them only after checking for secrets, and remember that comments and mapping order are not structural changes.
<!-- /coolcode:guide -->

[Open Compose Diff](https://coolcode.ca/composediff/) compares two Docker Compose YAML or JSON configurations locally. Review changed services, images, ports, environment variables, volumes and other settings, then export a dated JSON or CSV report. A second tab converts a supported `docker run` command into an editable Compose draft.

No API key, account, container engine or backend is required. The YAML parser is bundled with the site. Your pasted text and selected files stay in the browser and are not saved to browser storage. The shared CoolCode metrics script records ordinary site activity; this app never sends it input or file contents.

## Use the comparison

1. Paste or load the **Before** and **After** configurations. The example menu is optional; arbitrary configurations and service names work.
2. Select **Compare configurations**. Filter by service, area, change type or path.
3. Values are hidden in the result and downloaded reports initially. **Reveal values in results and exports** includes them; check for credentials before sharing. Names and structural paths remain visible even when values are hidden.
4. Export JSON or CSV. Changing either input invalidates the export until you compare again. An invalid input leaves the previous result visible and identified as previous.

Mapping order and comments do not count as changes. YAML 1.2 scalar rules and local merge anchors are supported. The default option matches `environment` and `labels` list/map forms by key. Uncheck it for their exact parsed structure. Bare environment names inherit a value and therefore differ from an explicit empty string.

Lists are compared by position. Port and volume short/long syntax, image aliases and implicit Docker defaults are not normalized. A newly added or removed mapping is one change containing that mapping, rather than one change per child.

This is a structural review, not the Compose CLI or a complete Compose schema validator. It does not expand variables, load `.env`, `env_file`, `include` or `extends` files, inspect a host, pull images or run containers. Custom Compose YAML tags such as `!reset` and `!override`, multiple YAML documents and recursive aliases are rejected. To compare fully resolved configurations, generate `docker compose config` output yourself for each version, review it for secrets, and compare those outputs. The app itself never runs that command.

## Convert a Docker command

The converter parses one literal POSIX-like `docker run` or `docker container run` command. Quotes, escaped characters, line continuations and command argument boundaries are preserved. It never evaluates a shell or executes a command.

Supported options include name, hostname, image, ports, environment, environment files, labels, volumes, working directory, user, restart policy, platform, entrypoint, DNS, extra hosts, exposed ports, capability changes, security options, interactive/TTY, read-only, init and privileged mode. Run-only `--detach` and `--rm` choices are omitted with a warning. Named volume mounts explicitly refer to the existing Docker volume as external; create that volume first if it does not exist.

Unknown flags, shell substitutions, unresolved shell variables, shell operators, custom named networks and Windows drive mounts stop conversion with an explanation. No partial draft is offered. Review generated YAML and validate it with the Compose CLI before use. The converter does not replace full Docker command parsing.

## Extend the app

Edit [`web/config.json`](web/config.json). Add any number of named examples to `examples`; each has `name`, `before` and `after` strings. Change `commandExample` for your own starting command. Examples do not restrict what users can enter.

Limits are configurable in the same file: character count, expanded node count, nesting depth, alias expansion, number of changes and worker timeout. Defaults allow 500,000 characters per input, 30,000 expanded nodes, depth 60, 50 alias expansion count, 5,000 changes and 10 seconds of worker processing. The model enforces upper bounds so configuration cannot disable those protections accidentally.

App logic is in `web/model.mjs`, UI interaction in `web/app.mjs`, and bounded parsing/conversion in `web/worker.mjs`. All app imports and assets use relative URLs, including the parser. No runtime CDN is required.

## Build and checks

Use Node 24+ and Python 3.12+:

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

`dist/` contains only the public files from `web/`, with escaped metadata from `tool.json`. It is generated output, not committed. CI runs the model/build checks and Chromium checks covering real YAML worker comparison, export redaction, filters, stale results, conversion, downloads and mobile overflow at `/composediff/`.

The **Compose Diff · Check and publish** workflow publishes successful `main` builds using GitHub Pages. Repository Pages source should be **GitHub Actions**. Do not add a project CNAME: the account site supplies `coolcode.ca`. The catalogue record is `tool.json`; the hub's `data/tools.json` must be updated separately after deployment.

## Sources

- [Docker Compose file reference](https://docs.docker.com/reference/compose-file/)
- [Compose interpolation](https://docs.docker.com/reference/compose-file/interpolation/)
- [Docker container run](https://docs.docker.com/reference/cli/docker/container/run/)
- [Docker Compose config](https://docs.docker.com/reference/cli/docker/compose/config/)
- [YAML parser documentation](https://eemeli.org/yaml/) — `yaml` 2.9.1, ISC license; provenance and license are in `web/vendor/`.
