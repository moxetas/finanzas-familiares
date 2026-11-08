# Finanzas familiares

App web instalable (PWA) para llevar las cuentas de casa mes a mes: qué entra, qué sale y a dónde va cada euro.

Cualquiera abre el enlace, la instala en la pantalla de inicio del móvil y ve **solo sus propios datos**. No hay registro ni analítica. Puedes compartir el enlace con quien quieras: cada persona empieza con su app vacía (o con el ejemplo) y lo que escribe se queda en su teléfono, salvo que active la **sincronización** opcional para compartir las cuentas con su pareja o familia.

## Privacidad

- Los datos se guardan **solo en el navegador de cada aparato** (IndexedDB; si no está disponible, localStorage). Aunque todos usen el mismo enlace, nadie puede ver los datos de otro.
- Sin sincronización, la app no hace **ninguna petición de red con datos**. La página lleva una política de seguridad (CSP) que solo deja conectar con su propio sitio y con la base de datos de la sincronización: ni CDN, ni analítica, ni rastreadores.
- **Sincronización (opcional)**: en *Ajustes → Sincronizar con otros móviles* se crea un código de familia (20 letras y cifras al azar) o se pega uno. Los datos se guardan en Firebase Realtime Database bajo `/familias/<código>/finanzas` (la misma base y las mismas reglas que *Menú familiar*, así que sirve el mismo código). Quien tenga el código puede ver y cambiar las cuentas: no lo publiques. Se envía solo lo que cambia, funciona sin cobertura y, si dos personas cambian lo mismo a la vez, gana el último. Al conectar un móvil que ya tiene datos a un código que también los tiene, la app pregunta con cuáles quedarse.
- **Nunca subas tus datos al repositorio**: los archivos `*.json` de copia (y `datos-privados/`) están en `.gitignore`.
- El repositorio no contiene datos personales de nadie. El ejemplo de la primera vez es **ficticio** y lo dice en pantalla.
- No hace falta (ni se debe) escribir números de cuenta, IBAN o contraseñas: con el nombre de la cuenta basta. La app lo recuerda junto al campo.
- **Copia de seguridad**: en *Ajustes → Copia de seguridad* se exporta un archivo JSON con todo, y se importa en otro aparato o tras borrar el navegador. Si se borran los datos del navegador sin copia, se pierden. La app recuerda hacer copia si hace más de 30 días de la última.

## Qué hace

| Pantalla | Qué tiene |
| --- | --- |
| **Resumen** | Dinero total a fin de año, ingresos, gasto real, apartado y lo que sobra. Gráfico del saldo de cada cuenta, gráfico de ingresos frente a gasto real y tabla mes a mes. |
| **Meses** | Selector de año: los meses de años anteriores (por ejemplo 2026) se ven tal como estaban en la hoja y sus cifras se pueden corregir; el total se recalcula. Del año planificado, una cuadrícula por mes: una fila por partida y una columna por cuenta, con saldo inicial, total del mes y saldo previsto a fin de mes. Tocar un importe lo cambia **solo ese mes**. Debajo, los **saldos reales** a fin de mes (con la diferencia frente a lo previsto) y los **apuntes del mes** (gastos o ingresos no previstos). |
| **Domiciliaciones** | Los recibos fijos (seguros, luz, móvil…) agrupados en bloques, con su importe, la cuenta donde se cobran y, si se quieren cambiar de banco, la cuenta destino. Se añaden, cambian y borran desde la propia pestaña. |
| **Avisos** | Pagos que no son mensuales en los próximos 7 días, en los próximos 30 y el resto agrupado por mes, con la marca «estimado». Avisos en el móvil una semana antes y el día de antes (ver abajo). |
| **Ajustes** | Año a planificar, cuentas, conceptos de cada mes, pagos no mensuales, copia de seguridad, compartir la app, instalarla, tema claro u oscuro, cargar el ejemplo o empezar de cero. |

### Tipos de concepto

- **Ingreso**: entra en una cuenta.
- **Gasto**: sale de una cuenta.
- **Ahorro o traspaso**: pasa de una cuenta a otra (o sale de tus cuentas, si el destino es «Fuera de mis cuentas»). **No cuenta como gasto.** También puede venir **desde fuera** (p. ej. lo que ingresa la empresa en un plan de ahorro): suma en la cuenta destino pero no cuenta como ingreso ni como ahorro tuyo.
- **Cuenta de gasto diario**: una cuenta marcada así (p. ej. la conjunta de la compra) no guarda saldo: lo que se le traspasa cuenta como gasto y a fin de mes aparece «se gasta».

