# ohub

OpenCode extension hub. CLI portátil para instalar, actualizar, activar, desactivar y eliminar servidores MCP y plugins de OpenCode sin abrir la aplicación.

Edita directamente los archivos de configuración V2 de OpenCode (global y proyecto), conserva comentarios JSONC, valida antes de escribir, hace backup y usa lock por archivo.

```
ohub portable — sin instalación, sin daemon, solo archivos de configuración
```

## Inicio rápido

```sh
chmod +x start.sh
./start.sh
```

Menú interactivo en terminal. Sin TTY, imprime el estado actual.

Primera ejecución: `start.sh` compila `bin/ohub` si falta, crea `data/` y `data/logs/`, y marca `data/.bootstrap.done`. Todo queda dentro de la carpeta; no se instala nada en el sistema.

## Comandos directos

```sh
./start.sh list                      # MCP y plugins, todos los ámbitos
./start.sh doctor                    # diagnóstico de la configuración
./start.sh reload                    # reinicia el servicio de opencode
./start.sh config path               # rutas de los archivos de configuración
./start.sh mcp add name --url ...    # añade servidor MCP remoto
./start.sh mcp add name -- cmd ...   # añade servidor MCP local
./start.sh mcp list|show|remove|enable|disable
./start.sh plugin add pkg@ver        # añade plugin
./start.sh plugin list|remove|update [--all]
```

Flags: `--scope project|global|all`, `--config <ruta>`, `--yes`, `--dry-run`, `--json`.

## Menú interactivo

- Flechas `↑/↓` o `k/j`, `Enter` elige, `q/Esc` vuelve, `Ctrl+C` sale.
- Números `1-9` como atajo.
- Selección en cian negrita; pistas atenuadas.
- `OHUB_EMOJI=1` muestra iconos; por defecto están ocultos para alineación perfecta.
- `OHUB_ASCII=1` omite emojis y usa ASCII en el banner.

## Variables de entorno

| Variable | Efecto |
|---|---|
| `OHUB_STATE_HOME` | carpeta de estado aislada (backups, logs) |
| `OHUB_HOME` | carpeta de la app (usa `start.sh`) |
| `OHUB_ASCII=1` | sin Unicode |
| `OHUB_EMOJI=1` | muestra iconos del menú |
| `NO_COLOR=1` | sin color |

## Estructura del repositorio

```
ohub/
├── start.sh           # entry point portable y bootstrap
├── banner.config.json # título, subtítulo, tema del banner
├── package.json       # dependencias y scripts
├── tsconfig.json
├── src/               # código TypeScript
├── test/              # pruebas con bun:test
├── LICENSE
└── README.md
```

`bin/`, `data/`, `dist/`, `node_modules/`, `.logs/`, `.bootstrap.done` están en `.gitignore` y no se suben.

## Desarrollo

```sh
bun install
bun test
bunx tsc --noEmit
bun run build          # dist/ohub (no se sube al repo)
```

## Licencia

MIT.
