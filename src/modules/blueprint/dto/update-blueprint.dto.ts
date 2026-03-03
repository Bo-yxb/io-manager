import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateBlueprintDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsIn(['Draft', 'Review', 'Approved'])
  @IsOptional()
  status?: string;
}
