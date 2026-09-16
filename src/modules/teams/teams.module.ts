import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Team, User } from '../../entities';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';

// AuditLogService is injected without importing AuditLogModule here — that
// module is @Global precisely so the services which read and write the log
// don't each have to import it.
@Module({
  imports: [TypeOrmModule.forFeature([Team, User])],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