En la copia JSON, cada concepto o pago puede llevar además `note` (se ve en una columna de notas), `estimated` y `group` (bloque de la tabla, en el orden de `config.sections`), y `config.debts` describe una deuda que baja con los pagos cuyo concepto empieza por un texto (por ejemplo una tarjeta).

Cada concepto tiene un rango de meses (*desde / hasta*), así que una paga extra o un gimnasio de seis meses se apuntan una sola vez.

## Avisos de pagos

La app avisa de cada pago no mensual **una semana antes** y **el día de antes**:

| Cómo | Dónde funciona | Qué hace |
| --- | --- | --- |
| **Al abrir la app** | En todos | Sale una ventana con los pagos de hoy, de mañana y de los próximos 7 días que aún no se habían avisado en ese móvil. |
| **Avisos con la app cerrada** | iPhone (iOS 16.4 o posterior, con la app en la pantalla de inicio) y Android, con la sincronización activada | En *Avisos → Activar avisos en este móvil*. Igual que en *Menú familiar*: cada móvil se apunta en Firebase y el proceso [`.github/workflows/avisos.yml`](.github/workflows/avisos.yml) se ejecuta cada hora, mira los pagos sincronizados y envía los avisos (Web Push) desde las 9:00, hora de España. |
| **Calendario** | En todos | *Avisos → Añadir pagos al calendario* crea un archivo `.ics` con un evento por pago y dos alarmas. En iPhone, el archivo se añade al Calendario abriéndolo desde Mail. |

Para los avisos con la app cerrada hay que poner **una vez** el código de familia en GitHub: *Settings → Secrets and variables → Actions → New repository secret*, nombre `FAMILIA_CODIGO`. Las claves para firmar los avisos son las mismas que usa *Menú familiar* (`/familias/<código>/vapid`); los móviles apuntados están en `finanzas-push` y los avisos ya enviados en `finanzas-avisados`. El repositorio es público, así que el proceso no escribe en sus registros ni conceptos ni importes, solo cuántos avisos envía. El contenido de cada aviso viaja cifrado hasta el móvil (Web Push).

Cada aviso se muestra una vez (se recuerda por fecha, concepto y tipo). Con el ejemplo ficticio no se avisa de nada. La regla está en [`src/calc/reminders.ts`](src/calc/reminders.ts) (la app) y en [`.github/scripts/avisos.mjs`](.github/scripts/avisos.mjs) (el servicio), las dos con pruebas.

## Instalarla en el móvil

Abre el enlace de la app y:

- **iPhone o iPad**: en Safari, toca *Compartir* (el cuadrado con la flecha) → *Añadir a pantalla de inicio*.
- **Android**: en Chrome, toca *Instalar* cuando lo ofrezca, o el menú (⋮) → *Instalar aplicación*.

Una vez instalada, abre sin conexión. Cuando se publica una versión nueva, la app avisa con un botón *Actualizar*; los datos no se tocan.

## Cálculo

Para cada mes *k* y cada cuenta:

- **Saldo inicial** = saldo real del mes anterior si lo has apuntado; si no, el saldo previsto a fin del mes anterior; en enero, el saldo inicial de la cuenta.
- Ingreso: `+importe` en su cuenta. Gasto: `−importe`. Ahorro o traspaso: `−importe` en la cuenta de origen y `+importe` en la de destino.
- Los conceptos solo cuentan dentro de su rango de meses. Un pago no mensual cuenta en el mes de su fecha (si cae en el año planificado) y resta de su cuenta.
- Un importe cambiado para un mes sustituye al normal ese mes. Un 0 anula la partida ese mes.
- Los **apuntes del mes** suman (ingreso) o restan (gasto) en su cuenta.
- **Saldo previsto a fin de mes** = saldo inicial + total del mes.
- **Gasto real** = gastos + pagos no mensuales + apuntes de gasto. El ahorro y los traspasos **no** son gasto.
- **Sobra** = ingresos − gasto real − apartado.
- **Dinero total a fin de año** = suma de los saldos de diciembre (el real, si está apuntado).

El motor está en [`src/calc/engine.ts`](src/calc/engine.ts), sin DOM ni almacenamiento, y tiene pruebas en [`tests/`](tests/).

## Modelo de datos

Es también el formato del archivo de copia (con una cabecera `app`, `version` y `exported_at`):

