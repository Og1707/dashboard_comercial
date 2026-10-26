# Dashboard de Control Operativo WhatsApp

API REST + Dashboard Web Multi-Tenant para monitoreo en tiempo real de campañas de mensajería masiva por WhatsApp. Construido sobre Node.js 22 y PostgreSQL, con enfoque en rendimiento, aislamiento estricto de datos por cliente (tenant isolation) y seguridad JWT.

![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pg_driver-4169E1?logo=postgresql&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT_Stateless-000000?logo=jsonwebtokens&logoColor=white)
![Zod](https://img.shields.io/badge/Validation-Zod-3E67B1)
![Docker](https://img.shields.io/badge/Deploy-Docker%20%2B%20Nixpacks-2496ED?logo=docker&logoColor=white)

---

## 🔒 Autenticación y Modelo Multi-Tenant

El dashboard opera bajo un modelo de aislamiento **Multi-Tenant**:
- **Sin registro público:** No existe un endpoint `POST /register`. Todo el alta de usuarios es **100% manual por SQL** realizado por los administradores de la base de datos.
- **Acceso por JWT:** El usuario realiza login en `/api/auth/login` y obtiene un JWT firmado.
- **Tenant Isolation:** En cada consulta, la capa de repositorios filtra los registros aplicando el array de subcuentas asignadas al usuario (`id_subcuenta = ANY($2::int[])`).
- **Rol Admin:** Los usuarios con `rol = 'admin'` realizan un bypass automático y pueden visualizar datos globales.

---

## 🏗️ Arquitectura del Sistema

Patrón en capas **Controller → Service → Repository**:

```
Cliente Web (SPA) ──► HTTP / Bearer JWT ──► Express Server
                                                │
    ┌───────────────────────────────────────────┴───────────────────────────────────────────┐
    │ Middlewares (Helmet · Rate Limit · JWT Auth (auth.middleware) · Zod Validation)        │
    └───────────────────────────────────────────┬───────────────────────────────────────────┘
                                                ▼
    ┌───────────────────────────────────────────────────────────────────────────────────────┐
    │ Controllers ──► Services (Cache por User ID) ──► Repositories (SQL Parametrizado)      │
    └───────────────────────────────────────────┬───────────────────────────────────────────┘
                                                ▼
                                    PostgreSQL (Pool `pg`)
```

---

## 🚀 Instalación y Desarrollo Local

```bash
# 1. Clonar el repositorio e instalar dependencias (incluye bcryptjs y jsonwebtoken)
npm install

# 2. Configurar el archivo de entorno
cp .env.example .env

# 3. Iniciar el servidor en modo desarrollo (recarga automática con node --watch)
npm run dev
```

El servidor estará disponible en `http://localhost:3000`.

---

## ⚙️ Variables de Entorno

Configurar las siguientes variables en `.env`:

```env
PORT=3000
NODE_ENV=development

# Base de datos
PG_HOST=localhost
PG_PORT=5432
PG_DB=dashboard_db
PG_USER=postgres
PG_PASSWORD=secret
PG_SSL=false

# Caché
CACHE_TTL_SECONDS=60

# Autenticación JWT (Obligatorias)
JWT_SECRET=0b56fba7da4b3ef2365811ab0be6fbfe9b85ae5bc319066aa1cb2aebe0ef00a0
JWT_EXPIRES_IN=8h
```

### ¿Cómo generar una clave `JWT_SECRET` segura?
Puedes generar una cadena aleatoria segura de 64 caracteres ejecutando en la terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 👤 Gestión Manual de Usuarios (Alta por SQL)

Puesto que **no existe registro público**, la creación de clientes y la asignación de subcuentas se hace directamente por SQL.

### 1. Generar la contraseña encriptada con Bcrypt
Genera el hash de la contraseña usando Node.js:

```bash
node -e "console.log(require('bcryptjs').hashSync('contraseña_del_cliente', 10))"
```

### 2. Crear el Cliente en la Tabla `clientes`
```sql
-- Ejemplo 1: Crear un usuario Cliente
INSERT INTO comercial_marketing.clientes (
  nombre_cliente, 
  email, 
  password_hash, 
  rol, 
  activo
) VALUES (
  'Dropi Colombia', 
  'colombia@dropi.co', 
  '$2b$10$ca4.TOdBnLVAssvqjq8W9.MMwTUYtJF/c64rq1XOYQd1atq1NLjXW', -- Hash generado
  'cliente', 
  true
);

-- Ejemplo 2: Crear un Administrador Global
INSERT INTO comercial_marketing.clientes (
  nombre_cliente, 
  email, 
  password_hash, 
  rol, 
  activo
) VALUES (
  'Administrador Principal', 
  'admin@dropi.co', 
  '$2b$10$ca4.TOdBnLVAssvqjq8W9.MMwTUYtJF/c64rq1XOYQd1atq1NLjXW', 
  'admin', 
  true
);
```

### 3. Asignar Subcuentas al Cliente (`cliente_subcuentas`)
Vincula el `id_cliente` recién creado con las subcuentas (`id_subcuenta`) que tiene permitido visualizar:

```sql
-- Asignar las subcuentas 10, 11 y 12 al Cliente con id_cliente = 2
INSERT INTO comercial_marketing.cliente_subcuentas (id_cliente, id_subcuenta) 
VALUES 
  (2, 10),
  (2, 11),
  (2, 12);
```

---

## 🔌 Endpoints de la API

> 📘 **Documentación detallada:** Consulta [API_DOCUMENTATION.md](file:///C:/Users/Osman/Documents/Trabajo/Dropi/Comercial/Dashboard/API_DOCUMENTATION.md) para ver payloads completas de respuesta y especificación de parámetros.

Base path: `/api` · Requiere cabecera `Authorization: Bearer <token>` (excepto login y health).

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/auth/login` | Autenticación pública (recibe email/password, retorna JWT y perfil) |
| `GET` | `/api/summary` | KPIs globales + semáforo filtrado por tenant |
| `GET` | `/api/trend` | Evolución temporal de envíos filtrada por tenant |
| `GET` | `/api/detail` | Detalle paginado subcuenta × proceso filtrado por tenant |
| `GET` | `/api/not-delivered` | Envíos fallidos filtrados por tenant |
| `GET` | `/api/not-delivered/export` | Exportación CSV de fallos filtrada por tenant |
| `GET` | `/api/not-delivered/reasons` | Motivos de fallo asociados al tenant |
| `GET` | `/api/accounts` | Subcuentas permitidas para el usuario |
| `GET` | `/api/account/:name` | Métricas de una cuenta específica |
| `GET` | `/health` | Health check del servicio (Público) |

---

## 🛡️ Seguridad e Integridad

- **Prevención de IDOR:** El cliente no puede inyectar subcuentas ni roles en los parámetros de la petición; el backend aplica estrictamente los claims del JWT firmado.
- **SQL Injection:** Todas las consultas usan sentencias preparadas parametrizadas (`$1`, `$2`, ...).
- **Semáforo de Salud:**
  - 🟢 **Verde:** Tasa de entrega > 93%
  - 🟡 **Ámbar:** Tasa de entrega 85% – 93%
  - 🔴 **Rojo:** Tasa de entrega < 85%
