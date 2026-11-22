import { Module } from '@nestjs/common';
import { ChannelsAdminController, ChannelsPublicController } from './channels.controller';
import { ChannelsService } from './channels.service';

@Module({
  controllers: [ChannelsPublicController, ChannelsAdminController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
