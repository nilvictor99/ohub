# ohub

OpenCode extension hub. Un CLI para instalar, actualizar, desactivar y eliminar servidores MCP y plugins de OpenCode sin editar la configuración a mano.

`ohub` trabaja sobre los archivos de configuración reales de OpenCode V2:

- global: `~/.config/opencode/opencode.json(c)` (respeta `XDG_CONFIG_HOME`)
- proyecto: `opencode.json(c)` o `.opencode/opencode.json(c)` desde el directorio actual hacia arriba

## Instalación

Requiere [Bun](https://bun.sh) para compilar y ejecutar las pruebas.

```sh
cd ohub
bun install
bun run build
install -m 755 dist/ohub ~/.local/bin/ohub
```

Durante el desarrollo:

```sh
bun run dev -- list
```

## Uso

```sh
ohub                       # menú interactivo en TTY
ohub list                  # MCP y plugins de todos los ámbitos
ohub list --json           # salida estable para scripts
ohub doctor                # diagnóstico de configuración
```

### Servidores MCP

```sh
# remoto
ohub mcp add context7 --url https://mcp.context7.com/mcp --scope global

# remoto con cabeceras y secreto por entorno
ohub mcp add github \
  --url https://api.githubcopilot.com/mcp/ \
  --header 'Authorization=Bearer {env:GITHUB_TOKEN}'

# local (el comando va después de --)
ohub mcp add everything --env LOG_LEVEL=info -- \
  npx -y @modelcontextprotocol/server-everything

ohub mcp list
ohub mcp show context7
ohub mcp disable context7
ohub mcp enable context7
ohub mcp remove context7 --yes
```

### Plugins

```sh
ohub plugin add opencode-acme-plugin@1.2.0
ohub plugin add @scope/plugin --options '{"strict":true}'
ohub plugin list
ohub plugin update opencode-acme-plugin
ohub plugin update --all
ohub plugin remove opencode-acme-plugin --yes
```

`plugin update` consulta `https://registry.npmjs.org` y reescribe el pin `paquete@version`. Las entradas sin versión se reportan como flotantes y no se tocan. Las rutas locales se omiten.

### Servicio

OpenCode puede no recargar la configuración en caliente. Después de un cambio:

```sh
ohub reload    # ejecuta: opencode service restart
```

## Ámbitos y precedencia

`--scope project` es el valor por defecto para escrituras. `--scope global` usa la configuración del usuario. `--scope all` existe solo para lectura y diagnóstico.

Una definición de proyecto reemplaza por completo a la global con el mismo nombre; `ohub list` marca la entrada global como `shadowed`.

`--config <ruta>` fuerza un archivo concreto.

## Seguridad de escritura

- Conserva comentarios y formato JSONC al editar.
- Valida el archivo después de cada cambio y nunca escribe una configuración inválida.
- Crea un lock por archivo para evitar escrituras concurrentes.
- Guarda un backup por cambio en `~/.local/state/ohub/backups` (últimos 20).
- Escritura atómica: archivo temporal + `rename`.
- Advierte cuando detecta secretos literales en `environment` o `headers`; recomienda `{env:VAR}`.
- `remove` pide confirmación; en scripts usa `--yes`.

## Diagnóstico

`ohub doctor` detecta, entre otras cosas:

- JSON inválido y formas incorrectas en `mcp.servers` o `plugins`
- uso del campo obsoleto `plugin` (V1) o convivencia con `plugins`
- entradas MCP en la forma V1 (fuera de `mcp.servers`)
- secretos literales
- plugins duplicados o rutas locales inexistentes
- permisos de archivo demasiado abiertos
- disponibilidad del binario `opencode`

Sale con código 1 si hay errores.

## Códigos de salida

| Código | Significado |
| --- | --- |
| 0 | Éxito |
| 1 | Fallo genérico o diagnóstico con errores |
| 2 | Uso incorrecto (flags, confirmación faltante) |
| 3 | Configuración inválida |
| 4 | Recurso no encontrado |
| 5 | Conflicto (duplicado, lock) |
| 6 | Error de red al consultar npm |
| 7 | Permisos |
| 130 | Interrumpido con Ctrl-C |

## Limitaciones

- OpenCode debe reiniciarse o reiniciar su servicio para aplicar cambios.
- `ohub` no instala dependencias de plugins: OpenCode las resuelve en su próximo arranque.
- No gestiona credenciales OAuth; usa `/mcps` u `opencode mcp auth` para el flujo interactivo.
- Las actualizaciones de plugins requieren red; no hay caché offline.

## Desarrollo

```sh
bun test          # pruebas de comportamiento contra el binario
bunx tsc --noEmit # tipos
bun run build     # binario en dist/ohub
```

## Licencia

MIT.
