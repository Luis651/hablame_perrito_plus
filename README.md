# Hablame Perrito Plus - MVP

Sistema de gestión inteligente para sucursales (CIMA y TRAGO SPREXX). Control de inventario, comandas, cuadre de caja y gestión de créditos.

## 🚀 Cómo empezar en local

Como este proyecto fue desarrollado en **Firebase Studio**, sigue estos pasos para tenerlo en tu PC:

1. **Descargar el proyecto**: Busca el botón de "Download" o "Export" en la interfaz de Firebase Studio para bajar el archivo ZIP con todo el código.
2. **Descomprimir**: Extrae el contenido en una carpeta de tu preferencia.
3. **Instalar dependencias**: Abre una terminal en esa carpeta y ejecuta:
   ```bash
   npm install
   ```
4. **Configurar variables de entorno**: Crea un archivo `.env.local` y añade tus credenciales de Firebase y la API Key de Google GenAI (si vas a usar las funciones de IA).

## 📤 Subir a GitHub

Una vez que tengas los archivos en tu PC, ejecuta estos comandos en la terminal:

```bash
# Inicializar git
git init

# Añadir archivos
git add .

# Primer commit
git commit -m "Initial commit: Hablame Perrito Plus MVP"

# Configurar remoto (reemplaza con tu URL si es distinta)
git branch -M main
git remote add origin https://github.com/Luis651/hablame_perrito_plus.git

# Subir
git push -u origin main
```

## 🛠 Tech Stack
- **Next.js 15** (App Router)
- **Firebase** (Auth & Firestore)
- **Tailwind CSS** + **Shadcn UI**
- **Genkit** (AI Operations)
- **Lucide React** (Icons)

## 📋 Estructura de Sedes
- **Sucursal CIMA**: Operaciones principales.
- **Sucursal TRAGO SPREXX**: Operaciones secundarias.
- **Depósito Central**: Almacenamiento masivo de insumos.

---
Desarrollado con ❤️ para Hablame Perrito Plus.