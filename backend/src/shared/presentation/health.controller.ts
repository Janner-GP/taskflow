import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Liveness probe. Deliberadamente no toca la base de datos: responde a "¿el
 * proceso está vivo y sirviendo?", que es lo que necesita el healthcheck del
 * contenedor. La disponibilidad de Postgres la vigila su propio healthcheck.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        uptime: { type: 'number', example: 12.34 },
        timestamp: { type: 'string', example: '2026-07-30T10:00:00.000Z' },
      },
    },
  })
  check(): { status: 'ok'; uptime: number; timestamp: string } {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
