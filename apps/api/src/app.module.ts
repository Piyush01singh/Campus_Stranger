import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validate } from './config/config.validation';
import { HealthModule } from './health/health.module';
import { PersistenceModule } from './persistence/persistence.module';
import { AuthModule } from './auth/auth.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ModerationModule } from './moderation/moderation.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      envFilePath: ['.env.local', '.env', '../../.env', '../../.env.local'],
    }),
    PersistenceModule,
    AuthModule,
    ConversationsModule,
    ModerationModule,
    MatchmakingModule,
    RealtimeModule,
    HealthModule,
  ],
})
export class AppModule {}
