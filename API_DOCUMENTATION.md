# Documentación Oficial de la API REST
## Dashboard de Control Operativo WhatsApp — Dropi

---

## 📋 Índice
1. [Visión General de la Arquitectura](#visión-general-de-la-arquitectura)
2. [Políticas de Seguridad y Autenticación JWT](#políticas-de-seguridad-y-autenticación-jwt)
3. [Aislamiento de Datos Multi-Tenant](#aislamiento-de-datos-multi-tenant)
4. [Semáforo de Salud Operativa](#semáforo-de-salud-operativa)
5. [Especificación de Endpoints](#especificación-de-endpoints)
   - [POST /api/auth/login](#1-autenticación-de-usuario-login)
   - [GET /health](#2-health-check)
   - [GET /api/summary](#3-resumen-operativo-summary)
   - [GET /api/trend](#4-tendencia-temporal-trend)
   - [GET /api/detail](#5-detalle-de-envíos-detail)
   - [GET /api/not-delivered](#6-envíos-no-entregados-not-delivered)
   - [GET /api/not-delivered/export](#7-exportación-csv-de-no-entregados)
   - [GET /api/not-delivered/reasons](#8-catálogo-de-motivos-de-fallo)
   - [GET /api/accounts](#9-listado-de-cuentas-activas)
   - [GET /api/account/:name](#10-métricas-por-cuenta)
6. [Esquema Estándar de Errores](#esquema-estándar-de-errores)
7. [Variables de Entorno y Configuración](#variables-de-entorno-y-configuración)

---

## 🏗️ Visión General de la Arquitectura

La API está estructurada en capas **Routes → Controllers → Services → Repositories**. Toda petición a endpoints de datos requiere autenticación previa mediante **JSON Web Tokens (JWT)**.

```
                    ┌─────────────────────────┐
                    │    Cliente Web / SPA    │
                    └────────────┬────────────┘
                                 │ HTTP / REST (Bearer JWT)
                                 ▼
                    ┌─────────────────────────┐
                    │    Express App Core     │
                    │ (Helmet, Cors, Limiter) │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   auth.middleware.js    │
                    │  (Verifica JWT & Claims)│
                    └────────────┬────────────┘
                                 │ Inyecta req.user
                                 ▼
                    ┌─────────────────────────┐
                    │   validate.middleware   │
                    │   (Esquemas Zod)        │
                    └────────────┬────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │   Controllers   │  │   Controllers   │  │   Controllers   │
   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
            │                    │                    │
            ▼                    ▼                    ▼
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │    Services     │  │    Services     │  │    Services     │
   │ (Cache por User)│  │ (Cache por User)│  │ (Cache por User)│
   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
            │                    │                    │
            ▼                    ▼                    ▼
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │  Repositories   │  │  Repositories   │  │  Repositories   │
   │ (ANY($2::int[]))│  │ (ANY($2::int[]))│  │ (ANY($2::int[]))│
   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
            └────────────────────┼────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │  PostgreSQL Pool (pg)   │
                    └─────────────────────────┘
```

---

## 🛡️ Políticas de Seguridad y Autenticación JWT

1. **Autenticación Obligatoria:** Todas las rutas `/api/*` (excepto `/api/auth/login` y `/health`) requieren la cabecera HTTP:
   `Authorization: Bearer <token_jwt>`
2. **Expiración y Sesión:** Los tokens son emitidos por el servidor con una vigencia configurable (ej. `8h`). Cuando el token expira o la cabecera no se envía, la API responde con **HTTP 401 Unauthorized**.
3. **Protección contra Inyección SQL & IDOR:** Las consultas se parametrizan estrictamente. La autorización de acceso a subcuentas es impuesta por el servidor mediante los claims del JWT.
4. **Control de Tasa (Rate Limiting):** Límite global de **60 peticiones/minuto por IP**.

---

## 🔒 Aislamiento de Datos Multi-Tenant

> [!IMPORTANT]
> **Filtrado Automático Enforzado por Servidor:**
> El cliente de la API **no necesita ni puede especificar manualmente** qué subcuentas consultar para evadir sus permisos.
> El middleware de autenticación inyecta la lista de subcuentas autorizadas en `req.user.subcuentas` a partir del token firmado. Todas las consultas filtran automáticamente utilizando la condición:
> ```sql
> WHERE ($1::boolean = true) OR (id_subcuenta = ANY($2::int[]) AND ...)
> ```
> Si el usuario tiene rol `admin`, `$1` es `true` y accede a todas las subcuentas globalmente. Si el usuario es `cliente`, `$1` es `false` y únicamente visualizará la data de las subcuentas contenidas en su array `$2::int[]`.

---

## 🟢 Semáforo de Salud Operativa

$$\text{Tasa de Entrega (\%)} = \left( \frac{\text{Envíos Entregados}}{\text{Total Envíos}} \right) \times 100$$

| Tasa de Entrega | Código Semáforo | Estado Operativo |
|---|---|---|
| **> 93%** | `green` / 🟢 | **Óptimo** |
| **85% – 93%** | `amber` / 🟡 | **Atención requerida** |
| **< 85%** | `red` / 🔴 | **Crítico** |

---

## 🔌 Especificación de Endpoints

Base URL: `/api`

---

### 1. Autenticación de Usuario (Login)
Valida las credenciales de un cliente y retorna un JWT firmado junto con su información de perfil.

* **Ruta:** `POST /api/auth/login`
* **Autenticación:** Exenta / Pública
* **Request Body:**
  ```json
  {
    "email": "cliente@empresa.com",
    "password": "mi_contraseña_segura"
  }
  ```
* **Respuestas:**
  * **200 OK (Login Exitoso):**
    ```json
    {
      "status": "success",
      "data": {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "user": {
          "id": 4,
          "nombre": "Nombre del Cliente",
          "email": "cliente@empresa.com",
          "rol": "cliente",
          "subcuentas": [101, 102]
        }
      }
    }
    ```
  * **400 Bad Request (Error de Validación Zod):**
    ```json
    {
      "error": "Parámetros inválidos",
      "details": [
        { "field": "email", "message": "Formato de email inválido" }
      ]
    }
    ```
  * **401 Unauthorized (Credenciales Incorrectas o Usuario Inactivo):**
    ```json
    {
      "error": "Credenciales inválidas"
    }
    ```

---

### 2. Health Check
Verifica la disponibilidad básica del servidor.

* **Ruta:** `GET /health`
* **Autenticación:** Exenta / Pública
* **Respuesta Exitosa (200 OK):**
  ```json
  { "status": "ok" }
  ```

---

### 3. Resumen Operativo (Summary)
Retorna KPIs globales, consolidados por país y proceso con sus semáforos de salud y métricas filtradas por las subcuentas autorizadas del token.

* **Ruta:** `GET /api/summary`
* **Headers Requeridos:** `Authorization: Bearer <token>`
* **Query Parameters:**
  | Parámetro | Tipo | Requerido | Descripción |
  |---|---|---|---|
  | `from` | String | **Sí** | Fecha inicio (`YYYY-MM-DD`) |
  | `to` | String | **Sí** | Fecha fin (`YYYY-MM-DD`) |
* **Respuesta Exitosa (200 OK):**
  ```json
  {
    "kpis": {
      "processed": 15000,
      "delivered": 14100,
      "failed": 900,
      "rate": 94.0,
      "cost": 125.80,
      "sema": "green",
      "integrityIssues": 0
    },
    "countries": [
      {
        "code": "CO",
        "name": "Colombia",
        "processed": 15000,
        "delivered": 14100,
        "failed": 900,
        "rate": 94.0,
        "cost": 125.80,
        "sema": "green"
      }
    ],
    "processes": [
      {
        "name": "Confirmación de Órdenes",
        "templateCategory": "UTILITY",
        "processed": 15000,
        "delivered": 14100,
        "failed": 900,
        "rate": 94.0,
        "cost": 125.80,
        "sema": "green",
        "validation": false
      }
    ],
    "heatmap": []
  }
  ```

---

### 4. Tendencia Temporal (Trend)
Serie temporal diaria de envíos agrupada por proceso para las subcuentas autorizadas.

* **Ruta:** `GET /api/trend`
* **Headers Requeridos:** `Authorization: Bearer <token>`
* **Query Parameters:** `from`, `to`, `country` (opcional), `subcuenta` (opcional)
* **Respuesta Exitosa (200 OK):**
  ```json
  {
    "days": ["Ago 1", "Ago 2"],
    "series": {
      "Confirmación de Órdenes": [1200, 1350]
    }
  }
  ```

---

### 5. Detalle de Envíos (Detail)
Tabla paginada subcuenta × proceso con búsqueda y filtros sobre las subcuentas permitidas.

* **Ruta:** `GET /api/detail`
* **Headers Requeridos:** `Authorization: Bearer <token>`
* **Query Parameters:** `from`, `to`, `country` (opcional), `process` (opcional), `search` (opcional), `limit` (def: 50, máx: 200), `offset` (def: 0)
* **Respuesta Exitosa (200 OK):**
  ```json
  {
    "total": 1,
    "limit": 50,
    "offset": 0,
    "rows": [
      {
        "code": "CO",
        "country": "Colombia",
        "account": "Mi Subcuenta",
        "process": "Confirmación de Órdenes",
        "processed": 100,
        "delivered": 95,
        "failed": 3,
        "unreported": 2,
        "rate": 95.0,
        "cost": 0.85
      }
    ]
  }
  ```

---

### 6. Envíos No Entregados (Not Delivered)
Paginado de mensajes no entregados vinculados a las subcuentas autorizadas.

* **Ruta:** `GET /api/not-delivered`
* **Headers Requeridos:** `Authorization: Bearer <token>`
* **Query Parameters:** `from`, `to`, `country` (opcional), `reason` (opcional), `limit`, `offset`
* **Respuesta Exitosa (200 OK):**
  ```json
  {
    "total": 3,
    "limit": 50,
    "offset": 0,
    "rows": [
      {
        "telefono": "+573119876543",
        "contact_id": "ct_123",
        "country": "Colombia",
        "process": "Confirmación de Órdenes",
        "template": "confirmacion_v1",
        "workflow_id": "wf_99",
        "reason": "Número no registrado en WhatsApp",
        "date": "2026-08-25T10:00:00.000Z"
      }
    ]
  }
  ```

---

### 7. Exportación CSV de No Entregados
Descarga del archivo CSV de errores para las subcuentas autorizadas.

* **Ruta:** `GET /api/not-delivered/export`
* **Headers Requeridos:** `Authorization: Bearer <token>`
* **Query Parameters:** `from`, `to`, `country` (opcional), `reason` (opcional)
* **Respuesta Exitosa (200 OK):** Archivo binario CSV (`text/csv; charset=utf-8`) con cabecera `Content-Disposition: attachment; filename="no_entregados_...csv"`.

---

### 8. Catálogo de Motivos de Fallo
Motivos de fallo filtrados según las subcuentas asociadas al usuario.

* **Ruta:** `GET /api/not-delivered/reasons`
* **Headers Requeridos:** `Authorization: Bearer <token>`
* **Respuesta Exitosa (200 OK):**
  ```json
  {
    "reasons": [
      "Número no registrado en WhatsApp",
      "Teléfono apagado / sin señal"
    ]
  }
  ```

---

### 9. Listado de Cuentas Activas
Lista de subcuentas asignadas al usuario autenticado (o todas si es admin).

* **Ruta:** `GET /api/accounts`
* **Headers Requeridos:** `Authorization: Bearer <token>`
* **Respuesta Exitosa (200 OK):**
  ```json
  {
    "accounts": [
      { "id_subcuenta": 101, "name": "Mi Subcuenta", "country": "Colombia", "code": "CO" }
    ]
  }
  ```

---

### 10. Métricas por Cuenta
Métricas de una cuenta específica (validadas contra los permisos del usuario).

* **Ruta:** `GET /api/account/:name`
* **Headers Requeridos:** `Authorization: Bearer <token>`
* **Query Parameters:** `from`, `to`, `limit`, `offset`
* **Respuesta Exitosa (200 OK):** Objeto con `kpis`, `processes` y `worklist`.

---

## ⚠️ Esquema Estándar de Errores

### Error de Autenticación / Token Expirado (401 Unauthorized)
```json
{
  "error": "Acceso no autorizado: Token ausente o formato inválido"
}
```
o
```json
{
  "error": "Sesión expirada o token inválido"
}
```

### Error de Validación (400 Bad Request)
```json
{
  "error": "Parámetros inválidos",
  "details": [
    { "field": "from", "message": "Formato de fecha inválido (YYYY-MM-DD)" }
  ]
}
```

---

## ⚙️ Variables de Entorno y Configuración

| Variable | Tipo | Requerida | Valor por Defecto | Descripción |
|---|---|---|---|---|
| `JWT_SECRET` | String | **Sí** | - | Clave criptográfica para firmar JWT (min 32 caracteres) |
| `JWT_EXPIRES_IN` | String | No | `8h` | Tiempo de vida del token |
| `PG_HOST` | String | **Sí** | - | Host de PostgreSQL |
| `PG_DB` | String | **Sí** | - | Nombre de la base de datos |
| `PG_USER` | String | **Sí** | - | Usuario de PostgreSQL |
| `PG_PASSWORD` | String | **Sí** | - | Contraseña de PostgreSQL |
| `CACHE_TTL_SECONDS` | Number | No | `60` | TTL en memoria caché |
