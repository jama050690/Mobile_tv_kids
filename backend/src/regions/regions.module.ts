import { Module } from '@nestjs/common';
import { RegionsAdminController, RegionsPublicController } from './regions.controller';
import { RegionsService } from './regions.service';

@Module({
  controllers: [RegionsPublicController, RegionsAdminController],
  providers: [RegionsService],
  exports: [RegionsService],
})
export class RegionsModule {}
