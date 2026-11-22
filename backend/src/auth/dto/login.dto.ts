import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

export class RefreshDto {
  /** Cookie ishlatilmaydigan mijozlar uchun (aks holda httpOnly cookie'dan olinadi) */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}
