# Beach Scout 🏐

Scouting en video para voleibol de playa (2 vs 2), inspirado en Volley Station y con las
evaluaciones de Data Volley (`# + ! - / =`).

## Cómo abrirla

- **En la web:** abre la dirección publicada (GitHub Pages / Vercel) en Chrome o Safari.
- **Sin internet:** doble clic en `index.html`.

Es una página estática (HTML + JS, sin servidor ni dependencias). El video **no se sube a ningún lado**:
aunque uses la versión web, se reproduce desde tu computadora.

> **Tus datos viven en el navegador donde los registras.** La versión web, la local y cada
> computadora tienen su propio almacenamiento. Para pasar partidos de uno a otro usa
> **Exportar → Partido (.json)** e **Importar**. Borrar los datos del sitio en el navegador los elimina.

## Flujo

1. **+ Partido**: torneo, fecha, equipos y jugadores.
2. Arrastra el video del partido al reproductor.
3. **Registrar**: escribe códigos mientras corre el video (el tiempo se toma al teclear el primer carácter) o usa los botones Jugador → Fundamento → (Tipo) → Evaluación.
4. **Clips**: filtra por jugador / fundamento / evaluación / tipo / set y dale a *Reproducir clips*.
   Ej.: Juan + Recepción + `=` → todas las recepciones doble negativas de Juan, una tras otra.
5. **Reporte**: tabla por equipo y por jugador con `# + ! - / =`, Pos%, #%, Err%, Eficiencia,
   side-out y break point. **Clic en cualquier número abre esos clips.** Imprimible a PDF.

## Registro por teclado (teclas configurables)

Sin tocar el mouse: **jugador → fundamento → (tipo) → evaluación**. El tiempo se toma al pulsar el jugador.

| Etapa | Teclas por defecto |
|---|---|
| Jugador | `1` `2` local · `3` `4` visita · `Z`/`X` punto manual · `C` capturar · `Enter` caja de código |
| Fundamento | `S` `R` `E` `A` `B` `D` `F` |
| Tipo | saque `Q` `M` `H` · ataque `H` `C` `P` `G` `L` `O` · armado `M` `B` · bloqueo `B` `F` |
| Evaluación | `1` # · `2` + · `3` ! · `4` − · `5` / · `6` = (los símbolos `# + ! - / =` también sirven) |
| Video (siempre) | `Espacio` · `←` `→` ±2 s · `⇧←` `⇧→` ±5 s · `,` `.` frame · `[` `]` velocidad |

Ej.: `3` `R` `1` = recepción doble positiva de visita 1. `Esc` cancela, `⌫` retrocede un paso.

**⌨️ Teclas** (barra superior) abre el editor: clic en una tecla y presiona la nueva. Una tecla sólo
tiene que ser única dentro de su etapa; si repites una, se marca en rojo. Puedes **exportar** tu
configuración y pasarla a otro analista, o **restaurar** las teclas por defecto.

## Correcciones visuales

- **📷 Capturar** (o tecla `C`) congela el fotograma actual y abre la pizarra. La captura se vincula sola
  a la acción más cercana (±3 s) y a su jugador.
- Herramientas: flecha, trayectoria curva con flecha, línea (sólida o punteada), círculo, rectángulo,
  **foco** (oscurece todo menos la zona clave), lápiz, texto con fondo e íconos (✅ ❌ ⚠️ 👀 👣 ✋ 🎯…).
  Con **Mover** arrastras cualquier figura; Supr la borra y Cmd/Ctrl+Z deshace.
- Cada captura lleva título y comentario de corrección. Los dibujos se pueden editar después.
- Pestaña **Correcciones**: galería por jugador, *Ver en video* (reproduce ese momento),
  descarga en PNG (para mandar por WhatsApp) e **Imprimir / PDF** filtrado por jugador.
- 💬 en cada acción agrega una nota del entrenador que aparece al reproducir los clips.

## Códigos

`[equipo][jugador][fundamento][tipo][evaluación]` — `*` local, `a` visita (3 y 4 = visita 1 y 2).

| Código   | Significado                               |
|----------|-------------------------------------------|
| `*1R#`   | Local 1, recepción doble positiva         |
| `a2AC+`  | Visita 2, ataque de corte positivo        |
| `3SQ=`   | Visita 1, saque en salto, error           |
| `*P`     | Punto manual para el local                |

Fundamentos: `S` saque, `R` recepción, `E` armado, `A` ataque, `B` bloqueo, `D` defensa, `F` free ball.
Tipos de saque: `Q` salto potente, `M` salto flotado, `H` flotado. Tipos de ataque: `H` potente,
`C` corte, `P` pokey, `G` globo, `L` línea, `O` segundo toque. Tabla completa: botón **?** en la app.

## Datos

Se guardan en el navegador (acciones en localStorage, capturas en IndexedDB). Usa **Exportar → .json** (incluye las capturas) como respaldo o para pasar
partidos a otra computadora, y **.csv** para Excel. *Exportar video (ffmpeg)* genera un script que
corta y une los clips filtrados en un solo MP4 (requiere `brew install ffmpeg`).

## Estructura

- `index.html` — interfaz
- `js/model.js` — códigos, marcador, rallies, estadísticas
- `js/keymap.js` — teclas por defecto, conflictos y formato
- `js/app.js` — video, registro, clips, reporte, correcciones
- `js/annotate.js` — pizarra de dibujo sobre el fotograma
- `js/db.js` — almacenamiento de capturas
- `css/styles.css`
- `icon.svg` — ícono

## Publicar

Cualquier hosting estático sirve; no hay paso de compilación.

- **GitHub Pages:** *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
- **Vercel / Netlify:** importar el repositorio, sin comando de build, carpeta de salida `/`.

Al cambiar archivos JS/CSS, sube el número `?v=` en `index.html` para que los navegadores no usen la versión en caché.
