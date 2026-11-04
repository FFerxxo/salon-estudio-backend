export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Salón de Estudio Colaborativo en Tiempo Real — API',
    version: '1.0.0',
    description: 'Documentación de la API base del Sprint 0 (TS-00).',
  },
  paths: {
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
