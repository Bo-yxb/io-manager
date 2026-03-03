import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class UpdateBlueprintNodeDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  taskType?: string;

  @IsString()
  @IsOptional()
  assignee?: string;

  @IsNumber()
  @IsOptional()
  timeoutMin?: number;

  @IsArray()
  @IsOptional()
  dependsOn?: string[];

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}
