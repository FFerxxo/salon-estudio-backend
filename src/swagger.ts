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
    avatarUrl: { type: 'string', nullable: true, example: '🚀', description: 'Avatar del selector (🚀, 🎧, ⚡, 🦉) o enlace https.' },
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

const salaSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'K7PQ2XMB', description: 'ID único de 8 caracteres para compartir' },
    nombre: { type: 'string', example: 'Cálculo II — parcial 2' },
    ambiente: { type: 'string', enum: ['ninguno', 'blue', 'green'] },
    anfitrionUid: { type: 'string', example: 'q1w2e3r4t5' },
    anfitrionUsername: { type: 'string', example: 'ana_perez' },
    creadaEn: { type: 'string', format: 'date-time' },
    actualizadaEn: { type: 'string', format: 'date-time' },
  },
};

const respuestaPerfilIncompleto = {
  description: 'La cuenta aún no tiene perfil (no ha elegido nombre de usuario)',
  content: {
    'application/json': {
      example: { error: 'Aún no has elegido tu nombre de usuario.', codigo: 'PERFIL_INCOMPLETO' },
    },
  },
};

const respuestaSalaNoExiste = {
  description: 'No existe una sala con ese ID',
  content: {
    'application/json': {
      example: {
        error: 'No encontramos una sala con ese ID. Revisa que esté bien escrito.',
        codigo: 'SALA_NO_ENCONTRADA',
      },
    },
  },
};

const respuestaNoAnfitrion = {
  description: 'La sala es de otra persona: solo su anfitrión la puede cambiar o eliminar',
  content: {
    'application/json': {
      example: { error: 'Solo quien creó la sala puede cambiarla o eliminarla.' },
    },
  },
};

const parametroIdSala = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', example: 'K7PQ2XMB' },
  description: '8 letras o números. No distingue mayúsculas.',
};

const respuesta503 = {
  description: 'Error al consultar Firestore',
  content: { 'application/json': { schema: errorSchema } },
};

