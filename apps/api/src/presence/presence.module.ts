import { Module } from '@nestjs/common';
import { PresenceController } from './presence.controller';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  controllers: [PresenceController],
  exports: [],
})
export class PresenceModule {}
