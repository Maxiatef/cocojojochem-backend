import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// No auth, no rate-limit override (uses the global default) — hosting
// platforms/uptime monitors hit this on a fixed interval and need a plain
// 200/503, not a login flow. Checks the DB with a trivial query so "the
// process is up" and "the app can actually serve requests" aren't conflated
// — a backend that's running but can't reach Postgres should read as down.
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (err) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
        error: err instanceof Error ? err.message : 'unknown error',
      });
    }

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