export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Salón de Estudio Colaborativo en Tiempo Real — API',
    version: '1.2.0',
    description:
      'Sprint 0 (TS-00), Sprint 1 (TS-01) y Sprint 2 (US-04, US-05, US-06). Las rutas privadas piden el ID token de Firebase ' +
      'en el encabezado `Authorization: Bearer <token>`. Para probarlas aquí, pulsa **Authorize** y pega el token.',
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID token' },
    },
  },
  paths: {
    '/api/auth/ingresar-usuario': {
      post: {
        summary: 'Inicia sesión con nombre de usuario y contraseña (US-02)',
        description:
          'Acepta el nombre de usuario (con o sin `@` al inicio) y la contraseña. ' +
          'Resuelve el correo únicamente en el servidor, valida las credenciales contra Firebase Auth y ' +
          'devuelve un customToken para iniciar sesión en el frontend con signInWithCustomToken. ' +
          'Ninguna respuesta incluye el correo electrónico.',
        tags: ['Autenticación (US-02)'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: '@ana_perez' },
                  password: { type: 'string', format: 'password', example: 'MiClaveSegura123' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Credenciales válidas: devuelve el customToken para Firebase Auth',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    customToken: { type: 'string', example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Faltan campos o tienen formato inválido',
            content: {
              'application/json': {
                example: {
                  error: 'Revisa los campos marcados.',
                  errores: { username: 'Escribe tu nombre de usuario.' },
                },
              },
            },
          },
          '401': {
            description: 'Usuario inexistente, cuenta sin contraseña o contraseña incorrecta (mensaje único)',
            content: {
              'application/json': {
                schema: errorSchema,
                example: { error: 'Usuario o contraseña incorrectos.' },
              },
            },
          },
          '429': {
            description: 'Demasiados intentos desde la misma IP (incluye encabezado Retry-After)',
            content: {
              'application/json': {
                schema: errorSchema,
                example: { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
              },
            },
          },
          '503': {
            description: 'Servicio de autenticación no disponible o falta configuración en el servidor',
            content: {
              'application/json': {
                schema: errorSchema,
                example: { error: 'No se pudo iniciar sesión en este momento. Intenta de nuevo.' },
              },
            },
          },
        },
      },
    },
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
      patch: {
        summary: 'Edita el perfil propio (US-04)',
        description:
          'Solo cambia los campos enviados. Siempre edita el perfil del token, nunca el de otra persona. ' +
          'El nombre de usuario y el correo se validan en el servidor para que no estén repetidos (409). ' +
          'El correo solo se puede cambiar en cuentas de correo y contraseña; si cambia, se actualiza también ' +
          'en Firebase Authentication (el frontend debe renovar el token con getIdToken(true)).',
        tags: ['Usuarios (US-04, US-05)'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nombres: { type: 'string', maxLength: 50, example: 'Ana María' },
                  apellidos: { type: 'string', maxLength: 50, example: 'Pérez Gómez' },
                  username: { type: 'string', pattern: '^[A-Za-z0-9_]{3,20}$', example: 'ana_maria' },
                  email: { type: 'string', format: 'email', example: 'ana.maria@correo.com' },
                  avatarUrl: { type: 'string', nullable: true, example: '🚀', description: 'Avatar del selector (🚀, 🎧, ⚡, 🦉) o enlace https.' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Perfil actualizado',
            content: { 'application/json': { schema: perfilSchema } },
          },
          '400': {
            description: 'Datos inválidos (un mensaje por campo), sin cambios, o correo de una cuenta de Google',
            content: {
              'application/json': {
                example: {
                  error: 'Revisa los campos marcados.',
                  errores: { email: 'Escribe un correo válido, por ejemplo nombre@correo.com.' },
                },
              },
            },
          },
          '401': respuesta401,
          '404': respuestaPerfilIncompleto,
          '409': {
            description: 'El nombre de usuario o el correo ya los usa otra persona',
            content: {
              'application/json': {
                example: {
                  error: 'Ese correo ya está registrado en otra cuenta.',
                  errores: { email: 'Ese correo ya está registrado en otra cuenta.' },
                },
              },
            },
          },
          '503': respuesta503,
        },
      },
      delete: {
        summary: 'Elimina la cuenta propia (US-05)',
        description:
          'Política de eliminación: se borran las salas de la persona (con sus mensajes), su perfil ' +
          '(users/{uid}), la reserva de su nombre de usuario (queda libre para otros) y su cuenta de ' +
          'Firebase Authentication. Los mensajes que escribió en salas de otras personas se conservan para ' +
          'no romper esas conversaciones. Se puede repetir sin error si algo falló a mitad.',
        tags: ['Usuarios (US-04, US-05)'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Cuenta eliminada',
            content: {
              'application/json': {
                example: { mensaje: 'Tu cuenta fue eliminada.', salasEliminadas: 2 },
              },
            },
          },
          '401': respuesta401,
          '503': {
            description: 'No se pudo eliminar (la cuenta de Authentication no se borra si Firestore falla)',
            content: {
              'application/json': {
                example: { error: 'No se pudo eliminar tu cuenta. Intenta de nuevo.' },
              },
            },
          },
        },
      },
    },
    '/api/salas': {
      post: {
        summary: 'Crea una sala con el usuario del token como anfitrión (US-06)',
        tags: ['Salas (US-06)'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nombre'],
                properties: {
                  nombre: { type: 'string', minLength: 3, maxLength: 50, example: 'Cálculo II — parcial 2' },
                  ambiente: {
                    type: 'string',
                    enum: ['ninguno', 'blue', 'green'],
                    default: 'ninguno',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Sala creada con un ID único',
            content: { 'application/json': { schema: salaSchema } },
          },
          '400': {
            description: 'Datos inválidos: un mensaje por campo',
            content: {
              'application/json': {
                example: {
                  error: 'Revisa los campos marcados.',
                  errores: { nombre: 'El nombre de la sala debe tener entre 3 y 50 caracteres.' },
                },
              },
            },
          },
          '401': respuesta401,
          '404': respuestaPerfilIncompleto,
          '503': respuesta503,
        },
      },
    },
    '/api/salas/mias': {
      get: {
        summary: 'Salas donde el usuario es anfitrión, la más reciente primero (US-06)',
        tags: ['Salas (US-06)'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de salas (vacía si no tiene)',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { salas: { type: 'array', items: salaSchema } } },
              },
            },
          },
          '401': respuesta401,
          '503': respuesta503,
        },
      },
    },
    '/api/salas/{id}': {
      get: {
        summary: 'Datos de una sala por su ID',
        tags: ['Salas (US-06)'],
        security: [{ bearerAuth: [] }],
        parameters: [parametroIdSala],
        responses: {
          '200': { description: 'Sala encontrada', content: { 'application/json': { schema: salaSchema } } },
          '401': respuesta401,
          '404': respuestaSalaNoExiste,
          '503': respuesta503,
        },
      },
      patch: {
        summary: 'Edita nombre o ambiente de la sala (solo el anfitrión)',
        tags: ['Salas (US-06)'],
        security: [{ bearerAuth: [] }],
        parameters: [parametroIdSala],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nombre: { type: 'string', minLength: 3, maxLength: 50 },
                  ambiente: { type: 'string', enum: ['ninguno', 'blue', 'green'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Sala actualizada', content: { 'application/json': { schema: salaSchema } } },
          '400': { description: 'Datos inválidos o sin cambios', content: { 'application/json': { schema: errorSchema } } },
          '401': respuesta401,
          '403': respuestaNoAnfitrion,
          '404': respuestaSalaNoExiste,
          '503': respuesta503,
        },
      },
      delete: {
        summary: 'Elimina la sala y sus mensajes (solo el anfitrión)',
        tags: ['Salas (US-06)'],
        security: [{ bearerAuth: [] }],
        parameters: [parametroIdSala],
        responses: {
          '200': {
            description: 'Sala eliminada',
            content: { 'application/json': { example: { mensaje: 'La sala fue eliminada.' } } },
          },
          '401': respuesta401,
          '403': respuestaNoAnfitrion,
          '404': respuestaSalaNoExiste,
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
                    example: '🚀',
                    description: 'Opcional. Uno de los avatares del selector (🚀, 🎧, ⚡, 🦉) o un enlace https. Si viene de Google y no se envía, se usa la foto de Google.',
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
