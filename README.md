# ohub

OpenCode extension hub. Un CLI portable para instalar, actualizar, desactivar y eliminar servidores MCP y plugins de OpenCode sin editar la configuración a mano.

La aplicación vive completa dentro de esta carpeta. No se instala en el sistema: `bin/ohub` se ejecuta desde aquí y su estado (backups, logs, marcador de arranque) queda en `data/`.

`ohub` trabaja sobre los archivos de configuración reales de OpenCode V2:

- global: `~/.config/opencode/opencode.json(c)` (respeta `XDG_CONFIG_HOME`)
- proyecto: `opencode.json(c)` o `.opencode/opencode.json(c)` desde el directorio actual hacia arriba

## Inicio rápido

```sh
chmod +x start.sh
./start.sh
```

En una terminal interactiva muestra el banner y el menú. Sin TTY lista el estado actual.

Primera ejecución: `start.sh` verifica el entorno, crea `bin/`, `data/` y `data/logs/`, compila `bin/ohub` si falta o si el código cambió, y guarda el marcador `data/.bootstrap.done`.

Requisitos: Bash. Para compilar o recompilar, [Bun](https://bun.sh). Si copias la carpeta con `bin/ohub` ya compilado, no necesitas Bun para ejecutarla.

## start.sh

```sh
./start.sh                      # menú interactivo (o list sin TTY)
./start.sh list                 # comando directo
./start.sh mcp add context7 --url https://mcp.context7.com/mcp --scope global
./start.sh --menu               # fuerza el menú
./start.sh --auto               # no interactivo: list --json
./start.sh --apply              # reinicia el servicio de opencode
./start.sh --reset              # borra el binario y rehace el bootstrap
./start.sh --verbose            # muestra la salida del bootstrap
./start.sh --version
./start.sh --help
```

El bootstrap muestra cinco etapas con un único indicador, guarda la salida interna en `data/logs/bootstrap.log` y no ensucia la terminal.

## Menú

- Gestionar servidores MCP: listar, añadir remoto, añadir local, activar/desactivar, ver detalle, eliminar.
- Gestionar plugins: listar, añadir, actualizar uno, actualizar todos, eliminar.
- Diagnóstico, rutas de configuración, reinicio del servicio y ayuda.

Navegación: flechas o `k`/`j`, `Enter` para elegir, `1`-`9` como atajo, `q` o `Esc` para volver, `Ctrl+C` para interrumpir. La selección se marca solo con color (cian en negrita); el resto de opciones va en color normal y las pistas atenuadas. El layout es de columnas fijas: icono (2 celdas), etiqueta y pista, todas alineadas al mismo ancho. Las etiquetas se miden en celdas de terminal (el emoji cuenta 2), así que las pistas empiezan siempre en la misma columna; van atenuadas y sin glifos decorativos.

Toda acción destructiva pide confirmación. Los flags directos siguen disponibles para scripts. El menú no depende de dependencias nuevas: raw mode + keypress de Node/Bun.

## Estructura

```text
ohub/
├── start.sh              arranque portable
├── banner.config.json    título, subtítulo, estilo y tema
├── bin/ohub              binario compilado (generado)
├── src/                  código TypeScript
├── test/                 pruebas
├── data/                 estado local aislado (generado, fuera de git)
│   ├── .bootstrap.done
│   ├── logs/bootstrap.log
│   └── state/backups/
├── package.json
└── README.md
```

`data/` y `bin/` están excluidos del repositorio. La carpeta entregada sí puede incluirlos para ser portable sin Bun.

## Uso no interactivo

```sh
./start.sh list
./start.sh list --json
./start.sh doctor
./start.sh doctor --scope all
```

### Servidores MCP

```sh
# remoto
./start.sh mcp add context7 --url https://mcp.context7.com/mcp --scope global

# remoto con cabeceras y secreto por entorno
./start.sh mcp add github \
  --url https://api.githubcopilot.com/mcp/ \
  --header 'Authorization=Bearer {env:GITHUB_TOKEN}'

# local (el comando va después de --)
./start.sh mcp add everything --env LOG_LEVEL=info -- \
  npx -y @modelcontextprotocol/server-everything

./start.sh mcp list
./start.sh mcp show context7
./start.sh mcp disable context7
./start.sh mcp enable context7
./start.sh mcp remove context7 --yes
```

### Plugins

```sh
./start.sh plugin add opencode-acme-plugin@1.2.0
./start.sh plugin add @scope/plugin --options '{"strict":true}'
./start.sh plugin list
./start.sh plugin update opencode-acme-plugin
./start.sh plugin update --all
./start.sh plugin remove opencode-acme-plugin --yes
```

`plugin update` consulta `https://registry.npmjs.org` y reescribe el pin `paquete@version`. Las entradas sin versión se reportan como flotantes y no se tocan. Las rutas locales se omiten.

### Servicio

OpenCode puede no recargar la configuración en caliente. Después de un cambio:

```sh
./start.sh reload    # ejecuta: opencode service restart
```

## Ámbitos y precedencia

`--scope project` es el valor por defecto para escrituras. `--scope global` usa la configuración del usuario. `--scope all` existe solo para lectura y diagnóstico.

Una definición de proyecto reemplaza por completo a la global con el mismo nombre; `ohub list` marca la entrada global como `shadowed`.

`--config <ruta>` fuerza un archivo concreto.

## Seguridad de escritura

- Conserva comentarios y formato JSONC al editar.
- Valida el archivo después de cada cambio y nunca escribe una configuración inválida.
- Crea un lock por archivo para evitar escrituras concurrentes.
- Guarda un backup por cambio en `data/state/backups` (últimos 20).
- Escritura atómica: archivo temporal + `rename`.
- Advierte cuando detecta secretos literales en `environment` o `headers`; recomienda `{env:VAR}`.
- `remove` pide confirmación; en scripts usa `--yes`.

## Diagnóstico

`./start.sh doctor` detecta, entre otras cosas:

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

## Banner

`banner.config.json` controla el encabezado:

```json
{
  "type": "box-drawing",
  "title": "ohub",
  "subtitle": "OpenCode extension hub",
  "icon": "◈",
  "theme": "tech"
}
```

Con `OHUB_ASCII=1` el menú omite los emojis y el banner usa ASCII plano, para terminales donde los iconos descuadran las columnas.

Estilos: `box-drawing`, `simple-lines`, `header`. Temas: `default`, `tech`, `fire`, `ocean`, `forest`, `neon`, `minimal`. Sin Unicode (`OHUB_ASCII=1`) cae a ASCII. Sin TTY o con `NO_COLOR` no usa color.

## Limitaciones

- OpenCode debe reiniciarse o reiniciar su servicio para aplicar cambios.
- `ohub` no instala dependencias de plugins: OpenCode las resuelve en su próximo arranque.
- No gestiona credenciales OAuth; usa `/mcps` u `opencode mcp auth` para el flujo interactivo.
- Las actualizaciones de plugins requieren red; no hay caché offline.

## Desarrollo

```sh
bun install
bun test
bunx tsc --noEmit
bun run build      # dist/ohub
```

## Licencia

MIT.