```text
config = {
  year, example: bool,
  accounts: [{ name, initial }],
  items:    [{ name, type: "Ingreso"|"Gasto"|"Ahorro", amount, account, to (o -1), from_month, to_month }],
  payments: [{ date, concept, amount, account, estimated: bool }]
}
overrides:     { "<AAAA-MM>_i<concepto>": importe, "<AAAA-MM>_p<pago>": importe }
real_balances: { "<AAAA-MM>_c<cuenta>": importe }
entries:       [{ id, month, concept, amount, type, date, account, note }]
```

`account`, `to` y los números de las claves son posiciones en las listas. Al quitar una cuenta, un concepto o un pago, [`src/calc/mutations.ts`](src/calc/mutations.ts) recoloca todo:

- **Quitar una cuenta**: sus conceptos, pagos y apuntes pasan a la cuenta que elijas. Los traspasos que iban a ella van a esa cuenta; si así un traspaso quedara de una cuenta a sí misma, pasa a «Fuera de mis cuentas». Sus saldos reales se borran. Siempre queda al menos una cuenta.
- **Quitar un concepto o un pago**: se borran sus importes cambiados y se renumeran los demás.

Lo importado se limpia antes de usarlo ([`src/storage/sanitize.ts`](src/storage/sanitize.ts)): números válidos, textos acotados, índices de cuenta existentes. La interfaz nunca trata el texto como HTML.

## Desarrollo

Necesitas Node 22.

```sh
npm ci
npm run dev        # servidor local con recarga
npm test           # pruebas (Vitest)
npm run build      # compila en dist/ (comprueba tipos y genera sw.js)
npm run preview    # sirve dist/ para probar la versión compilada
```

Vite + TypeScript, sin framework ni librerías en tiempo de ejecución (unos 25 KB comprimidos). Los gráficos son SVG hechos a mano. Las tipografías (Bricolage Grotesque, IBM Plex Sans, IBM Plex Mono; licencia SIL OFL, ver [`src/fonts/OFL.txt`](src/fonts/OFL.txt)) se sirven con la app.

| Carpeta | Contenido |
| --- | --- |
| `src/calc/` | Motor de cálculo puro: tipos, cálculo del año, avisos y cambios que mantienen los índices. |
| `src/storage/` | Guardado local (IndexedDB / localStorage), copia de seguridad JSON, limpieza de datos importados y ejemplo ficticio. |
| `src/ui/` | Pantallas, formularios, ventanas, navegación y registro del service worker. |
| `src/charts/` | Gráfico de líneas y de barras en SVG. |
| `src/i18n/` | Textos (`es.ts`) y formato de cifras y fechas con `Intl`. Para añadir un idioma, copia `es.ts`, tradúcelo y regístralo en `index.ts`. |
| `src/styles/` | Estilos con tokens de color para tema claro y oscuro. |
| `public/` | `manifest.webmanifest` e iconos. |
| `design/` | Logo original y el script que genera los iconos (`python3 design/make-icons.py`). |
| `build/` | Plugins de Vite: genera `sw.js` (copia sin conexión con versión por contenido) y añade la política de seguridad. |
| `tests/` | Pruebas del motor, de los cambios, de la lectura de importes y de la copia de seguridad. |

## Publicación en GitHub Pages

El flujo [`.github/workflows/pages.yml`](.github/workflows/pages.yml) pasa las pruebas y compila en cada push. Cuando el push llega a la rama `main`, publica la app en:

```text
https://moxetas.github.io/finanzas-familiares/
```

Hay que activarlo **una sola vez** en GitHub: *Settings → Pages → Build and deployment → Source: GitHub Actions*.

La app usa rutas relativas, así que funciona en cualquier dirección o subcarpeta.

## Fase 2 (opcional): sincronizar entre aparatos

No está hecha. Esta es la idea, para que el modo local siga siendo el de siempre:

- **Opcional y con consentimiento claro**: un interruptor en Ajustes, apagado por defecto, que explica qué se sube y dónde. Sin activarlo, la app funciona igual que ahora.
- **Cuenta** con enlace mágico por correo (sin contraseñas que guardar), por ejemplo con Supabase Auth.
- **Base de datos con Row Level Security**: cada fila lleva `user_id` y una política `user_id = auth.uid()` para leer y escribir, de modo que cada persona solo accede a lo suyo. Una tabla con un documento por usuario (`user_id`, `data jsonb`, `updated_at`) basta para este modelo de datos.
- **Local primero**: IndexedDB sigue siendo la fuente de la verdad; la sincronización sube y baja el documento completo y, si hay conflicto, gana el más reciente, con aviso y copia del otro.
- La política de seguridad (CSP) se ampliaría solo al dominio de ese servicio, y la app no le enviaría nada mientras la sincronización esté apagada.
