import { Module } from '@nestjs/common';
import { UrlHealthService } from './url-health.service';
import { UrlPolicyService } from './url-policy.service';

@Module({
  providers: [UrlHealthService, UrlPolicyService],
  exports: [UrlHealthService, UrlPolicyService],
})
export class UrlHealthModule {}
