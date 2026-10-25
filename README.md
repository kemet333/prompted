# PROMPTED

Web aprobada y publicada el 24 de octubre de 2026. La oferta incluye Prompted Operating System para negocios y Prompted Content System.

## Fuente vigente

- `site/index.html`: web completa aprobada, sin cambios visuales en esta recuperación.
- `site/os-art.js` y `site/os/`: recursos del Operating System.
- `Dockerfile` y `Caddyfile`: empaquetado de la versión de Railway.
- `docs/railway-release-2026-10-24.json`: hashes y referencia del despliegue comprobado.
- `archive/2026-10-01/index.html`: landing anterior, conservada como historia.

Para verla localmente, ejecuta `python3 -m http.server 8080 --directory site` y abre http://localhost:8080. No necesita instalar dependencias ni generar archivos.

## Publicación existente

La web responde en https://prompted-web-production.up.railway.app/. Railway sirve los archivos de `site/` con Caddy y termina HTTPS por delante del contenedor. El dominio público previsto es https://www.workwithprompted.com/; su certificado sigue bajo el seguimiento ya configurado. No borrar ni recrear el dominio ni cambiar DNS por este archivo.

Esta rama conserva el código que ya está publicado. Guardarla no configura un nuevo despliegue ni conecta automáticamente GitHub a Railway. Nunca subir claves, tokens, bases de datos ni configuración privada.
