import { Module } from '@nestjs/common';
import { UrlHealthModule } from '../url-health/url-health.module';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';

@Module({
  imports: [UrlHealthModule],
  controllers: [ProgramsController],
  providers: [ProgramsService],
})
export class ProgramsModule {}
