import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { appConfig, AppConfig } from '../config/app.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [appConfig.KEY],
      useFactory: (cfg: AppConfig) => ({
        secret: cfg.auth.jwtAccessSecret,
        signOptions: { issuer: 'kids-tv', audience: 'kids-tv-admin' },
        verifyOptions: { issuer: 'kids-tv', audience: 'kids-tv-admin', algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
