const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
};

const perfilSchema = {
  type: 'object',
  properties: {
    uid: { type: 'string', example: 'q1w2e3r4t5' },
    nombres: { type: 'string', example: 'Ana María' },
    apellidos: { type: 'string', example: 'Pérez Gómez' },
    username: { type: 'string', example: 'ana_perez' },
    email: { type: 'string', example: 'ana.perez@correounivalle.edu.co' },
    avatarUrl: { type: 'string', nullable: true, example: 'https://ejemplo.com/avatar.png' },
    proveedor: { type: 'string', enum: ['password', 'google.com'] },
    creadoEn: { type: 'string', format: 'date-time' },
  },
};

const respuesta401 = {
  description: 'Sin sesión o con un token inválido o vencido',
  content: {
    'application/json': {
      schema: errorSchema,
      example: { error: 'Debes iniciar sesión para continuar.' },
    },
  },
};

const respuesta503 = {
  description: 'Error al consultar Firestore',
  content: { 'application/json': { schema: errorSchema } },
};

export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Salón de Estudio Colaborativo en Tiempo Real — API',
    version: '1.1.0',
    description:
      'Sprint 0 (TS-00) y Sprint 1 (TS-01). Las rutas privadas piden el ID token de Firebase ' +
      'en el encabezado `Authorization: Bearer <token>`. Para probarlas aquí, pulsa **Authorize** y pega el token.',
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID token' },
    },
  },
  paths: {
    '/api/usuarios/disponible': {
      get: {
        summary: 'Indica si un nombre de usuario está libre (público)',
        tags: ['Usuarios (TS-01)'],
        parameters: [
          {
            name: 'username',
            in: 'query',
            required: true,
            schema: { type: 'string', example: 'ana_perez' },
            description: 'Entre 3 y 20 letras, números o guion bajo. No distingue mayúsculas.',
          },
        ],
        responses: {
          '200': {
            description: 'Resultado de la consulta',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { disponible: { type: 'boolean' } } },
              },
            },
          },
          '400': {
            description: 'Formato de nombre de usuario inválido',
            content: { 'application/json': { schema: errorSchema } },
          },
          '503': respuesta503,
        },
      },
    },
    '/api/usuarios/me': {
      get: {
        summary: 'Perfil del usuario que inició sesión',
        tags: ['Usuarios (TS-01)'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Perfil encontrado',
            content: { 'application/json': { schema: perfilSchema } },
          },
          '401': respuesta401,
          '404': {
            description:
              'La cuenta existe en Firebase Auth pero aún no eligió nombre de usuario (por ejemplo, tras «Continuar con Google»)',
            content: {
              'application/json': {
                schema: errorSchema,
                example: {
                  error: 'Aún no has elegido tu nombre de usuario.',
                  codigo: 'PERFIL_INCOMPLETO',
                },
              },
            },
          },
          '503': respuesta503,
        },
      },
    },
    '/api/usuarios': {
      post: {
        summary: 'Crea el perfil del usuario que inició sesión (registro manual o con Google)',
        description:
          'El correo y el proveedor se toman del token, no del cuerpo. El nombre de usuario se reserva ' +
          'en una transacción de Firestore, así que dos personas no pueden quedarse con el mismo.',
        tags: ['Usuarios (TS-01)'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nombres', 'apellidos', 'username'],
                properties: {
                  nombres: { type: 'string', maxLength: 50, example: 'Ana María' },
                  apellidos: { type: 'string', maxLength: 50, example: 'Pérez Gómez' },
                  username: { type: 'string', pattern: '^[A-Za-z0-9_]{3,20}$', example: 'ana_perez' },
                  avatarUrl: {
                    type: 'string',
                    nullable: true,
                    example: 'https://ejemplo.com/avatar.png',
                    description: 'Opcional. Si viene de Google y no se envía, se usa la foto de Google.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Perfil creado',
            content: { 'application/json': { schema: perfilSchema } },
          },
          '400': {
            description: 'Datos inválidos: devuelve un mensaje por cada campo',
            content: {
              'application/json': {
                example: {
                  error: 'Revisa los campos marcados.',
                  errores: { username: 'Usa entre 3 y 20 letras, números o guion bajo (_), sin espacios.' },
                },
              },
            },
          },
          '401': respuesta401,
          '409': {
            description: 'Nombre de usuario ocupado, o la cuenta ya tiene perfil',
            content: {
              'application/json': {
                example: {
                  error: 'Ese nombre de usuario ya está en uso. Prueba con otro.',
                  errores: { username: 'Ese nombre de usuario ya está en uso. Prueba con otro.' },
                },
              },
            },
          },
          '503': respuesta503,
        },
      },
    },
    '/api/health': {
      get: {
        summary: 'Verifica que el servidor esté en línea',
        tags: ['Sistema'],
        responses: {
          '200': {
            description: 'Servicio operativo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/app-info': {
      get: {
        summary: 'Obtiene la configuración inicial desde Firestore (config/app)',
        tags: ['Base Técnica (TS-00)'],
        responses: {
          '200': {
            description: 'Documento config/app leído exitosamente desde Firestore',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    nombre: { type: 'string', example: 'Salón de Estudio' },
                    mensaje: { type: 'string', example: 'Bienvenido' },
                  },
                },
              },
            },
          },
          '503': {
            description: 'Error al consultar Firestore',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                      example: 'No se pudo leer la base de datos. Intenta de nuevo.',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
