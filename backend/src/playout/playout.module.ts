import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { RegionsModule } from '../regions/regions.module';
import { UrlHealthModule } from '../url-health/url-health.module';
import { PlayoutController } from './playout.controller';
import { PlayoutService } from './playout.service';

@Module({
  imports: [ChannelsModule, RegionsModule, UrlHealthModule],
  controllers: [PlayoutController],
  providers: [PlayoutService],
})
export class PlayoutModule {}
