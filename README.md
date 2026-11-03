# VittaCore

Aplicación local para nutriólogos independientes: expedientes, evolución antropométrica, cálculo dietético, menús y reportes listos para impresión. No requiere cuenta, API ni servidor. La beta `1.0.1` está limitada a cinco altas de pacientes y no incluye portal de paciente.

## Aplicación de escritorio para Windows

```bash
npm install
npm run desktop
npm run dist:win
```

`npm run desktop` compila y abre la aplicación de escritorio. `npm run dist:win` genera un instalador NSIS en `release/VittaCore-Setup-1.0.1-beta.1.exe`; el instalador permite elegir la carpeta y crea accesos directos. El instalador generado debe ejecutarse en Windows.

La versión de escritorio escribe sus datos en `vittacore-data.json` dentro de la carpeta de datos de VittaCore en el perfil local de Windows (`%APPDATA%`). Este archivo es independiente de los datos guardados previamente por la versión web. La primera apertura no incluye expedientes de pacientes; sí incluye un catálogo de referencia con alimentos comunes y tres menús de ejemplo para adaptar desde **Planes nutricionales**. Ahí selecciona cada día de la semana para agregar tiempos, ingredientes, porciones e imágenes opcionales; el calendario completo aparece en la vista previa y el reporte imprimible. Las imágenes se comprimen y se guardan en el dispositivo junto con el expediente. Los planes diarios anteriores se conservan como punto de partida para cada día al actualizar el formato.

## Beta `beta_v1.0.1`

- Permite registrar un máximo de cinco pacientes. El contador de altas se conserva aunque se importe un respaldo, y la edición de expedientes existentes sigue disponible al terminar la prueba.
- Los respaldos con más de cinco pacientes no se pueden importar en esta versión.
- El portal y el conmutador de vista de paciente están deshabilitados; los planes semanales, su vista previa, impresión y canales de envío siguen disponibles para el profesional.
- La rama local de esta versión es `beta_v1.0.1`.

Para desarrollar la interfaz web en el navegador:

```bash
npm run dev
npm run build
```

Al iniciar por primera vez se solicita la identidad profesional y se ofrece seleccionar una carpeta para el archivo `vittacore_auto_backup.json`.

## Acceso local

- En el primer inicio se configura una contraseña local; después se solicita al abrir VittaCore en el navegador.
- El menú del perfil permite cerrar sesión y bloquear la interfaz. Desde Configuración se puede cambiar la contraseña.
- La contraseña se guarda como derivación PBKDF2 con sal aleatoria; no se almacena en texto plano.
- Este acceso no cifra los expedientes guardados en `localStorage` ni los respaldos JSON. Protege la interfaz en ese navegador, no sustituye una cuenta de servidor ni el bloqueo del dispositivo.
- La contraseña olvidada no se puede recuperar desde VittaCore. Conserva respaldos actualizados y usa una contraseña que puedas resguardar.

## Almacenamiento y respaldos

- En la versión web, los datos de la aplicación se guardan en `localStorage` del navegador. La aplicación de escritorio usa un archivo JSON en su carpeta privada de datos, no el almacenamiento del navegador.
- En navegadores compatibles y contextos seguros (HTTPS o `localhost`), VittaCore puede escribir automáticamente el respaldo JSON elegido mediante File System Access API. El acceso a la carpeta se conserva en IndexedDB; si el navegador revoca permisos, se deben restablecer desde Configuración.
- Si no está disponible el selector de carpetas, se puede descargar o importar un respaldo manual desde **Configuración**.
- La aplicación no sincroniza dispositivos ni sube datos a servidores. `localStorage`, IndexedDB y los archivos JSON no están cifrados: protege el acceso al equipo y a las copias, porque los expedientes contienen información clínica.

El catálogo inicial de alimentos usa referencias genéricas de USDA FoodData Central, conjunto SR Legacy, expresadas por 100 g; consulta [la fuente y sus descargas](https://fdc.nal.usda.gov/download-datasets/). Los menús incluidos son ejemplos educativos, no indicaciones clínicas personalizadas. Los valores nutricionales y las fórmulas energéticas son estimaciones orientativas: verifica etiquetas y ajusta cada plan con el criterio del profesional tratante. Los datos se guardan localmente y la aplicación no consulta ni envía información a USDA.
