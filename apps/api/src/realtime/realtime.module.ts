import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MatchmakingModule, AuthModule],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class RealtimeModule {}
