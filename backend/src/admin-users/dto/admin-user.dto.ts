import { PartialType } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;

export class CreateAdminUserDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(200)
  email: string;

  /** Kamida 10 belgi, katta-kichik harf va raqam */
  @IsString()
  @MaxLength(200)
  @Matches(PASSWORD_RULE, { message: "Parol kamida 10 belgi, katta va kichik harf hamda raqamdan iborat bo'lishi kerak" })
  password: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;
}

export class UpdateAdminUserDto extends PartialType(CreateAdminUserDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
