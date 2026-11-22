import { AgeGroup } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { TimezoneQueryDto } from '../../regions/dto/region.dto';

export class EpgQueryDto extends TimezoneQueryDto {
  /** Foydalanuvchi timezone'idagi kun (YYYY-MM-DD). Berilmasa bugun */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date YYYY-MM-DD formatida bo'lishi kerak" })
  date?: string;
}

export class GuideQueryDto extends TimezoneQueryDto {
  @IsOptional()
  @IsEnum(AgeGroup)
  ageGroup?: AgeGroup;
}

/** Ilova video ochilmaganini xabar qiladi -> URL qayta tekshiriladi */
export class PlaybackReportDto {
  @IsUUID()
  programId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  errorCode?: string;
}
