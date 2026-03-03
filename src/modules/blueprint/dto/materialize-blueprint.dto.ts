import { IsBoolean, IsOptional } from 'class-validator';

export class MaterializeBlueprintDto {
  @IsBoolean()
  @IsOptional()
  autoAssign?: boolean;
}
